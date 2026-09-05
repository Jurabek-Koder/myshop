import { insertProjectAuditEntry } from '../lib/projectAuditLog.js';

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

export function insertAuditLog({ req, action, entity, entityId, oldValue = null, newValue = null } = {}) {
  const user = req?.user || {};
  const actorLabel = String(user.full_name || user.login || user.email || (user.id ? `#${user.id}` : '')).slice(0, 200);
  const actorRole = String(user.role || '').slice(0, 80);
  const path = String(req?.originalUrl || req?.url || '').slice(0, 1200);
  const summary = [action, entity, entityId != null ? `#${entityId}` : ''].filter(Boolean).join(' ');

  try {
    insertProjectAuditEntry({
      source: 'service',
      actorUserId: user.id || null,
      actorLabel,
      actorRole,
      method: String(req?.method || '').slice(0, 16),
      path,
      statusCode: null,
      summaryOriginal: summary,
      payloadOriginal: safeJson({ action, entity, entityId, oldValue, newValue }),
    });
  } catch (e) {
    console.warn('[auditLogService]', e?.message || e);
  }
}
