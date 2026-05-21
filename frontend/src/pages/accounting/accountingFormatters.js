export function formatMoney(value) {
  const amount = Number(value) || 0;
  return `${new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(amount)} so'm`;
}

export function formatDate(value, fallback = '—') {
  if (!value) return fallback;
  const safe = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback;
  const safe = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortTime(value, fallback = '—') {
  if (!value) return fallback;
  const safe = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusBadgeTone(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'paid') return 'success';
  if (raw === 'overdue') return 'danger';
  return 'warning';
}

export function cyclePhaseLabel(phase) {
  const raw = String(phase || '').trim().toLowerCase();
  if (raw === 'advance') return 'Avans';
  if (raw === 'salary') return 'Oylik ish haqi';
  return phase || 'Bosqich';
}

export function paymentMethodLabel(method) {
  const raw = String(method || '').trim().toLowerCase();
  if (raw === 'cash') return 'Naqd';
  if (raw === 'card') return 'Karta';
  if (raw === 'transfer') return "O'tkazma";
  return 'Bank';
}

export function initials(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'MS';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
