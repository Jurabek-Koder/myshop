import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { db } from '../../db/database.js';
import { getUploadsRoot } from '../../config/dataPaths.js';
import { recalculatePayrollCycleStatuses } from './accountingSchema.js';

const UZ_LOCALE = 'uz-UZ';

function toSqlDateTime(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function toDateOnly(input = new Date()) {
  return toSqlDateTime(input).slice(0, 10);
}

function parsePositiveNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function salaryParts(monthlySalary) {
  const full = Math.max(Number(monthlySalary) || 0, 0);
  const advance = Math.round(full * 0.5);
  return { advance, salary: Math.max(full - advance, 0) };
}

function formatMoney(value) {
  return `${new Intl.NumberFormat(UZ_LOCALE).format(Math.round(Number(value) || 0))} so‘m`;
}

function normalizeRangeDays(days) {
  const n = Number.parseInt(String(days ?? '30'), 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  if (n > 365) return 365;
  return n;
}

function ensureCycleForCurrentMonth(employee, cycleType) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const existing = db
    .prepare(
      `
      SELECT *
      FROM payroll_cycles
      WHERE employee_id = ? AND cycle_year = ? AND cycle_month = ? AND cycle_type = ?
      LIMIT 1
    `,
    )
    .get(employee.id, year, month, cycleType);
  if (existing) return existing;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const periodStart = cycleType === 'advance' ? monthStart : new Date(Date.UTC(year, month - 1, 16));
  const periodEnd = cycleType === 'advance' ? new Date(Date.UTC(year, month - 1, 15)) : monthEnd;
  const dueDate = periodEnd;
  const parts = salaryParts(employee.monthly_salary);
  const grossAmount = cycleType === 'advance' ? parts.advance : parts.salary;

  db.prepare(
    `
    INSERT INTO payroll_cycles (
      employee_id, cycle_year, cycle_month, cycle_type,
      period_start, period_end, due_date,
      gross_amount, paid_amount, remaining_amount, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', datetime('now'), datetime('now'))
  `,
  ).run(
    employee.id,
    year,
    month,
    cycleType,
    toDateOnly(periodStart),
    toDateOnly(periodEnd),
    toDateOnly(dueDate),
    grossAmount,
    grossAmount,
  );
  return db
    .prepare(
      `
      SELECT *
      FROM payroll_cycles
      WHERE employee_id = ? AND cycle_year = ? AND cycle_month = ? AND cycle_type = ?
      LIMIT 1
    `,
    )
    .get(employee.id, year, month, cycleType);
}

function getCategoryIdByKey(transactionType, categoryKey) {
  const key = String(categoryKey || '').trim().toLowerCase();
  if (!key) return null;
  if (transactionType === 'income') {
    return db.prepare(`SELECT id FROM income_categories WHERE lower(name_key) = ?`).get(key)?.id ?? null;
  }
  return db.prepare(`SELECT id FROM expense_categories WHERE lower(name_key) = ?`).get(key)?.id ?? null;
}

function addAuditLog({ actorUserId, action, entityType, entityId, payload }) {
  db.prepare(
    `
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `,
  ).run(actorUserId ?? null, action, entityType, entityId ?? null, JSON.stringify(payload || {}));
}

async function sendTelegramPayrollNotification({ employee, paymentAmount, cycleType, dueDate, paymentDate }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const defaultChatId = String(process.env.TELEGRAM_ACCOUNTING_CHAT_ID || '').trim();
  const chatId = String(employee?.telegram_chat_id || defaultChatId || '').trim();
  if (!token || !chatId) return;
  const cycleLabel = cycleType === 'advance' ? 'Avans' : 'Oylik ish haqi';
  const text = [
    '💼 MyShop Ish haqi xabarnomasi',
    `Xodim: ${employee.full_name}`,
    `To‘lov turi: ${cycleLabel}`,
    `To‘langan summa: ${formatMoney(paymentAmount)}`,
    `To‘lov sanasi: ${paymentDate}`,
    `Muddat: ${dueDate}`,
  ].join('\n');

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text },
      { timeout: 8000 },
    );
  } catch (err) {
    console.warn('[accounting] telegram notification failed:', err?.message || err);
  }
}

