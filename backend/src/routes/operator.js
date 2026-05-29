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
import { enqueueAiCallForPendingOrder } from '../modules/operator/call-operator.service.js';

const router = Router();
router.use(authRequired, requireRole('operator'));

function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
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
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
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

  return tx();
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
  if (filter === 'courier') {
    statusSql = "o.status IN ('assigned', 'picked_up', 'on_the_way')";
  } else if (filter === 'delivered') {
    statusSql = "o.status = 'delivered'";
  } else if (filter === 'cancelled') {
    statusSql = "o.status = 'cancelled'";
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

  const packerStmt = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ?');
  const courierStmt = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ?');

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
    const lead = db.prepare(`
      SELECT id, product_id, full_name, contact_phone, operator_id, status
      FROM product_leads WHERE order_id = ?
    `).get(o.id);
    if (lead) o.lead = lead;
    if (o.packer_id) {
      const p = packerStmt.get(o.packer_id);
      o.packer = p ? { id: p.id, full_name: p.full_name } : { id: o.packer_id, full_name: null };
    }
    if (o.courier_id) {
      const c = courierStmt.get(o.courier_id);
      o.courier = c ? { id: c.id, full_name: c.full_name } : { id: o.courier_id, full_name: null };
    }
  }

  res.json({ orders });
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
  const rows = db.prepare(`
    SELECT oe.id, oe.order_id, oe.amount, oe.created_at
    FROM operator_earnings oe
    WHERE oe.operator_id = ?
    ORDER BY oe.created_at DESC
    LIMIT 200
  `).all(operatorId);

  const soldAgg = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
    FROM operator_earnings WHERE operator_id = ?
  `).get(operatorId);

  const soldTotal = Number(soldAgg?.total) || 0;
  const soldCount = Number(soldAgg?.cnt) || 0;

  const wr = getWorkRoleByUserPortalRole(req.user, 'operator');
  let summary = {
    balance: soldTotal,
    sold_total: soldTotal,
    sold_count: soldCount,
    reward_amount: 0,
    fine_amount: 0,
    fines_count: 0,
    has_work_role: false,
  };
  let fines = [];
  let rewards = [];

  if (wr) {
    const wrFresh = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(wr.id);
    summary = {
      balance: Number(wrFresh?.total_amount) || 0,
      sold_total: soldTotal,
      sold_count: soldCount,
      reward_amount: Number(wrFresh?.reward_amount) || 0,
      fine_amount: Number(wrFresh?.fine_amount) || 0,
      fines_count: Number(wrFresh?.fines_count) || 0,
      has_work_role: true,
    };

    const ledgerRows = db.prepare(`
      SELECT id, kind, amount, title, note, ref_kind, ref_id, created_at
      FROM work_role_ledger_entries
      WHERE work_role_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 200
    `).all(wr.id);
    fines = ledgerRows.filter((r) => r.kind === 'fine');
    rewards = ledgerRows.filter((r) => r.kind === 'reward');
  }

  res.json({
    earnings: rows,
    total: soldTotal,
    summary,
    fines,
    rewards,
  });
});

/** Lead yaratish formasi (mahsulot ro'yxati) */
router.get('/products-for-lead', (req, res) => {
  const products = db.prepare('SELECT id, name_uz FROM products ORDER BY name_uz').all();
  res.json({ products });
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

  const packerStmt = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ?');

  const orders = rows.map((row) => {
    const shippingRaw = String(row.shipping_address || '').trim();
    const parts = shippingRaw.length ? shippingRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    let packer = null;
    if (row.packer_id) {
      const p = packerStmt.get(row.packer_id);
      if (p) packer = { id: p.id, full_name: p.full_name };
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

  res.status(201).json({ lead, message: "Lead yaratildi. «Bog'langan» bo'limida tasdiqlang." });
});

router.get('/leads', (req, res) => {
  const status = req.query.status || '';
  const product_id = req.query.product_id ? parseInt(req.query.product_id, 10) : null;
  const today = req.query.today === '1' || req.query.today === 'true';

  let sql = `
    SELECT l.*, p.name_uz as product_name, p.price as product_price
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

  const leads = db.prepare(sql).all(...params);
  const products = db.prepare('SELECT id, name_uz FROM products ORDER BY name_uz').all();
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
  const contact_phone = String(order.contact_phone || user?.phone || '').trim() || null;
  const contact_email = String(user?.email || '').trim() || null;
  const full_name = String(user?.full_name || '').trim() || null;

  const shippingRaw = String(order.shipping_address || '').trim();
  let parsedNotes = null;
  const separatorMatch = shippingRaw.match(/\.\s*(Sharh|Izoh):\s*/i);
  if (separatorMatch) {
    parsedNotes = shippingRaw.slice(separatorMatch.index + separatorMatch[0].length).trim() || null;
  }

  const pendingLead = db.prepare(`
    SELECT id FROM product_leads WHERE order_id = ? AND status = 'pending' LIMIT 1
  `).get(orderId);

  if (pendingLead) {
    db.prepare(`
      UPDATE product_leads
      SET status = 'contacted', operator_id = ?, product_id = ?, contact_phone = ?, contact_email = ?, full_name = ?, notes = COALESCE(notes, ?)
      WHERE id = ?
    `).run(req.user.id, item.product_id, contact_phone, contact_email, full_name, parsedNotes, pendingLead.id);
    const lead = db.prepare(`
      SELECT l.*, p.name_uz as product_name, p.price as product_price
      FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
    `).get(pendingLead.id);
    return res.status(201).json({ lead, message: "Lead «Bog'langan» bo'limiga o'tkazildi." });
  }

  const result = db.prepare(`
    INSERT INTO product_leads (product_id, contact_phone, contact_email, full_name, status, operator_id, order_id, notes)
    VALUES (?, ?, ?, ?, 'contacted', ?, ?, ?)
  `).run(item.product_id, contact_phone, contact_email, full_name, req.user.id, orderId, parsedNotes);

  const lead = db.prepare(`
    SELECT l.*, p.name_uz as product_name, p.price as product_price
    FROM product_leads l JOIN products p ON p.id = l.product_id WHERE l.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ lead, message: "Lead yaratildi. «Bog'langan» bo'limida tasdiqlang." });
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
