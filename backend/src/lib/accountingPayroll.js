import axios from 'axios';
import { db } from '../db/database.js';

const ACCOUNTING_AUTOMATION_INTERVAL_MS = Math.max(
  60_000,
  Number.parseInt(String(process.env.ACCOUNTING_AUTOMATION_INTERVAL_MS || '300000'), 10) || 300_000,
);

let accountingAutomationScheduled = false;
let lastEnsureAt = 0;

const DEFAULT_EXPENSE_CATEGORIES = [
  { slug: 'shop-expense', labelUz: 'Do‘kon xarajatlari', color: '#8b5cf6', icon: 'store' },
  { slug: 'payroll', labelUz: 'Xodimlar ish haqi', color: '#2563eb', icon: 'wallet' },
  { slug: 'utilities', labelUz: 'Kommunal to‘lovlar', color: '#f97316', icon: 'zap' },
  { slug: 'transport', labelUz: 'Transport', color: '#22c55e', icon: 'truck' },
  { slug: 'marketing', labelUz: 'Marketing', color: '#ec4899', icon: 'megaphone' },
  { slug: 'other-expense', labelUz: 'Boshqa xarajatlar', color: '#64748b', icon: 'circle' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { slug: 'product-sales', labelUz: 'Mahsulot savdosi', color: '#10b981', icon: 'shopping-bag' },
  { slug: 'manual-income', labelUz: 'Qo‘lda kiritilgan tushum', color: '#0ea5e9', icon: 'hand-coins' },
  { slug: 'service-income', labelUz: 'Xizmat daromadi', color: '#a855f7', icon: 'briefcase-business' },
];

function toJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toSqlDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSqlDateTime(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseRatio(value, fallback = 0.5) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return fallback;
  if (ratio <= 0) return 0.5;
  if (ratio >= 1) return 0.5;
  return ratio;
}

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getMonthMeta(year, month) {
  const y = safeInt(year, new Date().getFullYear());
  const m = Math.min(12, Math.max(1, safeInt(month, new Date().getMonth() + 1)));
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const advanceEndDay = Math.min(15, daysInMonth);
  const finalStartDay = Math.min(16, daysInMonth);
  return {
    year: y,
    month: m,
    daysInMonth,
    monthStart,
    monthEnd,
    advanceEndDay,
    finalStartDay,
  };
}

function getRoleDefaults(roleKey) {
  const key = String(roleKey || '').trim().toLowerCase();
  if (key === 'superuser') {
    return { monthlySalary: 8_500_000, department: 'Boshqaruv', jobTitle: 'Superuser' };
  }
  if (key === 'accounting') {
    return { monthlySalary: 6_500_000, department: 'Moliya', jobTitle: 'Buxgalter' };
  }
  if (key === 'warehouse_admin') {
    return { monthlySalary: 5_800_000, department: 'Ombor', jobTitle: 'Ombor admini' };
  }
  if (key === 'operator') {
    return { monthlySalary: 4_500_000, department: 'Sotuv', jobTitle: 'Operator' };
  }
  if (key === 'seller') {
    return { monthlySalary: 5_000_000, department: 'Savdo', jobTitle: 'Seller' };
  }
  if (key === 'courier' || key === 'kuryer') {
    return { monthlySalary: 3_800_000, department: 'Logistika', jobTitle: 'Kuryer' };
  }
  if (key === 'packer') {
    return { monthlySalary: 3_400_000, department: 'Ombor', jobTitle: 'Packer' };
  }
  if (key === 'picker') {
    return { monthlySalary: 3_400_000, department: 'Ombor', jobTitle: 'Picker' };
  }
  if (key === 'expeditor') {
    return { monthlySalary: 4_400_000, department: 'Logistika', jobTitle: 'Ekspeditor' };
  }
  return { monthlySalary: 3_000_000, department: 'Operatsiya', jobTitle: 'Xodim' };
}

function deriveRoleKeyFromRow(row) {
  const portalRole = String(row?.portal_role || '').trim().toLowerCase();
  if (portalRole) return portalRole;
  const userRole = String(row?.user_role || '').trim().toLowerCase();
  if (userRole) return userRole;
  const rawRole = String(row?.role_name || '').trim().toLowerCase();
  if (rawRole.includes('buxgalter')) return 'accounting';
  if (rawRole.includes('operator')) return 'operator';
  if (rawRole.includes('seller')) return 'seller';
  if (rawRole.includes('courier') || rawRole.includes('kuryer')) return 'courier';
  if (rawRole.includes('picker')) return 'picker';
  if (rawRole.includes('packer') || rawRole.includes('qadoq')) return 'packer';
  if (rawRole.includes('ombor')) return 'warehouse_admin';
  return rawRole || 'staff';
}

function buildEmployeeCode(seedValue) {
  return `EMP-${String(seedValue || Date.now()).padStart(4, '0')}`;
}

function resolveSafeUniqueValue(selectStatement, candidateValue, existingId = null, fallbackValue = null) {
  if (candidateValue == null) return fallbackValue ?? null;
  const owner = selectStatement.get(candidateValue);
  if (owner && Number(owner.id) !== Number(existingId)) {
    return fallbackValue ?? null;
  }
  return candidateValue;
}

export function logAccountingAudit({ actorUserId = null, action, entityType, entityId = null, payload = null }) {
  if (!action || !entityType) return;
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(actorUserId, String(action), String(entityType), entityId, payload ? toJson(payload) : null, toSqlDateTime());
}

function seedAccountingCategories() {
  const insertExpense = db.prepare(
    `INSERT OR IGNORE INTO expense_categories (slug, label_uz, color, icon, is_active, sort_order)
     VALUES (?, ?, ?, ?, 1, ?)`,
  );
  const insertIncome = db.prepare(
    `INSERT OR IGNORE INTO income_categories (slug, label_uz, color, icon, is_active, sort_order)
     VALUES (?, ?, ?, ?, 1, ?)`,
  );
  DEFAULT_EXPENSE_CATEGORIES.forEach((item, index) => {
    insertExpense.run(item.slug, item.labelUz, item.color, item.icon, index + 1);
  });
  DEFAULT_INCOME_CATEGORIES.forEach((item, index) => {
    insertIncome.run(item.slug, item.labelUz, item.color, item.icon, index + 1);
  });
}

export function syncAccountingEmployees() {
  const workRoleRows = db
    .prepare(
      `
      SELECT
        wr.id AS work_role_id,
        wr.portal_role,
        wr.role_name,
        wr.login AS work_role_login,
        wr.email AS work_role_email,
        wr.phone AS work_role_phone,
        wr.total_amount,
        u.id AS user_id,
        u.role AS user_role,
        u.role_id AS user_role_id,
        u.staff_member_id,
        u.phone AS user_phone,
        u.full_name AS user_full_name,
        sm.id AS resolved_staff_member_id,
        sm.full_name AS staff_full_name,
        sm.phone AS staff_phone
      FROM work_roles wr
      LEFT JOIN users u
        ON (
          (length(trim(ifnull(wr.login, ''))) > 0 AND lower(trim(u.login)) = lower(trim(wr.login)))
          OR (length(trim(ifnull(wr.email, ''))) > 0 AND lower(trim(ifnull(u.email, ''))) = lower(trim(ifnull(wr.email, ''))))
        )
      LEFT JOIN staff_members sm
        ON (
          (sm.user_id = u.id OR sm.id = u.staff_member_id)
          OR (
            length(trim(ifnull(sm.phone, ''))) > 0
            AND length(trim(ifnull(wr.phone, ''))) > 0
            AND trim(sm.phone) = trim(wr.phone)
          )
        )
      WHERE wr.deleted_at IS NULL
      ORDER BY wr.id ASC
    `,
    )
    .all();

  const superuserRows = db
    .prepare(
      `
      SELECT
        NULL AS work_role_id,
        'superuser' AS portal_role,
        'Superuser' AS role_name,
        u.login AS work_role_login,
        u.email AS work_role_email,
        u.phone AS work_role_phone,
        0 AS total_amount,
        u.id AS user_id,
        u.role AS user_role,
        u.role_id AS user_role_id,
        u.staff_member_id,
        u.phone AS user_phone,
        u.full_name AS user_full_name,
        sm.id AS resolved_staff_member_id,
        sm.full_name AS staff_full_name,
        sm.phone AS staff_phone
      FROM users u
      LEFT JOIN staff_members sm ON (sm.id = u.staff_member_id OR sm.user_id = u.id)
      WHERE lower(trim(ifnull(u.role, ''))) = 'superuser' OR u.role_id = 1
      ORDER BY u.id ASC
    `,
    )
    .all();

  const rows = [...workRoleRows, ...superuserRows];
  const selectByWorkRole = db.prepare(`SELECT * FROM employees WHERE work_role_id = ? LIMIT 1`);
  const selectByUser = db.prepare(`SELECT * FROM employees WHERE user_id = ? LIMIT 1`);
  const selectByStaff = db.prepare(`SELECT * FROM employees WHERE staff_member_id = ? LIMIT 1`);
  const updateEmployee = db.prepare(
    `UPDATE employees
     SET user_id = ?, work_role_id = ?, staff_member_id = ?, full_name = ?, phone = ?, department = ?, job_title = ?,
         user_role_snapshot = ?, is_superuser_employee = ?, payroll_enabled = ?, updated_at = ?
     WHERE id = ?`,
  );
  const insertEmployee = db.prepare(
    `INSERT INTO employees (
      employee_code, user_id, work_role_id, staff_member_id, full_name, department, job_title, phone,
      monthly_salary, advance_day, final_day, advance_ratio, payroll_enabled, telegram_chat_id,
      user_role_snapshot, is_superuser_employee, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, 30, ?, 1, NULL, ?, ?, NULL, ?, ?)`,
  );

  rows.forEach((row) => {
    const roleKey = deriveRoleKeyFromRow(row);
    const defaults = getRoleDefaults(roleKey);
    const fullName =
      String(row.staff_full_name || row.user_full_name || row.role_name || row.work_role_login || row.work_role_email || '')
        .trim() || 'Xodim';
    const phone = String(row.staff_phone || row.user_phone || row.work_role_phone || '').trim();
    const staffMemberId = Number(row.resolved_staff_member_id || row.staff_member_id) || null;
    const userId = Number(row.user_id) || null;
    const workRoleId = Number(row.work_role_id) || null;
    const isSuperuserEmployee =
      roleKey === 'superuser' || Number(row.user_role_id) === 1 || String(row.user_role || '').trim().toLowerCase() === 'superuser'
        ? 1
        : 0;

    const existing =
      (workRoleId ? selectByWorkRole.get(workRoleId) : null) ||
      (userId ? selectByUser.get(userId) : null) ||
      (staffMemberId ? selectByStaff.get(staffMemberId) : null);

    const safeUserId = resolveSafeUniqueValue(selectByUser, userId, existing?.id, existing?.user_id ?? null);
    const safeWorkRoleId = resolveSafeUniqueValue(
      selectByWorkRole,
      workRoleId,
      existing?.id,
      existing?.work_role_id ?? null,
    );
    const safeStaffMemberId = resolveSafeUniqueValue(
      selectByStaff,
      staffMemberId,
      existing?.id,
      existing?.staff_member_id ?? null,
    );

    if (existing) {
      updateEmployee.run(
        safeUserId,
        safeWorkRoleId,
        safeStaffMemberId,
        fullName,
        existing.phone || phone || '',
        existing.department || defaults.department,
        existing.job_title || defaults.jobTitle,
        roleKey,
        isSuperuserEmployee,
        existing.payroll_enabled == null ? 1 : existing.payroll_enabled,
        toSqlDateTime(),
        existing.id,
      );

      if (!Number(existing.monthly_salary) || Number(existing.monthly_salary) <= 0) {
        const fallbackSalary =
          Number(row.total_amount) > 100_000 ? Number(row.total_amount) : defaults.monthlySalary;
        db.prepare('UPDATE employees SET monthly_salary = ?, updated_at = ? WHERE id = ?').run(
          fallbackSalary,
          toSqlDateTime(),
          existing.id,
        );
      }
      return;
    }

    const fallbackSalary = Number(row.total_amount) > 100_000 ? Number(row.total_amount) : defaults.monthlySalary;
    const result = insertEmployee.run(
      buildEmployeeCode(userId || workRoleId || staffMemberId || Date.now()),
      safeUserId,
      safeWorkRoleId,
      safeStaffMemberId,
      fullName,
      defaults.department,
      defaults.jobTitle,
      phone,
      fallbackSalary,
      0.5,
      roleKey,
      isSuperuserEmployee,
      toSqlDateTime(),
      toSqlDateTime(),
    );

    logAccountingAudit({
      actorUserId: null,
      action: 'employee.synced',
      entityType: 'employee',
      entityId: result.lastInsertRowid,
      payload: { userId, workRoleId, roleKey },
    });
  });
}

function upsertPayrollCycle({
  employeeId,
  year,
  month,
  cycleType,
  cycleStart,
  cycleEnd,
  dueDate,
  grossAmount,
}) {
  const existing = db
    .prepare(
      `SELECT id, paid_amount, remaining_amount, gross_amount
       FROM payroll_cycles
       WHERE employee_id = ? AND payroll_year = ? AND payroll_month = ? AND cycle_type = ?
       LIMIT 1`,
    )
    .get(employeeId, year, month, cycleType);

  if (!existing) {
    db.prepare(
      `INSERT INTO payroll_cycles (
        employee_id, payroll_year, payroll_month, cycle_type, cycle_start, cycle_end, due_date,
        gross_amount, paid_amount, remaining_amount, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?)`,
    ).run(
      employeeId,
      year,
      month,
      cycleType,
      cycleStart,
      cycleEnd,
      dueDate,
      roundMoney(grossAmount),
      roundMoney(grossAmount),
      toSqlDateTime(),
      toSqlDateTime(),
    );
    return;
  }

  const paidAmount = roundMoney(existing.paid_amount || 0);
  const gross = roundMoney(grossAmount);
  const remainingAmount = Math.max(0, roundMoney(gross - paidAmount));
  db.prepare(
    `UPDATE payroll_cycles
     SET cycle_start = ?, cycle_end = ?, due_date = ?, gross_amount = ?, remaining_amount = ?, updated_at = ?
     WHERE id = ?`,
  ).run(cycleStart, cycleEnd, dueDate, gross, remainingAmount, toSqlDateTime(), existing.id);
}

export function ensurePayrollCycles({ monthsBack = 2, monthsForward = 1 } = {}) {
  const employees = db.prepare(`SELECT * FROM employees WHERE payroll_enabled = 1 ORDER BY id ASC`).all();
  const today = new Date();
  employees.forEach((employee) => {
    const monthlySalary = Math.max(0, Number(employee.monthly_salary) || 0);
    const advanceRatio = parseRatio(employee.advance_ratio, 0.5);
    const advanceAmount = roundMoney(monthlySalary * advanceRatio);
    const finalAmount = roundMoney(monthlySalary - advanceAmount);

    for (let offset = -monthsBack; offset <= monthsForward; offset += 1) {
      const cursor = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const meta = getMonthMeta(cursor.getFullYear(), cursor.getMonth() + 1);
      const advanceDueDate = `${meta.year}-${String(meta.month).padStart(2, '0')}-${String(
        Math.min(Math.max(1, Number(employee.advance_day) || 15), meta.daysInMonth),
      ).padStart(2, '0')}`;
      const finalDueDate = `${meta.year}-${String(meta.month).padStart(2, '0')}-${String(meta.daysInMonth).padStart(2, '0')}`;
      const advanceEndDate = `${meta.year}-${String(meta.month).padStart(2, '0')}-${String(meta.advanceEndDay).padStart(2, '0')}`;
      const finalStartDate = `${meta.year}-${String(meta.month).padStart(2, '0')}-${String(meta.finalStartDay).padStart(2, '0')}`;

      upsertPayrollCycle({
        employeeId: employee.id,
        year: meta.year,
        month: meta.month,
        cycleType: 'advance',
        cycleStart: meta.monthStart,
        cycleEnd: advanceEndDate,
        dueDate: advanceDueDate,
        grossAmount: advanceAmount,
      });

      upsertPayrollCycle({
        employeeId: employee.id,
        year: meta.year,
        month: meta.month,
        cycleType: 'final',
        cycleStart: finalStartDate,
        cycleEnd: meta.monthEnd,
        dueDate: finalDueDate,
        grossAmount: finalAmount,
      });
    }
  });
}

async function sendTelegramMessage({ chatId, text }) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const fallbackChatId = String(process.env.TELEGRAM_ACCOUNTING_CHAT_ID || '').trim();
  const targetChatId = String(chatId || fallbackChatId || '').trim();
  if (!botToken || !targetChatId || !text) return { ok: false, skipped: true };

  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: targetChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return { ok: true };
  } catch (error) {
    console.error('[accounting/telegram]', error?.response?.data || error?.message || error);
    return { ok: false, error: error?.message || 'Telegram yuborilmadi.' };
  }
}

