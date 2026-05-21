import axios from 'axios';

const PAYROLL_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  OVERDUE: 'overdue',
};

const PAYROLL_CYCLE_TYPE = {
  ADVANCE: 'advance',
  SALARY: 'salary',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function toDbDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseDbDate(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function firstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function buildMonthLabel(date) {
  return date.toLocaleDateString('uz-UZ', {
    month: 'short',
    year: 'numeric',
  });
}

function buildMonthKey(year, month) {
  return `${year}-${pad(month)}`;
}

function parseMonthKey(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function getReferenceMonth(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (parsed) return parsed;
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function buildCycleAmounts(employee) {
  const monthlySalary = roundMoney(employee?.monthly_salary);
  const advanceRatio = Math.min(0.8, Math.max(0.2, Number(employee?.advance_ratio) || 0.5));
  const advanceAmount = roundMoney(monthlySalary * advanceRatio);
  const salaryAmount = roundMoney(monthlySalary - advanceAmount);
  return { monthlySalary, advanceAmount, salaryAmount, advanceRatio };
}

function buildCycleDefinition(employee, year, month, cycleType) {
  const monthStart = firstDayOfMonth(year, month);
  const monthEnd = lastDayOfMonth(year, month);
  const { monthlySalary, advanceAmount, salaryAmount } = buildCycleAmounts(employee);
  const dueDay = cycleType === PAYROLL_CYCLE_TYPE.ADVANCE ? 15 : monthEnd.getDate();
  const dueDate = new Date(year, month - 1, dueDay, cycleType === PAYROLL_CYCLE_TYPE.ADVANCE ? 11 : 18, 0, 0, 0);
  const grossAmount = cycleType === PAYROLL_CYCLE_TYPE.ADVANCE ? advanceAmount : salaryAmount;

  return {
    cycleType,
    cycleYear: year,
    cycleMonth: month,
    periodStart: toDbDate(monthStart),
    periodEnd: toDbDate(monthEnd),
    dueDate: toDbDate(dueDate),
    grossAmount,
    monthlySalary,
  };
}

function getPayrollStatusLabelUz(status) {
  if (status === PAYROLL_STATUS.PAID) return 'To‘landi';
  if (status === PAYROLL_STATUS.OVERDUE) return 'Kechikkan';
  return 'Kutilmoqda';
}

function getCycleTypeLabelUz(cycleType) {
  return cycleType === PAYROLL_CYCLE_TYPE.ADVANCE ? 'Avans' : 'Oylik ish haqi';
}

function normalizePayrollStatus(row, referenceDate = new Date()) {
  const grossAmount = roundMoney(row?.gross_amount);
  const paidAmount = roundMoney(row?.paid_amount);
  const remainingAmount = Math.max(0, roundMoney(grossAmount - paidAmount));
  if (remainingAmount <= 0.009) return PAYROLL_STATUS.PAID;
  const dueDate = parseDbDate(row?.due_date);
  if (dueDate && dueDate.getTime() < referenceDate.getTime()) return PAYROLL_STATUS.OVERDUE;
  return PAYROLL_STATUS.PENDING;
}

function getDefaultCategoryName(direction) {
  return direction === 'income' ? 'Qo‘shimcha tushum' : 'Boshqa xarajat';
}

function parseDateRange(filters = {}, fallbackDays = 30) {
  const now = new Date();
  const from = filters.from ? startOfDay(parseDbDate(filters.from) || new Date(filters.from)) : new Date(now.getTime() - fallbackDays * DAY_MS);
  const to = filters.to ? endOfDay(parseDbDate(filters.to) || new Date(filters.to)) : endOfDay(now);
  return {
    fromDate: from,
    toDate: to,
    fromDb: toDbDate(from),
    toDb: toDbDate(to),
  };
}

function buildMonthBuckets(count = 6, referenceDate = new Date()) {
  const buckets = [];
  const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - offset, 1);
    buckets.push({
      key: buildMonthKey(date.getFullYear(), date.getMonth() + 1),
      label: buildMonthLabel(date),
      revenue: 0,
      expenses: 0,
      payroll: 0,
      profit: 0,
    });
  }
  return buckets;
}

function buildCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function resolveTelegramChatId(employee) {
  return String(employee?.telegram_chat_id || process.env.TELEGRAM_ACCOUNTING_CHAT_ID || '').trim();
}

async function sendTelegramMessage(chatId, text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const targetChatId = String(chatId || '').trim();
  if (!token || !targetChatId || !text) return { ok: false, skipped: true };
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: targetChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
      { timeout: 6000 },
    );
    return { ok: true };
  } catch (error) {
    console.warn('[MyShop] Telegram notification failed:', error?.response?.data || error?.message || error);
    return { ok: false, error };
  }
}

