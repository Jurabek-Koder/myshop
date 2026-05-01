/**
 * Bearer token asosidagi foydalanuvchining POST/PUT/PATCH/DELETE muvaffaqiyatli javoblarida
 * loyiha jurnaliga yozuv qo‘shadi (faqat 2xx va req.user mavjudida).
 */

import { tryInsertHttpMutationAudit } from '../lib/projectAuditLog.js';

/** Juda ko‘p yoki tashqi xizmat yozuvlari */
const SKIP_AUDIT_PREFIXES = [
  '/api/health',
  '/api/admin/audit-log',
  '/api/operator/ai-call/webhook',
  '/api/staff-chat',
  '/api/uploads/',
];

export function mutationAuditMiddleware(req, res, next) {
  const m = String(req.method || '').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();

  const raw = req.originalUrl || req.url || '';
  const fullPath = String(raw.split('?')[0] || '');

  for (const p of SKIP_AUDIT_PREFIXES) {
    if (fullPath.startsWith(p)) return next();
  }

  res.on('finish', () => {
    try {
      const code = res.statusCode;
      if (code < 200 || code >= 400) return;
      tryInsertHttpMutationAudit(req, fullPath, m, code);
    } catch (e) {
      console.warn('[mutationAudit]', e);
    }
  });
  next();
}
