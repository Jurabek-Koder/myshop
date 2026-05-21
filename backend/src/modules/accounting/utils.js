export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function clampPercent(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function toSqlDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toSqlDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function parseDateInput(value, fallback = null) {
  if (!value) return fallback;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value;
  const normalized = String(value).trim();
  if (!normalized) return fallback;
  const date = normalized.length <= 10 ? new Date(`${normalized}T00:00:00`) : new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function addMonths(date, count) {
  const d = new Date(date.getTime());
  d.setDate(1);
  d.setMonth(d.getMonth() + count);
  return d;
}

export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function monthKeyFromDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildCycleDescriptor(employee, monthDate, cycleType) {
  const advancePercent = clampPercent(employee?.advance_percent, 50);
  const monthlySalary = roundMoney(employee?.monthly_salary || 0);
  const advanceAmount = roundMoney((monthlySalary * advancePercent) / 100);
  const salaryAmount = roundMoney(monthlySalary - advanceAmount);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const middleDay = new Date(year, month, 15);
  const lastDay = endOfMonth(monthDate);
  const isAdvance = cycleType === 'advance';
  const start = isAdvance ? firstDay : new Date(year, month, 16);
  const end = isAdvance ? middleDay : lastDay;
  const due = isAdvance ? middleDay : lastDay;
  const grossAmount = isAdvance ? advanceAmount : salaryAmount;
  return {
    cycleKey: `${monthKeyFromDate(monthDate)}-${cycleType}`,
    cycleYear: year,
    cycleMonth: month + 1,
    cycleType,
    cycleStartDate: toSqlDate(start),
    cycleEndDate: toSqlDate(end),
    dueDate: toSqlDate(due),
    grossAmount,
  };
}

export function computeCycleStatus({ dueDate, grossAmount, amountPaid }) {
  const paid = roundMoney(amountPaid);
  const gross = roundMoney(grossAmount);
  const remaining = roundMoney(Math.max(gross - paid, 0));
  if (remaining <= 0) return { remainingAmount: 0, status: 'paid' };
  const due = parseDateInput(dueDate, new Date());
  const today = parseDateInput(toSqlDate(new Date()), new Date());
  if (due < today) return { remainingAmount: remaining, status: 'overdue' };
  return { remainingAmount: remaining, status: 'pending' };
}

export function formatMoneyUz(value) {
  return `${new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)} so'm`;
}

export function labelFromCycleType(cycleType) {
  return cycleType === 'advance' ? 'Avans' : 'Oylik ish haqi';
}

export function statusLabelUz(status) {
  if (status === 'paid') return 'To‘landi';
  if (status === 'overdue') return 'Kechikkan';
  return 'Kutilmoqda';
}

export function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return fallback;
  }
}

export function receiptNumberFromId(id, issuedAt = new Date()) {
  const d = parseDateInput(issuedAt, new Date());
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `RCP-${year}${month}-${String(id).padStart(5, '0')}`;
}

export function buildDateRange({ from, to, days = 30 } = {}) {
  const end = parseDateInput(to, new Date()) || new Date();
  const start = parseDateInput(from, null);
  if (start) {
    return {
      fromDate: toSqlDate(start),
      toDate: toSqlDate(end),
    };
  }
  const fallbackStart = new Date(end.getTime());
  fallbackStart.setDate(fallbackStart.getDate() - Math.max(1, Number(days) || 30));
  return {
    fromDate: toSqlDate(fallbackStart),
    toDate: toSqlDate(end),
  };
}
