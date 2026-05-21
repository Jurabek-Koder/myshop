import axios from 'axios';
import { db } from '../../db/database.js';

const PAYROLL_STATUSES = {
  paid: 'To‘landi',
  pending: 'Kutilmoqda',
  overdue: 'Kechikkan',
};

const SUPPORTED_CYCLE_TYPES = new Set(['advance', 'salary']);
const SUPPORTED_TRANSACTION_TYPES = new Set(['income', 'expense']);
const SUPPORTED_INCOME_SOURCES = new Set(['product_sale', 'manual_income', 'service_income']);
const SUPPORTED_EXPENSE_SOURCES = new Set([
  'shop_expense',
  'employee_payroll',
  'utilities',
  'transport',
  'other_expense',
]);

let payrollSchedulerTimer = null;

function formatDateSql(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateTimeSql(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function monthBounds(year, month) {
  const monthIndex = Math.max(1, Math.min(12, Number(month))) - 1;
  const y = Number(year);
  const start = new Date(y, monthIndex, 1);
  const end = new Date(y, monthIndex + 1, 0);
  const firstCycleEnd = new Date(y, monthIndex, 15);
  const secondCycleStart = new Date(y, monthIndex, 16);
  return {
    start,
    end,
    firstCycleEnd,
    secondCycleStart,
  };
}

function normalizeStatus(status) {
  const key = String(status || 'pending')
    .trim()
    .toLowerCase();
  return PAYROLL_STATUSES[key] ? key : 'pending';
}

function mapPayrollStatusUz(status) {
  const key = normalizeStatus(status);
  return PAYROLL_STATUSES[key] || PAYROLL_STATUSES.pending;
}

function money(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function buildReceiptNumber(id) {
  const stamp = formatDateSql(new Date()).replace(/-/g, '');
  return `MS-${stamp}-${String(id).padStart(6, '0')}`;
}

function ensureAccountingPayrollSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      position_title TEXT NOT NULL DEFAULT 'Mas’ul xodim',
      monthly_salary REAL NOT NULL DEFAULT 0,
      telegram_chat_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(full_name);

    CREATE TABLE IF NOT EXISTS payroll_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      cycle_type TEXT NOT NULL CHECK(cycle_type IN ('advance', 'salary')),
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      due_date TEXT NOT NULL,
      base_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('paid', 'pending', 'overdue')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, year, month, cycle_type)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_employee ON payroll_cycles(employee_id, year DESC, month DESC);
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status ON payroll_cycles(status, due_date ASC);

    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      payroll_cycle_id INTEGER NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('advance', 'salary', 'manual')),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'bank',
      payment_date TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT,
      paid_by_user_id INTEGER REFERENCES users(id),
      receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON salary_payments(employee_id, payment_date DESC);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_cycle ON salary_payments(payroll_cycle_id);

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name_uz TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name_uz TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income', 'expense')),
      source_type TEXT NOT NULL,
      income_category_id INTEGER REFERENCES income_categories(id) ON DELETE SET NULL,
      expense_category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT,
      reference_type TEXT,
      reference_id INTEGER,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_financial_tx_type ON financial_transactions(transaction_type, transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_financial_tx_source ON financial_transactions(source_type, transaction_date DESC);

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT UNIQUE NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      payroll_cycle_id INTEGER REFERENCES payroll_cycles(id) ON DELETE SET NULL,
      salary_payment_id INTEGER REFERENCES salary_payments(id) ON DELETE SET NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_employee ON receipts(employee_id, id DESC);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);
}

function seedCategories() {
  const expenseSeed = [
    ['shop_expense', 'Do‘kon xarajatlari'],
    ['employee_payroll', 'Xodim oyligi'],
    ['utilities', 'Kommunal to‘lovlar'],
    ['transport', 'Transport xarajatlari'],
    ['other_expense', 'Boshqa xarajatlar'],
  ];
  const incomeSeed = [
    ['product_sale', 'Mahsulot savdosi'],
    ['manual_income', 'Qo‘lda kiritilgan tushum'],
    ['service_income', 'Xizmat tushumi'],
  ];
  const insExpense = db.prepare(
    `INSERT OR IGNORE INTO expense_categories (code, name_uz, is_active) VALUES (?, ?, 1)`,
  );
  const insIncome = db.prepare(
    `INSERT OR IGNORE INTO income_categories (code, name_uz, is_active) VALUES (?, ?, 1)`,
  );
  for (const row of expenseSeed) insExpense.run(row[0], row[1]);
  for (const row of incomeSeed) insIncome.run(row[0], row[1]);
}

