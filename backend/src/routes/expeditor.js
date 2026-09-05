import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  validateIdParam,
  validateAssignCourier,
  validateUnassignCourier,
  validateCloseHandoffList,
  validateCourierIdQuery,
  validateIdAndCourierIdQuery,
} from '../middleware/expeditorValidators.js';
import { getWorkRoleByUserPortalRole, createPendingWithdrawalForWorkRole } from '../lib/staffWithdrawalFlow.js';
import { sqlStaffHasActiveWorkRole } from '../lib/workRoleArchive.js';
import { buildWorkRoleFinancePayload } from '../services/workRoleTransactionService.js';
import { EVENT_TYPES } from '../events/eventTypes.js';
import { actorFromRequest, publishEnterpriseEvent } from '../events/publishEvent.js';
import { insertAuditLog } from '../services/auditLogService.js';
import { notificationService } from '../services/notificationService.js';
import {
  getViloyatEntryById,
  matchesViloyatFilter,
  orderMatchesViloyatEntry,
  classifyShippingAddressViloyatId,
} from '../utils/viloyatPacker.js';
import { createStructuredError } from '../utils/errorHandling.js';

const router = Router();
// Global role check removed. Each route now has its own specific role requirement.
router.use(authRequired);

const HANDOFF_STATUSES = ['assigned', 'picked_up', 'on_the_way'];
const HANDOFF_STATUSES_FULL = ['assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled'];

function getExpeditorWorkRole(req) {
  let wr = getWorkRoleByUserPortalRole(req.user, 'expeditor');
  if (!wr) wr = getWorkRoleByUserPortalRole(req.user, 'order_receiver');
  return wr;
}

/**
 * Middleware to enforce region ownership.
 * Ensures that the user can only operate within their assigned region.
 */
/**
 * Middleware to enforce region ownership.
 *
 * Agar ekspeditorning ish roliga aniq bitta viloyat biriktirilgan bo'lsa —
 * u faqat o'sha hudud bilan ishlaydi (eski xatti-harakat saqlanadi).
 * Agar hech qanday viloyat biriktirilmagan bo'lsa — bu "umumiy" ekspeditor
 * hisoblanadi va butun O'zbekiston bo'yicha barcha kuryer/zakazlarni ko'ra oladi,
 * chunki har bir viloyat uchun alohida ekspeditor talab qilinmaydi.
 */
async function validateRegionAccess(req, res, next) {
  const workRole = getExpeditorWorkRole(req);
  const userRegionId = workRole?.courier_viloyat_id;

  // Hudud biriktirilmagan — bu ekspeditor barcha viloyatlarni ko'ra oladi, cheklov qo'yilmaydi.
  if (!userRegionId) {
    return next();
  }

  const requestedRegionId = req.query.viloyat_id || req.body.viloyat_id;
  if (requestedRegionId && requestedRegionId !== userRegionId) {
    return res.status(403).json(createStructuredError('FORBIDDEN', 'Access to this region is denied.'));
  }

  const orderId = req.params.id ? parseInt(req.params.id, 10) : null;
  if (orderId && Number.isFinite(orderId)) {
    const order = db.prepare('SELECT shipping_address FROM orders WHERE id = ?').get(orderId);
    if (order) {
      const orderRegionId = classifyShippingAddressViloyatId(order.shipping_address);
      if (orderRegionId !== userRegionId) {
        return res.status(403).json(createStructuredError('FORBIDDEN', "You cannot access an order from another region."));
      }
    }
  }

  next();
}

function courierBelongsToRegion(courierStaffId, viloyatId) {
  if (!courierStaffId || !viloyatId) return true;
  const entry = getViloyatEntryById(String(viloyatId || '').trim());
  if (!entry) return true;
  const courier = db
    .prepare(
      `
      SELECT COALESCE(NULLIF(trim(sm.region_service_text), ''), r.name) AS region_name
      FROM staff_members sm
      LEFT JOIN regions r ON r.id = sm.region_id
      WHERE sm.id = ? AND sm.staff_type = 'courier'
    `,
    )
    .get(courierStaffId);
  const regionName = String(courier?.region_name || '').trim();
  if (!regionName) return true;
  return orderMatchesViloyatEntry(regionName.toLowerCase(), entry);
}

