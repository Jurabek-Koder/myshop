import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { db } from '../../db/database.js';
import { insertAccountingAudit } from './audit.js';
import { sendAccountingTelegramMessage } from './telegram.js';
import {
  addMonths,
  buildCycleDescriptor,
  buildDateRange,
  clampPercent,
  computeCycleStatus,
  formatMoneyUz,
  labelFromCycleType,
  monthKeyFromDate,
  parseDateInput,
  receiptNumberFromId,
  roundMoney,
  safeJsonParse,
  safeJsonStringify,
  statusLabelUz,
  toSqlDate,
  toSqlDateTime,
} from './utils.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function requirePositiveAmount(value, fieldName = 'amount') {
  const amount = roundMoney(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error(`${fieldName} qiymati musbat bo‘lishi kerak.`);
    error.status = 400;
    throw error;
  }
  return amount;
}

function normalizeEmployeeStatus(value) {
  const status = String(value || 'active').trim().toLowerCase();
  return status === 'inactive' ? 'inactive' : 'active';
}

function normalizeDirection(value) {
  const direction = String(value || '').trim().toLowerCase();
  if (direction !== 'income' && direction !== 'expense') {
    const error = new Error('Yo‘nalish noto‘g‘ri. Faqat income yoki expense bo‘lishi mumkin.');
    error.status = 400;
    throw error;
  }
  return direction;
}

function normalizeCycleType(value) {
  const cycleType = String(value || '').trim().toLowerCase();
  if (cycleType !== 'advance' && cycleType !== 'salary') {
    const error = new Error('Sikl turi noto‘g‘ri. advance yoki salary bo‘lishi kerak.');
    error.status = 400;
    throw error;
  }
  return cycleType;
}

function getEmployeeById(employeeId) {
  const employee = db
    .prepare(
      `
        SELECT e.*, u.full_name AS user_full_name, u.role AS user_role
        FROM employees e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.id = ?
      `,
    )
    .get(employeeId);
  if (!employee) {
    const error = new Error('Xodim topilmadi.');
    error.status = 404;
    throw error;
  }
  return employee;
}

function getCategoryByCode({ direction, code }) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return null;
  if (direction === 'expense') {
    return (
      db
        .prepare(`SELECT * FROM expense_categories WHERE lower(code) = lower(?) LIMIT 1`)
        .get(normalized) || null
    );
  }
  return (
    db
      .prepare(`SELECT * FROM income_categories WHERE lower(code) = lower(?) LIMIT 1`)
      .get(normalized) || null
  );
}

function getCurrentMonthDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { fromDate: toSqlDate(start), toDate: toSqlDate(end) };
}

function buildWhereFromSearch(search, fields) {
  const term = String(search || '').trim();
  if (!term) return { sql: '', params: [] };
  const like = `%${term}%`;
  const sql = ` AND (${fields.map((field) => `${field} LIKE ?`).join(' OR ')})`;
  return { sql, params: new Array(fields.length).fill(like) };
}

function listEmployeesBase({ search = '', status = '' } = {}) {
  const params = [];
  let sql = `
    SELECT e.*, u.full_name AS linked_user_name, u.role AS linked_user_role
    FROM employees e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE 1 = 1
  `;
  if (status) {
    sql += ' AND lower(e.status) = lower(?)';
    params.push(String(status).trim());
  }
  const searchFilter = buildWhereFromSearch(search, ['e.full_name', 'e.role_title', 'e.phone', 'u.full_name']);
  sql += searchFilter.sql;
  params.push(...searchFilter.params);
  sql += ' ORDER BY e.status ASC, e.full_name COLLATE NOCASE ASC, e.id ASC';
  return db.prepare(sql).all(...params);
}

function listCyclesForEmployee(employeeId) {
  return db
    .prepare(
      `
        SELECT *
        FROM payroll_cycles
        WHERE employee_id = ?
        ORDER BY due_date ASC, id ASC
      `,
    )
    .all(employeeId);
}

function listPaymentsForEmployee(employeeId) {
  return db
    .prepare(
      `
        SELECT sp.*, r.id AS receipt_id, r.receipt_number
        FROM salary_payments sp
        LEFT JOIN receipts r ON r.salary_payment_id = sp.id
        WHERE sp.employee_id = ?
        ORDER BY datetime(replace(trim(sp.paid_at), 'T', ' ')) DESC, sp.id DESC
      `,
    )
    .all(employeeId);
}

function ensureFuturePayrollCycles({ referenceDate = new Date() } = {}) {
  const employees = db
    .prepare(
      `
        SELECT *
        FROM employees
        WHERE lower(status) = 'active'
          AND monthly_salary > 0
      `,
    )
    .all();

  const insertCycle = db.prepare(`
    INSERT OR IGNORE INTO payroll_cycles (
      employee_id,
      cycle_key,
      cycle_year,
      cycle_month,
      cycle_type,
      cycle_start_date,
      cycle_end_date,
      due_date,
      gross_amount,
      amount_paid,
      remaining_amount,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', datetime('now'), datetime('now'))
  `);

  let created = 0;
  for (const employee of employees) {
    for (let offset = -1; offset <= 1; offset += 1) {
      const monthDate = addMonths(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1), offset);
      for (const cycleType of ['advance', 'salary']) {
        const descriptor = buildCycleDescriptor(employee, monthDate, cycleType);
        const result = insertCycle.run(
          employee.id,
          descriptor.cycleKey,
          descriptor.cycleYear,
          descriptor.cycleMonth,
          descriptor.cycleType,
          descriptor.cycleStartDate,
          descriptor.cycleEndDate,
          descriptor.dueDate,
          descriptor.grossAmount,
          descriptor.grossAmount,
        );
        created += Number(result.changes || 0);
      }
    }
  }
  return created;
}

