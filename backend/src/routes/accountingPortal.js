import { Router } from 'express';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { authRequired, requireRole } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { applyWithdrawalMarkPaid, applyWithdrawalReview } from '../lib/withdrawalRequestActions.js';

const router = Router();
router.use(authRequired, requireRole('accounting', 'superuser'));

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function monthBounds(date = new Date()) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: dateKey(first), end: dateKey(last), key: monthKey(date), lastDay: last.getDate() };
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function asMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

/** Sklad `work_roles` jadvalida packer — `alias` = `wr` / `wr2` … */
function sqlIsPackerWorkRole(alias) {
  return `(
      lower(trim(ifnull(${alias}.portal_role, ''))) = 'packer'
      OR lower(trim(${alias}.role_name)) = 'packer'
      OR lower(trim(${alias}.role_name)) LIKE '%packer%'
      OR lower(trim(${alias}.role_name)) LIKE '%qadoq%'
    )`;
}

function isPackerWorkRoleRow(wr) {
  if (!wr) return false;
  const pr = String(wr.portal_role ?? '').trim().toLowerCase();
  if (pr === 'packer') return true;
  const n = String(wr.role_name ?? '').trim().toLowerCase();
  return n === 'packer' || n.includes('packer') || n.includes('qadoq');
}

const ACCOUNTING_PORTAL_WORK_KINDS = new Set(['picker', 'courier', 'operator', 'seller']);

/** SQL: `kind` whitelist dan keyin interpolyatsiya — faqat shu to‘plam. */
function sqlMatchWorkRoleKind(alias, kind) {
  const a = String(alias);
  if (kind === 'picker') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) = 'picker'
      OR lower(trim(${a}.role_name)) LIKE '%picker%'
      OR lower(trim(${a}.role_name)) LIKE '%yig%uv%'
    )`;
  }
  if (kind === 'courier') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) IN ('courier', 'kuryer')
      OR lower(trim(${a}.role_name)) LIKE '%courier%'
      OR lower(trim(${a}.role_name)) LIKE '%kuryer%'
    )`;
  }
  if (kind === 'operator') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) = 'operator'
      OR lower(trim(${a}.role_name)) LIKE '%operator%'
      OR lower(trim(${a}.role_name)) LIKE '%operat%'
    )`;
  }
  if (kind === 'seller') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) = 'seller'
      OR lower(trim(${a}.role_name)) LIKE '%seller%'
      OR lower(trim(${a}.role_name)) LIKE '%sotuv%'
    )`;
  }
  return '0 = 1';
}

function rowMatchesPortalWorkKind(workRole, kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (!workRole || !ACCOUNTING_PORTAL_WORK_KINDS.has(k)) return false;
  const pr = String(workRole.portal_role ?? '').trim().toLowerCase();
  const rn = String(workRole.role_name ?? '').trim().toLowerCase();
  if (k === 'picker') {
    return pr === 'picker' || rn.includes('picker') || rn.includes('yig') || rn.includes('yiguv');
  }
  if (k === 'courier') {
    return pr === 'courier' || pr === 'kuryer' || rn.includes('courier') || rn.includes('kuryer');
  }
  if (k === 'operator') {
    return pr === 'operator' || rn.includes('operator') || rn.includes('operat');
  }
  if (k === 'seller') {
    return pr === 'seller' || rn.includes('seller') || rn.includes('sotuv');
  }
  return false;
}

function auditAccountingAction(actorUserId, action, entityType, entityId, details = {}) {
  db.prepare(
    `
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(actorUserId || null, action, entityType, entityId || null, safeJson(details));
}

function slugifyCategory(value, fallback) {
  const raw = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return raw || String(fallback || 'category');
}

function ensureSuperuserEmployees() {
  const superusers = db
    .prepare(
      `
      SELECT id, full_name, phone, created_at
      FROM users
      WHERE (lower(trim(COALESCE(role, ''))) = 'superuser' OR role_id = 1)
        AND lower(trim(COALESCE(status, 'active'))) != 'blocked'
      ORDER BY id ASC
    `,
    )
    .all();

  const insert = db.prepare(
    `
    INSERT OR IGNORE INTO employees (user_id, full_name, phone, status, hired_at)
    VALUES (?, ?, ?, 'active', ?)
  `,
  );
  const update = db.prepare(
    `
    UPDATE employees
    SET full_name = COALESCE(NULLIF(trim(?), ''), full_name),
        phone = COALESCE(NULLIF(trim(?), ''), phone),
        updated_at = datetime('now')
    WHERE user_id = ?
  `,
  );
  for (const user of superusers) {
    insert.run(user.id, user.full_name || `Superuser #${user.id}`, user.phone || '', user.created_at || null);
    update.run(user.full_name || '', user.phone || '', user.id);
  }
}

function upsertPayrollCycle(employeeId, cycleType, periodStart, periodEnd, dueDate, expectedAmount) {
  db.prepare(
    `
    INSERT OR IGNORE INTO payroll_cycles
      (employee_id, cycle_type, period_start, period_end, due_date, expected_amount, paid_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')
  `,
  ).run(employeeId, cycleType, periodStart, periodEnd, dueDate, expectedAmount);

  db.prepare(
    `
    UPDATE payroll_cycles
    SET expected_amount = ?,
        updated_at = datetime('now')
    WHERE employee_id = ?
      AND cycle_type = ?
      AND period_start = ?
      AND period_end = ?
      AND status != 'paid'
  `,
  ).run(expectedAmount, employeeId, cycleType, periodStart, periodEnd);
}

function refreshPayrollCycleStatuses() {
  db.prepare(
    `
    UPDATE payroll_cycles
    SET paid_amount = COALESCE((
      SELECT SUM(amount)
      FROM salary_payments sp
      WHERE sp.payroll_cycle_id = payroll_cycles.id
    ), 0),
    updated_at = datetime('now')
  `,
  ).run();

  db.prepare(
    `
    UPDATE payroll_cycles
    SET status = CASE
      WHEN expected_amount > 0 AND paid_amount >= expected_amount THEN 'paid'
      WHEN date(due_date) < date(?) THEN 'overdue'
      ELSE 'pending'
    END,
    updated_at = datetime('now')
  `,
  ).run(dateKey());
}

