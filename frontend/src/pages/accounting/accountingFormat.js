export function formatMoney(value) {
  const amount = Number(value) || 0;
  return `${new Intl.NumberFormat('uz-UZ').format(Math.round(amount))} so‘m`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusMeta(statusKey) {
  const key = String(statusKey || '').toLowerCase();
  if (key === 'paid') return { label: 'To‘landi', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-300/30' };
  if (key === 'overdue')
    return { label: 'Kechikkan', className: 'bg-rose-500/20 text-rose-300 border-rose-300/30' };
  return { label: 'Kutilmoqda', className: 'bg-amber-500/20 text-amber-300 border-amber-300/30' };
}