function refreshPayrollCycleStates() {
  const cycles = db.prepare(`SELECT id, due_date, gross_amount, amount_paid FROM payroll_cycles`).all();
  const updateCycle = db.prepare(`
    UPDATE payroll_cycles
    SET remaining_amount = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  let updated = 0;
  for (const cycle of cycles) {
    const next = computeCycleStatus({
      dueDate: cycle.due_date,
      grossAmount: cycle.gross_amount,
      amountPaid: cycle.amount_paid,
    });
    const result = updateCycle.run(next.remainingAmount, next.status, cycle.id);
    updated += Number(result.changes || 0);
  }
  return updated;
}

async function dispatchPayrollNotifications() {
  const dueSoonCycles = db
    .prepare(
      `
        SELECT pc.*, e.full_name, e.telegram_chat_id
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE pc.status = 'pending'
          AND pc.remaining_amount > 0
          AND date(pc.due_date) <= date('now', '+1 day')
          AND (pc.reminder_sent_at IS NULL OR trim(pc.reminder_sent_at) = '')
        ORDER BY date(pc.due_date) ASC, pc.id ASC
      `,
    )
    .all();

  const overdueCycles = db
    .prepare(
      `
        SELECT pc.*, e.full_name, e.telegram_chat_id
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE pc.status = 'overdue'
          AND pc.remaining_amount > 0
          AND (pc.overdue_notified_at IS NULL OR trim(pc.overdue_notified_at) = '')
        ORDER BY date(pc.due_date) ASC, pc.id ASC
      `,
    )
    .all();

  const markReminder = db.prepare(`UPDATE payroll_cycles SET reminder_sent_at = datetime('now') WHERE id = ?`);
  const markOverdue = db.prepare(`UPDATE payroll_cycles SET overdue_notified_at = datetime('now') WHERE id = ?`);
  let sent = 0;

  for (const cycle of dueSoonCycles) {
    const message =
      `<b>MyShop · Ish haqi eslatmasi</b>\n` +
      `${cycle.full_name} uchun <b>${labelFromCycleType(cycle.cycle_type)}</b> to‘lovi yaqinlashdi.\n` +
      `Muddat: <b>${cycle.due_date}</b>\n` +
      `Qolgan summa: <b>${formatMoneyUz(cycle.remaining_amount)}</b>`;
    const result = await sendAccountingTelegramMessage({ employee: cycle, text: message });
    if (!result?.skipped) {
      markReminder.run(cycle.id);
      sent += 1;
    }
  }

  for (const cycle of overdueCycles) {
    const message =
      `<b>MyShop · Ish haqi ogohlantirishi</b>\n` +
      `${cycle.full_name} uchun <b>${labelFromCycleType(cycle.cycle_type)}</b> to‘lovi kechikdi.\n` +
      `Muddat: <b>${cycle.due_date}</b>\n` +
      `Qolgan summa: <b>${formatMoneyUz(cycle.remaining_amount)}</b>`;
    const result = await sendAccountingTelegramMessage({ employee: cycle, text: message });
    if (!result?.skipped) {
      markOverdue.run(cycle.id);
      sent += 1;
    }
  }

  return sent;
}

export async function runAccountingAutomation({ actorUserId = null, source = 'system' } = {}) {
  const createdCycles = ensureFuturePayrollCycles();
  const refreshedCycles = refreshPayrollCycleStates();
  const sentNotifications = await dispatchPayrollNotifications();
  if (actorUserId || source !== 'system') {
    insertAccountingAudit({
      actorUserId,
      action: 'automation.run',
      entityType: 'payroll_cycle',
      entityId: null,
      message: 'Ish haqi avtomatik sinxronizatsiyasi ishga tushirildi.',
      payload: { source, createdCycles, refreshedCycles, sentNotifications },
    });
  }
  return { createdCycles, refreshedCycles, sentNotifications };
}

function mapEmployeeSummary(employee) {
  const cycles = listCyclesForEmployee(employee.id);
  const payments = listPaymentsForEmployee(employee.id);
  const openCycles = cycles.filter((cycle) => roundMoney(cycle.remaining_amount) > 0);
  const nextCycle = openCycles.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;
  const lastPayment = payments[0] || null;
  const outstandingBalance = openCycles.reduce((sum, cycle) => sum + toNumber(cycle.remaining_amount), 0);
  return {
    id: employee.id,
    full_name: employee.full_name,
    role_title: employee.role_title,
    phone: employee.phone || '',
    telegram_chat_id: employee.telegram_chat_id || '',
    hire_date: employee.hire_date || '',
    monthly_salary: toNumber(employee.monthly_salary),
    advance_percent: toNumber(employee.advance_percent, 50),
    status: nextCycle?.status || (employee.status === 'inactive' ? 'pending' : 'paid'),
    status_label: nextCycle ? statusLabelUz(nextCycle.status) : 'To‘landi',
    employment_status: employee.status,
    next_payment_date: nextCycle?.due_date || null,
    next_payment_type: nextCycle?.cycle_type || null,
    next_payment_label: nextCycle ? labelFromCycleType(nextCycle.cycle_type) : 'Yakunlangan',
    remaining_balance: roundMoney(outstandingBalance),
    last_payment_amount: lastPayment ? toNumber(lastPayment.amount) : 0,
    last_payment_at: lastPayment?.paid_at || null,
    last_receipt_id: lastPayment?.receipt_id || null,
    notes: employee.notes || '',
  };
}

export async function getDashboardData() {
  await runAccountingAutomation();
  const { fromDate, toDate } = getCurrentMonthDateRange();
  const revenueOrdersRow = db
    .prepare(
      `
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM orders
        WHERE date(substr(created_at, 1, 10)) BETWEEN date(?) AND date(?)
          AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'bekor_qilingan')
      `,
    )
    .get(fromDate, toDate);
  const revenueManualRow = db
    .prepare(
      `
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE direction = 'income'
          AND date(substr(occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
      `,
    )
    .get(fromDate, toDate);
  const expenseRow = db
    .prepare(
      `
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE direction = 'expense'
          AND date(substr(occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
      `,
    )
    .get(fromDate, toDate);
  const payrollRow = db
    .prepare(
      `
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM salary_payments
        WHERE date(substr(paid_at, 1, 10)) BETWEEN date(?) AND date(?)
      `,
    )
    .get(fromDate, toDate);

  const totalRevenue = roundMoney(toNumber(revenueOrdersRow?.total) + toNumber(revenueManualRow?.total));
  const totalExpenses = roundMoney(toNumber(expenseRow?.total));
  const payrollTotal = roundMoney(toNumber(payrollRow?.total));
  const netProfit = roundMoney(totalRevenue - totalExpenses);

  const monthlyRevenueMap = new Map();
  const monthlyExpenseMap = new Map();
  const monthlyPayrollMap = new Map();

  for (let offset = -5; offset <= 0; offset += 1) {
    const monthDate = addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), offset);
    const key = monthKeyFromDate(monthDate);
    monthlyRevenueMap.set(key, 0);
    monthlyExpenseMap.set(key, 0);
    monthlyPayrollMap.set(key, 0);
  }

  const monthlyOrderRevenue = db
    .prepare(
      `
        SELECT substr(created_at, 1, 7) AS month_key, COALESCE(SUM(total_amount), 0) AS total
        FROM orders
        WHERE date(substr(created_at, 1, 10)) >= date('now', 'start of month', '-5 months')
          AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'bekor_qilingan')
        GROUP BY substr(created_at, 1, 7)
      `,
    )
    .all();
  const monthlyManualIncome = db
    .prepare(
      `
        SELECT substr(occurred_at, 1, 7) AS month_key, COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE direction = 'income'
          AND date(substr(occurred_at, 1, 10)) >= date('now', 'start of month', '-5 months')
        GROUP BY substr(occurred_at, 1, 7)
      `,
    )
    .all();
  const monthlyExpenses = db
    .prepare(
      `
        SELECT substr(occurred_at, 1, 7) AS month_key, COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE direction = 'expense'
          AND date(substr(occurred_at, 1, 10)) >= date('now', 'start of month', '-5 months')
        GROUP BY substr(occurred_at, 1, 7)
      `,
    )
    .all();
  const monthlyPayroll = db
    .prepare(
      `
        SELECT substr(paid_at, 1, 7) AS month_key, COALESCE(SUM(amount), 0) AS total
        FROM salary_payments
        WHERE date(substr(paid_at, 1, 10)) >= date('now', 'start of month', '-5 months')
        GROUP BY substr(paid_at, 1, 7)
      `,
    )
    .all();

  for (const row of monthlyOrderRevenue) {
    monthlyRevenueMap.set(row.month_key, roundMoney(toNumber(monthlyRevenueMap.get(row.month_key)) + toNumber(row.total)));
  }
  for (const row of monthlyManualIncome) {
    monthlyRevenueMap.set(row.month_key, roundMoney(toNumber(monthlyRevenueMap.get(row.month_key)) + toNumber(row.total)));
  }
  for (const row of monthlyExpenses) {
    monthlyExpenseMap.set(row.month_key, roundMoney(row.total));
  }
  for (const row of monthlyPayroll) {
    monthlyPayrollMap.set(row.month_key, roundMoney(row.total));
  }

  const monthlySeries = [...monthlyRevenueMap.keys()].map((key) => {
    const revenue = roundMoney(monthlyRevenueMap.get(key));
    const expense = roundMoney(monthlyExpenseMap.get(key));
    const payroll = roundMoney(monthlyPayrollMap.get(key));
    return {
      month_key: key,
      label: key,
      revenue,
      expense,
      payroll,
      profit: roundMoney(revenue - expense),
    };
  });

  const expenseDistribution = db
    .prepare(
      `
        SELECT ec.label_uz AS label, ec.color AS color, COALESCE(SUM(ft.amount), 0) AS total
        FROM financial_transactions ft
        LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
        WHERE ft.direction = 'expense'
          AND date(substr(ft.occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
        GROUP BY ec.id, ec.label_uz, ec.color
        HAVING total > 0
        ORDER BY total DESC
      `,
    )
    .all(fromDate, toDate)
    .map((row) => ({
      label: row.label || 'Belgilanmagan',
      color: row.color || '#64748b',
      total: roundMoney(row.total),
    }));

  const employeeRows = listEmployeesBase();
  const employeeSummaries = employeeRows.map(mapEmployeeSummary);
  const overdueCount = employeeSummaries.filter((row) => row.status === 'overdue').length;
  const pendingCount = employeeSummaries.filter((row) => row.status === 'pending').length;
  const activeEmployees = employeeRows.filter((row) => row.status === 'active').length;

  const recentPayments = db
    .prepare(
      `
        SELECT sp.id, sp.amount, sp.payment_kind, sp.paid_at, e.full_name, r.id AS receipt_id
        FROM salary_payments sp
        INNER JOIN employees e ON e.id = sp.employee_id
        LEFT JOIN receipts r ON r.salary_payment_id = sp.id
        ORDER BY datetime(replace(trim(sp.paid_at), 'T', ' ')) DESC, sp.id DESC
        LIMIT 8
      `,
    )
    .all();
  const recentTransactions = db
    .prepare(
      `
        SELECT id, direction, title, amount, occurred_at
        FROM financial_transactions
        ORDER BY datetime(replace(trim(occurred_at), 'T', ' ')) DESC, id DESC
        LIMIT 8
      `,
    )
    .all();

  const recentActivity = [
    ...recentPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      kind: 'salary_payment',
      title: `${payment.full_name} — ${labelFromCycleType(payment.payment_kind)}`,
      description: 'Ish haqi to‘lovi qayd etildi',
      amount: roundMoney(payment.amount),
      direction: 'expense',
      created_at: payment.paid_at,
      receipt_id: payment.receipt_id || null,
    })),
    ...recentTransactions.map((tx) => ({
      id: `transaction-${tx.id}`,
      kind: tx.direction === 'income' ? 'income' : 'expense',
      title: tx.title,
      description: tx.direction === 'income' ? 'Tushum yozuvi' : 'Xarajat yozuvi',
      amount: roundMoney(tx.amount),
      direction: tx.direction,
      created_at: tx.occurred_at,
      receipt_id: null,
    })),
  ]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10);

  return {
    period: { from: fromDate, to: toDate, label: 'Joriy oy' },
    kpis: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      payroll_total: payrollTotal,
    },
    insights: {
      overdue_payrolls: overdueCount,
      pending_payrolls: pendingCount,
      active_employees: activeEmployees,
      payroll_ratio: totalExpenses > 0 ? roundMoney((payrollTotal / totalExpenses) * 100) : 0,
    },
    charts: {
      monthly_series: monthlySeries,
      expense_distribution: expenseDistribution,
    },
    employees: employeeSummaries.slice(0, 6),
    recent_activity: recentActivity,
    quick_actions: [
      { key: 'add-expense', label: 'Yangi xarajat qo‘shish' },
      { key: 'pay-salary', label: 'Oylik to‘lash' },
      { key: 'advance-payment', label: 'Avans berish' },
      { key: 'export-report', label: 'Hisobot chiqarish' },
    ],
    live_snapshot_at: toSqlDateTime(new Date()),
  };
}

function sanitizeEmployeePayload(payload = {}) {
  const fullName = String(payload.full_name || '').trim();
  if (!fullName) {
    const error = new Error('Xodimning F.I.Sh. kiritilishi shart.');
    error.status = 400;
    throw error;
  }
  return {
    full_name: fullName,
    role_title: String(payload.role_title || 'Xodim').trim() || 'Xodim',
    phone: String(payload.phone || '').trim(),
    telegram_chat_id: String(payload.telegram_chat_id || '').trim(),
    monthly_salary: requirePositiveAmount(payload.monthly_salary, 'monthly_salary'),
    advance_percent: clampPercent(payload.advance_percent, 50),
    status: normalizeEmployeeStatus(payload.status),
    hire_date: toSqlDate(parseDateInput(payload.hire_date, new Date())),
    notes: String(payload.notes || '').trim(),
  };
}

export async function listEmployees({ search = '', status = '' } = {}) {
  await runAccountingAutomation();
  return listEmployeesBase({ search, status }).map(mapEmployeeSummary);
}

export async function createEmployee(payload, actorUserId) {
  const data = sanitizeEmployeePayload(payload);
  const result = db
    .prepare(
      `
        INSERT INTO employees (
          full_name,
          role_title,
          phone,
          telegram_chat_id,
          monthly_salary,
          advance_percent,
          status,
          hire_date,
          notes,
          created_by,
          updated_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
    )
    .run(
      data.full_name,
      data.role_title,
      data.phone,
      data.telegram_chat_id,
      data.monthly_salary,
      data.advance_percent,
      data.status,
      data.hire_date,
      data.notes,
      actorUserId || null,
      actorUserId || null,
    );

  await runAccountingAutomation({ actorUserId, source: 'employee.create' });
  insertAccountingAudit({
    actorUserId,
    action: 'employee.create',
    entityType: 'employee',
    entityId: result.lastInsertRowid,
    message: `${data.full_name} uchun payroll kartasi yaratildi.`,
    payload: data,
  });
  return mapEmployeeSummary(getEmployeeById(result.lastInsertRowid));
}

export async function updateEmployee(employeeId, payload, actorUserId) {
  getEmployeeById(employeeId);
  const data = sanitizeEmployeePayload(payload);
  db.prepare(
    `
      UPDATE employees
      SET full_name = ?,
          role_title = ?,
          phone = ?,
          telegram_chat_id = ?,
          monthly_salary = ?,
          advance_percent = ?,
          status = ?,
          hire_date = ?,
          notes = ?,
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `,
  ).run(
    data.full_name,
    data.role_title,
    data.phone,
    data.telegram_chat_id,
    data.monthly_salary,
    data.advance_percent,
    data.status,
    data.hire_date,
    data.notes,
    actorUserId || null,
    employeeId,
  );

  await runAccountingAutomation({ actorUserId, source: 'employee.update' });
  insertAccountingAudit({
    actorUserId,
    action: 'employee.update',
    entityType: 'employee',
    entityId: employeeId,
    message: `${data.full_name} kartasi yangilandi.`,
    payload: data,
  });
  return mapEmployeeSummary(getEmployeeById(employeeId));
}

function resolvePayrollCycleForPayment({ employeeId, payrollCycleId = null, cycleType = null, paymentDate = new Date() }) {
  if (payrollCycleId) {
    const cycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ? AND employee_id = ?`).get(payrollCycleId, employeeId);
    if (!cycle) {
      const error = new Error('Ish haqi sikli topilmadi.');
      error.status = 404;
      throw error;
    }
    return cycle;
  }

  const normalizedCycleType = normalizeCycleType(cycleType || 'advance');
  const preferredMonthKey = monthKeyFromDate(paymentDate);
  const cycle = db
    .prepare(
      `
        SELECT *
        FROM payroll_cycles
        WHERE employee_id = ?
          AND cycle_type = ?
          AND remaining_amount > 0
        ORDER BY CASE WHEN substr(cycle_key, 1, 7) = ? THEN 0 ELSE 1 END,
                 date(due_date) ASC,
                 id ASC
        LIMIT 1
      `,
    )
    .get(employeeId, normalizedCycleType, preferredMonthKey);

  if (!cycle) {
    const error = new Error('To‘lov uchun ochiq payroll sikli topilmadi.');
    error.status = 400;
    throw error;
  }
  return cycle;
}

function createReceiptForPayment({ paymentId, employee, cycle, amount, actorUserId, paidAt, paymentMethod, paymentNote }) {
  const payload = {
    employee_name: employee.full_name,
    role_title: employee.role_title,
    cycle_type: cycle.cycle_type,
    cycle_due_date: cycle.due_date,
    amount,
    payment_method: paymentMethod,
    payment_note: paymentNote || '',
    paid_at: paidAt,
  };
  const insert = db.prepare(`
    INSERT INTO receipts (
      receipt_number,
      receipt_type,
      employee_id,
      salary_payment_id,
      title,
      recipient_name,
      amount,
      currency,
      issued_at,
      file_format,
      payload_json,
      created_by,
      created_at
    ) VALUES (?, 'payroll', ?, ?, ?, ?, ?, 'UZS', ?, 'pdf', ?, ?, datetime('now'))
  `);
  const placeholderNumber = `TMP-${Date.now()}-${paymentId}`;
  const result = insert.run(
    placeholderNumber,
    employee.id,
    paymentId,
    `${labelFromCycleType(cycle.cycle_type)} kvitansiyasi`,
    employee.full_name,
    amount,
    paidAt,
    safeJsonStringify(payload),
    actorUserId || null,
  );
  const receiptId = result.lastInsertRowid;
  const receiptNumber = receiptNumberFromId(receiptId, paidAt);
  db.prepare(`UPDATE receipts SET receipt_number = ? WHERE id = ?`).run(receiptNumber, receiptId);
  return db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(receiptId);
}

export async function recordSalaryPayment(payload, actorUserId) {
  await runAccountingAutomation();
  const employeeId = Number.parseInt(String(payload?.employee_id || ''), 10);
  if (!Number.isFinite(employeeId) || employeeId < 1) {
    const error = new Error('employee_id noto‘g‘ri.');
    error.status = 400;
    throw error;
  }
  const employee = getEmployeeById(employeeId);
  const paymentDate = parseDateInput(payload?.paid_at, new Date());
  const cycle = resolvePayrollCycleForPayment({
    employeeId,
    payrollCycleId: Number.parseInt(String(payload?.payroll_cycle_id || ''), 10) || null,
    cycleType: payload?.cycle_type,
    paymentDate,
  });
  const amount = requirePositiveAmount(payload?.amount ?? cycle.remaining_amount, 'amount');
  if (amount - toNumber(cycle.remaining_amount) > 0.009) {
    const error = new Error('To‘lov summasi sikldagi qolgan balansdan oshib ketdi.');
    error.status = 400;
    throw error;
  }

  const paymentMethod = String(payload?.payment_method || 'cash').trim() || 'cash';
  const paymentNote = String(payload?.payment_note || '').trim();
  const paidAt = toSqlDateTime(paymentDate);

  const transaction = db.transaction(() => {
    const paymentResult = db
      .prepare(
        `
          INSERT INTO salary_payments (
            employee_id,
            payroll_cycle_id,
            payment_kind,
            amount,
            payment_method,
            payment_note,
            paid_at,
            created_by,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
      )
      .run(
        employee.id,
        cycle.id,
        cycle.cycle_type,
        amount,
        paymentMethod,
        paymentNote,
        paidAt,
        actorUserId || null,
      );

    const nextAmountPaid = roundMoney(toNumber(cycle.amount_paid) + amount);
    const nextState = computeCycleStatus({
      dueDate: cycle.due_date,
      grossAmount: cycle.gross_amount,
      amountPaid: nextAmountPaid,
    });
    db.prepare(
      `
        UPDATE payroll_cycles
        SET amount_paid = ?,
            remaining_amount = ?,
            status = ?,
            last_payment_at = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(nextAmountPaid, nextState.remainingAmount, nextState.status, paidAt, cycle.id);

    const payrollCategory = getCategoryByCode({ direction: 'expense', code: 'employee_payroll' });
    db.prepare(
      `
        INSERT INTO financial_transactions (
          direction,
          source_type,
          title,
          notes,
          amount,
          currency,
          expense_category_id,
          employee_id,
          reference_type,
          reference_id,
          payment_status,
          occurred_at,
          created_by,
          created_at
        ) VALUES ('expense', 'payroll', ?, ?, ?, 'UZS', ?, ?, 'salary_payment', ?, 'posted', ?, ?, datetime('now'))
      `,
    ).run(
      `${employee.full_name} — ${labelFromCycleType(cycle.cycle_type)}`,
      paymentNote || 'Ish haqi avtomatik yozuvi',
      amount,
      payrollCategory?.id || null,
      employee.id,
      paymentResult.lastInsertRowid,
      paidAt,
      actorUserId || null,
    );

    const receipt = createReceiptForPayment({
      paymentId: paymentResult.lastInsertRowid,
      employee,
      cycle,
      amount,
      actorUserId,
      paidAt,
      paymentMethod,
      paymentNote,
    });

    return {
      paymentId: paymentResult.lastInsertRowid,
      receipt,
      nextState,
    };
  });

  const result = transaction();
  await runAccountingAutomation({ actorUserId, source: 'salary.payment' });
  insertAccountingAudit({
    actorUserId,
    action: 'salary_payment.create',
    entityType: 'salary_payment',
    entityId: result.paymentId,
    message: `${employee.full_name} uchun ${labelFromCycleType(cycle.cycle_type)} to‘lovi kiritildi.`,
    payload: {
      employee_id: employee.id,
      payroll_cycle_id: cycle.id,
      amount,
      payment_method: paymentMethod,
      payment_note: paymentNote,
    },
  });

  await sendAccountingTelegramMessage({
    employee,
    text:
      `<b>MyShop · To‘lov qabul qilindi</b>\n` +
      `${employee.full_name} uchun <b>${labelFromCycleType(cycle.cycle_type)}</b> to‘lovi bajarildi.\n` +
      `Summa: <b>${formatMoneyUz(amount)}</b>\n` +
      `Sana: <b>${String(paidAt).slice(0, 10)}</b>`,
  });

  return {
    payment: db
      .prepare(
        `
          SELECT sp.*, r.id AS receipt_id, r.receipt_number
          FROM salary_payments sp
          LEFT JOIN receipts r ON r.salary_payment_id = sp.id
          WHERE sp.id = ?
        `,
      )
      .get(result.paymentId),
    cycle: db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycle.id),
    receipt: result.receipt,
  };
}

export async function getPayrollOverview({ month = '' } = {}) {
  await runAccountingAutomation();
  const baseDate = parseDateInput(month ? `${month}-01` : null, new Date()) || new Date();
  const targetMonthKey = monthKeyFromDate(baseDate);
  const employees = listEmployeesBase().map(mapEmployeeSummary);
  const calendar = db
    .prepare(
      `
        SELECT pc.*, e.full_name, e.role_title
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE substr(pc.cycle_key, 1, 7) = ?
        ORDER BY date(pc.due_date) ASC, e.full_name COLLATE NOCASE ASC
      `,
    )
    .all(targetMonthKey)
    .map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      full_name: row.full_name,
      role_title: row.role_title,
      cycle_type: row.cycle_type,
      cycle_label: labelFromCycleType(row.cycle_type),
      due_date: row.due_date,
      gross_amount: roundMoney(row.gross_amount),
      amount_paid: roundMoney(row.amount_paid),
      remaining_amount: roundMoney(row.remaining_amount),
      status: row.status,
      status_label: statusLabelUz(row.status),
    }));

  const paymentHistory = db
    .prepare(
      `
        SELECT sp.*, e.full_name, e.role_title, r.id AS receipt_id, r.receipt_number
        FROM salary_payments sp
        INNER JOIN employees e ON e.id = sp.employee_id
        LEFT JOIN receipts r ON r.salary_payment_id = sp.id
        ORDER BY datetime(replace(trim(sp.paid_at), 'T', ' ')) DESC, sp.id DESC
        LIMIT 20
      `,
    )
    .all()
    .map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      full_name: row.full_name,
      role_title: row.role_title,
      payment_kind: row.payment_kind,
      payment_label: labelFromCycleType(row.payment_kind),
      amount: roundMoney(row.amount),
      payment_method: row.payment_method,
      payment_note: row.payment_note || '',
      paid_at: row.paid_at,
      receipt_id: row.receipt_id || null,
      receipt_number: row.receipt_number || null,
    }));

  const statusBreakdown = {
    paid: calendar.filter((row) => row.status === 'paid').length,
    pending: calendar.filter((row) => row.status === 'pending').length,
    overdue: calendar.filter((row) => row.status === 'overdue').length,
  };

  return {
    month_key: targetMonthKey,
    summary: {
      active_employees: employees.filter((item) => item.employment_status === 'active').length,
      outstanding_balance: roundMoney(employees.reduce((sum, row) => sum + toNumber(row.remaining_balance), 0)),
      paid_this_month: roundMoney(
        paymentHistory
          .filter((row) => String(row.paid_at || '').startsWith(targetMonthKey))
          .reduce((sum, row) => sum + toNumber(row.amount), 0),
      ),
      ...statusBreakdown,
    },
    employees,
    calendar,
    payment_history: paymentHistory,
  };
}

export async function listTransactions({
  direction = '',
  search = '',
  from = '',
  to = '',
  includeSystemSales = true,
  limit = 100,
} = {}) {
  await runAccountingAutomation();
  const { fromDate, toDate } = buildDateRange({ from, to, days: 30 });
  const params = [fromDate, toDate];
  let sql = `
    SELECT
      ft.*,
      ec.label_uz AS expense_category_label,
      ec.color AS expense_category_color,
      ic.label_uz AS income_category_label,
      ic.color AS income_category_color,
      e.full_name AS employee_name
    FROM financial_transactions ft
    LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
    LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
    LEFT JOIN employees e ON e.id = ft.employee_id
    WHERE date(substr(ft.occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
  `;
  if (direction) {
    sql += ` AND ft.direction = ?`;
    params.push(normalizeDirection(direction));
  }
  const searchFilter = buildWhereFromSearch(search, ['ft.title', 'ft.notes', 'e.full_name', 'ec.label_uz', 'ic.label_uz']);
  sql += searchFilter.sql;
  params.push(...searchFilter.params);
  sql += ` ORDER BY datetime(replace(trim(ft.occurred_at), 'T', ' ')) DESC, ft.id DESC LIMIT ?`;
  params.push(Math.max(1, Number(limit) || 100));

  const rows = db.prepare(sql).all(...params).map((row) => ({
    id: `transaction-${row.id}`,
    raw_id: row.id,
    direction: row.direction,
    source_type: row.source_type,
    title: row.title,
    notes: row.notes || '',
    amount: roundMoney(row.amount),
    occurred_at: row.occurred_at,
    payment_status: row.payment_status,
    category_label:
      row.direction === 'expense'
        ? row.expense_category_label || 'Belgilanmagan'
        : row.income_category_label || 'Belgilanmagan',
    category_color:
      row.direction === 'expense'
        ? row.expense_category_color || '#64748b'
        : row.income_category_color || '#22c55e',
    employee_name: row.employee_name || null,
    reference_type: row.reference_type || null,
    reference_id: row.reference_id || null,
    is_system: row.source_type === 'payroll',
  }));

  const syntheticOrders = includeSystemSales
    ? db
        .prepare(
          `
            SELECT id, total_amount, status, created_at
            FROM orders
            WHERE date(substr(created_at, 1, 10)) BETWEEN date(?) AND date(?)
              AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'bekor_qilingan')
            ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
            LIMIT 30
          `,
        )
        .all(fromDate, toDate)
        .map((order) => ({
          id: `order-${order.id}`,
          raw_id: order.id,
          direction: 'income',
          source_type: 'product_sale',
          title: `Buyurtma #${order.id}`,
          notes: 'Tizimdagi mahsulot savdosidan avtomatik tushum',
          amount: roundMoney(order.total_amount),
          occurred_at: order.created_at,
          payment_status: 'posted',
          category_label: 'Mahsulot savdosi',
          category_color: '#22c55e',
          employee_name: null,
          reference_type: 'order',
          reference_id: order.id,
          is_system: true,
        }))
    : [];

  return [...rows, ...syntheticOrders]
    .filter((row) => {
      if (!search) return true;
      const term = String(search).trim().toLowerCase();
      return (
        String(row.title || '').toLowerCase().includes(term) ||
        String(row.notes || '').toLowerCase().includes(term) ||
        String(row.category_label || '').toLowerCase().includes(term) ||
        String(row.employee_name || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, Math.max(1, Number(limit) || 100));
}

export async function createFinancialTransaction(payload, actorUserId) {
  const direction = normalizeDirection(payload?.direction);
  const amount = requirePositiveAmount(payload?.amount, 'amount');
  const title = String(payload?.title || '').trim();
  if (!title) {
    const error = new Error('Tranzaksiya sarlavhasi kiritilishi shart.');
    error.status = 400;
    throw error;
  }
  const occurredAt = toSqlDateTime(parseDateInput(payload?.occurred_at, new Date()));
  const notes = String(payload?.notes || '').trim();
  const employeeId = Number.parseInt(String(payload?.employee_id || ''), 10) || null;
  const category = getCategoryByCode({
    direction,
    code:
      direction === 'expense'
        ? payload?.expense_category_code || payload?.category_code
        : payload?.income_category_code || payload?.category_code,
  });

  const result = db
    .prepare(
      `
        INSERT INTO financial_transactions (
          direction,
          source_type,
          title,
          notes,
          amount,
          currency,
          expense_category_id,
          income_category_id,
          employee_id,
          reference_type,
          reference_id,
          payment_status,
          occurred_at,
          created_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, 'UZS', ?, ?, ?, ?, ?, 'posted', ?, ?, datetime('now'))
      `,
    )
    .run(
      direction,
      String(payload?.source_type || (direction === 'expense' ? 'manual_expense' : 'manual_income')).trim(),
      title,
      notes,
      amount,
      direction === 'expense' ? category?.id || null : null,
      direction === 'income' ? category?.id || null : null,
      employeeId,
      String(payload?.reference_type || '').trim() || null,
      payload?.reference_id || null,
      occurredAt,
      actorUserId || null,
    );

  insertAccountingAudit({
    actorUserId,
    action: 'financial_transaction.create',
    entityType: 'financial_transaction',
    entityId: result.lastInsertRowid,
    message: `${title} tranzaksiyasi yaratildi.`,
    payload: { direction, amount, occurred_at: occurredAt, employee_id: employeeId, category_code: category?.code || null },
  });

  return (
    db
      .prepare(
        `
          SELECT
            ft.*,
            ec.label_uz AS expense_category_label,
            ic.label_uz AS income_category_label
          FROM financial_transactions ft
          LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
          LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
          WHERE ft.id = ?
        `,
      )
      .get(result.lastInsertRowid) || null
  );
}

export async function getReportsSummary({ from = '', to = '' } = {}) {
  await runAccountingAutomation();
  const { fromDate, toDate } = buildDateRange({ from, to, days: 90 });
  const orderRevenue = toNumber(
    db
      .prepare(
        `
          SELECT COALESCE(SUM(total_amount), 0) AS total
          FROM orders
          WHERE date(substr(created_at, 1, 10)) BETWEEN date(?) AND date(?)
            AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'bekor_qilingan')
        `,
      )
      .get(fromDate, toDate)?.total,
  );
  const incomeTransactions = toNumber(
    db
      .prepare(
        `
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM financial_transactions
          WHERE direction = 'income'
            AND date(substr(occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
        `,
      )
      .get(fromDate, toDate)?.total,
  );
  const expenseTransactions = toNumber(
    db
      .prepare(
        `
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM financial_transactions
          WHERE direction = 'expense'
            AND date(substr(occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
        `,
      )
      .get(fromDate, toDate)?.total,
  );
  const payrollCosts = toNumber(
    db
      .prepare(
        `
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM salary_payments
          WHERE date(substr(paid_at, 1, 10)) BETWEEN date(?) AND date(?)
        `,
      )
      .get(fromDate, toDate)?.total,
  );

  const transactions = await listTransactions({ from: fromDate, to: toDate, includeSystemSales: true, limit: 200 });
  const payrollOverview = await getPayrollOverview({});
  const expenseBreakdown = db
    .prepare(
      `
        SELECT ec.label_uz AS label, COALESCE(SUM(ft.amount), 0) AS total
        FROM financial_transactions ft
        LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
        WHERE ft.direction = 'expense'
          AND date(substr(ft.occurred_at, 1, 10)) BETWEEN date(?) AND date(?)
        GROUP BY ec.id, ec.label_uz
        ORDER BY total DESC
      `,
    )
    .all(fromDate, toDate)
    .map((row) => ({ label: row.label || 'Belgilanmagan', total: roundMoney(row.total) }));

  return {
    period: { from: fromDate, to: toDate },
    summary: {
      total_revenue: roundMoney(orderRevenue + incomeTransactions),
      total_expenses: roundMoney(expenseTransactions),
      net_profit: roundMoney(orderRevenue + incomeTransactions - expenseTransactions),
      payroll_costs: roundMoney(payrollCosts),
      expense_ratio:
        orderRevenue + incomeTransactions > 0
          ? roundMoney((expenseTransactions / (orderRevenue + incomeTransactions)) * 100)
          : 0,
    },
    expense_breakdown: expenseBreakdown,
    payroll: payrollOverview,
    transactions,
  };
}

function createPdfBuffer(writeFn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    writeFn(doc);
    doc.end();
  });
}

export async function buildReportPdfBuffer(report) {
  return createPdfBuffer((doc) => {
    doc.fontSize(18).text('MyShop moliyaviy hisoboti');
    doc.moveDown(0.4);
    doc.fontSize(11).text(`Davr: ${report.period.from} — ${report.period.to}`);
    doc.moveDown();
    doc.fontSize(13).text('Asosiy ko‘rsatkichlar');
    doc.moveDown(0.3);
    doc.fontSize(11);
    doc.text(`Umumiy tushum: ${formatMoneyUz(report.summary.total_revenue)}`);
    doc.text(`Umumiy xarajatlar: ${formatMoneyUz(report.summary.total_expenses)}`);
    doc.text(`Sof foyda: ${formatMoneyUz(report.summary.net_profit)}`);
    doc.text(`Ish haqi xarajatlari: ${formatMoneyUz(report.summary.payroll_costs)}`);
    doc.text(`Xarajat ulushi: ${report.summary.expense_ratio}%`);
    doc.moveDown();
    doc.fontSize(13).text('Xarajatlar tarkibi');
    doc.moveDown(0.3);
    doc.fontSize(10);
    for (const item of report.expense_breakdown.slice(0, 8)) {
      doc.text(`• ${item.label}: ${formatMoneyUz(item.total)}`);
    }
    doc.moveDown();
    doc.fontSize(13).text('So‘nggi payroll to‘lovlari');
    doc.moveDown(0.3);
    doc.fontSize(10);
    for (const row of report.payroll.payment_history.slice(0, 8)) {
      doc.text(`• ${row.full_name} — ${row.payment_label} — ${formatMoneyUz(row.amount)} — ${String(row.paid_at).slice(0, 10)}`);
    }
  });
}

export async function buildReportWorkbookBuffer(report) {
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet([
    {
      'Davr boshi': report.period.from,
      'Davr oxiri': report.period.to,
      'Umumiy tushum': report.summary.total_revenue,
      'Umumiy xarajatlar': report.summary.total_expenses,
      'Sof foyda': report.summary.net_profit,
      'Ish haqi xarajatlari': report.summary.payroll_costs,
      'Xarajat ulushi (%)': report.summary.expense_ratio,
    },
  ]);
  const expenseSheet = XLSX.utils.json_to_sheet(
    report.expense_breakdown.map((item) => ({
      Kategoriya: item.label,
      Summa: item.total,
    })),
  );
  const txSheet = XLSX.utils.json_to_sheet(
    report.transactions.map((row) => ({
      Sana: row.occurred_at,
      Yonalsih: row.direction === 'income' ? 'Tushum' : 'Xarajat',
      Nomi: row.title,
      Kategoriya: row.category_label,
      Summa: row.amount,
      Izoh: row.notes,
    })),
  );
  const payrollSheet = XLSX.utils.json_to_sheet(
    report.payroll.payment_history.map((row) => ({
      Xodim: row.full_name,
      Lavozim: row.role_title,
      Turi: row.payment_label,
      Summa: row.amount,
      Usul: row.payment_method,
      Sana: row.paid_at,
      Kvitansiya: row.receipt_number || '',
    })),
  );
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Umumiy');
  XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Xarajatlar');
  XLSX.utils.book_append_sheet(workbook, txSheet, 'Tranzaksiyalar');
  XLSX.utils.book_append_sheet(workbook, payrollSheet, 'Ish haqi');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function getReceiptById(receiptId) {
  return db
    .prepare(
      `
        SELECT
          r.*,
          e.full_name,
          e.role_title,
          sp.payment_kind,
          sp.payment_method,
          sp.payment_note,
          sp.paid_at,
          pc.cycle_key,
          pc.due_date
        FROM receipts r
        LEFT JOIN employees e ON e.id = r.employee_id
        LEFT JOIN salary_payments sp ON sp.id = r.salary_payment_id
        LEFT JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
        WHERE r.id = ?
      `,
    )
    .get(receiptId);
}

export async function buildReceiptPdfBuffer(receiptId) {
  const receipt = getReceiptById(receiptId);
  if (!receipt) {
    const error = new Error('Kvitansiya topilmadi.');
    error.status = 404;
    throw error;
  }
  const payload = safeJsonParse(receipt.payload_json, {});
  return createPdfBuffer((doc) => {
    doc.fontSize(20).text('MyShop ish haqi kvitansiyasi');
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Kvitansiya raqami: ${receipt.receipt_number}`);
    doc.text(`Berilgan sana: ${String(receipt.issued_at).slice(0, 10)}`);
    doc.moveDown();
    doc.fontSize(13).text('Xodim ma’lumotlari');
    doc.moveDown(0.3);
    doc.fontSize(11);
    doc.text(`F.I.Sh.: ${receipt.full_name || receipt.recipient_name}`);
    doc.text(`Lavozim: ${receipt.role_title || 'Xodim'}`);
    doc.text(`To‘lov turi: ${labelFromCycleType(receipt.payment_kind)}`);
    doc.text(`To‘lov sanasi: ${String(receipt.paid_at || receipt.issued_at).slice(0, 10)}`);
    doc.text(`To‘lov usuli: ${receipt.payment_method === 'card' ? 'Karta' : receipt.payment_method === 'bank_transfer' ? 'Bank o‘tkazmasi' : 'Naqd'}`);
    doc.text(`Muddat: ${receipt.due_date || '-'}`);
    doc.moveDown();
    doc.fontSize(14).text(`Summa: ${formatMoneyUz(receipt.amount)}`);
    if (receipt.payment_note || payload.payment_note) {
      doc.moveDown();
      doc.fontSize(11).text(`Izoh: ${receipt.payment_note || payload.payment_note}`);
    }
    doc.moveDown(2);
    doc.fontSize(10).text('Ushbu kvitansiya MyShop buxgalteriya tizimi tomonidan avtomatik yaratildi.');
  });
}

export async function listActivity({ limit = 50 } = {}) {
  await runAccountingAutomation();
  return db
    .prepare(
      `
        SELECT al.*, u.full_name AS actor_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        ORDER BY datetime(replace(trim(al.created_at), 'T', ' ')) DESC, al.id DESC
        LIMIT ?
      `,
    )
    .all(Math.max(1, Number(limit) || 50))
    .map((row) => ({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      message: row.message,
      actor_name: row.actor_name || 'Tizim',
      payload: safeJsonParse(row.payload_json, {}),
      created_at: row.created_at,
    }));
}

export function getLookupData() {
  const expenseCategories = db.prepare(`SELECT * FROM expense_categories ORDER BY sort_order ASC, id ASC`).all();
  const incomeCategories = db.prepare(`SELECT * FROM income_categories ORDER BY sort_order ASC, id ASC`).all();
  return {
    expense_categories: expenseCategories,
    income_categories: incomeCategories,
  };
}
