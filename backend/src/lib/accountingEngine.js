import PDFDocument from 'pdfkit';
import { db } from '../db/database.js';

const PAYROLL_STATUS_LABELS = {
  paid: "To'landi",
  pending: 'Kutilmoqda',
  overdue: 'Kechikkan',
};

const PAYROLL_PHASE_LABELS = {
  advance: 'Avans',
  salary: 'Oylik ish haqi',
};

const DEFAULT_PAYMENT_METHOD = 'bank';
const DEFAULT_ADVANCE_PERCENT = 50;

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatMoney(value) {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(roundMoney(value));
}

function toSqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSqlDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseSqlDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const safe = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(safe);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function monthKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthLabel(monthKey) {
  const date = parseSqlDate(monthKey);
  if (!date) return monthKey;
  return date.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function monthWindow(monthKey, cycleType) {
  const monthDate = parseSqlDate(monthKey) || new Date();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = endOfMonth(monthDate);
  const advanceStart = monthStart;
  const advanceEnd = new Date(monthDate.getFullYear(), monthDate.getMonth(), 15);
  const finalStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 16);
  const finalEnd = monthEnd;

  if (cycleType === 'advance') {
    return {
      cycle_start: toSqlDate(advanceStart),
      cycle_end: toSqlDate(advanceEnd),
      due_date: toSqlDate(advanceEnd),
      cycle_label: `${monthLabel(monthKey)} - avans`,
    };
  }

  return {
    cycle_start: toSqlDate(finalStart),
    cycle_end: toSqlDate(finalEnd),
    due_date: toSqlDate(finalEnd),
    cycle_label: `${monthLabel(monthKey)} - oylik ish haqi`,
  };
}

function paymentMethodLabel(value) {
  const raw = String(value || DEFAULT_PAYMENT_METHOD).trim().toLowerCase();
  if (raw === 'cash') return 'Naqd';
  if (raw === 'card') return 'Karta';
  if (raw === 'transfer') return "O'tkazma";
  return 'Bank';
}

function sanitizeDirection(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'income' ? 'income' : 'expense';
}

function sanitizePhase(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'advance' ? 'advance' : 'salary';
}

function sanitizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'paid' || raw === 'pending' || raw === 'overdue') return raw;
  return 'pending';
}

function sanitizeEmployeeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'inactive' ? 'inactive' : 'active';
}

function sanitizeCategoryList(rows) {
  return Array.isArray(rows)
    ? rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        label: row.label_uz,
      }))
    : [];
}

function csvEscape(value) {
  const stringified = value == null ? '' : String(value);
  if (/[,"\n]/.test(stringified)) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return stringified;
}

function buildCsv(columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(','));
  return [header, ...lines].join('\n');
}

function makeInClause(length) {
  return Array.from({ length }, () => '?').join(', ');
}

function readSeededCategories(tableName) {
  return db.prepare(`SELECT id, slug, label_uz FROM ${tableName} WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`).all();
}

function sumCyclePayments(cycleId) {
  return db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total, MAX(paid_at) AS last_payment_at
      FROM salary_payments
      WHERE payroll_cycle_id = ?
        AND lower(trim(COALESCE(payment_status, 'paid'))) = 'paid'
    `,
    )
    .get(cycleId);
}

function computeCycleAmounts(employee, cycleType) {
  const monthlySalary = roundMoney(employee.monthly_salary);
  const advancePercent = clamp(Number(employee.advance_percent) || DEFAULT_ADVANCE_PERCENT, 1, 99);
  const advanceAmount = roundMoney((monthlySalary * advancePercent) / 100);
  const salaryAmount = roundMoney(monthlySalary - advanceAmount);
  return cycleType === 'advance' ? advanceAmount : salaryAmount;
}

function computeCycleStatus(baseAmount, paidAmount, dueDate) {
  const remainingAmount = roundMoney(Math.max(roundMoney(baseAmount) - roundMoney(paidAmount), 0));
  if (baseAmount <= 0) {
    return { remainingAmount: 0, status: 'paid', isOverdue: 0 };
  }
  if (remainingAmount <= 0) {
    return { remainingAmount: 0, status: 'paid', isOverdue: 0 };
  }
  const due = parseSqlDate(dueDate);
  if (due) {
    due.setHours(23, 59, 59, 999);
    if (new Date() > due) {
      return { remainingAmount, status: 'overdue', isOverdue: 1 };
    }
  }
  return { remainingAmount, status: 'pending', isOverdue: 0 };
}

function updateCycleState(cycleId) {
  const cycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycleId);
  if (!cycle) return null;
  const totals = sumCyclePayments(cycleId);
  const paidAmount = roundMoney(totals?.total);
  const state = computeCycleStatus(cycle.base_amount, paidAmount, cycle.due_date);
  db.prepare(
    `
      UPDATE payroll_cycles
      SET paid_amount = ?,
          remaining_amount = ?,
          status = ?,
          is_overdue = ?,
          last_payment_at = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(
    paidAmount,
    state.remainingAmount,
    state.status,
    state.isOverdue,
    totals?.last_payment_at || cycle.last_payment_at || null,
    toSqlDateTime(new Date()),
    cycleId,
  );
  return db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycleId);
}

function buildEmployeeCode(userId) {
  if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
    return `EMP-${String(userId).padStart(4, '0')}`;
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM employees').get()?.c || 0;
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}

