export function formatUzs(n, suffix = "so'm") {
  const x = Math.round(Number(n) || 0);
  return `${new Intl.NumberFormat('uz-UZ').format(x)} ${suffix}`.trim();
}

export function formatDateUz(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, mo, d] = s.split('-').map(Number);
  if (!y) return iso;
  return `${d}-${String(mo).padStart(2, '0')}-${y}`;
}