export function insertAccountingAuditLog(db, { actorUserId = null, action, entityType, entityId = null, summary = '', payload = null }) {
  db.prepare(
    `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, summary, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    actorUserId,
    String(action || '').trim(),
    String(entityType || '').trim(),
    entityId == null ? null : Number(entityId),
    String(summary || '').trim(),
    payload == null ? null : JSON.stringify(payload),
    toDbDate(),
  );
}

function getExpenseCategoryBySlug(db, slug) {
  return db.prepare(`SELECT id, slug, name_uz FROM expense_categories WHERE slug = ? LIMIT 1`).get(String(slug || '').trim());
}

function getActiveEmployees(db, filters = {}) {
  const params = [];
  let sql = `
    SELECT id, user_id, full_name, position_title, phone, employment_status, monthly_salary, advance_ratio,
           payment_method, telegram_chat_id, access_level, created_at, updated_at
    FROM employees
    WHERE employment_status = 'active'
  `;
  const search = String(filters.search || '').trim();
  if (search) {
    sql += ` AND (lower(full_name) LIKE lower(?) OR lower(COALESCE(position_title, '')) LIKE lower(?) OR lower(COALESCE(phone, '')) LIKE lower(?))`;
    const token = `%${search}%`;
    params.push(token, token, token);
  }
  sql += ` ORDER BY full_name COLLATE NOCASE ASC`;
  if (Number.isFinite(filters.limit) && filters.limit > 0) {
    sql += ` LIMIT ?`;
    params.push(Number(filters.limit));
  }
  return db.prepare(sql).all(...params);
}

function findNearestOpenCycle(db, employeeId) {
  return (
    db
      .prepare(
        `
          SELECT *
          FROM payroll_cycles
          WHERE employee_id = ?
            AND remaining_amount > 0.009
          ORDER BY datetime(replace(due_date, 'T', ' ')) ASC, id ASC
          LIMIT 1
        `,
      )
      .get(employeeId) || null
  );
}

function findLastPayment(db, employeeId) {
  return (
    db
      .prepare(
        `
          SELECT sp.id, sp.amount, sp.paid_at, sp.payment_method, sp.note, sp.receipt_id, pc.cycle_type
          FROM salary_payments sp
          LEFT JOIN payroll_cycles pc ON pc.id = sp.cycle_id
          WHERE sp.employee_id = ?
          ORDER BY datetime(replace(sp.paid_at, 'T', ' ')) DESC, sp.id DESC
          LIMIT 1
        `,
      )
      .get(employeeId) || null
  );
}

export function ensurePayrollCyclesForWindow(db, referenceDate = new Date(), monthOffsets = [-1, 0, 1]) {
  const employees = getActiveEmployees(db);
  const insertCycle = db.prepare(
    `
      INSERT OR IGNORE INTO payroll_cycles (
        employee_id, cycle_year, cycle_month, cycle_type, period_start, period_end,
        due_date, gross_amount, paid_amount, remaining_amount, status, auto_generated,
        note, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?, ?, ?)
    `,
  );

  for (const employee of employees) {
    for (const offset of monthOffsets) {
      const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + offset, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      for (const cycleType of [PAYROLL_CYCLE_TYPE.ADVANCE, PAYROLL_CYCLE_TYPE.SALARY]) {
        const cycle = buildCycleDefinition(employee, year, month, cycleType);
        const stamp = toDbDate();
        insertCycle.run(
          employee.id,
          cycle.cycleYear,
          cycle.cycleMonth,
          cycle.cycleType,
          cycle.periodStart,
          cycle.periodEnd,
          cycle.dueDate,
          cycle.grossAmount,
          cycle.grossAmount,
          PAYROLL_STATUS.PENDING,
          `${getCycleTypeLabelUz(cycleType)} sikli avtomatik yaratildi`,
          stamp,
          stamp,
        );
      }
    }
  }
}

function fetchCycleWithEmployee(db, cycleId) {
  return db
    .prepare(
      `
        SELECT pc.*, e.full_name, e.monthly_salary, e.position_title, e.phone, e.telegram_chat_id, e.payment_method
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE pc.id = ?
        LIMIT 1
      `,
    )
    .get(cycleId);
}

export function recalculatePayrollCycle(db, cycleId, referenceDate = new Date()) {
  const cycle = fetchCycleWithEmployee(db, cycleId);
  if (!cycle) return null;

  const paidRow = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS paid_total FROM salary_payments WHERE cycle_id = ?`)
    .get(cycleId);
  const paidAmount = roundMoney(paidRow?.paid_total);
  const grossAmount = roundMoney(cycle.gross_amount);
  const remainingAmount = Math.max(0, roundMoney(grossAmount - paidAmount));
  const status = normalizePayrollStatus({ ...cycle, paid_amount: paidAmount }, referenceDate);
  const updatedAt = toDbDate();

  db.prepare(
    `
      UPDATE payroll_cycles
      SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(paidAmount, remainingAmount, status, updatedAt, cycleId);

  return {
    ...cycle,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    status,
    updated_at: updatedAt,
  };
}

export async function runAccountingAutomation(db, options = {}) {
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  const shouldSendTelegram = options.sendTelegram !== false;
  ensurePayrollCyclesForWindow(db, referenceDate);

  const cycles = db
    .prepare(
      `
        SELECT pc.id, pc.status, pc.telegram_reminded_at, pc.due_date,
               e.full_name, e.telegram_chat_id
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE pc.auto_generated = 1
           OR pc.status != 'paid'
      `,
    )
    .all();

  let pendingCount = 0;
  let overdueCount = 0;
  let paidCount = 0;
  const todayKey = toDbDate(startOfDay(referenceDate)).slice(0, 10);

  for (const row of cycles) {
    const previousStatus = String(row.status || '').trim();
    const updated = recalculatePayrollCycle(db, row.id, referenceDate);
    if (!updated) continue;
    if (updated.status === PAYROLL_STATUS.PAID) paidCount += 1;
    else if (updated.status === PAYROLL_STATUS.OVERDUE) overdueCount += 1;
    else pendingCount += 1;

    const remindedDay = String(updated.telegram_reminded_at || '').slice(0, 10);
    if (
      shouldSendTelegram &&
      updated.status === PAYROLL_STATUS.OVERDUE &&
      previousStatus !== PAYROLL_STATUS.OVERDUE &&
      remindedDay !== todayKey
    ) {
      const chatId = resolveTelegramChatId(updated);
      if (chatId) {
        const text =
          `<b>MyShop — Ish haqi eslatmasi</b>\n` +
          `${updated.full_name} uchun ${getCycleTypeLabelUz(updated.cycle_type)} kechikdi.\n` +
          `Muddat: ${String(updated.due_date).slice(0, 10)}\n` +
          `Qolgan summa: ${new Intl.NumberFormat('uz-UZ').format(updated.remaining_amount)} so‘m\n` +
          `Holat: ${getPayrollStatusLabelUz(updated.status)}`;
        const sent = await sendTelegramMessage(chatId, text);
        if (sent.ok) {
          db.prepare(`UPDATE payroll_cycles SET telegram_reminded_at = ? WHERE id = ?`).run(toDbDate(referenceDate), updated.id);
        }
      }
    }
  }

  return {
    pendingCount,
    overdueCount,
    paidCount,
    refreshedAt: toDbDate(referenceDate),
  };
}

function getCategorySnapshot(db, direction, categoryId) {
  if (!Number.isFinite(Number(categoryId)) || Number(categoryId) < 1) {
    return {
      categoryId: null,
      categorySlug: direction === 'income' ? 'manual-income' : 'other-expense',
      categoryName: getDefaultCategoryName(direction),
    };
  }

  const table = direction === 'income' ? 'income_categories' : 'expense_categories';
  const row = db.prepare(`SELECT id, slug, name_uz FROM ${table} WHERE id = ? LIMIT 1`).get(Number(categoryId));
  if (!row) {
    return {
      categoryId: null,
      categorySlug: direction === 'income' ? 'manual-income' : 'other-expense',
      categoryName: getDefaultCategoryName(direction),
    };
  }

  return {
    categoryId: Number(row.id),
    categorySlug: String(row.slug || '').trim(),
    categoryName: String(row.name_uz || '').trim(),
  };
}

function getTransactionRow(db, id) {
  return db.prepare(`SELECT * FROM financial_transactions WHERE id = ? LIMIT 1`).get(id);
}

export function createFinancialTransaction(db, payload, actorUserId = null) {
  const direction = String(payload?.direction || '').trim().toLowerCase();
  if (!['income', 'expense'].includes(direction)) {
    return { ok: false, status: 400, error: 'Yo‘nalish noto‘g‘ri.' };
  }

  const amount = roundMoney(payload?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'Summa musbat bo‘lishi kerak.' };
  }

  const title = String(payload?.title || '').trim();
  if (!title) {
    return { ok: false, status: 400, error: 'Sarlavha kiritilishi shart.' };
  }

  const note = String(payload?.note || '').trim();
  const source = String(payload?.source || (direction === 'income' ? 'manual_income' : 'manual_expense')).trim();
  const status = String(payload?.status || 'completed').trim() || 'completed';
  const transactionDate = payload?.transaction_date ? toDbDate(parseDbDate(payload.transaction_date) || new Date(payload.transaction_date)) : toDbDate();
  const category = getCategorySnapshot(db, direction, payload?.category_id);
  const linkedEmployeeId =
    Number.isFinite(Number(payload?.linked_employee_id)) && Number(payload.linked_employee_id) > 0
      ? Number(payload.linked_employee_id)
      : null;
  const linkedCycleId =
    Number.isFinite(Number(payload?.linked_cycle_id)) && Number(payload.linked_cycle_id) > 0
      ? Number(payload.linked_cycle_id)
      : null;

  const insert = db.prepare(
    `
      INSERT INTO financial_transactions (
        direction, amount, title, note, source, status, transaction_date,
        category_id, category_slug, category_name, linked_employee_id, linked_cycle_id,
        created_by, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const result = insert.run(
    direction,
    amount,
    title,
    note,
    source,
    status,
    transactionDate,
    category.categoryId,
    category.categorySlug,
    category.categoryName,
    linkedEmployeeId,
    linkedCycleId,
    actorUserId,
    toDbDate(),
  );

  const transaction = getTransactionRow(db, result.lastInsertRowid);
  insertAccountingAuditLog(db, {
    actorUserId,
    action: 'transaction.create',
    entityType: 'financial_transaction',
    entityId: transaction.id,
    summary: `${direction === 'income' ? 'Tushum' : 'Xarajat'} qo‘shildi`,
    payload: transaction,
  });

  return { ok: true, transaction };
}

function buildReceiptNumber(receiptId, cycle) {
  return `MS-${cycle.cycle_year}${pad(cycle.cycle_month)}-${pad(receiptId)}`;
}

function getReceiptById(db, receiptId) {
  return db.prepare(`SELECT * FROM receipts WHERE id = ? LIMIT 1`).get(receiptId);
}

export function getReceiptDetail(db, receiptId) {
  const receipt = getReceiptById(db, receiptId);
  if (!receipt) return null;
  const payload = safeJsonParse(receipt.payload_json, {});
  if (receipt.entity_type !== 'salary_payment') {
    return {
      ...receipt,
      payload,
    };
  }

  const row = db
    .prepare(
      `
        SELECT r.id AS receipt_id, r.receipt_number, r.created_at AS receipt_created_at,
               sp.id AS payment_id, sp.amount, sp.payment_kind, sp.payment_method, sp.note, sp.paid_at,
               pc.id AS cycle_id, pc.cycle_type, pc.cycle_year, pc.cycle_month, pc.gross_amount, pc.paid_amount,
               pc.remaining_amount, pc.due_date, pc.status,
               e.id AS employee_id, e.full_name, e.position_title, e.phone, e.monthly_salary
        FROM receipts r
        INNER JOIN salary_payments sp ON sp.id = r.entity_id
        INNER JOIN payroll_cycles pc ON pc.id = sp.cycle_id
        INNER JOIN employees e ON e.id = sp.employee_id
        WHERE r.id = ?
        LIMIT 1
      `,
    )
    .get(receiptId);

  if (!row) return { ...receipt, payload };

  return {
    id: row.receipt_id,
    receipt_number: row.receipt_number,
    created_at: row.receipt_created_at,
    entity_type: 'salary_payment',
    payment: {
      id: row.payment_id,
      amount: row.amount,
      kind: row.payment_kind,
      method: row.payment_method,
      note: row.note,
      paid_at: row.paid_at,
    },
    cycle: {
      id: row.cycle_id,
      type: row.cycle_type,
      type_label: getCycleTypeLabelUz(row.cycle_type),
      year: row.cycle_year,
      month: row.cycle_month,
      gross_amount: row.gross_amount,
      paid_amount: row.paid_amount,
      remaining_amount: row.remaining_amount,
      due_date: row.due_date,
      status: row.status,
      status_label: getPayrollStatusLabelUz(row.status),
    },
    employee: {
      id: row.employee_id,
      full_name: row.full_name,
      position_title: row.position_title,
      phone: row.phone,
      monthly_salary: row.monthly_salary,
    },
    payload,
  };
}

export async function registerSalaryPayment(db, payload, actorUserId = null) {
  const cycleId = Number(payload?.cycleId);
  if (!Number.isFinite(cycleId) || cycleId < 1) {
    return { ok: false, status: 400, error: 'Payroll sikli topilmadi.' };
  }

  const cycle = recalculatePayrollCycle(db, cycleId, new Date());
  if (!cycle) return { ok: false, status: 404, error: 'Payroll sikli topilmadi.' };

  const remainingBeforePayment = roundMoney(cycle.remaining_amount);
  if (remainingBeforePayment <= 0.009) {
    return { ok: false, status: 409, error: 'Bu sikl allaqachon yopilgan.' };
  }

  const requestedAmount = payload?.amount == null || payload?.amount === '' ? remainingBeforePayment : roundMoney(payload.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { ok: false, status: 400, error: 'To‘lov summasi noto‘g‘ri.' };
  }
  if (requestedAmount - remainingBeforePayment > 0.009) {
    return { ok: false, status: 400, error: 'To‘lov summasi qolgan balansdan oshib ketdi.' };
  }

  const paymentMethod = String(payload?.payment_method || cycle.payment_method || 'bank').trim();
  const note = String(payload?.note || '').trim();
  const paymentKind =
    requestedAmount + 0.009 >= remainingBeforePayment ? cycle.cycle_type : 'partial';
  const paidAt = payload?.paid_at ? toDbDate(parseDbDate(payload.paid_at) || new Date(payload.paid_at)) : toDbDate();

  const paymentInsert = db.prepare(
    `
      INSERT INTO salary_payments (
        cycle_id, employee_id, amount, payment_kind, payment_method,
        paid_at, note, created_by, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const paymentResult = paymentInsert.run(
    cycle.id,
    cycle.employee_id,
    requestedAmount,
    paymentKind,
    paymentMethod,
    paidAt,
    note,
    actorUserId,
    toDbDate(),
  );

  const receiptPayload = {
    employee_name: cycle.full_name,
    position_title: cycle.position_title,
    cycle_type: cycle.cycle_type,
    cycle_type_label: getCycleTypeLabelUz(cycle.cycle_type),
    status_label: getPayrollStatusLabelUz(cycle.status),
    amount: requestedAmount,
    payment_method: paymentMethod,
    paid_at: paidAt,
    due_date: cycle.due_date,
    cycle_month: cycle.cycle_month,
    cycle_year: cycle.cycle_year,
    note,
  };

  const receiptInsert = db.prepare(
    `
      INSERT INTO receipts (receipt_number, entity_type, entity_id, payload_json, created_at)
      VALUES (?, 'salary_payment', ?, ?, ?)
    `,
  );

  const placeholderReceipt = receiptInsert.run(
    `TMP-${Date.now()}`,
    paymentResult.lastInsertRowid,
    JSON.stringify(receiptPayload),
    toDbDate(),
  );
  const receiptNumber = buildReceiptNumber(placeholderReceipt.lastInsertRowid, cycle);
  db.prepare(`UPDATE receipts SET receipt_number = ? WHERE id = ?`).run(receiptNumber, placeholderReceipt.lastInsertRowid);
  db.prepare(`UPDATE salary_payments SET receipt_id = ? WHERE id = ?`).run(
    placeholderReceipt.lastInsertRowid,
    paymentResult.lastInsertRowid,
  );

  const payrollExpenseCategory = getExpenseCategoryBySlug(db, 'payroll');
  createFinancialTransaction(
    db,
    {
      direction: 'expense',
      amount: requestedAmount,
      title: `${getCycleTypeLabelUz(cycle.cycle_type)} — ${cycle.full_name}`,
      note: note || `${getCycleTypeLabelUz(cycle.cycle_type)} to‘lovi`,
      source: 'payroll',
      status: 'completed',
      transaction_date: paidAt,
      category_id: payrollExpenseCategory?.id ?? null,
      linked_employee_id: cycle.employee_id,
      linked_cycle_id: cycle.id,
    },
    actorUserId,
  );

  const updatedCycle = recalculatePayrollCycle(db, cycle.id, new Date());
  insertAccountingAuditLog(db, {
    actorUserId,
    action: 'payroll.payment.create',
    entityType: 'salary_payment',
    entityId: paymentResult.lastInsertRowid,
    summary: `${cycle.full_name} uchun ${getCycleTypeLabelUz(cycle.cycle_type)} to‘lovi yaratildi`,
    payload: {
      cycleId: cycle.id,
      amount: requestedAmount,
      paymentMethod,
      receiptNumber,
      remainingAmount: updatedCycle?.remaining_amount ?? null,
    },
  });

  const chatId = resolveTelegramChatId(cycle);
  if (chatId) {
    await sendTelegramMessage(
      chatId,
      `<b>MyShop — To‘lov tasdiqlandi</b>\n` +
        `${cycle.full_name} uchun ${getCycleTypeLabelUz(cycle.cycle_type)} to‘landi.\n` +
        `Summa: ${new Intl.NumberFormat('uz-UZ').format(requestedAmount)} so‘m\n` +
        `Usul: ${paymentMethod}\n` +
        `Chek: ${receiptNumber}`,
    );
    db.prepare(`UPDATE salary_payments SET telegram_sent_at = ? WHERE id = ?`).run(toDbDate(), paymentResult.lastInsertRowid);
  }

  return {
    ok: true,
    paymentId: paymentResult.lastInsertRowid,
    receiptId: placeholderReceipt.lastInsertRowid,
    receiptNumber,
    cycle: updatedCycle,
    receipt: getReceiptDetail(db, placeholderReceipt.lastInsertRowid),
  };
}

export function listEmployeesWithPayroll(db, filters = {}) {
  const employees = getActiveEmployees(db, filters);
  const mapped = employees.map((employee) => {
    const nextCycle = findNearestOpenCycle(db, employee.id);
    const lastPayment = findLastPayment(db, employee.id);
    const outstandingRow = db
      .prepare(
        `
          SELECT COALESCE(SUM(remaining_amount), 0) AS outstanding_total
          FROM payroll_cycles
          WHERE employee_id = ? AND remaining_amount > 0.009
        `,
      )
      .get(employee.id);

    return {
      ...employee,
      last_payment: lastPayment
        ? {
            amount: lastPayment.amount,
            paid_at: lastPayment.paid_at,
            payment_method: lastPayment.payment_method,
            receipt_id: lastPayment.receipt_id,
            cycle_type: lastPayment.cycle_type,
          }
        : null,
      next_payment: nextCycle
        ? {
            id: nextCycle.id,
            due_date: nextCycle.due_date,
            cycle_type: nextCycle.cycle_type,
            cycle_type_label: getCycleTypeLabelUz(nextCycle.cycle_type),
            status: nextCycle.status,
            status_label: getPayrollStatusLabelUz(nextCycle.status),
            remaining_amount: nextCycle.remaining_amount,
            gross_amount: nextCycle.gross_amount,
          }
        : null,
      remaining_balance: roundMoney(outstandingRow?.outstanding_total),
      status: nextCycle?.status || PAYROLL_STATUS.PAID,
      status_label: getPayrollStatusLabelUz(nextCycle?.status || PAYROLL_STATUS.PAID),
    };
  });

  return { employees: mapped };
}

export function getPayrollCycles(db, filters = {}) {
  const { year, month } = getReferenceMonth(filters.month);
  let sql = `
    SELECT pc.*, e.full_name, e.position_title, e.monthly_salary, e.phone
    FROM payroll_cycles pc
    INNER JOIN employees e ON e.id = pc.employee_id
    WHERE pc.cycle_year = ? AND pc.cycle_month = ?
  `;
  const params = [year, month];

  if (filters.status) {
    sql += ` AND pc.status = ?`;
    params.push(String(filters.status).trim());
  }
  if (Number.isFinite(Number(filters.employee_id)) && Number(filters.employee_id) > 0) {
    sql += ` AND pc.employee_id = ?`;
    params.push(Number(filters.employee_id));
  }

  sql += ` ORDER BY datetime(replace(pc.due_date, 'T', ' ')) ASC, e.full_name COLLATE NOCASE ASC`;
  const rows = db.prepare(sql).all(...params);
  const summary = {
    total_amount: 0,
    paid_amount: 0,
    remaining_amount: 0,
    paid_count: 0,
    pending_count: 0,
    overdue_count: 0,
  };

  const cycles = rows.map((row) => {
    summary.total_amount += Number(row.gross_amount) || 0;
    summary.paid_amount += Number(row.paid_amount) || 0;
    summary.remaining_amount += Number(row.remaining_amount) || 0;
    if (row.status === PAYROLL_STATUS.PAID) summary.paid_count += 1;
    else if (row.status === PAYROLL_STATUS.OVERDUE) summary.overdue_count += 1;
    else summary.pending_count += 1;

    return {
      ...row,
      cycle_type_label: getCycleTypeLabelUz(row.cycle_type),
      status_label: getPayrollStatusLabelUz(row.status),
    };
  });

  return {
    month: buildMonthKey(year, month),
    cycles,
    summary: {
      ...summary,
      net_remaining: roundMoney(summary.remaining_amount),
      total_amount: roundMoney(summary.total_amount),
      paid_amount: roundMoney(summary.paid_amount),
    },
  };
}

export function getPayrollCalendar(db, filters = {}) {
  const { year, month } = getReferenceMonth(filters.month);
  const rows = db
    .prepare(
      `
        SELECT pc.id, pc.employee_id, pc.cycle_type, pc.due_date, pc.status, pc.remaining_amount, pc.gross_amount,
               e.full_name, e.position_title
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE pc.cycle_year = ? AND pc.cycle_month = ?
        ORDER BY datetime(replace(pc.due_date, 'T', ' ')) ASC, e.full_name COLLATE NOCASE ASC
      `,
    )
    .all(year, month);

  return {
    month: buildMonthKey(year, month),
    items: rows.map((row) => ({
      ...row,
      cycle_type_label: getCycleTypeLabelUz(row.cycle_type),
      status_label: getPayrollStatusLabelUz(row.status),
      date_key: String(row.due_date || '').slice(0, 10),
    })),
  };
}

export function getAccountingCategories(db) {
  return {
    income_categories: db.prepare(`SELECT id, slug, name_uz, description FROM income_categories ORDER BY sort_order ASC, id ASC`).all(),
    expense_categories: db.prepare(`SELECT id, slug, name_uz, description FROM expense_categories ORDER BY sort_order ASC, id ASC`).all(),
  };
}

export function listFinancialTransactions(db, filters = {}) {
  const { fromDb, toDb } = parseDateRange(filters, 45);
  const clauses = [
    `datetime(replace(transaction_date, 'T', ' ')) >= datetime(?)`,
    `datetime(replace(transaction_date, 'T', ' ')) <= datetime(?)`,
  ];
  const params = [fromDb, toDb];

  if (filters.direction) {
    clauses.push(`direction = ?`);
    params.push(String(filters.direction).trim());
  }
  if (filters.source) {
    clauses.push(`source = ?`);
    params.push(String(filters.source).trim());
  }
  if (Number.isFinite(Number(filters.employee_id)) && Number(filters.employee_id) > 0) {
    clauses.push(`linked_employee_id = ?`);
    params.push(Number(filters.employee_id));
  }
  if (filters.search) {
    const token = `%${String(filters.search).trim()}%`;
    clauses.push(`(lower(title) LIKE lower(?) OR lower(COALESCE(note, '')) LIKE lower(?) OR lower(COALESCE(category_name, '')) LIKE lower(?))`);
    params.push(token, token, token);
  }

  const rows = db
    .prepare(
      `
        SELECT ft.*, e.full_name AS employee_name
        FROM financial_transactions ft
        LEFT JOIN employees e ON e.id = ft.linked_employee_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY datetime(replace(ft.transaction_date, 'T', ' ')) DESC, ft.id DESC
        LIMIT 250
      `,
    )
    .all(...params);

  const summary = rows.reduce(
    (acc, row) => {
      const amount = Number(row.amount) || 0;
      if (row.direction === 'income') acc.total_income += amount;
      else acc.total_expense += amount;
      if (row.source === 'payroll') acc.payroll_expense += amount;
      return acc;
    },
    { total_income: 0, total_expense: 0, payroll_expense: 0 },
  );
  summary.net_profit = roundMoney(summary.total_income - summary.total_expense);
  summary.total_income = roundMoney(summary.total_income);
  summary.total_expense = roundMoney(summary.total_expense);
  summary.payroll_expense = roundMoney(summary.payroll_expense);

  return { items: rows, summary };
}

function getOrderRevenueForRange(db, fromDb, toDb) {
  const row = db
    .prepare(
      `
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM orders
        WHERE datetime(replace(created_at, 'T', ' ')) >= datetime(?)
          AND datetime(replace(created_at, 'T', ' ')) <= datetime(?)
          AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'canceled', 'rejected', 'returned')
      `,
    )
    .get(fromDb, toDb);
  return roundMoney(row?.total);
}

function getGroupedOrderRevenue(db, minDateDb) {
  return db
    .prepare(
      `
        SELECT substr(replace(created_at, 'T', ' '), 1, 7) AS bucket, COALESCE(SUM(total_amount), 0) AS total
        FROM orders
        WHERE datetime(replace(created_at, 'T', ' ')) >= datetime(?)
          AND lower(trim(COALESCE(status, ''))) NOT IN ('cancelled', 'canceled', 'rejected', 'returned')
        GROUP BY bucket
      `,
    )
    .all(minDateDb);
}

function getGroupedTransactions(db, minDateDb) {
  return db
    .prepare(
      `
        SELECT substr(replace(transaction_date, 'T', ' '), 1, 7) AS bucket,
               direction,
               source,
               COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE datetime(replace(transaction_date, 'T', ' ')) >= datetime(?)
        GROUP BY bucket, direction, source
      `,
    )
    .all(minDateDb);
}

export function getDashboardOverview(db, filters = {}) {
  const { fromDb, toDb } = parseDateRange(filters, 30);
  const transactionSummary = listFinancialTransactions(db, { from: fromDb, to: toDb }).summary;
  const orderRevenue = getOrderRevenueForRange(db, fromDb, toDb);
  const totalRevenue = roundMoney(orderRevenue + transactionSummary.total_income);
  const totalExpenses = roundMoney(transactionSummary.total_expense);
  const payrollExpense = roundMoney(transactionSummary.payroll_expense);
  const netProfit = roundMoney(totalRevenue - totalExpenses);

  const employees = listEmployeesWithPayroll(db, { limit: 6 }).employees;
  const dueCycles = db
    .prepare(
      `
        SELECT pc.id, pc.cycle_type, pc.due_date, pc.remaining_amount, pc.status,
               e.full_name, e.position_title
        FROM payroll_cycles pc
        INNER JOIN employees e ON e.id = pc.employee_id
        WHERE pc.remaining_amount > 0.009
        ORDER BY datetime(replace(pc.due_date, 'T', ' ')) ASC, e.full_name COLLATE NOCASE ASC
        LIMIT 6
      `,
    )
    .all()
    .map((row) => ({
      ...row,
      cycle_type_label: getCycleTypeLabelUz(row.cycle_type),
      status_label: getPayrollStatusLabelUz(row.status),
    }));

  const todayFrom = toDbDate(startOfDay(new Date()));
  const todayTo = toDbDate(endOfDay(new Date()));
  const todayOrderRevenue = getOrderRevenueForRange(db, todayFrom, todayTo);
  const todayTransactions = listFinancialTransactions(db, { from: todayFrom, to: todayTo }).summary;

  const activityFeed = db
    .prepare(
      `
        SELECT id, direction, amount, title, note, source, category_name, transaction_date, status
        FROM financial_transactions
        ORDER BY datetime(replace(transaction_date, 'T', ' ')) DESC, id DESC
        LIMIT 12
      `,
    )
    .all()
    .map((row) => ({
      ...row,
      title: row.title || (row.direction === 'income' ? 'Tushum' : 'Xarajat'),
      label: row.direction === 'income' ? 'Tushum' : 'Xarajat',
    }));

  const chartBuckets = buildMonthBuckets(6, new Date());
  const bucketMap = new Map(chartBuckets.map((bucket) => [bucket.key, bucket]));
  const minMonthDb = `${chartBuckets[0].key}-01 00:00:00`;

  for (const row of getGroupedOrderRevenue(db, minMonthDb)) {
    const bucket = bucketMap.get(row.bucket);
    if (bucket) bucket.revenue = roundMoney(bucket.revenue + (Number(row.total) || 0));
  }
  for (const row of getGroupedTransactions(db, minMonthDb)) {
    const bucket = bucketMap.get(row.bucket);
    if (!bucket) continue;
    const amount = Number(row.total) || 0;
    if (row.direction === 'income') bucket.revenue = roundMoney(bucket.revenue + amount);
    else bucket.expenses = roundMoney(bucket.expenses + amount);
    if (row.source === 'payroll' && row.direction === 'expense') {
      bucket.payroll = roundMoney(bucket.payroll + amount);
    }
  }
  for (const bucket of chartBuckets) {
    bucket.profit = roundMoney(bucket.revenue - bucket.expenses);
  }

  return {
    kpis: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      payroll_expense: payrollExpense,
    },
    real_time: {
      today_revenue: roundMoney(todayOrderRevenue + todayTransactions.total_income),
      today_expenses: roundMoney(todayTransactions.total_expense),
      active_employees: employees.length,
      due_payments: dueCycles.length,
    },
    charts: {
      monthly: chartBuckets,
    },
    employees,
    due_cycles: dueCycles,
    activity_feed: activityFeed,
    quick_stats: {
      overdue_payroll: dueCycles.filter((cycle) => cycle.status === PAYROLL_STATUS.OVERDUE).length,
      pending_payroll: dueCycles.filter((cycle) => cycle.status === PAYROLL_STATUS.PENDING).length,
      automation_sync_at: toDbDate(),
    },
  };
}

export function getReportSummary(db, filters = {}) {
  const { fromDb, toDb } = parseDateRange(filters, 31);
  const transactionSummary = listFinancialTransactions(db, { from: fromDb, to: toDb }).summary;
  const orderRevenue = getOrderRevenueForRange(db, fromDb, toDb);
  const totalRevenue = roundMoney(orderRevenue + transactionSummary.total_income);
  const totalExpenses = roundMoney(transactionSummary.total_expense);
  const payrollExpense = roundMoney(transactionSummary.payroll_expense);
  const netProfit = roundMoney(totalRevenue - totalExpenses);
  const expenseRatio = totalRevenue > 0 ? roundMoney((totalExpenses / totalRevenue) * 100) : 0;
  const payrollRatio = totalExpenses > 0 ? roundMoney((payrollExpense / totalExpenses) * 100) : 0;

  const expenseBreakdown = db
    .prepare(
      `
        SELECT category_name, COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE direction = 'expense'
          AND datetime(replace(transaction_date, 'T', ' ')) >= datetime(?)
          AND datetime(replace(transaction_date, 'T', ' ')) <= datetime(?)
        GROUP BY category_name
        ORDER BY total DESC
      `,
    )
    .all(fromDb, toDb);

  const incomeBreakdown = db
    .prepare(
      `
        SELECT category_name, COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE direction = 'income'
          AND datetime(replace(transaction_date, 'T', ' ')) >= datetime(?)
          AND datetime(replace(transaction_date, 'T', ' ')) <= datetime(?)
        GROUP BY category_name
        ORDER BY total DESC
      `,
    )
    .all(fromDb, toDb);

  const payrollStatus = db
    .prepare(
      `
        SELECT status, COUNT(*) AS total, COALESCE(SUM(remaining_amount), 0) AS remaining_total
        FROM payroll_cycles
        WHERE datetime(replace(due_date, 'T', ' ')) >= datetime(?)
          AND datetime(replace(due_date, 'T', ' ')) <= datetime(?)
        GROUP BY status
      `,
    )
    .all(fromDb, toDb)
    .map((row) => ({
      ...row,
      status_label: getPayrollStatusLabelUz(row.status),
      remaining_total: roundMoney(row.remaining_total),
    }));

  const dailyCashflow = db
    .prepare(
      `
        SELECT substr(replace(transaction_date, 'T', ' '), 1, 10) AS day_key,
               direction,
               COALESCE(SUM(amount), 0) AS total
        FROM financial_transactions
        WHERE datetime(replace(transaction_date, 'T', ' ')) >= datetime(?)
          AND datetime(replace(transaction_date, 'T', ' ')) <= datetime(?)
        GROUP BY day_key, direction
        ORDER BY day_key ASC
      `,
    )
    .all(fromDb, toDb);

  return {
    summary: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      payroll_expense: payrollExpense,
      net_profit: netProfit,
      expense_ratio: expenseRatio,
      payroll_ratio: payrollRatio,
      order_revenue: orderRevenue,
    },
    expense_breakdown: expenseBreakdown,
    income_breakdown: incomeBreakdown,
    payroll_status: payrollStatus,
    daily_cashflow: dailyCashflow,
  };
}

export function buildTransactionsCsvExport(db, filters = {}) {
  const { items } = listFinancialTransactions(db, filters);
  const rows = [
    ['Sana', 'Yo‘nalish', 'Kategoriya', 'Manba', 'Sarlavha', 'Xodim', 'Summa', 'Holat', 'Izoh'],
    ...items.map((item) => [
      item.transaction_date,
      item.direction === 'income' ? 'Tushum' : 'Xarajat',
      item.category_name || '',
      item.source || '',
      item.title || '',
      item.employee_name || '',
      item.amount,
      item.status || '',
      item.note || '',
    ]),
  ];
  return buildCsv(rows);
}

export function listAccountingActivities(db, limit = 80) {
  return db
    .prepare(
      `
        SELECT al.*, u.full_name AS actor_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        ORDER BY datetime(replace(al.created_at, 'T', ' ')) DESC, al.id DESC
        LIMIT ?
      `,
    )
    .all(Number(limit) || 80)
    .map((row) => ({
      ...row,
      payload: safeJsonParse(row.payload_json, null),
    }));
}