function insertAuditLog({ actorUserId, entityType, entityId, action, description, payload }) {
  db.prepare(
    `
      INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, description, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    actorUserId || null,
    entityType,
    entityId || null,
    action,
    description,
    JSON.stringify(payload || {}),
  );
}

async function sendTelegramNotification({ text, chatId }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const targetChatId = String(chatId || process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !targetChatId || !text) {
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    return { ok: response.ok, skipped: false };
  } catch (error) {
    console.warn('[accounting/telegram]', error);
    return { ok: false, skipped: false };
  }
}

function readEmployeeById(employeeId) {
  return db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employeeId);
}

function ensureCycleForEmployee(employee, monthKey, cycleType) {
  const window = monthWindow(monthKey, cycleType);
  const baseAmount = computeCycleAmounts(employee, cycleType);
  const now = toSqlDateTime(new Date());
  let cycle = db
    .prepare(
      `
      SELECT *
      FROM payroll_cycles
      WHERE employee_id = ?
        AND month_key = ?
        AND cycle_type = ?
      LIMIT 1
    `,
    )
    .get(employee.id, monthKey, cycleType);

  if (!cycle) {
    const insert = db
      .prepare(
        `
        INSERT INTO payroll_cycles (
          employee_id,
          month_key,
          cycle_type,
          cycle_label,
          cycle_start,
          cycle_end,
          due_date,
          base_amount,
          paid_amount,
          remaining_amount,
          status,
          is_overdue,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)
      `,
      )
      .run(
        employee.id,
        monthKey,
        cycleType,
        window.cycle_label,
        window.cycle_start,
        window.cycle_end,
        window.due_date,
        baseAmount,
        baseAmount,
        baseAmount > 0 ? 'pending' : 'paid',
        now,
        now,
      );
    cycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(insert.lastInsertRowid);
  } else {
    db.prepare(
      `
        UPDATE payroll_cycles
        SET cycle_label = ?,
            cycle_start = ?,
            cycle_end = ?,
            due_date = ?,
            base_amount = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(window.cycle_label, window.cycle_start, window.cycle_end, window.due_date, baseAmount, now, cycle.id);
    cycle = db.prepare(`SELECT * FROM payroll_cycles WHERE id = ?`).get(cycle.id);
  }

  return updateCycleState(cycle.id);
}

async function ensureOverdueNotifications(cyclesByEmployee) {
  const today = toSqlDate(new Date());
  for (const item of cyclesByEmployee) {
    const { employee, cycle } = item;
    if (!employee || !cycle || cycle.status !== 'overdue') continue;
    if (dayKey(cycle.last_notified_at) === today) continue;
    const text =
      `[MyShop] ${employee.full_name} uchun ${PAYROLL_PHASE_LABELS[cycle.cycle_type]} to'lovi kechikdi.\n` +
      `Muddat: ${cycle.due_date}\n` +
      `Qolgan summa: ${formatMoney(cycle.remaining_amount)} so'm\n` +
      `Oy: ${monthLabel(cycle.month_key)}`;
    const result = await sendTelegramNotification({ text, chatId: employee.telegram_chat_id });
    if (result.ok || result.skipped) {
      db.prepare(`UPDATE payroll_cycles SET last_notified_at = ?, updated_at = ? WHERE id = ?`).run(
        `${today} 09:00:00`,
        toSqlDateTime(new Date()),
        cycle.id,
      );
    }
  }
}

export function syncEmployeesFromUsers() {
  const users = db
    .prepare(
      `
      SELECT id, full_name, phone, role, status
      FROM users
      WHERE lower(trim(COALESCE(role, ''))) IN ('superuser', 'accounting')
      ORDER BY id ASC
    `,
    )
    .all();

  const upsert = db.transaction(() => {
    for (const user of users) {
      const existing = db.prepare(`SELECT * FROM employees WHERE user_id = ? LIMIT 1`).get(user.id);
      const status = sanitizeEmployeeStatus(user.status);
      if (!existing) {
        db.prepare(
          `
          INSERT INTO employees (
            user_id,
            employee_code,
            full_name,
            phone,
            monthly_salary,
            advance_percent,
            status,
            hire_date,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `,
        ).run(
          user.id,
          buildEmployeeCode(user.id),
          String(user.full_name || '').trim() || `Xodim #${user.id}`,
          String(user.phone || '').trim() || null,
          DEFAULT_ADVANCE_PERCENT,
          status,
          toSqlDate(new Date()),
          toSqlDateTime(new Date()),
          toSqlDateTime(new Date()),
        );
        continue;
      }

      db.prepare(
        `
          UPDATE employees
          SET full_name = ?,
              phone = COALESCE(?, phone),
              status = CASE
                WHEN lower(trim(COALESCE(status, ''))) = 'inactive' AND ? = 'active' THEN 'active'
                ELSE status
              END,
              updated_at = ?
          WHERE id = ?
        `,
      ).run(
        String(user.full_name || '').trim() || existing.full_name,
        String(user.phone || '').trim() || null,
        status,
        toSqlDateTime(new Date()),
        existing.id,
      );
    }
  });

  upsert();
  return users.length;
}

function ensurePayrollCyclesForKeys(monthKeys) {
  const employees = db
    .prepare(
      `
      SELECT *
      FROM employees
      WHERE lower(trim(COALESCE(status, 'active'))) = 'active'
      ORDER BY full_name COLLATE NOCASE ASC, id ASC
    `,
    )
    .all();

  const cycles = [];
  for (const employee of employees) {
    for (const monthKey of monthKeys) {
      cycles.push({ employee, cycle: ensureCycleForEmployee(employee, monthKey, 'advance') });
      cycles.push({ employee, cycle: ensureCycleForEmployee(employee, monthKey, 'salary') });
    }
  }
  return cycles;
}

export async function ensureAccountingRuntime(extraMonthKeys = []) {
  syncEmployeesFromUsers();
  const baseDate = new Date();
  const monthKeys = [
    monthKeyFromDate(addMonths(baseDate, -1)),
    monthKeyFromDate(baseDate),
    monthKeyFromDate(addMonths(baseDate, 1)),
    ...extraMonthKeys.filter(Boolean),
  ];
  const uniqueMonthKeys = [...new Set(monthKeys)];
  const cycles = ensurePayrollCyclesForKeys(uniqueMonthKeys);
  await ensureOverdueNotifications(cycles);
  return { ok: true, month_keys: uniqueMonthKeys, synced_cycles: cycles.length };
}

