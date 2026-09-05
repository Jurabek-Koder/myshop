import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
// TODO: UNUSED - These validators are defined but not used in this file.
import {
  validateIdParam,
  validateItemIdParam,
  validateUpdateStatus,
  validateUpdateItemHomeLeft,
  validateCallLog,
} from '../middleware/courierValidators.js';
// TODO: UNUSED - getSkladPeers is imported but never called in this file.
import {
  getSkladPeers,
  getDmMessages,
  postDmSend,
  getDmStories,
  getDmCallLogs,
  postDmCallLog,
  postChatPresence,
  getChatPresence,
} from '../lib/staffSkladLichka.js';
import { getWorkRoleByUserPortalRole, createPendingWithdrawalForWorkRole } from '../lib/staffWithdrawalFlow.js';
import { buildWorkRoleFinancePayload } from '../services/workRoleTransactionService.js';
import { creditSellerForDeliveredOrder } from '../lib/targetSellerFinance.js';
import { EVENT_TYPES } from '../events/eventTypes.js';
import { actorFromRequest, publishEnterpriseEvent } from '../events/publishEvent.js';
// TODO: UNUSED - These imports are not used in this file.
import { insertAuditLog } from '../services/auditLogService.js';
import { notificationService } from '../services/notificationService.js';
import { createStructuredError } from '../utils/errorHandling.js';

const router = Router();
router.use(authRequired, requireRole('courier'));

const COURIER_STATUSES = ['pending', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled', 'blocked', 'left_at_home', 'take_later'];

const ORDER_LIST_COLUMNS = `o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.courier_id, o.created_at, o.is_test, o.packer_batch_id,
  o.courier_assigned_via, o.status_updated_at, COALESCE(o.courier_unsold_return, 0) AS courier_unsold_return,
  u.full_name AS customer_full_name, u.last_name AS customer_last_name,
  (
    SELECT pl.operator_id
    FROM product_leads pl
    WHERE pl.order_id = o.id
    ORDER BY pl.id DESC
    LIMIT 1
  ) AS operator_id,
  (
    SELECT uo.full_name
    FROM product_leads pl
    LEFT JOIN users uo ON uo.id = pl.operator_id
    WHERE pl.order_id = o.id
    ORDER BY pl.id DESC
    LIMIT 1
  ) AS operator_name`;
const ORDER_ITEM_COLUMNS = `oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, COALESCE(oi.home_left_in_courier, 0) AS home_left_in_courier`;

// TODO: DUPLICATE STATE MACHINE
// TODO: This is one implementation of a state machine. Another one exists below. Keep only one.
const VALID_STATUS_TRANSITIONS = {
  assigned: new Set(['picked_up', 'on_the_way', 'delivered', 'cancelled', 'blocked', 'left_at_home']),
  picked_up: new Set(['on_the_way', 'delivered', 'cancelled', 'blocked', 'left_at_home']),
  on_the_way: new Set(['delivered', 'cancelled', 'blocked', 'left_at_home']),
  blocked: new Set(['on_the_way', 'delivered', 'cancelled']),
  left_at_home: new Set(['delivered', 'cancelled']),
  // A packaged order can be taken by a courier
  packaged: new Set(['assigned']),
};

const EXPEDITOR_VIA_SQL = `(
  o.courier_assigned_via IS NULL OR trim(COALESCE(o.courier_assigned_via,'')) = '' OR o.courier_assigned_via = 'expeditor'
)`;

function getCourierByUser(user) {
  if (!user) return null;
  if (user.staff_member_id) {
    const byId = db.prepare('SELECT * FROM staff_members WHERE id = ? AND staff_type = ?').get(user.staff_member_id, 'courier');
    if (byId) return byId;
  }
  /** Admin / portal: users.staff_member_id ba’zan bo‘sh, lekin staff_members.user_id bog‘langan */
  return db.prepare('SELECT * FROM staff_members WHERE user_id = ? AND staff_type = ?').get(user.id, 'courier') || null;
}

// TODO: DUPLICATE HELPER FUNCTION
// TODO: This function is duplicated in many other router files. Centralize it.
function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT ${ORDER_ITEM_COLUMNS}
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(order.id);
  return order;
}

// TODO: DUPLICATE HELPER FUNCTION
// TODO: This logic is repeated in other modules. It should be a centralized service.
function getCourierFee() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('courier_fee_per_order');
  const val = Number(row?.value);
  return Number.isFinite(val) && val >= 0 ? val : 25000;
}

function getContestActive() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'contest_courier_active'").get();
  return String(row?.value || '0').trim() === '1';
}

