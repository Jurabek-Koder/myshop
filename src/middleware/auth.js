import jwt from 'jsonwebtoken';
import { security } from '../config/security.js';
import { db } from '../db/database.js';

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Kirish talab qilinadi.' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, security.jwt.accessSecret, {
      issuer: security.jwt.issuer,
      audience: security.jwt.audience,
    });
    const user = db.prepare('SELECT id, email, login, full_name, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan.' });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, security.jwt.accessSecret, {
      issuer: security.jwt.issuer,
      audience: security.jwt.audience,
    });
    const user = db.prepare('SELECT id, email, login, full_name, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?').get(payload.sub);
    if (user) req.user = user;
  } catch (_) {}
  next();
}

export function requireRole(...roles) {
  const allowed = roles.map((r) => String(r || '').toLowerCase());
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Kirish talab qilinadi.' });
    const current = String(req.user.role || '').toLowerCase();
    if (!allowed.includes(current)) return res.status(403).json({ error: 'Ruxsat yo\'q.' });
    next();
  };
}

const STAFF_CHAT_MEDIA_ROLES = new Set(['picker', 'courier', 'packer', 'operator', 'admin', 'superuser']);

/** Chat media yuklash / ko‘rish — sotuvchi / mehmon emas */
export function requireStaffChatMediaRole(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Kirish talab qilinadi.' });
  const r = String(req.user.role || '').toLowerCase();
  if (STAFF_CHAT_MEDIA_ROLES.has(r)) return next();
  return res.status(403).json({ error: 'Ruxsat yo\'q.' });
}

/**
 * <img>/<video> Bearer yubormaydi — GET uchun ?access_token= yoki Authorization
 */
export function authRequiredBearerOrQuery(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  if (!token && req.query.access_token != null) token = String(req.query.access_token).trim();
  if (!token) return res.status(401).end();

  try {
    const payload = jwt.verify(token, security.jwt.accessSecret, {
      issuer: security.jwt.issuer,
      audience: security.jwt.audience,
    });
    const user = db
      .prepare('SELECT id, email, login, full_name, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?')
      .get(payload.sub);
    if (!user) return res.status(401).end();
    req.user = user;
    next();
  } catch {
    return res.status(401).end();
  }
}