function ensurePayrollCycles() {
  ensureSuperuserEmployees();
  const employees = db
    .prepare(`SELECT id, monthly_salary FROM employees WHERE lower(trim(COALESCE(status, 'active'))) = 'active'`)
    .all();
  const months = [-1, 0, 1].map((delta) => monthBounds(addMonths(new Date(), delta)));

  for (const employee of employees) {
    const salary = asMoney(employee.monthly_salary);
    const half = Math.round(salary / 2);
    for (const m of months) {
      upsertPayrollCycle(employee.id, 'advance', `${m.key}-01`, `${m.key}-15`, `${m.key}-15`, half);
      upsertPayrollCycle(employee.id, 'salary', `${m.key}-16`, m.end, m.end, Math.max(0, salary - half));
    }
  }
  refreshPayrollCycleStatuses();
}

function categoryTable(type) {
  return type === 'income' ? 'income_categories' : 'expense_categories';
}

function defaultCategorySlug(type) {
  return type === 'income' ? 'manual_income' : 'other_expenses';
}

function resolveCategory(type, categoryNameOrSlug) {
  const table = categoryTable(type);
  const fallback = defaultCategorySlug(type);
  const value = String(categoryNameOrSlug || '').trim();
  if (value) {
    const existing = db
      .prepare(`SELECT id, name, slug, color FROM ${table} WHERE lower(slug) = lower(?) OR lower(name) = lower(?) LIMIT 1`)
      .get(value, value);
    if (existing) return existing;
    const slug = slugifyCategory(value, fallback);
    db.prepare(`INSERT OR IGNORE INTO ${table} (name, slug) VALUES (?, ?)`).run(value, slug);
    return db.prepare(`SELECT id, name, slug, color FROM ${table} WHERE slug = ? LIMIT 1`).get(slug);
  }
  return db.prepare(`SELECT id, name, slug, color FROM ${table} WHERE slug = ? LIMIT 1`).get(fallback);
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'To‘landi';
  if (s === 'overdue') return 'Kechikkan';
  return 'Kutilmoqda';
}

function cycleTypeLabel(cycleType) {
  return String(cycleType).toLowerCase() === 'advance' ? 'Avans' : 'Oylik ish haqi';
}

function generateReceiptNumber(prefix = 'MSH') {
  const stamp = new Date();
  const datePart = `${stamp.getFullYear()}${pad2(stamp.getMonth() + 1)}${pad2(stamp.getDate())}`;
  const count = db.prepare(`SELECT COUNT(*) AS c FROM receipts WHERE date(created_at) = date('now')`).get()?.c || 0;
  return `${prefix}-${datePart}-${pad2(count + 1)}`;
}

async function notifyTelegram(chatId, text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const target = String(chatId || process.env.ACCOUNTING_TELEGRAM_CHAT_ID || '').trim();
  if (!token || !target) return { skipped: true };
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: target,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return { ok: true };
  } catch (e) {
    console.warn('accounting telegram notification failed', e?.message || e);
    return { ok: false };
  }
}

function getOrderRevenueBetween(start, end) {
  return (
    Number(
      db
        .prepare(
          `
          SELECT COALESCE(SUM(total_amount), 0) AS s
          FROM orders
          WHERE date(created_at) BETWEEN date(?) AND date(?)
            AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'canceled', 'bekor', 'bekor_qilindi')
            AND COALESCE(is_test, 0) = 0
        `,
        )
        .get(start, end)?.s,
    ) || 0
  );
}

function getTransactionSum(type, start, end) {
  return (
    Number(
      db
        .prepare(
          `
          SELECT COALESCE(SUM(amount), 0) AS s
          FROM financial_transactions
          WHERE type = ?
            AND date(transaction_date) BETWEEN date(?) AND date(?)
        `,
        )
        .get(type, start, end)?.s,
    ) || 0
  );
}

function payrollPaidBetween(start, end) {
  return (
    Number(
      db
        .prepare(
          `
          SELECT COALESCE(SUM(amount), 0) AS s
          FROM salary_payments
          WHERE date(paid_at) BETWEEN date(?) AND date(?)
        `,
        )
        .get(start, end)?.s,
    ) || 0
  );
}