function readCycleMatrix(employeeIds, monthKeys) {
  if (!employeeIds.length || !monthKeys.length) return new Map();
  const rows = db
    .prepare(
      `
      SELECT *
      FROM payroll_cycles
      WHERE employee_id IN (${makeInClause(employeeIds.length)})
        AND month_key IN (${makeInClause(monthKeys.length)})
      ORDER BY due_date ASC, id ASC
    `,
    )
    .all(...employeeIds, ...monthKeys);
  const map = new Map();
  for (const row of rows) {
    const key = `${row.employee_id}:${row.month_key}:${row.cycle_type}`;
    map.set(key, row);
  }
  return map;
}

function readLastPaymentMap(employeeIds) {
  if (!employeeIds.length) return new Map();
  const rows = db
    .prepare(
      `
      SELECT employee_id, MAX(paid_at) AS last_payment_at
      FROM salary_payments
      WHERE employee_id IN (${makeInClause(employeeIds.length)})
      GROUP BY employee_id
    `,
    )
    .all(...employeeIds);
  return new Map(rows.map((row) => [row.employee_id, row.last_payment_at]));
}

function employeeOverallStatus({ advanceCycle, salaryCycle, remainingBalance }) {
  const statuses = [advanceCycle?.status, salaryCycle?.status].filter(Boolean);
  if (statuses.includes('overdue')) return 'overdue';
  if (remainingBalance <= 0 && statuses.length > 0) return 'paid';
  return 'pending';
}

export function getPayrollEmployees({ search = '', status = 'all' } = {}) {
  const employees = db
    .prepare(
      `
      SELECT *
      FROM employees
      WHERE lower(trim(COALESCE(status, 'active'))) IN ('active', 'inactive')
      ORDER BY
        CASE WHEN lower(trim(COALESCE(status, 'active'))) = 'active' THEN 0 ELSE 1 END,
        full_name COLLATE NOCASE ASC,
        id ASC
    `,
    )
    .all();

  const currentMonthKey = monthKeyFromDate(new Date());
  const nextMonthKey = monthKeyFromDate(addMonths(new Date(), 1));
  const employeeIds = employees.map((employee) => employee.id);
  const cycleMap = readCycleMatrix(employeeIds, [currentMonthKey, nextMonthKey]);
  const lastPaymentMap = readLastPaymentMap(employeeIds);
  const query = String(search || '').trim().toLowerCase();
  const normalizedStatus = String(status || 'all').trim().toLowerCase();

  const rows = employees
    .map((employee) => {
      const advanceCycle = cycleMap.get(`${employee.id}:${currentMonthKey}:advance`) || null;
      const salaryCycle = cycleMap.get(`${employee.id}:${currentMonthKey}:salary`) || null;
      const nextAdvanceCycle = cycleMap.get(`${employee.id}:${nextMonthKey}:advance`) || null;
      const remainingBalance = roundMoney((advanceCycle?.remaining_amount || 0) + (salaryCycle?.remaining_amount || 0));
      const nextDueCandidates = [advanceCycle, salaryCycle]
        .filter((cycle) => cycle && Number(cycle.remaining_amount) > 0)
        .sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)));
      const nextPaymentDate = nextDueCandidates[0]?.due_date || nextAdvanceCycle?.due_date || null;
      const currentStatus = employeeOverallStatus({ advanceCycle, salaryCycle, remainingBalance });

      return {
        id: employee.id,
        employee_code: employee.employee_code,
        full_name: employee.full_name,
        phone: employee.phone || '',
        telegram_chat_id: employee.telegram_chat_id || '',
        monthly_salary: roundMoney(employee.monthly_salary),
        advance_percent: Number(employee.advance_percent) || DEFAULT_ADVANCE_PERCENT,
        last_payment_at: lastPaymentMap.get(employee.id) || null,
        next_payment_date: nextPaymentDate,
        remaining_balance: remainingBalance,
        status: currentStatus,
        status_label: PAYROLL_STATUS_LABELS[currentStatus],
        current_month_label: monthLabel(currentMonthKey),
        active: sanitizeEmployeeStatus(employee.status) === 'active',
        cycles: {
          advance: advanceCycle,
          salary: salaryCycle,
        },
      };
    })
    .filter((row) => {
      if (query) {
        const haystack = [row.full_name, row.employee_code, row.phone]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        if (!haystack.includes(query)) return false;
      }
      if (normalizedStatus !== 'all' && normalizedStatus) {
        return row.status === sanitizeStatus(normalizedStatus);
      }
      return true;
    });

  const summary = {
    total_employees: rows.length,
    overdue_count: rows.filter((row) => row.status === 'overdue').length,
    pending_count: rows.filter((row) => row.status === 'pending').length,
    paid_count: rows.filter((row) => row.status === 'paid').length,
    total_monthly_salary: roundMoney(rows.reduce((sum, row) => sum + row.monthly_salary, 0)),
    total_remaining_balance: roundMoney(rows.reduce((sum, row) => sum + row.remaining_balance, 0)),
  };

  return {
    employees: rows,
    summary,
    month_key: currentMonthKey,
  };
}

export function createEmployee({ full_name, phone, monthly_salary, advance_percent, telegram_chat_id, notes }, actorUserId) {
  const name = String(full_name || '').trim();
  if (!name) {
    return { ok: false, status: 400, error: 'Xodimning toliq ismi kiritilishi kerak.' };
  }
  const salary = roundMoney(monthly_salary);
  if (!Number.isFinite(salary) || salary < 0) {
    return { ok: false, status: 400, error: "Oylik maoshi 0 yoki undan katta bo'lishi kerak." };
  }

  const advancePercent = clamp(Number(advance_percent) || DEFAULT_ADVANCE_PERCENT, 1, 99);
  const now = toSqlDateTime(new Date());
  const result = db
    .prepare(
      `
      INSERT INTO employees (
        employee_code,
        full_name,
        phone,
        telegram_chat_id,
        monthly_salary,
        advance_percent,
        notes,
        status,
        hire_date,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `,
    )
    .run(
      buildEmployeeCode(null),
      name,
      String(phone || '').trim() || null,
      String(telegram_chat_id || '').trim() || null,
      salary,
      advancePercent,
      String(notes || '').trim() || null,
      toSqlDate(new Date()),
      now,
      now,
    );

  const employee = readEmployeeById(result.lastInsertRowid);
  ensurePayrollCyclesForKeys([monthKeyFromDate(new Date()), monthKeyFromDate(addMonths(new Date(), 1))]);
  insertAuditLog({
    actorUserId,
    entityType: 'employee',
    entityId: employee.id,
    action: 'create',
    description: `${employee.full_name} uchun payroll profili yaratildi`,
    payload: employee,
  });

  return { ok: true, employee };
}