function getPeriodStart(period) {
  const now = new Date();
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (period === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function splitUserName(fullNameRaw, lastNameRaw) {
  const fullName = String(fullNameRaw || '').trim();
  const lastName = String(lastNameRaw || '').trim();
  if (!fullName) return { firstName: '', lastName };
  if (!lastName) return { firstName: fullName, lastName: '' };
  const fLower = fullName.toLowerCase();
  const lLower = lastName.toLowerCase();
  if (fLower.endsWith(` ${lLower}`)) {
    return { firstName: fullName.slice(0, fullName.length - lastName.length).trim(), lastName };
  }
  if (fLower === lLower) return { firstName: '', lastName };
  return { firstName: fullName, lastName };
}

router.get('/contest-results', (req, res) => {
  const period = req.query.period === 'month' ? 'month' : req.query.period === 'week' ? 'week' : 'day';
  const active = getContestActive();
  const periodStart = getPeriodStart(period);

  let topByDelivered = [];

  if (active) {
    topByDelivered = db.prepare(`
      SELECT o.courier_id AS id, sm.full_name AS name, COUNT(DISTINCT o.id) AS count
      FROM orders o
      JOIN operator_earnings oe ON oe.order_id = o.id
      JOIN staff_members sm ON sm.id = o.courier_id
      WHERE o.courier_id IS NOT NULL AND o.status = 'delivered'
        AND oe.created_at >= ?
      GROUP BY o.courier_id
      ORDER BY count DESC
      LIMIT 20
    `).all(periodStart);
  }

  res.json({
    active,
    period,
    topByDelivered,
  });
});

router.get('/notifications', (req, res) => {
  const list = db.prepare(`
    SELECT id, title, body, created_at, read_at
    FROM user_notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json({ notifications: list });
});
router.patch('/notifications/:id/read', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });
  const region = courier.region_id ? db.prepare('SELECT * FROM regions WHERE id = ?').get(courier.region_id) : null;
  res.json({ courier: { ...courier, region }, courier_fee_per_order: getCourierFee() });
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.get('/profile', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));
  const u = db
    .prepare('SELECT id, full_name, last_name, phone, avatar_url, role, email, login FROM users WHERE id = ?')
    .get(req.user.id);
  if (!u) return res.status(404).json(createStructuredError('NOT_FOUND', 'User not found.'));
  const split = splitUserName(u.full_name || courier.full_name, u.last_name);
  res.json({
    profile: {
      first_name: split.firstName,
      last_name: split.lastName,
      full_name: String(u.full_name || courier.full_name || '').trim(),
      phone: String(u.phone || courier.phone || '').trim(),
      avatar_url: String(u.avatar_url || '').trim(),
      role_label: 'Kuryer',
      system_role: u.role || 'courier',
      email: String(u.email || '').trim(),
      login: String(u.login || '').trim(),
    },
  });
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.patch('/profile', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(404).json(createStructuredError('NOT_FOUND', 'User not found.'));

  const body = req.body || {};
  const currentSplit = splitUserName(current.full_name || courier.full_name, current.last_name);
  const firstName =
    body.first_name !== undefined && body.first_name !== null
      ? String(body.first_name).trim().slice(0, 120)
      : currentSplit.firstName;
  const lastName =
    body.last_name !== undefined && body.last_name !== null
      ? String(body.last_name).trim().slice(0, 120)
      : String(current.last_name || '').trim();
  const fullName =
    body.full_name !== undefined && body.full_name !== null
      ? String(body.full_name).trim()
      : `${firstName}${lastName ? ` ${lastName}` : ''}`.trim();
  const phone =
    body.phone !== undefined && body.phone !== null
      ? String(body.phone).trim().slice(0, 40)
      : String(current.phone || courier.phone || '').trim();
  const avatarUrl =
    body.avatar_url !== undefined
      ? String(body.avatar_url || '').trim().slice(0, 200000)
      : String(current.avatar_url || '').trim();

  if (!fullName) return res.status(400).json(createStructuredError('VALIDATION_ERROR', 'Full name cannot be empty.'));

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET full_name = ?, last_name = ?, phone = ?, avatar_url = ? WHERE id = ?').run(
      fullName,
      lastName || null,
      phone || null,
      avatarUrl || null,
      req.user.id
    );
    db.prepare('UPDATE staff_members SET full_name = ?, phone = ? WHERE id = ?').run(fullName, phone || null, courier.id);
  });

  try {
    tx();
  } catch {
    return res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to save profile.'));
  }

  const updated = db.prepare('SELECT id, full_name, last_name, phone, avatar_url, role FROM users WHERE id = ?').get(req.user.id);
  res.json({
    ok: true,
    profile: {
      first_name: String(updated.full_name || '').trim(),
      last_name: String(updated.last_name || '').trim(),
      full_name: String(updated.full_name || '').trim(),
      phone: String(updated.phone || '').trim(),
      avatar_url: String(updated.avatar_url || '').trim(),
      role_label: 'Kuryer',
      system_role: updated.role || 'courier',
    },
  });
});
// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.get('/moliya-stats', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));

  const sql = `
    SELECT 
      status,
      COUNT(id) as count,
      SUM(total_amount) as total_amount,
      SUM(25000) as total_courier_fee,
      SUM(COALESCE(courier_unsold_return, 0)) as total_unsold_return
    FROM orders
    WHERE courier_id = ? 
      AND (
        status IN ('assigned', 'picked_up', 'on_the_way')
        OR date(datetime(COALESCE(status_updated_at, created_at), '+5 hours')) = date(datetime('now', '+5 hours'))
      )
    GROUP BY status, courier_unsold_return
  `;
  
  try {
    const rows = db.prepare(sql).all(courier.id);
    res.json({ stats: rows || [] });
  } catch (err) {
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', err.message));
  }
});

router.get('/left-at-home-products', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));

  const sql = `
    SELECT p.id, p.name_uz, p.name_ru, p.image_url, p.photo_url, SUM(oi.quantity) as total_quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.courier_id = ? AND o.status = 'left_at_home'
    GROUP BY p.id
  `;
  try {
    const rows = db.prepare(sql).all(courier.id);
    res.json({ products: rows || [] });
  } catch (err) {
    return res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', err.message));
  }
});

// TODO: N+1 QUERY
// TODO: This endpoint fetches orders and then fetches items for each order in a loop.
router.get('/orders', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));

  const filter = req.query.filter || 'all';
  let sql = `
    SELECT ${ORDER_LIST_COLUMNS}
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE 1=1
  `;
  const params = [];

  if (filter === 'expeditor') {
    sql += ` AND o.courier_id = ? AND ${EXPEDITOR_VIA_SQL}`;
    sql +=
      " AND o.status IN ('assigned','picked_up','on_the_way','delivered','cancelled')";
    params.push(courier.id);
  } else if (filter === 'mine') {
    sql +=
      " AND o.courier_id = ? AND o.courier_assigned_via = 'courier_take' AND o.status NOT IN ('cancelled','delivered','blocked')";
    params.push(courier.id);
  } else if (filter === 'on_the_way') {
    sql += ' AND o.courier_id = ? AND o.status = ?';
    params.push(courier.id, 'on_the_way');
  } else if (filter === 'delivered') {
    sql += ' AND o.courier_id = ? AND o.status = ?';
    params.push(courier.id, 'delivered');
  } else if (filter === 'new' || filter === 'available') {
    sql += ` AND (
      (o.courier_id IS NULL AND o.status = 'packaged' AND o.packer_batch_id IS NULL)
      OR
      (o.courier_id = ? AND o.status = 'assigned' AND ${EXPEDITOR_VIA_SQL}
        AND (o.expeditor_batch_id IS NULL OR o.expeditor_batch_id = 0))
    )`;
    params.push(courier.id);
  } else if (filter === 'cancelled') {
    sql += ' AND o.courier_id = ? AND o.status = ? AND COALESCE(o.courier_unsold_return, 0) = 0';
    params.push(courier.id, 'cancelled');
  } else if (filter === 'warehouse') {
    sql += ' AND o.courier_id = ? AND o.status = ? AND COALESCE(o.courier_unsold_return, 0) = 1';
    params.push(courier.id, 'cancelled');
  } else if (filter === 'blocked' || filter === 'later') {
    sql += ' AND o.courier_id = ? AND o.status = ?';
    params.push(courier.id, 'blocked');
  } else if (filter === 'left_at_home') {
    sql += ' AND o.courier_id = ? AND o.status = ?';
    params.push(courier.id, 'left_at_home');
  } else {
    sql += ' AND (o.courier_id = ? OR (o.courier_id IS NULL AND o.status = ?))';
    params.push(courier.id, 'pending');
  }

  sql +=
    filter === 'expeditor'
      ? ' ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC LIMIT 100'
      : ' ORDER BY o.created_at DESC LIMIT 100';

  const orders = db.prepare(sql).all(...params);

  const feePerOrder = getCourierFee();
  const orderIds = orders.map(o => o.id);
  let itemsByOrderId = new Map();

  if (orderIds.length > 0) {
    const allItems = db.prepare(`
      SELECT oi.order_id, ${ORDER_ITEM_COLUMNS}
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
    `).all(orderIds);

    for (const item of allItems) {
      if (!itemsByOrderId.has(item.order_id)) itemsByOrderId.set(item.order_id, []);
      itemsByOrderId.get(item.order_id).push(item);
    }
  }

  for (const o of orders) {
    o.items = itemsByOrderId.get(o.id) || [];
    o.courier_fee = feePerOrder;
    o.is_test = Number(o.is_test) === 1 ? 1 : 0;
  }

  let packer_closed_batches = [];
  // TODO: N+1 QUERY
  // TODO: This block fetches batches and then loops through them to fetch orders, which in turn fetch items.
  if (filter === 'new' || filter === 'available') {
    const batchRows = db
      .prepare(
        `
      SELECT b.id, b.created_at, b.packer_staff_id, sm.full_name AS packer_name
      FROM packer_closed_batches b
      JOIN staff_members sm ON sm.id = b.packer_staff_id
      WHERE EXISTS (
        SELECT 1 FROM orders o
        WHERE o.packer_batch_id = b.id AND o.status = 'packaged' AND o.courier_id IS NULL
      )
      ORDER BY b.id DESC
      LIMIT 30
    `
      )
      .all();
    for (const b of batchRows) {
      const batchOrders = db
        .prepare(
          `
        SELECT ${ORDER_LIST_COLUMNS}
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.packer_batch_id = ? AND o.status = 'packaged' AND o.courier_id IS NULL
        ORDER BY o.created_at ASC
      `
        )
        .all(b.id);
      for (const o of batchOrders) {
        o.items = db
          .prepare(
            `
          SELECT ${ORDER_ITEM_COLUMNS}
          FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
        `
          )
          .all(o.id);
        o.courier_fee = feePerOrder;
        o.is_test = Number(o.is_test) === 1 ? 1 : 0;
      }
      packer_closed_batches.push({ ...b, orders: batchOrders });
    }
  }

  res.json({ orders, courier_fee_per_order: feePerOrder, packer_closed_batches });
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint has a second, more robust implementation below.
router.post('/orders/:id/take', validateIdParam, (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));

  const orderId = parseInt(req.params.id, 10);

  try {
    const takeTx = db.transaction(() => {
      const order = db.prepare('SELECT id, courier_id, status FROM orders WHERE id = ?').get(orderId);
      if (!order) throw createStructuredError('NOT_FOUND', 'Order not found.', { status: 404 });

      if (order.courier_id) {
        if (order.courier_id === courier.id) return { alreadyTaken: true, order };
        throw createStructuredError('ORDER_ALREADY_ASSIGNED', 'This order is already assigned to another courier.', { status: 409 });
      }
      if (order.status !== 'packaged') {
        throw createStructuredError('INVALID_STATUS_TRANSITION', 'Only packaged orders can be taken.', { status: 409 });
      }

      db.prepare(
        `UPDATE orders SET courier_id = ?, status = ?, courier_assigned_via = 'courier_take', status_updated_at = datetime('now') WHERE id = ?`,
      ).run(courier.id, 'assigned', orderId);
      db.prepare('UPDATE staff_members SET orders_handled = orders_handled + 1 WHERE id = ?').run(courier.id);
      return { alreadyTaken: false, order };
    });

    const { alreadyTaken, order } = takeTx();

    if (alreadyTaken) return res.json(orderWithItems(orderId));

    publishEnterpriseEvent({ eventType: EVENT_TYPES.COURIER_ASSIGNED, module: 'courier', entityType: 'order', entityId: orderId, ...actorFromRequest(req), oldValue: { status: order.status, courier_id: order.courier_id }, newValue: { status: 'assigned', courier_id: courier.id, courier_assigned_via: 'courier_take' } });
    insertAuditLog({ req, action: 'take_order', entity: 'order', entityId: orderId, newValue: { courier_id: courier.id } });

    res.json(orderWithItems(orderId));
  } catch (e) {
    if (e.status) return res.status(e.status).json(e);
    console.error('[courier/take]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to take order.'));
  }
});

function recordOperatorEarnings(orderId) {
  const lead = db.prepare('SELECT operator_id FROM product_leads WHERE order_id = ?').get(orderId);
  if (!lead?.operator_id) return;
  const items = db.prepare(`
    SELECT oi.quantity, p.operator_share_amount
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).all(orderId);
  let total = 0;
  for (const row of items) {
    total += (Number(row.operator_share_amount) || 0) * (Number(row.quantity) || 0);
  }
  if (total > 0) {
    db.prepare('INSERT INTO operator_earnings (order_id, operator_id, amount) VALUES (?, ?, ?)')
      .run(orderId, lead.operator_id, total);
  }
}

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint has a second, more robust implementation below.
router.patch('/orders/:id/status', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  const orderId = parseInt(req.params.id, 10);
  const { status, unsold, courier_unsold_return } = req.body;

  // TODO: VALIDATION SHOULD BE CENTRALIZED
  if (isNaN(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });
  // TODO: DUPLICATE STATE MACHINE
  // TODO: This is a simple array check, while a more robust Set-based state machine exists below.
  if (!status || !COURIER_STATUSES.includes(String(status))) {
    return res.status(400).json({ error: `Status quyidagilardan biri bo\'lishi kerak: ${COURIER_STATUSES.join(', ')}` });
  }

  const order = db.prepare('SELECT id, courier_id, status, total_amount FROM orders WHERE id = ?').get(orderId);
  // TODO: DUPLICATE OWNERSHIP VALIDATION
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id !== courier.id) return res.status(403).json({ error: 'Bu buyurtma sizga tegishli emas.' });

  if (String(status) === 'delivered' && order.status !== 'delivered') {
    recordOperatorEarnings(orderId);
    creditSellerForDeliveredOrder(orderId);
    
    // Kuryer balansiga pul qo'shish
    const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
    if (wr) {
      const amt = Number(order.total_amount) || 0;
      db.prepare('UPDATE work_roles SET total_amount = total_amount + ? WHERE id = ?').run(amt, wr.id);
    }
  } else if (order.status === 'delivered' && String(status) !== 'delivered') {
    const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
    if (wr) {
      const amt = Number(order.total_amount) || 0;
      db.prepare('UPDATE work_roles SET total_amount = MAX(0, total_amount - ?) WHERE id = ?').run(amt, wr.id);
    }
  }

  let unsoldFlag = 0;
  if (String(status) === 'cancelled') {
    unsoldFlag =
      unsold === true ||
      courier_unsold_return === true ||
      Number(courier_unsold_return) === 1 ||
      String(unsold || '').toLowerCase() === '1'
        ? 1
        : 0;
  }

  db.prepare(
    `UPDATE orders SET status = ?, courier_unsold_return = ?, status_updated_at = datetime('now') WHERE id = ?`,
  ).run(status, unsoldFlag, orderId);

  const updated = orderWithItems(orderId);
  // TODO: DUPLICATE STATE MACHINE
  // TODO: This object-based mapping is another form of state transition logic.
  const eventTypeByStatus = {
    assigned: EVENT_TYPES.COURIER_ASSIGNED,
    picked_up: EVENT_TYPES.ORDER_SHIPPED,
    on_the_way: EVENT_TYPES.ORDER_SHIPPED,
    delivered: EVENT_TYPES.ORDER_DELIVERED,
    cancelled: EVENT_TYPES.ORDER_CANCELLED,
    left_at_home: EVENT_TYPES.ORDER_RETURNED,
    take_later: EVENT_TYPES.ORDER_HELD,
    blocked: EVENT_TYPES.ORDER_HELD,
  };
  // TODO: DUPLICATE EVENT PUBLISHING
  // TODO: A more robust implementation with transactions exists below.
  publishEnterpriseEvent({
    eventType: eventTypeByStatus[String(status)] || 'OrderStatusUpdated',
    module: 'courier',
    entityType: 'order',
    entityId: orderId,
    ...actorFromRequest(req),
    oldValue: { status: order.status },
    newValue: {
      status,
      courier_id: courier.id,
      total_amount: order.total_amount,
      courier_unsold_return: unsoldFlag,
    },
  });
  res.json(updated);
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint has a second, more robust implementation below.
router.patch('/orders/:id/items/:itemId/home-left', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  const orderId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const homeLeftRaw = req.body?.home_left_in_courier;
  const homeLeft =
    homeLeftRaw === true ||
    homeLeftRaw === 1 ||
    String(homeLeftRaw || '').trim().toLowerCase() === '1' ||
    String(homeLeftRaw || '').trim().toLowerCase() === 'true'
      ? 1
      : 0;

  // TODO: VALIDATION SHOULD BE CENTRALIZED
  if (!Number.isFinite(orderId) || orderId < 1) return res.status(400).json({ error: "Noto'g'ri buyurtma ID." });
  if (!Number.isFinite(itemId) || itemId < 1) return res.status(400).json({ error: "Noto'g'ri mahsulot qatori ID." });

  const order = db.prepare('SELECT id, courier_id, status FROM orders WHERE id = ?').get(orderId);
  // TODO: DUPLICATE OWNERSHIP VALIDATION
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id !== courier.id) return res.status(403).json({ error: 'Bu buyurtma sizga tegishli emas.' });
  // TODO: DUPLICATE STATE MACHINE
  // TODO: This is a simple status check.
  if (String(order.status || '') === 'delivered' || String(order.status || '') === 'blocked') {
    return res.status(400).json({ error: "Bu holatda mahsulotni 'uyda qoldi' deb belgilab bo'lmaydi." });
  }

  const item = db
    .prepare('SELECT id, order_id FROM order_items WHERE id = ? AND order_id = ?')
    .get(itemId, orderId);
  if (!item) return res.status(404).json({ error: 'Mahsulot qatori topilmadi.' });

  db.prepare('UPDATE order_items SET home_left_in_courier = ? WHERE id = ?').run(homeLeft, itemId);
  if (homeLeft === 1) {
    db.prepare('UPDATE orders SET courier_unsold_return = 1 WHERE id = ?').run(orderId);
  }

  const updated = orderWithItems(orderId);
  res.json(updated);
});

/** Kuryer biriktirilgan buyurtmalar — mijoz bilan suhbat ro‘yxati (matnli chat keyinroq) */
// TODO: N+1 QUERY
// TODO: This endpoint fetches orders and then fetches items for each order in a loop.
router.get('/customer-chat-orders', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));
  const orders = db
    .prepare(
      `
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.courier_id, o.created_at, o.is_test
    FROM orders o
    WHERE o.courier_id = ? AND o.status NOT IN ('cancelled', 'blocked')
    ORDER BY
      CASE o.status
        WHEN 'on_the_way' THEN 0
        WHEN 'picked_up' THEN 1
        WHEN 'assigned' THEN 2
        WHEN 'delivered' THEN 3
        ELSE 9
      END,
      o.id DESC
    LIMIT 100
  `
    )
    .all(courier.id);
  const feePerOrder = getCourierFee();
  for (const o of orders) {
    o.items = db
      .prepare(
        `
      SELECT ${ORDER_ITEM_COLUMNS}
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `
      )
      .all(o.id);
    o.courier_fee = feePerOrder;
    o.is_test = Number(o.is_test) === 1 ? 1 : 0;
  }
  res.json({ orders });
});

