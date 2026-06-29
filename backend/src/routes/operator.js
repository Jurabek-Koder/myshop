import { Router } from 'express';
import bcrypt from 'bcryptjs';
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
import { getActiveStaffRoleDisplay } from '../lib/workRoleArchive.js';
import {
  buildWorkRoleFinancePayload,
  fetchOperatorEarnings,
  buildOperatorEarningTransactions,
} from '../services/workRoleTransactionService.js';
import { enqueueAiCallForPendingOrder } from '../modules/operator/call-operator.service.js';
import { EVENT_TYPES } from '../events/eventTypes.js';
import { actorFromRequest, publishEnterpriseEvent } from '../events/publishEvent.js';

const router = Router();
router.use(authRequired, requireRole('operator'));

function isOnPromotion(product) {
  const discount = Number(product?.discount_percent) || 0;
  if (discount <= 0) return false;
  const endsAt = product?.promotion_ends_at;
  if (!endsAt) return true;
  const end = new Date(String(endsAt).replace(' ', 'T'));
  return !Number.isNaN(end.getTime()) && end > new Date();
}

function addSalePrice(product) {
  const p = { ...product };
  if (isOnPromotion(p)) {
    const discount = Number(p.discount_percent) || 0;
    p.sale_price = Math.round((Number(p.price) || 0) * (1 - discount / 100));
  }
  return p;
}

function promoteScheduledProducts() {
  try {
    db.prepare(`
      UPDATE products
      SET status = 'active', goes_live_at = NULL
      WHERE lower(trim(coalesce(status, ''))) = 'scheduled'
        AND goes_live_at IS NOT NULL
        AND datetime(substr(replace(replace(trim(goes_live_at), 'T', ' '), 'Z', ''), 1, 19)) <= datetime('now')
    `).run();
  } catch (_) {}
}

function normalizeProductImageUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (s.startsWith('http') || s.startsWith('data:') || s.startsWith('/')) return s;
  return `/uploads/${s.replace(/^\/+/, '')}`;
}

function splitAddressAndNote(shippingAddress, notesFallback) {
  const raw = String(shippingAddress || '').trim();
  let address = raw;
  let customer_note = String(notesFallback || '').trim() || null;
  const separatorMatch = raw.match(/\.\s*(Sharh|Izoh):\s*/i);
  if (separatorMatch) {
    address = raw.slice(0, separatorMatch.index).trim() || null;
    if (!customer_note) {
      customer_note = raw.slice(separatorMatch.index + separatorMatch[0].length).trim() || null;
    }
  }
  return {
    shipping_address: address || null,
    customer_note,
  };
}

function mapHomeProductLeadRow(row, productFallback) {
  const { shipping_address, customer_note } = splitAddressAndNote(
    row.shipping_address || row.order_shipping_address,
    row.notes,
  );
  return {
    row_type: 'lead',
    lead_id: Number(row.id),
    order_id: row.order_id != null ? Number(row.order_id) : null,
    product_id: Number(row.product_id),
    product_name: String(row.product_name || productFallback?.name_uz || '').trim(),
    product_image_url: normalizeProductImageUrl(row.product_image_url || productFallback?.image_url),
    quantity: Number(row.quantity) || 1,
    shipping_address,
    customer_phone: String(row.contact_phone || row.contact_email || '').trim() || null,
    customer_name: String(row.full_name || '').trim() || null,
    customer_note,
    status: String(row.status || '').trim(),
    created_at: row.created_at,
  };
}

function mapHomeProductOrderRow(row, productFallback) {
  const { shipping_address, customer_note } = splitAddressAndNote(row.shipping_address, null);
  return {
    row_type: 'order',
    lead_id: row.lead_id != null ? Number(row.lead_id) : null,
    order_id: Number(row.order_id),
    product_id: Number(row.product_id || productFallback?.id),
    product_name: String(row.product_name || productFallback?.name_uz || '').trim(),
    product_image_url: normalizeProductImageUrl(row.product_image_url || productFallback?.image_url),
    quantity: Number(row.quantity) || 1,
    shipping_address,
    customer_phone: String(row.contact_phone || row.customer_phone || '').trim() || null,
    customer_name: String(row.customer_name || '').trim() || null,
    customer_note,
    status: String(row.status || '').trim(),
    created_at: row.created_at,
  };
}

function loadHomeProductOrderCounts() {
  const rows = db
    .prepare(
      `SELECT product_id, COUNT(*) AS order_count FROM (
         SELECT l.product_id
         FROM product_leads l
         WHERE lower(trim(coalesce(l.status, ''))) = 'pending'
         UNION ALL
         SELECT oi.product_id
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         WHERE lower(trim(coalesce(o.status, ''))) = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM product_leads pl
             WHERE pl.order_id = o.id
               AND lower(trim(coalesce(pl.status, ''))) IN ('contacted', 'ordered')
           )
         UNION ALL
         SELECT l.product_id
         FROM product_leads l
         WHERE lower(trim(coalesce(l.status, ''))) IN ('contacted', 'ordered')
         UNION ALL
         SELECT oi.product_id
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         INNER JOIN product_leads pl ON pl.order_id = o.id
           AND lower(trim(coalesce(pl.status, ''))) IN ('contacted', 'ordered')
         WHERE lower(trim(coalesce(o.status, ''))) NOT IN ('cancelled', 'archived')
       ) GROUP BY product_id`,
    )
    .all();
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.product_id), Number(row.order_count) || 0);
  }
  return map;
}

function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(order.id);
  return order;
}

function listPendingOrdersForOperator() {
  const orders = db.prepare(`
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at
    FROM orders o
    WHERE lower(trim(coalesce(o.status, ''))) = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM product_leads pl
        WHERE pl.order_id = o.id
          AND pl.status IN ('contacted', 'ordered')
      )
    ORDER BY datetime(o.created_at) DESC
    LIMIT 200
  `).all();

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
    for (const item of o.items) {
      item.image_url = normalizeProductImageUrl(item.image_url);
    }
    const u = db.prepare('SELECT full_name, email, phone FROM users WHERE id = ?').get(o.user_id);
    if (u) {
      o.customer_name = u.full_name || null;
      o.customer_email = u.email || null;
      o.customer_phone = u.phone || null;
    }
  }
  return orders;
}

