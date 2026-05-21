import axios from 'axios';
import PDFDocument from 'pdfkit';
import { db } from '../db/database.js';

const UZ_LOCALE = 'uz-UZ';
const CURRENCY = 'UZS';
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampMoney(value) {
  return Math.max(0, Math.round(toNumber(value) * 100) / 100);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sqliteDateTime(date = new Date()) {
  return `${isoDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function parseDateOnly(value) {
  const raw = String(value || '').trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthBounds(year, month) {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return {
    start,
    end,
    startDate: isoDate(start),
    endDate: isoDate(end),
    lastDay: end.getDate(),
  };
}

function currentYearMonth(date = new Date()) {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthLabelUz(year, month) {
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(UZ_LOCALE, {
    month: 'long',
    year: 'numeric',
  });
}

function formatMoney(value) {
  return `${new Intl.NumberFormat(UZ_LOCALE).format(Math.round(toNumber(value)))} so'm`;
}

function mapPayrollStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'To‘landi';
  if (s === 'overdue') return 'Kechikkan';
  return 'Kutilmoqda';
}

function phaseLabel(phase) {
  return String(phase).toLowerCase() === 'advance' ? 'Avans' : 'Oylik ish haqi';
}

function receiptKindFromPaymentType(paymentType) {
  return String(paymentType).toLowerCase() === 'advance' ? 'advance' : 'salary';
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function rowDateRangeWhere(column, from, to, params) {
  const parts = [];
  if (from) {
    parts.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    parts.push(`${column} <= ?`);
    params.push(to);
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

function insertAudit(actorUserId, action, entityType, entityId, summary, payload = {}) {
  db.prepare(
    `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, summary, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(actorUserId || null, action, entityType, entityId || null, summary || '', safeJson(payload));
}

function getExpenseCategoryByCode(code) {
  return db.prepare('SELECT * FROM expense_categories WHERE code = ? LIMIT 1').get(String(code || '').trim());
}

function getIncomeCategoryByCode(code) {
  return db.prepare('SELECT * FROM income_categories WHERE code = ? LIMIT 1').get(String(code || '').trim());
}

function buildReceiptNo(kind) {
  const prefix = String(kind || 'receipt').slice(0, 3).toUpperCase();
  for (let i = 0; i < 5; i += 1) {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const no = `${prefix}-${stamp}-${suffix}`;
    const exists = db.prepare('SELECT id FROM receipts WHERE receipt_no = ?').get(no);
    if (!exists) return no;
  }
  return `${prefix}-${Date.now()}`;
}

function createReceipt({ kind, employeeId, salaryPaymentId, financialTransactionId, payload, actorUserId }) {
  const receiptNo = buildReceiptNo(kind);
  const r = db
    .prepare(
      `
        INSERT INTO receipts (
          receipt_no, kind, employee_id, salary_payment_id, financial_transaction_id, payload_json, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      receiptNo,
      kind,
      employeeId || null,
      salaryPaymentId || null,
      financialTransactionId || null,
      safeJson(payload),
      actorUserId || null,
    );
  return { id: r.lastInsertRowid, receipt_no: receiptNo };
}

function normalizePayrollCycle(row, today = isoDate(new Date())) {
  if (!row) return null;
  const gross = clampMoney(row.gross_amount);
  const paid = clampMoney(row.paid_amount);
  let status = 'pending';
  if (paid >= gross) status = 'paid';
  else if (String(row.due_date || '') < today) status = 'overdue';
  return { ...row, gross_amount: gross, paid_amount: paid, status };
}

export function syncSuperuserEmployees() {
  const rows = db
    .prepare(
      `
        SELECT id, full_name, phone, email, login
        FROM users
        WHERE role_id = 1 OR lower(trim(role)) = 'superuser'
        ORDER BY id ASC
      `,
    )
    .all();

  const insert = db.prepare(
    `
      INSERT INTO employees (user_id, full_name, phone, position, monthly_salary, status, hired_at)
      VALUES (?, ?, ?, 'Superuser', 0, 'active', date('now'))
    `,
  );
  const update = db.prepare(
    `
      UPDATE employees
      SET full_name = COALESCE(NULLIF(trim(full_name), ''), ?),
          phone = COALESCE(NULLIF(trim(phone), ''), ?),
          updated_at = datetime('now')
      WHERE user_id = ?
    `,
  );

  const tx = db.transaction(() => {
    for (const u of rows) {
      const existing = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(u.id);
      const displayName = String(u.full_name || u.login || u.email || `Superuser #${u.id}`).trim();
      if (existing?.id) update.run(displayName, u.phone || '', u.id);
      else insert.run(u.id, displayName, u.phone || '');
    }
  });
  tx();
}

export function ensurePayrollCyclesForMonth(year, month) {
  syncSuperuserEmployees();
  const { startDate, endDate } = monthBounds(year, month);
  const advanceDue = `${year}-${pad2(month)}-15`;
  const salaryDue = endDate;
  const employees = db
    .prepare(
      `
        SELECT id, monthly_salary, advance_percent
        FROM employees
        WHERE lower(trim(status)) = 'active'
      `,
    )
    .all();

  const insert = db.prepare(
    `
      INSERT OR IGNORE INTO payroll_cycles (
        employee_id, cycle_year, cycle_month, phase, period_start, period_end, due_date, gross_amount, paid_amount, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `,
  );
  const updateAmounts = db.prepare(
    `
      UPDATE payroll_cycles
      SET gross_amount = ?, period_start = ?, period_end = ?, due_date = ?, updated_at = datetime('now')
      WHERE employee_id = ? AND cycle_year = ? AND cycle_month = ? AND phase = ? AND paid_amount = 0
    `,
  );

  const tx = db.transaction(() => {
    for (const employee of employees) {
      const monthly = clampMoney(employee.monthly_salary);
      const advancePercent = Math.min(90, Math.max(0, toNumber(employee.advance_percent, 50)));
      const advanceAmount = clampMoney((monthly * advancePercent) / 100);
      const salaryAmount = clampMoney(monthly - advanceAmount);
      const advanceInitialStatus = advanceAmount <= 0 ? 'paid' : 'pending';
      const salaryInitialStatus = salaryAmount <= 0 ? 'paid' : 'pending';

      insert.run(employee.id, year, month, 'advance', startDate, advanceDue, advanceDue, advanceAmount, advanceInitialStatus);
      insert.run(employee.id, year, month, 'salary', `${year}-${pad2(month)}-16`, endDate, salaryDue, salaryAmount, salaryInitialStatus);

      updateAmounts.run(advanceAmount, startDate, advanceDue, advanceDue, employee.id, year, month, 'advance');
      updateAmounts.run(salaryAmount, `${year}-${pad2(month)}-16`, endDate, salaryDue, employee.id, year, month, 'salary');
    }
  });
  tx();
  refreshPayrollStatuses();
}

export function refreshPayrollStatuses() {
  const rows = db.prepare('SELECT * FROM payroll_cycles').all();
  const update = db.prepare(
    `
      UPDATE payroll_cycles
      SET status = ?, closed_at = CASE WHEN ? = 'paid' THEN COALESCE(closed_at, datetime('now')) ELSE NULL END,
          updated_at = datetime('now')
      WHERE id = ?
    `,
  );
  const today = isoDate(new Date());
  const tx = db.transaction(() => {
    for (const row of rows) {
      const next = normalizePayrollCycle(row, today);
      if (next && next.status !== row.status) update.run(next.status, next.status, row.id);
    }
  });
  tx();
}

export function runAccountingMaintenance() {
  const { year, month } = currentYearMonth();
  ensurePayrollCyclesForMonth(year, month);
}

export function schedulePayrollMaintenance() {
  runAccountingMaintenance();
  const intervalMs = Math.max(DAY_MS / 4, Number(process.env.MYSHOP_PAYROLL_MAINTENANCE_MS) || 6 * 60 * 60 * 1000);
  return setInterval(() => {
    try {
      runAccountingMaintenance();
    } catch (e) {
      console.warn('payroll maintenance', e?.message || e);
    }
  }, intervalMs);
}

function salesIncomeBetween(from, to) {
  return (
    db
      .prepare(
        `
          SELECT COALESCE(SUM(total_amount), 0) AS amount, COUNT(*) AS count
          FROM orders
          WHERE lower(trim(coalesce(status, ''))) NOT IN ('cancelled', 'archived')
            AND substr(created_at, 1, 10) >= ?
            AND substr(created_at, 1, 10) <= ?
            AND COALESCE(is_test, 0) = 0
        `,
      )
      .get(from, to) || { amount: 0, count: 0 }
  );
}

function transactionSum(type, from, to) {
  return (
    db
      .prepare(
        `
          SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
          FROM financial_transactions
          WHERE type = ? AND transaction_date >= ? AND transaction_date <= ?
        `,
      )
      .get(type, from, to) || { amount: 0, count: 0 }
  );
}

function payrollPaidBetween(from, to) {
  return (
    db
      .prepare(
        `
          SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
          FROM salary_payments
          WHERE substr(paid_at, 1, 10) >= ? AND substr(paid_at, 1, 10) <= ?
        `,
      )
      .get(from, to) || { amount: 0, count: 0 }
  );
}

function monthlySeries(months = 6) {
  const out = [];
  const today = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const bounds = monthBounds(year, month);
    const sales = salesIncomeBetween(bounds.startDate, bounds.endDate).amount;
    const manualIncome = transactionSum('income', bounds.startDate, bounds.endDate).amount;
    const expenses = transactionSum('expense', bounds.startDate, bounds.endDate).amount;
    const payroll = payrollPaidBetween(bounds.startDate, bounds.endDate).amount;
    const revenue = clampMoney(sales + manualIncome);
    out.push({
      month: monthLabelUz(year, month),
      short_month: d.toLocaleDateString(UZ_LOCALE, { month: 'short' }),
      revenue,
      expenses: clampMoney(expenses),
      payroll: clampMoney(payroll),
      profit: clampMoney(revenue - expenses),
    });
  }
  return out;
}

function payrollStatusCounts() {
  const rows = db
    .prepare(
      `
        SELECT status, COUNT(*) AS count, COALESCE(SUM(gross_amount - paid_amount), 0) AS amount
        FROM payroll_cycles
        GROUP BY status
      `,
    )
    .all();
  const base = {
    paid: { count: 0, amount: 0, label: 'To‘landi' },
    pending: { count: 0, amount: 0, label: 'Kutilmoqda' },
    overdue: { count: 0, amount: 0, label: 'Kechikkan' },
  };
  for (const row of rows) {
    const key = String(row.status || 'pending').toLowerCase();
    if (base[key]) {
      base[key].count = row.count;
      base[key].amount = clampMoney(row.amount);
    }
  }
  return base;
}

function recentActivity(limit = 12) {
  const transactions = db
    .prepare(
      `
        SELECT id, type, source, title, amount, transaction_date AS occurred_at, created_at, note
        FROM financial_transactions
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `,
    )
    .all(limit);
  const payments = db
    .prepare(
      `
        SELECT sp.id, sp.amount, sp.payment_type, sp.paid_at AS occurred_at, sp.created_at,
               e.full_name
        FROM salary_payments sp
        JOIN employees e ON e.id = sp.employee_id
        ORDER BY datetime(sp.created_at) DESC, sp.id DESC
        LIMIT ?
      `,
    )
    .all(limit);

  return [
    ...transactions.map((t) => ({
      id: `tx-${t.id}`,
      kind: t.type,
      title: t.title,
      subtitle: t.type === 'income' ? 'Tushum operatsiyasi' : 'Xarajat operatsiyasi',
      amount: t.amount,
      occurred_at: t.created_at || t.occurred_at,
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      kind: p.payment_type,
      title: `${p.full_name} — ${phaseLabel(p.payment_type)}`,
      subtitle: 'Ish haqi to‘lovi',
      amount: p.amount,
      occurred_at: p.created_at || p.occurred_at,
    })),
  ]
    .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
    .slice(0, limit);
}

export function getDashboardPayload() {
  const { year, month } = currentYearMonth();
  ensurePayrollCyclesForMonth(year, month);
  const { startDate, endDate } = monthBounds(year, month);
  const sales = salesIncomeBetween(startDate, endDate);
  const income = transactionSum('income', startDate, endDate);
  const expense = transactionSum('expense', startDate, endDate);
  const payroll = payrollPaidBetween(startDate, endDate);
  const totalRevenue = clampMoney(sales.amount + income.amount);
  const totalExpenses = clampMoney(expense.amount);
  const netProfit = clampMoney(totalRevenue - totalExpenses);

  const nextCycles = db
    .prepare(
      `
        SELECT pc.*, e.full_name
        FROM payroll_cycles pc
        JOIN employees e ON e.id = pc.employee_id
        WHERE pc.status IN ('pending', 'overdue')
        ORDER BY date(pc.due_date) ASC, pc.id ASC
        LIMIT 8
      `,
    )
    .all()
    .map((row) => ({
      ...normalizePayrollCycle(row),
      phase_label: phaseLabel(row.phase),
      status_label: mapPayrollStatus(row.status),
      remaining_amount: clampMoney(row.gross_amount - row.paid_amount),
    }));

  const categoryExpense = db
    .prepare(
      `
        SELECT COALESCE(ec.name, ft.category_code, 'Boshqa') AS name,
               COALESCE(ec.color, '#64748b') AS color,
               COALESCE(SUM(ft.amount), 0) AS amount
        FROM financial_transactions ft
        LEFT JOIN expense_categories ec ON ec.id = ft.category_id AND ft.type = 'expense'
        WHERE ft.type = 'expense' AND ft.transaction_date >= ? AND ft.transaction_date <= ?
        GROUP BY COALESCE(ec.name, ft.category_code, 'Boshqa'), COALESCE(ec.color, '#64748b')
        ORDER BY amount DESC
        LIMIT 8
      `,
    )
    .all(startDate, endDate);

  return {
    period: {
      year,
      month,
      label: monthLabelUz(year, month),
      start_date: startDate,
      end_date: endDate,
    },
    kpis: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      payroll_cost: clampMoney(payroll.amount),
      sales_income: clampMoney(sales.amount),
      manual_income: clampMoney(income.amount),
      orders_count: sales.count,
      expense_ratio: totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 1000) / 10 : 0,
    },
    charts: {
      monthly: monthlySeries(6),
      payroll_status: payrollStatusCounts(),
      expense_categories: categoryExpense,
    },
    next_cycles: nextCycles,
    activity: recentActivity(12),
  };
}

function employeePayrollSummary(employee, year, month) {
  const cycles = db
    .prepare(
      `
        SELECT * FROM payroll_cycles
        WHERE employee_id = ? AND cycle_year = ? AND cycle_month = ?
        ORDER BY CASE phase WHEN 'advance' THEN 0 ELSE 1 END
      `,
    )
    .all(employee.id, year, month)
    .map((row) => {
      const normalized = normalizePayrollCycle(row);
      return {
        ...normalized,
        phase_label: phaseLabel(row.phase),
        status_label: mapPayrollStatus(normalized.status),
        remaining_amount: clampMoney(normalized.gross_amount - normalized.paid_amount),
      };
    });
  const advance = cycles.find((c) => c.phase === 'advance') || null;
  const salary = cycles.find((c) => c.phase === 'salary') || null;
  const paidThisMonth = cycles.reduce((sum, c) => sum + clampMoney(c.paid_amount), 0);
  const dueThisMonth = cycles.reduce((sum, c) => sum + clampMoney(c.gross_amount), 0);
  const remaining = clampMoney(dueThisMonth - paidThisMonth);
  const statusOrder = { overdue: 3, pending: 2, paid: 1 };
  const worst = cycles.reduce((acc, c) => (statusOrder[c.status] > statusOrder[acc] ? c.status : acc), 'paid');
  const next = cycles.find((c) => c.status !== 'paid') || salary || advance || null;
  const lastPayment = db
    .prepare(
      `
        SELECT amount, payment_type, paid_at
        FROM salary_payments
        WHERE employee_id = ?
        ORDER BY datetime(paid_at) DESC, id DESC
        LIMIT 1
      `,
    )
    .get(employee.id);

  return {
    ...employee,
    monthly_salary: clampMoney(employee.monthly_salary),
    cycles,
    current_advance_cycle: advance,
    current_salary_cycle: salary,
    paid_this_month: paidThisMonth,
    remaining_balance: remaining,
    status: worst,
    status_label: mapPayrollStatus(worst),
    next_payment_date: next?.due_date || null,
    next_payment_label: next ? phaseLabel(next.phase) : 'Reja yo‘q',
    last_payment: lastPayment
      ? {
          ...lastPayment,
          payment_type_label: phaseLabel(lastPayment.payment_type),
        }
      : null,
  };
}

export function listPayrollEmployees() {
  const { year, month } = currentYearMonth();
  ensurePayrollCyclesForMonth(year, month);
  const employees = db
    .prepare(
      `
        SELECT e.*, u.login AS user_login, u.email AS user_email
        FROM employees e
        LEFT JOIN users u ON u.id = e.user_id
        ORDER BY CASE lower(e.status) WHEN 'active' THEN 0 ELSE 1 END, e.full_name COLLATE NOCASE ASC
      `,
    )
    .all();
  const history = db
    .prepare(
      `
        SELECT sp.*, e.full_name, r.receipt_no, r.id AS receipt_id
        FROM salary_payments sp
        JOIN employees e ON e.id = sp.employee_id
        LEFT JOIN receipts r ON r.salary_payment_id = sp.id
        ORDER BY datetime(sp.paid_at) DESC, sp.id DESC
        LIMIT 40
      `,
    )
    .all()
    .map((row) => ({ ...row, payment_type_label: phaseLabel(row.payment_type) }));

  return {
    period: { year, month, label: monthLabelUz(year, month) },
    employees: employees.map((e) => employeePayrollSummary(e, year, month)),
    history,
    stats: payrollStatusCounts(),
  };
}

export function upsertEmployee(input, actorUserId) {
  const id = input?.id ? Number.parseInt(String(input.id), 10) : null;
  const fullName = String(input?.full_name || '').trim();
  if (!fullName) return { ok: false, status: 400, error: 'Xodim F.I.Sh. kiritilishi kerak.' };
  const monthlySalary = clampMoney(input?.monthly_salary);
  const advancePercent = Math.min(90, Math.max(0, toNumber(input?.advance_percent, 50)));
  const status = ['active', 'inactive'].includes(String(input?.status || '').toLowerCase())
    ? String(input.status).toLowerCase()
    : 'active';

  if (id) {
    const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
    if (!existing) return { ok: false, status: 404, error: 'Xodim topilmadi.' };
    db.prepare(
      `
        UPDATE employees
        SET full_name = ?, phone = ?, position = ?, monthly_salary = ?, advance_percent = ?,
            status = ?, telegram_chat_id = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(
      fullName,
      String(input?.phone || '').trim(),
      String(input?.position || 'Superuser').trim() || 'Superuser',
      monthlySalary,
      advancePercent,
      status,
      String(input?.telegram_chat_id || '').trim(),
      String(input?.notes || '').trim(),
      id,
    );
    insertAudit(actorUserId, 'employee.updated', 'employee', id, `${fullName} ma’lumotlari yangilandi`, input);
    const { year, month } = currentYearMonth();
    ensurePayrollCyclesForMonth(year, month);
    return { ok: true, employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(id) };
  }

  const r = db
    .prepare(
      `
        INSERT INTO employees (
          full_name, phone, position, monthly_salary, advance_percent, status, telegram_chat_id, notes, hired_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'))
      `,
    )
    .run(
      fullName,
      String(input?.phone || '').trim(),
      String(input?.position || 'Superuser').trim() || 'Superuser',
      monthlySalary,
      advancePercent,
      status,
      String(input?.telegram_chat_id || '').trim(),
      String(input?.notes || '').trim(),
    );
  insertAudit(actorUserId, 'employee.created', 'employee', r.lastInsertRowid, `${fullName} qo‘shildi`, input);
  const { year, month } = currentYearMonth();
  ensurePayrollCyclesForMonth(year, month);
  return { ok: true, employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(r.lastInsertRowid) };
}

async function sendTelegramPayrollNotification(employee, payment, receipt) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || process.env.MYSHOP_TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(employee?.telegram_chat_id || '').trim();
  if (!botToken || !chatId) return;
  const text = [
    `MyShop buxgalteriya`,
    `${employee.full_name} uchun ${phaseLabel(payment.payment_type).toLowerCase()} to‘landi.`,
    `Summa: ${formatMoney(payment.amount)}`,
    receipt?.receipt_no ? `Chek: ${receipt.receipt_no}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.warn('telegram payroll notification', e?.message || e);
  }
}

export async function createSalaryPayment(input, actorUserId) {
  const employeeId = Number.parseInt(String(input?.employee_id || ''), 10);
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
  if (!employee) return { ok: false, status: 404, error: 'Xodim topilmadi.' };
  const amount = clampMoney(input?.amount);
  if (amount <= 0) return { ok: false, status: 400, error: 'To‘lov summasi musbat bo‘lishi kerak.' };
  const paymentType = ['advance', 'salary', 'bonus', 'correction'].includes(String(input?.payment_type || '').toLowerCase())
    ? String(input.payment_type).toLowerCase()
    : 'salary';
  const phase = paymentType === 'advance' ? 'advance' : 'salary';
  const { year, month } = currentYearMonth();
  ensurePayrollCyclesForMonth(year, month);
  const cycle = db
    .prepare(
      `
        SELECT * FROM payroll_cycles
        WHERE employee_id = ? AND cycle_year = ? AND cycle_month = ? AND phase = ?
      `,
    )
    .get(employeeId, year, month, phase);
  if (!cycle) return { ok: false, status: 400, error: 'Joriy oy uchun ish haqi sikli topilmadi.' };

  const expenseCategory = getExpenseCategoryByCode('employee_payroll');
  const paidAt = String(input?.paid_at || '').trim() || sqliteDateTime();
  const note = String(input?.note || '').trim();
  const method = String(input?.payment_method || 'cash').trim() || 'cash';

  const tx = db.transaction(() => {
    const paymentRow = db
      .prepare(
        `
          INSERT INTO salary_payments (cycle_id, employee_id, amount, payment_type, payment_method, note, paid_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(cycle.id, employeeId, amount, paymentType, method, note, paidAt, actorUserId || null);

    const updatedPaid = clampMoney(toNumber(cycle.paid_amount) + amount);
    const normalized = normalizePayrollCycle({ ...cycle, paid_amount: updatedPaid });
    db.prepare(
      `
        UPDATE payroll_cycles
        SET paid_amount = ?, status = ?, closed_at = CASE WHEN ? = 'paid' THEN COALESCE(closed_at, datetime('now')) ELSE NULL END,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(updatedPaid, normalized.status, normalized.status, cycle.id);

    const title = `${employee.full_name} — ${phaseLabel(paymentType)}`;
    const ft = db
      .prepare(
        `
          INSERT INTO financial_transactions (
            type, category_id, category_code, source, title, amount, currency, transaction_date,
            note, linked_salary_payment_id, created_by
          )
          VALUES ('expense', ?, ?, 'payroll', ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        expenseCategory?.id || null,
        expenseCategory?.code || 'employee_payroll',
        title,
        amount,
        CURRENCY,
        String(paidAt).slice(0, 10),
        note,
        paymentRow.lastInsertRowid,
        actorUserId || null,
      );

    const receipt = createReceipt({
      kind: receiptKindFromPaymentType(paymentType),
      employeeId,
      salaryPaymentId: paymentRow.lastInsertRowid,
      financialTransactionId: ft.lastInsertRowid,
      actorUserId,
      payload: {
        employee_name: employee.full_name,
        payment_type: paymentType,
        payment_type_label: phaseLabel(paymentType),
        amount,
        currency: CURRENCY,
        payment_method: method,
        paid_at: paidAt,
        note,
      },
    });

    insertAudit(actorUserId, 'salary_payment.created', 'salary_payment', paymentRow.lastInsertRowid, title, {
      employee_id: employeeId,
      amount,
      payment_type: paymentType,
      receipt_no: receipt.receipt_no,
    });

    return {
      id: paymentRow.lastInsertRowid,
      amount,
      payment_type: paymentType,
      receipt,
    };
  });

  const payment = tx();
  await sendTelegramPayrollNotification(employee, payment, payment.receipt);
  return { ok: true, payment };
}

export function listCategories() {
  return {
    income_categories: db.prepare('SELECT * FROM income_categories WHERE active = 1 ORDER BY name').all(),
    expense_categories: db.prepare('SELECT * FROM expense_categories WHERE active = 1 ORDER BY name').all(),
  };
}

export function createFinancialTransaction(input, actorUserId) {
  const type = String(input?.type || '').trim().toLowerCase();
  if (!['income', 'expense'].includes(type)) return { ok: false, status: 400, error: 'Turi noto‘g‘ri.' };
  const amount = clampMoney(input?.amount);
  if (amount <= 0) return { ok: false, status: 400, error: 'Summa musbat bo‘lishi kerak.' };
  const title = String(input?.title || '').trim();
  if (!title) return { ok: false, status: 400, error: 'Nomi kiritilishi kerak.' };
  const categoryCode = String(input?.category_code || '').trim();
  const category = type === 'income' ? getIncomeCategoryByCode(categoryCode) : getExpenseCategoryByCode(categoryCode);
  const transactionDate = String(input?.transaction_date || '').trim().slice(0, 10) || isoDate(new Date());
  if (!parseDateOnly(transactionDate)) return { ok: false, status: 400, error: 'Sana noto‘g‘ri.' };
  const note = String(input?.note || '').trim();

  const r = db
    .prepare(
      `
        INSERT INTO financial_transactions (
          type, category_id, category_code, source, title, amount, currency, transaction_date, note, created_by
        )
        VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(type, category?.id || null, category?.code || categoryCode || null, title, amount, CURRENCY, transactionDate, note, actorUserId || null);

  const receipt = createReceipt({
    kind: type,
    financialTransactionId: r.lastInsertRowid,
    actorUserId,
    payload: {
      type,
      title,
      category_name: category?.name || categoryCode,
      amount,
      currency: CURRENCY,
      transaction_date: transactionDate,
      note,
    },
  });

  insertAudit(actorUserId, 'financial_transaction.created', 'financial_transaction', r.lastInsertRowid, title, {
    type,
    amount,
    receipt_no: receipt.receipt_no,
  });

  return { ok: true, transaction: db.prepare('SELECT * FROM financial_transactions WHERE id = ?').get(r.lastInsertRowid), receipt };
}

export function listFinancialTransactions(query = {}) {
  const params = [];
  const where = [];
  const type = String(query.type || '').trim().toLowerCase();
  if (['income', 'expense'].includes(type)) {
    where.push('ft.type = ?');
    params.push(type);
  }
  const from = String(query.from || '').trim().slice(0, 10);
  const to = String(query.to || '').trim().slice(0, 10);
  if (from && parseDateOnly(from)) {
    where.push('ft.transaction_date >= ?');
    params.push(from);
  }
  if (to && parseDateOnly(to)) {
    where.push('ft.transaction_date <= ?');
    params.push(to);
  }
  const search = String(query.q || '').trim();
  if (search) {
    where.push('(lower(ft.title) LIKE lower(?) OR lower(coalesce(ft.note, \'\')) LIKE lower(?))');
    params.push(`%${search}%`, `%${search}%`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `
        SELECT ft.*,
               COALESCE(ic.name, ec.name, ft.category_code, 'Boshqa') AS category_name,
               COALESCE(ic.color, ec.color, '#64748b') AS category_color,
               r.id AS receipt_id,
               r.receipt_no
        FROM financial_transactions ft
        LEFT JOIN income_categories ic ON ic.id = ft.category_id AND ft.type = 'income'
        LEFT JOIN expense_categories ec ON ec.id = ft.category_id AND ft.type = 'expense'
        LEFT JOIN receipts r ON r.financial_transaction_id = ft.id
        ${sqlWhere}
        ORDER BY ft.transaction_date DESC, ft.id DESC
        LIMIT 300
      `,
    )
    .all(...params);
  const summaryParams = [...params];
  const summary = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS expenses,
          COUNT(*) AS count
        FROM financial_transactions ft
        ${sqlWhere}
      `,
    )
    .get(...summaryParams);
  return {
    transactions: rows,
    summary: {
      income: clampMoney(summary?.income),
      expenses: clampMoney(summary?.expenses),
      net: clampMoney(toNumber(summary?.income) - toNumber(summary?.expenses)),
      count: summary?.count || 0,
    },
  };
}

export function getReportPayload(query = {}) {
  const now = new Date();
  const defaultBounds = monthBounds(now.getFullYear(), now.getMonth() + 1);
  const from = parseDateOnly(String(query.from || '').slice(0, 10)) ? String(query.from).slice(0, 10) : defaultBounds.startDate;
  const to = parseDateOnly(String(query.to || '').slice(0, 10)) ? String(query.to).slice(0, 10) : defaultBounds.endDate;
  const sales = salesIncomeBetween(from, to);
  const income = transactionSum('income', from, to);
  const expenses = transactionSum('expense', from, to);
  const payroll = payrollPaidBetween(from, to);
  const totalIncome = clampMoney(sales.amount + income.amount);
  const totalExpenses = clampMoney(expenses.amount);

  const params = [];
  const auditWhere = rowDateRangeWhere('substr(created_at, 1, 10)', from, to, params);
  const audits = db
    .prepare(
      `
        SELECT id, action, entity_type, entity_id, summary, created_at
        FROM audit_logs
        WHERE 1 = 1 ${auditWhere}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 80
      `,
    )
    .all(...params);

  return {
    range: { from, to },
    summary: {
      sales_income: clampMoney(sales.amount),
      manual_income: clampMoney(income.amount),
      total_income: totalIncome,
      total_expenses: totalExpenses,
      payroll_cost: clampMoney(payroll.amount),
      net_profit: clampMoney(totalIncome - totalExpenses),
      orders_count: sales.count,
      transaction_count: income.count + expenses.count,
    },
    charts: {
      monthly: monthlySeries(12),
      payroll_status: payrollStatusCounts(),
    },
    audit_logs: audits,
  };
}

export function listReceipts(query = {}) {
  const params = [];
  const where = [];
  const kind = String(query.kind || '').trim().toLowerCase();
  if (['salary', 'advance', 'income', 'expense'].includes(kind)) {
    where.push('r.kind = ?');
    params.push(kind);
  }
  const search = String(query.q || '').trim();
  if (search) {
    where.push('(lower(r.receipt_no) LIKE lower(?) OR lower(coalesce(e.full_name, \'\')) LIKE lower(?))');
    params.push(`%${search}%`, `%${search}%`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(
      `
        SELECT r.id, r.receipt_no, r.kind, r.created_at, r.payload_json,
               e.full_name AS employee_name,
               sp.amount AS salary_amount,
               ft.title AS transaction_title,
               ft.amount AS transaction_amount
        FROM receipts r
        LEFT JOIN employees e ON e.id = r.employee_id
        LEFT JOIN salary_payments sp ON sp.id = r.salary_payment_id
        LEFT JOIN financial_transactions ft ON ft.id = r.financial_transaction_id
        ${sqlWhere}
        ORDER BY datetime(r.created_at) DESC, r.id DESC
        LIMIT 200
      `,
    )
    .all(...params)
    .map((r) => ({ ...r, payload: parseJson(r.payload_json, {}) }));
}

export function getReceipt(id) {
  const receiptId = Number.parseInt(String(id || ''), 10);
  if (!Number.isFinite(receiptId) || receiptId < 1) return null;
  const row = db
    .prepare(
      `
        SELECT r.*, e.full_name AS employee_name, e.position,
               sp.amount AS salary_amount, sp.payment_type, sp.payment_method, sp.paid_at,
               ft.title AS transaction_title, ft.amount AS transaction_amount, ft.transaction_date, ft.type AS transaction_type
        FROM receipts r
        LEFT JOIN employees e ON e.id = r.employee_id
        LEFT JOIN salary_payments sp ON sp.id = r.salary_payment_id
        LEFT JOIN financial_transactions ft ON ft.id = r.financial_transaction_id
        WHERE r.id = ?
      `,
    )
    .get(receiptId);
  if (!row) return null;
  return { ...row, payload: parseJson(row.payload_json, {}) };
}

export function streamReceiptPdf(receipt, res) {
  const payload = receipt.payload || {};
  const amount = payload.amount ?? receipt.salary_amount ?? receipt.transaction_amount ?? 0;
  const title =
    payload.payment_type_label ||
    payload.title ||
    receipt.transaction_title ||
    (receipt.kind === 'advance' ? 'Avans' : receipt.kind === 'salary' ? 'Oylik ish haqi' : 'Operatsiya');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${receipt.receipt_no}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(res);
  doc.fontSize(22).text('MyShop buxgalteriya cheki', { align: 'center' });
  doc.moveDown(0.6);
  doc.fontSize(11).fillColor('#64748b').text(`Chek raqami: ${receipt.receipt_no}`, { align: 'center' });
  doc.text(`Yaratilgan vaqt: ${receipt.created_at}`, { align: 'center' });
  doc.moveDown(1.5);
  doc.fillColor('#0f172a').fontSize(14).text(title);
  doc.moveDown(0.8);
  doc.fontSize(12);
  const lines = [
    ['Xodim', payload.employee_name || receipt.employee_name || '-'],
    ['Lavozim', receipt.position || 'Superuser'],
    ['Summa', formatMoney(amount)],
    ['To‘lov usuli', payload.payment_method || receipt.payment_method || '-'],
    ['Sana', payload.paid_at || payload.transaction_date || receipt.paid_at || receipt.transaction_date || receipt.created_at],
    ['Izoh', payload.note || '-'],
  ];
  for (const [label, value] of lines) {
    doc.fillColor('#64748b').text(`${label}: `, { continued: true });
    doc.fillColor('#0f172a').text(String(value || '-'));
  }
  doc.moveDown(2);
  doc.fillColor('#64748b').fontSize(10).text('Ushbu chek MyShop Accounting & Payroll tizimi orqali avtomatik yaratildi.');
  doc.end();
}

