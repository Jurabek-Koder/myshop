/**
 * XAVFSIZLIK: foydalanuvchi kiritgan rasm/video manzili faqat http(s) yoki
 * saytning o'z nisbiy yo'li (masalan /api/uploads/...) bo'lishi mumkin.
 * `javascript:`, `data:`, `vbscript:`, `file:` kabi sxemalar rad etiladi —
 * bular saqlangan XSS yoki boshqa hujum vositasi sifatida ishlatilishi mumkin
 * (masalan keyinchalik <a href> yoki window.open orqali ochilganda).
 */
export function sanitizeMediaUrl(raw, maxLen = 2000) {
  const s = String(raw || '').trim().slice(0, maxLen);
  if (!s) return null;
  if (s.startsWith('/')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:') return s;
    return null;
  } catch {
    return null;
  }
}
