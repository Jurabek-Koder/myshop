import { db } from './database.js';

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function initAccountingSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acc_employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      full_name TEXT NOT NULL,
      phone TEXT,
      position TEXT,
      monthly_salary REAL NOT NULL DEFAULT 0,
      hire_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'active',
      card_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acc_payroll_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES acc_employees(id) ON DELETE CASCADE,
      cycle_month INTEGER NOT NULL,
      cycle_year INTEGER NOT NULL,
      cycle_type TEXT NOT NULL CHECK(cycle_type IN ('advance', 'salary')),
      amount REAL NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('paid', 'pending', 'overdue')),
      paid_date TEXT,
      paid_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acc_salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES acc_employees(id) ON DELETE CASCADE,
      payroll_cycle_id INTEGER REFERENCES acc_payroll_cycles(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('advance', 'salary', 'bonus', 'deduction')),
      payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card', 'transfer')),
      description TEXT,
      paid_by INTEGER REFERENCES users(id),
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acc_expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acc_income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acc_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category_id INTEGER,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      reference_type TEXT,
      reference_id INTEGER,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acc_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES acc_employees(id) ON DELETE SET NULL,
      payment_id INTEGER REFERENCES acc_salary_payments(id) ON DELETE SET NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      description TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      pdf_path TEXT
    );

    CREATE TABLE IF NOT EXISTS acc_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_acc_employees_status ON acc_employees(status);
    CREATE INDEX IF NOT EXISTS idx_acc_payroll_cycles_employee ON acc_payroll_cycles(employee_id);
    CREATE INDEX IF NOT EXISTS idx_acc_payroll_cycles_status ON acc_payroll_cycles(status);
    CREATE INDEX IF NOT EXISTS idx_acc_payroll_cycles_due_date ON acc_payroll_cycles(due_date);
    CREATE INDEX IF NOT EXISTS idx_acc_salary_payments_employee ON acc_salary_payments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_acc_transactions_type ON acc_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_acc_transactions_date ON acc_transactions(date);
    CREATE INDEX IF NOT EXISTS idx_acc_audit_log_user ON acc_audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_acc_audit_log_action ON acc_audit_log(action);
  `);

  const catCount = db.prepare('SELECT COUNT(*) as cnt FROM acc_expense_categories').get();
  if (catCount.cnt === 0) {
    const expenseCategories = [
      { name: 'Xodimlar oyligi', icon: 'Users', color: '#6366f1' },
      { name: 'Do\'kon xarajatlari', icon: 'Store', color: '#f59e0b' },
      { name: 'Transport', icon: 'Truck', color: '#10b981' },
      { name: 'Kommunal xizmatlar', icon: 'Zap', color: '#ef4444' },
      { name: 'Marketing', icon: 'Megaphone', color: '#8b5cf6' },
      { name: 'Boshqa xarajatlar', icon: 'MoreHorizontal', color: '#64748b' },
    ];
    const insertCat = db.prepare('INSERT INTO acc_expense_categories (name, icon, color) VALUES (?, ?, ?)');
    for (const cat of expenseCategories) {
      insertCat.run(cat.name, cat.icon, cat.color);
    }

    const incomeCategories = [
      { name: 'Mahsulot sotish', icon: 'ShoppingBag', color: '#10b981' },
      { name: 'Xizmat ko\'rsatish', icon: 'Briefcase', color: '#6366f1' },
      { name: 'Qo\'shimcha daromad', icon: 'Plus', color: '#f59e0b' },
    ];
    const insertIncome = db.prepare('INSERT INTO acc_income_categories (name, icon, color) VALUES (?, ?, ?)');
    for (const cat of incomeCategories) {
      insertIncome.run(cat.name, cat.icon, cat.color);
    }
  }
}
