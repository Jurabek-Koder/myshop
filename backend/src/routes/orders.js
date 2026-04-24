import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { orderValidation, idParam } from '../middleware/validate.js';
import rateLimit from 'express-rate-limit';
import { security } from '../config/security.js';
import { enqueueAiCallForPendingOrder } from '../modules/operator/call-operator.service.js';

const router = Router();
const orderCreateLimiter = rateLimit({
  ...security.strictRateLimit,
  keyGenerator: (req) => req.user?.id ? `user_${req.user.id}` : (req.ip || 'unknown'),
});

function clientIpFromReq(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').trim();
  if (xf) return xf.split(',')[0].trim();
  const xr = String(req.headers['x-real-ip'] || '').trim();
  if (xr) return xr;
  return String(req.ip || '').trim() || null;
}

function detectOs(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'Unknown OS';
  if (s.includes('android')) return 'Android';
  if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) return 'iOS';
  if (s.includes('windows')) return 'Windows';
  if (s.includes('mac os') || s.includes('macintosh')) return 'macOS';
  if (s.includes('linux')) return 'Linux';
  return 'Unknown OS';
}

function detectBrowser(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'Unknown Browser';
  if (s.includes('edg/')) return 'Edge';
  if (s.includes('opr/') || s.includes('opera')) return 'Opera';
  if (s.includes('chrome/')) return 'Chrome';
  if (s.includes('safari/') && !s.includes('chrome/')) return 'Safari';
  if (s.includes('firefox/')) return 'Firefox';
  return 'Unknown Browser';
}

function detectDeviceType(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'Unknown device';
  if (s.includes('ipad') || s.includes('tablet')) return 'Tablet';
  if (s.includes('mobi') || s.includes('android') || s.includes('iphone')) return 'Mobile';
  return 'Desktop';
}

function clientLocationFromReq(req) {
  const country = String(
    req.headers['cf-ipcountry'] ||
      req.headers['x-vercel-ip-country'] ||
      req.headers['x-country-code'] ||
      req.headers['x-appengine-country'] ||
      ''
  ).trim();
  const region = String(req.headers['x-vercel-ip-country-region'] || req.headers['x-region-code'] || '').trim();
  const city = String(req.headers['x-vercel-ip-city'] || req.headers['x-city'] || '').trim();
  const parts = [country, region, city].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function clientMetaFromReq(req) {
  const ua = String(req.headers['user-agent'] || '').trim().slice(0, 600);
  return {
    ip: clientIpFromReq(req),
    userAgent: ua || null,
    device: `${detectDeviceType(ua)} • ${detectOs(ua)} • ${detectBrowser(ua)}`,
    location: clientLocationFromReq(req),
  };
}

router.get('/', authRequired, (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at
    FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC
  `).all(req.user.id);
  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
  }
  res.json({ orders });
});

router.get('/:id', authRequired, idParam, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  order.items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(order.id);
  res.json(order);
});

router.post('/', authRequired, orderCreateLimiter, orderValidation, (req, res) => {
  const { items, shipping_address, contact_phone } = req.body;
  const cm = clientMetaFromReq(req);
  let total = 0;
  const rows = [];
  for (const it of items) {
    const product = db.prepare('SELECT id, price, stock, discount_percent, promotion_ends_at FROM products WHERE id = ?').get(it.product_id);
    if (!product) return res.status(400).json({ error: `Mahsulot topilmadi: ${it.product_id}` });
    if (product.stock < it.quantity) return res.status(400).json({ error: `Yetarli mahsulot yo'q: ${product.id}` });
    let priceAtOrder = product.price;
    const discount = Number(product.discount_percent) || 0;
    if (discount > 0) {
      const endsAt = product.promotion_ends_at;
      if (!endsAt || String(endsAt).slice(0, 19) >= new Date().toISOString().slice(0, 19).replace('T', ' ')) {
        priceAtOrder = Math.round(priceAtOrder * (1 - discount / 100));
      }
    }
    total += priceAtOrder * it.quantity;
    rows.push({ product_id: product.id, quantity: it.quantity, price_at_order: priceAtOrder });
  }
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      user_id, status, total_amount, currency, shipping_address, contact_phone,
      order_ip, order_user_agent, order_device, order_location
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price_at_order) VALUES (?, ?, ?, ?)');
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
  const insertSellerNotif = db.prepare(
    'INSERT INTO seller_notifications (seller_id, title, message, type, is_read) VALUES (?, ?, ?, ?, 0)'
  );
  const transact = db.transaction(() => {
    const result = insertOrder.run(
      req.user.id,
      'pending',
      total,
      'UZS',
      shipping_address || null,
      contact_phone || null,
      cm.ip,
      cm.userAgent,
      cm.device,
      cm.location,
    );
    const orderId = result.lastInsertRowid;
    db.prepare(`
      INSERT INTO user_device_events (user_id, event_type, ip, user_agent, device, location, order_id)
      VALUES (?, 'order', ?, ?, ?, ?, ?)
    `).run(req.user.id, cm.ip, cm.userAgent, cm.device, cm.location, orderId);
    for (const r of rows) {
      insertItem.run(orderId, r.product_id, r.quantity, r.price_at_order);
      updateStock.run(r.quantity, r.product_id);
      const after = db.prepare('SELECT stock, seller_id, name_uz FROM products WHERE id = ?').get(r.product_id);
      if (after && after.stock <= 0 && after.seller_id) {
        insertSellerNotif.run(
          after.seller_id,
          'Mahsulot sotuvda emas',
          `"${after.name_uz || 'Mahsulot'}" omborda qolmadi. Iltimos mahsulotni to'ldiring.`,
          'warning'
        );
      }
    }
    return orderId;
  });
  const orderId = transact();
  // PENDING buyurtma: AI operator qo‘ng‘iroq queue'ga qo‘shiladi (operator avtomatik bog‘lanishi uchun).
  void enqueueAiCallForPendingOrder({ orderId, operatorId: null }).catch(() => {});
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  order.items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(orderId);
  res.status(201).json(order);
});

export default router;