function buildReceiptNumber() {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `MS-${Date.now()}-${suffix}`;
}

function generateReceiptPdf({ receiptNumber, employeeName, cycleType, amount, paymentDate, dueDate, operatorName }) {
  const receiptsDir = path.join(getUploadsRoot(), 'receipts');
  fs.mkdirSync(receiptsDir, { recursive: true });
  const filePath = path.join(receiptsDir, `${receiptNumber}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    stream.on('error', reject);
    stream.on('finish', () => resolve(filePath));
    doc.pipe(stream);

    doc.fontSize(22).text('MyShop - Ish haqi kvitansiyasi');
    doc.moveDown(0.6);
    doc.fontSize(12).text(`Kvitansiya raqami: ${receiptNumber}`);
    doc.text(`Xodim: ${employeeName}`);
    doc.text(`To‘lov turi: ${cycleType === 'advance' ? 'Avans' : 'Oylik ish haqi'}`);
    doc.text(`To‘lov summasi: ${formatMoney(amount)}`);
    doc.text(`To‘lov sanasi: ${paymentDate}`);
    doc.text(`To‘lov muddati: ${dueDate}`);
    doc.moveDown(0.8);
    doc.text(`Mas’ul buxgalter: ${operatorName || 'MyShop Accounting'}`);
    doc.moveDown(0.6);
    doc.text('Holat: To‘landi', { underline: true });
    doc.moveDown(0.8);
    doc.fontSize(10).fillColor('#6b7280').text('Bu hujjat tizim tomonidan avtomatik yaratildi.');
    doc.end();
  });
}

function fetchPayrollActivity(limit = 10) {
  return db
    .prepare(
      `
      SELECT
        'payroll' AS kind,
        sp.id,
        e.full_name AS actor_name,
        sp.amount,
        sp.payment_type AS status_label,
        sp.paid_at AS happened_at,
        sp.note
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
      LIMIT ?
    `,
    )
    .all(limit);
}

export function getAccountingDashboardSnapshot({ rangeDays = 30 } = {}) {
  recalculatePayrollCycleStatuses(db);
  const days = normalizeRangeDays(rangeDays);
  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total
      FROM financial_transactions
      WHERE date(transaction_date) >= date('now', '-' || ? || ' days')
    `,
    )
    .get(String(days));

  const payrollCosts = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM salary_payments
      WHERE lower(trim(COALESCE(payment_status, 'paid'))) = 'paid'
        AND date(paid_at) >= date('now', '-' || ? || ' days')
    `,
    )
    .get(String(days));

  const trendRows = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', transaction_date) AS month_key,
        COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS expense
      FROM financial_transactions
      WHERE date(transaction_date) >= date('now', '-180 days')
      GROUP BY month_key
      ORDER BY month_key ASC
    `,
    )
    .all();

  const payrollTrend = db
    .prepare(
      `
      SELECT strftime('%Y-%m', paid_at) AS month_key, COALESCE(SUM(amount), 0) AS total
      FROM salary_payments
      WHERE lower(trim(COALESCE(payment_status, 'paid'))) = 'paid'
        AND date(paid_at) >= date('now', '-180 days')
      GROUP BY month_key
      ORDER BY month_key ASC
    `,
    )
    .all();
  const payrollByMonth = new Map(payrollTrend.map((row) => [row.month_key, Number(row.total) || 0]));

  const monthlyTrends = trendRows.map((row) => ({
    month_key: row.month_key,
    income: Number(row.income) || 0,
    expense: Number(row.expense) || 0,
    payroll: payrollByMonth.get(row.month_key) || 0,
    profit: (Number(row.income) || 0) - (Number(row.expense) || 0),
  }));

  const statusCounters = db
    .prepare(
      `
      SELECT status, COUNT(*) AS count
      FROM payroll_cycles
      WHERE cycle_year = CAST(strftime('%Y', 'now') AS INTEGER)
        AND cycle_month = CAST(strftime('%m', 'now') AS INTEGER)
      GROUP BY status
    `,
    )
    .all();
  const payrollStatus = { paid: 0, pending: 0, overdue: 0 };
  for (const row of statusCounters) payrollStatus[String(row.status || 'pending')] = Number(row.count) || 0;

  const dueSoon = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM payroll_cycles
      WHERE status != 'paid'
        AND date(due_date) BETWEEN date('now') AND date('now', '+3 days')
    `,
    )
    .get();

  const activity = [
    ...fetchPayrollActivity(6).map((item) => ({
      id: `payroll-${item.id}`,
      type: 'salary_payment',
      title: `${item.actor_name} uchun to‘lov`,
      amount: Number(item.amount) || 0,
      direction: 'expense',
      happened_at: item.happened_at,
      status: item.status_label,
      note: item.note || '',
    })),
    ...db
      .prepare(
        `
        SELECT id, transaction_type, source_type, amount, transaction_date, note
        FROM financial_transactions
        ORDER BY datetime(transaction_date) DESC, id DESC
        LIMIT 6
      `,
      )
      .all()
      .map((item) => ({
        id: `tx-${item.id}`,
        type: item.source_type,
        title: item.transaction_type === 'income' ? 'Daromad kiritildi' : 'Xarajat kiritildi',
        amount: Number(item.amount) || 0,
        direction: item.transaction_type,
        happened_at: item.transaction_date,
        status: item.source_type,
        note: item.note || '',
      })),
  ]
    .sort((a, b) => String(b.happened_at || '').localeCompare(String(a.happened_at || '')))
    .slice(0, 12);

  const income = Number(totals?.income_total) || 0;
  const expense = Number(totals?.expense_total) || 0;
  const payrollExpense = Number(payrollCosts?.total) || 0;
  return {
    range_days: days,
    kpis: {
      total_income: income,
      total_expense: expense,
      net_profit: income - expense,
      total_payroll_expense: payrollExpense,
    },
    payroll_status: payrollStatus,
    due_soon_count: Number(dueSoon?.count) || 0,
    monthly_trends: monthlyTrends,
    activity_feed: activity,
  };
}

export function listPayrollEmployees() {
  recalculatePayrollCycleStatuses(db);
  const employees = db
    .prepare(
      `
      SELECT id, full_name, monthly_salary, phone, position_title, employment_status
      FROM employees
      WHERE lower(trim(COALESCE(employment_status, 'active'))) = 'active'
      ORDER BY full_name COLLATE NOCASE ASC
    `,
    )
    .all();

  const lastPaymentStmt = db.prepare(
    `
    SELECT amount, paid_at
    FROM salary_payments
    WHERE employee_id = ?
      AND lower(trim(COALESCE(payment_status, 'paid'))) = 'paid'
    ORDER BY datetime(replace(paid_at, 'T', ' ')) DESC, id DESC
    LIMIT 1
  `,
  );
  const nextCycleStmt = db.prepare(
    `
    SELECT id, cycle_type, due_date, remaining_amount, status, cycle_year, cycle_month
    FROM payroll_cycles
    WHERE employee_id = ?
      AND remaining_amount > 0
    ORDER BY date(due_date) ASC, id ASC
    LIMIT 1
  `,
  );
  const monthlyRemainingStmt = db.prepare(
    `
    SELECT COALESCE(SUM(remaining_amount), 0) AS total
    FROM payroll_cycles
    WHERE employee_id = ?
      AND cycle_year = CAST(strftime('%Y', 'now') AS INTEGER)
      AND cycle_month = CAST(strftime('%m', 'now') AS INTEGER)
  `,
  );
  const overdueCheckStmt = db.prepare(
    `
    SELECT COUNT(*) AS count
    FROM payroll_cycles
    WHERE employee_id = ? AND status = 'overdue'
  `,
  );

  return employees.map((employee) => {
    const lastPayment = lastPaymentStmt.get(employee.id);
    const nextCycle = nextCycleStmt.get(employee.id);
    const monthlyRemaining = Number(monthlyRemainingStmt.get(employee.id)?.total) || 0;
    const overdueCount = Number(overdueCheckStmt.get(employee.id)?.count) || 0;
    let statusBadge = 'Kutilmoqda';
    let statusKey = 'pending';
    if (overdueCount > 0) {
      statusBadge = 'Kechikkan';
      statusKey = 'overdue';
    } else if (!nextCycle) {
      statusBadge = 'To‘landi';
      statusKey = 'paid';
    }
    return {
      id: employee.id,
      full_name: employee.full_name,
      monthly_salary: Number(employee.monthly_salary) || 0,
      phone: employee.phone || '',
      position_title: employee.position_title || 'Mas’ul xodim',
      last_payment_at: lastPayment?.paid_at || null,
      last_payment_amount: Number(lastPayment?.amount) || 0,
      next_payment_date: nextCycle?.due_date || null,
      next_cycle_type: nextCycle?.cycle_type || null,
      remaining_balance: monthlyRemaining,
      status_label: statusBadge,
      status_key: statusKey,
    };
  });
}

export function listPayrollCalendar({ days = 45 } = {}) {
  recalculatePayrollCycleStatuses(db);
  const horizon = normalizeRangeDays(days);
  return db
    .prepare(
      `
      SELECT
        pc.id,
        pc.due_date,
        pc.cycle_type,
        pc.status,
        pc.remaining_amount,
        e.full_name
      FROM payroll_cycles pc
      INNER JOIN employees e ON e.id = pc.employee_id
      WHERE date(pc.due_date) BETWEEN date('now', '-7 days') AND date('now', '+' || ? || ' days')
      ORDER BY date(pc.due_date) ASC, e.full_name COLLATE NOCASE ASC
    `,
    )
    .all(String(horizon))
    .map((row) => ({
      id: row.id,
      due_date: row.due_date,
      cycle_type: row.cycle_type,
      status: row.status,
      remaining_amount: Number(row.remaining_amount) || 0,
      employee_name: row.full_name,
    }));
}

export function listFinancialTransactions({ query = '', type = '', categoryKey = '', from = '', to = '' } = {}) {
  const text = `%${String(query || '').trim().toLowerCase()}%`;
  const txType = String(type || '').trim().toLowerCase();
  const filters = [];
  const params = [];
  if (txType === 'income' || txType === 'expense') {
    filters.push(`lower(ft.transaction_type) = ?`);
    params.push(txType);
  }
  if (categoryKey) {
    filters.push(`lower(COALESCE(cat.name_key, '')) = ?`);
    params.push(String(categoryKey).trim().toLowerCase());
  }
  if (from) {
    filters.push(`date(ft.transaction_date) >= date(?)`);
    params.push(from);
  }
  if (to) {
    filters.push(`date(ft.transaction_date) <= date(?)`);
    params.push(to);
  }
  filters.push(`(lower(COALESCE(ft.note, '')) LIKE ? OR lower(COALESCE(ft.source_type, '')) LIKE ?)`);
  params.push(text, text);
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `
      SELECT
        ft.id,
        ft.transaction_type,
        ft.source_type,
        ft.amount,
        ft.transaction_date,
        ft.note,
        COALESCE(ec.name_key, ic.name_key) AS category_key,
        COALESCE(ec.label_uz, ic.label_uz) AS category_label
      FROM financial_transactions ft
      LEFT JOIN expense_categories ec ON ft.transaction_type = 'expense' AND ft.category_id = ec.id
      LEFT JOIN income_categories ic ON ft.transaction_type = 'income' AND ft.category_id = ic.id
      ${whereSql}
      ORDER BY date(ft.transaction_date) DESC, ft.id DESC
      LIMIT 300
    `,
    )
    .all(...params);
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount) || 0,
    category_label: row.category_label || 'Kategoriyasiz',
    category_key: row.category_key || null,
  }));
}

export function createFinancialTransaction({ payload, actorUserId }) {
  const transactionType = String(payload?.transaction_type || '').trim().toLowerCase();
  if (!['income', 'expense'].includes(transactionType)) {
    return { ok: false, status: 400, error: 'Tranzaksiya turi noto‘g‘ri.' };
  }
  const amount = parsePositiveNumber(payload?.amount);
  if (!amount) {
    return { ok: false, status: 400, error: 'Summa noto‘g‘ri.' };
  }
  const sourceType = String(payload?.source_type || '').trim().toLowerCase() || 'manual';
  const categoryKey = String(payload?.category_key || '').trim().toLowerCase();
  const categoryId = getCategoryIdByKey(transactionType, categoryKey);
  const txDate = String(payload?.transaction_date || '').trim() || toDateOnly();
  const note = String(payload?.note || '').trim();

  const result = db
    .prepare(
      `
      INSERT INTO financial_transactions (
        transaction_type, source_type, category_id, amount, transaction_date, note, created_by, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .run(transactionType, sourceType, categoryId, amount, txDate, note || null, actorUserId || null);
  const entityId = Number(result.lastInsertRowid);
  addAuditLog({
    actorUserId,
    action: 'financial_transaction.create',
    entityType: 'financial_transaction',
    entityId,
    payload: { transactionType, sourceType, amount, txDate, categoryKey, note },
  });

  return {
    ok: true,
    transaction: db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(entityId),
  };
}

