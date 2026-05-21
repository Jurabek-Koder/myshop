export const UZ_CURRENCY = new Intl.NumberFormat('uz-UZ');

export function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0 so‘m';
  return `${UZ_CURRENCY.format(Math.round(amount))} so‘m`;
}

export function formatCompactMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return UZ_CURRENCY.format(Math.round(amount));
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusClass(status) {
  const key = String(status || '')
    .trim()
    .toLowerCase();
  if (key === 'paid') return 'status-paid';
  if (key === 'overdue') return 'status-overdue';
  return 'status-pending';
}

export const incomeSources = [
  { code: 'product_sale', label: 'Mahsulot savdosi' },
  { code: 'manual_income', label: 'Qo‘lda tushum' },
  { code: 'service_income', label: 'Xizmat tushumi' },
];

export const expenseSources = [
  { code: 'shop_expense', label: 'Do‘kon xarajatlari' },
  { code: 'employee_payroll', label: 'Xodim oyligi' },
  { code: 'utilities', label: 'Kommunal to‘lovlar' },
  { code: 'transport', label: 'Transport xarajatlari' },
  { code: 'other_expense', label: 'Boshqa xarajatlar' },
];

