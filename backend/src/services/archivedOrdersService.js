import { db } from '../db/database.js';
import { getActiveStaffRoleDisplay, sqlStaffHasActiveWorkRole } from '../lib/workRoleArchive.js';

const MANAGE_STATUSES = new Set(['archived', 'pending', 'cancelled', 'picked', 'packaged']);

function getActiveLinkedPackerStaffId(packerIdNum) {
  if (!Number.isInteger(packerIdNum) || packerIdNum < 1) return null;
  const row = db
    .prepare(
      `SELECT id FROM staff_members
       WHERE id = ? AND staff_type = 'packer'
         AND lower(trim(status)) = 'active'
         AND user_id IS NOT NULL
         AND ${sqlStaffHasActiveWorkRole()}`,
    )
    .get(packerIdNum);
  return row ? row.id : null;
}

function loadOrderItems(orderId) {
  return db
    .prepare(
      `SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
    )
    .all(orderId);
}

function enrichOrderRow(row) {
  const items = loadOrderItems(row.id);
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    total_amount: row.total_amount,
    currency: row.currency,
    shipping_address: row.shipping_address,
    contact_phone: row.contact_phone,
    created_at: row.created_at,
    status_updated_at: row.status_updated_at,
    packer_id: row.packer_id,
    courier_id: row.courier_id,
    customer_name: row.customer_name || null,
    customer_email: row.customer_email || null,
    lead_id: row.lead_id || null,
    operator_id: row.operator_id || null,
    operator_name: row.operator_name || null,
    packer: row.packer_id ? getActiveStaffRoleDisplay(row.packer_id) : null,
    courier: row.courier_id ? getActiveStaffRoleDisplay(row.courier_id) : null,
    lead: row.lead_id ? { id: row.lead_id } : null,
    items,
    product_names: items.map((i) => `${i.name_uz || 'Mahsulot'} × ${i.quantity}`).join(', '),
    items_count: items.length,
  };
}

export function listArchivedOrders({ operatorUserId = null, search = '' } = {}) {
  let sql = `
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
           o.created_at, o.status_updated_at, o.packer_id, o.courier_id,
           u.full_name AS customer_name, u.email AS customer_email,
           pl.id AS lead_id, pl.operator_id,
           op.full_name AS operator_name,
           packer.full_name AS packer_name,
           courier.full_name AS courier_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN product_leads pl ON pl.order_id = o.id
    LEFT JOIN users op ON op.id = pl.operator_id
    LEFT JOIN staff_members packer ON packer.id = o.packer_id
    LEFT JOIN staff_members courier ON courier.id = o.courier_id
    WHERE lower(trim(coalesce(o.status, ''))) = 'archived'
  `;
  const params = [];

  if (operatorUserId) {
    sql += ' AND pl.operator_id = ?';
    params.push(operatorUserId);
  }

  const q = String(search || '').trim();
  if (q) {
    sql += ` AND (
      CAST(o.id AS TEXT) LIKE ?
      OR IFNULL(u.full_name, '') LIKE ?
      OR IFNULL(u.email, '') LIKE ?
      OR IFNULL(o.contact_phone, '') LIKE ?
      OR IFNULL(o.shipping_address, '') LIKE ?
    )`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  sql += ` ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC LIMIT 200`;

  const rows = db.prepare(sql).all(...params);
  const seen = new Set();
  const orders = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    orders.push(enrichOrderRow(row));
  }
  return orders;
}

export function listActivePackers() {
  return db
    .prepare(
      `SELECT id, full_name, phone
       FROM staff_members
       WHERE staff_type = 'packer'
         AND lower(trim(status)) = 'active'
         AND user_id IS NOT NULL
         AND ${sqlStaffHasActiveWorkRole()}
       ORDER BY full_name COLLATE NOCASE ASC, id ASC`,
    )
    .all();
}

export function updateArchivedOrderStatus(orderId, status) {
  const id = Number.parseInt(orderId, 10);
  const next = String(status || '').trim();
  if (Number.isNaN(id) || id < 1) {
    const err = new Error('Noto\'g\'ri order ID.');
    err.status = 400;
    throw err;
  }
  if (!MANAGE_STATUSES.has(next)) {
    const err = new Error('Noto\'g\'ri status.');
    err.status = 400;
    throw err;
  }

  const existing = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(id);
  if (!existing) {
    const err = new Error('Order topilmadi.');
    err.status = 404;
    throw err;
  }

  db.prepare(`UPDATE orders SET status = ?, status_updated_at = datetime('now') WHERE id = ?`).run(next, id);

  const row = db
    .prepare(
      `SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
              o.created_at, o.status_updated_at, o.packer_id, o.courier_id,
              u.full_name AS customer_name, u.email AS customer_email,
              pl.id AS lead_id, pl.operator_id,
              op.full_name AS operator_name,
              packer.full_name AS packer_name,
              courier.full_name AS courier_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN product_leads pl ON pl.order_id = o.id
       LEFT JOIN users op ON op.id = pl.operator_id
       LEFT JOIN staff_members packer ON packer.id = o.packer_id
       LEFT JOIN staff_members courier ON courier.id = o.courier_id
       WHERE o.id = ?`,
    )
    .get(id);

  return enrichOrderRow(row);
}

export function assignArchivedOrderToPacker(orderId, packerIdRaw) {
  const id = Number.parseInt(orderId, 10);
  const packerIdNum = Number.parseInt(packerIdRaw, 10);
  if (Number.isNaN(id) || id < 1) {
    const err = new Error('Noto\'g\'ri order ID.');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(packerIdNum) || packerIdNum < 1) {
    const err = new Error('To\'g\'ri packer tanlang.');
    err.status = 400;
    throw err;
  }

  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(id);
  if (!existing) {
    const err = new Error('Order topilmadi.');
    err.status = 404;
    throw err;
  }

  const linked = getActiveLinkedPackerStaffId(packerIdNum);
  if (!linked) {
    const err = new Error('Packer topilmadi yoki faol emas.');
    err.status = 400;
    throw err;
  }

  db.prepare(
    `UPDATE orders SET status = 'picked', packer_id = ?, status_updated_at = datetime('now') WHERE id = ?`,
  ).run(linked, id);

  const row = db
    .prepare(
      `SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
              o.created_at, o.status_updated_at, o.packer_id, o.courier_id,
              u.full_name AS customer_name, u.email AS customer_email,
              pl.id AS lead_id, pl.operator_id,
              op.full_name AS operator_name,
              packer.full_name AS packer_name,
              courier.full_name AS courier_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN product_leads pl ON pl.order_id = o.id
       LEFT JOIN users op ON op.id = pl.operator_id
       LEFT JOIN staff_members packer ON packer.id = o.packer_id
       LEFT JOIN staff_members courier ON courier.id = o.courier_id
       WHERE o.id = ?`,
    )
    .get(id);

  return enrichOrderRow(row);
}

export function archiveOrderById(orderId) {
  return updateArchivedOrderStatus(orderId, 'archived');
}