export async function refreshPayrollCycleStatuses() {
  const rows = db
    .prepare(
      `SELECT pc.*, e.full_name, e.telegram_chat_id
       FROM payroll_cycles pc
       INNER JOIN employees e ON e.id = pc.employee_id
       WHERE e.payroll_enabled = 1
       ORDER BY pc.id ASC`,
    )
    .all();

  const today = toSqlDate();
  for (const row of rows) {
    const grossAmount = roundMoney(row.gross_amount || 0);
    const paidAmount = roundMoney(row.paid_amount || 0);
    const remainingAmount = Math.max(0, roundMoney(grossAmount - paidAmount));
    let status = 'pending';
    if (remainingAmount <= 0.009) status = 'paid';
    else if (String(row.due_date || '') < today) status = 'overdue';

    db.prepare(
      `UPDATE payroll_cycles
       SET remaining_amount = ?, status = ?, paid_at = ?, overdue_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      remainingAmount,
      status,
      status === 'paid' ? row.paid_at || toSqlDateTime() : null,
      status === 'overdue' ? row.overdue_at || toSqlDateTime() : null,
      toSqlDateTime(),
      row.id,
    );

    if (status === 'overdue' && !row.overdue_notified_at) {
      await sendTelegramMessage({
        chatId: row.telegram_chat_id,
        text:
          `MyShop payroll eslatmasi\n` +
          `Xodim: ${String(row.full_name || 'Xodim')}\n` +
          `To'lov turi: ${row.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi'}\n` +
          `Muddat: ${row.due_date}\n` +
          `Qolgan summa: ${new Intl.NumberFormat('uz-UZ').format(remainingAmount)} so'm`,
      });
      db.prepare(`UPDATE payroll_cycles SET overdue_notified_at = ?, updated_at = ? WHERE id = ?`).run(
        toSqlDateTime(),
        toSqlDateTime(),
        row.id,
      );
    }
  }
}

