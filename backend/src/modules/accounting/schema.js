const DEFAULT_EXPENSE_CATEGORIES = [
  { code: 'shop_expense', labelUz: 'Do‘kon xarajatlari', color: '#fb7185', icon: 'shopping-bag', sortOrder: 1 },
  { code: 'employee_payroll', labelUz: 'Xodim oyligi', color: '#8b5cf6', icon: 'wallet', sortOrder: 2 },
  { code: 'utilities', labelUz: 'Kommunal to‘lovlar', color: '#0ea5e9', icon: 'zap', sortOrder: 3 },
  { code: 'transport', labelUz: 'Transport', color: '#f59e0b', icon: 'truck', sortOrder: 4 },
  { code: 'other', labelUz: 'Boshqa xarajatlar', color: '#64748b', icon: 'file-text', sortOrder: 5 },
];

const DEFAULT_INCOME_CATEGORIES = [
  { code: 'product_sale', labelUz: 'Mahsulot savdosi', color: '#22c55e', icon: 'shopping-cart', sortOrder: 1 },
  { code: 'manual_income', labelUz: 'Qo‘lda kiritilgan tushum', color: '#38bdf8', icon: 'plus-circle', sortOrder: 2 },
  { code: 'service_income', labelUz: 'Xizmat tushumi', color: '#a855f7', icon: 'briefcase', sortOrder: 3 },
];

const DEFAULT_BOOTSTRAP_SALARIES = {
  superuser: 12000000,
  accounting: 8500000,
};

function ensurePages(db) {
  const pageRows = [
    ['/accounting/payroll', 'Ish haqi boshqaruvi'],
    ['/accounting/transactions', 'Kirim-chiqimlar'],
    ['/accounting/reports', 'Moliyaviy hisobotlar'],
    ['/accounting/employees', 'Mas’ul xodimlar'],
    ['/accounting/activity', 'Faollik jurnali'],
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)');
  for (const row of pageRows) stmt.run(...row);
}

function ensureExpenseCategories(db) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO expense_categories (code, label_uz, color, icon, sort_order, is_system)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const item of DEFAULT_EXPENSE_CATEGORIES) {
    stmt.run(item.code, item.labelUz, item.color, item.icon, item.sortOrder);
  }
}

function ensureIncomeCategories(db) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO income_categories (code, label_uz, color, icon, sort_order, is_system)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const item of DEFAULT_INCOME_CATEGORIES) {
    stmt.run(item.code, item.labelUz, item.color, item.icon, item.sortOrder);
  }
}

function bootstrapEmployees(db) {
  const existingCount = Number(db.prepare('SELECT COUNT(*) AS c FROM employees').get()?.c || 0);
  if (existingCount > 0) return;

  const users = db
    .prepare(
      `
      SELECT id, full_name, phone, role
      FROM users
      WHERE lower(trim(COALESCE(role, ''))) IN ('superuser', 'accounting')
      ORDER BY CASE WHEN lower(trim(role)) = 'superuser' THEN 0 ELSE 1 END, id ASC
    `,
    )
    .all();

  if (!users.length) return;

  const insertEmployee = db.prepare(`
    INSERT INTO employees (
      user_id,
      full_name,
      role_title,
      phone,
      monthly_salary,
      advance_percent,
      status,
      notes,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 50, 'active', ?, datetime('now'), datetime('now'))
  `);

  for (const user of users) {
    const role = String(user.role || '').trim().toLowerCase();
    const roleTitle = role === 'superuser' ? 'Boshqaruvchi' : 'Buxgalter';
    const defaultSalary = DEFAULT_BOOTSTRAP_SALARIES[role] || 0;
    insertEmployee.run(
      user.id,
      user.full_name || roleTitle,
      roleTitle,
      user.phone || '',
      defaultSalary,
      'Tizim ishga tushganda avtomatik import qilindi. Istalgan payt tahrirlash mumkin.',
    );
  }
}

export function initAccountingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      work_role_id INTEGER REFERENCES work_roles(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      role_title TEXT NOT NULL DEFAULT 'Xodim',
      phone TEXT NOT NULL DEFAULT '',
      telegram_chat_id TEXT,
      monthly_salary REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'UZS',
      cycle_mode TEXT NOT NULL DEFAULT 'semi_monthly',
      advance_percent REAL NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'active',
      hire_date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user_unique
      ON employees(user_id)
      WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(full_name);

    CREATE TABLE IF NOT EXISTS payroll_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      cycle_key TEXT NOT NULL,
      cycle_year INTEGER NOT NULL,
      cycle_month INTEGER NOT NULL,
      cycle_type TEXT NOT NULL CHECK (cycle_type IN ('advance', 'salary')),
      cycle_start_date TEXT NOT NULL,
      cycle_end_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      gross_amount REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reminder_sent_at TEXT,
      overdue_notified_at TEXT,
      last_payment_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, cycle_key)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_employee_due
      ON payroll_cycles(employee_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status
      ON payroll_cycles(status, due_date);

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label_uz TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      icon TEXT NOT NULL DEFAULT 'wallet',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label_uz TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#22c55e',
      icon TEXT NOT NULL DEFAULT 'badge-dollar-sign',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
      source_type TEXT NOT NULL DEFAULT 'manual',
      title TEXT NOT NULL,
      notes TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      expense_category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
      income_category_id INTEGER REFERENCES income_categories(id) ON DELETE SET NULL,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      reference_type TEXT,
      reference_id INTEGER,
      payment_status TEXT NOT NULL DEFAULT 'posted',
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_time
      ON financial_transactions(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_direction
      ON financial_transactions(direction, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_employee
      ON financial_transactions(employee_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      payroll_cycle_id INTEGER REFERENCES payroll_cycles(id) ON DELETE SET NULL,
      payment_kind TEXT NOT NULL CHECK (payment_kind IN ('advance', 'salary', 'manual_adjustment')),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      payment_note TEXT,
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_salary_payments_employee
      ON salary_payments(employee_id, paid_at DESC);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_cycle
      ON salary_payments(payroll_cycle_id);

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      receipt_type TEXT NOT NULL DEFAULT 'payroll',
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      salary_payment_id INTEGER UNIQUE REFERENCES salary_payments(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      file_format TEXT NOT NULL DEFAULT 'pdf',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_employee
      ON receipts(employee_id, issued_at DESC);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      message TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_time
      ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
      ON audit_logs(entity_type, entity_id, created_at DESC);
  `);

  ensurePages(db);
  ensureExpenseCategories(db);
  ensureIncomeCategories(db);
  bootstrapEmployees(db);
}