function buildAccountingOverview() {
  ensurePayrollCycles();
  const current = monthBounds();
  const prev = monthBounds(addMonths(new Date(), -1));
  const manualIncome = getTransactionSum('income', current.start, current.end);
  const orderRevenue = getOrderRevenueBetween(current.start, current.end);
  const totalIncome = orderRevenue + manualIncome;
  const totalExpenses = getTransactionSum('expense', current.start, current.end);
  const payrollCost = payrollPaidBetween(current.start, current.end);
  const previousIncome = getOrderRevenueBetween(prev.start, prev.end) + getTransactionSum('income', prev.start, prev.end);
  const previousExpenses = getTransactionSum('expense', prev.start, prev.end);
  const previousProfit = previousIncome - previousExpenses;
  const netProfit = totalIncome - totalExpenses;

  const trends = [];
  for (let i = 5; i >= 0; i -= 1) {
    const m = monthBounds(addMonths(new Date(), -i));
    const income = getOrderRevenueBetween(m.start, m.end) + getTransactionSum('income', m.start, m.end);
    const expense = getTransactionSum('expense', m.start, m.end);
    const payroll = payrollPaidBetween(m.start, m.end);
    trends.push({
      month: m.key,
      label: new Date(`${m.start}T00:00:00`).toLocaleDateString('uz-UZ', { month: 'short' }),
      tushum: income,
      xarajat: expense,
      oylik: payroll,
      foyda: income - expense,
    });
  }

  const expenseBreakdown = db
    .prepare(
      `
      SELECT COALESCE(ec.name, 'Boshqa xarajatlar') AS name,
             COALESCE(ec.color, '#64748b') AS color,
             COALESCE(SUM(ft.amount), 0) AS value
      FROM financial_transactions ft
      LEFT JOIN expense_categories ec ON ec.id = ft.category_id AND ft.category_type = 'expense'
      WHERE ft.type = 'expense'
        AND date(ft.transaction_date) BETWEEN date(?) AND date(?)
      GROUP BY COALESCE(ec.name, 'Boshqa xarajatlar'), COALESCE(ec.color, '#64748b')
      ORDER BY value DESC
      LIMIT 8
    `,
    )
    .all(current.start, current.end);

  const payrollSummary = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_cycles,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_cycles,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_cycles,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_cycles,
        COALESCE(SUM(expected_amount - paid_amount), 0) AS remaining_total
      FROM payroll_cycles
      WHERE date(period_start) BETWEEN date(?) AND date(?)
    `,
    )
    .get(current.start, current.end);

  const upcomingPayroll = db
    .prepare(
      `
      SELECT pc.id, pc.cycle_type, pc.due_date, pc.expected_amount, pc.paid_amount, pc.status,
             e.full_name, e.monthly_salary
      FROM payroll_cycles pc
      JOIN employees e ON e.id = pc.employee_id
      WHERE pc.status IN ('pending', 'overdue')
      ORDER BY date(pc.due_date) ASC, pc.id ASC
      LIMIT 8
    `,
    )
    .all()
    .map((row) => ({
      ...row,
      cycle_label: cycleTypeLabel(row.cycle_type),
      status_label: statusLabel(row.status),
      remaining_amount: Math.max(0, asMoney(row.expected_amount) - asMoney(row.paid_amount)),
    }));

  const recentFinancial = db
    .prepare(
      `
      SELECT ft.id, ft.type, ft.title, ft.amount, ft.transaction_date AS occurred_at,
             COALESCE(ec.name, ic.name, '') AS category_name
      FROM financial_transactions ft
      LEFT JOIN expense_categories ec ON ec.id = ft.category_id AND ft.category_type = 'expense'
      LEFT JOIN income_categories ic ON ic.id = ft.category_id AND ft.category_type = 'income'
      ORDER BY datetime(ft.created_at) DESC, ft.id DESC
      LIMIT 10
    `,
    )
    .all()
    .map((x) => ({
      id: `transaction-${x.id}`,
      kind: x.type,
      title: x.title,
      subtitle: x.category_name || (x.type === 'income' ? 'Daromad' : 'Xarajat'),
      amount: x.amount,
      occurred_at: x.occurred_at,
    }));

  const recentPayroll = db
    .prepare(
      `
      SELECT sp.id, sp.amount, sp.payment_type, sp.paid_at, e.full_name
      FROM salary_payments sp
      JOIN employees e ON e.id = sp.employee_id
      ORDER BY datetime(sp.paid_at) DESC, sp.id DESC
      LIMIT 10
    `,
    )
    .all()
    .map((x) => ({
      id: `salary-${x.id}`,
      kind: 'payroll',
      title: `${x.full_name} — ${cycleTypeLabel(x.payment_type)}`,
      subtitle: 'Ish haqi to‘lovi',
      amount: x.amount,
      occurred_at: x.paid_at,
    }));

  const activity = [...recentFinancial, ...recentPayroll]
    .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
    .slice(0, 12);

  return {
    period: current,
    kpis: {
      total_revenue: totalIncome,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      payroll_cost: payrollCost,
      revenue_delta: previousIncome ? ((totalIncome - previousIncome) / previousIncome) * 100 : 0,
      expense_delta: previousExpenses ? ((totalExpenses - previousExpenses) / previousExpenses) * 100 : 0,
      profit_delta: previousProfit ? ((netProfit - previousProfit) / Math.abs(previousProfit)) * 100 : 0,
    },
    trends,
    expense_breakdown: expenseBreakdown,
    payroll_summary: {
      total_cycles: Number(payrollSummary?.total_cycles) || 0,
      paid_cycles: Number(payrollSummary?.paid_cycles) || 0,
      pending_cycles: Number(payrollSummary?.pending_cycles) || 0,
      overdue_cycles: Number(payrollSummary?.overdue_cycles) || 0,
      remaining_total: Math.max(0, Number(payrollSummary?.remaining_total) || 0),
    },
    upcoming_payroll: upcomingPayroll,
    activity,
  };
}

/**
 * Buxgalteriya packer ro‘yxati:
 * 1) Faol staff packer + user + mos `work_roles` (ledger bilan bir xil bog‘lanish)
 * 2) Qo‘shimcha: sklad `work_roles` packer qatorlari + `users` (login/email), hatto `staff_members` yo‘q bo‘lsa ham
 *    (superuser bazasida faqat ish rollari ko‘rinishi mumkin).
 * Har bir qator: `list_key` = `wr-<work_role_id>` (noyob), `work_role_id` majburiy.
 */

router.get('/modern/categories', (_req, res) => {
  const expense = db.prepare('SELECT id, name, slug, color FROM expense_categories ORDER BY id ASC').all();
  const income = db.prepare('SELECT id, name, slug, color FROM income_categories ORDER BY id ASC').all();
  res.json({ expense, income });
});

router.get('/modern/overview', (_req, res) => {
  try {
    res.json(buildAccountingOverview());
  } catch (e) {
    console.error('accounting modern overview', e);
    res.status(500).json({ error: 'Moliyaviy boshqaruv paneli yuklanmadi.' });
  }
});

router.get('/modern/payroll', (_req, res) => {
  try {
    ensurePayrollCycles();
    const employees = db
      .prepare(
        `
        SELECT e.id, e.user_id, e.full_name, e.phone, e.telegram_chat_id, e.monthly_salary, e.status,
               COALESCE((
                 SELECT sp.paid_at FROM salary_payments sp
                 WHERE sp.employee_id = e.id
                 ORDER BY datetime(sp.paid_at) DESC, sp.id DESC
                 LIMIT 1
               ), '') AS last_payment_at,
               COALESCE((
                 SELECT sp.amount FROM salary_payments sp
                 WHERE sp.employee_id = e.id
                 ORDER BY datetime(sp.paid_at) DESC, sp.id DESC
                 LIMIT 1
               ), 0) AS last_payment_amount
        FROM employees e
        WHERE lower(trim(COALESCE(e.status, 'active'))) = 'active'
        ORDER BY e.full_name ASC
      `,
      )
      .all();

    const cyclesByEmployee = new Map();
    const cycles = db
      .prepare(
        `
        SELECT pc.*, e.full_name
        FROM payroll_cycles pc
        JOIN employees e ON e.id = pc.employee_id
        WHERE date(pc.period_start) >= date('now', 'start of month', '-1 month')
          AND date(pc.period_start) <= date('now', 'start of month', '+1 month')
        ORDER BY date(pc.due_date) ASC, pc.id ASC
      `,
      )
      .all()
      .map((cycle) => ({
        ...cycle,
        cycle_label: cycleTypeLabel(cycle.cycle_type),
        status_label: statusLabel(cycle.status),
        remaining_amount: Math.max(0, asMoney(cycle.expected_amount) - asMoney(cycle.paid_amount)),
      }));
    for (const cycle of cycles) {
      const list = cyclesByEmployee.get(cycle.employee_id) || [];
      list.push(cycle);
      cyclesByEmployee.set(cycle.employee_id, list);
    }

    const cards = employees.map((employee) => {
      const employeeCycles = cyclesByEmployee.get(employee.id) || [];
      const openCycles = employeeCycles.filter((c) => c.status !== 'paid');
      const next = openCycles[0] || employeeCycles[0] || null;
      const remaining = employeeCycles.reduce((sum, c) => sum + Math.max(0, asMoney(c.expected_amount) - asMoney(c.paid_amount)), 0);
      const status = openCycles.some((c) => c.status === 'overdue') ? 'overdue' : openCycles.length ? 'pending' : 'paid';
      return {
        ...employee,
        monthly_salary: asMoney(employee.monthly_salary),
        last_payment_amount: asMoney(employee.last_payment_amount),
        next_payment_date: next?.due_date || null,
        next_cycle_id: next?.id || null,
        next_cycle_type: next?.cycle_type || null,
        next_cycle_label: next ? cycleTypeLabel(next.cycle_type) : '',
        remaining_balance: remaining,
        status,
        status_label: statusLabel(status),
        cycles: employeeCycles,
      };
    });

    const payments = db
      .prepare(
        `
        SELECT sp.id, sp.amount, sp.payment_type, sp.payment_method, sp.note, sp.paid_at, sp.receipt_id,
               e.full_name,
               r.receipt_number
        FROM salary_payments sp
        JOIN employees e ON e.id = sp.employee_id
        LEFT JOIN receipts r ON r.id = sp.receipt_id
        ORDER BY datetime(sp.paid_at) DESC, sp.id DESC
        LIMIT 80
      `,
      )
      .all()
      .map((payment) => ({ ...payment, payment_label: cycleTypeLabel(payment.payment_type) }));

    res.json({ employees: cards, cycles, payments });
  } catch (e) {
    console.error('accounting modern payroll', e);
    res.status(500).json({ error: 'Ish haqi ma’lumotlari yuklanmadi.' });
  }
});

router.patch('/modern/employees/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Xodim ID noto‘g‘ri.' });
  const monthlySalary = asMoney(req.body?.monthly_salary);
  const telegramChatId = String(req.body?.telegram_chat_id || '').trim();
  try {
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
    if (!employee) return res.status(404).json({ error: 'Xodim topilmadi.' });
    db.prepare(
      `
      UPDATE employees
      SET monthly_salary = ?,
          telegram_chat_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    ).run(monthlySalary, telegramChatId, id);
    ensurePayrollCycles();
    auditAccountingAction(req.user.id, 'employee_salary_updated', 'employee', id, { monthly_salary: monthlySalary });
    res.json({ ok: true });
  } catch (e) {
    console.error('accounting modern employee patch', e);
    res.status(500).json({ error: 'Xodim ma’lumotlari saqlanmadi.' });
  }
});