/** Mijozga chiquvchi qo‘ng‘iroq qaydi (buyurtma ID bilan; audio keyinroq alohida) */
// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint has a second, more robust implementation below.
router.post('/call-logs', validateCallLog, (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));
  const orderId = parseInt(req.body?.orderId, 10);
  const order = db.prepare('SELECT id, courier_id FROM orders WHERE id = ?').get(orderId);
  // TODO: DUPLICATE OWNERSHIP VALIDATION
  if (!order) return res.status(404).json(createStructuredError('NOT_FOUND', 'Order not found.'));
  if (order.courier_id !== courier.id) return res.status(403).json(createStructuredError('FORBIDDEN', 'This order does not belong to you.'));
  const note = String(req.body?.note || '').trim().slice(0, 500) || null;
  const r = db
    .prepare(
      `
    INSERT INTO courier_call_logs (order_id, courier_staff_id, user_id, channel, note)
    VALUES (?, ?, ?, 'customer', ?)
  `
    )
    .run(orderId, courier.id, req.user.id, note);
  const log = db.prepare('SELECT * FROM courier_call_logs WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ log });
});

router.get('/call-logs', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));
  const logs = db
    .prepare(
      `
    SELECT l.id, l.order_id, l.created_at, l.channel, l.note,
           o.status AS order_status, o.total_amount
    FROM courier_call_logs l
    JOIN orders o ON o.id = l.order_id
    WHERE l.courier_staff_id = ?
    ORDER BY l.id DESC
    LIMIT 200
  `
    )
    .all(courier.id);
  res.json({ logs });
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.get('/work-role/balance', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
  if (!wr) {
    return res.status(404).json(createStructuredError('NO_WORK_ROLE', 'Financial work role not found.'));
  }
  res.json({ balance: Number(wr.total_amount) || 0 });
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.get('/withdrawals', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
  if (!wr) return res.status(403).json(createStructuredError('NO_WORK_ROLE', 'Work role not found.', { withdrawals: [] }));
  const rows = db
    .prepare(
      `
    SELECT id, amount, status, payout_method, created_at, reviewed_at, note, paid_out_at
    FROM withdrawal_requests WHERE work_role_id = ?
    ORDER BY datetime(created_at) DESC LIMIT 50
  `,
    )
    .all(wr.id);
  res.json({ withdrawals: rows });
});

