import { db } from '../db/database.js';

/** Parol/token kabi qiymatlarni jurnal tanasiga kiritmaymiz */
const SECRET_FIELD_RE =
  /password|passwd|pass|pwd|secret|token|jwt|authorization|credential|otp|sms_code|smsCode|credit_card|card_number|refresh_token/i;

export function scrubBodyForAudit(raw) {
  if (raw == null || typeof raw !== 'object' || Buffer.isBuffer(raw)) return {};

  /** GET emas-body yoki boshqa noyob tuzilma */
  if (Array.isArray(raw)) {
    try {
      return JSON.parse(JSON.stringify(raw).slice(0, 900));
    } catch {
      return {};
    }
  }

  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SECRET_FIELD_RE.test(String(k))) continue;
    if (v !== null && typeof v === 'object') {
      out[k] = '[object]';
    } else if (typeof v === 'string' && v.length > 400) {
      out[k] = `${v.slice(0, 400)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function truncatePayloadJson(objOrStr) {
  try {
    const s = typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr ?? {});
    return String(s).slice(0, 2600);
  } catch {
    return '';
  }
}

/**
 * Loyiha jurnaliga yozuv (HTTP yoki qoʻlda).
 */
export function insertProjectAuditEntry({
  source = 'http',
  actorUserId = null,
  actorLabel = '',
  actorRole = '',
  method = '',
  path = '',
  statusCode = null,
  summaryOriginal = '',
  payloadOriginal = '',
}) {
  const ins = db.prepare(
    `INSERT INTO project_audit_log (
      source, actor_user_id, actor_label, actor_role, method, path, status_code,
      summary_original, payload_original
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  ins.run(
    source,
    actorUserId,
    actorLabel,
    actorRole,
    method,
    path,
    statusCode == null ? null : Number(statusCode),
    summaryOriginal.slice(0, 1200),
    truncatePayloadJson(payloadOriginal),
  );
}

/**
 * Bearer bilan muvaffaqiyatli yozuv tugagan HTTP so‘rovlardan keyin (middleware `finish`).
 */
export function tryInsertHttpMutationAudit(req, fullPath, method, statusCode) {
  if (!req?.user?.id) return;

  let bodySnippet = '';
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    bodySnippet = truncatePayloadJson(scrubBodyForAudit(req.body));
  }

  const u = req.user;
  const label = String(u.full_name || u.login || u.email || `#${u.id}`).slice(0, 200);
  const role = String(u.role || (u.role_id === 1 ? 'superuser' : '')).slice(0, 80);
  const summary = `${method} ${fullPath}${statusCode != null ? ` → ${statusCode}` : ''}`.slice(0, 1200);

  insertProjectAuditEntry({
    source: 'http',
    actorUserId: u.id,
    actorLabel: label,
    actorRole: role,
    method: String(method || '').slice(0, 16),
    path: String(fullPath || '').slice(0, 1200),
    statusCode,
    summaryOriginal: summary,
    payloadOriginal: bodySnippet ? { bodySnippet } : '',
  });
}
