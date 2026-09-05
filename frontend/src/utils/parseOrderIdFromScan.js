/** Skaner / chek matnidan zakaz ID: `o-42`, `#42`, `42` */
export function parseOrderIdFromScan(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/o-(\d+)/i) || s.match(/^#?(\d+)$/);
  return m ? parseInt(m[1], 10) : NaN;
}
