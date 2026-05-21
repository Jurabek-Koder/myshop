export function formatCurrencyUz(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${new Intl.NumberFormat('uz-UZ').format(Math.round(amount * 100) / 100)} so‘m`;
}

export function formatCompactUz(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('uz-UZ', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatDateUz(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTimeUz(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('uz-UZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPayrollStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'To‘landi';
  if (normalized === 'overdue') return 'Kechikkan';
  return 'Kutilmoqda';
}

export function getPayrollStatusTone(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') {
    return 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200';
  }
  if (normalized === 'overdue') {
    return 'bg-rose-500/15 text-rose-200 ring-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200';
  }
  return 'bg-amber-500/15 text-amber-200 ring-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200';
}

export async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function fetchAccountingJson(request, path, options) {
  const response = await request(path, options);
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error || 'So‘rov bajarilmadi.');
  }
  return data;
}

export function exportRowsToCsv(filename, headers, rows) {
  const escape = (value) => {
    const raw = value == null ? '' : String(value);
    if (!/[",\n]/.test(raw)) return raw;
    return `"${raw.replace(/"/g, '""')}"`;
  };
  const csv = [headers.map((item) => escape(item.label)).join(',')]
    .concat(
      rows.map((row) =>
        headers
          .map((item) => {
            const value = typeof item.value === 'function' ? item.value(row) : row?.[item.value];
            return escape(value);
          })
          .join(','),
      ),
    )
    .join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadReceiptPdf(request, receiptId, fallbackName = 'kvitansiya.pdf') {
  const response = await request(`/accounting/portal/receipts/${receiptId}/pdf`);
  if (!response.ok) {
    const data = await readJsonResponse(response);
    throw new Error(data?.error || 'PDF yuklab olinmadi.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