router.get('/modern/transactions', (req, res) => {
  const type = String(req.query.type || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();
  const start = String(req.query.start || monthBounds().start).slice(0, 10);
  const end = String(req.query.end || monthBounds().end).slice(0, 10);
  const params = [start, end];
  const clauses = ['date(ft.transaction_date) BETWEEN date(?) AND date(?)'];
  if (type === 'income' || type === 'expense') {
    clauses.push('ft.type = ?');
    params.push(type);
  }
  if (search) {
    clauses.push('(lower(ft.title) LIKE lower(?) OR lower(COALESCE(ft.note, "")) LIKE lower(?))');
    params.push(`%${search}%`, `%${search}%`);
  }
  try {
    const rows = db
      .prepare(
        `
        SELECT ft.*, COALESCE(ec.name, ic.name, '') AS category_name,
               COALESCE(ec.color, ic.color, '#64748b') AS category_color,
               r.receipt_number
        FROM financial_transactions ft
        LEFT JOIN expense_categories ec ON ec.id = ft.category_id AND ft.category_type = 'expense'
        LEFT JOIN income_categories ic ON ic.id = ft.category_id AND ft.category_type = 'income'
        LEFT JOIN receipts r ON r.id = ft.receipt_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY date(ft.transaction_date) DESC, ft.id DESC
        LIMIT 300
      `,
      )
      .all(...params);
    res.json({ transactions: rows });
  } catch (e) {
    console.error('accounting modern transactions', e);
    res.status(500).json({ error: 'Tranzaksiyalar yuklanmadi.' });
  }
});

router.post('/modern/transactions', (req, res) => {
  const type = String(req.body?.type || '').trim().toLowerCase();
  if (type !== 'income' && type !== 'expense') return res.status(400).json({ error: 'Turi noto‘g‘ri.' });
  const amount = asMoney(req.body?.amount);
  if (amount <= 0) return res.status(400).json({ error: 'Summa 0 dan katta bo‘lishi kerak.' });
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Nomi majburiy.' });
  const note = String(req.body?.note || '').trim();
  const transactionDate = String(req.body?.transaction_date || dateKey()).slice(0, 10);
  try {
    const category = resolveCategory(type, req.body?.category_slug || req.body?.category_name);
    const receiptNumber = generateReceiptNumber(type === 'income' ? 'MSH-IN' : 'MSH-EX');
    const receiptResult = db
      .prepare(
        `
        INSERT INTO receipts (receipt_number, entity_type, recipient_name, amount, payload_json, created_by)
        VALUES (?, 'financial_transaction', ?, ?, ?, ?)
      `,
      )
      .run(receiptNumber, title, amount, safeJson({ type, title, note, transaction_date: transactionDate }), req.user.id);

    const result = db
      .prepare(
        `
        INSERT INTO financial_transactions
          (type, category_id, category_type, source, title, amount, note, transaction_date, created_by, receipt_id)
        VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(type, category?.id || null, type, title, amount, note, transactionDate, req.user.id, receiptResult.lastInsertRowid);

    db.prepare('UPDATE receipts SET entity_id = ? WHERE id = ?').run(result.lastInsertRowid, receiptResult.lastInsertRowid);
    auditAccountingAction(req.user.id, 'financial_transaction_created', 'financial_transaction', result.lastInsertRowid, {
      type,
      amount,
      title,
    });
    res.status(201).json({ ok: true, id: result.lastInsertRowid, receipt_id: receiptResult.lastInsertRowid });
  } catch (e) {
    console.error('accounting modern transaction create', e);
    res.status(500).json({ error: 'Tranzaksiya saqlanmadi.' });
  }
});

router.post('/modern/payroll/payments', async (req, res) => {
  const employeeId = Number.parseInt(String(req.body?.employee_id || ''), 10);
  const cycleId = Number.parseInt(String(req.body?.payroll_cycle_id || ''), 10);
  const amount = asMoney(req.body?.amount);
  const method = String(req.body?.payment_method || 'cash').trim() || 'cash';
  const note = String(req.body?.note || '').trim();
  if (!Number.isFinite(employeeId) || employeeId < 1) return res.status(400).json({ error: 'Xodim tanlanmagan.' });
  if (!Number.isFinite(cycleId) || cycleId < 1) return res.status(400).json({ error: 'Payroll sikli tanlanmagan.' });
  if (amount <= 0) return res.status(400).json({ error: 'To‘lov summasi 0 dan katta bo‘lishi kerak.' });

  try {
    ensurePayrollCycles();
    const cycle = db
      .prepare(
        `
        SELECT pc.*, e.full_name, e.telegram_chat_id
        FROM payroll_cycles pc
        JOIN employees e ON e.id = pc.employee_id
        WHERE pc.id = ? AND pc.employee_id = ?
      `,
      )
      .get(cycleId, employeeId);
    if (!cycle) return res.status(404).json({ error: 'Payroll sikli topilmadi.' });

    const receiptNumber = generateReceiptNumber('MSH-PAY');
    const receiptResult = db
      .prepare(
        `
        INSERT INTO receipts (receipt_number, entity_type, entity_id, recipient_name, amount, payload_json, created_by)
        VALUES (?, 'salary_payment', NULL, ?, ?, ?, ?)
      `,
      )
      .run(
        receiptNumber,
        cycle.full_name,
        amount,
        safeJson({ employee_id: employeeId, payroll_cycle_id: cycleId, cycle_type: cycle.cycle_type, payment_method: method, note }),
        req.user.id,
      );

    const paymentResult = db
      .prepare(
        `
        INSERT INTO salary_payments
          (employee_id, payroll_cycle_id, amount, payment_type, payment_method, note, created_by, receipt_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(employeeId, cycleId, amount, cycle.cycle_type, method, note, req.user.id, receiptResult.lastInsertRowid);
    db.prepare('UPDATE receipts SET entity_id = ? WHERE id = ?').run(paymentResult.lastInsertRowid, receiptResult.lastInsertRowid);

    const payrollCategory = resolveCategory('expense', 'employee_payroll');
    db.prepare(
      `
      INSERT INTO financial_transactions
        (type, category_id, category_type, source, title, amount, note, transaction_date, created_by, receipt_id)
      VALUES ('expense', ?, 'expense', 'payroll', ?, ?, ?, date('now'), ?, ?)
    `,
    ).run(payrollCategory?.id || null, `${cycle.full_name} — ${cycleTypeLabel(cycle.cycle_type)}`, amount, note, req.user.id, receiptResult.lastInsertRowid);

    refreshPayrollCycleStatuses();
    auditAccountingAction(req.user.id, 'salary_payment_created', 'salary_payment', paymentResult.lastInsertRowid, {
      employee_id: employeeId,
      payroll_cycle_id: cycleId,
      amount,
    });

    db.prepare(
      `
      INSERT INTO user_notifications (user_id, title, body, link_type, link_id)
      SELECT user_id, ?, ?, 'salary_payment', ?
      FROM employees
      WHERE id = ? AND user_id IS NOT NULL
    `,
    ).run('Ish haqi to‘lovi', `${cycleTypeLabel(cycle.cycle_type)} uchun ${amount} UZS to‘landi.`, paymentResult.lastInsertRowid, employeeId);

    void notifyTelegram(
      cycle.telegram_chat_id,
      `MyShop buxgalteriya\n${cycle.full_name}\n${cycleTypeLabel(cycle.cycle_type)}: ${amount} UZS\nHolat: to'landi`,
    );

    res.status(201).json({ ok: true, id: paymentResult.lastInsertRowid, receipt_id: receiptResult.lastInsertRowid });
  } catch (e) {
    console.error('accounting modern salary payment', e);
    res.status(500).json({ error: 'Ish haqi to‘lovi saqlanmadi.' });
  }
});

router.post('/modern/payroll/reminders', async (req, res) => {
  try {
    ensurePayrollCycles();
    const cycles = db
      .prepare(
        `
        SELECT pc.id, pc.cycle_type, pc.due_date, pc.expected_amount, pc.paid_amount, pc.status,
               e.full_name, e.telegram_chat_id
        FROM payroll_cycles pc
        JOIN employees e ON e.id = pc.employee_id
        WHERE pc.status IN ('pending', 'overdue')
        ORDER BY date(pc.due_date) ASC
        LIMIT 25
      `,
      )
      .all();
    for (const c of cycles) {
      const remaining = Math.max(0, asMoney(c.expected_amount) - asMoney(c.paid_amount));
      await notifyTelegram(
        c.telegram_chat_id,
        `MyShop eslatma\n${c.full_name}\n${cycleTypeLabel(c.cycle_type)}: ${remaining} UZS\nMuddat: ${c.due_date}\nHolat: ${statusLabel(c.status)}`,
      );
    }
    auditAccountingAction(req.user.id, 'payroll_reminders_sent', 'payroll_cycle', null, { count: cycles.length });
    res.json({ ok: true, sent: cycles.length });
  } catch (e) {
    console.error('accounting payroll reminders', e);
    res.status(500).json({ error: 'Eslatmalar yuborilmadi.' });
  }
});

router.get('/modern/receipts/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Receipt ID noto‘g‘ri.' });
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!receipt) return res.status(404).json({ error: 'Receipt topilmadi.' });
  res.json({ receipt });
});