function writeAuditLog({ actorUserId = null, actionType, entityType, entityId = null, metadata = {} }) {
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, action_type, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(actorUserId, actionType, entityType, entityId, JSON.stringify(metadata || {}));
}

function syncSuperuserEmployees() {
  const defaultSalary = Number(process.env.ACCOUNTING_DEFAULT_EMPLOYEE_SALARY || 6000000);
  const users = db
    .prepare(
      `
      SELECT id, full_name
      FROM users
      WHERE lower(trim(COALESCE(role, ''))) = 'superuser' OR role_id = 1
    `,
    )
    .all();
  const ins = db.prepare(
    `
      INSERT INTO employees (user_id, full_name, monthly_salary, position_title, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'Mas’ul xodim', 1, datetime('now'), datetime('now'))
    `,
  );
  const upd = db.prepare(
    `
      UPDATE employees
      SET full_name = ?, is_active = 1, updated_at = datetime('now')
      WHERE user_id = ?
    `,
  );
  for (const user of users) {
    const existing = db.prepare(`SELECT id FROM employees WHERE user_id = ?`).get(user.id);
    if (!existing) {
      ins.run(user.id, user.full_name || `Xodim ${user.id}`, defaultSalary);
    } else {
      upd.run(user.full_name || `Xodim ${user.id}`, user.id);
    }
  }
}

function ensureCycleRow({ employeeId, monthlySalary, year, month, cycleType }) {
  if (!SUPPORTED_CYCLE_TYPES.has(cycleType)) return;
  const bounds = monthBounds(year, month);
  const baseAmount =
    cycleType === 'advance' ? money(Number(monthlySalary) * 0.5) : money(Number(monthlySalary) * 0.5);
  const existing = db
    .prepare(
      `
      SELECT id, base_amount, paid_amount
      FROM payroll_cycles
      WHERE employee_id = ? AND year = ? AND month = ? AND cycle_type = ?
    `,
    )
    .get(employeeId, year, month, cycleType);

  const periodStart = cycleType === 'advance' ? formatDateSql(bounds.start) : formatDateSql(bounds.secondCycleStart);
  const periodEnd = cycleType === 'advance' ? formatDateSql(bounds.firstCycleEnd) : formatDateSql(bounds.end);
  const dueDate = cycleType === 'advance' ? formatDateSql(bounds.firstCycleEnd) : formatDateSql(bounds.end);

  if (!existing) {
    db.prepare(
      `
      INSERT INTO payroll_cycles (
        employee_id, cycle_type, year, month, period_start, period_end, due_date,
        base_amount, paid_amount, remaining_amount, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', datetime('now'), datetime('now'))
    `,
    ).run(employeeId, cycleType, year, month, periodStart, periodEnd, dueDate, baseAmount, baseAmount);
    return;
  }

  const paid = money(existing.paid_amount);
  const remaining = Math.max(0, money(baseAmount - paid));
  const today = formatDateSql(new Date());
  const status = remaining <= 0 ? 'paid' : dueDate < today ? 'overdue' : 'pending';
  db.prepare(
    `
    UPDATE payroll_cycles
    SET period_start = ?, period_end = ?, due_date = ?,
        base_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `,
  ).run(periodStart, periodEnd, dueDate, baseAmount, remaining, status, existing.id);
}