/** Moliya: balans, jarima/mukofot va barcha tranzaksiyalar */
// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.get('/finance', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
  if (!wr) return res.status(403).json(createStructuredError('NO_WORK_ROLE', 'Work role not found.'));
  const payload = buildWorkRoleFinancePayload(wr, { limit: 500 });
  res.json({
    summary: payload.summary,
    fines: payload.fines,
    rewards: payload.rewards,
    transactions: payload.transactions,
    timeline: payload.timeline,
    withdrawals: payload.withdrawals,
  });
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint is also implemented in other staff-related routers. Centralize it.
router.post('/withdrawal', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
  if (!wr) return res.status(403).json(createStructuredError('NO_WORK_ROLE', 'Work role not found.'));
  try {
    const payoutRaw = String(req.body?.payout_method || 'cash').trim().toLowerCase();
    const payoutMethod = payoutRaw === 'card' ? 'card' : 'cash';
    const out = createPendingWithdrawalForWorkRole({ workRoleRow: wr, amount: req.body?.amount, payoutMethod });
    return res.status(201).json({ ok: true, message: out.message });
  } catch (e) {
    const code = String(e.message || '').toUpperCase();
    if (code === 'INVALID_AMOUNT') return res.status(400).json(createStructuredError(code, 'Please enter a valid amount.'));
    if (code === 'INSUFFICIENT_BALANCE') return res.status(400).json(createStructuredError(code, 'Insufficient balance.'));
    console.error('[courier/withdrawal]', e);
    return res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Server error during withdrawal.'));
  }
});