export function updateEmployee(employeeId, payload, actorUserId) {
  const employee = readEmployeeById(employeeId);
  if (!employee) {
    return { ok: false, status: 404, error: 'Xodim topilmadi.' };
  }

  const nextName = payload.full_name != null ? String(payload.full_name).trim() : employee.full_name;
  if (!nextName) {
    return { ok: false, status: 400, error: 'Ism bo sh bo lmasin.' };
  }

  const nextSalary =
    payload.monthly_salary != null ? roundMoney(payload.monthly_salary) : roundMoney(employee.monthly_salary);
  if (!Number.isFinite(nextSalary) || nextSalary < 0) {
    return { ok: false, status: 400, error: "Oylik maoshi 0 yoki undan katta bo'lishi kerak." };
  }

  const nextAdvancePercent =
    payload.advance_percent != null
      ? clamp(Number(payload.advance_percent) || DEFAULT_ADVANCE_PERCENT, 1, 99)
      : Number(employee.advance_percent) || DEFAULT_ADVANCE_PERCENT;

  const nextStatus =
    payload.status != null ? sanitizeEmployeeStatus(payload.status) : sanitizeEmployeeStatus(employee.status);

  db.prepare(
    `
      UPDATE employees
      SET full_name = ?,
          phone = ?,
          telegram_chat_id = ?,
          monthly_salary = ?,
          advance_percent = ?,
          notes = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(
    nextName,
    payload.phone != null ? String(payload.phone).trim() || null : employee.phone || null,
    payload.telegram_chat_id != null
      ? String(payload.telegram_chat_id).trim() || null
      : employee.telegram_chat_id || null,
    nextSalary,
    nextAdvancePercent,
    payload.notes != null ? String(payload.notes).trim() || null : employee.notes || null,
    nextStatus,
    toSqlDateTime(new Date()),
    employeeId,
  );

  ensurePayrollCyclesForKeys([
    monthKeyFromDate(addMonths(new Date(), -1)),
    monthKeyFromDate(new Date()),
    monthKeyFromDate(addMonths(new Date(), 1)),
  ]);

  const updated = readEmployeeById(employeeId);
  insertAuditLog({
    actorUserId,
    entityType: 'employee',
    entityId: updated.id,
    action: 'update',
    description: `${updated.full_name} xodimi yangilandi`,
    payload: updated,
  });

  return { ok: true, employee: updated };
}

function ensureReceiptForPayment(paymentId, actorUserId = null) {
  const existing = db.prepare(`SELECT * FROM receipts WHERE payment_id = ? LIMIT 1`).get(paymentId);
  if (existing) return existing;

  const payment = db
    .prepare(
      `
      SELECT sp.*, e.full_name, e.employee_code, pc.month_key, pc.cycle_type, pc.due_date
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      INNER JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
      WHERE sp.id = ?
      LIMIT 1
    `,
    )
    .get(paymentId);

  if (!payment) return null;

  const receiptNumber = `RCPT-${String(payment.month_key || '').replace('-', '')}-${String(payment.id).padStart(5, '0')}`;
  const payload = {
    employee_name: payment.full_name,
    employee_code: payment.employee_code,
    phase_label: PAYROLL_PHASE_LABELS[payment.payment_phase] || PAYROLL_PHASE_LABELS[payment.cycle_type],
    amount: roundMoney(payment.amount),
    payment_method: payment.payment_method,
    month_key: payment.month_key,
    paid_at: payment.paid_at,
    due_date: payment.due_date,
    note: payment.note || '',
  };

  const result = db
    .prepare(
      `
      INSERT INTO receipts (
        receipt_number,
        receipt_type,
        employee_id,
        payment_id,
        created_by,
        payload_json,
        created_at
      )
      VALUES (?, 'salary_payment', ?, ?, ?, ?, ?)
    `,
    )
    .run(
      receiptNumber,
      payment.employee_id,
      payment.id,
      actorUserId || payment.created_by || null,
      JSON.stringify(payload),
      toSqlDateTime(new Date()),
    );
  return db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(result.lastInsertRowid);
}

export async function createPayrollPayment(
  { employee_id, phase, amount, payment_method, note, month_key, paid_at },
  actorUserId,
) {
  const employeeId = Number.parseInt(String(employee_id || ''), 10);
  if (!Number.isInteger(employeeId) || employeeId < 1) {
    return { ok: false, status: 400, error: 'Xodim tanlanmagan.' };
  }

  const employee = readEmployeeById(employeeId);
  if (!employee) {
    return { ok: false, status: 404, error: 'Xodim topilmadi.' };
  }

  const monthKey = /^\d{4}-\d{2}$/.test(String(month_key || '').trim())
    ? String(month_key).trim()
    : monthKeyFromDate(new Date());
  const cycleType = sanitizePhase(phase);

  ensurePayrollCyclesForKeys([monthKey]);
  let cycle = db
    .prepare(
      `
      SELECT *
      FROM payroll_cycles
      WHERE employee_id = ?
        AND month_key = ?
        AND cycle_type = ?
      LIMIT 1
    `,
    )
    .get(employeeId, monthKey, cycleType);
  cycle = cycle ? updateCycleState(cycle.id) : null;

  if (!cycle) {
    return { ok: false, status: 404, error: 'To lov sikli topilmadi.' };
  }

  const paymentAmount = roundMoney(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { ok: false, status: 400, error: 'To lov summasi musbat son bo lishi kerak.' };
  }
  if (paymentAmount > Number(cycle.remaining_amount) + 0.009) {
    return {
      ok: false,
      status: 400,
      error: `Qolgan summa ${formatMoney(cycle.remaining_amount)} so'mdan oshib ketdi.`,
    };
  }

  const paidAt = parseSqlDate(paid_at) || new Date();
  const paidAtSql = toSqlDateTime(paidAt);
  const paymentMethod = String(payment_method || DEFAULT_PAYMENT_METHOD).trim().toLowerCase() || DEFAULT_PAYMENT_METHOD;
  const paymentNote = String(note || '').trim();

  let transactionId = null;
  const transaction = db.transaction(() => {
    const paymentResult = db
      .prepare(
        `
        INSERT INTO salary_payments (
          employee_id,
          payroll_cycle_id,
          payment_phase,
          amount,
          payment_method,
          payment_status,
          paid_at,
          note,
          created_by,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)
      `,
      )
      .run(employeeId, cycle.id, cycleType, paymentAmount, paymentMethod, paidAtSql, paymentNote || null, actorUserId, paidAtSql);

    const paymentId = paymentResult.lastInsertRowid;
    const updatedCycle = updateCycleState(cycle.id);

    const categoryLabel = cycleType === 'advance' ? 'Avans' : 'Xodim oyligi';
    const txResult = db
      .prepare(
        `
        INSERT INTO financial_transactions (
          direction,
          category_type,
          category_slug,
          category_name,
          source_type,
          reference_type,
          reference_id,
          amount,
          title,
          note,
          payment_method,
          counterparty,
          occurred_at,
          created_by,
          metadata_json,
          created_at
        )
        VALUES (
          'expense',
          'expense',
          'employee_payroll',
          ?,
          'payroll',
          'salary_payment',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
      )
      .run(
        categoryLabel,
        paymentId,
        paymentAmount,
        `${employee.full_name} - ${PAYROLL_PHASE_LABELS[cycleType]}`,
        paymentNote || null,
        paymentMethod,
        employee.full_name,
        paidAtSql,
        actorUserId,
        JSON.stringify({
          month_key: monthKey,
          cycle_type: cycleType,
          due_date: updatedCycle?.due_date || cycle.due_date,
        }),
        paidAtSql,
      );
    transactionId = txResult.lastInsertRowid;

    insertAuditLog({
      actorUserId,
      entityType: 'salary_payment',
      entityId: paymentId,
      action: 'create',
      description: `${employee.full_name} uchun ${PAYROLL_PHASE_LABELS[cycleType]} to'lovi yaratildi`,
      payload: {
        employee_id: employeeId,
        month_key: monthKey,
        cycle_type: cycleType,
        amount: paymentAmount,
        payment_method: paymentMethod,
      },
    });

    return {
      paymentId,
      updatedCycle,
    };
  });

  const txResult = transaction();
  const receipt = ensureReceiptForPayment(txResult.paymentId, actorUserId);

  await sendTelegramNotification({
    chatId: employee.telegram_chat_id,
    text:
      `[MyShop] ${employee.full_name} uchun ${PAYROLL_PHASE_LABELS[cycleType]} to'lovi amalga oshirildi.\n` +
      `Summa: ${formatMoney(paymentAmount)} so'm\n` +
      `Sana: ${dayKey(paidAtSql)}\n` +
      `Chek: ${receipt?.receipt_number || '-'}`,
  });

  const payment = db
    .prepare(
      `
      SELECT sp.*, e.full_name, e.employee_code, pc.month_key, pc.cycle_type, r.receipt_number
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      INNER JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
      LEFT JOIN receipts r ON r.payment_id = sp.id
      WHERE sp.id = ?
      LIMIT 1
    `,
    )
    .get(txResult.paymentId);

  return {
    ok: true,
    payment,
    cycle: txResult.updatedCycle,
    receipt,
    transaction_id: transactionId,
  };
}