function recalculateCycleStatus(cycleId) {
  const cycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycleId);
  if (!cycle) return null;
  const paidRow = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM salary_payments WHERE payroll_cycle_id = ?`)
    .get(cycle.id);
  const paidAmount = money(paidRow?.total || 0);
  const remaining = Math.max(0, money(Number(cycle.base_amount || 0) - paidAmount));
  const today = formatDateSql(new Date());
  const status = remaining <= 0 ? 'paid' : String(cycle.due_date || '') < today ? 'overdue' : 'pending';
  db.prepare(
    `
    UPDATE payroll_cycles
    SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `,
  ).run(paidAmount, remaining, status, cycle.id);
  return {
    ...cycle,
    paid_amount: paidAmount,
    remaining_amount: remaining,
    status,
    status_label_uz: mapPayrollStatusUz(status),
  };
}

export function refreshPayrollState() {
  ensureAccountingPayrollSchema();
  seedCategories();
  syncSuperuserEmployees();

  const now = new Date();
  const months = [
    { year: now.getFullYear(), month: now.getMonth() + 1 },
    {
      year: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(),
      month: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1,
    },
  ];
  const employees = db
    .prepare(`SELECT id, monthly_salary FROM employees WHERE is_active = 1 ORDER BY id ASC`)
    .all();
  for (const employee of employees) {
    for (const month of months) {
      ensureCycleRow({
        employeeId: employee.id,
        monthlySalary: employee.monthly_salary,
        year: month.year,
        month: month.month,
        cycleType: 'advance',
      });
      ensureCycleRow({
        employeeId: employee.id,
        monthlySalary: employee.monthly_salary,
        year: month.year,
        month: month.month,
        cycleType: 'salary',
      });
    }
  }
  const ids = db.prepare(`SELECT id FROM payroll_cycles`).all();
  for (const row of ids) {
    recalculateCycleStatus(row.id);
  }
}

export function bootstrapPayrollScheduler() {
  refreshPayrollState();
  if (payrollSchedulerTimer) return;
  payrollSchedulerTimer = setInterval(() => {
    try {
      refreshPayrollState();
    } catch (err) {
      console.error('[accounting-payroll] scheduler error:', err?.message || err);
    }
  }, 6 * 60 * 60 * 1000);
  if (typeof payrollSchedulerTimer.unref === 'function') {
    payrollSchedulerTimer.unref();
  }
}

function sendTelegramMessage(chatId, text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token || !chatId) return Promise.resolve();
  return axios
    .post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
    .catch((err) => {
      console.warn('[accounting-payroll] telegram send failed:', err?.message || err);
    });
}

function payrollCycleRowToView(row) {
  return {
    id: row.id,
    employee_id: row.employee_id,
    cycle_type: row.cycle_type,
    year: row.year,
    month: row.month,
    period_start: row.period_start,
    period_end: row.period_end,
    due_date: row.due_date,
    base_amount: money(row.base_amount),
    paid_amount: money(row.paid_amount),
    remaining_amount: money(row.remaining_amount),
    status: normalizeStatus(row.status),
    status_label_uz: mapPayrollStatusUz(row.status),
  };
}

export function listPayrollEmployees({ search = '' } = {}) {
  refreshPayrollState();
  const q = String(search || '').trim();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const where = q
    ? `WHERE e.is_active = 1 AND (
        lower(e.full_name) LIKE lower(?)
        OR lower(COALESCE(e.position_title, '')) LIKE lower(?)
      )`
    : `WHERE e.is_active = 1`;
  const args = q ? [`%${q}%`, `%${q}%`] : [];
  const rows = db
    .prepare(
      `
      SELECT
        e.*,
        (
          SELECT sp.payment_date
          FROM salary_payments sp
          WHERE sp.employee_id = e.id
          ORDER BY datetime(sp.payment_date) DESC, sp.id DESC
          LIMIT 1
        ) AS last_payment_date,
        (
          SELECT pc.due_date
          FROM payroll_cycles pc
          WHERE pc.employee_id = e.id AND pc.status != 'paid'
          ORDER BY date(pc.due_date) ASC, pc.id ASC
          LIMIT 1
        ) AS next_due_date,
        (
          SELECT pc.status
          FROM payroll_cycles pc
          WHERE pc.employee_id = e.id AND pc.status != 'paid'
          ORDER BY date(pc.due_date) ASC, pc.id ASC
          LIMIT 1
        ) AS next_status,
        (
          SELECT COALESCE(SUM(pc.remaining_amount), 0)
          FROM payroll_cycles pc
          WHERE pc.employee_id = e.id
            AND pc.year = ?
            AND pc.month = ?
        ) AS remaining_month_balance
      FROM employees e
      ${where}
      ORDER BY e.full_name COLLATE NOCASE ASC
    `,
    )
    .all(currentYear, currentMonth, ...args);

  const cyclesByEmployeeStmt = db.prepare(
    `
    SELECT *
    FROM payroll_cycles
    WHERE employee_id = ? AND year = ? AND month = ?
    ORDER BY CASE cycle_type WHEN 'advance' THEN 0 ELSE 1 END
  `,
  );

  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    position_title: row.position_title,
    monthly_salary: money(row.monthly_salary),
    last_payment_date: row.last_payment_date,
    next_payment_date: row.next_due_date || null,
    remaining_balance: money(row.remaining_month_balance),
    status: normalizeStatus(row.next_status || 'pending'),
    status_label_uz: mapPayrollStatusUz(row.next_status || 'pending'),
    telegram_chat_id: row.telegram_chat_id || null,
    cycles: cyclesByEmployeeStmt.all(row.id, currentYear, currentMonth).map(payrollCycleRowToView),
  }));
}

export function listPayrollCycles({ year, month, employeeId = null } = {}) {
  refreshPayrollState();
  const now = new Date();
  const y = Number.isFinite(Number(year)) ? Number(year) : now.getFullYear();
  const m = Number.isFinite(Number(month)) ? Number(month) : now.getMonth() + 1;
  const hasEmployee = Number.isFinite(Number(employeeId)) && Number(employeeId) > 0;
  const rows = db
    .prepare(
      `
      SELECT pc.*, e.full_name, e.monthly_salary
      FROM payroll_cycles pc
      INNER JOIN employees e ON e.id = pc.employee_id
      WHERE pc.year = ? AND pc.month = ?
      ${hasEmployee ? 'AND pc.employee_id = ?' : ''}
      ORDER BY date(pc.due_date) ASC, e.full_name COLLATE NOCASE ASC
    `,
    )
    .all(...(hasEmployee ? [y, m, Number(employeeId)] : [y, m]));
  return rows.map((row) => ({
    ...payrollCycleRowToView(row),
    employee_name: row.full_name,
    monthly_salary: money(row.monthly_salary),
  }));
}

function getCategoryId(type, code) {
  if (!code) return null;
  if (type === 'income') {
    const row = db.prepare(`SELECT id FROM income_categories WHERE code = ?`).get(code);
    return row?.id ?? null;
  }
  const row = db.prepare(`SELECT id FROM expense_categories WHERE code = ?`).get(code);
  return row?.id ?? null;
}

function createReceiptPayload(paymentRow, cycleRow, employeeRow) {
  const cycleTypeUz = cycleRow.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi';
  return {
    employee_name: employeeRow.full_name,
    cycle_type: cycleRow.cycle_type,
    cycle_type_uz: cycleTypeUz,
    period_start: cycleRow.period_start,
    period_end: cycleRow.period_end,
    amount: money(paymentRow.amount),
    payment_method: paymentRow.payment_method,
    payment_date: paymentRow.payment_date,
    note: paymentRow.note || '',
  };
}

export async function createSalaryPayment({
  employeeId,
  payrollCycleId,
  amount,
  paymentMethod = 'bank',
  paymentType,
  note = '',
  actorUserId = null,
}) {
  refreshPayrollState();
  const tx = db.transaction(() => {
    const employee = db.prepare(`SELECT * FROM employees WHERE id = ? AND is_active = 1`).get(employeeId);
    if (!employee) {
      throw new Error('Xodim topilmadi yoki faol emas.');
    }
    const cycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(payrollCycleId);
    if (!cycle || Number(cycle.employee_id) !== Number(employee.id)) {
      throw new Error('Ish haqi sikli topilmadi.');
    }

    const recalculatedBefore = recalculateCycleStatus(cycle.id);
    const remainingBefore = money(recalculatedBefore?.remaining_amount || cycle.remaining_amount || 0);
    if (remainingBefore <= 0) {
      throw new Error('Bu sikl bo‘yicha to‘liq to‘langan.');
    }

    const requestedAmount =
      amount == null || String(amount).trim() === '' ? remainingBefore : money(Number(amount || 0));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new Error('To‘lov summasi musbat son bo‘lishi kerak.');
    }
    if (requestedAmount - remainingBefore > 0.0001) {
      throw new Error('To‘lov summasi qolgan balansdan oshib ketdi.');
    }

    const normalizedPaymentType = SUPPORTED_CYCLE_TYPES.has(paymentType)
      ? paymentType
      : cycle.cycle_type === 'advance'
        ? 'advance'
        : 'salary';
    const paymentDate = formatDateTimeSql(new Date());
    const paymentInsert = db
      .prepare(
        `
        INSERT INTO salary_payments (
          employee_id, payroll_cycle_id, payment_type, amount,
          payment_method, payment_date, note, paid_by_user_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      )
      .run(
        employee.id,
        cycle.id,
        normalizedPaymentType,
        requestedAmount,
        String(paymentMethod || 'bank'),
        paymentDate,
        String(note || '').trim(),
        actorUserId,
      );
    const paymentId = Number(paymentInsert.lastInsertRowid);
    const payment = db.prepare(`SELECT * FROM salary_payments WHERE id = ?`).get(paymentId);

    const cycleAfter = recalculateCycleStatus(cycle.id);
    const payload = createReceiptPayload(payment, cycleAfter, employee);
    const receiptInsert = db
      .prepare(
        `
        INSERT INTO receipts (
          receipt_number, employee_id, payroll_cycle_id, salary_payment_id, issued_at, payload_json, created_at
        )
        VALUES (?, ?, ?, ?, datetime('now'), ?, datetime('now'))
      `,
      )
      .run(`temp-${paymentId}`, employee.id, cycle.id, paymentId, JSON.stringify(payload));
    const receiptId = Number(receiptInsert.lastInsertRowid);
    const receiptNumber = buildReceiptNumber(receiptId);
    db.prepare(`UPDATE receipts SET receipt_number = ? WHERE id = ?`).run(receiptNumber, receiptId);
    db.prepare(`UPDATE salary_payments SET receipt_id = ? WHERE id = ?`).run(receiptId, paymentId);

    const payrollExpenseCategory = getCategoryId('expense', 'employee_payroll');
    db.prepare(
      `
      INSERT INTO financial_transactions (
        transaction_type, source_type, expense_category_id, amount, transaction_date,
        note, reference_type, reference_id, created_by_user_id, created_at
      )
      VALUES ('expense', 'employee_payroll', ?, ?, ?, ?, 'salary_payment', ?, ?, datetime('now'))
    `,
    ).run(
      payrollExpenseCategory,
      requestedAmount,
      paymentDate,
      `${employee.full_name} uchun ${cycleAfter.cycle_type === 'advance' ? 'avans' : 'oylik'} to‘lovi`,
      paymentId,
      actorUserId,
    );

    writeAuditLog({
      actorUserId,
      actionType: 'salary_payment.created',
      entityType: 'salary_payment',
      entityId: paymentId,
      metadata: {
        employee_id: employee.id,
        payroll_cycle_id: cycle.id,
        amount: requestedAmount,
        receipt_id: receiptId,
      },
    });

    return {
      employee,
      cycle: cycleAfter,
      payment: {
        ...payment,
        receipt_id: receiptId,
      },
      receipt: {
        id: receiptId,
        receipt_number: receiptNumber,
      },
    };
  });

  const result = tx();
  const chatId = result.employee.telegram_chat_id || process.env.ACCOUNTING_TELEGRAM_CHAT_ID;
  const cycleTitle = result.cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi';
  await sendTelegramMessage(
    chatId,
    `💼 <b>Ish haqi to‘lovi</b>\n` +
      `Xodim: <b>${result.employee.full_name}</b>\n` +
      `Turi: ${cycleTitle}\n` +
      `Summa: <b>${money(result.payment.amount).toLocaleString('uz-UZ')} so‘m</b>\n` +
      `Chek: ${result.receipt.receipt_number}`,
  );

  return {
    employee_id: result.employee.id,
    payroll_cycle: payrollCycleRowToView(result.cycle),
    payment: {
      id: result.payment.id,
      employee_id: result.payment.employee_id,
      payroll_cycle_id: result.payment.payroll_cycle_id,
      payment_type: result.payment.payment_type,
      amount: money(result.payment.amount),
      payment_method: result.payment.payment_method,
      payment_date: result.payment.payment_date,
      note: result.payment.note || '',
      receipt_id: result.payment.receipt_id,
    },
    receipt: result.receipt,
  };
}

