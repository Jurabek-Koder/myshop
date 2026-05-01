/**
 * VITE_API_BASE_URL = backend HTTP ildizi (https://my-api.onrender.com).
 * Oxiridagi / yoki /api ni qirqadi — AuthContext keyin .../api qo'shadi.
 */
export function normalizeApiBase(raw) {
  let u = String(raw || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (/\/api$/i.test(u)) u = u.replace(/\/api$/i, '').replace(/\/+$/, '');
  return u;
}

/** Nisbiy `/api` (dev proxy) yoki to‘liq backend manzili + `/api` (Render va hokazo). */
export function getApiPrefix() {
  const base = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
  return base ? `${base}/api` : '/api';
}

/**
 * 404 yoki "Not Found" matnida r.json() SyntaxError bermasligi uchun.
 * @param {Response} res
 * @param {T} fallback
 * @returns {Promise<T>}
 * @template T
 */
export async function safeResponseJson(res, fallback) {
  if (!res.ok) return fallback;
  const text = await res.text();
  if (!text?.trim()) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
