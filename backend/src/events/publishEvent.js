import { db } from '../db/database.js';
import { eventBus, EVENT_BUS_ALL } from './eventBus.js';

function toJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

function requestIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req?.ip || '').trim() || null;
}

export function actorFromRequest(req) {
  return {
    userId: req?.user?.id ?? null,
    ipAddress: requestIp(req),
  };
}

export function publishEnterpriseEvent({
  eventType,
  module,
  entityType,
  entityId = null,
  userId = null,
  ipAddress = null,
  oldValue = null,
  newValue = null,
  metadata = null,
} = {}) {
  const type = String(eventType || '').trim();
  if (!type) return null;

  const event = {
    event_type: type,
    module: String(module || 'system').trim() || 'system',
    entity_type: String(entityType || '').trim() || null,
    entity_id: entityId == null ? null : String(entityId),
    user_id: userId == null ? null : Number(userId),
    ip_address: ipAddress == null ? null : String(ipAddress).slice(0, 120),
    old_value: oldValue,
    new_value: newValue,
    metadata,
    created_at: new Date().toISOString(),
  };

  try {
    const result = db
      .prepare(
        `INSERT INTO event_logs (
          event_type, module, entity_type, entity_id, user_id, ip_address,
          old_value, new_value, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.event_type,
        event.module,
        event.entity_type,
        event.entity_id,
        event.user_id,
        event.ip_address,
        toJson(event.old_value),
        toJson(event.new_value),
        toJson(event.metadata),
      );
    event.id = result.lastInsertRowid;
  } catch (e) {
    console.warn('[MyShop EventBus] event log yozilmadi:', e?.message || e);
  }

  try {
    eventBus.emit(type, event);
    eventBus.emit(EVENT_BUS_ALL, event);
  } catch (e) {
    console.warn('[MyShop EventBus] event subscriber xatosi:', e?.message || e);
  }

  return event;
}
