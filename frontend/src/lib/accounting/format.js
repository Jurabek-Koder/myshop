export function formatMoney(value) {
  return `${new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(Number(value) || 0)} so'm`;
}

export function formatCompactMoney(value) {
  return new Intl.NumberFormat('uz-UZ', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

export function formatDate(value, options = {}) {
  if (!value) return options.empty || '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return options.empty || '-';
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: options.withYear === false ? undefined : 'numeric',
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function cycleLabel(value) {
  return value === 'advance' ? 'Avans' : 'Oylik ish haqi';
}

export function paymentMethodLabel(value) {
  if (value === 'card') return 'Karta';
  if (value === 'bank_transfer') return 'Bank o‘tkazmasi';
  return 'Naqd';
}

export function statusTone(status) {
  if (status === 'paid') return 'success';
  if (status === 'overdue') return 'danger';
  return 'warning';
}

export function statusLabel(status) {
  if (status === 'paid') return 'To‘landi';
  if (status === 'overdue') return 'Kechikkan';
  return 'Kutilmoqda';
}

export function monthKeyLabel(value) {
  if (!value) return '-';
  const [year, month] = String(value).split('-');
  const date = new Date(Number(year), Math.max(0, Number(month) - 1), 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('uz-UZ', { month: 'long', year: 'numeric' }).format(date);
}

export async function downloadBlobFromResponse(response, fallbackName) {
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const header = response.headers.get('content-disposition') || '';
  const headerName = header.match(/filename="?([^"]+)"?/i)?.[1];
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = headerName || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
