import { createFinancialTransaction, registerSalaryPayment, runAccountingAutomation, toDbDate } from '../lib/accountingService.js';

function createNowOffset(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDbDate(date);
}

function getCategoryId(db, table, slug) {
  return db.prepare(`SELECT id FROM ${table} WHERE slug = ? LIMIT 1`).get(slug)?.id ?? null;
}

function seedAccountingCategories(db) {
  const incomeCategories = [
    ['product-sales', 'Mahsulot savdosi', 'Buyurtmalardan tushgan mablag‘', 1],
    ['manual-income', 'Qo‘lda kiritilgan tushum', 'Qo‘shimcha tushumlar', 2],
    ['service-income', 'Xizmat tushumi', 'Servis va qo‘shimcha xizmatlar', 3],
  ];

  const expenseCategories = [
    ['shop-expense', 'Do‘kon xarajatlari', 'Kunlik operatsion xarajatlar', 1],
    ['payroll', 'Ish haqi', 'Xodimlar uchun payroll to‘lovlari', 2],
    ['utilities', 'Kommunal xizmatlar', 'Elektr, internet va boshqa kommunal to‘lovlar', 3],
    ['transport', 'Transport', 'Yetkazib berish va yo‘l xarajatlari', 4],
    ['other-expense', 'Boshqa xarajatlar', 'Turli qo‘shimcha xarajatlar', 5],
  ];

  const insertIncome = db.prepare(
    `INSERT OR IGNORE INTO income_categories (slug, name_uz, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertExpense = db.prepare(
    `INSERT OR IGNORE INTO expense_categories (slug, name_uz, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const now = toDbDate();

  for (const row of incomeCategories) insertIncome.run(row[0], row[1], row[2], row[3], now);
  for (const row of expenseCategories) insertExpense.run(row[0], row[1], row[2], row[3], now);
}

function seedAccountingEmployees(db) {
  const employeeCount = db.prepare(`SELECT COUNT(*) AS total FROM employees`).get()?.total ?? 0;
  if (employeeCount > 0) return;

  const candidates = db
    .prepare(
      `
        SELECT id, full_name, phone, role
        FROM users
        WHERE lower(trim(COALESCE(role, ''))) IN ('superuser', 'accounting')
           OR role_id = 1
        ORDER BY id ASC
        LIMIT 6
      `,
    )
    .all();

  const seeded = [];
  for (const [index, row] of candidates.entries()) {
    seeded.push({
      user_id: row.id,
      full_name: row.full_name,
      position_title: index === 0 ? 'Moliyaviy direktor' : index === 1 ? 'Bosh hisobchi' : 'Operatsion menejer',
      phone: row.phone || '',
      monthly_salary: 7500000 - index * 450000,
      advance_ratio: 0.5,
      payment_method: index % 2 === 0 ? 'bank' : 'card',
      access_level: 'superuser',
    });
  }

  const fallbacks = [
    {
      user_id: null,
      full_name: 'Diyorbek Xolmatov',
      position_title: 'Moliyaviy direktor',
      phone: '+998901110101',
      monthly_salary: 8200000,
      advance_ratio: 0.5,
      payment_method: 'bank',
      access_level: 'superuser',
    },
    {
      user_id: null,
      full_name: 'Shahnoza Qo‘chqarova',
      position_title: 'Bosh hisobchi',
      phone: '+998901110202',
      monthly_salary: 6900000,
      advance_ratio: 0.5,
      payment_method: 'card',
      access_level: 'superuser',
    },
    {
      user_id: null,
      full_name: 'Aziza Rashidova',
      position_title: 'HR va payroll menejeri',
      phone: '+998901110303',
      monthly_salary: 5600000,
      advance_ratio: 0.45,
      payment_method: 'bank',
      access_level: 'superuser',
    },
    {
      user_id: null,
      full_name: 'Jasurbek Ergashev',
      position_title: 'Operatsion menejer',
      phone: '+998901110404',
      monthly_salary: 6100000,
      advance_ratio: 0.5,
      payment_method: 'cash',
      access_level: 'superuser',
    },
  ];

  while (seeded.length < 4) {
    seeded.push(fallbacks[seeded.length]);
  }

  const insert = db.prepare(
    `
      INSERT INTO employees (
        user_id, full_name, position_title, phone, employment_status,
        monthly_salary, advance_ratio, payment_method, telegram_chat_id,
        avatar_color, access_level, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, NULL, ?, ?, ?, ?)
    `,
  );

  const colors = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#ef4444'];
  const now = toDbDate();
  seeded.forEach((employee, index) => {
    insert.run(
      employee.user_id,
      employee.full_name,
      employee.position_title,
      employee.phone,
      employee.monthly_salary,
      employee.advance_ratio,
      employee.payment_method,
      colors[index % colors.length],
      employee.access_level,
      now,
      now,
    );
  });
}

async function seedPayrollHistory(db) {
  const paymentCount = db.prepare(`SELECT COUNT(*) AS total FROM salary_payments`).get()?.total ?? 0;
  if (paymentCount > 0) return;

  await runAccountingAutomation(db, { sendTelegram: false });
  const employees = db.prepare(`SELECT id FROM employees ORDER BY id ASC LIMIT 3`).all();
  if (employees.length === 0) return;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const currentAdvance = db
    .prepare(
      `SELECT id FROM payroll_cycles WHERE employee_id = ? AND cycle_month = ? AND cycle_year = ? AND cycle_type = 'advance' LIMIT 1`,
    )
    .get(employees[0].id, now.getMonth() + 1, now.getFullYear());
  if (currentAdvance?.id) {
    await registerSalaryPayment(db, { cycleId: currentAdvance.id, note: 'Avans to‘lovi avtomatik seeded' }, null);
  }

  const previousSalary = db
    .prepare(
      `SELECT id FROM payroll_cycles WHERE employee_id = ? AND cycle_month = ? AND cycle_year = ? AND cycle_type = 'salary' LIMIT 1`,
    )
    .get(employees[0].id, previousMonthDate.getMonth() + 1, previousMonthDate.getFullYear());
  if (previousSalary?.id) {
    await registerSalaryPayment(db, { cycleId: previousSalary.id, note: 'Oldingi oy oyligi seeded' }, null);
  }

  if (employees[1]?.id) {
    const secondAdvance = db
      .prepare(
        `SELECT id, remaining_amount FROM payroll_cycles WHERE employee_id = ? AND cycle_month = ? AND cycle_year = ? AND cycle_type = 'advance' LIMIT 1`,
      )
      .get(employees[1].id, now.getMonth() + 1, now.getFullYear());
    if (secondAdvance?.id) {
      await registerSalaryPayment(
        db,
        {
          cycleId: secondAdvance.id,
          amount: Number(secondAdvance.remaining_amount || 0) / 2,
          note: 'Qisman avans to‘lovi',
        },
        null,
      );
    }
  }

  await runAccountingAutomation(db, { sendTelegram: false, referenceDate: new Date() });

  db.prepare(
    `INSERT OR IGNORE INTO audit_logs (actor_user_id, action, entity_type, entity_id, summary, payload_json, created_at)
     VALUES (NULL, 'dashboard.seed', 'system', NULL, 'Accounting demo ma’lumotlari yaratildi', ?, ?)`,
  ).run(JSON.stringify({ currentMonth, previousMonth }), toDbDate());
}

function seedFinancialTransactions(db) {
  const transactionCount = db.prepare(`SELECT COUNT(*) AS total FROM financial_transactions`).get()?.total ?? 0;
  if (transactionCount > 0) return;

  const incomeSales = getCategoryId(db, 'income_categories', 'product-sales');
  const incomeManual = getCategoryId(db, 'income_categories', 'manual-income');
  const incomeService = getCategoryId(db, 'income_categories', 'service-income');
  const expenseShop = getCategoryId(db, 'expense_categories', 'shop-expense');
  const expenseUtilities = getCategoryId(db, 'expense_categories', 'utilities');
  const expenseTransport = getCategoryId(db, 'expense_categories', 'transport');
  const expenseOther = getCategoryId(db, 'expense_categories', 'other-expense');

  const examples = [
    {
      direction: 'income',
      amount: 18200000,
      title: 'Mahsulot savdosi',
      note: 'Online buyurtmalardan tushum',
      source: 'product_sales',
      category_id: incomeSales,
      transaction_date: createNowOffset(-12),
    },
    {
      direction: 'income',
      amount: 3400000,
      title: 'Qo‘shimcha servis daromadi',
      note: 'Kafolat va premium servis',
      source: 'service_income',
      category_id: incomeService,
      transaction_date: createNowOffset(-8),
    },
    {
      direction: 'income',
      amount: 2100000,
      title: 'Qo‘lda kiritilgan tushum',
      note: 'Hamkorlik bonusi',
      source: 'manual_income',
      category_id: incomeManual,
      transaction_date: createNowOffset(-3),
    },
    {
      direction: 'expense',
      amount: 1750000,
      title: 'Ofis va do‘kon xarajatlari',
      note: 'Material va xo‘jalik xarajatlari',
      source: 'shop_expense',
      category_id: expenseShop,
      transaction_date: createNowOffset(-10),
    },
    {
      direction: 'expense',
      amount: 890000,
      title: 'Kommunal to‘lov',
      note: 'Internet va elektr',
      source: 'utilities',
      category_id: expenseUtilities,
      transaction_date: createNowOffset(-6),
    },
    {
      direction: 'expense',
      amount: 540000,
      title: 'Transport xarajati',
      note: 'Yetkazib berish yo‘lkirasi',
      source: 'transport',
      category_id: expenseTransport,
      transaction_date: createNowOffset(-4),
    },
    {
      direction: 'expense',
      amount: 350000,
      title: 'Boshqa operatsion xarajat',
      note: 'Qo‘shimcha mayda xarajat',
      source: 'other_expense',
      category_id: expenseOther,
      transaction_date: createNowOffset(-2),
    },
  ];

  for (const item of examples) {
    createFinancialTransaction(db, item, null);
  }
}

export async function ensureAccountingSetup(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      position_title TEXT NOT NULL DEFAULT 'Payroll manager',
      phone TEXT,
      employment_status TEXT NOT NULL DEFAULT 'active',
      monthly_salary REAL NOT NULL DEFAULT 0,
      advance_ratio REAL NOT NULL DEFAULT 0.5,
      payment_method TEXT NOT NULL DEFAULT 'bank',
      telegram_chat_id TEXT,
      avatar_color TEXT NOT NULL DEFAULT '#3b82f6',
      access_level TEXT NOT NULL DEFAULT 'superuser',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);

    CREATE TABLE IF NOT EXISTS payroll_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      cycle_year INTEGER NOT NULL,
      cycle_month INTEGER NOT NULL,
      cycle_type TEXT NOT NULL CHECK(cycle_type IN ('advance', 'salary')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      due_date TEXT NOT NULL,
      gross_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('paid', 'pending', 'overdue')),
      auto_generated INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      telegram_reminded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, cycle_year, cycle_month, cycle_type)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_due ON payroll_cycles(due_date, status);
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_employee ON payroll_cycles(employee_id, cycle_year, cycle_month);

    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_kind TEXT NOT NULL DEFAULT 'partial',
      payment_method TEXT NOT NULL DEFAULT 'bank',
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT,
      receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
      telegram_sent_at TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_salary_payments_cycle ON salary_payments(cycle_id, paid_at DESC);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON salary_payments(employee_id, paid_at DESC);

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name_uz TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name_uz TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
      amount REAL NOT NULL,
      title TEXT NOT NULL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'completed',
      transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
      category_id INTEGER,
      category_slug TEXT,
      category_name TEXT,
      linked_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      linked_cycle_id INTEGER REFERENCES payroll_cycles(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_direction ON financial_transactions(direction, transaction_date DESC);

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT UNIQUE NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_entity ON receipts(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  seedAccountingCategories(db);
  seedAccountingEmployees(db);
  seedFinancialTransactions(db);
  await seedPayrollHistory(db);
}
