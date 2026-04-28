/**
 * Bitta domen (backend SPA bilan): VITE_API_BASE_URL bo‘sh → `/api`.
 * Alohida static frontend (Render): build vaqtida VITE_API_BASE_URL=https://api-xxxx.onrender.com
 */
const rawBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const API_PREFIX = rawBase ? `${rawBase}/api` : '/api';

export function parseApiJsonText(text) {
  const t = text == null ? '' : String(text).trim();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