export function getPayrollPayments({ employeeId, monthKey, phase, limit = 50 } = {}) {
  let where = '1 = 1';
  const params = [];

  if (Number.isInteger(employeeId) && employeeId > 0) {
    where += ' AND sp.employee_id = ?';
    params.push(employeeId);
  }
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
    where += ' AND pc.month_key = ?';
    params.push(monthKey);
  }
  if (phase && ['advance', 'salary'].includes(String(phase))) {
    where += ' AND lower(trim(sp.payment_phase)) = ?';
    params.push(String(phase).trim().toLowerCase());
  }

  const rows = db
    .prepare(
      `
      SELECT
        sp.id,
        sp.employee_id,
        e.full_name,
        e.employee_code,
        sp.payment_phase,
        sp.amount,
        sp.payment_method,
        sp.payment_status,
        sp.paid_at,
        sp.note,
        pc.month_key,
        pc.due_date,
        r.receipt_number
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      INNER JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
      LEFT JOIN receipts r ON r.payment_id = sp.id
      WHERE ${where}
      ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
      LIMIT ?
    `,
    )
    .all(...params, clamp(Number(limit) || 50, 1, 200))
    .map((row) => ({
      ...row,
      phase_label: PAYROLL_PHASE_LABELS[row.payment_phase] || row.payment_phase,
      payment_method_label: paymentMethodLabel(row.payment_method),
    }));

  return {
    payments: rows,
    total_paid_amount: roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
  };
}