export async function recordPayrollPayment({ payload, actorUser }) {
  const employeeId = Number.parseInt(String(payload?.employee_id ?? ''), 10);
  if (!Number.isFinite(employeeId) || employeeId < 1) {
    return { ok: false, status: 400, error: 'Xodim ID noto‘g‘ri.' };
  }
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId);
  if (!employee) return { ok: false, status: 404, error: 'Xodim topilmadi.' };

  const paymentTypeRaw = String(payload?.payment_type || 'auto').trim().toLowerCase();
  const cycleType = paymentTypeRaw === 'advance' ? 'advance' : 'salary';
  const cycle = ensureCycleForCurrentMonth(employee, cycleType);
  recalculatePayrollCycleStatuses(db);
  const refreshedCycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycle.id);
  const maxAllowed = Math.max(Number(refreshedCycle?.remaining_amount) || 0, 0);
  const requestedAmount = parsePositiveNumber(payload?.amount, maxAllowed);
  const amount = Math.min(requestedAmount, maxAllowed || requestedAmount);
  if (!amount) {
    return { ok: false, status: 400, error: 'Ushbu davr uchun qolgan summa yo‘q.' };
  }

  const note = String(payload?.note || '').trim();
  const paymentMethod = String(payload?.payment_method || 'cash').trim().toLowerCase();
  const paymentDate = String(payload?.paid_at || '').trim() || toSqlDateTime();
  const receiptNumber = buildReceiptNumber();
  const operatorName = actorUser?.full_name || actorUser?.login || 'Accounting';
  const dueDate = String(refreshedCycle?.due_date || '');
  const receiptPayload = {
    employee_name: employee.full_name,
    cycle_type: cycleType,
    amount,
    payment_date: paymentDate,
    due_date: dueDate,
    operator_name: operatorName,
  };

  const categoryId = getCategoryIdByKey('expense', 'employee_payroll');
  const transaction = db.transaction(() => {
    const receiptInsert = db
      .prepare(
        `
        INSERT INTO receipts (receipt_number, receipt_type, employee_id, issued_at, payload_json, created_by, created_at)
        VALUES (?, 'salary', ?, ?, ?, ?, datetime('now'))
      `,
      )
      .run(
        receiptNumber,
        employee.id,
        paymentDate,
        JSON.stringify(receiptPayload),
        actorUser?.id ?? null,
      );
    const receiptId = Number(receiptInsert.lastInsertRowid);

    const paymentInsert = db
      .prepare(
        `
        INSERT INTO salary_payments (
          employee_id, payroll_cycle_id, payment_type, amount, payment_status,
          payment_method, paid_at, note, receipt_id, created_by, created_at
        )
        VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, datetime('now'))
      `,
      )
      .run(
        employee.id,
        refreshedCycle.id,
        cycleType,
        amount,
        paymentMethod,
        paymentDate,
        note || null,
        receiptId,
        actorUser?.id ?? null,
      );
    const paymentId = Number(paymentInsert.lastInsertRowid);

    db.prepare(`UPDATE receipts SET salary_payment_id = ? WHERE id = ?`).run(paymentId, receiptId);

    db.prepare(
      `
      INSERT INTO financial_transactions (
        transaction_type, source_type, category_id, amount, transaction_date,
        reference_type, reference_id, note, created_by, created_at
      )
      VALUES ('expense', 'payroll', ?, ?, date(?), 'salary_payment', ?, ?, ?, datetime('now'))
    `,
    ).run(categoryId, amount, paymentDate, paymentId, note || null, actorUser?.id ?? null);

    addAuditLog({
      actorUserId: actorUser?.id ?? null,
      action: 'payroll.payment.create',
      entityType: 'salary_payment',
      entityId: paymentId,
      payload: { employee_id: employee.id, payroll_cycle_id: refreshedCycle.id, amount, cycleType, note },
    });

    return { paymentId, receiptId };
  });

  recalculatePayrollCycleStatuses(db);

  try {
    const pdfPath = await generateReceiptPdf({
      receiptNumber,
      employeeName: employee.full_name,
      cycleType,
      amount,
      paymentDate,
      dueDate,
      operatorName,
    });
    db.prepare(`UPDATE receipts SET pdf_path = ? WHERE id = ?`).run(pdfPath, transaction.receiptId);
  } catch (err) {
    console.warn('[accounting] pdf receipt generation failed:', err?.message || err);
  }

  await sendTelegramPayrollNotification({
    employee,
    paymentAmount: amount,
    cycleType,
    dueDate,
    paymentDate: paymentDate.slice(0, 10),
  });

  const payment = db
    .prepare(
      `
      SELECT
        sp.id,
        sp.amount,
        sp.payment_type,
        sp.payment_status,
        sp.paid_at,
        sp.note,
        r.receipt_number,
        r.pdf_path
      FROM salary_payments sp
      LEFT JOIN receipts r ON r.id = sp.receipt_id
      WHERE sp.id = ?
    `,
    )
    .get(transaction.paymentId);

  return { ok: true, payment };
}