function batchBelongsToRegion(batchId, batch, viloyatId) {
  if (!batch || !viloyatId) return false;
  if (batch.viloyat_id) return String(batch.viloyat_id) === String(viloyatId);

  const rows = db
    .prepare('SELECT shipping_address FROM orders WHERE expeditor_batch_id = ? LIMIT 500')
    .all(batchId);
  if (!rows.length) return false;
  return rows.every((row) => classifyShippingAddressViloyatId(row.shipping_address) === String(viloyatId));
}

const HANDOFF_VIA_SQL = `(
  o.courier_assigned_via IS NULL OR trim(COALESCE(o.courier_assigned_via,'')) = '' OR o.courier_assigned_via = 'expeditor'
)`;

function orderWithItems(orderId) {
  const order = db.prepare('SELECT o.*, u.full_name AS customer_name FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?').get(orderId);
  if (!order) return null;
  order.items = db
    .prepare(
      `
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url,
           COALESCE(oi.home_left_in_courier, 0) AS home_left_in_courier
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `,
    )
    .all(order.id);
  return order;
}

/**
 * Attaches order items to a list of orders.
 * This function is a major source of N+1 query problems.
 * It has been replaced with a more performant single-query approach where possible.
 * @param {Array} rows - The order rows.
 * @param {object} [options={}] - Options for filtering items.
 * @returns {Array} The rows with items attached.
 */
function attachItems(rows, options = {}) {
  const markedOnly = options.markedOnly === true;
  const receivedOnly = options.receivedOnly === true;
  const orderIds = rows.map(o => o.id);
  if (orderIds.length === 0) return rows;

  const itemsSql = `
      SELECT oi.order_id, oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url, COALESCE(oi.home_left_in_courier, 0) AS home_left_in_courier
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
        ${markedOnly ? 'AND COALESCE(oi.home_left_in_courier, 0) = 1' : ''}
        ${receivedOnly ? 'AND COALESCE(oi.home_left_in_courier, 0) = 2' : ''}
    `;
  const allItems = db.prepare(itemsSql).all(orderIds);

  const itemsByOrderId = new Map();
  for (const item of allItems) {
    if (!itemsByOrderId.has(item.order_id)) {
      itemsByOrderId.set(item.order_id, []);
    }
    itemsByOrderId.get(item.order_id).push(item);
  }

  for (const o of rows) {
    o.items = itemsByOrderId.get(o.id) || [];
  }
  return rows;
}

/** Kelajakdagi ekspeditor API — hozircha faqat autentifikatsiya tekshiruvi */
router.get('/ping', requireRole('expeditor', 'order_receiver'), (_req, res) => {
  res.json({ ok: true });
});

/**
 * Tanlov: faol kuryerlar + bog‘langan sklad viloyati (regions.name).
 * ?viloyat_id=andijon — faqat shu hududga mos `region_name` bo‘yicha.
 */
router.get('/couriers', requireRole('expeditor', 'order_receiver'), validateRegionAccess, (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const entry = getViloyatEntryById(viloyatId);

    const couriers = db
      .prepare(
        `
      SELECT sm.id, sm.full_name, sm.phone, sm.status, sm.region_id,
             COALESCE(NULLIF(trim(sm.region_service_text), ''), r.name) AS region_name,
             COALESCE(sm.balance, 0) AS balance
      FROM staff_members sm
      LEFT JOIN regions r ON r.id = sm.region_id
      WHERE sm.staff_type = 'courier'
        AND ${sqlStaffHasActiveWorkRole('sm')}
        AND (
          sm.status IS NULL
          OR trim(sm.status) = ''
          OR lower(trim(sm.status)) NOT IN ('blocked', 'churn')
        )
      ORDER BY lower(sm.full_name)
    `,
      )
      .all();

    const filtered = entry
      ? couriers.filter((c) => {
          const blob = String(c.region_name || '').toLowerCase();
          return orderMatchesViloyatEntry(blob, entry);
        })
      : couriers;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ couriers: filtered });
  } catch (e) {
    console.error('[expeditor/couriers]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load couriers.'));
  }
});