function readManualTransactions({ fromDate, toDate }) {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        direction,
        category_type,
        category_slug,
        category_name,
        source_type,
        reference_type,
        reference_id,
        amount,
        title,
        note,
        payment_method,
        counterparty,
        occurred_at,
        created_at
      FROM financial_transactions
      ORDER BY datetime(replace(occurred_at, 'T', ' ')) DESC, id DESC
    `,
    )
    .all();

  return rows.filter((row) => {
    const day = dayKey(row.occurred_at);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  });
}

function readOrderIncomeTransactions({ fromDate, toDate }) {
  const rows = db
    .prepare(
      `
      SELECT
        o.id,
        o.total_amount,
        o.created_at,
        o.status,
        u.full_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE lower(trim(COALESCE(o.status, 'pending'))) != 'cancelled'
      ORDER BY datetime(replace(o.created_at, 'T', ' ')) DESC, o.id DESC
    `,
    )
    .all();

  return rows
    .filter((row) => {
      const day = dayKey(row.created_at);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    })
    .map((row) => ({
      id: `order-${row.id}`,
      direction: 'income',
      category_type: 'income',
      category_slug: 'product_sales',
      category_name: 'Mahsulot savdosi',
      source_type: 'product_sale',
      reference_type: 'order',
      reference_id: row.id,
      amount: roundMoney(row.total_amount),
      title: `Buyurtma #${row.id}`,
      note: row.full_name ? `${row.full_name} buyurtmasi` : 'Mahsulot savdosi',
      payment_method: 'mixed',
      counterparty: row.full_name || '',
      occurred_at: row.created_at,
      created_at: row.created_at,
      is_virtual: true,
    }));
}

