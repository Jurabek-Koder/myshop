import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { getSqlitePath } from '../config/dataPaths.js';
import { HOME_BENEFITS_DEFAULT } from '../config/homeBenefitsDefaults.js';

const dbPath = getSqlitePath();
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/** Seller yoki work_role NULL bo‘lishi uchun jadvalni bir martalik qayta yaratadi. */
function migrateWithdrawalRequestsSchemaV2() {
  ensureColumn('withdrawal_requests', 'paid_out_at', 'TEXT');
  ensureColumn('withdrawal_requests', 'paid_out_by', 'INTEGER REFERENCES users(id)');
  ensureColumn('withdrawal_requests', 'seller_id', 'INTEGER REFERENCES sellers(id)');

  const done = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('withdrawal_null_wr_v1');
  if (String(done?.value || '') === '1') return;

  const cols = db.prepare('PRAGMA table_info(withdrawal_requests)').all();
  const wrCol = cols.find((c) => c.name === 'work_role_id');
  if (!wrCol || wrCol.notnull !== 1) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('withdrawal_null_wr_v1', '1');
    return;
  }

  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(`
      CREATE TABLE withdrawal_requests_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_role_id INTEGER REFERENCES work_roles(id) ON DELETE CASCADE,
        seller_id INTEGER REFERENCES sellers(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewed_at TEXT,
        reviewed_by INTEGER REFERENCES users(id),
        note TEXT,
        payout_method TEXT NOT NULL DEFAULT 'cash',
        paid_out_at TEXT,
        paid_out_by INTEGER REFERENCES users(id)
      );
    `);
    db.prepare(
      `
      INSERT INTO withdrawal_requests_new (id, work_role_id, seller_id, amount, status, created_at, reviewed_at, reviewed_by, note, payout_method, paid_out_at, paid_out_by)
      SELECT id, work_role_id, NULL, amount, status, created_at, reviewed_at, reviewed_by, note,
             COALESCE(payout_method, 'cash'), NULL, NULL
      FROM withdrawal_requests
    `,
    ).run();
    db.exec('DROP TABLE withdrawal_requests');
    db.exec('ALTER TABLE withdrawal_requests_new RENAME TO withdrawal_requests');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_work_role ON withdrawal_requests(work_role_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_seller ON withdrawal_requests(seller_id);
    `);
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('withdrawal_null_wr_v1', '1');
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export function deleteProductsCascadeByIds(ids) {
  const unique = [...new Set(ids.filter((id) => id != null))];
  if (unique.length === 0) return;
  const delOi = db.prepare('DELETE FROM order_items WHERE product_id = ?');
  const delLeads = db.prepare('DELETE FROM product_leads WHERE product_id = ?');
  const delP = db.prepare('DELETE FROM products WHERE id = ?');
  const tx = db.transaction(() => {
    for (const id of unique) {
      delOi.run(id);
      delLeads.run(id);
      delP.run(id);
    }
  });
  tx();
}

function toJson(value, fallback = []) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

/** Buxgalteriya ERP: xarajatlar, kassalar, audit (SQLite, persistent disk). */
/** payroll_employees: user + work_role (ish haqi barcha rollar uchun). */
function migratePayrollEmployeesMultiRole() {
  const done = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('payroll_employees_multi_v1');
  if (String(done?.value || '') === '1') return;

  const cols = db.prepare('PRAGMA table_info(payroll_employees)').all();
  if (cols.some((c) => c.name === 'employee_type')) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('payroll_employees_multi_v1', '1');
    return;
  }

  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(`
      CREATE TABLE payroll_employees_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_type TEXT NOT NULL DEFAULT 'user' CHECK(employee_type IN ('user', 'work_role')),
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        work_role_id INTEGER REFERENCES work_roles(id) ON DELETE CASCADE,
        monthly_salary_uzs REAL NOT NULL DEFAULT 0,
        advance_percent REAL NOT NULL DEFAULT 0.5,
        advance_due_day INTEGER NOT NULL DEFAULT 15,
        balance_due_day INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        updated_by INTEGER REFERENCES users(id),
        CHECK (
          (employee_type = 'user' AND user_id IS NOT NULL AND work_role_id IS NULL)
          OR (employee_type = 'work_role' AND work_role_id IS NOT NULL AND user_id IS NULL)
        )
      );
    `);
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_emp_user ON payroll_employees_new(user_id) WHERE user_id IS NOT NULL`,
    );
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_emp_wr ON payroll_employees_new(work_role_id) WHERE work_role_id IS NOT NULL`,
    );
    db.prepare(
      `
      INSERT INTO payroll_employees_new (
        id, employee_type, user_id, work_role_id, monthly_salary_uzs, advance_percent,
        advance_due_day, balance_due_day, active, notes, created_at, updated_at, updated_by
      )
      SELECT id, 'user', user_id, NULL, monthly_salary_uzs, advance_percent,
        advance_due_day, balance_due_day, active, notes, created_at, updated_at, updated_by
      FROM payroll_employees
    `,
    ).run();
    db.exec('DROP TABLE payroll_employees');
    db.exec('ALTER TABLE payroll_employees_new RENAME TO payroll_employees');
    db.exec('CREATE INDEX IF NOT EXISTS idx_payroll_employees_active ON payroll_employees(active)');
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('payroll_employees_multi_v1', '1');
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.warn('[MyShop] migratePayrollEmployeesMultiRole:', e?.message || e);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/** Xodimni login/ism/email/telefon + rol bo‘yicha yagona identifikatsiya (ikki marta to‘lov oldini olish). */
function migratePayrollEmployeeIdentity() {
  ensureColumn('payroll_employees', 'identity_hash', 'TEXT');
  ensureColumn('payroll_employees', 'display_name', 'TEXT');
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_employees_identity ON payroll_employees(identity_hash) WHERE identity_hash IS NOT NULL`,
  );
}

function ensureAccountingErpSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounting_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_at TEXT,
      updated_by INTEGER REFERENCES users(id),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_created ON accounting_expenses(created_at);
    CREATE INDEX IF NOT EXISTS idx_accounting_expenses_cat ON accounting_expenses(category);

    CREATE TABLE IF NOT EXISTS accounting_cashboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting_cashbox_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cashbox_id INTEGER NOT NULL REFERENCES accounting_cashboxes(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      direction TEXT NOT NULL,
      ref_type TEXT,
      ref_id INTEGER,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_accounting_cash_mov_box ON accounting_cashbox_movements(cashbox_id);

    CREATE TABLE IF NOT EXISTS accounting_finance_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_accounting_audit_created ON accounting_finance_audit(created_at);

    /* Korporativ ERP: kuryer balansi, payroll, hisobotlar, markaziy finance_logs (backup bilan birga myshop.db ichida) */
    CREATE TABLE IF NOT EXISTS finance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_finance_logs_created ON finance_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_finance_logs_entity ON finance_logs(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS courier_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courier_staff_id INTEGER NOT NULL UNIQUE REFERENCES staff_members(id) ON DELETE CASCADE,
      balance REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      updated_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_courier_balances_staff ON courier_balances(courier_staff_id);

    CREATE TABLE IF NOT EXISTS payrolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      role_label TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_at TEXT,
      updated_by INTEGER REFERENCES users(id),
      paid_at TEXT,
      paid_by INTEGER REFERENCES users(id),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payrolls_period ON payrolls(period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_payrolls_status ON payrolls(status);
    CREATE INDEX IF NOT EXISTS idx_payrolls_deleted ON payrolls(deleted_at);

    CREATE TABLE IF NOT EXISTS financial_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type TEXT NOT NULL,
      title TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_financial_reports_created ON financial_reports(created_at);

    CREATE TABLE IF NOT EXISTS accounting_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'boshqa',
      income_date TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_accounting_income_date ON accounting_income(income_date);

    CREATE TABLE IF NOT EXISTS warehouse_ledger_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      event_type TEXT NOT NULL,
      qty INTEGER NOT NULL,
      stock_before INTEGER NOT NULL,
      stock_after INTEGER NOT NULL,
      actor_user_id INTEGER REFERENCES users(id),
      actor_role TEXT,
      actor_label TEXT,
      product_name TEXT,
      seller_id INTEGER,
      seller_name TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wh_ledger_events_created ON warehouse_ledger_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_wh_ledger_events_id ON warehouse_ledger_events(id);

    CREATE TABLE IF NOT EXISTS payroll_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      monthly_salary_uzs REAL NOT NULL DEFAULT 0,
      advance_percent REAL NOT NULL DEFAULT 0.5,
      advance_due_day INTEGER NOT NULL DEFAULT 15,
      balance_due_day INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      updated_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_employees_active ON payroll_employees(active);

    CREATE TABLE IF NOT EXISTS payroll_payment_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
      cycle_year INTEGER NOT NULL,
      cycle_month INTEGER NOT NULL,
      payment_type TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount_uzs REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      receipt_ref TEXT,
      notes TEXT,
      paid_at TEXT,
      paid_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(employee_id, cycle_year, cycle_month, payment_type)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_due ON payroll_payment_cycles(due_date);
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status ON payroll_payment_cycles(status);
    CREATE INDEX IF NOT EXISTS idx_payroll_cycles_ym ON payroll_payment_cycles(cycle_year, cycle_month);

    CREATE TABLE IF NOT EXISTS payroll_role_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_source TEXT NOT NULL CHECK(role_source IN ('system', 'work')),
      role_key TEXT NOT NULL,
      role_label TEXT NOT NULL DEFAULT '',
      monthly_salary_uzs REAL NOT NULL DEFAULT 0,
      advance_percent REAL NOT NULL DEFAULT 0.5,
      advance_due_day INTEGER NOT NULL DEFAULT 15,
      balance_due_day INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE(role_source, role_key)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_role_defaults_source ON payroll_role_defaults(role_source);

    CREATE TABLE IF NOT EXISTS payroll_advance_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_year INTEGER NOT NULL,
      cycle_month INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_superuser',
      total_amount_uzs REAL NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL DEFAULT 0,
      superuser_approved_at TEXT,
      superuser_approved_by INTEGER REFERENCES users(id),
      accounting_assigned_at TEXT,
      accounting_assigned_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(cycle_year, cycle_month)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_advance_runs_ym ON payroll_advance_runs(cycle_year, cycle_month);

    CREATE TABLE IF NOT EXISTS payroll_advance_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES payroll_advance_runs(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
      role_label TEXT NOT NULL DEFAULT '',
      employee_display_name TEXT NOT NULL DEFAULT '',
      employee_login TEXT,
      amount_uzs REAL NOT NULL,
      advance_percent REAL NOT NULL DEFAULT 0.1,
      status TEXT NOT NULL DEFAULT 'pending_superuser',
      superuser_approved_at TEXT,
      assigned_at TEXT,
      assigned_by INTEGER REFERENCES users(id),
      worker_confirmed_at TEXT,
      distributed_at TEXT,
      distributed_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(run_id, employee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_advance_items_run ON payroll_advance_items(run_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_advance_items_emp ON payroll_advance_items(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_advance_items_status ON payroll_advance_items(status);
  `);

  db.prepare(`UPDATE payroll_settings SET value = '0.1' WHERE key = 'advance_percent_default'`).run();
  db.prepare(`UPDATE payroll_role_defaults SET advance_percent = 0.1 WHERE advance_percent >= 0.5`).run();
  db.prepare(`UPDATE payroll_employees SET advance_percent = 0.1 WHERE advance_percent >= 0.5`).run();

  migratePayrollEmployeesMultiRole();
  migratePayrollEmployeeIdentity();

  const settingsSeed = [
    ['advance_percent_default', '0.1'],
    ['advance_due_day_default', '15'],
    ['balance_due_day_default', '0'],
  ];
  const insSet = db.prepare(`INSERT OR IGNORE INTO payroll_settings (key, value) VALUES (?, ?)`);
  for (const s of settingsSeed) insSet.run(...s);

  try {
    const fl = db.prepare(`SELECT COUNT(*) AS c FROM finance_logs`).get().c;
    const legacy = db.prepare(`SELECT COUNT(*) AS c FROM accounting_finance_audit`).get().c;
    if (fl === 0 && legacy > 0) {
      db.exec(`
        INSERT INTO finance_logs (actor_user_id, action, entity_type, entity_id, payload_json, created_at)
        SELECT actor_user_id, action, entity_type, entity_id, payload_json, created_at
        FROM accounting_finance_audit
      `);
    }
  } catch (e) {
    console.warn('[MyShop] finance_logs migratsiyasi:', e?.message || e);
  }

  const n = db.prepare(`SELECT COUNT(*) AS c FROM accounting_cashboxes`).get().c;
  if (n === 0) {
    const ins = db.prepare(
      `INSERT INTO accounting_cashboxes (code, label, balance, sort_order, active) VALUES (?,?,?,?,1)`,
    );
    const seed = [
      ['naqd', 'Naqd', 0, 10],
      ['click', 'Click', 0, 20],
      ['payme', 'Payme', 0, 30],
      ['uzcard', 'Uzcard', 0, 40],
      ['humo', 'Humo', 0, 50],
      ['bank', 'Bank', 0, 60],
    ];
    for (const s of seed) ins.run(...s);
  }

  queueMicrotask(() => {
    import('../services/payrollCycleService.js')
      .then((m) => m.syncPayrollRoleDefaults())
      .catch((e) => console.warn('[MyShop] payroll role defaults seed:', e?.message || e));
  });
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_uz TEXT NOT NULL,
      name_ru TEXT,
      description_uz TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      image_url TEXT,
      video_url TEXT,
      category TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      shipping_address TEXT,
      contact_phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      price_at_order REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_pages (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      page_path TEXT NOT NULL,
      PRIMARY KEY (role_id, page_path)
    );

    CREATE TABLE IF NOT EXISTS pages (
      path TEXT PRIMARY KEY,
      label_uz TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      delivery_fee REAL NOT NULL DEFAULT 25000,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_type TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      region_id INTEGER REFERENCES regions(id),
      orders_handled INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_staff_type ON staff_members(staff_type);

    CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_phone TEXT,
      email TEXT,
      region_id INTEGER REFERENCES regions(id),
      balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      link_view TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_seller_notifications_seller ON seller_notifications(seller_id);
    CREATE INDEX IF NOT EXISTS idx_seller_notifications_created ON seller_notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_seller_notifications_unread ON seller_notifications(seller_id, is_read);

    CREATE TABLE IF NOT EXISTS work_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      task TEXT,
      description TEXT,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      orders_count INTEGER NOT NULL DEFAULT 0,
      badges_count INTEGER NOT NULL DEFAULT 0,
      rank_title TEXT NOT NULL DEFAULT 'Junior',
      fines_count INTEGER NOT NULL DEFAULT 0,
      fine_amount REAL NOT NULL DEFAULT 0,
      reward_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_work_roles_deleted ON work_roles(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_work_roles_status ON work_roles(status);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS product_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      contact_phone TEXT,
      contact_email TEXT,
      full_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      operator_id INTEGER REFERENCES users(id),
      order_id INTEGER REFERENCES orders(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_leads_product ON product_leads(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_leads_status ON product_leads(status);

    CREATE TABLE IF NOT EXISTS twilio_sms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL DEFAULT 'inbound',
      from_phone TEXT,
      to_phone TEXT,
      body TEXT,
      twilio_message_sid TEXT,
      status TEXT,
      operator_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_twilio_sms_sid ON twilio_sms_messages(twilio_message_sid);
    CREATE INDEX IF NOT EXISTS idx_twilio_sms_created ON twilio_sms_messages(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_created ON user_notifications(created_at);

    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_role_id INTEGER NOT NULL REFERENCES work_roles(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_work_role ON withdrawal_requests(work_role_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);

    CREATE TABLE IF NOT EXISTS staff_chat_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_message_id TEXT NOT NULL,
      chat_room TEXT NOT NULL DEFAULT 'sklad',
      sender_user_id INTEGER REFERENCES users(id),
      sender_label TEXT,
      is_from_staff INTEGER NOT NULL DEFAULT 1,
      message_type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_staff_chat_room_created ON staff_chat_archive(chat_room, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_chat_client_room ON staff_chat_archive(client_message_id, chat_room);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      link_url TEXT,
      image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ad_slides_order ON ad_slides (sort_order ASC, id ASC);
  `);

  const adSlideCount = db.prepare('SELECT COUNT(*) as c FROM ad_slides').get().c;
  /** Bosh sahifa reklama: frontend `public/images` → buildda `/images/...` */
  const defaultAdSlideImages = [
    '/images/atir.webp',
    '/images/blender.webp',
    '/images/espander-universalnyy-168033-1.jpeg',
    '/images/photo_2026-03-22_18-25-13.jpg',
    '/images/photo_2026-03-22_18-26-16.jpg',
    '/images/photo_2026-03-22_18-26-37.jpg',
  ];
  if (adSlideCount === 0) {
    const ins = db.prepare(
      'INSERT INTO ad_slides (sort_order, title, subtitle, image_url, active) VALUES (?, ?, ?, ?, 1)',
    );
    const defaults = [
      ['Yangi kelganlar', "Eng so'nggi mahsulotlar do'konimizda", defaultAdSlideImages[0]],
      ['Chegirmalar', "Aksiyali narxlardan bahramand bo'ling", defaultAdSlideImages[1]],
      ["Bepul yetkazib berish", "500 000 so'mdan ortiq buyurtmalarda", defaultAdSlideImages[2]],
      ['Tez yetkazib berish', 'Buyurtmangiz 1–3 kun ichida', defaultAdSlideImages[3]],
      ['Kafolat', 'Sifat kafolati va qaytarish imkoniyati', defaultAdSlideImages[4]],
      ['MyShop', "Xavfsiz va qulay onlayn do'kon", defaultAdSlideImages[5]],
    ];
    defaults.forEach((row, i) => {
      ins.run(i, row[0], row[1], row[2]);
    });
  } else {
    const withAnyImage = db
      .prepare(
        `SELECT COUNT(*) as c FROM ad_slides WHERE image_url IS NOT NULL AND trim(image_url) != ''`,
      )
      .get().c;
    if (withAnyImage === 0) {
      const rows = db.prepare('SELECT id FROM ad_slides ORDER BY sort_order ASC, id ASC').all();
      const upd = db.prepare('UPDATE ad_slides SET image_url = ? WHERE id = ?');
      rows.forEach((r, i) => {
        if (i < defaultAdSlideImages.length) upd.run(defaultAdSlideImages[i], r.id);
      });
    }
  }

  const settingsCount = db.prepare('SELECT COUNT(*) as c FROM app_settings').get().c;
  if (settingsCount === 0) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('courier_fee_per_order', '25000');
  }
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_active', '0');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_courier_active', '0');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_start', '');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_end', '');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_target_active', '1');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_target_start', '2025-12-20');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_target_end', '2026-12-20');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('contest_target_title', 'MyShop');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(
    'contest_target_desc1',
    'MyShop jamoasidan bomba konkurs.',
  );
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(
    'contest_target_desc2',
    'Vaqtingizdan unumli foydalaning va bizning jamoamizga qo\'shiling va yil admini bo\'lish imkoniyatidan foydalaning',
  );
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('target_coin_per_referral', '50');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('target_coin_per_delivered_order', '10');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('target_coin_uzs_per_coin', '100');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('target_coin_min_withdraw', '10');

  const FOOTER_STRIP_DEF_TEXT = "Bepul yetkazib berish — 500 000 so'mdan ortiq buyurtmalarda";
  const FOOTER_STRIP_DEF_PHONE = '+998 71 123 45 67';
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('footer_strip_text_live', FOOTER_STRIP_DEF_TEXT);
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('footer_strip_phone_live', FOOTER_STRIP_DEF_PHONE);
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('footer_strip_text_draft', FOOTER_STRIP_DEF_TEXT);
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('footer_strip_phone_draft', FOOTER_STRIP_DEF_PHONE);
  {
    const dT = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('footer_strip_text_draft');
    if (!dT || String(dT.value || '').trim() === '') {
      const lv = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('footer_strip_text_live');
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
        'footer_strip_text_draft',
        String(lv?.value || FOOTER_STRIP_DEF_TEXT),
      );
    }
    const dP = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('footer_strip_phone_draft');
    if (!dP || String(dP.value || '').trim() === '') {
      const lv = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('footer_strip_phone_live');
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
        'footer_strip_phone_draft',
        String(lv?.value || FOOTER_STRIP_DEF_PHONE),
      );
    }
  }

  const HOME_BEN_JSON = JSON.stringify(HOME_BENEFITS_DEFAULT);
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('home_benefits_live', HOME_BEN_JSON);
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('home_benefits_draft', HOME_BEN_JSON);

  ensureColumn('users', 'role_id', 'INTEGER REFERENCES roles(id)');
  ensureColumn('users', 'seller_id', 'INTEGER REFERENCES sellers(id)');
  // XAVFSIZLIK: hisob darajasida brute-force himoyasi (login urinishlarini hisoblash).
  ensureColumn('users', 'failed_login_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'locked_until', 'TEXT');
  // XAVFSIZLIK: token_version — logout yoki admin "majburiy chiqarish" qilganda
  // bu son oshiriladi, shu bilan avval berilgan BARCHA access/refresh token'lar
  // (hali muddati tugamagan bo'lsa ham) darhol yaroqsiz bo'ladi.
  ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'referred_by_user_id', 'INTEGER REFERENCES users(id)');
  ensureColumn('users', 'telegram_id', 'TEXT');
  ensureColumn('users', 'about_bio', 'TEXT');
  ensureColumn('users', 'target_region_id', 'TEXT');
  ensureColumn('users', 'target_district_id', 'TEXT');
  ensureColumn('product_leads', 'shipping_address', 'TEXT');
  ensureColumn('users', 'login', 'TEXT');
  ensureColumn('users', 'phone', 'TEXT');
  ensureColumn('users', 'last_name', 'TEXT');
  ensureColumn('users', 'avatar_url', 'TEXT');
  ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn('users', 'password_plain', 'TEXT');
  /* Mijoz auditi: ro‘yxatdan o‘tish va oxirgi kirish qurilma/IP/joylashuv */
  ensureColumn('users', 'registered_ip', 'TEXT');
  ensureColumn('users', 'registered_user_agent', 'TEXT');
  ensureColumn('users', 'registered_device', 'TEXT');
  ensureColumn('users', 'registered_location', 'TEXT');
  ensureColumn('users', 'last_login_at', 'TEXT');
  ensureColumn('users', 'last_login_ip', 'TEXT');
  ensureColumn('users', 'last_login_user_agent', 'TEXT');
  ensureColumn('users', 'last_login_device', 'TEXT');
  ensureColumn('users', 'last_login_location', 'TEXT');
  /** Onlayn/oflayn holatini hisoblash uchun — har bir autentifikatsiya qilingan so‘rovda yangilanadi */
  ensureColumn('users', 'last_active_at', 'TEXT');
  /** Kuryer uchun depozit summasi (Ombor admin -> Kuryer sahifasi) */
  ensureColumn('staff_members', 'deposit', 'REAL NOT NULL DEFAULT 0');
  /** Seller uchun sotuv (komissiya) foizi (Ombor admin -> Seller sahifasi) */
  ensureColumn('sellers', 'commission_percent', 'REAL NOT NULL DEFAULT 10');
  ensureColumn('work_roles', 'portal_role', 'TEXT');
  ensureColumn('work_roles', 'courier_viloyat_id', 'TEXT');
  ensureColumn('work_roles', 'courier_tuman_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('work_roles', 'deleted_at', 'TEXT');
  ensureColumn('staff_members', 'region_service_text', 'TEXT');
  ensureColumn('sellers', 'user_id', 'INTEGER REFERENCES users(id)');
  ensureColumn('products', 'seller_id', 'INTEGER REFERENCES sellers(id)');
  ensureColumn('products', 'status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('products', 'operator_share_percent', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'site_fee_percent', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'operator_share_amount', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'site_fee_amount', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'seller_net_amount', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'video_url', 'TEXT');
  ensureColumn('ad_slides', 'video_url', 'TEXT');
  /** Tor ekranlar (≤767px) uchun alohida banner — ixtiyoriy */
  ensureColumn('ad_slides', 'image_url_mobile', 'TEXT');
  ensureColumn('products', 'discount_percent', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'promotion_ends_at', 'TEXT');
  ensureColumn('products', 'goes_live_at', 'TEXT');
  ensureColumn('products', 'image_gallery_json', 'TEXT');
  ensureColumn('products', 'ai_marketing_opt_in', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'ai_creatives_json', 'TEXT');
  /** Superuser AI Target (Meta) kampaniyasini ishga tushirish uchun tasdiq vaqtinchalari */
  ensureColumn('products', 'ai_target_approved_at', 'TEXT');
  ensureColumn('products', 'ai_target_approved_by', 'INTEGER REFERENCES users(id)');
  /** Seller: { kind: size|color|custom, label, qty }[] — jami soni stock bilan mos keladi */
  ensureColumn('products', 'seller_positions_json', 'TEXT');
  ensureColumn('products', 'off_sale_variant', 'TEXT');
  /** Sotuvchining «brak» yorlig‘i uchun dona — `off_sale_variant = 'brak'` da ko‘rinadi */
  ensureColumn('products', 'brak_qty', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'warehouse_approved_at', 'TEXT');
  ensureColumn('products', 'warehouse_approved_by', 'INTEGER REFERENCES users(id)');
  /** Ombor qo‘lda yuritadigan sonlar — sahifalar faqat tasdiq + miqdor > 0 bo‘lsa */
  ensureColumn('products', 'warehouse_kirim_qty', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'warehouse_kirim_stock_applied', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'warehouse_chiqim_qty', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'warehouse_atkaz_qty', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'warehouse_chiqim_confirmed_at', 'TEXT');
  ensureColumn('products', 'warehouse_atkaz_confirmed_at', 'TEXT');
  ensureColumn('products', 'warehouse_brak_confirmed_at', 'TEXT');
  /** Ombor tomonidan saytdan yechilgan (sotuvdan olinganlar ro‘yxati) */
  ensureColumn('products', 'warehouse_delisted_at', 'TEXT');
  ensureColumn('products', 'warehouse_relisted_at', 'TEXT');
  /** Ombor soft-delete — mahsulot qatori saqlanadi, katalogdan yashirin */
  ensureColumn('products', 'warehouse_deleted_at', 'TEXT');
  /** Ilgari tasdiqlangan mahsulotlarda kirim qty bo‘sh qolgan bo‘lsa, stock bilan to‘ldirish */
  const whKirimBk = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('warehouse_kirim_qty_backfill_v1');
  if (String(whKirimBk?.value || '') !== '1') {
    db.prepare(
      `UPDATE products SET warehouse_kirim_qty = COALESCE(stock, 0)
        WHERE warehouse_approved_at IS NOT NULL AND COALESCE(warehouse_kirim_qty, 0) = 0`,
    ).run();
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('warehouse_kirim_qty_backfill_v1', '1');
  }
  /** Avval tasdiqlangan mahsulotlarda warehouse_kirim_stock_applied bo‘sh qolgan bo‘lsa, to‘ldirish */
  const whKirimAppliedBk = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('warehouse_kirim_stock_applied_backfill_v1');
  if (String(whKirimAppliedBk?.value || '') !== '1') {
    db.prepare(
      `UPDATE products SET warehouse_kirim_stock_applied = COALESCE(warehouse_kirim_qty, 0)
        WHERE warehouse_approved_at IS NOT NULL AND COALESCE(warehouse_kirim_stock_applied, 0) = 0`,
    ).run();
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('warehouse_kirim_stock_applied_backfill_v1', '1');
  }
  ensureColumn('seller_notifications', 'type', "TEXT NOT NULL DEFAULT 'info'");
  ensureColumn('seller_notifications', 'link_view', 'TEXT');
  ensureColumn('seller_notifications', 'is_read', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('user_notifications', 'link_type', 'TEXT');
  ensureColumn('user_notifications', 'link_id', 'INTEGER');
  ensureColumn('orders', 'courier_id', 'INTEGER REFERENCES staff_members(id)');
  ensureColumn('orders', 'packer_id', 'INTEGER REFERENCES staff_members(id)');
  ensureColumn('orders', 'is_test', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('orders', 'order_ip', 'TEXT');
  ensureColumn('orders', 'order_user_agent', 'TEXT');
  ensureColumn('orders', 'order_device', 'TEXT');
  ensureColumn('orders', 'order_location', 'TEXT');
  ensureColumn('orders', 'packer_batch_id', 'INTEGER REFERENCES packer_closed_batches(id)');
  ensureColumn('orders', 'expeditor_batch_id', 'INTEGER');
  ensureColumn('orders', 'courier_assigned_via', 'TEXT');
  ensureColumn('orders', 'status_updated_at', 'TEXT');
  /** Kuryer «sotilmadi / atkaz» deb bekor qilganda 1 — qabulchi paneli sariq ro‘yxat uchun */
  ensureColumn('orders', 'courier_unsold_return', 'INTEGER NOT NULL DEFAULT 0');
  /** Kuryer mahsulot qatori bo'yicha "uyda qoldi" belgilashi */
  ensureColumn('order_items', 'home_left_in_courier', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('staff_members', 'user_id', 'INTEGER REFERENCES users(id)');
  ensureColumn('staff_members', 'work_role_id', 'INTEGER REFERENCES work_roles(id)');
  ensureColumn('staff_members', 'balance', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('users', 'staff_member_id', 'INTEGER REFERENCES staff_members(id)');
  ensureColumn('staff_chat_archive', 'payload_json', 'TEXT');
  ensureColumn('withdrawal_requests', 'payout_method', "TEXT NOT NULL DEFAULT 'cash'");
  ensureColumn('sellers', 'coins', 'INTEGER NOT NULL DEFAULT 0');
  migrateWithdrawalRequestsSchemaV2();

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_device_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      device TEXT,
      location TEXT,
      order_id INTEGER REFERENCES orders(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_device_events_user ON user_device_events(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_user_device_events_type ON user_device_events(event_type, id DESC);

    CREATE TABLE IF NOT EXISTS user_oauth_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      profile_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, provider_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_oauth_user ON user_oauth_accounts(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_password_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      password_plain TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_password_history_user ON user_password_history(user_id, id DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      identifier TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
  `);

  db.prepare(`
    UPDATE users
    SET status = 'active'
    WHERE status IS NULL OR trim(COALESCE(status, '')) = ''
  `).run();

  /* Eski buyurtmalardan qurilma eventlarini bir martalik backfill */
  db.prepare(`
    INSERT INTO user_device_events (user_id, event_type, ip, user_agent, device, location, order_id, created_at)
    SELECT
      o.user_id,
      'order_backfill',
      o.order_ip,
      o.order_user_agent,
      o.order_device,
      o.order_location,
      o.id,
      COALESCE(NULLIF(trim(COALESCE(o.created_at, '')), ''), datetime('now'))
    FROM orders o
    WHERE o.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_device_events e WHERE e.order_id = o.id)
  `).run();

  /* User profilidagi bo‘sh monitoring maydonlarini mavjud orderlardan to‘ldirish */
  db.prepare(`
    UPDATE users
    SET
      registered_ip = COALESCE(
        NULLIF(trim(COALESCE(registered_ip, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_ip FROM orders o WHERE o.user_id = users.id ORDER BY o.id ASC LIMIT 1), '')), '')
      ),
      registered_device = COALESCE(
        NULLIF(trim(COALESCE(registered_device, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_device FROM orders o WHERE o.user_id = users.id ORDER BY o.id ASC LIMIT 1), '')), '')
      ),
      registered_location = COALESCE(
        NULLIF(trim(COALESCE(registered_location, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_location FROM orders o WHERE o.user_id = users.id ORDER BY o.id ASC LIMIT 1), '')), '')
      ),
      last_login_at = COALESCE(
        NULLIF(trim(COALESCE(last_login_at, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.created_at FROM orders o WHERE o.user_id = users.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ),
      last_login_ip = COALESCE(
        NULLIF(trim(COALESCE(last_login_ip, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_ip FROM orders o WHERE o.user_id = users.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ),
      last_login_device = COALESCE(
        NULLIF(trim(COALESCE(last_login_device, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_device FROM orders o WHERE o.user_id = users.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ),
      last_login_location = COALESCE(
        NULLIF(trim(COALESCE(last_login_location, '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_location FROM orders o WHERE o.user_id = users.id ORDER BY o.id DESC LIMIT 1), '')), '')
      )
    WHERE id IS NOT NULL
  `).run();

  db.prepare(`
    UPDATE orders SET
      status_updated_at = COALESCE(
        NULLIF(trim(COALESCE(status_updated_at, '')), ''),
        NULLIF(trim(COALESCE(created_at, '')), ''),
        datetime('now')
      )
    WHERE status_updated_at IS NULL OR trim(COALESCE(status_updated_at, '')) = ''
  `).run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS work_role_ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_role_id INTEGER NOT NULL REFERENCES work_roles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      title TEXT,
      note TEXT,
      ref_kind TEXT,
      ref_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wr_ledger_role_time ON work_role_ledger_entries(work_role_id, id DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_message_id TEXT NOT NULL,
      thread_key TEXT NOT NULL,
      sender_user_id INTEGER NOT NULL REFERENCES users(id),
      message_type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_dm_client ON staff_direct_messages(client_message_id);
    CREATE INDEX IF NOT EXISTS idx_staff_dm_thread_id ON staff_direct_messages(thread_key, id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_chat_presence (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_room TEXT NOT NULL DEFAULT 'sklad',
      state TEXT NOT NULL DEFAULT 'idle',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, chat_room)
    );
    CREATE INDEX IF NOT EXISTS idx_staff_presence_room_updated ON staff_chat_presence(chat_room, updated_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS courier_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      courier_staff_id INTEGER NOT NULL REFERENCES staff_members(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      channel TEXT NOT NULL DEFAULT 'customer',
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_courier_call_logs_staff ON courier_call_logs(courier_staff_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_courier_call_logs_order ON courier_call_logs(order_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lichka_dm_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('out', 'in')),
      counterpart_key TEXT NOT NULL,
      counterpart_label TEXT NOT NULL DEFAULT '',
      call_mode TEXT NOT NULL DEFAULT 'voice',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lichka_dm_call_logs_owner ON lichka_dm_call_logs(owner_user_id, id DESC);
  `);
  ensureColumn('lichka_dm_call_logs', 'call_mode', "TEXT NOT NULL DEFAULT 'voice'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_call_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id),
      vapi_call_id TEXT,
      event_type TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_call_transcripts_order ON ai_call_transcripts(order_id, id DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS packer_closed_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packer_staff_id INTEGER NOT NULL REFERENCES staff_members(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_packer_closed_batches_staff ON packer_closed_batches(packer_staff_id, id DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS expeditor_closed_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expeditor_user_id INTEGER REFERENCES users(id),
      courier_staff_id INTEGER NOT NULL REFERENCES staff_members(id),
      viloyat_id TEXT,
      closed_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'assigned'
    );
    CREATE INDEX IF NOT EXISTS idx_expeditor_closed_batches_courier ON expeditor_closed_batches(courier_staff_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_expeditor_closed_batches_closed ON expeditor_closed_batches(closed_at DESC);
  `);
  
  try {
    db.exec("ALTER TABLE expeditor_closed_batches ADD COLUMN status TEXT NOT NULL DEFAULT 'assigned'");
  } catch (e) {
    // column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      operator_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_operator_earnings_operator ON operator_earnings(operator_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_operator_earnings_order ON operator_earnings(order_id)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS target_affiliate_streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INTEGER REFERENCES sellers(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      stream_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_target_streams_user ON target_affiliate_streams(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_target_streams_product ON target_affiliate_streams(product_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS target_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_target_favorites_user ON target_favorites(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_target_favorites_product ON target_favorites(product_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS seller_coin_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      ref_kind TEXT,
      ref_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_seller_coin_ledger_seller ON seller_coin_ledger(seller_id, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_coin_ledger_ref ON seller_coin_ledger(seller_id, kind, ref_kind, ref_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS seller_order_earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      commission REAL NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(seller_id, order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_seller_order_earnings_seller ON seller_order_earnings(seller_id, id DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS superuser_staff_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      target_role TEXT NOT NULL,
      tasks_description TEXT NOT NULL DEFAULT '',
      admin_user_ids_json TEXT NOT NULL DEFAULT '[]',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_superuser_staff_groups_target ON superuser_staff_groups(target_role);
    CREATE INDEX IF NOT EXISTS idx_superuser_staff_groups_created ON superuser_staff_groups(id DESC);
  `);

  /**
   * Rol-asosidagi guruh chatlari (Telegram guruhlariga o'xshash):
   * - chat_groups: guruhning o'zi (5ta standart: kuryer/seller/operator/targetolog/sklad + superuser
   *   yaratgan istalgan qo'shimcha guruh).
   * - chat_group_roles: guruhga qaysi `users.role` qiymatlari AVTOMATIK a'zo qiladi (sklad — 4ta rol).
   * - chat_group_members: HAQIQIY a'zolik — avtomatik (rol orqali) yoki qo'lda taklif qilingan;
   *   har birining guruh ichidagi holati (admin/a'zo) shu yerda saqlanadi.
   * - chat_group_messages: guruh ichidagi yozishmalar.
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'custom',
      tasks_description TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_groups_kind ON chat_groups(kind);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_group_roles (
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      member_role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (group_id, role)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_group_members (
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_role TEXT NOT NULL DEFAULT 'member',
      source TEXT NOT NULL DEFAULT 'invited',
      added_by INTEGER REFERENCES users(id),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_group_members_user ON chat_group_members(user_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_group_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      client_message_id TEXT NOT NULL,
      sender_user_id INTEGER NOT NULL REFERENCES users(id),
      message_type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_client ON chat_group_messages(group_id, client_message_id);
    CREATE INDEX IF NOT EXISTS idx_cgm_group_created ON chat_group_messages(group_id, id);
  `);

  /**
   * O'qilgan/o'qilmagan xabar holati — HAR BIR foydalanuvchi uchun, HAR BIR
   * suhbat (thread_key: 'dm:a-b', 'group:5', yoki 'myshop') bo'yicha oxirgi
   * o'qilgan xabar id'si. Shu jadval orqali "Barchasi" ro'yxatida hali
   * OCHILMAGAN suhbatlar uchun ham to'g'ri "o'qilmagan" belgisi chiqariladi
   * (avval bu FAQAT joriy sessiyada ochilgan suhbatlar uchun ishlar edi).
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_read_state (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      thread_key TEXT NOT NULL,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, thread_key)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL DEFAULT 'http',
      actor_user_id INTEGER REFERENCES users(id),
      actor_label TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status_code INTEGER,
      summary_original TEXT NOT NULL DEFAULT '',
      payload_original TEXT NOT NULL DEFAULT '',
      summary_edited TEXT,
      note_superuser TEXT,
      payload_edited TEXT,
      edited_at TEXT,
      edited_by_user_id INTEGER REFERENCES users(id),
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_project_audit_created ON project_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_audit_actor ON project_audit_log(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_project_audit_hidden ON project_audit_log(hidden, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      module TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      user_id INTEGER REFERENCES users(id),
      ip_address TEXT,
      old_value TEXT,
      new_value TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_logs_module ON event_logs(module, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_logs_entity ON event_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_event_logs_user ON event_logs(user_id, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_user_id INTEGER REFERENCES users(id),
      lead_id INTEGER REFERENCES product_leads(id),
      order_id INTEGER REFERENCES orders(id),
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      details_json TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customer_timeline_customer ON customer_timeline(customer_user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_timeline_lead ON customer_timeline(lead_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_timeline_order ON customer_timeline(order_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_timeline_event ON customer_timeline(event_type, id DESC);
  `);

  const normalizeLogin = (value, fallback) => {
    let out = String(value || '').trim().toLowerCase();
    if (out.includes('@')) out = out.split('@')[0];
    out = out
      .replace(/[^a-z0-9._-]+/g, '.')
      .replace(/[._-]{2,}/g, '.')
      .replace(/^[._-]+|[._-]+$/g, '');
    if (!out) out = String(fallback || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!out) out = 'user';
    if (out.length > 40) out = out.slice(0, 40);
    if (out.length < 3) out = `${out}001`.slice(0, 3);
    return out;
  };

  const usersForLogin = db.prepare('SELECT id, email, full_name, login FROM users ORDER BY id').all();
  const setUserLogin = db.prepare('UPDATE users SET login = ? WHERE id = ?');
  const usedLogins = new Set();

  for (const row of usersForLogin) {
    const source = row.login || row.email || row.full_name || `user${row.id}`;
    const base = normalizeLogin(source, `user${row.id}`);
    let candidate = base;
    let suffix = 1;

    while (usedLogins.has(candidate)) {
      const suffixText = String(suffix++);
      const maxBaseLen = Math.max(3, 40 - suffixText.length);
      candidate = `${base.slice(0, maxBaseLen)}${suffixText}`;
    }

    usedLogins.add(candidate);
    if (String(row.login || '') !== candidate) {
      setUserLogin.run(candidate, row.id);
    }
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_unique
    ON users(lower(login))
    WHERE login IS NOT NULL AND login != '';
  `);
  const rolesExist = db.prepare('SELECT COUNT(*) as c FROM roles').get().c > 0;
  if (!rolesExist) {
    db.prepare('INSERT INTO roles (id, name) VALUES (1, ?), (2, ?)').run('superuser', 'customer');
    const defaultPages = [
      ['/', 'Bosh sahifa'],
      ['/products', 'Mahsulotlar'],
      ['/cart', 'Savat'],
      ['/checkout', 'Buyurtma berish'],
      ['/orders', 'Buyurtmalarim'],
      ['/profile', 'Profil'],
      ['/login', 'Kirish'],
      ['/register', "Ro'yxatdan o'tish"],
      ['/admin', 'Boshqaruv paneli'],
    ];

    const insPage = db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)');
    for (const [path, label] of defaultPages) insPage.run(path, label);

    const insRP = db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)');
    for (const [path] of defaultPages) {
      if (path !== '/admin') insRP.run(2, path);
    }
    db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (1, ?)').run('*');
  }

  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/admin', 'Boshqaruv paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/seller', 'Seller paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/target', 'Target paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/courier', 'Kuryer paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/operator', 'Operator paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/picker', 'Picker paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/packer', 'Packer paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/expeditor', 'Ekspeditor paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/qabul', 'Buyurtma qabul qiluvchi paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/warehouse-admin', 'Ombor admin paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/accounting', 'Buxgalteriya paneli');
  db.prepare('INSERT OR IGNORE INTO pages (path, label_uz) VALUES (?, ?)').run('/profile', 'Profil');
  const customerRoleIdForProfile = db.prepare('SELECT id FROM roles WHERE lower(name) = ?').get('customer')?.id;
  if (customerRoleIdForProfile != null) {
    db.prepare('INSERT OR IGNORE INTO role_pages (role_id, page_path) VALUES (?, ?)').run(
      customerRoleIdForProfile,
      '/profile',
    );
  }
  db.prepare("DELETE FROM role_pages WHERE role_id = 2 AND page_path = '/admin'").run();

  const hasCourierRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('courier');
  if (!hasCourierRole) {
    db.prepare('INSERT INTO roles (name) VALUES (?)').run('courier');
    const courierRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('courier').id;
    db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)').run(courierRoleId, '/courier');
  }
  const hasOperatorRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('operator');
  if (!hasOperatorRole) {
    db.prepare('INSERT INTO roles (name) VALUES (?)').run('operator');
    const operatorRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('operator').id;
    db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)').run(operatorRoleId, '/operator');
  }
  for (const rname of ['picker', 'packer', 'expeditor', 'order_receiver']) {
    const hasR = db.prepare('SELECT id FROM roles WHERE name = ?').get(rname);
    if (!hasR) {
      db.prepare('INSERT INTO roles (name) VALUES (?)').run(rname);
      const rid = db.prepare('SELECT id FROM roles WHERE name = ?').get(rname).id;
      const pagePath = rname === 'order_receiver' ? '/qabul' : `/${rname}`;
      db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)').run(rid, pagePath);
    }
  }

  for (const { name, pagePath } of [
    { name: 'seller', pagePath: '/seller' },
    { name: 'target', pagePath: '/target' },
    { name: 'warehouse_admin', pagePath: '/warehouse-admin' },
    { name: 'accounting', pagePath: '/accounting' },
  ]) {
    const hasR = db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
    if (!hasR) {
      db.prepare('INSERT INTO roles (name) VALUES (?)').run(name);
      const rid = db.prepare('SELECT id FROM roles WHERE name = ?').get(name).id;
      db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)').run(rid, pagePath);
    }
  }

  const existingProductRows = db.prepare('SELECT id, price, operator_share_percent, site_fee_percent FROM products').all();
  const updateProductShares = db.prepare(`
    UPDATE products
    SET operator_share_amount = ?, site_fee_amount = ?, seller_net_amount = ?
    WHERE id = ?
  `);
  for (const row of existingProductRows) {
    const price = Number(row.price || 0);
    const opPercent = Number(row.operator_share_percent || 0);
    const sitePercent = Number(row.site_fee_percent || 0);
    const operatorAmount = (price * opPercent) / 100;
    const siteAmount = (price * sitePercent) / 100;
    const sellerNet = price - operatorAmount - siteAmount;
    updateProductShares.run(operatorAmount, siteAmount, sellerNet, row.id);
  }

  const hasSuperuser = db.prepare('SELECT id FROM users WHERE role = ? OR role_id = 1').get('superuser');
  if (!hasSuperuser) {
    const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (first) db.prepare('UPDATE users SET role = ?, role_id = 1 WHERE id = ?').run('superuser', first.id);
  }

  db.prepare('UPDATE users SET role_id = 1 WHERE role = ?').run('superuser');
  db.prepare('UPDATE users SET role_id = 2 WHERE role != ? AND (role_id IS NULL OR role_id = 0)').run('superuser');

  const regionCount = db.prepare('SELECT COUNT(*) as c FROM regions').get().c;
  if (regionCount === 0) {
    const ins = db.prepare('INSERT INTO regions (name, delivery_fee, active) VALUES (?, ?, ?)');
    ins.run('Toshkent', 20000, 1);
    ins.run('Samarqand', 28000, 1);
    ins.run('Buxoro', 30000, 1);
    ins.run('Andijon', 32000, 1);
  }

  const sellersWithEmail = db.prepare(`
    SELECT id, email, name, user_id
    FROM sellers
    WHERE IFNULL(email, '') != ''
    ORDER BY id
  `).all();

  const defaultSellerPasswordHash = bcrypt.hashSync('Seller123!', 12);
  const insertUser = db.prepare('INSERT INTO users (email, password_hash, full_name, role, role_id, seller_id) VALUES (?, ?, ?, ?, ?, ?)');
  const setSellerUser = db.prepare('UPDATE sellers SET user_id = ? WHERE id = ?');
  const setUserSeller = db.prepare('UPDATE users SET seller_id = ?, role = ?, role_id = ? WHERE id = ?');

  for (const seller of sellersWithEmail) {
    const existingUserBySeller = seller.user_id ? db.prepare('SELECT id FROM users WHERE id = ?').get(seller.user_id) : null;
    if (existingUserBySeller) {
      setUserSeller.run(seller.id, 'seller', 2, seller.user_id);
      continue;
    }

    const existingUserByEmail = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(seller.email);
    if (existingUserByEmail) {
      setSellerUser.run(existingUserByEmail.id, seller.id);
      setUserSeller.run(seller.id, 'seller', 2, existingUserByEmail.id);
      continue;
    }

    const result = insertUser.run(seller.email, defaultSellerPasswordHash, seller.name, 'seller', 2, seller.id);
    setSellerUser.run(result.lastInsertRowid, seller.id);
  }

  const sellerNotifCount = db.prepare('SELECT COUNT(*) as c FROM seller_notifications').get().c;
  if (sellerNotifCount === 0) {
    const sampleSellers = db.prepare('SELECT id, name FROM sellers ORDER BY id LIMIT 5').all();
    const insNotif = db.prepare(`
      INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const dbDate = (offsetDays = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };

    for (const seller of sampleSellers) {
      insNotif.run(
        seller.id,
        'Panelga xush kelibsiz',
        `${seller.name} uchun seller panel tayyorlandi.`,
        'info',
        'dashboard',
        0,
        dbDate(0)
      );

      insNotif.run(
        seller.id,
        'Kunlik eslatma',
        'Bugungi buyurtma va mahsulotlarni tekshiring.',
        'warning',
        'products',
        0,
        dbDate(-1)
      );
    }
  }
  try {
    ensureAccountingErpSchema();
  } catch (e) {
    console.warn('[MyShop] ensureAccountingErpSchema:', e?.message || e);
  }
  try {
    ensureDefaultChatGroupsSeed();
  } catch (e) {
    console.warn('[MyShop] ensureDefaultChatGroupsSeed:', e?.message || e);
  }
}

/**
 * 5ta standart rol-guruhini bir martalik (idempotent) yaratadi:
 * Kuryer / Seller / Operator / Targetolog / Sklad (ekspeditor+qabul+packer+picker).
 * Ombor admini (`warehouse_admin`) barcha standart guruhlarda avtomatik ADMIN bo'ladi.
 */
function ensureDefaultChatGroupsSeed() {
  const DEFAULT_GROUPS = [
    {
      slug: 'kuryer',
      title: 'Kuryerlar',
      roles: [
        ['courier', 'member'],
        ['warehouse_admin', 'admin'],
      ],
    },
    {
      slug: 'seller',
      title: 'Sotuvchilar (Seller)',
      roles: [
        ['seller', 'member'],
        ['warehouse_admin', 'admin'],
      ],
    },
    {
      slug: 'operator',
      title: 'Operatorlar',
      roles: [
        ['operator', 'member'],
        ['warehouse_admin', 'admin'],
      ],
    },
    {
      slug: 'targetolog',
      title: 'Targetologlar',
      roles: [
        ['target', 'member'],
        ['warehouse_admin', 'admin'],
      ],
    },
    {
      slug: 'sklad',
      title: 'Sklad',
      roles: [
        ['expeditor', 'member'],
        ['order_receiver', 'member'],
        ['packer', 'member'],
        ['picker', 'member'],
        ['warehouse_admin', 'admin'],
      ],
    },
  ];
  const insGroup = db.prepare(
    `INSERT OR IGNORE INTO chat_groups (slug, title, kind) VALUES (?, ?, 'default')`,
  );
  const getGroupId = db.prepare('SELECT id FROM chat_groups WHERE slug = ?');
  const insRole = db.prepare(
    `INSERT OR IGNORE INTO chat_group_roles (group_id, role, member_role) VALUES (?, ?, ?)`,
  );
  for (const g of DEFAULT_GROUPS) {
    insGroup.run(g.slug, g.title);
    const row = getGroupId.get(g.slug);
    if (!row) continue;
    for (const [role, memberRole] of g.roles) {
      insRole.run(row.id, role, memberRole);
    }
  }
}

/** Sklad ish ro‘yi bo‘yicha tarix: jarima, mukofot, balans. */
export function insertWorkRoleLedgerEntry({
  work_role_id: workRoleId,
  kind,
  amount,
  title = null,
  note = null,
  ref_kind: refKind = null,
  ref_id: refId = null,
}) {
  if (!workRoleId || !kind) return;
  const amt = Number(amount);
  if (!Number.isFinite(amt)) return;
  db.prepare(
    `INSERT INTO work_role_ledger_entries (work_role_id, kind, amount, title, note, ref_kind, ref_id)
     VALUES (?,?,?,?,?,?,?)`
  ).run(workRoleId, String(kind), amt, title, note, refKind, refId ?? null);
}

export function getUserAllowedPages(user) {
  const role = String(user?.role || '').toLowerCase();
  /** Har qanday kirgan foydalanuvchi o‘z profilini ochishi kerak (ism, parol, tema). */
  if (role === 'seller') return ['/seller', '/profile'];
  if (role === 'target') return ['/target', '/profile'];
  /* Bazida `seller_id` bor, lekin `role` hali customer — panel va /profile */
  if (Number(user?.seller_id) > 0 && (role === 'customer' || role === '')) {
    return ['/seller', '/profile'];
  }
  if (role === 'courier') return ['/courier', '/profile'];
  if (role === 'operator') return ['/operator', '/profile'];
  if (role === 'picker') return ['/picker', '/profile'];
  if (role === 'packer') return ['/packer', '/profile'];
  if (role === 'expeditor') return ['/expeditor', '/profile'];
  if (role === 'order_receiver') return ['/qabul', '/profile'];
  if (role === 'warehouse_admin') return ['/warehouse-admin', '/profile'];
  if (role === 'accounting') {
    return ['/', '/accounting', '/profile'];
  }
  if (role === 'superuser' || user.role_id === 1) return ['*'];
  const rows = db.prepare('SELECT page_path FROM role_pages WHERE role_id = ?').all(user.role_id || 2);
  const paths = rows.map((r) => r.page_path);
  if (!paths.includes('/profile')) paths.push('/profile');
  return paths;
}






