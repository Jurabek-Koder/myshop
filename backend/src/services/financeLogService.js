/**
 * Markaziy moliya audit yozuvi — `finance_logs` jadvali (ZIP / SQLite backup bilan birga).
 * Barcha yozuvlar `better-sqlite3` tranzaksiyasi ichida chaqirilishi tavsiya etiladi.
 */
export function insertFinanceLog(tx, { actorUserId, action, entityType, entityId = null, payload = {} }) {
  const uid = Number(actorUserId);
  if (!Number.isFinite(uid) || uid < 1) throw new Error('FINANCE_LOG_ACTOR');
  const act = String(action || '').trim();
  const et = String(entityType || '').trim();
  if (!act || !et) throw new Error('FINANCE_LOG_FIELDS');
  tx.prepare(
    `INSERT INTO finance_logs (actor_user_id, action, entity_type, entity_id, payload_json)
     VALUES (?,?,?,?,?)`,
  ).run(uid, act, et, entityId != null ? Number(entityId) || null : null, JSON.stringify(payload ?? {}));
}