function filterTransactions(rows, { direction, categorySlug, search }) {
  const normalizedDirection = String(direction || 'all').trim().toLowerCase();
  const normalizedCategory = String(categorySlug || 'all').trim().toLowerCase();
  const query = String(search || '').trim().toLowerCase();

  return rows.filter((row) => {
    if (normalizedDirection !== 'all' && row.direction !== normalizedDirection) return false;
    if (normalizedCategory !== 'all' && String(row.category_slug || '').toLowerCase() !== normalizedCategory) {
      return false;
    }
    if (query) {
      const haystack = [
        row.title,
        row.note,
        row.category_name,
        row.counterparty,
        row.reference_type,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function summarizeTransactions(rows) {
  const totalIncome = roundMoney(
    rows.filter((row) => row.direction === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const totalExpense = roundMoney(
    rows.filter((row) => row.direction === 'expense').reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const payrollExpense = roundMoney(
    rows
      .filter((row) => row.direction === 'expense' && row.source_type === 'payroll')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const expenseGroups = new Map();
  for (const row of rows.filter((item) => item.direction === 'expense')) {
    const key = String(row.category_name || 'Boshqa');
    expenseGroups.set(key, roundMoney((expenseGroups.get(key) || 0) + Number(row.amount || 0)));
  }

  const expenseRatios = [...expenseGroups.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      ratio: totalExpense > 0 ? roundMoney((amount / totalExpense) * 100) : 0,
    }))
    .sort((left, right) => right.amount - left.amount);

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    net_profit: roundMoney(totalIncome - totalExpense),
    payroll_expense: payrollExpense,
    expense_ratios: expenseRatios,
  };
}

export function getFinancialTransactions(filters = {}) {
  const fromDate = filters.from_date && /^\d{4}-\d{2}-\d{2}$/.test(filters.from_date) ? filters.from_date : null;
  const toDate = filters.to_date && /^\d{4}-\d{2}-\d{2}$/.test(filters.to_date) ? filters.to_date : null;
  const manualRows = readManualTransactions({ fromDate, toDate });
  const orderRows = readOrderIncomeTransactions({ fromDate, toDate });
  const merged = [...manualRows, ...orderRows].sort((left, right) => {
    const byDate = String(right.occurred_at).localeCompare(String(left.occurred_at));
    if (byDate !== 0) return byDate;
    return String(right.id).localeCompare(String(left.id));
  });
  const filtered = filterTransactions(merged, {
    direction: filters.direction,
    categorySlug: filters.category_slug,
    search: filters.search,
  });

  return {
    transactions: filtered.slice(0, clamp(Number(filters.limit) || 80, 1, 400)),
    summary: summarizeTransactions(filtered),
    categories: {
      income: sanitizeCategoryList(readSeededCategories('income_categories')),
      expense: sanitizeCategoryList(readSeededCategories('expense_categories')),
    },
  };
}

export function createFinancialTransaction(payload, actorUserId) {
  const direction = sanitizeDirection(payload.direction);
  const amount = roundMoney(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'Summa musbat son bo lishi kerak.' };
  }

  const title = String(payload.title || '').trim();
  if (!title) {
    return { ok: false, status: 400, error: 'Sarlavha kiritilishi kerak.' };
  }

  const categoryType = direction === 'income' ? 'income' : 'expense';
  const categorySlug = String(payload.category_slug || '').trim();
  const categorySource = categoryType === 'income' ? 'income_categories' : 'expense_categories';
  const categoryRow =
    db
      .prepare(`SELECT slug, label_uz FROM ${categorySource} WHERE slug = ? AND is_active = 1 LIMIT 1`)
      .get(categorySlug) ||
    db.prepare(`SELECT slug, label_uz FROM ${categorySource} WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1`).get();

  const occurredAt = parseSqlDate(payload.occurred_at) || new Date();
  const occurredAtSql = toSqlDateTime(occurredAt);
  const note = String(payload.note || '').trim();
  const paymentMethod = String(payload.payment_method || DEFAULT_PAYMENT_METHOD).trim().toLowerCase() || DEFAULT_PAYMENT_METHOD;
  const sourceType = String(payload.source_type || (direction === 'income' ? 'manual_income' : 'shop_expense'))
    .trim()
    .toLowerCase()
    .slice(0, 60);

  const result = db
    .prepare(
      `
      INSERT INTO financial_transactions (
        direction,
        category_type,
        category_slug,
        category_name,
        source_type,
        reference_type,
        reference_id,
        amount,
        title,
        note,
        payment_method,
        counterparty,
        occurred_at,
        created_by,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      direction,
      categoryType,
      categoryRow?.slug || categorySlug || 'other',
      categoryRow?.label_uz || (categoryType === 'income' ? 'Daromad' : 'Xarajat'),
      sourceType,
      amount,
      title,
      note || null,
      paymentMethod,
      String(payload.counterparty || '').trim() || null,
      occurredAtSql,
      actorUserId || null,
      JSON.stringify({
        source_type: sourceType,
      }),
      toSqlDateTime(new Date()),
    );

  const transaction = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(result.lastInsertRowid);
  insertAuditLog({
    actorUserId,
    entityType: 'financial_transaction',
    entityId: transaction.id,
    action: 'create',
    description: `${title} moliyaviy yozuvi yaratildi`,
    payload: transaction,
  });
  return { ok: true, transaction };
}

function lastDaysRange(days) {
  const safeDays = clamp(Number(days) || 180, 7, 366);
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - safeDays + 1);
  return {
    from: toSqlDate(start),
    to: toSqlDate(end),
    days: safeDays,
  };
}

function buildMonthlySeries(monthCount = 6) {
  const months = [];
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const key = monthKeyFromDate(addMonths(new Date(), -offset));
    const monthStart = `${key}-01`;
    const monthEnd = toSqlDate(endOfMonth(parseSqlDate(key)));
    const snapshot = getFinancialTransactions({ from_date: monthStart, to_date: monthEnd, limit: 5000 });
    months.push({
      month_key: key,
      label: monthLabel(key),
      revenue: snapshot.summary.total_income,
      expense: snapshot.summary.total_expense,
      payroll: snapshot.summary.payroll_expense,
      profit: snapshot.summary.net_profit,
    });
  }
  return months;
}

export function getAccountingOverview({ rangeDays = 180 } = {}) {
  const range = lastDaysRange(rangeDays);
  const financial = getFinancialTransactions({
    from_date: range.from,
    to_date: range.to,
    limit: 600,
  });
  const payroll = getPayrollEmployees();
  const series = buildMonthlySeries(6);
  const activity = getActivityFeed({ limit: 8 }).activities;

  return {
    range,
    updated_at: toSqlDateTime(new Date()),
    kpis: [
      {
        key: 'revenue',
        title: 'Umumiy tushum',
        value: financial.summary.total_income,
        accent: 'emerald',
      },
      {
        key: 'expense',
        title: 'Umumiy xarajatlar',
        value: financial.summary.total_expense,
        accent: 'rose',
      },
      {
        key: 'profit',
        title: 'Sof foyda',
        value: financial.summary.net_profit,
        accent: 'sky',
      },
      {
        key: 'payroll',
        title: "Oyliklar uchun jami xarajat",
        value: financial.summary.payroll_expense,
        accent: 'violet',
      },
    ],
    quick_actions: [
      { key: 'new-expense', label: "Yangi xarajat qo'shish", action: 'new-expense' },
      { key: 'salary-pay', label: "Oylik to'lash", action: 'salary-pay' },
      { key: 'advance-pay', label: 'Avans berish', action: 'advance-pay' },
      { key: 'export-report', label: 'Hisobot chiqarish', action: 'export-report' },
    ],
    charts: {
      monthly: series,
      expense_ratios: financial.summary.expense_ratios.slice(0, 6),
    },
    payroll_overview: payroll.summary,
    activity,
  };
}

export function getPayrollCalendar({ monthKey } = {}) {
  const resolvedMonthKey = /^\d{4}-\d{2}$/.test(String(monthKey || '').trim())
    ? String(monthKey).trim()
    : monthKeyFromDate(new Date());
  ensurePayrollCyclesForKeys([resolvedMonthKey]);

  const rows = db
    .prepare(
      `
      SELECT pc.*, e.full_name, e.employee_code
      FROM payroll_cycles pc
      INNER JOIN employees e ON e.id = pc.employee_id
      WHERE pc.month_key = ?
      ORDER BY pc.due_date ASC, e.full_name COLLATE NOCASE ASC, pc.id ASC
    `,
    )
    .all(resolvedMonthKey)
    .map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.full_name,
      employee_code: row.employee_code,
      cycle_type: row.cycle_type,
      cycle_label: row.cycle_label,
      due_date: row.due_date,
      amount: row.base_amount,
      remaining_amount: row.remaining_amount,
      status: row.status,
      status_label: PAYROLL_STATUS_LABELS[row.status] || row.status,
    }));

  return {
    month_key: resolvedMonthKey,
    month_label: monthLabel(resolvedMonthKey),
    events: rows,
    summary: {
      upcoming_count: rows.filter((row) => row.status === 'pending').length,
      overdue_count: rows.filter((row) => row.status === 'overdue').length,
      paid_count: rows.filter((row) => row.status === 'paid').length,
    },
  };
}

export function getReportsSummary({ rangeDays = 90 } = {}) {
  const range = lastDaysRange(rangeDays);
  const financial = getFinancialTransactions({
    from_date: range.from,
    to_date: range.to,
    limit: 3000,
  });
  const monthSeries = buildMonthlySeries(6);
  const payroll = getPayrollEmployees();

  const incomeChannels = new Map();
  for (const row of financial.transactions.filter((item) => item.direction === 'income')) {
    const key = String(row.category_name || 'Daromad');
    incomeChannels.set(key, roundMoney((incomeChannels.get(key) || 0) + Number(row.amount || 0)));
  }

  return {
    range,
    summary: financial.summary,
    payroll: payroll.summary,
    top_income_channels: [...incomeChannels.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5),
    month_balance: monthSeries,
    top_expenses: financial.summary.expense_ratios.slice(0, 5),
  };
}

export function getActivityFeed({ limit = 40 } = {}) {
  const manual = db
    .prepare(
      `
      SELECT id, title, note, occurred_at AS created_at, amount, direction, category_name
      FROM financial_transactions
      ORDER BY datetime(replace(occurred_at, 'T', ' ')) DESC, id DESC
      LIMIT 60
    `,
    )
    .all()
    .map((row) => ({
      id: `txn-${row.id}`,
      type: 'transaction',
      title: row.title,
      description: row.note || row.category_name || '',
      amount: row.amount,
      direction: row.direction,
      created_at: row.created_at,
    }));

  const payroll = db
    .prepare(
      `
      SELECT sp.id, e.full_name, sp.payment_phase, sp.amount, sp.paid_at
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
      LIMIT 60
    `,
    )
    .all()
    .map((row) => ({
      id: `pay-${row.id}`,
      type: 'payroll',
      title: `${row.full_name} - ${PAYROLL_PHASE_LABELS[row.payment_phase] || row.payment_phase}`,
      description: "Ish haqi to'lovi qayd etildi",
      amount: row.amount,
      direction: 'expense',
      created_at: row.paid_at,
    }));

  const audit = db
    .prepare(
      `
      SELECT id, action, description, created_at
      FROM audit_logs
      ORDER BY datetime(replace(created_at, 'T', ' ')) DESC, id DESC
      LIMIT 60
    `,
    )
    .all()
    .map((row) => ({
      id: `audit-${row.id}`,
      type: 'audit',
      title: row.description,
      description: row.action,
      amount: null,
      direction: 'neutral',
      created_at: row.created_at,
    }));

  const activities = [...manual, ...payroll, ...audit]
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, clamp(Number(limit) || 40, 1, 100));

  return { activities };
}

export function buildExportFile({ type = 'transactions', rangeDays = 90 } = {}) {
  if (type === 'payroll') {
    const payroll = getPayrollPayments({ limit: 500 });
    const content = buildCsv(
      [
        { key: 'employee_code', label: 'Kod' },
        { key: 'full_name', label: 'Xodim' },
        { key: 'phase_label', label: 'Bosqich' },
        { key: 'amount', label: 'Summa' },
        { key: 'payment_method_label', label: "To'lov usuli" },
        { key: 'paid_at', label: 'To`langan sana' },
        { key: 'receipt_number', label: 'Chek raqami' },
      ],
      payroll.payments,
    );
    return {
      filename: `myshop-payroll-${toSqlDate(new Date())}.csv`,
      mime: 'text/csv; charset=utf-8',
      content,
    };
  }

  const range = lastDaysRange(rangeDays);
  const transactions = getFinancialTransactions({ from_date: range.from, to_date: range.to, limit: 5000 });
  const content = buildCsv(
    [
      { key: 'occurred_at', label: 'Sana' },
      { key: 'direction', label: 'Turi' },
      { key: 'category_name', label: 'Kategoriya' },
      { key: 'title', label: 'Sarlavha' },
      { key: 'amount', label: 'Summa' },
      { key: 'counterparty', label: 'Tomon' },
      { key: 'note', label: 'Izoh' },
    ],
    transactions.transactions,
  );
  return {
    filename: `myshop-transactions-${range.from}-${range.to}.csv`,
    mime: 'text/csv; charset=utf-8',
    content,
  };
}

export function getReceiptPayload(paymentId) {
  const payment = db
    .prepare(
      `
      SELECT
        sp.id,
        sp.amount,
        sp.payment_phase,
        sp.payment_method,
        sp.paid_at,
        sp.note,
        e.full_name,
        e.employee_code,
        e.monthly_salary,
        pc.month_key,
        pc.due_date,
        pc.base_amount,
        pc.paid_amount,
        pc.remaining_amount
      FROM salary_payments sp
      INNER JOIN employees e ON e.id = sp.employee_id
      INNER JOIN payroll_cycles pc ON pc.id = sp.payroll_cycle_id
      WHERE sp.id = ?
      LIMIT 1
    `,
    )
    .get(paymentId);

  if (!payment) return null;
  const receipt = ensureReceiptForPayment(paymentId);
  return {
    receipt,
    payment,
  };
}

export async function buildReceiptPdf(paymentId) {
  const payload = getReceiptPayload(paymentId);
  if (!payload) {
    return null;
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { payment, receipt } = payload;
      doc.fontSize(22).text('MyShop - Ish haqi cheki', { align: 'left' });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#64748b').text(`Chek raqami: ${receipt?.receipt_number || '-'}`);
      doc.text(`Yaratilgan sana: ${dayKey(receipt?.created_at) || dayKey(payment.paid_at)}`);
      doc.moveDown();

      doc.fillColor('#111827').fontSize(13).text('Xodim ma`lumotlari');
      doc.moveDown(0.2);
      doc.fontSize(11).text(`Xodim: ${payment.full_name}`);
      doc.text(`Kod: ${payment.employee_code}`);
      doc.text(`Oylik maoshi: ${formatMoney(payment.monthly_salary)} so'm`);
      doc.moveDown();

      doc.fontSize(13).text('To`lov tafsilotlari');
      doc.moveDown(0.2);
      doc.fontSize(11).text(`Bosqich: ${PAYROLL_PHASE_LABELS[payment.payment_phase] || payment.payment_phase}`);
      doc.text(`Oy: ${monthLabel(payment.month_key)}`);
      doc.text(`To'langan summa: ${formatMoney(payment.amount)} so'm`);
      doc.text(`To'lov usuli: ${paymentMethodLabel(payment.payment_method)}`);
      doc.text(`To'lov sanasi: ${dayKey(payment.paid_at)}`);
      doc.text(`Muddat: ${payment.due_date}`);
      doc.moveDown();

      doc.fontSize(13).text('Sikl holati');
      doc.moveDown(0.2);
      doc.fontSize(11).text(`Sikl bo'yicha reja: ${formatMoney(payment.base_amount)} so'm`);
      doc.text(`To'langan jami: ${formatMoney(payment.paid_amount)} so'm`);
      doc.text(`Qolgan balans: ${formatMoney(payment.remaining_amount)} so'm`);
      if (payment.note) {
        doc.moveDown();
        doc.fontSize(13).text('Izoh');
        doc.moveDown(0.2);
        doc.fontSize(11).text(payment.note);
      }

      doc.moveDown(2);
      doc.fillColor('#64748b').fontSize(10).text('Ushbu hujjat MyShop Accounting tizimi tomonidan avtomatik yaratildi.');
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