export function ensureAccountingModuleReady({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastEnsureAt < 30_000) return;
  seedAccountingCategories();
  syncAccountingEmployees();
  ensurePayrollCycles();
  void refreshPayrollCycleStatuses();
  lastEnsureAt = now;
}

export function scheduleAccountingAutomation() {
  if (accountingAutomationScheduled) return;
  accountingAutomationScheduled = true;
  ensureAccountingModuleReady({ force: true });
  setInterval(() => {
    try {
      ensureAccountingModuleReady({ force: true });
    } catch (error) {
      console.error('[accounting/automation]', error);
    }
  }, ACCOUNTING_AUTOMATION_INTERVAL_MS);
}

export function resolveCycleStatusLabel(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'paid') return 'To‘landi';
  if (value === 'overdue') return 'Kechikkan';
  return 'Kutilmoqda';
}

export function createFinancialTransaction({
  direction,
  sourceType,
  title,
  description = '',
  amount,
  paymentMethod = 'cash',
  expenseCategoryId = null,
  incomeCategoryId = null,
  relatedEntityType = null,
  relatedEntityId = null,
  createdByUserId = null,
  transactionDate = null,
  status = 'completed',
}) {
  const safeAmount = roundMoney(amount);
  if (safeAmount <= 0) {
    throw new Error('Summa musbat bo‘lishi kerak.');
  }
  const cleanDirection = String(direction || '').trim().toLowerCase();
  if (!['income', 'expense'].includes(cleanDirection)) {
    throw new Error('Yo‘nalish noto‘g‘ri.');
  }

  const result = db.prepare(
    `INSERT INTO financial_transactions (
      direction, source_type, expense_category_id, income_category_id, title, description, amount, currency,
      transaction_date, payment_method, related_entity_type, related_entity_id, status, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UZS', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    cleanDirection,
    String(sourceType || 'manual').trim().toLowerCase() || 'manual',
    expenseCategoryId,
    incomeCategoryId,
    String(title || '').trim(),
    String(description || '').trim(),
    safeAmount,
    transactionDate || toSqlDate(),
    String(paymentMethod || 'cash').trim().toLowerCase() || 'cash',
    relatedEntityType,
    relatedEntityId,
    String(status || 'completed').trim().toLowerCase() || 'completed',
    createdByUserId,
    toSqlDateTime(),
    toSqlDateTime(),
  );

  logAccountingAudit({
    actorUserId: createdByUserId,
    action: 'financial_transaction.created',
    entityType: 'financial_transaction',
    entityId: result.lastInsertRowid,
    payload: { direction: cleanDirection, amount: safeAmount, sourceType },
  });

  return db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(result.lastInsertRowid);
}

function createReceiptRecord({ employee, payment, cycle, createdByUserId }) {
  const receiptNumber = `MSH-${cycle.payroll_year}${String(cycle.payroll_month).padStart(2, '0')}-${payment.id}`;
  const payload = {
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      department: employee.department,
      job_title: employee.job_title,
      phone: employee.phone,
    },
    payment: {
      id: payment.id,
      amount: payment.amount,
      payment_type: payment.payment_type,
      payment_method: payment.payment_method,
      paid_at: payment.paid_at,
      note: payment.note,
    },
    cycle: {
      id: cycle.id,
      payroll_year: cycle.payroll_year,
      payroll_month: cycle.payroll_month,
      cycle_type: cycle.cycle_type,
      gross_amount: cycle.gross_amount,
      paid_amount: cycle.paid_amount,
      remaining_amount: cycle.remaining_amount,
      status: cycle.status,
      due_date: cycle.due_date,
    },
  };

  const receiptInsert = db.prepare(
    `INSERT INTO receipts (
      receipt_number, employee_id, salary_payment_id, title, payload_json, issued_at, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const result = receiptInsert.run(
    receiptNumber,
    employee.id,
    payment.id,
    payment.payment_type === 'advance' ? 'Avans kvitansiyasi' : 'Ish haqi kvitansiyasi',
    toJson(payload),
    payment.paid_at,
    createdByUserId,
    toSqlDateTime(),
    toSqlDateTime(),
  );

  db.prepare(`UPDATE salary_payments SET receipt_id = ?, updated_at = ? WHERE id = ?`).run(
    result.lastInsertRowid,
    toSqlDateTime(),
    payment.id,
  );
  return db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(result.lastInsertRowid);
}

function getOpenCycleForPayment(employeeId, cycleType) {
  return db
    .prepare(
      `SELECT *
       FROM payroll_cycles
       WHERE employee_id = ?
         AND cycle_type = ?
         AND remaining_amount > 0.009
       ORDER BY payroll_year ASC, payroll_month ASC, due_date ASC, id ASC
       LIMIT 1`,
    )
    .get(employeeId, cycleType);
}

export async function registerSalaryPayment({
  employeeId,
  cycleType,
  amount,
  paymentMethod = 'cash',
  note = '',
  referenceNumber = '',
  paidByUserId = null,
}) {
  ensureAccountingModuleReady({ force: true });
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId);
  if (!employee) throw new Error('Xodim topilmadi.');
  if (!employee.payroll_enabled) throw new Error('Bu xodim uchun payroll o‘chirilgan.');

  const cleanCycleType = String(cycleType || '').trim().toLowerCase();
  if (!['advance', 'final'].includes(cleanCycleType)) {
    throw new Error('To‘lov turi noto‘g‘ri.');
  }

  const cycle = getOpenCycleForPayment(employee.id, cleanCycleType);
  if (!cycle) throw new Error('Mos ochiq payroll sikli topilmadi.');

  const safeAmount = roundMoney(amount || cycle.remaining_amount);
  if (safeAmount <= 0) throw new Error('To‘lov summasi musbat bo‘lishi kerak.');
  if (safeAmount - roundMoney(cycle.remaining_amount) > 0.009) {
    throw new Error('To‘lov summasi qolgan balansdan katta bo‘lishi mumkin emas.');
  }

  const paymentResult = db.prepare(
    `INSERT INTO salary_payments (
      employee_id, payroll_cycle_id, payment_type, amount, payment_method, reference_number, note,
      paid_by_user_id, paid_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    employee.id,
    cycle.id,
    cleanCycleType,
    safeAmount,
    String(paymentMethod || 'cash').trim().toLowerCase() || 'cash',
    String(referenceNumber || '').trim() || null,
    String(note || '').trim() || null,
    paidByUserId,
    toSqlDateTime(),
    toSqlDateTime(),
    toSqlDateTime(),
  );

  const nextPaidAmount = roundMoney((Number(cycle.paid_amount) || 0) + safeAmount);
  const nextRemaining = Math.max(0, roundMoney((Number(cycle.gross_amount) || 0) - nextPaidAmount));
  const nextStatus = nextRemaining <= 0.009 ? 'paid' : String(cycle.due_date || '') < toSqlDate() ? 'overdue' : 'pending';

  db.prepare(
    `UPDATE payroll_cycles
     SET paid_amount = ?, remaining_amount = ?, status = ?, paid_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(nextPaidAmount, nextRemaining, nextStatus, nextRemaining <= 0.009 ? toSqlDateTime() : null, toSqlDateTime(), cycle.id);

  const payment = db.prepare(`SELECT * FROM salary_payments WHERE id = ?`).get(paymentResult.lastInsertRowid);
  const updatedCycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycle.id);
  const transaction = createFinancialTransaction({
    direction: 'expense',
    sourceType: 'payroll',
    title:
      cleanCycleType === 'advance'
        ? `${employee.full_name} uchun avans`
        : `${employee.full_name} uchun oylik ish haqi`,
    description: note || `${resolveCycleStatusLabel(updatedCycle.status)} holatida to‘lov yozuvi`,
    amount: safeAmount,
    paymentMethod,
    expenseCategoryId: db.prepare(`SELECT id FROM expense_categories WHERE slug = 'payroll' LIMIT 1`).get()?.id || null,
    relatedEntityType: 'payroll_cycle',
    relatedEntityId: updatedCycle.id,
    createdByUserId: paidByUserId,
    transactionDate: toSqlDate(),
  });
  const receipt = createReceiptRecord({ employee, payment, cycle: updatedCycle, createdByUserId: paidByUserId });

  await sendTelegramMessage({
    chatId: employee.telegram_chat_id,
    text:
      `MyShop to'lov xabarnomasi\n` +
      `Xodim: ${employee.full_name}\n` +
      `To'lov: ${cleanCycleType === 'advance' ? 'Avans' : 'Oylik ish haqi'}\n` +
      `Summa: ${new Intl.NumberFormat('uz-UZ').format(safeAmount)} so'm\n` +
      `Kvitansiya: ${receipt.receipt_number}`,
  });

  logAccountingAudit({
    actorUserId: paidByUserId,
    action: 'salary_payment.created',
    entityType: 'salary_payment',
    entityId: payment.id,
    payload: { employeeId: employee.id, cycleId: updatedCycle.id, amount: safeAmount, receiptId: receipt.id },
  });

  return {
    employee,
    payment,
    cycle: updatedCycle,
    receipt,
    transaction,
  };
}

function parseReceiptPayload(row) {
  try {
    return row?.payload_json ? JSON.parse(row.payload_json) : null;
  } catch {
    return null;
  }
}

export function getReceiptDetails(receiptId) {
  const receipt = db
    .prepare(
      `SELECT r.*, e.full_name, e.department, e.job_title, e.phone
       FROM receipts r
       LEFT JOIN employees e ON e.id = r.employee_id
       WHERE r.id = ?`,
    )
    .get(receiptId);
  if (!receipt) return null;
  return {
    ...receipt,
    payload: parseReceiptPayload(receipt),
  };
}

function buildDateRange(days) {
  const totalDays = Math.min(365, Math.max(7, Number(days) || 30));
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (totalDays - 1));
  return { totalDays, startKey: toSqlDate(start), endKey: toSqlDate(end) };
}

