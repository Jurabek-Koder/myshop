import { db } from '../../db/database.js';
import { eventBus } from '../eventBus.js';
import { EVENT_TYPES } from '../eventTypes.js';

let registered = false;

const TIMELINE_TITLES = {
  [EVENT_TYPES.LEAD_CREATED]: 'Lead yaratildi',
  [EVENT_TYPES.LEAD_CONVERTED]: 'Lead zakazga aylantirildi',
  [EVENT_TYPES.ORDER_CREATED]: 'Buyurtma yaratildi',
  [EVENT_TYPES.ORDER_CONFIRMED]: 'Buyurtma tasdiqlandi',
  [EVENT_TYPES.ORDER_PICKED]: 'Buyurtma yigildi',
  [EVENT_TYPES.ORDER_PACKED]: 'Buyurtma qadoqlandi',
  [EVENT_TYPES.COURIER_ASSIGNED]: 'Kuryer biriktirildi',
  [EVENT_TYPES.ORDER_SHIPPED]: 'Buyurtma yetkazish jarayonida',
  [EVENT_TYPES.ORDER_DELIVERED]: 'Buyurtma yetkazildi',
  [EVENT_TYPES.ORDER_RETURNED]: 'Buyurtma qaytdi',
  [EVENT_TYPES.ORDER_CANCELLED]: 'Buyurtma bekor qilindi',
};

function json(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function resolveOrderId(event) {
  const direct = Number(event?.entity_type === 'order' ? event.entity_id : null);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const fromNew = Number(event?.new_value?.order_id);
  return Number.isInteger(fromNew) && fromNew > 0 ? fromNew : null;
}

function resolveLeadId(event) {
  const direct = Number(event?.entity_type === 'lead' ? event.entity_id : null);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const fromNew = Number(event?.new_value?.lead_id);
  return Number.isInteger(fromNew) && fromNew > 0 ? fromNew : null;
}

function resolveCustomerUserId(event, orderId) {
  const fromEvent = Number(event?.new_value?.user_id);
  if (Number.isInteger(fromEvent) && fromEvent > 0) return fromEvent;
  if (!orderId) return null;
  const row = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(orderId);
  return row?.user_id ? Number(row.user_id) : null;
}

function insertTimeline(event) {
  const orderId = resolveOrderId(event);
  const leadId = resolveLeadId(event);
  const customerUserId = resolveCustomerUserId(event, orderId);
  if (!customerUserId && !leadId && !orderId) return;

  db.prepare(
    `INSERT INTO customer_timeline (
      customer_user_id, lead_id, order_id, event_type, title, details_json, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    customerUserId,
    leadId,
    orderId,
    event.event_type,
    TIMELINE_TITLES[event.event_type] || event.event_type,
    json({ old_value: event.old_value ?? null, new_value: event.new_value ?? null, metadata: event.metadata ?? null }),
    event.user_id ?? null,
  );
}

export function registerCrmEventSubscribers() {
  if (registered) return;
  registered = true;
  for (const eventType of Object.keys(TIMELINE_TITLES)) {
    eventBus.on(eventType, (event) => {
      try {
        insertTimeline(event);
      } catch (e) {
        console.warn('[MyShop CRM Timeline] yozilmadi:', e?.message || e);
      }
    });
  }
}

export default registerCrmEventSubscribers;