// TODO: DUPLICATE HELPER FUNCTION
// TODO: This function is duplicated in other routers.
function attachExpeditorBatchOrders(batchRows, feePerOrder) {
  for (const b of batchRows) {
    const orders = db
      .prepare(
        `
      SELECT ${ORDER_LIST_COLUMNS}
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.expeditor_batch_id = ?
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) ASC, o.id ASC
    `,
      )
      .all(b.id);
    for (const o of orders) {
      o.items = db
        .prepare(
          `
        SELECT ${ORDER_ITEM_COLUMNS}
        FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
      `,
        )
        .all(o.id);
      o.courier_fee = feePerOrder;
      o.is_test = Number(o.is_test) === 1 ? 1 : 0;
    }
    b.orders = orders;
    b.orders_count = orders.length;
  }
  return batchRows;
}

/** Ekspeditor yopgan kunlik listlar — kuryer yon panel «Listlar» bo'limi. */
// TODO: N+1 QUERY
// TODO: This endpoint fetches batches and then loops through them to fetch orders, which in turn fetch items.
router.get('/handoff-lists', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier profile not found.'));

  try {
    const batchId = parseInt(String(req.query.batch_id || ''), 10);
    const feePerOrder = getCourierFee();

    if (Number.isFinite(batchId) && batchId > 0) {
      const batch = db
        .prepare(
          `
        SELECT b.id, b.expeditor_user_id, b.courier_staff_id, b.viloyat_id, b.closed_at, b.status
        FROM expeditor_closed_batches b
        WHERE b.id = ? AND b.courier_staff_id = ?
      `,
        )
        .get(batchId, courier.id);
      if (!batch) return res.status(404).json(createStructuredError('NOT_FOUND', 'List not found.'));
      attachExpeditorBatchOrders([batch], feePerOrder);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ batch, courier_fee_per_order: feePerOrder });
    }

    const batches = db
      .prepare(
        `
      SELECT b.id, b.expeditor_user_id, b.courier_staff_id, b.viloyat_id, b.closed_at, b.status,
             (SELECT COUNT(*) FROM orders o WHERE o.expeditor_batch_id = b.id) AS orders_count
      FROM expeditor_closed_batches b
      WHERE b.courier_staff_id = ?
      ORDER BY datetime(b.closed_at) DESC, b.id DESC
      LIMIT 100
    `,
      )
      .all(courier.id);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ batches, courier_fee_per_order: feePerOrder });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Listlar yuklanmadi.' });
  }
});

