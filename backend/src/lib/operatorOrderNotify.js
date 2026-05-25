import { db } from '../db/database.js';

/** Qadoqlanganda operatorga qo‘ng‘iroqcha bildirishnomasi */
export function notifyOperatorOrderPackaged({ orderId, packerStaffId, packerName }) {
  const lead = db
    .prepare('SELECT id, operator_id FROM product_leads WHERE order_id = ? AND operator_id IS NOT NULL')
    .get(orderId);
  if (!lead?.operator_id) return;

  let name = packerName;
  let pid = packerStaffId;
  if (!name && pid) {
    const row = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ?').get(pid);
    if (row) {
      name = row.full_name;
      pid = row.id;
    }
  }
  if (!pid) {
    const order = db.prepare('SELECT packer_id FROM orders WHERE id = ?').get(orderId);
    if (order?.packer_id) {
      pid = order.packer_id;
      const row = db.prepare('SELECT full_name FROM staff_members WHERE id = ?').get(pid);
      name = row?.full_name || name;
    }
  }

  const packerLabel = name ? `${name}${pid ? ` (#${pid})` : ''}` : pid ? `#${pid}` : '—';

  const title = 'Zakaz qadoqlandi';
  const body = `Lead #${lead.id} · Zakaz #${orderId} · Qadoqlovchi: ${packerLabel}`;

  try {
    db.prepare(`
      INSERT INTO user_notifications (user_id, title, body, link_type, link_id)
      VALUES (?, ?, ?, 'operator_order_packaged', ?)
    `).run(lead.operator_id, title, body, orderId);
  } catch (e) {
    console.warn('[operatorOrderNotify] packaged', e?.message || e);
  }
}