export function getReceiptFileByNumber(receiptNumber) {
  const receipt = db
    .prepare(`SELECT id, receipt_number, pdf_path, payload_json FROM receipts WHERE receipt_number = ?`)
    .get(String(receiptNumber || '').trim());
  if (!receipt) return { ok: false, status: 404, error: 'Kvitansiya topilmadi.' };
  const pdfPath = String(receipt.pdf_path || '').trim();
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return { ok: false, status: 404, error: 'Kvitansiya fayli hali yaratilmagan.' };
  }
  return { ok: true, path: pdfPath, receipt };
}

export function getFinancialReportSummary({ rangeDays = 30 } = {}) {
  const days = normalizeRangeDays(rangeDays);
  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total
      FROM financial_transactions
      WHERE date(transaction_date) >= date('now', '-' || ? || ' days')
    `,
    )
    .get(String(days));
  const expenseByCategory = db
    .prepare(
      `
      SELECT
        COALESCE(ec.label_uz, 'Kategoriyasiz') AS category,
        COALESCE(SUM(ft.amount), 0) AS total
      FROM financial_transactions ft
      LEFT JOIN expense_categories ec ON ec.id = ft.category_id
      WHERE ft.transaction_type = 'expense'
        AND date(ft.transaction_date) >= date('now', '-' || ? || ' days')
      GROUP BY category
      ORDER BY total DESC
    `,
    )
    .all(String(days))
    .map((row) => ({ category: row.category, total: Number(row.total) || 0 }));
  const income = Number(totals?.income_total) || 0;
  const expense = Number(totals?.expense_total) || 0;
  return {
    range_days: days,
    totals: {
      income,
      expense,
      profit: income - expense,
      expense_ratio: income > 0 ? expense / income : 0,
    },
    expense_breakdown: expenseByCategory,
  };
}
