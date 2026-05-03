import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  getViloyatEntryById,
  matchesViloyatFilter,
  orderMatchesViloyatEntry,
  classifyShippingAddressViloyatId,
} from '../utils/viloyatPacker.js';
import { getWorkRoleByUserPortalRole, createPendingWithdrawalForWorkRole } from '../lib/staffWithdrawalFlow.js';

const router = Router();
router.use(authRequired, requireRole('expeditor', 'order_receiver'));

const HANDOFF_STATUSES = ['assigned', 'picked_up', 'on_the_way'];
const HANDOFF_STATUSES_FULL = ['assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled'];

function getExpeditorWorkRole(req) {
  let wr = getWorkRoleByUserPortalRole(req.user, 'expeditor');
  if (!wr) wr = getWorkRoleByUserPortalRole(req.user, 'order_receiver');
  return wr;
}

const HANDOFF_VIA_SQL = `(
  o.courier_assigned_via IS NULL OR trim(COALESCE(o.courier_assigned_via,'')) = '' OR o.courier_assigned_via = 'expeditor'
)`;

function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db
    .prepare(
      `
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url, COALESCE(oi.home_left_in_courier, 0) AS home_left_in_courier
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `,
    )
    .all(order.id);
  return order;
}

function attachItems(rows, options = {}) {
  const markedOnly = options.markedOnly === true;
  for (const o of rows) {
    o.items = db
      .prepare(
        `
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url, COALESCE(oi.home_left_in_courier, 0) AS home_left_in_courier
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
        ${markedOnly ? 'AND COALESCE(oi.home_left_in_courier, 0) = 1' : ''}
    `,
      )
      .all(o.id);
  }
  return rows;
}

/** Kelajakdagi ekspeditor API — hozircha faqat autentifikatsiya tekshiruvi */
router.get('/ping', (_req, res) => {
  res.json({ ok: true });
});

/**
 * Tanlov: faol kuryerlar + bog‘langan sklad viloyati (regions.name).
 * ?viloyat_id=andijon — faqat shu hududga mos `region_name` bo‘yicha.
 */
router.get('/couriers', (req, res) => {
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
    console.error(e);
    res.status(500).json({ error: 'Kuryerlar yuklanmadi.' });
  }
});

/** Qadoqlangan, hali kuryerga berilmagan zakazlar (ekspeditor skaneri kutadi) */
router.get('/orders/pending-packaged', (req, res) => {
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
    console.error(e);
    res.status(500).json({ error: 'Buyurtmalar yuklanmadi.' });
  }
});

/** Kutilayotgan qadoqlangan zakazlar — viloyatlar bo‘yicha son (test / obzor). */
router.get('/orders/pending-packaged-summary', (_req, res) => {
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
    console.error(e);
    res.status(500).json({ error: 'Yig‘ilmadi.' });
  }
});

/**
 * Kuryer ilovasida "uyda qoldi" deb belgilangan mahsulotlar bo'lgan zakazlar.
 * Qabul qiluvchi/ekspeditor: viloyat + kuryer tanlangach ro'yxat.
 */
router.get('/orders/courier-cancelled-unsold', (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const courierStaffId = parseInt(String(req.query.courier_staff_id || ''), 10);
    if (!Number.isFinite(courierStaffId) || courierStaffId < 1) {
      return res.status(400).json({ error: 'courier_staff_id kerak.' });
    }

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
    console.error(e);
    res.status(500).json({ error: 'Buyurtmalar yuklanmadi.' });
  }
});