/** Qadoqlangan, hali kuryerga berilmagan zakazlar (ekspeditor skaneri kutadi) */
router.get('/orders/pending-packaged', requireRole('expeditor'), validateRegionAccess, (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const rows = db
      .prepare(
        `
      SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
             o.courier_id, o.packer_id, o.created_at, COALESCE(o.is_test, 0) AS is_test
      FROM orders o
      WHERE o.status = 'packaged' AND (o.courier_id IS NULL OR o.courier_id = 0)
      ORDER BY datetime(o.created_at) ASC
      LIMIT 300
    `,
      )
      .all();

    const filtered = viloyatId
      ? rows.filter((o) => matchesViloyatFilter(o.shipping_address || '', viloyatId))
      : rows;

    attachItems(filtered);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: filtered });
  } catch (e) {
    console.error('[expeditor/pending-packaged]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load orders.'));
  }
});

/** Kutilayotgan qadoqlangan zakazlar — viloyatlar bo‘yicha son (test / obzor). */
router.get('/orders/pending-packaged-summary', requireRole('expeditor', 'order_receiver'), (_req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT o.id, o.shipping_address
      FROM orders o
      WHERE o.status = 'packaged' AND (o.courier_id IS NULL OR o.courier_id = 0)
      ORDER BY o.id ASC
      LIMIT 500
    `,
      )
      .all();
    const byViloyat = {};
    let other = 0;
    for (const o of rows) {
      const vid = classifyShippingAddressViloyatId(o.shipping_address);
      if (vid === 'other') other += 1;
      else byViloyat[vid] = (byViloyat[vid] || 0) + 1;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ total: rows.length, byViloyat, other });
  } catch (e) {
    console.error('[expeditor/pending-packaged-summary]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to get summary.'));
  }
});

/**
 * Kuryer ilovasida "uyda qoldi" deb belgilangan mahsulotlar bo'lgan zakazlar.
 * Qabul qiluvchi/ekspeditor: viloyat + kuryer tanlangach ro'yxat.
 */
router.get('/orders/courier-cancelled-unsold', requireRole('order_receiver'), validateIdAndCourierIdQuery, validateRegionAccess, (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const courierStaffId = parseInt(String(req.query.courier_staff_id || ''), 10);

    const rows = db
      .prepare(
        `
      SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
             o.courier_id, o.packer_id, o.created_at, COALESCE(o.is_test, 0) AS is_test,
             o.courier_assigned_via, o.status_updated_at, COALESCE(o.courier_unsold_return, 0) AS courier_unsold_return
      FROM orders o
      WHERE o.courier_id = ?
        AND o.status IN ('assigned', 'picked_up', 'on_the_way', 'cancelled')
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND COALESCE(oi.home_left_in_courier, 0) = 1
        )
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
      LIMIT 200
    `,
      )
      .all(courierStaffId);

    const filtered = viloyatId
      ? rows.filter((o) => matchesViloyatFilter(o.shipping_address || '', viloyatId))
      : rows;

    attachItems(filtered, { markedOnly: true });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: filtered });
  } catch (e) {
    console.error('[expeditor/courier-cancelled-unsold]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load orders.'));
  }
});

/** Atkaz qabul qiluvchi: skladga qabul qilib olingan (home_left_in_courier = 2) atkaz zakazlar */
router.get('/orders/courier-received-atkaz', requireRole('order_receiver'), validateIdAndCourierIdQuery, validateRegionAccess, (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const courierStaffId = parseInt(String(req.query.courier_staff_id || ''), 10);

    const rows = db
      .prepare(
        `
      SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
             o.courier_id, o.packer_id, o.created_at, COALESCE(o.is_test, 0) AS is_test,
             o.courier_assigned_via, o.status_updated_at, COALESCE(o.courier_unsold_return, 0) AS courier_unsold_return
      FROM orders o
      WHERE o.courier_id = ?
        AND o.status = 'cancelled'
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND COALESCE(oi.home_left_in_courier, 0) = 2
        )
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
      LIMIT 200
    `,
      )
      .all(courierStaffId);

    const filtered = viloyatId
      ? rows.filter((o) => matchesViloyatFilter(o.shipping_address || '', viloyatId))
      : rows;

    attachItems(filtered, { receivedOnly: true });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: filtered });
  } catch (e) {
    console.error('[expeditor/courier-received-atkaz]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load orders.'));
  }
});

/** Tanlangan kuryer — qadoqlovchidan chiqqan, kuryer uchun yo‘ldagi zakazlar */
router.get('/orders/courier-handoff', requireRole('expeditor'), validateCourierIdQuery, validateRegionAccess, (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const courierStaffId = parseInt(String(req.query.courier_staff_id || ''), 10);

    const full = String(req.query.full || '').trim() === '1';
    const statusList = full ? HANDOFF_STATUSES_FULL : HANDOFF_STATUSES;
    const placeholders = statusList.map(() => '?').join(', ');

    // 1. Find the latest closed batch ID for this courier and region (to allow viewing a copy)
    let latestBatchId = 0;
    const latestBatch = db
      .prepare(
        `
      SELECT id FROM expeditor_closed_batches
      WHERE courier_staff_id = ?
        AND (viloyat_id = ? OR (viloyat_id IS NULL AND (? = '' OR ? IS NULL)))
      ORDER BY datetime(closed_at) DESC
      LIMIT 1
    `,
      )
      .get(courierStaffId, viloyatId, viloyatId || '', viloyatId || '');

    if (latestBatch) {
      latestBatchId = latestBatch.id;
    }

    // 2. Query orders including those from the latest closed batch
    const rows = db
      .prepare(
        `
      SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
             o.courier_id, o.packer_id, o.created_at, COALESCE(o.is_test, 0) AS is_test,
             o.courier_assigned_via, o.status_updated_at, o.expeditor_batch_id
      FROM orders o
      WHERE o.courier_id = ? AND o.status IN (${placeholders}) AND ${HANDOFF_VIA_SQL}
        AND (
          o.expeditor_batch_id IS NULL
          OR o.expeditor_batch_id = 0
          OR o.expeditor_batch_id = ?
        )
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
      LIMIT 500
    `,
      )
      .all(courierStaffId, ...statusList, latestBatchId);

    const filtered = viloyatId
      ? rows.filter((o) => matchesViloyatFilter(o.shipping_address || '', viloyatId))
      : rows;

    attachItems(filtered);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: filtered });
  } catch (e) {
    console.error('[expeditor/courier-handoff]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load orders.'));
  }
});

/** Skaner: zakazni tanlangan kuryerga biriktirish (courier «take» bilan bir xil) */
router.post('/orders/:id/assign-courier', requireRole('expeditor'), validateAssignCourier, validateRegionAccess, (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const courierStaffId = parseInt(String(req.body?.courier_staff_id ?? ''), 10);

    const courier = db
      .prepare(
        `SELECT id, staff_type, status, COALESCE(balance, 0) AS balance FROM staff_members WHERE id = ? AND staff_type = 'courier' AND ${sqlStaffHasActiveWorkRole()}`,
      )
      .get(courierStaffId);
    if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier not found or not active.'));
    const st = String(courier.status || '').trim().toLowerCase();
    if (st === 'blocked' || st === 'churn') {
      return res.status(403).json(createStructuredError('COURIER_BLOCKED', 'This courier is blocked.'));
    }
    if (Number(courier.balance) <= 0) {
      return res.status(403).json(createStructuredError('INSUFFICIENT_BALANCE', 'Courier balance is zero or negative.'));
    }

    const assignTx = db.transaction(() => {
      const order = db
        .prepare(`SELECT id, courier_id, status, shipping_address, COALESCE(total_amount, 0) AS total_amount FROM orders WHERE id = ?`)
        .get(orderId);
      if (!order) throw createStructuredError('NOT_FOUND', 'Order not found.', { status: 404 });

      // Idempotency and Race Condition Check
      if (order.courier_id) {
        const sameCourier = Number(order.courier_id) === courierStaffId;
        if (sameCourier) return { alreadyAssigned: true, order }; // Idempotent success
        throw createStructuredError('ORDER_ALREADY_ASSIGNED', 'This order is already assigned to another courier.', { status: 409 });
      }

      // Status Transition Guard
      if (String(order.status) !== 'packaged') {
        throw createStructuredError('INVALID_STATUS_TRANSITION', 'Only packaged orders can be assigned.', { status: 409 });
      }

      db.prepare(
        `UPDATE orders SET courier_id = ?, status = ?, courier_assigned_via = 'expeditor', status_updated_at = datetime('now') WHERE id = ?`,
      ).run(courierStaffId, 'assigned', orderId);
      db.prepare('UPDATE staff_members SET orders_handled = orders_handled + 1 WHERE id = ?').run(courierStaffId);
      db.prepare('UPDATE staff_members SET balance = COALESCE(balance, 0) + ? WHERE id = ?').run(
        Number(order.total_amount) || 0,
        courierStaffId,
      );
      return { alreadyAssigned: false, order };
    });

    const { alreadyAssigned, order } = assignTx();

    if (alreadyAssigned) {
      return res.json(orderWithItems(orderId));
    }

    publishEnterpriseEvent({
      eventType: EVENT_TYPES.COURIER_ASSIGNED,
      module: 'expeditor',
      entityType: 'order',
      entityId: orderId,
      ...actorFromRequest(req),
      oldValue: { status: order.status, courier_id: order.courier_id },
      newValue: { status: 'assigned', courier_id: courierStaffId, courier_assigned_via: 'expeditor' },
    });
    insertAuditLog({ req, action: 'assign_courier', entity: 'order', entityId: orderId, newValue: { courier_id: courierStaffId } });

    const updated = orderWithItems(orderId);
    res.json(updated);
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json(e);
    }
    console.error('[expeditor/assign-courier]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to assign courier.'));
  }
});

/** Adashganda: kuryer zakazini yana qadoqlangan navbatga qaytarish */
router.post('/orders/:id/unassign-courier', requireRole('expeditor'), validateUnassignCourier, validateRegionAccess, (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const courierStaffId = parseInt(String(req.body?.courier_staff_id ?? ''), 10);

    const unassignTx = db.transaction(() => {
      const order = db
        .prepare(`SELECT id, courier_id, status, COALESCE(total_amount, 0) AS total_amount FROM orders WHERE id = ?`)
        .get(orderId);
      if (!order) throw createStructuredError('NOT_FOUND', 'Order not found.', { status: 404 });

      // Idempotency Check
      if (!order.courier_id) {
        return { alreadyUnassigned: true, order };
      }

      if (Number(order.courier_id) !== courierStaffId) {
        throw createStructuredError('OWNERSHIP_ERROR', 'This order is not assigned to the selected courier.', { status: 403 });
      }

      // Status Transition Guard
      const st = String(order.status || '');
      if (!HANDOFF_STATUSES.includes(st)) {
        throw createStructuredError('INVALID_STATUS_TRANSITION', 'Cannot unassign an order in this state.', { status: 409 });
      }

      db.prepare(
        `UPDATE orders SET courier_id = NULL, status = ?, courier_assigned_via = NULL, expeditor_batch_id = NULL, status_updated_at = datetime('now') WHERE id = ?`,
      ).run('packaged', orderId);
      db
        .prepare(
          `UPDATE staff_members SET orders_handled = CASE WHEN orders_handled > 0 THEN orders_handled - 1 ELSE 0 END WHERE id = ?`,
        )
        .run(courierStaffId);
      db.prepare('UPDATE staff_members SET balance = COALESCE(balance, 0) - ? WHERE id = ?').run(
        Number(order.total_amount) || 0,
        courierStaffId,
      );
      return { alreadyUnassigned: false, order };
    });

    const { alreadyUnassigned, order } = unassignTx();

    if (alreadyUnassigned) {
      return res.json(orderWithItems(orderId));
    }

    publishEnterpriseEvent({
      eventType: EVENT_TYPES.COURIER_UNASSIGNED,
      module: 'expeditor',
      entityType: 'order',
      entityId: orderId,
      ...actorFromRequest(req),
      oldValue: { status: order.status, courier_id: order.courier_id },
      newValue: { status: 'packaged', courier_id: null },
    });
    insertAuditLog({ req, action: 'unassign_courier', entity: 'order', entityId: orderId, oldValue: { courier_id: courierStaffId } });

    const updated = orderWithItems(orderId);
    res.json(updated);
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json(e);
    }
    console.error('[expeditor/unassign-courier]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to unassign courier.'));
  }
});

/** Atkaz qabul qiluvchi: kuryer qaytargan zakazlarni skladga qabul qilish */
router.post('/orders/:id/receive-atkaz', requireRole('order_receiver'), validateIdParam, validateRegionAccess, (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const workRole = getExpeditorWorkRole(req);
    const userRegionId = String(workRole?.courier_viloyat_id || '').trim();
    const receiveTx = db.transaction(() => {
      const order = db
        .prepare('SELECT id, status, courier_id, courier_unsold_return FROM orders WHERE id = ?')
        .get(orderId);
      if (!order) throw createStructuredError('NOT_FOUND', 'Order not found.', { status: 404 });

      const status = String(order.status || '').trim();
      if (['delivered', 'completed', 'archived'].includes(status)) {
        throw createStructuredError('INVALID_STATUS_TRANSITION', 'This order cannot be received as a return.', { status: 409 });
      }

      // Idempotency Check
      if (Number(order.courier_unsold_return) === 2) {
        return { alreadyReceived: true, order };
      }

      if (!order.courier_id || !courierBelongsToRegion(order.courier_id, userRegionId)) {
        throw createStructuredError('FORBIDDEN', 'Access to this courier is denied.', { status: 403 });
      }

      const returnableStatuses = new Set(['assigned', 'picked_up', 'on_the_way', 'cancelled']);
      if (!returnableStatuses.has(status)) {
        throw createStructuredError('INVALID_STATUS_TRANSITION', 'This order is not in a return workflow.', { status: 409 });
      }

      const returnedItems = db
        .prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ? AND COALESCE(home_left_in_courier, 0) = 1')
        .get(orderId);
      if (!returnedItems || Number(returnedItems.c) < 1) {
        throw createStructuredError('NO_RETURN_ITEMS', 'No returned items found for this order.', { status: 409 });
      }

      // 1. Mark order items as received (home_left_in_courier = 2)
      db.prepare('UPDATE order_items SET home_left_in_courier = 2 WHERE order_id = ?').run(orderId);
      // 2. Mark order as received to warehouse (courier_unsold_return = 2)
      db.prepare(`UPDATE orders SET courier_unsold_return = 2, status = ?, status_updated_at = datetime('now') WHERE id = ?`).run('cancelled', orderId);
      return { alreadyReceived: false, order };
    });
    const { alreadyReceived, order } = receiveTx();

    if (alreadyReceived) {
      return res.json({ ok: true, message: 'This return has already been received.', order: orderWithItems(orderId) });
    }

    publishEnterpriseEvent({
      eventType: EVENT_TYPES.WAREHOUSE_RETURN_RECEIVED,
      module: 'expeditor', // or 'warehouse'
      entityType: 'order',
      entityId: orderId,
      ...actorFromRequest(req),
      oldValue: { status: order.status, courier_unsold_return: order.courier_unsold_return },
      newValue: { status: 'cancelled', courier_unsold_return: 2 },
    });
    insertAuditLog({ req, action: 'receive_atkaz', entity: 'order', entityId: orderId });

    res.json({
      ok: true,
      message: 'Buyurtma skladga atkaz sifatida qabul qilindi',
      order: orderWithItems(orderId),
    });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json(e);
    }
    console.error('[expeditor/receive-atkaz]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to receive return.'));
  }
});

/** Yopilgan kuryer ro'yxati — «Listni yopish» bosilganda joriy navbatdagi zakazlarni saqlaydi. */
router.post('/handoff-lists/close', requireRole('expeditor'), validateCloseHandoffList, validateRegionAccess, (req, res) => {
  try {
    const courierStaffId = parseInt(String(req.body?.courier_staff_id ?? ''), 10);
    const viloyatId = String(req.body?.viloyat_id || '').trim();

    const courier = db
      .prepare(`SELECT id FROM staff_members WHERE id = ? AND staff_type = 'courier' AND ${sqlStaffHasActiveWorkRole()}`)
      .get(courierStaffId);
    if (!courier) return res.status(404).json(createStructuredError('NOT_FOUND', 'Courier not found.'));

    const placeholders = HANDOFF_STATUSES.map(() => '?').join(', ');
    let rows = db
      .prepare(
        `
      SELECT o.id, o.shipping_address
      FROM orders o
      WHERE o.courier_id = ? AND o.status IN (${placeholders}) AND ${HANDOFF_VIA_SQL}
        AND (o.expeditor_batch_id IS NULL OR o.expeditor_batch_id = 0)
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) ASC, o.id ASC
    `,
      )
      .all(courierStaffId, ...HANDOFF_STATUSES);

    if (viloyatId) {
      rows = rows.filter((o) => matchesViloyatFilter(o.shipping_address || '', viloyatId));
    }

    if (!rows.length) {
      return res.status(400).json(createStructuredError('NO_ORDERS_TO_CLOSE', 'No available orders to close for this courier.'));
    }

    const closeListTx = db.transaction(() => {
      const ins = db
        .prepare(
          `INSERT INTO expeditor_closed_batches (expeditor_user_id, courier_staff_id, viloyat_id, closed_at, status) VALUES (?, ?, ?, datetime('now'), 'pending')`,
        )
        .run(req.user.id, courierStaffId, viloyatId || null);
      const batchId = ins.lastInsertRowid;
      const upd = db.prepare('UPDATE orders SET expeditor_batch_id = ? WHERE id = ?');
      for (const r of rows) upd.run(batchId, r.id);
      return batchId;
    });

    const batchId = closeListTx();

    publishEnterpriseEvent({
      eventType: EVENT_TYPES.EXPEDITOR_LIST_CLOSED,
      module: 'expeditor',
      entityType: 'expeditor_batch',
      entityId: batchId,
      ...actorFromRequest(req),
      newValue: { courier_staff_id: courierStaffId, viloyat_id: viloyatId, order_count: rows.length },
    });

    const batch = db
      .prepare(
        `SELECT id, expeditor_user_id, courier_staff_id, viloyat_id, closed_at, status FROM expeditor_closed_batches WHERE id = ?`,
      )
      .get(batchId);

    res.json({
      batch,
      batch_id: batchId,
      order_ids: rows.map((x) => x.id),
      count: rows.length,
    });
  } catch (e) {
    console.error('[expeditor/close-handoff-list]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to close the list.'));
  }
});

function attachHandoffListOrders(batchRows) {
  for (const b of batchRows) {
    const orders = db
      .prepare(
        `
      SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
             o.courier_id, o.packer_id, o.created_at, COALESCE(o.is_test, 0) AS is_test,
             o.courier_assigned_via, o.status_updated_at, o.expeditor_batch_id
      FROM orders o
      WHERE o.expeditor_batch_id = ?
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) ASC, o.id ASC
    `,
      )
      .all(b.id);
    attachItems(orders);
    b.orders = orders;
    b.orders_count = orders.length;
  }
  return batchRows;
}

/** Plus drawer: yopilgan kunlik listlar (sana/viloyat bo'yicha). */
router.get('/handoff-lists', requireRole('expeditor'), validateRegionAccess, (req, res) => {
  try {
    const courierStaffId = parseInt(String(req.query.courier_staff_id || ''), 10);
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const date = String(req.query.date || '').trim();

    let query = `
      SELECT b.id, b.expeditor_user_id, b.courier_staff_id, b.viloyat_id, b.closed_at, b.status,
             (SELECT COUNT(*) FROM orders o WHERE o.expeditor_batch_id = b.id) AS orders_count,
             sm.full_name AS courier_name
      FROM expeditor_closed_batches b
      LEFT JOIN staff_members sm ON sm.id = b.courier_staff_id
      WHERE 1=1
    `;
    const queryParams = [];

    if (Number.isFinite(courierStaffId) && courierStaffId >= 1) {
      query += ' AND b.courier_staff_id = ?';
      queryParams.push(courierStaffId);
    }
    if (viloyatId) {
      query += ' AND b.viloyat_id = ?';
      queryParams.push(viloyatId);
    }

    query += ' ORDER BY datetime(b.closed_at) DESC, b.id DESC LIMIT 200';

    let batches = db.prepare(query).all(...queryParams);

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      batches = batches.filter((b) => {
        const raw = String(b.closed_at || '').trim();
        if (!raw) return false;
        const d = raw.slice(0, 10);
        return d === date;
      });
    }

    const includeOrders = String(req.query.include_orders || '').trim() === '1';
    if (includeOrders) attachHandoffListOrders(batches);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ batches });
  } catch (e) {
    console.error('[expeditor/handoff-lists]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load lists.'));
  }
});

/** Bitta yopilgan list va ichidagi zakazlar. */
router.get('/handoff-lists/:id', requireRole('expeditor'), validateIdParam, (req, res) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    const workRole = getExpeditorWorkRole(req);
    const userRegionId = String(workRole?.courier_viloyat_id || '').trim();
    const batch = db
      .prepare(
        `SELECT b.id, b.expeditor_user_id, b.courier_staff_id, b.viloyat_id, b.closed_at, b.status,
                sm.full_name AS courier_name
         FROM expeditor_closed_batches b
         LEFT JOIN staff_members sm ON sm.id = b.courier_staff_id
         WHERE b.id = ?`,
      )
      .get(batchId);
    if (!batch) return res.status(404).json(createStructuredError('NOT_FOUND', 'List not found.'));
    // Hudud biriktirilmagan (umumiy) ekspeditor uchun cheklov qo'yilmaydi.
    if (userRegionId && (!batchBelongsToRegion(batchId, batch, userRegionId) || !courierBelongsToRegion(batch.courier_staff_id, userRegionId))) {
      return res.status(403).json(createStructuredError('FORBIDDEN', 'Access to this region is denied.'));
    }
    attachHandoffListOrders([batch]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ batch: batch });
  } catch (e) {
    console.error('[expeditor/handoff-lists/:id]', e);
    res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Failed to load the list.'));
  }
});

router.get('/work-role/balance', requireRole('expeditor', 'order_receiver'), (req, res) => {
  const wr = getExpeditorWorkRole(req);
  if (!wr) {
    return res.status(404).json(createStructuredError('NO_WORK_ROLE', 'Financial work role not found.'));
  }
  res.json({ balance: Number(wr.total_amount) || 0 });
});

router.get('/withdrawals', requireRole('expeditor', 'order_receiver'), (req, res) => {
  const wr = getExpeditorWorkRole(req);
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
router.get('/finance', requireRole('expeditor', 'order_receiver'), (req, res) => {
  const wr = getExpeditorWorkRole(req);
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

router.post('/withdrawal', requireRole('expeditor', 'order_receiver'), (req, res) => {
  const wr = getExpeditorWorkRole(req);
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
    console.error('[expeditor/withdrawal]', e);
    return res.status(500).json(createStructuredError('INTERNAL_SERVER_ERROR', 'Server error during withdrawal.'));
  }
});

router.get('/notifications', requireRole('expeditor', 'order_receiver'), (req, res) => {
  const list = db
    .prepare(
      `
    SELECT id, title, body, created_at, read_at
    FROM user_notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `,
    )
    .all(req.user.id);
  res.json({ notifications: list });
});

router.patch('/notifications/:id/read', requireRole('expeditor', 'order_receiver'), validateIdParam, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);
  res.json({ ok: true });
});

export default router;