/**
 * Kuryer uchun "Kutilayotgan Listlar" sahifasi.
 * Ekspeditor yopgan, lekin kuryer hali qabul qilmagan listlar.
 */
router.get('/pending-lists', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  try {
    const batches = db
      .prepare(
        `
      SELECT
        b.id,
        b.closed_at,
        (SELECT COUNT(*) FROM orders o WHERE o.expeditor_batch_id = b.id) AS orders_count,
        (SELECT SUM(o.total_amount) FROM orders o WHERE o.expeditor_batch_id = b.id) AS total_amount
      FROM expeditor_closed_batches b
      WHERE b.courier_staff_id = ? AND b.status = 'pending'
      ORDER BY datetime(b.closed_at) DESC, b.id DESC
    `,
      )
      .all(courier.id);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ batches });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Listlar yuklanmadi.' });
  }
});

/**
 * Kuryerning ish bazasi.
 * Qabul qilingan va hali yakunlanmagan (yetkazilmagan/qaytarilmagan) barcha zakazlar.
 */
router.get('/base', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  try {
    const activeStatuses = ['assigned', 'picked_up', 'on_the_way', 'take_later'];
    const placeholders = activeStatuses.map(() => '?').join(',');

    const orders = db
      .prepare(
        `
      SELECT ${ORDER_LIST_COLUMNS}
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.courier_id = ? AND o.status IN (${placeholders})
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
    `,
      )
      .all(courier.id, ...activeStatuses);

    const feePerOrder = getCourierFee();
    for (const o of orders) {
      o.items = db
        .prepare(
          `
        SELECT ${ORDER_ITEM_COLUMNS}
        FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
      `,
        )
        .all(o.id);
      o.courier_fee = feePerOrder;
      o.is_test = Number(o.is_test) === 1 ? 1 : 0;
    }

    const activeBatches = db
      .prepare(
        `
      SELECT b.id, b.closed_at, b.status,
             (SELECT COUNT(*) FROM orders o WHERE o.expeditor_batch_id = b.id) AS orders_count
      FROM expeditor_closed_batches b
      WHERE b.courier_staff_id = ? AND b.status = 'received_by_courier'
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.expeditor_batch_id = b.id AND o.status IN (${placeholders})
        )
      ORDER BY datetime(b.closed_at) DESC
    `,
      )
      .all(courier.id, ...activeStatuses);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders, active_batches: activeBatches });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Baza yuklanmadi.' });
  }
});

// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: This endpoint has a second, more robust implementation below.
router.post('/handoff-lists/:id/accept', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  const batchId = parseInt(req.params.id, 10);
  // TODO: VALIDATION SHOULD BE CENTRALIZED
  if (isNaN(batchId) || batchId < 1) return res.status(400).json({ error: 'Noto\'g\'ri list ID.' });

  const batch = db.prepare('SELECT id, expeditor_user_id, courier_staff_id, status FROM expeditor_closed_batches WHERE id = ?').get(batchId);
  // TODO: DUPLICATE OWNERSHIP VALIDATION
  if (!batch) return res.status(404).json({ error: 'List topilmadi.' });
  if (batch.courier_staff_id !== courier.id) return res.status(403).json({ error: 'Bu list sizga tegishli emas.' });
  if (batch.status !== 'pending') return res.status(400).json({ error: 'Bu list allaqachon qabul qilingan yoki boshqa holatda.' });

  try {
    db.transaction(() => {
      db.prepare("UPDATE expeditor_closed_batches SET status = 'received_by_courier', courier_accepted_at = datetime('now') WHERE id = ?").run(batch.id);
      db.prepare("UPDATE orders SET status = 'picked_up', courier_assigned_via = 'expeditor', status_updated_at = datetime('now') WHERE expeditor_batch_id = ? AND courier_id = ?").run(batch.id, courier.id);

      const title = 'List tasdiqlandi';
      const body = `Kuryer ${courier.full_name} #${batch.id}-sonli ekspeditor listini qabul qildi.`;

      // TODO: MOVE TO NotificationService
      // TODO: This notification logic should be in a centralized service.
      if (batch.expeditor_user_id) {
        db.prepare("INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)").run(batch.expeditor_user_id, title, body);
      }

      const superusers = db.prepare("SELECT id FROM users WHERE role = 'superuser'").all();
      for (const su of superusers) {
        if (su.id !== batch.expeditor_user_id) {
          db.prepare("INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)").run(su.id, title, body);
        }
      }
    })();

    publishEnterpriseEvent({
      eventType: EVENT_TYPES.COURIER_LIST_ACCEPTED,
      module: 'courier',
      entityType: 'expeditor_batch',
      entityId: batchId,
      ...actorFromRequest(req),
    });

    res.json({ ok: true, message: 'List muvaffaqiyatli qabul qilindi.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Xatolik yuz berdi.' });
  }
});

/** Sklad Lichka / MyShop DM — picker bilan bir xil ma’lumotlar */
// TODO: DUPLICATE ENDPOINT IMPLEMENTATION
// TODO: These endpoints are duplicated across multiple staff routers.
router.get('/sklad-peers', getSkladPeers);
router.get('/dm/messages', getDmMessages);
router.get('/dm/stories', getDmStories);
router.get('/dm/call-logs', getDmCallLogs);
router.post('/dm/call-logs', postDmCallLog);
router.post('/dm/send', postDmSend);
router.post('/chat/presence', postChatPresence);
router.get('/chat/presence', getChatPresence);

export default router;