router.get('/modern/receipts/:id/pdf', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Receipt ID noto‘g‘ri.' });
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!receipt) return res.status(404).json({ error: 'Receipt topilmadi.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${receipt.receipt_number}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  doc.pipe(res);
  doc.fontSize(22).text('MyShop', { continued: true }).fontSize(12).text('  Buxgalteriya kvitansiyasi');
  doc.moveDown();
  doc.fontSize(16).text(`Kvitansiya: ${receipt.receipt_number}`);
  doc.moveDown();
  doc.fontSize(11).text(`Qabul qiluvchi: ${receipt.recipient_name || '-'}`);
  doc.text(`Summa: ${new Intl.NumberFormat('uz-UZ').format(asMoney(receipt.amount))} ${receipt.currency || 'UZS'}`);
  doc.text(`Sana: ${receipt.created_at}`);
  doc.text(`Turi: ${receipt.entity_type}`);
  doc.moveDown();
  doc.text('Ushbu hujjat MyShop buxgalteriya tizimi orqali avtomatik yaratildi.');
  doc.end();
});

router.get('/packers', (req, res) => {
  try {
    const staffLinked = db
      .prepare(
        `
      SELECT sm.id AS staff_member_id,
             sm.full_name,
             sm.phone,
             sm.status,
             sm.orders_handled,
             sm.user_id,
             sm.balance,
             sm.created_at,
             u.login AS user_login,
             wr.id AS work_role_id,
             wr.login AS work_role_login,
             wr.role_name AS work_role_name
      FROM staff_members sm
      INNER JOIN users u ON u.id = (
        CASE
          WHEN sm.user_id IS NOT NULL AND sm.user_id > 0 THEN sm.user_id
          ELSE (SELECT u2.id FROM users u2 WHERE u2.staff_member_id = sm.id ORDER BY u2.id DESC LIMIT 1)
        END
      )
      INNER JOIN work_roles wr ON wr.id = (
        SELECT wr2.id
        FROM work_roles wr2
        WHERE wr2.deleted_at IS NULL
          AND (
            (length(trim(ifnull(u.login, ''))) > 0 AND lower(trim(wr2.login)) = lower(trim(u.login)))
            OR (length(trim(ifnull(u.email, ''))) > 0
                AND lower(trim(ifnull(wr2.email, ''))) = lower(trim(ifnull(u.email, ''))))
          )
          AND ${sqlIsPackerWorkRole('wr2')}
      )
      WHERE lower(trim(sm.staff_type)) = 'packer'
        AND lower(trim(COALESCE(sm.status, ''))) = 'active'
    `,
      )
      .all();

    const fromWorkRoles = db
      .prepare(
        `
      SELECT wr.id AS work_role_id,
             wr.login AS work_role_login,
             wr.role_name AS work_role_name,
             u.id AS user_id,
             u.login AS user_login,
             u.full_name AS user_full_name,
             sm.id AS staff_member_id,
             sm.full_name AS staff_full_name,
             sm.phone AS staff_phone,
             sm.status AS staff_status,
             sm.orders_handled AS staff_orders_handled,
             sm.balance AS staff_balance,
             sm.created_at AS staff_created_at
      FROM work_roles wr
      INNER JOIN users u ON (
        (length(trim(ifnull(wr.login, ''))) > 0 AND lower(trim(u.login)) = lower(trim(wr.login)))
        OR (length(trim(ifnull(wr.email, ''))) > 0
            AND lower(trim(ifnull(u.email, ''))) = lower(trim(ifnull(wr.email, ''))))
      )
      LEFT JOIN staff_members sm ON lower(trim(sm.staff_type)) = 'packer'
        AND (sm.user_id = u.id OR u.staff_member_id = sm.id)
      WHERE wr.deleted_at IS NULL
        AND ${sqlIsPackerWorkRole('wr')}
    `,
      )
      .all();

    const seenWr = new Set(staffLinked.map((r) => r.work_role_id));
    const packers = staffLinked.map((r) => ({
      list_key: `wr-${r.work_role_id}`,
      staff_member_id: r.staff_member_id,
      work_role_id: r.work_role_id,
      full_name: r.full_name,
      phone: r.phone,
      status: r.status,
      orders_handled: r.orders_handled,
      balance: r.balance,
      created_at: r.created_at,
      user_id: r.user_id,
      user_login: r.user_login,
      work_role_login: r.work_role_login,
      work_role_name: r.work_role_name,
    }));

    for (const x of fromWorkRoles) {
      if (seenWr.has(x.work_role_id)) continue;
      seenWr.add(x.work_role_id);
      packers.push({
        list_key: `wr-${x.work_role_id}`,
        staff_member_id: x.staff_member_id ?? null,
        work_role_id: x.work_role_id,
        full_name: x.staff_full_name || x.user_full_name || x.work_role_login,
        phone: x.staff_phone || '',
        status: x.staff_status || '—',
        orders_handled: x.staff_orders_handled ?? 0,
        balance: x.staff_balance ?? 0,
        created_at: x.staff_created_at ?? null,
        user_id: x.user_id,
        user_login: x.user_login,
        work_role_login: x.work_role_login,
        work_role_name: x.work_role_name,
      });
    }

    packers.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'uz', { sensitivity: 'base' }));
    res.json({ packers });
  } catch (e) {
    console.error('accounting portal packers', e);
    res.status(500).json({ error: 'Packerlar ro‘yxati yuklanmadi.' });
  }
});

