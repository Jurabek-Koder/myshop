import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
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

const router = Router();
router.use(authRequired, requireRole('courier'));

const COURIER_STATUSES = ['pending', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled', 'blocked'];

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

function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT ${ORDER_ITEM_COLUMNS}
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(order.id);
  return order;
}

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

router.get('/profile', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });
  const u = db
    .prepare('SELECT id, full_name, last_name, phone, avatar_url, role, email, login FROM users WHERE id = ?')
    .get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
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

router.patch('/profile', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

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

  if (!fullName) return res.status(400).json({ error: "Ism bo'sh bo'lmasin." });

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
    return res.status(500).json({ error: 'Saqlashda xatolik.' });
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

router.get('/orders', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

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
      (o.courier_id = ? AND o.status = 'assigned' AND ${EXPEDITOR_VIA_SQL})
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
  for (const o of orders) {
    o.items = db.prepare(`
      SELECT ${ORDER_ITEM_COLUMNS}
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
    o.courier_fee = feePerOrder;
    o.is_test = Number(o.is_test) === 1 ? 1 : 0;
  }

  let packer_closed_batches = [];
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

router.post('/orders/:id/take', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });

  const order = db.prepare('SELECT id, courier_id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id) return res.status(400).json({ error: 'Bu buyurtma allaqachon boshqa kuryerga berilgan.' });
  if (order.status !== 'packaged') return res.status(400).json({ error: 'Faqat qadoqlangan buyurtmalarni olish mumkin.' });

  db.prepare(
    `UPDATE orders SET courier_id = ?, status = ?, courier_assigned_via = 'courier_take', status_updated_at = datetime('now') WHERE id = ?`,
  ).run(courier.id, 'assigned', orderId);
  db.prepare('UPDATE staff_members SET orders_handled = orders_handled + 1 WHERE id = ?').run(courier.id);

  const updated = orderWithItems(orderId);
  res.json(updated);
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

router.patch('/orders/:id/status', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  const orderId = parseInt(req.params.id, 10);
  const { status, unsold, courier_unsold_return } = req.body;

  if (isNaN(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });
  if (!status || !COURIER_STATUSES.includes(String(status))) {
    return res.status(400).json({ error: `Status quyidagilardan biri bo\'lishi kerak: ${COURIER_STATUSES.join(', ')}` });
  }

  const order = db.prepare('SELECT id, courier_id FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id !== courier.id) return res.status(403).json({ error: 'Bu buyurtma sizga tegishli emas.' });

  if (String(status) === 'delivered') {
    recordOperatorEarnings(orderId);
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
  res.json(updated);
});

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

  if (!Number.isFinite(orderId) || orderId < 1) return res.status(400).json({ error: "Noto'g'ri buyurtma ID." });
  if (!Number.isFinite(itemId) || itemId < 1) return res.status(400).json({ error: "Noto'g'ri mahsulot qatori ID." });

  const order = db.prepare('SELECT id, courier_id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id !== courier.id) return res.status(403).json({ error: 'Bu buyurtma sizga tegishli emas.' });
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

/** Faqat is_test=1: kuryer buyurtmani yana «yangi» oynasiga qaytaradi (packaged, courier_id=null). */
router.post('/orders/:id/return-test', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });

  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });

  const order = db.prepare('SELECT id, courier_id, status, is_test FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id !== courier.id) return res.status(403).json({ error: 'Bu buyurtma sizga tegishli emas.' });
  if (Number(order.is_test) !== 1) {
    return res.status(400).json({ error: 'Faqat test buyurtmani qaytarish mumkin.' });
  }
  const allowedReturn = ['assigned', 'picked_up', 'on_the_way'];
  if (!allowedReturn.includes(String(order.status))) {
    return res.status(400).json({ error: 'Bu holatda test buyurtmani qaytarib bo\'lmaydi.' });
  }

  db.prepare(
    `UPDATE orders SET status = ?, courier_id = ?, packer_batch_id = ?, courier_assigned_via = NULL, status_updated_at = datetime('now') WHERE id = ?`,
  ).run('packaged', null, null, orderId);

  const updated = orderWithItems(orderId);
  res.json(updated);
});

/** Kuryer biriktirilgan buyurtmalar — mijoz bilan suhbat ro‘yxati (matnli chat keyinroq) */
router.get('/customer-chat-orders', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });
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
router.post('/call-logs', (req, res) => {
  const courier = getCourierByUser(req.user);
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });
  const orderId = parseInt(req.body?.orderId, 10);
  if (!orderId || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });
  const order = db.prepare('SELECT id, courier_id FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (order.courier_id !== courier.id) return res.status(403).json({ error: 'Bu buyurtma sizga tegishli emas.' });
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
  if (!courier) return res.status(404).json({ error: 'Kuryer profilingiz topilmadi.' });
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

router.get('/work-role/balance', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
  if (!wr) {
    return res.status(404).json({
      error: 'Moliya uchun ishchi rol topilmadi. Administrator portalda siz uchun kuryer ish ro\'yi yarating.',
      code: 'no_work_role',
    });
  }
  res.json({ balance: Number(wr.total_amount) || 0 });
});

router.get('/withdrawals', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
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
  const wr = getWorkRoleByUserPortalRole(req.user, 'courier');
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
    console.error('[courier/withdrawal]', e);
    return res.status(500).json({ error: 'Server xatosi.' });
  }
});

/** Sklad Lichka / MyShop DM — picker bilan bir xil ma’lumotlar */
router.get('/sklad-peers', getSkladPeers);
router.get('/dm/messages', getDmMessages);
router.get('/dm/stories', getDmStories);
router.get('/dm/call-logs', getDmCallLogs);
router.post('/dm/call-logs', postDmCallLog);
router.post('/dm/send', postDmSend);
router.post('/chat/presence', postChatPresence);
router.get('/chat/presence', getChatPresence);

export default router;
