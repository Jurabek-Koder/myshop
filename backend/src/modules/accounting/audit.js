import { db } from '../../db/database.js';
import { safeJsonStringify } from './utils.js';

export function insertAccountingAudit({
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  message = '',
  payload = {},
}) {
  if (!action || !entityType) return;
  db.prepare(
    `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, message, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(actorUserId, action, entityType, entityId, message, safeJsonStringify(payload));
}