export function createFinancialTransaction({
  transactionType,
  sourceType,
  amount,
  transactionDate,
  note = '',
  categoryCode = '',
  actorUserId = null,
}) {
  refreshPayrollState();
  const txType = String(transactionType || '')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_TRANSACTION_TYPES.has(txType)) {
    throw new Error('transaction_type noto‘g‘ri.');
  }
  const source = String(sourceType || '')
    .trim()
    .toLowerCase();
  if (txType === 'income' && !SUPPORTED_INCOME_SOURCES.has(source)) {
    throw new Error('income source noto‘g‘ri.');
  }
  if (txType === 'expense' && !SUPPORTED_EXPENSE_SOURCES.has(source)) {
    throw new Error('expense source noto‘g‘ri.');
  }
  const value = money(Number(amount));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount musbat son bo‘lishi kerak.');
  }
  const dt = transactionDate ? formatDateTimeSql(transactionDate) : formatDateTimeSql(new Date());
  const incomeCategoryId = txType === 'income' ? getCategoryId('income', categoryCode || source) : null;
  const expenseCategoryId = txType === 'expense' ? getCategoryId('expense', categoryCode || source) : null;

  const ins = db
    .prepare(
      `
      INSERT INTO financial_transactions (
        transaction_type, source_type, income_category_id, expense_category_id,
        amount, transaction_date, note, created_by_user_id, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .run(txType, source, incomeCategoryId, expenseCategoryId, value, dt, String(note || '').trim(), actorUserId);

  writeAuditLog({
    actorUserId,
    actionType: 'financial_transaction.created',
    entityType: 'financial_transaction',
    entityId: Number(ins.lastInsertRowid),
    metadata: {
      transaction_type: txType,
      source_type: source,
      amount: value,
    },
  });

  return db
    .prepare(
      `
      SELECT
        ft.*,
        ic.name_uz AS income_category_name,
        ec.name_uz AS expense_category_name
      FROM financial_transactions ft
      LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
      LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
      WHERE ft.id = ?
    `,
    )
    .get(Number(ins.lastInsertRowid));
}

function buildTransactionWhere({ type, search, fromDate, toDate, source }) {
  const clauses = [];
  const args = [];
  if (type) {
    clauses.push(`ft.transaction_type = ?`);
    args.push(type);
  }
  if (source) {
    clauses.push(`ft.source_type = ?`);
    args.push(source);
  }
  if (fromDate) {
    clauses.push(`date(ft.transaction_date) >= date(?)`);
    args.push(fromDate);
  }
  if (toDate) {
    clauses.push(`date(ft.transaction_date) <= date(?)`);
    args.push(toDate);
  }
  if (search) {
    clauses.push(`lower(COALESCE(ft.note, '')) LIKE lower(?)`);
    args.push(`%${search}%`);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    args,
  };
}

export function listFinancialTransactions({
  type = '',
  search = '',
  source = '',
  fromDate = '',
  toDate = '',
  limit = 200,
} = {}) {
  refreshPayrollState();
  const cleanType = String(type || '')
    .trim()
    .toLowerCase();
  const cleanSource = String(source || '')
    .trim()
    .toLowerCase();
  const cleanSearch = String(search || '').trim();
  const l = Math.max(1, Math.min(1000, Number(limit) || 200));
  const wherePart = buildTransactionWhere({
    type: cleanType || null,
    source: cleanSource || null,
    search: cleanSearch || null,
    fromDate: fromDate || null,
    toDate: toDate || null,
  });
  return db
    .prepare(
      `
      SELECT
        ft.*,
        ic.name_uz AS income_category_name,
        ec.name_uz AS expense_category_name
      FROM financial_transactions ft
      LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
      LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
      ${wherePart.where}
      ORDER BY datetime(ft.transaction_date) DESC, ft.id DESC
      LIMIT ${l}
    `,
    )
    .all(...wherePart.args)
    .map((row) => ({
      ...row,
      amount: money(row.amount),
    }));
}

export function listReceipts({ search = '', limit = 200 } = {}) {
  refreshPayrollState();
  const cleanSearch = String(search || '').trim();
  const l = Math.max(1, Math.min(1000, Number(limit) || 200));
  const where = cleanSearch
    ? `WHERE lower(r.receipt_number) LIKE lower(?) OR lower(e.full_name) LIKE lower(?)`
    : '';
  const args = cleanSearch ? [`%${cleanSearch}%`, `%${cleanSearch}%`] : [];
  return db
    .prepare(
      `
      SELECT
        r.*,
        e.full_name,
        sp.payment_date,
        sp.amount AS payment_amount
      FROM receipts r
      INNER JOIN employees e ON e.id = r.employee_id
      LEFT JOIN salary_payments sp ON sp.id = r.salary_payment_id
      ${where}
      ORDER BY r.id DESC
      LIMIT ${l}
    `,
    )
    .all(...args)
    .map((row) => {
      let payload = {};
      try {
        payload = JSON.parse(String(row.payload_json || '{}'));
      } catch {
        payload = {};
      }
      return {
        id: row.id,
        receipt_number: row.receipt_number,
        employee_name: row.full_name,
        issued_at: row.issued_at,
        payment_date: row.payment_date,
        payment_amount: money(row.payment_amount),
        payload,
      };
    });
}

export function getReceiptById(receiptId) {
  refreshPayrollState();
  const row = db
    .prepare(
      `
      SELECT
        r.*,
        e.full_name,
        e.position_title,
        pc.cycle_type,
        pc.period_start,
        pc.period_end,
        sp.amount AS payment_amount,
        sp.payment_method,
        sp.payment_date
      FROM receipts r
      INNER JOIN employees e ON e.id = r.employee_id
      LEFT JOIN payroll_cycles pc ON pc.id = r.payroll_cycle_id
      LEFT JOIN salary_payments sp ON sp.id = r.salary_payment_id
      WHERE r.id = ?
    `,
    )
    .get(receiptId);
  if (!row) return null;
  let payload = {};
  try {
    payload = JSON.parse(String(row.payload_json || '{}'));
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    receipt_number: row.receipt_number,
    employee_name: row.full_name,
    position_title: row.position_title,
    cycle_type: row.cycle_type,
    cycle_type_uz: row.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi',
    period_start: row.period_start,
    period_end: row.period_end,
    payment_amount: money(row.payment_amount),
    payment_method: row.payment_method,
    payment_date: row.payment_date,
    issued_at: row.issued_at,
    payload,
  };
}

export function listActivityLogs({ limit = 100 } = {}) {
  refreshPayrollState();
  const l = Math.max(1, Math.min(1000, Number(limit) || 100));
  return db
    .prepare(
      `
      SELECT
        al.*,
        u.full_name AS actor_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_user_id
      ORDER BY al.id DESC
      LIMIT ${l}
    `,
    )
    .all()
    .map((row) => {
      let meta = {};
      try {
        meta = JSON.parse(String(row.metadata_json || '{}'));
      } catch {
        meta = {};
      }
      return {
        id: row.id,
        actor_user_id: row.actor_user_id,
        actor_name: row.actor_name || 'Tizim',
        action_type: row.action_type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        metadata: meta,
        created_at: row.created_at,
      };
    });
}

export function getReportsSummary({ fromDate = '', toDate = '' } = {}) {
  refreshPayrollState();
  const rangeWhere = buildTransactionWhere({
    fromDate: fromDate || null,
    toDate: toDate || null,
  });
  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN source_type = 'employee_payroll' THEN amount ELSE 0 END), 0) AS payroll_expense
      FROM financial_transactions ft
      ${rangeWhere.where}
    `,
    )
    .get(...rangeWhere.args);

  const categoryBreakdown = db
    .prepare(
      `
      SELECT
        ft.transaction_type,
        ft.source_type,
        COALESCE(ic.name_uz, ec.name_uz, ft.source_type) AS category_name,
        COALESCE(SUM(ft.amount), 0) AS total
      FROM financial_transactions ft
      LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
      LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
      ${rangeWhere.where}
      GROUP BY ft.transaction_type, ft.source_type, category_name
      ORDER BY total DESC
    `,
    )
    .all(...rangeWhere.args)
    .map((row) => ({
      ...row,
      total: money(row.total),
    }));

  const monthlyBalance = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', ft.transaction_date) AS month_key,
        COALESCE(SUM(CASE WHEN ft.transaction_type = 'income' THEN ft.amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN ft.transaction_type = 'expense' THEN ft.amount ELSE 0 END), 0) AS expense_total
      FROM financial_transactions ft
      ${rangeWhere.where}
      GROUP BY month_key
      ORDER BY month_key ASC
    `,
    )
    .all(...rangeWhere.args)
    .map((row) => ({
      month_key: row.month_key,
      income_total: money(row.income_total),
      expense_total: money(row.expense_total),
      net_profit: money(row.income_total - row.expense_total),
    }));

  const totalIncome = money(totals?.total_income || 0);
  const totalExpense = money(totals?.total_expense || 0);
  const payrollExpense = money(totals?.payroll_expense || 0);
  const netProfit = money(totalIncome - totalExpense);
  const expenseRatio = totalIncome > 0 ? money((totalExpense / totalIncome) * 100) : 0;

  return {
    totals: {
      total_income: totalIncome,
      total_expense: totalExpense,
      payroll_expense: payrollExpense,
      net_profit: netProfit,
      expense_ratio: expenseRatio,
    },
    category_breakdown: categoryBreakdown,
    monthly_balance: monthlyBalance,
  };
}

export function getDashboardOverview({ rangeDays = 90 } = {}) {
  refreshPayrollState();
  const days = Math.max(7, Math.min(365, Number(rangeDays) || 90));
  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total,
        COALESCE(SUM(CASE WHEN source_type = 'employee_payroll' THEN amount ELSE 0 END), 0) AS payroll_total
      FROM financial_transactions
      WHERE date(transaction_date) >= date('now', '-' || ? || ' days')
    `,
    )
    .get(String(days));

  const trendRows = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m', transaction_date) AS month_key,
        COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total,
        COALESCE(SUM(CASE WHEN source_type = 'employee_payroll' THEN amount ELSE 0 END), 0) AS payroll_total
      FROM financial_transactions
      WHERE date(transaction_date) >= date('now', '-365 days')
      GROUP BY month_key
      ORDER BY month_key ASC
    `,
    )
    .all()
    .map((row) => ({
      month_key: row.month_key,
      income_total: money(row.income_total),
      expense_total: money(row.expense_total),
      payroll_total: money(row.payroll_total),
      profit_total: money(row.income_total - row.expense_total),
    }));

  const payrollStats = db
    .prepare(
      `
      SELECT
        status,
        COUNT(*) AS count_total,
        COALESCE(SUM(remaining_amount), 0) AS remaining_total
      FROM payroll_cycles
      GROUP BY status
    `,
    )
    .all()
    .map((row) => ({
      status: normalizeStatus(row.status),
      status_label_uz: mapPayrollStatusUz(row.status),
      count_total: Number(row.count_total) || 0,
      remaining_total: money(row.remaining_total),
    }));

  const recentTransactions = db
    .prepare(
      `
      SELECT
        id,
        transaction_type,
        source_type,
        amount,
        transaction_date,
        note
      FROM financial_transactions
      ORDER BY datetime(transaction_date) DESC, id DESC
      LIMIT 8
    `,
    )
    .all();
  const recentPayments = db
    .prepare(
      `
      SELECT
        sp.id,
        e.full_name,
        sp.payment_type,
        sp.amount,
        sp.payment_date
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      ORDER BY datetime(sp.payment_date) DESC, sp.id DESC
      LIMIT 8
    `,
    )
    .all();

  const activityFeed = [
    ...recentTransactions.map((item) => ({
      id: `tx-${item.id}`,
      type: 'transaction',
      title:
        item.transaction_type === 'income'
          ? 'Yangi tushum qo‘shildi'
          : item.source_type === 'employee_payroll'
            ? 'Ish haqi xarajati qayd etildi'
            : 'Yangi xarajat qo‘shildi',
      description: item.note || item.source_type,
      amount: money(item.amount),
      occurred_at: item.transaction_date,
    })),
    ...recentPayments.map((item) => ({
      id: `pay-${item.id}`,
      type: 'payment',
      title: `${item.payment_type === 'advance' ? 'Avans' : 'Oylik'} to‘lovi`,
      description: item.full_name,
      amount: money(item.amount),
      occurred_at: item.payment_date,
    })),
  ]
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, 12);

  const income = money(totals?.income_total || 0);
  const expense = money(totals?.expense_total || 0);
  const payrollCost = money(totals?.payroll_total || 0);
  const profit = money(income - expense);

  return {
    kpis: {
      total_income: income,
      total_expense: expense,
      net_profit: profit,
      payroll_cost: payrollCost,
    },
    charts: {
      monthly_trends: trendRows,
      expense_trends: trendRows.map((x) => ({ month_key: x.month_key, value: x.expense_total })),
      payroll_analytics: trendRows.map((x) => ({ month_key: x.month_key, value: x.payroll_total })),
      profit_growth: trendRows.map((x) => ({ month_key: x.month_key, value: x.profit_total })),
    },
    payroll_statuses: payrollStats,
    activity_feed: activityFeed,
  };
}

export function exportTransactionsCsv({ fromDate = '', toDate = '' } = {}) {
  const rows = listFinancialTransactions({
    fromDate,
    toDate,
    limit: 5000,
  });
  const header = ['ID', 'Turi', 'Manba', 'Kategoriya', 'Summa', 'Sana', 'Izoh'];
  const lines = [header.join(',')];
  for (const row of rows) {
    const category = row.income_category_name || row.expense_category_name || row.source_type;
    lines.push(
      [
        row.id,
        row.transaction_type,
        row.source_type,
        `"${String(category || '').replaceAll('"', '""')}"`,
        row.amount,
        row.transaction_date,
        `"${String(row.note || '').replaceAll('"', '""')}"`,
      ].join(','),
    );
  }
  return lines.join('\n');
}