export function getDashboardOverview({ days = 30 } = {}) {
  ensureAccountingModuleReady();
  const { totalDays, startKey, endKey } = buildDateRange(days);

  const revenueOrders = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM orders
       WHERE status NOT IN ('cancelled', 'archived')
         AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(startKey, endKey);

  const extraIncome = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE direction = 'income'
         AND transaction_date BETWEEN ? AND ?`,
    )
    .get(startKey, endKey);

  const totalExpenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE direction = 'expense'
         AND transaction_date BETWEEN ? AND ?`,
    )
    .get(startKey, endKey);

  const payrollExpenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE direction = 'expense'
         AND source_type = 'payroll'
         AND transaction_date BETWEEN ? AND ?`,
    )
    .get(startKey, endKey);

  const employeeCount = db.prepare(`SELECT COUNT(*) AS total FROM employees WHERE payroll_enabled = 1`).get().total;
  const overdueCount = db
    .prepare(`SELECT COUNT(*) AS total FROM payroll_cycles WHERE status = 'overdue' AND remaining_amount > 0.009`)
    .get().total;
  const pendingCount = db
    .prepare(`SELECT COUNT(*) AS total FROM payroll_cycles WHERE status = 'pending' AND remaining_amount > 0.009`)
    .get().total;
  const dueSoonCount = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM payroll_cycles
       WHERE remaining_amount > 0.009
         AND due_date BETWEEN date('now') AND date('now', '+5 day')`,
    )
    .get().total;

  const dailyRevenue = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(total_amount), 0) AS total
       FROM orders
       WHERE status NOT IN ('cancelled', 'archived')
         AND substr(created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY day`,
    )
    .all(startKey, endKey);

  const dailyTransactions = db
    .prepare(
      `SELECT transaction_date AS day,
              COALESCE(SUM(CASE WHEN direction = 'income' THEN amount ELSE 0 END), 0) AS income_total,
              COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS expense_total,
              COALESCE(SUM(CASE WHEN direction = 'expense' AND source_type = 'payroll' THEN amount ELSE 0 END), 0) AS payroll_total
       FROM financial_transactions
       WHERE transaction_date BETWEEN ? AND ?
       GROUP BY transaction_date`,
    )
    .all(startKey, endKey);

  const chartsMap = new Map();
  for (let i = 0; i < totalDays; i += 1) {
    const cursor = new Date(startKey);
    cursor.setDate(cursor.getDate() + i);
    chartsMap.set(toSqlDate(cursor), {
      day: toSqlDate(cursor),
      revenue: 0,
      extra_income: 0,
      expense: 0,
      payroll: 0,
      profit: 0,
    });
  }

  dailyRevenue.forEach((row) => {
    const current = chartsMap.get(String(row.day));
    if (current) current.revenue = roundMoney(row.total || 0);
  });
  dailyTransactions.forEach((row) => {
    const current = chartsMap.get(String(row.day));
    if (!current) return;
    current.extra_income = roundMoney(row.income_total || 0);
    current.expense = roundMoney(row.expense_total || 0);
    current.payroll = roundMoney(row.payroll_total || 0);
  });
  const chartSeries = [...chartsMap.values()].map((row) => ({
    ...row,
    profit: roundMoney(row.revenue + row.extra_income - row.expense),
  }));

  const categoryExpenses = db
    .prepare(
      `SELECT ec.label_uz AS label, COALESCE(SUM(ft.amount), 0) AS total
       FROM financial_transactions ft
       LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
       WHERE ft.direction = 'expense'
         AND ft.transaction_date BETWEEN ? AND ?
       GROUP BY ft.expense_category_id, ec.label_uz
       ORDER BY total DESC
       LIMIT 8`,
    )
    .all(startKey, endKey);

  const recentTransactions = db
    .prepare(
      `SELECT
         'transaction' AS entry_type,
         ft.id,
         ft.title,
         ft.direction,
         ft.amount,
         ft.transaction_date AS created_at,
         ft.status,
         ft.source_type
       FROM financial_transactions ft
       UNION ALL
       SELECT
         'salary_payment' AS entry_type,
         sp.id,
         COALESCE(e.full_name, 'Xodim') AS title,
         'expense' AS direction,
         sp.amount,
         substr(sp.paid_at, 1, 10) AS created_at,
         pc.status AS status,
         sp.payment_type AS source_type
       FROM salary_payments sp
       LEFT JOIN employees e ON e.id = sp.employee_id
       LEFT JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
       ORDER BY created_at DESC, id DESC
       LIMIT 12`,
    )
    .all();

  const totalRevenueValue = roundMoney((revenueOrders?.total || 0) + (extraIncome?.total || 0));
  const totalExpensesValue = roundMoney(totalExpenses?.total || 0);

  return {
    range_days: totalDays,
    kpis: {
      total_revenue: totalRevenueValue,
      total_expenses: totalExpensesValue,
      net_profit: roundMoney(totalRevenueValue - totalExpensesValue),
      payroll_expense: roundMoney(payrollExpenses?.total || 0),
    },
    stats: {
      employee_count: employeeCount,
      overdue_cycles: overdueCount,
      pending_cycles: pendingCount,
      due_soon_cycles: dueSoonCount,
    },
    charts: {
      trend: chartSeries,
      expense_categories: categoryExpenses.map((row) => ({
        label: row.label || 'Kategoriya',
        total: roundMoney(row.total || 0),
      })),
    },
    activity: recentTransactions.map((row) => ({
      ...row,
      amount: roundMoney(row.amount || 0),
    })),
  };
}

function getLastPaymentRow(employeeId) {
  return db
    .prepare(
      `SELECT sp.*, pc.status AS cycle_status, pc.remaining_amount
       FROM salary_payments sp
       LEFT JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
       WHERE sp.employee_id = ?
       ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
       LIMIT 1`,
    )
    .get(employeeId);
}

function getUpcomingCycle(employeeId) {
  return db
    .prepare(
      `SELECT *
       FROM payroll_cycles
       WHERE employee_id = ?
         AND remaining_amount > 0.009
       ORDER BY due_date ASC, payroll_year ASC, payroll_month ASC, id ASC
       LIMIT 1`,
    )
    .get(employeeId);
}

export function getPayrollOverview() {
  ensureAccountingModuleReady();
  const employees = db
    .prepare(
      `SELECT *
       FROM employees
       WHERE payroll_enabled = 1
       ORDER BY is_superuser_employee DESC, full_name COLLATE NOCASE ASC`,
    )
    .all();

  const employeeCards = employees.map((employee) => {
    const lastPayment = getLastPaymentRow(employee.id);
    const nextCycle = getUpcomingCycle(employee.id);
    const remainingBalance = nextCycle
      ? roundMoney(nextCycle.remaining_amount || 0)
      : 0;
    return {
      id: employee.id,
      employee_code: employee.employee_code,
      full_name: employee.full_name,
      department: employee.department,
      job_title: employee.job_title,
      phone: employee.phone,
      monthly_salary: roundMoney(employee.monthly_salary || 0),
      advance_ratio: parseRatio(employee.advance_ratio, 0.5),
      last_payment: lastPayment
        ? {
            id: lastPayment.id,
            amount: roundMoney(lastPayment.amount || 0),
            paid_at: lastPayment.paid_at,
            payment_type: lastPayment.payment_type,
          }
        : null,
      next_payment: nextCycle
        ? {
            id: nextCycle.id,
            due_date: nextCycle.due_date,
            cycle_type: nextCycle.cycle_type,
            gross_amount: roundMoney(nextCycle.gross_amount || 0),
            remaining_amount: roundMoney(nextCycle.remaining_amount || 0),
          }
        : null,
      remaining_balance: remainingBalance,
      status: nextCycle?.status || 'paid',
      status_label: resolveCycleStatusLabel(nextCycle?.status || 'paid'),
      is_superuser_employee: !!employee.is_superuser_employee,
      telegram_connected: !!String(employee.telegram_chat_id || '').trim(),
    };
  });

  const payrollCalendar = db
    .prepare(
      `SELECT pc.id, pc.employee_id, pc.cycle_type, pc.due_date, pc.remaining_amount, pc.status,
              e.full_name, e.department, e.job_title
       FROM payroll_cycles pc
       INNER JOIN employees e ON e.id = pc.employee_id
       WHERE pc.remaining_amount > 0.009
       ORDER BY pc.due_date ASC, pc.id ASC
       LIMIT 16`,
    )
    .all()
    .map((row) => ({
      ...row,
      remaining_amount: roundMoney(row.remaining_amount || 0),
      status_label: resolveCycleStatusLabel(row.status),
    }));

  const recentPayments = db
    .prepare(
      `SELECT sp.id, sp.amount, sp.payment_type, sp.payment_method, sp.paid_at, sp.receipt_id,
              e.full_name,
              pc.status AS cycle_status
       FROM salary_payments sp
       INNER JOIN employees e ON e.id = sp.employee_id
       LEFT JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
       ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
       LIMIT 12`,
    )
    .all()
    .map((row) => ({
      ...row,
      amount: roundMoney(row.amount || 0),
      status_label: resolveCycleStatusLabel(row.cycle_status || 'pending'),
    }));

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(monthly_salary), 0) AS monthly_budget,
         COALESCE(SUM(monthly_salary * advance_ratio), 0) AS advance_budget
       FROM employees
       WHERE payroll_enabled = 1`,
    )
    .get();

  return {
    summary: {
      employee_count: employeeCards.length,
      monthly_budget: roundMoney(totals?.monthly_budget || 0),
      advance_budget: roundMoney(totals?.advance_budget || 0),
      overdue_count: employeeCards.filter((item) => item.status === 'overdue').length,
      pending_count: employeeCards.filter((item) => item.status === 'pending').length,
    },
    employees: employeeCards,
    calendar: payrollCalendar,
    recent_payments: recentPayments,
  };
}

