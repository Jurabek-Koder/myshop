const PAYROLL_ADVANCE_RATIO = 0.5;
const PAYROLL_CYCLE_TYPES = ['advance', 'salary'];
const PAYROLL_STATUSES = ['pending', 'paid', 'overdue'];

function toSqlDateTime(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function toDateOnly(date) {
  return toSqlDateTime(date)?.slice(0, 10) || null;
}

function monthEdge(year, monthOneBased) {
  const start = new Date(Date.UTC(year, monthOneBased - 1, 1));
  const end = new Date(Date.UTC(year, monthOneBased, 0));
  return { start, end };
}

function cyclePeriodDates(year, monthOneBased, cycleType) {
  const { start, end } = monthEdge(year, monthOneBased);
  if (cycleType === 'advance') {
    const periodStart = new Date(start);
    const periodEnd = new Date(Date.UTC(year, monthOneBased - 1, 15));
    return {
      periodStart: toDateOnly(periodStart),
      periodEnd: toDateOnly(periodEnd),
      dueDate: toDateOnly(periodEnd),
    };
  }
  return {
    periodStart: toDateOnly(new Date(Date.UTC(year, monthOneBased - 1, 16))),
    periodEnd: toDateOnly(end),
    dueDate: toDateOnly(end),
  };
}

function getCycleGrossAmount(monthlySalary, cycleType) {
  const salary = Number(monthlySalary) || 0;
  const advanceAmount = Math.round(salary * PAYROLL_ADVANCE_RATIO);
  if (cycleType === 'advance') return advanceAmount;
  return Math.max(salary - advanceAmount, 0);
}

function resolveCycleStatus({ dueDate, grossAmount, paidAmount, now = new Date() }) {
  const gross = Number(grossAmount) || 0;
  const paid = Number(paidAmount) || 0;
  if (paid >= gross) return 'paid';
  const due = new Date(`${dueDate}T23:59:59Z`);
  if (Number.isNaN(due.getTime()) || now <= due) return 'pending';
  return 'overdue';
}

function ensurePayrollCycleRows(database, { monthsBack = 1, monthsAhead = 1 } = {}) {
  const employees = database
    .prepare(
      `
      SELECT id, monthly_salary
      FROM employees
      WHERE lower(trim(COALESCE(employment_status, 'active'))) = 'active'
    `,
    )
    .all();
  if (!employees.length) return;

  const insertCycle = database.prepare(
    `
    INSERT OR IGNORE INTO payroll_cycles (
      employee_id,
      cycle_year,
      cycle_month,
      cycle_type,
      period_start,
      period_end,
      due_date,
      gross_amount,
      paid_amount,
      remaining_amount,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', datetime('now'), datetime('now'))
  `,
  );

  const now = new Date();
  const baseYear = now.getUTCFullYear();
  const baseMonth = now.getUTCMonth() + 1;
  for (const employee of employees) {
    for (let offset = -monthsBack; offset <= monthsAhead; offset += 1) {
      const target = new Date(Date.UTC(baseYear, baseMonth - 1 + offset, 1));
      const year = target.getUTCFullYear();
      const month = target.getUTCMonth() + 1;
      for (const cycleType of PAYROLL_CYCLE_TYPES) {
        const grossAmount = getCycleGrossAmount(employee.monthly_salary, cycleType);
        const period = cyclePeriodDates(year, month, cycleType);
        insertCycle.run(
          employee.id,
          year,
          month,
          cycleType,
          period.periodStart,
          period.periodEnd,
          period.dueDate,
          grossAmount,
          grossAmount,
        );
      }
    }
  }
}

export function recalculatePayrollCycleStatuses(database, now = new Date()) {
  const rows = database
    .prepare(
      `
      SELECT
        pc.id,
        pc.due_date,
        pc.gross_amount,
        COALESCE(SUM(CASE WHEN lower(trim(COALESCE(sp.payment_status, ''))) = 'paid' THEN sp.amount ELSE 0 END), 0) AS paid_amount
      FROM payroll_cycles pc
      LEFT JOIN salary_payments sp ON sp.payroll_cycle_id = pc.id
      GROUP BY pc.id
    `,
    )
    .all();
  const updateStmt = database.prepare(
    `
    UPDATE payroll_cycles
    SET
      paid_amount = ?,
      remaining_amount = ?,
      status = ?,
      overdue_at = CASE
        WHEN ? = 'overdue' AND overdue_at IS NULL THEN datetime('now')
        WHEN ? != 'overdue' THEN NULL
        ELSE overdue_at
      END,
      last_calculated_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `,
  );
  for (const row of rows) {
    const paid = Number(row.paid_amount) || 0;
    const gross = Number(row.gross_amount) || 0;
    const remaining = Math.max(gross - paid, 0);
    const status = resolveCycleStatus({
      dueDate: row.due_date,
      grossAmount: gross,
      paidAmount: paid,
      now,
    });
    updateStmt.run(paid, remaining, status, status, status, row.id);
  }
}

function seedAccountingCategories(database) {
  const expenseCategories = [
    ['shop_expense', 'Do‘kon xarajatlari'],
    ['employee_payroll', 'Xodimlar ish haqi'],
    ['utilities', 'Kommunal to‘lovlar'],
    ['transport', 'Transport'],
    ['other_expense', 'Boshqa xarajatlar'],
  ];
  const incomeCategories = [
    ['product_sales', 'Mahsulot savdosi'],
    ['manual_income', 'Qo‘lda kiritilgan daromad'],
    ['service_income', 'Xizmat daromadi'],
  ];
  const insExpense = database.prepare(
    `INSERT OR IGNORE INTO expense_categories (name_key, label_uz, is_system) VALUES (?, ?, 1)`,
  );
  const insIncome = database.prepare(
    `INSERT OR IGNORE INTO income_categories (name_key, label_uz, is_system) VALUES (?, ?, 1)`,
  );
  for (const c of expenseCategories) insExpense.run(c[0], c[1]);
  for (const c of incomeCategories) insIncome.run(c[0], c[1]);
}

function seedAccountingEmployees(database) {
  const users = database
    .prepare(
      `
      SELECT id, full_name, phone
      FROM users
      WHERE lower(trim(COALESCE(role, ''))) IN ('superuser', 'accounting')
         OR role_id = 1
      ORDER BY id
    `,
    )
    .all();
  if (!users.length) return;
  const insertEmployee = database.prepare(
    `
    INSERT OR IGNORE INTO employees (
      user_id,
      full_name,
      position_title,
      phone,
      monthly_salary,
      employment_status,
      hired_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'active', date('now'), datetime('now'), datetime('now'))
  `,
  );
  const updateMissing = database.prepare(
    `
    UPDATE employees
    SET
      full_name = COALESCE(NULLIF(trim(full_name), ''), ?),
      phone = COALESCE(NULLIF(trim(phone), ''), ?),
      updated_at = datetime('now')
    WHERE user_id = ?
  `,
  );
  for (const user of users) {
    const salaryBaseline = 6_000_000 + user.id * 125_000;
    insertEmployee.run(
      user.id,
      user.full_name || `Xodim ${user.id}`,
      user.id === 1 ? 'Boshqaruvchi' : 'Mas’ul xodim',
      user.phone || null,
      salaryBaseline,
    );
    updateMissing.run(user.full_name || null, user.phone || null, user.id);
  }
}

export function initAccountingSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      position_title TEXT,
      phone TEXT,
      monthly_salary REAL NOT NULL DEFAULT 0,
      employment_status TEXT NOT NULL DEFAULT 'active',
      telegram_chat_id TEXT,
      hired_at TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);

    CREATE TABLE IF NOT EXISTS payroll_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      cycle_year INTEGER NOT NULL,
      cycle_month INTEGER NOT NULL,
      cycle_type TEXT NOT NULL CHECK (cycle_type IN ('advance', 'salary')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      due_date TEXT NOT NULL,
      gross_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
      overdue_at TEXT,
      last_calculated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, cycle_year, cycle_month, cycle_type)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_due_date ON payroll_cycles(due_date);
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status ON payroll_cycles(status);

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT UNIQUE NOT NULL,
      receipt_type TEXT NOT NULL DEFAULT 'salary',
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      salary_payment_id INTEGER,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      pdf_path TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_employee ON receipts(employee_id, id DESC);

    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      payroll_cycle_id INTEGER REFERENCES payroll_cycles(id) ON DELETE SET NULL,
      payment_type TEXT NOT NULL DEFAULT 'salary',
      amount REAL NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      payment_method TEXT NOT NULL DEFAULT 'cash',
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT,
      receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON salary_payments(employee_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_cycle ON salary_payments(payroll_cycle_id);

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_key TEXT UNIQUE NOT NULL,
      label_uz TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_key TEXT UNIQUE NOT NULL,
      label_uz TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
      source_type TEXT NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL,
      transaction_date TEXT NOT NULL DEFAULT (date('now')),
      reference_type TEXT,
      reference_id INTEGER,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(transaction_type);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  seedAccountingCategories(database);
  seedAccountingEmployees(database);
  ensurePayrollCycleRows(database);
  recalculatePayrollCycleStatuses(database);
}

export const ACCOUNTING_PAYROLL_STATUSES = PAYROLL_STATUSES;
