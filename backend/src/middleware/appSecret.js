import { security } from '../config/security.js';

/**
 * X-App-Secret-Key tekshiruvi (AI operator endpointlari uchun).
 *
 * Devda env o'rnatilmagan bo'lsa — tekshiruv o'tkazib yuboriladi (xavfsizlik pasayadi, lekin UI ishlashi uchun).
 */
export function appSecretRequired(req, res, next) {
  const expected = String(process.env.MYSHOP_APP_SECRET_KEY || '').trim();
  if (!expected) {
    // Dev/test holat: faqat logger.
    return next();
  }
  const got = String(req.headers['x-app-secret-key'] || '').trim();
  if (!got || got !== expected) return res.status(403).json({ error: 'Ruxsat berilmagan.' });
  return next();
}

export function strictAppSecretRequired(req, res, next) {
  const expected = String(process.env.MYSHOP_APP_SECRET_KEY || '').trim();
  const got = String(req.headers['x-app-secret-key'] || '').trim();
  if (!expected || !got || got !== expected) return res.status(403).json({ error: 'Ruxsat berilmagan.' });
  return next();
}