export function getEmployeePayrollDetails(employeeId) {
  ensureAccountingModuleReady();
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId);
  if (!employee) return null;

  const cycles = db
    .prepare(
      `SELECT *
       FROM payroll_cycles
       WHERE employee_id = ?
       ORDER BY payroll_year DESC, payroll_month DESC,
                CASE WHEN cycle_type = 'final' THEN 1 ELSE 0 END DESC,
                id DESC
       LIMIT 24`,
    )
    .all(employeeId)
    .map((row) => ({
      ...row,
      gross_amount: roundMoney(row.gross_amount || 0),
      paid_amount: roundMoney(row.paid_amount || 0),
      remaining_amount: roundMoney(row.remaining_amount || 0),
      status_label: resolveCycleStatusLabel(row.status),
    }));

  const payments = db
    .prepare(
      `SELECT sp.*, r.receipt_number
       FROM salary_payments sp
       LEFT JOIN receipts r ON r.id = sp.receipt_id
       WHERE sp.employee_id = ?
       ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
       LIMIT 24`,
    )
    .all(employeeId)
    .map((row) => ({
      ...row,
      amount: roundMoney(row.amount || 0),
    }));

  return {
    employee: {
      ...employee,
      monthly_salary: roundMoney(employee.monthly_salary || 0),
    },
    cycles,
    payments,
  };
}

