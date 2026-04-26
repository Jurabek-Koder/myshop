/**
 * delivery-router.logic.ts ga mos Express modul.
 * Manzil qatoridan shahar/tuman va yetkazish rejimini aniqlash (qoida asosida).
 */

/** @param {string} address */
export function extractCityAndDistrict(address) {
  const raw = String(address || '').trim();
  if (!raw) return { city: null, district: null, regionHint: null };

  const parts = raw.split(/[,•·|]/).map((s) => s.trim()).filter(Boolean);
  const head = parts[0] || raw;
  const regionMatch = head.match(
    /(.*?)\s+(viloyati|viloyat)/i,
  );
  const regionHint = regionMatch ? regionMatch[1].trim() : null;

  let city = null;
  let district = null;
  for (const p of parts) {
    if (/shahri$/i.test(p) || /shahar$/i.test(p)) {
      city = p.replace(/\s+(shahri|shahar)$/i, '').trim();
    }
    if (/tuman$/i.test(p) || /tumani$/i.test(p)) {
      district = p.replace(/\s+(tuman|tumani)$/i, '').trim();
    }
  }
  if (!city && head && !regionMatch) city = head.slice(0, 80);

  return { city, district, regionHint };
}

/**
 * @param {{ city: string|null, district: string|null }} loc
 * @returns {{ mode: 'courier_door' | 'pickup_center', summary: string }}
 */
export function resolveDeliveryRoute(loc) {
  const hasDistrict = Boolean(loc?.district);
  if (hasDistrict) {
    return {
      mode: 'pickup_center',
      summary: `Shahar/tuman markazi / punkt: ${loc.district || '—'}`,
    };
  }
  return {
    mode: 'courier_door',
    summary: 'Kuryer orqali eshikgacha yetkazish',
  };
}