function createOrderFromLead({ lead, operatorId, quantity, shipping_address, contact_phone, contact_email, isTest = 0 }) {
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  if (lead.stock < qty) throw new Error('STOCK');

  const phone = (contact_phone || lead.contact_phone || '').trim() || null;
  const email = (contact_email || lead.contact_email || '').trim() || null;
  const address = (shipping_address || lead.shipping_address || '').trim() || null;
  if (!phone && !email) throw new Error('CONTACT');

  const customerRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('customer')?.id || 2;
  const defaultPassword = bcrypt.hashSync('Customer123!', 12);
  const defaultPasswordPlain = 'Customer123!';

  const tx = db.transaction(() => {
    let user = null;
    if (email) user = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
    if (!user && email) {
      const login = uniqueLogin(email);
      const em = email.includes('@') ? email : `${login}@customer.myshop.local`;
      const ur = db.prepare(`
        INSERT INTO users (email, login, password_hash, password_plain, full_name, role, role_id)
        VALUES (?, ?, ?, ?, ?, 'customer', ?)
      `).run(em, login, defaultPassword, defaultPasswordPlain, lead.full_name || 'Mijoz', customerRoleId);
      user = { id: ur.lastInsertRowid };
    }
    if (!user) {
      const login = uniqueLogin(phone || email || `lead${lead.id}`);
      const em = (email && email.includes('@')) ? email : `${login}@customer.myshop.local`;
      const ur = db.prepare(`
        INSERT INTO users (email, login, password_hash, password_plain, full_name, role, role_id)
        VALUES (?, ?, ?, ?, ?, 'customer', ?)
      `).run(em, login, defaultPassword, defaultPasswordPlain, lead.full_name || 'Mijoz', customerRoleId);
      user = { id: ur.lastInsertRowid };
    }

    const userId = user?.id;
    if (!userId) throw new Error('USER');

    const total = lead.price * qty;
    const orderRes = db.prepare(`
      INSERT INTO orders (
        user_id, status, total_amount, currency, shipping_address, contact_phone, is_test,
        order_ip, order_user_agent, order_device, order_location
      )
      VALUES (?, 'pending', ?, 'UZS', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      total,
      address,
      phone || email,
      isTest,
      null,
      'operator-panel',
      'Operator panel',
      null,
    );

    const orderId = orderRes.lastInsertRowid;
    db.prepare(`
      INSERT INTO user_device_events (user_id, event_type, ip, user_agent, device, location, order_id)
      VALUES (?, 'order_operator', ?, ?, ?, ?, ?)
    `).run(userId, null, 'operator-panel', 'Operator panel', null, orderId);
    db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price_at_order) VALUES (?, ?, ?, ?)')
      .run(orderId, lead.product_id, qty, lead.price);
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, lead.product_id);
    db.prepare('UPDATE product_leads SET status = ?, order_id = ?, operator_id = ? WHERE id = ?')
      .run('ordered', orderId, operatorId, lead.id);

    return orderWithItems(orderId);
  });

  const order = tx();
  publishEnterpriseEvent({
    eventType: EVENT_TYPES.ORDER_CONFIRMED,
    module: 'operator',
    entityType: 'order',
    entityId: order?.id,
    userId: operatorId,
    newValue: {
      order_id: order?.id,
      lead_id: lead.id,
      operator_id: operatorId,
      status: 'pending',
      total_amount: order?.total_amount,
      product_id: lead.product_id,
      quantity: qty,
    },
  });
  publishEnterpriseEvent({
    eventType: EVENT_TYPES.LEAD_CONVERTED,
    module: 'operator',
    entityType: 'lead',
    entityId: lead.id,
    userId: operatorId,
    oldValue: { status: lead.status },
    newValue: { status: 'ordered', order_id: order?.id },
  });
  return order;
}

function uniqueLogin(seed, excludeUserId = null) {
  const base = String(seed || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30) || 'user';
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = excludeUserId == null
      ? db.prepare('SELECT id FROM users WHERE lower(login) = lower(?)').get(candidate)
      : db.prepare('SELECT id FROM users WHERE lower(login) = lower(?) AND id != ?').get(candidate, excludeUserId);
    if (!existing) return candidate;
    candidate = `${base.slice(0, 25)}${suffix++}`;
  }
}

router.get('/orders', (req, res) => {
  const filter = req.query.filter || 'packaged';
  const operatorId = req.user.id;

  let statusSql;
  if (filter === 'picker') {
    // Operator tasdiqlagan, hali omborda yig'ilayotgan zakazlar
    statusSql = "o.status IN ('pending', 'hold')";
  } else if (filter === 'packer') {
    // Picker yig'ib packerga o'tkazgan yoki qadoqlangan, lekin kuryerga biriktirilmagan
    statusSql = "o.status IN ('picked', 'packaged')";
  } else if (filter === 'courier') {
    statusSql = "o.status IN ('assigned', 'picked_up', 'on_the_way')";
  } else if (filter === 'delivered') {
    statusSql = "o.status = 'delivered'";
  } else if (filter === 'cancelled') {
    statusSql = "o.status = 'cancelled'";
  } else if (filter === 'returned') {
    statusSql = "o.status = 'left_at_home'";
  } else {
    statusSql = "o.status = 'packaged'";
  }

  const orders = db.prepare(`
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone,
           o.created_at, o.packer_id, o.courier_id, o.status_updated_at
    FROM orders o
    INNER JOIN product_leads pl ON pl.order_id = o.id AND pl.operator_id = ?
    WHERE ${statusSql}
    ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
    LIMIT 100
  `).all(operatorId);

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.image_url
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
    const lead = db.prepare(`
      SELECT id, product_id, full_name, contact_phone, operator_id, status
      FROM product_leads WHERE order_id = ?
    `).get(o.id);
    if (lead) o.lead = lead;
    if (o.packer_id) {
      const p = getActiveStaffRoleDisplay(o.packer_id);
      if (p) o.packer = p;
    }
    if (o.courier_id) {
      const c = getActiveStaffRoleDisplay(o.courier_id);
      if (c) o.courier = c;
    }
  }

  res.json({ orders });
});

/**
 * Operator shaxsiy statistikasi.
 * Barcha hisob-kitoblar faqat shu operatorga tegishli leadlar/zakazlar bo'yicha.
 * Kun chegaralari O'zbekiston vaqti (UTC+5) bo'yicha olinadi.
 * ?date=YYYY-MM-DD berilsa, asosiy bloklar faqat shu kun bo'yicha hisoblanadi.
 */
router.get('/stats', (req, res) => {
  const operatorId = req.user.id;
  const TZ = '+5 hours';

  const rawDate = String(req.query.date || '').trim();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  const leadDayFilter = selectedDate ? ' AND date(created_at, ?) = ?' : '';
  const orderDayFilter = selectedDate ? ' AND date(o.created_at, ?) = ?' : '';

  // Lead statuslari bo'yicha taqsimot (kun tanlangan bo'lsa — faqat shu kunda yaratilganlar)
  const leadRows = db.prepare(`
    SELECT lower(trim(coalesce(status, ''))) AS status, COUNT(*) AS c
    FROM product_leads
    WHERE operator_id = ?${leadDayFilter}
    GROUP BY lower(trim(coalesce(status, '')))
  `).all(...(selectedDate ? [operatorId, TZ, selectedDate] : [operatorId]));
  const leadByStatus = {};
  for (const r of leadRows) leadByStatus[r.status] = Number(r.c) || 0;

  const totalLeads = leadRows.reduce((s, r) => s + (Number(r.c) || 0), 0);
  const confirmedLeads = leadByStatus.ordered || 0;
  const unconfirmedLeads = Math.max(totalLeads - confirmedLeads, 0);
  const newLeads = (leadByStatus.pending || 0) + (leadByStatus.contacted || 0);

  // Operator zakazlari (lead orqali bog'langan) statuslar bo'yicha
  const orderRows = db.prepare(`
    SELECT lower(trim(coalesce(o.status, ''))) AS status, COUNT(DISTINCT o.id) AS c
    FROM orders o
    JOIN product_leads pl ON pl.order_id = o.id
    WHERE pl.operator_id = ?${orderDayFilter}
    GROUP BY lower(trim(coalesce(o.status, '')))
  `).all(...(selectedDate ? [operatorId, TZ, selectedDate] : [operatorId]));
  const orderByStatus = {};
  for (const r of orderRows) orderByStatus[r.status] = Number(r.c) || 0;
  const oc = (key) => orderByStatus[key] || 0;

  const sentToPacker = oc('pending') + oc('picked') + oc('hold');
  const packagedCum = oc('packaged') + oc('assigned') + oc('picked_up') + oc('on_the_way') + oc('delivered') + oc('left_at_home');
  const withCourier = oc('assigned');
  const onTheWay = oc('picked_up') + oc('on_the_way');
  const delivered = oc('delivered');
  const returned = oc('left_at_home');
  const cancelledOrders = oc('cancelled');

  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

  const packerTotal = sentToPacker + packagedCum;
  const courierTotal = withCourier + onTheWay + delivered + returned;

  // Kun natijalari: tanlangan kun yoki bugun (Toshkent kuni bo'yicha)
  const targetDay = selectedDate || db.prepare(`SELECT date('now', ?) AS d`).get(TZ)?.d;

  const todayAccepted = db.prepare(`
    SELECT COUNT(*) AS c FROM product_leads
    WHERE operator_id = ? AND date(created_at, ?) = ?
  `).get(operatorId, TZ, targetDay)?.c || 0;

  const todayConfirmed = db.prepare(`
    SELECT COUNT(DISTINCT o.id) AS c
    FROM orders o
    JOIN product_leads pl ON pl.order_id = o.id
    WHERE pl.operator_id = ? AND date(o.created_at, ?) = ?
  `).get(operatorId, TZ, targetDay)?.c || 0;

  const todayCancelled = db.prepare(`
    SELECT COUNT(DISTINCT o.id) AS c
    FROM orders o
    JOIN product_leads pl ON pl.order_id = o.id
    WHERE pl.operator_id = ? AND o.status = 'cancelled'
      AND date(COALESCE(o.status_updated_at, o.created_at), ?) = ?
  `).get(operatorId, TZ, targetDay)?.c || 0;

  // Oxirgi 30 kunlik dinamika
  const confirmedDailyRows = db.prepare(`
    SELECT date(o.created_at, ?) AS d, COUNT(DISTINCT o.id) AS c
    FROM orders o
    JOIN product_leads pl ON pl.order_id = o.id
    WHERE pl.operator_id = ? AND datetime(o.created_at) >= datetime('now', '-30 days')
    GROUP BY date(o.created_at, ?)
  `).all(TZ, operatorId, TZ);

  const cancelledDailyRows = db.prepare(`
    SELECT date(COALESCE(o.status_updated_at, o.created_at), ?) AS d, COUNT(DISTINCT o.id) AS c
    FROM orders o
    JOIN product_leads pl ON pl.order_id = o.id
    WHERE pl.operator_id = ? AND o.status = 'cancelled'
      AND datetime(COALESCE(o.status_updated_at, o.created_at)) >= datetime('now', '-30 days')
    GROUP BY date(COALESCE(o.status_updated_at, o.created_at), ?)
  `).all(TZ, operatorId, TZ);

  const confirmedByDay = new Map(confirmedDailyRows.map((r) => [r.d, Number(r.c) || 0]));
  const cancelledByDay = new Map(cancelledDailyRows.map((r) => [r.d, Number(r.c) || 0]));

  const daily = [];
  const todayStr = db.prepare(`SELECT date('now', ?) AS d`).get(TZ)?.d;
  const base = new Date(`${todayStr}T00:00:00Z`);
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(base);
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    daily.push({
      date: key,
      confirmed: confirmedByDay.get(key) || 0,
      cancelled: cancelledByDay.get(key) || 0,
    });
  }

  // Samaradorlik ko'rsatkichlari
  let bestDay = null;
  let bestDayCount = 0;
  let confirmedSum30 = 0;
  for (const d of daily) {
    confirmedSum30 += d.confirmed;
    if (d.confirmed > bestDayCount) {
      bestDayCount = d.confirmed;
      bestDay = d.date;
    }
  }
  const activeDays = daily.filter((d) => d.confirmed > 0 || d.cancelled > 0).length;
  const avgDaily = activeDays > 0 ? Math.round((confirmedSum30 / activeDays) * 10) / 10 : 0;

  res.json({
    selected_date: selectedDate,
    totals: {
      total: totalLeads,
      confirmed: confirmedLeads,
      unconfirmed: unconfirmedLeads,
      confirm_rate: pct(confirmedLeads, totalLeads),
      unconfirm_rate: pct(unconfirmedLeads, totalLeads),
    },
    order_status: {
      new: newLeads,
      confirmed: confirmedLeads,
      sent_to_packer: sentToPacker,
      packaged: packagedCum,
      with_courier: withCourier,
      on_the_way: onTheWay,
      delivered,
      returned,
      cancelled: cancelledOrders,
    },
    packer: {
      packaged: packagedCum,
      waiting: sentToPacker,
      rate: pct(packagedCum, packerTotal),
    },
    courier: {
      with_courier: withCourier,
      on_the_way: onTheWay,
      delivered,
      returned,
      rate: pct(delivered, courierTotal),
    },
    today: {
      accepted: Number(todayAccepted) || 0,
      confirmed: Number(todayConfirmed) || 0,
      cancelled: Number(todayCancelled) || 0,
      confirm_rate: pct(Number(todayConfirmed) || 0, Number(todayAccepted) || 0),
    },
    daily,
    performance: {
      best_day: bestDay,
      best_day_confirmed: bestDayCount,
      avg_daily_orders: avgDaily,
      avg_confirm_rate: pct(confirmedLeads, totalLeads),
      avg_delivery_rate: pct(delivered, courierTotal),
    },
  });
});

function getContestActive() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'contest_active'").get();
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

router.get('/contest-results', (req, res) => {
  const period = req.query.period === 'month' ? 'month' : req.query.period === 'week' ? 'week' : 'day';
  const active = getContestActive();
  const periodStart = getPeriodStart(period);

  let topByOrdersCreated = [];
  let topByOrdersDelivered = [];

  if (active) {
    topByOrdersCreated = db.prepare(`
      SELECT pl.operator_id AS id, u.full_name AS name, COUNT(*) AS count
      FROM product_leads pl
      JOIN orders o ON o.id = pl.order_id
      JOIN users u ON u.id = pl.operator_id
      WHERE pl.status = 'ordered' AND pl.operator_id IS NOT NULL AND pl.order_id IS NOT NULL
        AND o.created_at >= ?
      GROUP BY pl.operator_id
      ORDER BY count DESC
      LIMIT 20
    `).all(periodStart);

    topByOrdersDelivered = db.prepare(`
      SELECT oe.operator_id AS id, u.full_name AS name, COUNT(*) AS count
      FROM operator_earnings oe
      JOIN users u ON u.id = oe.operator_id
      WHERE oe.created_at >= ?
      GROUP BY oe.operator_id
      ORDER BY count DESC
      LIMIT 20
    `).all(periodStart);
  }

  res.json({
    active,
    period,
    topByOrdersCreated,
    topByOrdersDelivered,
  });
});

router.get('/notifications', (req, res) => {
  const list = db.prepare(`
    SELECT id, title, body, created_at, read_at, link_type, link_id
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

router.get('/finance', (req, res) => {
  const operatorId = req.user.id;
  const rows = fetchOperatorEarnings(operatorId, 200);
  const soldTotal = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const soldCount = rows.length;

  const wr = getWorkRoleByUserPortalRole(req.user, 'operator');
  if (wr) {
    const payload = buildWorkRoleFinancePayload(wr, { operatorId, earningLimit: 200 });
    return res.json({
      earnings: payload.earnings.length ? payload.earnings : rows,
      total: soldTotal,
      summary: payload.summary,
      fines: payload.fines,
      rewards: payload.rewards,
      transactions: payload.transactions,
      timeline: payload.timeline,
      withdrawals: payload.withdrawals,
    });
  }

  res.json({
    earnings: rows,
    total: soldTotal,
    summary: {
      balance: soldTotal,
      sold_total: soldTotal,
      sold_count: soldCount,
      reward_amount: 0,
      fine_amount: 0,
      fines_count: 0,
      has_work_role: false,
    },
    fines: [],
    rewards: [],
    transactions: buildOperatorEarningTransactions(rows),
    timeline: [],
    withdrawals: [],
  });
});

/** Lead yaratish formasi (mahsulot ro'yxati) */
router.get('/products-for-lead', (req, res) => {
  const products = db.prepare('SELECT id, name_uz FROM products ORDER BY name_uz').all();
  res.json({ products });
});

/** Operator bosh sahifa — faol mahsulotlar ro‘yxati */
router.get('/home-products', (_req, res) => {
  try {
    promoteScheduledProducts();
    const rows = db
      .prepare(
        `SELECT id, name_uz, image_url, price, discount_percent, promotion_ends_at, stock,
                coalesce(warehouse_kirim_qty, 0) AS warehouse_kirim_qty
         FROM products
         WHERE lower(trim(coalesce(status, ''))) IN ('active', '')
           AND (warehouse_deleted_at IS NULL OR trim(coalesce(warehouse_deleted_at, '')) = '')
           AND (
             seller_id IS NULL
             OR warehouse_delisted_at IS NULL
             OR trim(coalesce(warehouse_delisted_at, '')) = ''
           )
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT 500`,
      )
      .all();

    const orderCountByProduct = loadHomeProductOrderCounts();
    const products = rows.map((row) => {
      const remainingStock = Number(row.stock) || 0;
      return addSalePrice({
        ...row,
        stock: remainingStock,
        remaining_stock: remainingStock,
        warehouse_kirim_qty: Number(row.warehouse_kirim_qty) || 0,
        order_count: orderCountByProduct.get(Number(row.id)) || 0,
        image_url: normalizeProductImageUrl(row.image_url),
      });
    });
    res.json({ products });
  } catch (e) {
    console.error('[operator] home-products', e);
    res.status(500).json({ error: 'Mahsulotlar yuklanmadi.' });
  }
});

/** Operator bosh sahifa — mahsulot kartasi ochilganda ombor va zakazlar */
router.get('/home-product/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Mahsulot ID noto'g'ri." });
  }

  const row = db
    .prepare(
      `SELECT id, name_uz, image_url, price, discount_percent, promotion_ends_at, stock,
              coalesce(warehouse_kirim_qty, 0) AS warehouse_kirim_qty,
              warehouse_approved_at, status
       FROM products WHERE id = ?`,
    )
    .get(id);

  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  const st = String(row.status || '').trim().toLowerCase();
  if (st !== 'active' && st !== '') {
    return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  }

  const kirimQty = Number(row.warehouse_kirim_qty) || 0;
  const remainingStock = Number(row.stock) || 0;

  const productFallback = {
    id: row.id,
    name_uz: row.name_uz,
    image_url: normalizeProductImageUrl(row.image_url),
  };

  const unconfirmedLeadRows = db
    .prepare(
      `SELECT l.id, l.product_id, l.full_name, l.contact_phone, l.contact_email, l.status, l.created_at, l.order_id,
              l.notes, l.shipping_address,
              p.name_uz AS product_name, p.image_url AS product_image_url,
              o.shipping_address AS order_shipping_address,
              COALESCE(
                (SELECT oi.quantity FROM order_items oi
                 WHERE oi.order_id = l.order_id AND oi.product_id = l.product_id LIMIT 1),
                1
              ) AS quantity
       FROM product_leads l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN orders o ON o.id = l.order_id
       WHERE l.product_id = ? AND lower(trim(coalesce(l.status, ''))) = 'pending'
       ORDER BY datetime(l.created_at) DESC
       LIMIT 80`,
    )
    .all(id);

  const unconfirmedOrderRows = db
    .prepare(
      `SELECT o.id AS order_id, o.contact_phone, o.status, o.created_at, o.shipping_address,
              oi.quantity, oi.product_id,
              p.name_uz AS product_name, p.image_url AS product_image_url,
              u.full_name AS customer_name, u.phone AS customer_phone
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id AND oi.product_id = ?
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE lower(trim(coalesce(o.status, ''))) = 'pending'
         AND NOT EXISTS (
           SELECT 1 FROM product_leads pl
           WHERE pl.order_id = o.id AND lower(trim(coalesce(pl.status, ''))) IN ('contacted', 'ordered')
         )
       ORDER BY datetime(o.created_at) DESC
       LIMIT 80`,
    )
    .all(id);

  const confirmedLeadRows = db
    .prepare(
      `SELECT l.id, l.product_id, l.full_name, l.contact_phone, l.contact_email, l.status, l.created_at, l.order_id,
              l.notes, l.shipping_address,
              p.name_uz AS product_name, p.image_url AS product_image_url,
              o.shipping_address AS order_shipping_address,
              COALESCE(
                (SELECT oi.quantity FROM order_items oi
                 WHERE oi.order_id = l.order_id AND oi.product_id = l.product_id LIMIT 1),
                1
              ) AS quantity
       FROM product_leads l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN orders o ON o.id = l.order_id
       WHERE l.product_id = ?
         AND lower(trim(coalesce(l.status, ''))) IN ('contacted', 'ordered')
       ORDER BY datetime(l.created_at) DESC
       LIMIT 80`,
    )
    .all(id);

  const confirmedOrderRows = db
    .prepare(
      `SELECT o.id AS order_id, o.contact_phone, o.status, o.created_at, o.shipping_address,
              oi.quantity, oi.product_id,
              p.name_uz AS product_name, p.image_url AS product_image_url,
              u.full_name AS customer_name, u.phone AS customer_phone,
              pl.id AS lead_id, pl.status AS lead_status
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id AND oi.product_id = ?
       JOIN products p ON p.id = oi.product_id
       INNER JOIN product_leads pl ON pl.order_id = o.id
         AND lower(trim(coalesce(pl.status, ''))) IN ('contacted', 'ordered')
       LEFT JOIN users u ON u.id = o.user_id
       WHERE lower(trim(coalesce(o.status, ''))) NOT IN ('cancelled', 'archived')
       ORDER BY datetime(o.created_at) DESC
       LIMIT 80`,
    )
    .all(id);

  const unconfirmedItems = [
    ...unconfirmedLeadRows.map((r) => mapHomeProductLeadRow(r, productFallback)),
    ...unconfirmedOrderRows.map((r) => mapHomeProductOrderRow(r, productFallback)),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const confirmedItems = [
    ...confirmedLeadRows.map((r) => mapHomeProductLeadRow(r, productFallback)),
    ...confirmedOrderRows.map((r) => mapHomeProductOrderRow(r, productFallback)),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  res.json({
    product: addSalePrice({
      id: row.id,
      name_uz: row.name_uz,
      image_url: productFallback.image_url,
      price: row.price,
      stock: remainingStock,
    }),
    warehouse: {
      kirim_qty: kirimQty,
      remaining_stock: remainingStock,
    },
    confirmed: {
      count: confirmedItems.length,
      items: confirmedItems,
    },
    unconfirmed: {
      count: unconfirmedItems.length,
      items: unconfirmedItems,
    },
  });
});

router.get('/product-orders', (req, res) => {
  const productId = req.query.product_id ? parseInt(String(req.query.product_id), 10) : null;
  if (!productId || productId < 1) {
    return res.status(400).json({ error: 'Mahsulot ID kerak.' });
  }

  const product = db.prepare('SELECT id, name_uz, image_url, price, category, stock FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  }

  const rows = db.prepare(
    `SELECT o.id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at,
            o.packer_id,
            oi.quantity, oi.price_at_order, u.full_name AS customer_name, u.email AS customer_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     INNER JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.product_id = ?
     ORDER BY datetime(o.created_at) DESC
     LIMIT 200`
  ).all(productId);

  const orders = rows.map((row) => {
    const shippingRaw = String(row.shipping_address || '').trim();
    const parts = shippingRaw.length ? shippingRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    let packer = null;
    if (row.packer_id) {
      packer = getActiveStaffRoleDisplay(row.packer_id);
    }
    return {
      id: row.id,
      status: row.status,
      total_amount: row.total_amount,
      currency: row.currency,
      shipping_address: shippingRaw || null,
      shipping_region: parts[0] || null,
      shipping_city: parts[1] || null,
      shipping_district: parts[2] || null,
      shipping_address_parts: parts,
      contact_phone: row.contact_phone || null,
      customer_name: row.customer_name || null,
      customer_email: row.customer_email || null,
      quantity: Number(row.quantity) || 0,
      price_at_order: Number(row.price_at_order) || 0,
      created_at: row.created_at,
      packer: packer,
    };
  });

  res.json({ product, orders, orders_count: orders.length });
});

/** Operator panelidan yangi lead (saytdagi /api/leads bilan bir xil qoidalar) */
router.post('/leads', (req, res) => {
  const product_id = parseInt(req.body?.product_id, 10);
  const contact_phone = String(req.body?.contact_phone || '').trim() || null;
  const contact_email = String(req.body?.contact_email || '').trim() || null;
  const full_name = String(req.body?.full_name || '').trim() || null;

  const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() || null : null;
  const shipping_address = req.body?.shipping_address !== undefined ? String(req.body.shipping_address).trim() || null : null;

  if (!product_id || product_id < 1) return res.status(400).json({ error: 'Mahsulot tanlang.' });
  if (!contact_phone && !contact_email) return res.status(400).json({ error: 'Telefon yoki elektron pochta kiriting.' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  const result = db.prepare(`
    INSERT INTO product_leads (product_id, contact_phone, contact_email, full_name, status, operator_id, notes, shipping_address)
    VALUES (?, ?, ?, ?, 'contacted', ?, ?, ?)
  `).run(product_id, contact_phone, contact_email, full_name, req.user.id, notes, shipping_address);

  const lead = db
    .prepare(
      `
    SELECT l.*, p.name_uz as product_name, p.price as product_price
    FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
  `
    )
    .get(result.lastInsertRowid);

  publishEnterpriseEvent({
    eventType: EVENT_TYPES.LEAD_CREATED,
    module: 'operator',
    entityType: 'lead',
    entityId: lead?.id,
    ...actorFromRequest(req),
    newValue: lead,
  });

  res.status(201).json({ lead, message: "Lead yaratildi. «Bog'langan» bo'limida tasdiqlang." });
});

router.get('/leads', (req, res) => {
  const status = req.query.status || '';
  const product_id = req.query.product_id ? parseInt(req.query.product_id, 10) : null;
  const today = req.query.today === '1' || req.query.today === 'true';

  let sql = `
    SELECT l.*, p.name_uz as product_name, p.price as product_price, p.image_url as product_image_url
    FROM product_leads l
    JOIN products p ON p.id = l.product_id
    WHERE 1=1
  `;
  const params = [];
  if (status && status !== 'all') {
    if (status === 'contacted') {
      sql += " AND l.status = 'contacted'";
    } else {
      sql += ' AND l.status = ?';
      params.push(status);
    }
  }
  if (today && status === 'pending') {
    sql += " AND date(l.created_at) = date('now', 'localtime')";
  }
  if (product_id && product_id > 0) {
    sql += ' AND l.product_id = ?';
    params.push(product_id);
  }
  sql += ' ORDER BY l.created_at DESC LIMIT 200';

  const leads = db.prepare(sql).all(...params).map((lead) => ({
    ...lead,
    product_image_url: normalizeProductImageUrl(lead.product_image_url),
  }));
  const products = db.prepare('SELECT id, name_uz, image_url FROM products ORDER BY name_uz').all().map((p) => ({
    ...p,
    image_url: normalizeProductImageUrl(p.image_url),
  }));
  const pending_orders = status === 'pending' || status === '' ? listPendingOrdersForOperator() : [];
  res.json({ leads, products, pending_orders });
});

/** Mijoz checkout zakazidan lead (operator tasdiqlagach — «Bog'langan») */
router.post('/orders/:orderId/create-lead', (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri zakaz ID.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Zakaz topilmadi.' });
  if (String(order.status || '').toLowerCase() !== 'pending') {
    return res.status(400).json({ error: 'Faqat yangi (pending) zakazdan lead yaratish mumkin.' });
  }

  const existing = db.prepare(`
    SELECT id FROM product_leads
    WHERE order_id = ? AND status IN ('contacted', 'ordered')
  `).get(orderId);
  if (existing) return res.status(400).json({ error: 'Bu zakaz uchun lead allaqachon yaratilgan.' });

  const item = db.prepare(`
    SELECT oi.product_id, oi.quantity, p.name_uz, p.price
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.id ASC
    LIMIT 1
  `).get(orderId);
  if (!item) return res.status(400).json({ error: 'Zakazda mahsulot yo\'q.' });

  const user = db.prepare('SELECT full_name, email, phone FROM users WHERE id = ?').get(order.user_id);
  const contact_phone = String(req.body?.contact_phone || order.contact_phone || user?.phone || '').trim() || null;
  const contact_email = String(req.body?.contact_email || user?.email || '').trim() || null;
  const full_name = String(req.body?.full_name || user?.full_name || '').trim() || null;

  const shippingRaw = String(order.shipping_address || '').trim();
  let parsedNotes = null;
  const separatorMatch = shippingRaw.match(/\.\s*(Sharh|Izoh):\s*/i);
  if (separatorMatch) {
    parsedNotes = shippingRaw.slice(separatorMatch.index + separatorMatch[0].length).trim() || null;
  }
  if (req.body?.notes !== undefined) {
    parsedNotes = String(req.body.notes || '').trim() || null;
  }
  const shippingAddress = req.body?.shipping_address !== undefined
    ? String(req.body.shipping_address || '').trim() || null
    : splitAddressAndNote(order.shipping_address, null).shipping_address;

  const pendingLead = db.prepare(`
    SELECT id FROM product_leads WHERE order_id = ? AND status = 'pending' LIMIT 1
  `).get(orderId);

  if (pendingLead) {
    db.prepare(`
      UPDATE product_leads
      SET status = 'contacted', operator_id = ?, product_id = ?, contact_phone = ?, contact_email = ?, full_name = ?, notes = COALESCE(?, notes), shipping_address = COALESCE(?, shipping_address)
      WHERE id = ?
    `).run(req.user.id, item.product_id, contact_phone, contact_email, full_name, parsedNotes, shippingAddress, pendingLead.id);
    const lead = db.prepare(`
      SELECT l.*, p.name_uz as product_name, p.price as product_price
      FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
    `).get(pendingLead.id);
    return res.status(201).json({ lead, message: "Lead «Bog'langan» bo'limiga o'tkazildi." });
  }

  const result = db.prepare(`
    INSERT INTO product_leads (product_id, contact_phone, contact_email, full_name, status, operator_id, order_id, notes, shipping_address)
    VALUES (?, ?, ?, ?, 'contacted', ?, ?, ?, ?)
  `).run(item.product_id, contact_phone, contact_email, full_name, req.user.id, orderId, parsedNotes, shippingAddress);

  const lead = db.prepare(`
    SELECT l.*, p.name_uz as product_name, p.price as product_price
    FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ lead, message: "Lead yaratildi. «Bog'langan» bo'limida tasdiqlang." });
});

/** Yangi (pending) checkout zakazini bekor qilish */
router.post('/orders/:orderId/cancel', (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri zakaz ID.' });

  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Zakaz topilmadi.' });
  if (String(order.status || '').toLowerCase() !== 'pending') {
    return res.status(400).json({ error: 'Faqat yangi (pending) zakaz bekor qilinadi.' });
  }

  db.prepare(`
    UPDATE orders SET status = 'cancelled', status_updated_at = datetime('now') WHERE id = ?
  `).run(orderId);

  db.prepare(`
    UPDATE product_leads SET status = 'cancelled'
    WHERE order_id = ? AND lower(trim(coalesce(status, ''))) = 'pending'
  `).run(orderId);

  res.json({ ok: true, message: 'Zakaz bekor qilindi.' });
});

router.get('/leads/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const lead = db.prepare('SELECT * FROM product_leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ error: 'Lead topilmadi.' });

  const product = db.prepare('SELECT id, name_uz, name_ru, description_uz, price, currency, image_url, video_url, category, stock, created_at FROM products WHERE id = ?').get(lead.product_id);
  if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  res.json({ lead: { ...lead, product } });
});

router.patch('/leads/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const lead = db.prepare('SELECT * FROM product_leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ error: 'Lead topilmadi.' });

  const status = req.body?.status != null ? String(req.body.status).trim() : null;
  const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() || null : null;
  const shipping_address = req.body?.shipping_address !== undefined ? String(req.body.shipping_address).trim() || null : null;

  const allowed = ['pending', 'contacted', 'ordered', 'cancelled'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Status noto\'g\'ri.' });

  const updates = [];
  const params = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (shipping_address !== undefined) { updates.push('shipping_address = ?'); params.push(shipping_address); }
  if (status === 'contacted' || status === 'ordered') {
    updates.push('operator_id = ?');
    params.push(req.user.id);
  }
  if (updates.length) {
    params.push(id);
    db.prepare(`UPDATE product_leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const updated = db.prepare(`
    SELECT l.*, p.name_uz as product_name, p.price as product_price
    FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
  `).get(id);
  res.json(updated);
});

router.post('/leads/:id/create-order', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { quantity = 1, shipping_address, contact_phone, contact_email, is_test: isTestBody } = req.body;
  const isTest = isTestBody === true || isTestBody === 1 || String(isTestBody).toLowerCase() === 'true' ? 1 : 0;

  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const lead = db.prepare(`
    SELECT l.*, p.name_uz, p.price, p.stock
    FROM product_leads l JOIN products p ON p.id = l.product_id
    WHERE l.id = ?
  `).get(id);
  if (!lead) return res.status(404).json({ error: 'Lead topilmadi.' });
  if (lead.status === 'ordered' && lead.order_id) return res.status(400).json({ error: 'Bu leaddan allaqachon zakaz yaratilgan.' });

  try {
    const order = createOrderFromLead({
      lead,
      operatorId: req.user.id,
      quantity,
      shipping_address,
      contact_phone,
      contact_email,
      isTest,
    });
    void enqueueAiCallForPendingOrder({ orderId: order?.id, operatorId: req.user.id }).catch(() => {});
    return res.status(201).json({ order, message: 'Zakaz yaratildi. Picker sahifasida ko\'rinadi.' });
  } catch (e) {
    const code = String(e.message || '');
    if (code === 'STOCK') return res.status(400).json({ error: 'Yetarli mahsulot yo\'q.' });
    if (code === 'CONTACT') return res.status(400).json({ error: 'Telefon yoki email kerak.' });
    throw e;
  }
});

/** «Tasdiqlayman» — pickerlarga yuborish */
router.post('/leads/:id/confirm', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const lead = db.prepare(`
    SELECT l.*, p.name_uz, p.price, p.stock
    FROM product_leads l JOIN products p ON p.id = l.product_id
    WHERE l.id = ?
  `).get(id);
  if (!lead) return res.status(404).json({ error: 'Lead topilmadi.' });
  if (lead.status !== 'contacted') return res.status(400).json({ error: 'Faqat «Bog\'langan» leadni tasdiqlash mumkin.' });
  if (lead.status === 'ordered' && lead.order_id) {
    return res.status(400).json({ error: 'Lead allaqachon tasdiqlangan.' });
  }

  if (lead.order_id) {
    const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(lead.order_id);
    if (!order) return res.status(404).json({ error: 'Bog\'langan zakaz topilmadi.' });
    db.prepare('UPDATE product_leads SET status = ?, operator_id = ? WHERE id = ?')
      .run('ordered', req.user.id, id);
    void enqueueAiCallForPendingOrder({ orderId: lead.order_id, operatorId: req.user.id }).catch(() => {});
    const updated = db.prepare(`
      SELECT l.*, p.name_uz as product_name, p.price as product_price
      FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
    `).get(id);
    return res.json({ lead: updated, order: orderWithItems(lead.order_id), message: 'Tasdiqlandi. Pickerlarga yuborildi.' });
  }

  const qty = Math.max(1, parseInt(req.body?.quantity, 10) || 1);
  try {
    const order = createOrderFromLead({
      lead,
      operatorId: req.user.id,
      quantity: qty,
      shipping_address: req.body?.shipping_address,
      contact_phone: req.body?.contact_phone,
      contact_email: req.body?.contact_email,
      isTest: 0,
    });
  void enqueueAiCallForPendingOrder({ orderId: order?.id, operatorId: req.user.id }).catch(() => {});
    const updated = db.prepare(`
      SELECT l.*, p.name_uz as product_name, p.price as product_price
      FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
    `).get(id);
    return res.status(201).json({ lead: updated, order, message: 'Tasdiqlandi. Pickerlarga yuborildi.' });
  } catch (e) {
    const code = String(e.message || '');
    if (code === 'STOCK') return res.status(400).json({ error: 'Yetarli mahsulot yo\'q.' });
    if (code === 'CONTACT') return res.status(400).json({ error: 'Telefon yoki email kerak.' });
    console.error('[operator/leads/confirm]', e);
    return res.status(500).json({ error: 'Tasdiqlashda xatolik.' });
  }
});

router.post('/leads/:id/return', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const lead = db.prepare('SELECT * FROM product_leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ error: 'Lead topilmadi.' });
  if (lead.status !== 'ordered' || !lead.order_id) return res.status(400).json({ error: 'Faqat zakaz qilingan leadni qaytarish mumkin.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(lead.order_id);
  if (!order) {
    db.prepare('UPDATE product_leads SET status = ?, order_id = ? WHERE id = ?').run('contacted', null, id);
    return res.json({ message: 'Lead avvalgi holatiga qaytarildi.' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('cancelled', lead.order_id);
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(lead.order_id);
    for (const it of items) {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.quantity, it.product_id);
    }
    db.prepare('UPDATE product_leads SET status = ?, order_id = ? WHERE id = ?').run('contacted', null, id);
  });
  tx();

  const updated = db.prepare(`
    SELECT l.*, p.name_uz as product_name, p.price as product_price
    FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
  `).get(id);
  res.json({ lead: updated, message: 'Zakaz bekor qilindi, lead avvalgi holatiga (Bog\'langan) qaytarildi.' });
});

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

/** Profil (MyShop chat avatar / sozlamalar) — users jadvalida */
router.get('/profile', (req, res) => {
  const u = db
    .prepare('SELECT id, email, login, full_name, last_name, phone, avatar_url, role FROM users WHERE id = ?')
    .get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  const split = splitUserName(u.full_name, u.last_name);
  res.json({
    profile: {
      first_name: split.firstName,
      last_name: split.lastName,
      full_name: String(u.full_name || '').trim(),
      phone: String(u.phone || '').trim(),
      avatar_url: String(u.avatar_url || '').trim(),
      role_label: 'Operator',
      system_role: u.role || 'operator',
      email: String(u.email || '').trim(),
      login: String(u.login || '').trim(),
    },
  });
});

router.patch('/profile', (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  const body = req.body || {};
  const currentSplit = splitUserName(current.full_name, current.last_name);
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
      : String(current.phone || '').trim();
  const avatarUrl =
    body.avatar_url !== undefined
      ? String(body.avatar_url || '').trim().slice(0, 200000)
      : String(current.avatar_url || '').trim();

  if (!fullName) return res.status(400).json({ error: "Ism bo'sh bo'lmasin." });

  try {
    db.prepare('UPDATE users SET full_name = ?, last_name = ?, phone = ?, avatar_url = ? WHERE id = ?').run(
      fullName,
      lastName || null,
      phone || null,
      avatarUrl || null,
      req.user.id
    );
  } catch (e) {
    console.error('operator profile patch', e);
    return res.status(500).json({ error: 'Saqlashda xatolik.' });
  }

  const updated = db
    .prepare('SELECT id, full_name, last_name, phone, avatar_url, email, login, role FROM users WHERE id = ?')
    .get(req.user.id);
  const sp = splitUserName(updated.full_name, updated.last_name);
  res.json({
    ok: true,
    profile: {
      first_name: sp.firstName,
      last_name: sp.lastName,
      full_name: String(updated.full_name || '').trim(),
      phone: String(updated.phone || '').trim(),
      avatar_url: String(updated.avatar_url || '').trim(),
      role_label: 'Operator',
      system_role: updated.role || 'operator',
      email: String(updated.email || '').trim(),
      login: String(updated.login || '').trim(),
    },
  });
});

router.get('/work-role/balance', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'operator');
  if (!wr) {
    return res.status(404).json({
      error: 'Moliya uchun ishchi rol topilmadi. Administrator portalda operator ish ro\'yi yarating.',
      code: 'no_work_role',
    });
  }
  res.json({ balance: Number(wr.total_amount) || 0 });
});

router.get('/withdrawals', (req, res) => {
  const wr = getWorkRoleByUserPortalRole(req.user, 'operator');
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
  const wr = getWorkRoleByUserPortalRole(req.user, 'operator');
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
    console.error('[operator/withdrawal]', e);
    return res.status(500).json({ error: 'Server xatosi.' });
  }
});

/** Sklad Lichka / MyShop chat — kuryer/picker bilan bir xil */
router.get('/sklad-peers', getSkladPeers);
router.get('/dm/messages', getDmMessages);
router.get('/dm/stories', getDmStories);
router.get('/dm/call-logs', getDmCallLogs);
router.post('/dm/call-logs', postDmCallLog);
router.post('/dm/send', postDmSend);
router.post('/chat/presence', postChatPresence);
router.get('/chat/presence', getChatPresence);

export default router;