/** Tanlangan kuryer — qadoqlovchidan chiqqan, kuryer uchun yo‘ldagi zakazlar */
router.get('/orders/courier-handoff', (req, res) => {
  try {
    const viloyatId = String(req.query.viloyat_id || '').trim();
    const courierStaffId = parseInt(String(req.query.courier_staff_id || ''), 10);
    if (!Number.isFinite(courierStaffId) || courierStaffId < 1) {
      return res.status(400).json({ error: 'courier_staff_id kerak.' });
    }

    const full = String(req.query.full || '').trim() === '1';
    const statusList = full ? HANDOFF_STATUSES_FULL : HANDOFF_STATUSES;
    const placeholders = statusList.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
      SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
             o.courier_id, o.packer_id, o.created_at, COALESCE(o.is_test, 0) AS is_test,
             o.courier_assigned_via, o.status_updated_at
      FROM orders o
      WHERE o.courier_id = ? AND o.status IN (${placeholders}) AND ${HANDOFF_VIA_SQL}
      ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
      LIMIT 500
    `,
      )
      .all(courierStaffId, ...statusList);

    const filtered = viloyatId
      ? rows.filter((o) => matchesViloyatFilter(o.shipping_address || '', viloyatId))
      : rows;

    attachItems(filtered);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: filtered });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Buyurtmalar yuklanmadi.' });
  }
});

/** Skaner: zakazni tanlangan kuryerga biriktirish (courier «take» bilan bir xil) */
router.post('/orders/:id/assign-courier', (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const courierStaffId = parseInt(String(req.body?.courier_staff_id ?? ''), 10);
    if (!Number.isFinite(orderId) || orderId < 1) {
      return res.status(400).json({ error: 'Noto‘g‘ri buyurtma ID.' });
    }
    if (!Number.isFinite(courierStaffId) || courierStaffId < 1) {
      return res.status(400).json({ error: 'Kuryer tanlanmagan.' });
    }

    const courier = db
      .prepare(
        `SELECT id, staff_type, status, COALESCE(balance, 0) AS balance FROM staff_members WHERE id = ? AND staff_type = 'courier'`,
      )
      .get(courierStaffId);
    if (!courier) return res.status(404).json({ error: 'Kuryer topilmadi.' });
    const st = String(courier.status || '').trim().toLowerCase();
    if (st === 'blocked' || st === 'churn') {
      return res.status(400).json({ error: 'Bu kuryer bloklangan.' });
    }
    if (Number(courier.balance) < 0) {
      return res.status(400).json({
        error: 'Kuryer balansi manfiy. Balans to‘languncha zakaz biriktirish mumkin emas.',
      });
    }

    const order = db
      .prepare(`SELECT id, courier_id, status, shipping_address, COALESCE(total_amount, 0) AS total_amount FROM orders WHERE id = ?`)
      .get(orderId);
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    if (order.courier_id) {
      const sameCourier = Number(order.courier_id) === courierStaffId;
      return res.status(400).json({
        code: 'order_already_assigned',
        error: sameCourier
          ? 'Siz allaqachon ushbu buyurtmani skanerlagansiz.'
          : 'Bu buyurtma boshqa kuryerga biriktirilgan.',
      });
    }
    if (String(order.status) !== 'packaged') {
      return res.status(400).json({ error: 'Faqat qadoqlangan buyurtmani berish mumkin.' });
    }

    db.prepare(
      `UPDATE orders SET courier_id = ?, status = ?, courier_assigned_via = 'expeditor', status_updated_at = datetime('now') WHERE id = ?`,
    ).run(courierStaffId, 'assigned', orderId);
    db.prepare('UPDATE staff_members SET orders_handled = orders_handled + 1 WHERE id = ?').run(courierStaffId);
    db.prepare('UPDATE staff_members SET balance = COALESCE(balance, 0) + ? WHERE id = ?').run(
      Number(order.total_amount) || 0,
      courierStaffId,
    );

    const updated = orderWithItems(orderId);
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Biriktirishda xatolik.' });
  }
});

/** Adashganda: kuryer zakazini yana qadoqlangan navbatga qaytarish */
router.post('/orders/:id/unassign-courier', (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const courierStaffId = parseInt(String(req.body?.courier_staff_id ?? ''), 10);
    if (!Number.isFinite(orderId) || orderId < 1) {
      return res.status(400).json({ error: 'Noto‘g‘ri buyurtma ID.' });
    }
    if (!Number.isFinite(courierStaffId) || courierStaffId < 1) {
      return res.status(400).json({ error: 'Kuryer tanlanmagan.' });
    }

    const order = db
      .prepare(`SELECT id, courier_id, status, COALESCE(total_amount, 0) AS total_amount FROM orders WHERE id = ?`)
      .get(orderId);
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
    if (Number(order.courier_id) !== courierStaffId) {
      return res.status(400).json({ error: 'Bu buyurtma tanlangan kuryerga tegishli emas.' });
    }
    const st = String(order.status || '');
    if (!HANDOFF_STATUSES.includes(st)) {
      return res.status(400).json({ error: 'Bu holatdagi buyurtmani qaytarib bo‘lmaydi.' });
    }

    db.prepare(
      `UPDATE orders SET courier_id = NULL, status = ?, courier_assigned_via = NULL, status_updated_at = datetime('now') WHERE id = ?`,
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

    const updated = orderWithItems(orderId);
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Qaytarishda xatolik.' });
  }
});

router.get('/work-role/balance', (req, res) => {
  const wr = getExpeditorWorkRole(req);
  if (!wr) {
    return res.status(404).json({
      error:
        'Moliya uchun ishchi rol topilmadi. Administrator ekspeditor yoki zakaz qabul ish ro\'yi bilatingan login/email yarating.',
      code: 'no_work_role',
    });
  }
  res.json({ balance: Number(wr.total_amount) || 0 });
});

router.get('/withdrawals', (req, res) => {
  const wr = getExpeditorWorkRole(req);
  if (!wr) return res.status(403).json({ error: 'Ishchi rol topilmadi.', withdrawals: [] });
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

router.post('/withdrawal', (req, res) => {
  const wr = getExpeditorWorkRole(req);
  if (!wr) return res.status(403).json({ error: 'Ishchi rol topilmadi.', code: 'no_work_role' });
  try {
    const payoutRaw = String(req.body?.payout_method || 'cash').trim().toLowerCase();
    const payoutMethod = payoutRaw === 'card' ? 'card' : 'cash';
    const out = createPendingWithdrawalForWorkRole({ workRoleRow: wr, amount: req.body?.amount, payoutMethod });
    return res.status(201).json({ ok: true, message: out.message });
  } catch (e) {
    const code = String(e.message || '');
    if (code === 'INVALID_AMOUNT') return res.status(400).json({ error: 'Yaroqli summa kiriting.' });
    if (code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: "Hisobda yetarli mablag' yo'q." });
    console.error('[expeditor/withdrawal]', e);
    return res.status(500).json({ error: 'Server xatosi.' });
  }
});

export default router;