/** Picker / kuryer / operator / seller — sklad `work_roles` + `users` (packerga o‘xshash ro‘yxat). */
router.get('/work-roles/list', (req, res) => {
  const kind = String(req.query.kind || '').trim().toLowerCase();
  if (!ACCOUNTING_PORTAL_WORK_KINDS.has(kind)) {
    return res.status(400).json({ error: 'Noto‘g‘ri kind: picker, courier, operator, seller.' });
  }
  const staffTypeParam = kind === 'courier' ? 'courier' : kind;
  const cond = sqlMatchWorkRoleKind('wr', kind);
  try {
    const rows = db
      .prepare(
        `
      SELECT wr.id AS work_role_id,
             wr.login AS work_role_login,
             wr.role_name AS work_role_name,
             u.id AS user_id,
             u.login AS user_login,
             u.full_name AS user_full_name,
             sm.id AS staff_member_id,
             sm.full_name AS staff_full_name,
             sm.phone AS staff_phone,
             sm.status AS staff_status,
             sm.orders_handled AS staff_orders_handled,
             sm.balance AS staff_balance,
             sm.created_at AS staff_created_at
      FROM work_roles wr
      INNER JOIN users u ON (
        (length(trim(ifnull(wr.login, ''))) > 0 AND lower(trim(u.login)) = lower(trim(wr.login)))
        OR (length(trim(ifnull(wr.email, ''))) > 0
            AND lower(trim(ifnull(u.email, ''))) = lower(trim(ifnull(wr.email, ''))))
      )
      LEFT JOIN staff_members sm ON (
        (sm.user_id = u.id OR u.staff_member_id = sm.id)
        AND lower(trim(sm.staff_type)) = lower(?)
      )
      WHERE wr.deleted_at IS NULL
        AND (${cond})
    `,
      )
      .all(staffTypeParam);

    const workers = rows.map((x) => ({
      list_key: `wr-${x.work_role_id}`,
      staff_member_id: x.staff_member_id ?? null,
      work_role_id: x.work_role_id,
      full_name: x.staff_full_name || x.user_full_name || x.work_role_login,
      phone: x.staff_phone || '',
      status: x.staff_status || '—',
      orders_handled: x.staff_orders_handled ?? 0,
      balance: x.staff_balance ?? 0,
      created_at: x.staff_created_at ?? null,
      user_id: x.user_id,
      user_login: x.user_login,
      work_role_login: x.work_role_login,
      work_role_name: x.work_role_name,
    }));
    workers.sort((a, b) =>
      String(a.full_name || '').localeCompare(String(b.full_name || ''), 'uz', { sensitivity: 'base' }),
    );
    res.json({ workers });
  } catch (e) {
    console.error('accounting portal work-roles list', e);
    res.status(500).json({ error: 'Ro‘yxat yuklanmadi.' });
  }
});