export function updateEmployeePayrollSettings(employeeId, payload = {}) {
  ensureAccountingModuleReady({ force: true });
  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId);
  if (!employee) return null;

  const monthlySalary = Math.max(0, Number(payload.monthly_salary ?? employee.monthly_salary) || 0);
  const advanceRatio = parseRatio(payload.advance_ratio ?? employee.advance_ratio, parseRatio(employee.advance_ratio, 0.5));
  const payrollEnabled = payload.payroll_enabled == null ? Number(employee.payroll_enabled) : payload.payroll_enabled ? 1 : 0;

  db.prepare(
    `UPDATE employees
     SET full_name = ?, department = ?, job_title = ?, phone = ?, monthly_salary = ?, advance_ratio = ?,
         payroll_enabled = ?, telegram_chat_id = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    String(payload.full_name ?? employee.full_name).trim() || employee.full_name,
    String(payload.department ?? employee.department ?? '').trim(),
    String(payload.job_title ?? employee.job_title ?? '').trim(),
    String(payload.phone ?? employee.phone ?? '').trim(),
    monthlySalary,
    advanceRatio,
    payrollEnabled,
    String(payload.telegram_chat_id ?? employee.telegram_chat_id ?? '').trim() || null,
    String(payload.notes ?? employee.notes ?? '').trim() || null,
    toSqlDateTime(),
    employeeId,
  );

  ensurePayrollCycles({ monthsBack: 2, monthsForward: 1 });
  return getEmployeePayrollDetails(employeeId);
}

export function getTransactionsList({
  search = '',
  direction = 'all',
  categoryType = 'all',
} = {}) {
  ensureAccountingModuleReady();
  let sql = `
    SELECT ft.*,
           ec.label_uz AS expense_category_label,
           ic.label_uz AS income_category_label,
           u.full_name AS created_by_name
    FROM financial_transactions ft
    LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
    LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
    LEFT JOIN users u ON u.id = ft.created_by_user_id
    WHERE 1 = 1
  `;
  const params = [];
  if (direction && direction !== 'all') {
    sql += ' AND ft.direction = ?';
    params.push(direction);
  }
  if (search) {
    sql += ' AND (ft.title LIKE ? OR IFNULL(ft.description, \'\') LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (categoryType === 'expense') sql += ' AND ft.expense_category_id IS NOT NULL';
  if (categoryType === 'income') sql += ' AND ft.income_category_id IS NOT NULL';
  sql += ' ORDER BY ft.transaction_date DESC, ft.id DESC LIMIT 150';

  const items = db.prepare(sql).all(...params).map((row) => ({
    ...row,
    amount: roundMoney(row.amount || 0),
    category_label: row.expense_category_label || row.income_category_label || 'Kategoriya',
  }));

  return {
    items,
    categories: {
      expense: db.prepare(`SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order ASC, label_uz ASC`).all(),
      income: db.prepare(`SELECT * FROM income_categories WHERE is_active = 1 ORDER BY sort_order ASC, label_uz ASC`).all(),
    },
  };
}

export function getReportsSummary({ from = '', to = '' } = {}) {
  ensureAccountingModuleReady();
  const dateFrom = String(from || '').trim() || db.prepare(`SELECT MIN(transaction_date) AS min_date FROM financial_transactions`).get()?.min_date || toSqlDate();
  const dateTo = String(to || '').trim() || toSqlDate();

  const incomeTotal = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE direction = 'income' AND transaction_date BETWEEN ? AND ?`,
    )
    .get(dateFrom, dateTo);
  const expenseTotal = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE direction = 'expense' AND transaction_date BETWEEN ? AND ?`,
    )
    .get(dateFrom, dateTo);
  const productRevenue = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM orders
       WHERE status NOT IN ('cancelled', 'archived')
         AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    )
    .get(dateFrom, dateTo);
  const payrollByEmployee = db
    .prepare(
      `SELECT e.full_name AS label, COALESCE(SUM(sp.amount), 0) AS total
       FROM salary_payments sp
       INNER JOIN employees e ON e.id = sp.employee_id
       WHERE substr(sp.paid_at, 1, 10) BETWEEN ? AND ?
       GROUP BY e.id, e.full_name
       ORDER BY total DESC
       LIMIT 12`,
    )
    .all(dateFrom, dateTo);
  const expenseByCategory = db
    .prepare(
      `SELECT COALESCE(ec.label_uz, 'Kategoriya') AS label, COALESCE(SUM(ft.amount), 0) AS total
       FROM financial_transactions ft
       LEFT JOIN expense_categories ec ON ec.id = ft.expense_category_id
       WHERE ft.direction = 'expense' AND ft.transaction_date BETWEEN ? AND ?
       GROUP BY ft.expense_category_id, ec.label_uz
       ORDER BY total DESC`,
    )
    .all(dateFrom, dateTo);
  const incomeByCategory = db
    .prepare(
      `SELECT COALESCE(ic.label_uz, 'Kategoriya') AS label, COALESCE(SUM(ft.amount), 0) AS total
       FROM financial_transactions ft
       LEFT JOIN income_categories ic ON ic.id = ft.income_category_id
       WHERE ft.direction = 'income' AND ft.transaction_date BETWEEN ? AND ?
       GROUP BY ft.income_category_id, ic.label_uz
       ORDER BY total DESC`,
    )
    .all(dateFrom, dateTo);

  return {
    period: { from: dateFrom, to: dateTo },
    summary: {
      product_revenue: roundMoney(productRevenue?.total || 0),
      extra_income: roundMoney(incomeTotal?.total || 0),
      total_expenses: roundMoney(expenseTotal?.total || 0),
      net_profit: roundMoney((productRevenue?.total || 0) + (incomeTotal?.total || 0) - (expenseTotal?.total || 0)),
    },
    payroll_by_employee: payrollByEmployee.map((row) => ({ ...row, total: roundMoney(row.total || 0) })),
    expense_by_category: expenseByCategory.map((row) => ({ ...row, total: roundMoney(row.total || 0) })),
    income_by_category: incomeByCategory.map((row) => ({ ...row, total: roundMoney(row.total || 0) })),
  };
}

export function getActivityFeed({ limit = 40 } = {}) {
  ensureAccountingModuleReady();
  const maxLimit = Math.min(100, Math.max(10, Number(limit) || 40));
  return db
    .prepare(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.payload_json, al.created_at,
              u.full_name AS actor_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       ORDER BY datetime(replace(al.created_at, 'T', ' ')) DESC, al.id DESC
       LIMIT ?`,
    )
    .all(maxLimit)
    .map((row) => {
      let payload = null;
      try {
        payload = row.payload_json ? JSON.parse(row.payload_json) : null;
      } catch {
        payload = null;
      }
      return {
        ...row,
        payload,
      };
    });
}