/** Hisobot: `work_role_id` + bo‘lim `kind` (ledger / yechishlar packer bilan bir xil mexanizm). */
router.get('/work-roles/report', (req, res) => {
  const kind = String(req.query.kind || '').trim().toLowerCase();
  if (!ACCOUNTING_PORTAL_WORK_KINDS.has(kind)) {
    return res.status(400).json({ error: 'Noto‘g‘ri kind.' });
  }
  const workRoleId = Number.parseInt(String(req.query.work_role_id ?? ''), 10);
  if (!Number.isFinite(workRoleId) || workRoleId < 1) {
    return res.status(400).json({ error: '`work_role_id` kerak (musbat butun son).' });
  }
  const { days, daysStr } = parseReportDays(req);
  try {
    const workRole = db.prepare(`SELECT * FROM work_roles WHERE id = ? AND deleted_at IS NULL`).get(workRoleId);
    if (!workRole) {
      return res.status(404).json({ error: 'Ish roli topilmadi yoki o‘chirilgan.' });
    }
    if (!rowMatchesPortalWorkKind(workRole, kind)) {
      return res.status(400).json({ error: 'Bu ish roli tanlangan bo‘limga tegishli emas.' });
    }
    res.json(buildPackerFinancialPayload(workRole, null, days, daysStr));
  } catch (e) {
    console.error('accounting portal work-roles report', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

/** Packer `staff_members` → `users` (`user_id` yoki `staff_member_id`) → `work_roles`. */
function resolvePackerWorkRoleForStaffMemberId(staffMemberId) {
  const sm = db
    .prepare(`SELECT * FROM staff_members WHERE id = ? AND lower(trim(staff_type)) = 'packer'`)
    .get(staffMemberId);
  if (!sm) return { error: 'Packer topilmadi.', status: 404 };

  let user = null;
  if (sm.user_id != null && Number(sm.user_id) > 0) {
    user = db.prepare(`SELECT id, login, email FROM users WHERE id = ?`).get(sm.user_id);
  }
  if (!user) {
    user = db.prepare(`SELECT id, login, email FROM users WHERE staff_member_id = ? ORDER BY id DESC LIMIT 1`).get(
      staffMemberId,
    );
  }
  if (!user) return { staff: sm, workRole: null, linkedUser: null };

  const login = String(user.login || '').trim();
  const email = String(user.email || '').trim();
  if (!login && !email) return { staff: sm, workRole: null, linkedUser: user };
  const wr = db
    .prepare(
      `
    SELECT * FROM work_roles
    WHERE deleted_at IS NULL
      AND (lower(trim(login)) = lower(trim(?)) OR lower(trim(ifnull(email, ''))) = lower(trim(?)))
      AND (
        lower(trim(ifnull(portal_role, ''))) = 'packer'
        OR lower(trim(role_name)) = 'packer'
        OR lower(trim(role_name)) LIKE '%packer%'
        OR lower(trim(role_name)) LIKE '%qadoq%'
      )
    ORDER BY id DESC
    LIMIT 1
  `,
    )
    .get(login, email || '');
  return { staff: sm, workRole: wr || null, linkedUser: user };
}

function ledgerKindLabelUz(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'fine') return 'Jarima';
  if (k === 'reward') return 'Mukofot';
  if (k === 'balance_set') return 'Balans belgilash';
  return kind || 'Operatsiya';
}

function buildPackerFinancialPayload(workRole, staff, days, daysStr) {
  const ledger = db
    .prepare(
      `
      SELECT id, kind, amount, title, note, ref_kind, ref_id, created_at
      FROM work_role_ledger_entries
      WHERE work_role_id = ?
        AND datetime(replace(trim(created_at), 'T', ' ')) >= datetime('now', '-' || ? || ' days')
      ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
    `,
    )
    .all(workRole.id, daysStr);

  const withdrawals = db
    .prepare(
      `
      SELECT id, amount, status, payout_method, note, created_at, reviewed_at, paid_out_at
      FROM withdrawal_requests
      WHERE work_role_id = ?
        AND datetime(replace(trim(created_at), 'T', ' ')) >= datetime('now', '-' || ? || ' days')
      ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
    `,
    )
    .all(workRole.id, daysStr);

  let rewardTotal = 0;
  let fineTotal = 0;
  const timeline = [];

  for (const L of ledger) {
    const k = String(L.kind || '').toLowerCase();
    const raw = Math.abs(Number(L.amount) || 0);
    if (k === 'reward') rewardTotal += raw;
    if (k === 'fine') fineTotal += raw;
    let signed = Number(L.amount) || 0;
    if (k === 'fine') signed = -Math.abs(signed);
    if (k === 'reward') signed = Math.abs(signed);
    timeline.push({
      source: 'ledger',
      id: L.id,
      kind: L.kind,
      kind_label: ledgerKindLabelUz(L.kind),
      signed_amount: signed,
      title: L.title || '',
      note: L.note || '',
      created_at: L.created_at,
      display_at: L.created_at,
      sort_at: L.created_at,
      payout_method: null,
      withdrawal_status: null,
      paid_out_at: null,
    });
  }

  let withdrawalPaidTotal = 0;
  for (const w of withdrawals) {
    const amt = Math.abs(Number(w.amount) || 0);
    const paid = w.paid_out_at != null && String(w.paid_out_at).trim() !== '';
    if (paid) withdrawalPaidTotal += amt;
    const sortAt = w.paid_out_at || w.reviewed_at || w.created_at;
    const displayAt = w.paid_out_at || w.reviewed_at || w.created_at;
    timeline.push({
      source: 'withdrawal',
      id: w.id,
      kind: 'withdrawal',
      kind_label: 'Pul yechish',
      signed_amount: -amt,
      title: 'Pul yechish so‘rovi',
      note: w.note || '',
      created_at: w.created_at,
      display_at: displayAt,
      sort_at: sortAt,
      payout_method: w.payout_method || '',
      withdrawal_status: w.status,
      paid_out_at: w.paid_out_at || null,
    });
  }

  timeline.sort((a, b) => {
    const sa = String(a.sort_at || '');
    const sb = String(b.sort_at || '');
    if (sa !== sb) return sb.localeCompare(sa);
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  const pendingRow = db
    .prepare(
      `
    SELECT COALESCE(SUM(ABS(amount)), 0) AS s
    FROM withdrawal_requests
    WHERE work_role_id = ?
      AND lower(trim(COALESCE(status, ''))) = 'pending'
  `,
    )
    .get(workRole.id);
  const pendingWithdrawals = Number(pendingRow?.s) || 0;
  const totalAmt = Number(workRole.total_amount) || 0;

  return {
    staff: staff || null,
    work_role: {
      id: workRole.id,
      login: workRole.login,
      email: workRole.email,
      total_amount: workRole.total_amount,
      role_name: workRole.role_name,
      reward_amount: workRole.reward_amount,
      fine_amount: workRole.fine_amount,
    },
    period_days: days,
    timeline,
    balances: {
      /** Sklad `work_roles.total_amount` — hozirgi jami balans */
      total_amount: totalAmt,
      /** Tasdiqlanmagan yechishlar (pending) */
      pending_withdrawal_total: pendingWithdrawals,
      /** Kutilayotgan yechishlar chiqarilgach taxminiy qolgan */
      remaining_after_pending: totalAmt - pendingWithdrawals,
    },
    summary: {
      reward_total: rewardTotal,
      fine_total: fineTotal,
      withdrawal_paid_total: withdrawalPaidTotal,
      ledger_rows: ledger.length,
      withdrawal_rows: withdrawals.length,
    },
  };
}

function parseReportDays(req) {
  let days = Number.parseInt(String(req.query.days ?? '30'), 10);
  if (!Number.isFinite(days) || days < 1) days = 30;
  if (days > 366) days = 366;
  return { days, daysStr: String(days) };
}

/** Hisobot: to‘g‘ridan-to‘g‘ri `work_role_id` (sklad packer roli) — staff bo‘lmasa ham ishlaydi. */
router.get('/packers/report', (req, res) => {
  const workRoleId = Number.parseInt(String(req.query.work_role_id ?? ''), 10);
  if (!Number.isFinite(workRoleId) || workRoleId < 1) {
    return res.status(400).json({ error: '`work_role_id` kerak (musbat butun son).' });
  }
  const { days, daysStr } = parseReportDays(req);

  try {
    const workRole = db.prepare(`SELECT * FROM work_roles WHERE id = ? AND deleted_at IS NULL`).get(workRoleId);
    if (!workRole) {
      return res.status(404).json({ error: 'Ish roli topilmadi yoki o‘chirilgan.' });
    }
    if (!isPackerWorkRoleRow(workRole)) {
      return res.status(400).json({ error: 'Bu qator packer ish roli emas.' });
    }

    const user = db
      .prepare(
        `
      SELECT id, login, email, full_name, staff_member_id
      FROM users
      WHERE
        (length(trim(ifnull(?, ''))) > 0 AND lower(trim(login)) = lower(trim(?)))
        OR (length(trim(ifnull(?, ''))) > 0 AND lower(trim(ifnull(email, ''))) = lower(trim(?)))
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get(
        workRole.login,
        workRole.login,
        workRole.email || '',
        workRole.email || '',
      );

    let staff = null;
    if (user?.id) {
      const sid = user.staff_member_id != null && Number(user.staff_member_id) > 0 ? user.staff_member_id : null;
      if (sid != null) {
        staff =
          db
            .prepare(
              `
        SELECT * FROM staff_members
        WHERE lower(trim(staff_type)) = 'packer'
          AND (user_id = ? OR id = ?)
        ORDER BY CASE WHEN lower(trim(COALESCE(status, ''))) = 'active' THEN 0 ELSE 1 END, id DESC
        LIMIT 1
      `,
            )
            .get(user.id, sid) || null;
      } else {
        staff =
          db
            .prepare(
              `
        SELECT * FROM staff_members
        WHERE lower(trim(staff_type)) = 'packer' AND user_id = ?
        ORDER BY CASE WHEN lower(trim(COALESCE(status, ''))) = 'active' THEN 0 ELSE 1 END, id DESC
        LIMIT 1
      `,
            )
            .get(user.id) || null;
      }
    }

    res.json(buildPackerFinancialPayload(workRole, staff, days, daysStr));
  } catch (e) {
    console.error('accounting portal packer report (work_role_id)', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

/**
 * Hisobot: `staff_members.id` (oldingi API) — ichida `work_role_id` aniqlanadi.
 * Yangi klientlar: `GET /packers/report?work_role_id=…`.
 */
router.get('/packers/:staffId/report', (req, res) => {
  const staffId = Number.parseInt(req.params.staffId, 10);
  if (!Number.isFinite(staffId) || staffId < 1) {
    return res.status(400).json({ error: 'Noto‘g‘ri packer ID.' });
  }
  const { days, daysStr } = parseReportDays(req);

  try {
    const resolved = resolvePackerWorkRoleForStaffMemberId(staffId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { staff, workRole, linkedUser } = resolved;

    if (String(staff.status || '').trim().toLowerCase() !== 'active') {
      return res.status(404).json({
        error:
          'Bu packer faol emas. Faqat faol va sklad «packer» ish roli bilan biriktirilgan xodimlar hisoboti ko‘rinadi.',
      });
    }
    if (!linkedUser) {
      return res.status(404).json({
        error:
          'Packer akkaunti topilmadi. Admin panelida `staff_members.user_id` yoki `users.staff_member_id` orqali packer biriktiring.',
      });
    }
    if (!workRole) {
      return res.status(404).json({
        error:
          'Sklad «packer» ish roli (work_roles) topilmadi: user login/email bilan mos qator va `portal_role`/nom bo‘yicha packer belgilangan bo‘lishi kerak.',
      });
    }

    res.json(buildPackerFinancialPayload(workRole, staff, days, daysStr));
  } catch (e) {
    console.error('accounting portal packer report', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

router.get('/notifications', (req, res) => {
  const list = db
    .prepare(
      `
    SELECT id, title, body, created_at, read_at, link_type, link_id
    FROM user_notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `,
    )
    .all(req.user.id);
  res.json({ notifications: list });
});

router.patch('/notifications/:id/read', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);
  res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim();
  const result = applyWithdrawalReview({
    reviewerUserId: req.user.id,
    withdrawalId: id,
    status,
    note,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id/mark-paid', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = applyWithdrawalMarkPaid({ payerUserId: req.user.id, withdrawalId: id });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
