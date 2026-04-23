import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { db, insertWorkRoleLedgerEntry } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { buildCourierRegionServiceText } from '../utils/viloyatPacker.js';

const router = Router();
router.use(authRequired, requireRole('superuser'));

const ORDER_STATUSES = new Set(['pending', 'processing', 'delivery', 'on_the_way', 'completed', 'delivered', 'hold', 'cancelled', 'archived']);
const STAFF_TYPES = new Set(['courier', 'operator', 'packer', 'picker']);
const STAFF_STATUSES = new Set(['active', 'blocked', 'pending']);
const WORK_ROLE_STATUSES = new Set(['active', 'blocked', 'pending']);
const WORK_PORTAL_ROLES = new Set(['seller', 'courier', 'operator', 'picker', 'packer', 'expeditor', 'order_receiver']);

function parseWorkPortalRole(body) {
  const pr = String(body?.portal_role || '').trim().toLowerCase();
  if (!pr) return null;
  return WORK_PORTAL_ROLES.has(pr) ? pr : null;
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function parseJson(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function roleRowToDto(row) {
  return {
    ...row,
    permissions: parseJson(row.permissions_json),
    courier_tuman_ids: parseJson(row.courier_tuman_ids_json, []),
  };
}

function syncStaffCourierRegionServiceFromWorkRole(workRoleId) {
  const wr = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(workRoleId);
  if (!wr) return;
  if (String(wr.portal_role || '').toLowerCase() !== 'courier') return;
  const loginVal = String(wr.login || '').trim().toLowerCase();
  const user = db.prepare('SELECT staff_member_id FROM users WHERE lower(login) = lower(?)').get(loginVal);
  if (!user?.staff_member_id) return;
  const tumanIds = parseJson(wr.courier_tuman_ids_json, []);
  const text = buildCourierRegionServiceText(String(wr.courier_viloyat_id || '').trim(), tumanIds);
  db.prepare('UPDATE staff_members SET region_service_text = ? WHERE id = ?').run(text || null, user.staff_member_id);
}

function normalizeLogin(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

const AD_SLIDES_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'ad-slides');
fs.mkdirSync(AD_SLIDES_UPLOAD_DIR, { recursive: true });

const adSlideImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AD_SLIDES_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const raw = path.extname(String(file.originalname || '')).toLowerCase();
    const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(raw) ? raw : '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const adSlideImageUpload = multer({
  storage: adSlideImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|pjpeg|png|gif|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('AD_IMAGE_TYPE'), false);
  },
});

const AD_VIDEO_EXT = new Set(['.mp4', '.webm', '.ogg', '.mov']);

const adSlideVideoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AD_SLIDES_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const raw = path.extname(String(file.originalname || '')).toLowerCase();
    const ext = AD_VIDEO_EXT.has(raw) ? raw : '.mp4';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const adSlideVideoUpload = multer({
  storage: adSlideVideoStorage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (AD_VIDEO_EXT.has(ext)) return cb(null, true);
    if (/^video\//i.test(String(file.mimetype || ''))) return cb(null, true);
    cb(new Error('AD_VIDEO_TYPE'), false);
  },
});

/**
 * Reklama video URL: tashqi https/http yoki serverga yuklangan `/api/uploads/ad-slides/...`
 * (nisbiy yo‘l — aks holda saqlashda null bo‘lib, video ko‘rinmas edi).
 */
function normalizeAdSlideVideoUrl(value) {
  const s = String(value || '').trim().slice(0, 1200);
  if (!s) return null;
  if (/^\s*javascript:/i.test(s)) return null;

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return s;
    } catch {
      return null;
    }
  }

  if (s.startsWith('/api/uploads/ad-slides/') && !s.includes('..')) {
    const rest = s.slice('/api/uploads/ad-slides/'.length);
    if (!rest || rest.includes('//')) return null;
    return s;
  }

  return null;
}

/** Faqat ichki yo‘l (dropdown) — XSS / tashqi URL admin orqali kiritilmasin */
function normalizeAdSlideLink(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (!s.startsWith('/') || s.includes('//') || s.includes('..')) return null;
  return s.slice(0, 500);
}

function makeUniqueLogin(raw) {
  const base = normalizeLogin(raw) || 'role';
  let login = base;
  let n = 1;
  while (db.prepare('SELECT id FROM work_roles WHERE lower(login) = lower(?)').get(login)) {
    n += 1;
    login = `${base}${n}`;
  }
  return login;
}

router.get('/orders', (req, res) => {
  const status = req.query.status ? String(req.query.status).trim() : '';
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `
    SELECT
      o.id,
      o.user_id,
      o.status,
      o.total_amount,
      o.currency,
      o.shipping_address,
      o.contact_phone,
      o.created_at,
      u.full_name,
      u.email,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as items_count,
      (
        SELECT GROUP_CONCAT(
          COALESCE(NULLIF(TRIM(p.name_uz), ''), p.name_ru, 'Mahsulot') ||
          CASE WHEN COALESCE(oi.home_left_in_courier, 0) = 1 THEN ' [UYDA]' ELSE '' END,
          ', '
        )
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
      ) as product_names
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE 1 = 1
  `;

  const params = [];

  if (status && status !== 'all') {
    if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Noto\'g\'ri status.' });
    sql += ' AND o.status = ?';
    params.push(status);
  }

  if (search) {
    sql += ' AND (CAST(o.id AS TEXT) LIKE ? OR IFNULL(u.full_name,\'\') LIKE ? OR IFNULL(u.email,\'\') LIKE ? OR IFNULL(o.contact_phone,\'\') LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY o.created_at DESC';

  const orders = db.prepare(sql).all(...params);
  res.json({ orders });
});

router.get('/orders/stats', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) as c FROM orders GROUP BY status').all();
  const stats = {
    pending: 0,
    processing: 0,
    delivery: 0,
    on_the_way: 0,
    completed: 0,
    delivered: 0,
    hold: 0,
    cancelled: 0,
    archived: 0,
  };

  for (const row of rows) {
    if (stats[row.status] != null) stats[row.status] = row.c;
  }

  stats.total = Object.values(stats).reduce((acc, val) => acc + val, 0);
  res.json(stats);
});

router.patch('/orders/:id/status', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = String(req.body?.status || '').trim();
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri order ID.' });
  if (!ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Noto\'g\'ri status.' });

  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Order topilmadi.' });

  db.prepare(`UPDATE orders SET status = ?, status_updated_at = datetime('now') WHERE id = ?`).run(status, id);
  const updated = db.prepare(`
    SELECT
      o.id,
      o.user_id,
      o.status,
      o.total_amount,
      o.currency,
      o.shipping_address,
      o.contact_phone,
      o.created_at,
      u.full_name,
      u.email,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as items_count,
      (
        SELECT GROUP_CONCAT(
          COALESCE(NULLIF(TRIM(p.name_uz), ''), p.name_ru, 'Mahsulot') ||
          CASE WHEN COALESCE(oi.home_left_in_courier, 0) = 1 THEN ' [UYDA]' ELSE '' END,
          ', '
        )
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
      ) as product_names
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.id = ?
  `).get(id);

  res.json(updated);
});

router.get('/staff', (req, res) => {
  const type = req.query.type ? String(req.query.type).trim() : '';
  const status = req.query.status ? String(req.query.status).trim() : '';
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `
    SELECT s.*, r.name as region_name,
           COALESCE(u_by_staff.login, u_by_user.login) as login,
           COALESCE(u_by_staff.email, u_by_user.email) as email
    FROM staff_members s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u_by_staff ON u_by_staff.staff_member_id = s.id
    LEFT JOIN users u_by_user ON u_by_user.id = s.user_id
    WHERE 1 = 1
  `;
  const params = [];

  if (type && type !== 'all') {
    if (!STAFF_TYPES.has(type)) return res.status(400).json({ error: 'Noto\'g\'ri staff type.' });
    sql += ' AND s.staff_type = ?';
    params.push(type);
  }

  if (status && status !== 'all') {
    sql += ' AND s.status = ?';
    params.push(status);
  }

  if (search) {
    sql += ` AND (
      s.full_name LIKE ? OR IFNULL(s.phone,'') LIKE ?
      OR IFNULL(u_by_staff.login,'') LIKE ?
      OR IFNULL(u_by_user.login,'') LIKE ?
      OR IFNULL(u_by_staff.email,'') LIKE ?
      OR IFNULL(u_by_user.email,'') LIKE ?
    )`;
    const q = `%${search}%`;
    params.push(q, q, q, q, q, q);
  }

  sql += ' ORDER BY s.created_at DESC';

  const staff = db.prepare(sql).all(...params);
  res.json({ staff });
});

router.post('/staff', (req, res) => {
  const staffType = String(req.body?.staff_type || '').trim();
  const fullName = String(req.body?.full_name || '').trim();
  const phone = String(req.body?.phone || '').trim() || null;
  const status = String(req.body?.status || 'active').trim();
  const regionId = req.body?.region_id != null ? Number.parseInt(req.body.region_id, 10) : null;

  if (!STAFF_TYPES.has(staffType)) return res.status(400).json({ error: 'Noto\'g\'ri staff turi.' });
  if (!fullName) return res.status(400).json({ error: 'F.I.Sh kerak.' });
  if (!STAFF_STATUSES.has(status)) return res.status(400).json({ error: 'Noto\'g\'ri staff status.' });

  if (regionId != null && (!Number.isInteger(regionId) || regionId < 1)) {
    return res.status(400).json({ error: 'Noto\'g\'ri region_id.' });
  }

  const result = db.prepare(
    'INSERT INTO staff_members (staff_type, full_name, phone, status, region_id) VALUES (?, ?, ?, ?, ?)'
  ).run(staffType, fullName, phone, status, regionId);

  const created = db.prepare(`
    SELECT s.*, r.name as region_name,
           COALESCE(u_by_staff.login, u_by_user.login) as login,
           COALESCE(u_by_staff.email, u_by_user.email) as email
    FROM staff_members s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u_by_staff ON u_by_staff.staff_member_id = s.id
    LEFT JOIN users u_by_user ON u_by_user.id = s.user_id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(created);
});

router.patch('/staff/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT * FROM staff_members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Staff topilmadi.' });

  const existingBal = existing.balance != null ? Number(existing.balance) : 0;
  let nextBalance = Number.isFinite(existingBal) ? existingBal : 0;
  if (req.body?.balance != null) {
    const b = Number.parseFloat(req.body.balance);
    if (!Number.isFinite(b)) return res.status(400).json({ error: 'Noto\'g\'ri balans.' });
    nextBalance = b;
  }

  const next = {
    staff_type: req.body?.staff_type != null ? String(req.body.staff_type).trim() : existing.staff_type,
    full_name: req.body?.full_name != null ? String(req.body.full_name).trim() : existing.full_name,
    phone: req.body?.phone != null ? String(req.body.phone).trim() : existing.phone,
    status: req.body?.status != null ? String(req.body.status).trim() : existing.status,
    region_id: req.body?.region_id != null ? Number.parseInt(req.body.region_id, 10) : existing.region_id,
    orders_handled: req.body?.orders_handled != null ? Number.parseInt(req.body.orders_handled, 10) : existing.orders_handled,
    rating: req.body?.rating != null ? Number.parseFloat(req.body.rating) : existing.rating,
    balance: nextBalance,
  };

  if (!STAFF_TYPES.has(next.staff_type)) return res.status(400).json({ error: 'Noto\'g\'ri staff turi.' });
  if (!next.full_name) return res.status(400).json({ error: 'F.I.Sh kerak.' });
  if (!STAFF_STATUSES.has(next.status)) return res.status(400).json({ error: 'Noto\'g\'ri status.' });
  if (next.region_id != null && (!Number.isInteger(next.region_id) || next.region_id < 1)) {
    return res.status(400).json({ error: 'Noto\'g\'ri region_id.' });
  }

  db.prepare(`
    UPDATE staff_members
    SET staff_type = ?, full_name = ?, phone = ?, status = ?, region_id = ?, orders_handled = ?, rating = ?, balance = ?
    WHERE id = ?
  `).run(
    next.staff_type,
    next.full_name,
    next.phone || null,
    next.status,
    next.region_id || null,
    next.orders_handled || 0,
    next.rating || 0,
    next.balance,
    id,
  );

  const updated = db.prepare(`
    SELECT s.*, r.name as region_name,
           COALESCE(u_by_staff.login, u_by_user.login) as login,
           COALESCE(u_by_staff.email, u_by_user.email) as email
    FROM staff_members s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u_by_staff ON u_by_staff.staff_member_id = s.id
    LEFT JOIN users u_by_user ON u_by_user.id = s.user_id
    WHERE s.id = ?
  `).get(id);

  res.json(updated);
});

router.delete('/staff/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT id FROM staff_members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Staff topilmadi.' });

  db.prepare('DELETE FROM staff_members WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.get('/regions', (req, res) => {
  const regions = db.prepare(`
    SELECT
      r.*,
      (SELECT COUNT(*) FROM staff_members s WHERE s.region_id = r.id) as staff_count,
      (SELECT COUNT(*) FROM sellers sl WHERE sl.region_id = r.id) as sellers_count
    FROM regions r
    ORDER BY r.name
  `).all();
  res.json({ regions });
});

router.post('/regions', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const deliveryFee = req.body?.delivery_fee != null ? Number.parseFloat(req.body.delivery_fee) : 25000;
  const active = req.body?.active != null ? (req.body.active ? 1 : 0) : 1;

  if (!name) return res.status(400).json({ error: 'Region nomi kerak.' });

  try {
    const result = db.prepare('INSERT INTO regions (name, delivery_fee, active) VALUES (?, ?, ?)').run(name, deliveryFee || 0, active);
    const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(region);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Bu region mavjud.' });
    }
    throw e;
  }
});

router.patch('/regions/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT * FROM regions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Region topilmadi.' });

  const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
  const deliveryFee = req.body?.delivery_fee != null ? Number.parseFloat(req.body.delivery_fee) : existing.delivery_fee;
  const active = req.body?.active != null ? (req.body.active ? 1 : 0) : existing.active;

  if (!name) return res.status(400).json({ error: 'Region nomi kerak.' });

  db.prepare('UPDATE regions SET name = ?, delivery_fee = ?, active = ? WHERE id = ?').run(name, deliveryFee || 0, active, id);
  const updated = db.prepare('SELECT * FROM regions WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/regions/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT id FROM regions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Region topilmadi.' });

  const staffCount = db.prepare('SELECT COUNT(*) as c FROM staff_members WHERE region_id = ?').get(id).c;
  const sellerCount = db.prepare('SELECT COUNT(*) as c FROM sellers WHERE region_id = ?').get(id).c;
  if (staffCount > 0 || sellerCount > 0) {
    return res.status(400).json({ error: 'Bu regionga bog\'langan ma\'lumotlar bor.' });
  }

  db.prepare('DELETE FROM regions WHERE id = ?').run(id);
  res.json({ ok: true });
});

function sellerLookupRow(row) {
  if (!row) return null;
  const productsCount = db.prepare('SELECT COUNT(*) as c FROM products WHERE seller_id = ?').get(row.id).c;
  const categories = db.prepare("SELECT DISTINCT category FROM products WHERE seller_id = ? AND category IS NOT NULL AND TRIM(IFNULL(category, '')) != '' ORDER BY category").all(row.id);
  const product_categories = categories.map((r) => r.category);
  return { ...row, products_count: productsCount, product_categories };
}

router.get('/sellers/lookup', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ seller: null });

  const byId = Number.parseInt(q, 10);
  if (Number.isInteger(byId) && byId > 0) {
    const row = db.prepare(`
      SELECT s.*, r.name as region_name, u.email as login_email
      FROM sellers s
      LEFT JOIN regions r ON r.id = s.region_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
    `).get(byId);
    return res.json({ seller: sellerLookupRow(row) });
  }

  const searchSql = `
    SELECT s.*, r.name as region_name, u.email as login_email
    FROM sellers s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.name LIKE ? OR IFNULL(s.contact_phone,'') LIKE ? OR IFNULL(s.email,'') LIKE ? OR IFNULL(u.email,'') LIKE ?
    ORDER BY s.id DESC
    LIMIT 1
  `;
  const pattern = `%${q}%`;
  const row = db.prepare(searchSql).get(pattern, pattern, pattern, pattern);
  res.json({ seller: sellerLookupRow(row) });
});

router.get('/sellers', (req, res) => {
  const status = req.query.status ? String(req.query.status).trim() : '';
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql =     `
    SELECT s.*, r.name as region_name, u.email as login_email
    FROM sellers s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE 1 = 1
  `;
  const params = [];

  if (status && status !== 'all') {
    sql += ' AND s.status = ?';
    params.push(status);
  }

  if (search) {
    sql += " AND (s.name LIKE ? OR IFNULL(s.email,'') LIKE ? OR IFNULL(s.contact_phone,'') LIKE ? OR IFNULL(u.email,'') LIKE ?)";
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY s.created_at DESC';

  const sellers = db.prepare(sql).all(...params);
  res.json({ sellers });
});

router.post('/sellers', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const contactPhone = String(req.body?.contact_phone || '').trim() || null;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || 'Seller123!').trim();
  const regionId = req.body?.region_id != null ? Number.parseInt(req.body.region_id, 10) : null;
  const balance = req.body?.balance != null ? Number.parseFloat(req.body.balance) : 0;
  const status = String(req.body?.status || 'active').trim();

  if (!name) return res.status(400).json({ error: 'Seller nomi kerak.' });
  if (!email) return res.status(400).json({ error: 'Seller login emaili kerak.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Yaroqli email kiriting.' });
  if (password.length < 6) return res.status(400).json({ error: "Parol kamida 6 ta belgidan iborat bo'lsin." });
  if (regionId != null && (!Number.isInteger(regionId) || regionId < 1)) {
    return res.status(400).json({ error: "Noto'g'ri region_id." });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
  if (existingUser) return res.status(409).json({ error: 'Bu email bilan user mavjud.' });

  const tx = db.transaction(() => {
    const sellerResult = db.prepare(
      'INSERT INTO sellers (name, contact_phone, email, region_id, balance, status, user_id) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    ).run(name, contactPhone, email, regionId, balance || 0, status);

    const sellerId = sellerResult.lastInsertRowid;
    const passwordHash = bcrypt.hashSync(password, 12);
    const userResult = db.prepare(
      'INSERT INTO users (email, password_hash, full_name, role, role_id, seller_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, passwordHash, name, 'seller', 2, sellerId);

    db.prepare('UPDATE sellers SET user_id = ? WHERE id = ?').run(userResult.lastInsertRowid, sellerId);
    return sellerId;
  });

  const sellerId = tx();

  const created = db.prepare(`
    SELECT s.*, r.name as region_name, u.email as login_email
    FROM sellers s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(sellerId);

  res.status(201).json({
    ...created,
    generated_default_password: req.body?.password ? null : 'Seller123!',
  });
});

router.patch('/sellers/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: "Noto'g'ri ID." });

  const existing = db.prepare('SELECT * FROM sellers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Seller topilmadi.' });

  const next = {
    name: req.body?.name != null ? String(req.body.name).trim() : existing.name,
    contact_phone: req.body?.contact_phone != null ? String(req.body.contact_phone).trim() : existing.contact_phone,
    email: req.body?.email != null ? String(req.body.email).trim().toLowerCase() : (existing.email || ''),
    region_id: req.body?.region_id != null ? Number.parseInt(req.body.region_id, 10) : existing.region_id,
    balance: req.body?.balance != null ? Number.parseFloat(req.body.balance) : existing.balance,
    status: req.body?.status != null ? String(req.body.status).trim() : existing.status,
  };

  const newPassword = req.body?.password != null ? String(req.body.password).trim() : '';

  if (!next.name) return res.status(400).json({ error: 'Seller nomi kerak.' });
  if (!next.email) return res.status(400).json({ error: 'Seller login emaili kerak.' });
  if (!/^\S+@\S+\.\S+$/.test(next.email)) return res.status(400).json({ error: 'Yaroqli email kiriting.' });
  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ error: "Parol kamida 6 ta belgidan iborat bo'lsin." });
  }
  if (next.region_id != null && (!Number.isInteger(next.region_id) || next.region_id < 1)) {
    return res.status(400).json({ error: "Noto'g'ri region_id." });
  }

  const emailOwner = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(next.email);
  if (emailOwner && emailOwner.id !== existing.user_id) {
    return res.status(409).json({ error: 'Bu email boshqa userga tegishli.' });
  }

  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE sellers SET name = ?, contact_phone = ?, email = ?, region_id = ?, balance = ?, status = ? WHERE id = ?'
    ).run(next.name, next.contact_phone || null, next.email, next.region_id || null, next.balance || 0, next.status || 'active', id);

    if (existing.user_id) {
      if (newPassword) {
        db.prepare(
          'UPDATE users SET email = ?, full_name = ?, role = ?, role_id = ?, seller_id = ?, password_hash = ? WHERE id = ?'
        ).run(next.email, next.name, 'seller', 2, id, bcrypt.hashSync(newPassword, 12), existing.user_id);
      } else {
        db.prepare(
          'UPDATE users SET email = ?, full_name = ?, role = ?, role_id = ?, seller_id = ? WHERE id = ?'
        ).run(next.email, next.name, 'seller', 2, id, existing.user_id);
      }
    } else {
      const passwordHash = bcrypt.hashSync(newPassword || 'Seller123!', 12);
      const userRes = db.prepare(
        'INSERT INTO users (email, password_hash, full_name, role, role_id, seller_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(next.email, passwordHash, next.name, 'seller', 2, id);
      db.prepare('UPDATE sellers SET user_id = ? WHERE id = ?').run(userRes.lastInsertRowid, id);
    }
  });

  tx();

  const updated = db.prepare(`
    SELECT s.*, r.name as region_name, u.email as login_email
    FROM sellers s
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(id);

  res.json(updated);
});

router.delete('/sellers/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: "Noto'g'ri ID." });

  const existing = db.prepare('SELECT id, user_id FROM sellers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Seller topilmadi.' });

  const productsCount = db.prepare('SELECT COUNT(*) as c FROM products WHERE seller_id = ?').get(id).c;
  if (productsCount > 0) {
    return res.status(400).json({ error: "Bu sellerga bog'langan mahsulotlar bor. Avval mahsulotlarni o'chiring yoki boshqa sellerga o'tkazing." });
  }

  const tx = db.transaction(() => {
    if (existing.user_id) {
      db.prepare('UPDATE users SET role = ?, role_id = ?, seller_id = NULL WHERE id = ?').run('customer', 2, existing.user_id);
    }
    db.prepare('DELETE FROM sellers WHERE id = ?').run(id);
  });

  tx();
  res.json({ ok: true });
});

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? String(row.value || '').trim() : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

router.get('/contest', (req, res) => {
  const operatorActive = getSetting('contest_active', '0') === '1';
  const courierActive = getSetting('contest_courier_active', '0') === '1';
  const start = getSetting('contest_start', '');
  const end = getSetting('contest_end', '');
  res.json({ operatorActive, courierActive, start, end });
});

router.patch('/contest', (req, res) => {
  const { operator, courier } = req.body;
  if (typeof operator === 'boolean' || operator === 1 || operator === 0) {
    setSetting('contest_active', operator ? '1' : '0');
    if (operator) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      setSetting('contest_start', now);
      setSetting('contest_end', '');
    }
  }
  if (typeof courier === 'boolean' || courier === 1 || courier === 0) {
    setSetting('contest_courier_active', courier ? '1' : '0');
  }
  res.json({
    operatorActive: getSetting('contest_active', '0') === '1',
    courierActive: getSetting('contest_courier_active', '0') === '1',
  });
});

// Kuryerlar uchun konkurs natijalari — contest_courier_active dan
function getContestCourierActive() {
  return getSetting('contest_courier_active', '0') === '1';
}
function getContestPeriodStart(period) {
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
router.get('/contest-courier-results', (req, res) => {
  const period = req.query.period === 'month' ? 'month' : req.query.period === 'week' ? 'week' : 'day';
  const active = getContestCourierActive();
  const periodStart = getContestPeriodStart(period);
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
  res.json({ active, period, topByDelivered });
});

// Operatorlar uchun konkurs natijalari — contest_active dan (admin ko'rinishi)
function getContestOperatorActive() {
  return getSetting('contest_active', '0') === '1';
}
router.get('/contest-operator-results', (req, res) => {
  const period = req.query.period === 'month' ? 'month' : req.query.period === 'week' ? 'week' : 'day';
  const active = getContestOperatorActive();
  const periodStart = getContestPeriodStart(period);
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
  res.json({ active, period, topByOrdersCreated, topByOrdersDelivered });
});

// Konkurs e'loni — barcha kuryerlar yoki operatorlarga bir vaqtda xabar
router.post('/contest-notify', (req, res) => {
  const { date, time, for: forRole, message } = req.body;
  const role = String(forRole || '').toLowerCase();
  if (role !== 'courier' && role !== 'operator') {
    return res.status(400).json({ error: 'Kim uchun: courier yoki operator tanlang.' });
  }
  const dateStr = String(date || '').trim() || new Date().toISOString().slice(0, 10);
  const timeStr = String(time || '').trim() || '00:00';
  const customMsg = String(message || '').trim();
  const title = 'Konkurs e\'loni';
  const body = customMsg || (role === 'courier'
    ? `Kuryerlar uchun konkurs ${dateStr} sana ${timeStr} da e'lon qilindi. Reyting panelda ko'rinadi.`
    : `Operatorlar uchun konkurs ${dateStr} sana ${timeStr} da e'lon qilindi. Reyting panelda ko'rinadi.`);

  const userIds = db.prepare(`
    SELECT id FROM users WHERE LOWER(role) = ?
  `).all(role);
  const insert = db.prepare(`
    INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)
  `);
  for (const row of userIds) {
    insert.run(row.id, title, body);
  }
  res.json({ ok: true, sent: userIds.length });
});

/** Buxgalteriya qidiruvi: ishchi rol, seller, staff yoki platforma foydalanuvchisi */
function resolveAccountingEntity(rawQ) {
  const raw = String(rawQ || '').trim();
  if (!raw) return null;

  const idNum = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isNaN(idNum) && idNum > 0) {
    const wr = db.prepare('SELECT id, role_name FROM work_roles WHERE id = ? AND deleted_at IS NULL').get(idNum);
    if (wr) return { kind: 'work_role', id: wr.id, label: wr.role_name };
    const se = db.prepare('SELECT id, name FROM sellers WHERE id = ?').get(idNum);
    if (se) return { kind: 'seller', id: se.id, label: se.name };
    const st = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ?').get(idNum);
    if (st) return { kind: 'staff', id: st.id, label: st.full_name || `Xodim #${st.id}` };
    const us = db.prepare(`
      SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), login, email, 'Foydalanuvchi') as label
      FROM users WHERE id = ?
    `).get(idNum);
    if (us) return { kind: 'user', id: us.id, label: us.label };
  }

  const like = `%${raw}%`;
  const wr = db.prepare(`
    SELECT id, role_name FROM work_roles WHERE deleted_at IS NULL
    AND (role_name LIKE ? OR login LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(phone,'') LIKE ?)
    ORDER BY id DESC LIMIT 1
  `).get(like, like, like, like);
  if (wr) return { kind: 'work_role', id: wr.id, label: wr.role_name };

  const se = db.prepare(`
    SELECT id, name FROM sellers
    WHERE name LIKE ? OR IFNULL(contact_phone,'') LIKE ? OR IFNULL(email,'') LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(like, like, like);
  if (se) return { kind: 'seller', id: se.id, label: se.name };

  const st = db.prepare(`
    SELECT s.id, s.full_name FROM staff_members s
    LEFT JOIN users u_by ON u_by.staff_member_id = s.id
    LEFT JOIN users u_id ON u_id.id = s.user_id
    WHERE s.full_name LIKE ? OR IFNULL(s.phone,'') LIKE ? OR IFNULL(u_by.login,'') LIKE ? OR IFNULL(u_id.login,'') LIKE ?
    ORDER BY s.id DESC LIMIT 1
  `).get(like, like, like, like);
  if (st) return { kind: 'staff', id: st.id, label: st.full_name || `Xodim #${st.id}` };

  const us = db.prepare(`
    SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), login, email, 'Foydalanuvchi') as label FROM users
    WHERE IFNULL(full_name,'') LIKE ? OR IFNULL(login,'') LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(phone,'') LIKE ?
    ORDER BY id DESC LIMIT 1
  `).get(like, like, like, like);
  if (us) return { kind: 'user', id: us.id, label: us.label };

  return null;
}

router.get('/accounting', (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const from = req.query.from ? String(req.query.from).trim() : '';
  const to = req.query.to ? String(req.query.to).trim() : '';

  let filterSql = " WHERE o.status NOT IN ('cancelled', 'archived')";
  const params = [];

  if (from) {
    filterSql += ' AND substr(o.created_at, 1, 10) >= ?';
    params.push(from);
  }
  if (to) {
    filterSql += ' AND substr(o.created_at, 1, 10) <= ?';
    params.push(to);
  }

  const emptySellers = [];
  const roleMoneyGlobal = db.prepare('SELECT COALESCE(SUM(fine_amount), 0) as fines, COALESCE(SUM(reward_amount), 0) as rewards FROM work_roles WHERE deleted_at IS NULL').get();
  const sellerBalanceGlobal = db.prepare('SELECT COALESCE(SUM(balance), 0) as s FROM sellers').get().s;

  if (q) {
    const ent = resolveAccountingEntity(q);
    if (!ent) {
      return res.json({
        filter: { type: 'none', label: q },
        summary: {
          grossRevenue: 0,
          ordersCount: 0,
          averageCheck: 0,
          sellerBalance: 0,
          finesTotal: 0,
          rewardsTotal: 0,
        },
        daily: [],
        statusBreakdown: [],
        sellers: emptySellers,
      });
    }

    if (ent.kind === 'work_role') {
      const wr = db.prepare('SELECT * FROM work_roles WHERE id = ? AND deleted_at IS NULL').get(ent.id);
      if (!wr) {
        return res.json({
          filter: { type: 'none', label: q },
          summary: { grossRevenue: 0, ordersCount: 0, averageCheck: 0, sellerBalance: 0, finesTotal: 0, rewardsTotal: 0 },
          daily: [],
          statusBreakdown: [],
          sellers: emptySellers,
        });
      }
      const oc = wr.orders_count || 0;
      const ta = wr.total_amount || 0;
      return res.json({
        filter: { type: 'work_role', id: wr.id, label: wr.role_name },
        summary: {
          grossRevenue: ta,
          ordersCount: oc,
          averageCheck: oc > 0 ? ta / oc : 0,
          sellerBalance: 0,
          finesTotal: wr.fine_amount || 0,
          rewardsTotal: wr.reward_amount || 0,
        },
        daily: [],
        statusBreakdown: [],
        sellers: emptySellers,
      });
    }

    let sellerRow = null;
    if (ent.kind === 'seller') {
      sellerRow = db.prepare('SELECT id, name, balance, status FROM sellers WHERE id = ?').get(ent.id);
      filterSql += ` AND EXISTS (
        SELECT 1 FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id AND p.seller_id = ?
      )`;
      params.push(ent.id);
    } else if (ent.kind === 'staff') {
      filterSql += ' AND (o.courier_id = ? OR o.packer_id = ?)';
      params.push(ent.id, ent.id);
    } else if (ent.kind === 'user') {
      filterSql += ' AND o.user_id = ?';
      params.push(ent.id);
    }

    const revenue = db.prepare(`
      SELECT COALESCE(SUM(o.total_amount), 0) as gross_revenue, COUNT(*) as orders_count
      FROM orders o
      ${filterSql}
    `).get(...params);

    const statusBreakdown = db.prepare(`
      SELECT o.status, COUNT(*) as count, COALESCE(SUM(o.total_amount), 0) as amount
      FROM orders o
      ${filterSql}
      GROUP BY o.status
      ORDER BY amount DESC
    `).all(...params);

    const daily = db.prepare(`
      SELECT substr(o.created_at, 1, 10) as day, COALESCE(SUM(o.total_amount), 0) as total
      FROM orders o
      ${filterSql}
      GROUP BY day
      ORDER BY day DESC
      LIMIT 14
    `).all(...params).reverse();

    const ordersCount = revenue.orders_count || 0;
    const grossRevenue = revenue.gross_revenue || 0;

    let sellerBalance = 0;
    let sellersOut = emptySellers;
    if (ent.kind === 'seller' && sellerRow) {
      sellerBalance = sellerRow.balance || 0;
      sellersOut = [{ id: sellerRow.id, name: sellerRow.name, balance: sellerRow.balance, status: sellerRow.status }];
    }

    return res.json({
      filter: { type: ent.kind, id: ent.id, label: ent.label },
      summary: {
        grossRevenue,
        ordersCount,
        averageCheck: ordersCount > 0 ? grossRevenue / ordersCount : 0,
        sellerBalance,
        finesTotal: 0,
        rewardsTotal: 0,
      },
      daily,
      statusBreakdown,
      sellers: sellersOut,
    });
  }

  const revenue = db.prepare(`
    SELECT COALESCE(SUM(o.total_amount), 0) as gross_revenue, COUNT(*) as orders_count
    FROM orders o
    ${filterSql}
  `).get(...params);

  const statusBreakdown = db.prepare(`
    SELECT o.status, COUNT(*) as count, COALESCE(SUM(o.total_amount), 0) as amount
    FROM orders o
    ${filterSql}
    GROUP BY o.status
    ORDER BY amount DESC
  `).all(...params);

  const daily = db.prepare(`
    SELECT substr(o.created_at, 1, 10) as day, COALESCE(SUM(o.total_amount), 0) as total
    FROM orders o
    ${filterSql}
    GROUP BY day
    ORDER BY day DESC
    LIMIT 14
  `).all(...params).reverse();

  const sellers = db.prepare('SELECT id, name, balance, status FROM sellers ORDER BY balance DESC LIMIT 8').all();

  const ordersCount = revenue.orders_count || 0;
  const grossRevenue = revenue.gross_revenue || 0;

  res.json({
    filter: null,
    summary: {
      grossRevenue,
      ordersCount,
      averageCheck: ordersCount > 0 ? grossRevenue / ordersCount : 0,
      sellerBalance: sellerBalanceGlobal,
      finesTotal: roleMoneyGlobal.fines || 0,
      rewardsTotal: roleMoneyGlobal.rewards || 0,
    },
    daily,
    statusBreakdown,
    sellers,
  });
});

router.get('/work-roles', (req, res) => {
  const search = req.query.search ? String(req.query.search).trim() : '';
  const status = req.query.status ? String(req.query.status).trim() : '';

  let sql = 'SELECT * FROM work_roles WHERE deleted_at IS NULL';
  const params = [];

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    sql += ' AND (CAST(id AS TEXT) LIKE ? OR role_name LIKE ? OR login LIKE ? OR IFNULL(email,\'\') LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ roles: rows.map(roleRowToDto) });
});

router.get('/work-roles/trash', (_req, res) => {
  const rows = db.prepare('SELECT * FROM work_roles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
  res.json({ roles: rows.map(roleRowToDto) });
});

/** Savatni to'zala — barcha o'chirilgan rollarni butunlay o'chirish */
router.delete('/work-roles/trash', (_req, res) => {
  const result = db.prepare('DELETE FROM work_roles WHERE deleted_at IS NOT NULL').run();
  res.json({ ok: true, deleted: result.changes });
});

router.post('/work-roles', (req, res) => {
  const roleName = String(req.body?.role_name || '').trim();
  const loginRaw = String(req.body?.login || '').trim();
  const login = makeUniqueLogin(loginRaw || roleName);
  const password = String(req.body?.password || '12345');
  const phone = String(req.body?.phone || '').trim() || null;
  const email = String(req.body?.email || '').trim() || null;
  const task = String(req.body?.task || '').trim() || null;
  const description = String(req.body?.description || '').trim() || null;
  const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  const statusRaw = String(req.body?.status || 'pending').trim();
  const status = WORK_ROLE_STATUSES.has(statusRaw) ? statusRaw : 'pending';
  const portal_role = parseWorkPortalRole(req.body);
  const courier_viloyat_id = String(req.body?.courier_viloyat_id || '').trim() || null;
  const courier_tuman_ids_raw = Array.isArray(req.body?.courier_tuman_ids) ? req.body.courier_tuman_ids : [];
  const courier_tuman_ids_json = JSON.stringify(courier_tuman_ids_raw.map((x) => String(x).trim()).filter(Boolean));

  if (!roleName) return res.status(400).json({ error: 'Rol nomi kerak.' });
  if (portal_role === 'courier' && !courier_viloyat_id) {
    return res.status(400).json({ error: 'Kuryer uchun yetkazish viloyati (hudud) tanlanishi kerak.' });
  }
  const loginNorm = (login || '').trim().toLowerCase();
  const passwordNorm = String(password || '').trim();
  if (loginNorm && passwordNorm && loginNorm === passwordNorm.toLowerCase()) {
    return res.status(400).json({ error: 'Login va parol bir xil bo\'lmasligi kerak. Kamida bitta belgi farq qilishi kerak.' });
  }

  const result = db.prepare(`
    INSERT INTO work_roles (
      role_name, login, password, phone, email, task, description, permissions_json, status, portal_role,
      orders_count, badges_count, rank_title, fines_count, fine_amount, reward_amount, total_amount,
      courier_viloyat_id, courier_tuman_ids_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'Junior', 0, 0, 0, 0, ?, ?)
  `).run(
    roleName,
    login,
    password,
    phone,
    email,
    task,
    description,
    JSON.stringify(permissions),
    status,
    portal_role,
    portal_role === 'courier' ? courier_viloyat_id : null,
    portal_role === 'courier' ? courier_tuman_ids_json : '[]',
  );

  const row = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(result.lastInsertRowid);
  syncStaffCourierRegionServiceFromWorkRole(row.id);
  res.status(201).json(roleRowToDto(row));
});

// Restore va permanent :id dan oldin bo'lishi kerak (aniq yo'l birinchi match qiladi)
router.post('/work-roles/:id/restore', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  const existing = db.prepare('SELECT id FROM work_roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Rol topilmadi.' });
  db.prepare('UPDATE work_roles SET deleted_at = NULL WHERE id = ?').run(id);
  const restored = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(id);
  res.json(roleRowToDto(restored));
});

router.delete('/work-roles/:id/permanent', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  const row = db.prepare('SELECT id, deleted_at FROM work_roles WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Rol topilmadi.' });
  if (row.deleted_at == null) return res.status(400).json({ error: 'Faqat savatdagi (o\'chirilgan) rolni butunlay o\'chirish mumkin.' });
  db.prepare('DELETE FROM work_roles WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.get('/work-roles/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  const row = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Rol topilmadi.' });
  res.json(roleRowToDto(row));
});

router.patch('/work-roles/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Rol topilmadi.' });

  const next = {
    role_name: req.body?.role_name != null ? String(req.body.role_name).trim() : existing.role_name,
    login: req.body?.login != null ? normalizeLogin(req.body.login) : existing.login,
    password: req.body?.password != null ? String(req.body.password) : existing.password,
    phone: req.body?.phone != null ? String(req.body.phone).trim() : existing.phone,
    email: req.body?.email != null ? String(req.body.email).trim() : existing.email,
    task: req.body?.task != null ? String(req.body.task).trim() : existing.task,
    description: req.body?.description != null ? String(req.body.description).trim() : existing.description,
    permissions_json: req.body?.permissions != null ? JSON.stringify(req.body.permissions) : existing.permissions_json,
    status: req.body?.status != null ? String(req.body.status).trim() : existing.status,
    orders_count: req.body?.orders_count != null ? Number.parseInt(req.body.orders_count, 10) : existing.orders_count,
    badges_count: req.body?.badges_count != null ? Number.parseInt(req.body.badges_count, 10) : existing.badges_count,
    rank_title: req.body?.rank_title != null ? String(req.body.rank_title).trim() : existing.rank_title,
    fines_count: req.body?.fines_count != null ? Number.parseInt(req.body.fines_count, 10) : existing.fines_count,
    fine_amount: req.body?.fine_amount != null ? Number.parseFloat(req.body.fine_amount) : existing.fine_amount,
    reward_amount: req.body?.reward_amount != null ? Number.parseFloat(req.body.reward_amount) : existing.reward_amount,
    total_amount: req.body?.total_amount != null ? Number.parseFloat(req.body.total_amount) : existing.total_amount,
  };

  let portal_role = existing.portal_role ?? null;
  if (req.body?.portal_role !== undefined) {
    const pr = String(req.body.portal_role || '').trim().toLowerCase();
    if (!pr) portal_role = null;
    else if (WORK_PORTAL_ROLES.has(pr)) portal_role = pr;
    else return res.status(400).json({ error: 'portal_role: seller, courier, operator, picker, packer, expeditor yoki order_receiver.' });
  }

  let courier_viloyat_id =
    existing.courier_viloyat_id != null ? String(existing.courier_viloyat_id).trim() || null : null;
  if (req.body?.courier_viloyat_id !== undefined) {
    courier_viloyat_id = String(req.body.courier_viloyat_id || '').trim() || null;
  }
  let courier_tuman_ids_json = existing.courier_tuman_ids_json || '[]';
  if (req.body?.courier_tuman_ids !== undefined) {
    const arr = Array.isArray(req.body.courier_tuman_ids) ? req.body.courier_tuman_ids : [];
    courier_tuman_ids_json = JSON.stringify(arr.map((x) => String(x).trim()).filter(Boolean));
  }
  if (portal_role === 'courier' && !courier_viloyat_id) {
    return res.status(400).json({ error: 'Kuryer uchun yetkazish viloyati tanlanishi kerak.' });
  }
  if (portal_role !== 'courier') {
    courier_viloyat_id = null;
    courier_tuman_ids_json = '[]';
  }

  if (!next.role_name) return res.status(400).json({ error: 'Rol nomi kerak.' });
  if (!next.login) return res.status(400).json({ error: 'Login kerak.' });
  if (!WORK_ROLE_STATUSES.has(next.status)) return res.status(400).json({ error: 'Noto\'g\'ri status.' });
  const loginNorm = String(next.login || '').trim().toLowerCase();
  const passwordNorm = String(next.password || '').trim();
  if (loginNorm && passwordNorm && loginNorm === passwordNorm.toLowerCase()) {
    return res.status(400).json({ error: 'Login va parol bir xil bo\'lmasligi kerak. Kamida bitta belgi farq qilishi kerak.' });
  }

  try {
    db.prepare(`
      UPDATE work_roles
      SET
        role_name = ?,
        login = ?,
        password = ?,
        phone = ?,
        email = ?,
        task = ?,
        description = ?,
        permissions_json = ?,
        status = ?,
        portal_role = ?,
        orders_count = ?,
        badges_count = ?,
        rank_title = ?,
        fines_count = ?,
        fine_amount = ?,
        reward_amount = ?,
        total_amount = ?,
        courier_viloyat_id = ?,
        courier_tuman_ids_json = ?
      WHERE id = ?
    `).run(
      next.role_name,
      next.login,
      next.password,
      next.phone || null,
      next.email || null,
      next.task || null,
      next.description || null,
      next.permissions_json,
      next.status,
      portal_role,
      next.orders_count || 0,
      next.badges_count || 0,
      next.rank_title || 'Junior',
      next.fines_count || 0,
      next.fine_amount || 0,
      next.reward_amount || 0,
      next.total_amount || 0,
      courier_viloyat_id,
      courier_tuman_ids_json,
      id
    );
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Bu login band.' });
    }
    throw e;
  }

  const updated = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(id);
  syncStaffCourierRegionServiceFromWorkRole(id);
  res.json(roleRowToDto(updated));
});

router.post('/work-roles/:id/actions', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const action = String(req.body?.action || '').trim();
  const amount = req.body?.amount != null ? Number.parseFloat(req.body.amount) : 0;

  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const role = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(id);
  if (!role) return res.status(404).json({ error: 'Rol topilmadi.' });

  if (action === 'activate') {
    db.prepare('UPDATE work_roles SET status = ? WHERE id = ?').run('active', id);
  } else if (action === 'block') {
    db.prepare('UPDATE work_roles SET status = ? WHERE id = ?').run('blocked', id);
  } else if (action === 'fine') {
    const v = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    db.prepare('UPDATE work_roles SET fines_count = fines_count + 1, fine_amount = fine_amount + ?, total_amount = total_amount - ? WHERE id = ?').run(v, v, id);
    if (v > 0)
      insertWorkRoleLedgerEntry({ work_role_id: id, kind: 'fine', amount: v, title: 'Jarima', note: null });
  } else if (action === 'reward') {
    const v = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    db.prepare('UPDATE work_roles SET reward_amount = reward_amount + ?, total_amount = total_amount + ? WHERE id = ?').run(v, v, id);
    if (v > 0)
      insertWorkRoleLedgerEntry({ work_role_id: id, kind: 'reward', amount: v, title: 'Mukofot', note: null });
  } else if (action === 'oylik') {
    const v = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    db.prepare('UPDATE work_roles SET total_amount = ? WHERE id = ?').run(v, id);
    insertWorkRoleLedgerEntry({
      work_role_id: id,
      kind: 'balance_set',
      amount: v,
      title: 'Balans / oylik',
      note: `Yangi balans: ${v.toLocaleString('uz-UZ')} so'm`,
    });
  } else if (action === 'delete') {
    db.prepare('UPDATE work_roles SET deleted_at = ? WHERE id = ?').run(nowSql(), id);
  } else {
    return res.status(400).json({ error: 'Noto\'g\'ri action.' });
  }

  const updated = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(id);
  res.json(roleRowToDto(updated));
});

router.delete('/work-roles/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT id FROM work_roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Rol topilmadi.' });

  db.prepare('UPDATE work_roles SET deleted_at = ? WHERE id = ?').run(nowSql(), id);
  res.json({ ok: true });
});

router.get('/withdrawal-requests', (req, res) => {
  const status = req.query.status === 'approved' || req.query.status === 'rejected' ? req.query.status : 'pending';

  const sql = `
    SELECT wr.id, wr.work_role_id, wr.amount, wr.status, wr.created_at, wr.reviewed_at, wr.note, wr.payout_method,
           w.login AS work_role_login, w.role_name, w.phone AS work_role_phone, w.email AS work_role_email
    FROM withdrawal_requests wr
    JOIN work_roles w ON w.id = wr.work_role_id
    WHERE wr.status = ?
    ORDER BY wr.created_at ASC
  `;

  const rows = db.prepare(sql).all(status);
  res.json({ requests: rows });
});

router.patch('/withdrawal-requests/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim();
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ error: 'status: approved yoki rejected bo\'lishi kerak.' });
  const row = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ? AND status = ?').get(id, 'pending');
  if (!row) return res.status(404).json({ error: 'So\'rov topilmadi yoki allaqachon ko\'rib chiqilgan.' });
  const workRole = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(row.work_role_id);
  if (!workRole) return res.status(404).json({ error: 'Work role topilmadi.' });

  let notifyUserId = null;
  const byLogin = db.prepare("SELECT id FROM users WHERE length(trim(ifnull(login, ''))) > 0 AND lower(login) = lower(?)").get(workRole.login);
  if (byLogin) notifyUserId = byLogin.id;
  else if (workRole.email && String(workRole.email).trim()) {
    const byEmail = db.prepare("SELECT id FROM users WHERE length(trim(ifnull(email, ''))) > 0 AND lower(email) = lower(?)").get(workRole.email);
    if (byEmail) notifyUserId = byEmail.id;
  }

  db.prepare(`
    UPDATE withdrawal_requests SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?, note = ? WHERE id = ?
  `).run(status, req.user.id, note || null, id);
  if (status === 'approved') {
    const newTotal = Math.max(0, (Number(workRole.total_amount) || 0) - Number(row.amount));
    db.prepare('UPDATE work_roles SET total_amount = ? WHERE id = ?').run(newTotal, workRole.id);
    if (notifyUserId) {
      const title = 'Pul yechish tasdiqlandi';
      const body = note || `So'rovingiz tasdiqlandi. ${Number(row.amount).toLocaleString('uz-UZ')} so'm.`;
      db.prepare('INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)').run(notifyUserId, title, body);
    }
  }
  if (status === 'rejected' && notifyUserId) {
    const title = 'Pul yechish rad etildi';
    const body = note || 'So\'rovingiz rad etildi.';
    db.prepare('INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)').run(notifyUserId, title, body);
  }
  res.json({ ok: true });
});

/** Barcha seller mahsulotlari — moderatsiya (barcha statuslar, ro‘yxatda qoladi) */
router.get('/seller-products-catalog', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.name_uz,
         p.name_ru,
         p.description_uz,
         p.category,
         p.price,
         p.currency,
         p.stock,
         p.image_url,
         p.video_url,
         p.status,
         p.seller_id,
         p.operator_share_percent,
         p.site_fee_percent,
         p.discount_percent,
         p.promotion_ends_at,
         p.goes_live_at,
         p.created_at,
         s.name AS seller_name,
         s.contact_phone AS seller_phone,
         s.email AS seller_email
       FROM products p
       INNER JOIN sellers s ON s.id = p.seller_id
       ORDER BY datetime(COALESCE(p.created_at, '1970-01-01')) DESC, p.id DESC`
    )
    .all();
  res.json({ products: rows });
});

/** Seller yaratgan, hali «sotuvda» emas — superuser tasdiqlaguncha sayt olamida ko‘rinmaydi */
router.get('/pending-seller-products', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.name_uz,
         p.name_ru,
         p.description_uz,
         p.category,
         p.price,
         p.stock,
         p.image_url,
         p.video_url,
         p.status,
         p.seller_id,
         p.created_at,
         s.name AS seller_name,
         s.contact_phone AS seller_phone,
         s.email AS seller_email
       FROM products p
       INNER JOIN sellers s ON s.id = p.seller_id
       WHERE p.seller_id IS NOT NULL
         AND (
           p.status IS NULL
           OR TRIM(COALESCE(p.status, '')) = ''
           OR LOWER(TRIM(p.status)) = 'pending'
         )
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ products: rows });
});

/** Bosh sahifa reklama slaydlari (superuser) */
router.get('/ad-slides', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT id, sort_order, title, subtitle, link_url, image_url, video_url, active, created_at FROM ad_slides ORDER BY sort_order ASC, id ASC',
    )
    .all();
  res.json({ slides: rows });
});

router.post('/ad-slides/upload', (req, res, next) => {
  adSlideImageUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Rasm hajmi 5 MB dan oshmasin.' });
        }
        return res.status(400).json({ error: 'Yuklash xatosi.' });
      }
      if (err.message === 'AD_IMAGE_TYPE') {
        return res.status(400).json({ error: 'Faqat JPG, PNG, GIF yoki WebP.' });
      }
      return res.status(400).json({ error: 'Rasm yuklanmadi.' });
    }
    next();
  });
}, (req, res) => {
  if (!req.file?.filename) return res.status(400).json({ error: 'Fayl tanlang.' });
  const url = `/api/uploads/ad-slides/${req.file.filename}`;
  res.json({ url });
});

router.post('/ad-slides/upload-video', (req, res, next) => {
  adSlideVideoUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Video hajmi 80 MB dan oshmasin.' });
        }
        return res.status(400).json({ error: 'Yuklash xatosi.' });
      }
      if (err.message === 'AD_VIDEO_TYPE') {
        return res.status(400).json({ error: 'Faqat MP4, WebM, OGG yoki MOV video yuklang.' });
      }
      return res.status(400).json({ error: 'Video yuklanmadi.' });
    }
    next();
  });
}, (req, res) => {
  if (!req.file?.filename) return res.status(400).json({ error: 'Fayl tanlang.' });
  const url = `/api/uploads/ad-slides/${req.file.filename}`;
  res.json({ url });
});

router.post('/ad-slides', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: 'Sarlavha kerak.' });
  const subtitle = String(req.body?.subtitle || '').trim().slice(0, 500);
  const link_url = normalizeAdSlideLink(req.body?.link_url);
  const image_url = String(req.body?.image_url || '').trim().slice(0, 800) || null;
  const video_url = normalizeAdSlideVideoUrl(req.body?.video_url);
  const active = req.body?.active === false || req.body?.active === 0 ? 0 : 1;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM ad_slides').get().m;
  const result = db
    .prepare(
      'INSERT INTO ad_slides (sort_order, title, subtitle, link_url, image_url, video_url, active) VALUES (?,?,?,?,?,?,?)',
    )
    .run(maxOrder + 1, title, subtitle, link_url, image_url, video_url, active);
  const row = db.prepare('SELECT * FROM ad_slides WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ slide: row });
});

router.patch('/ad-slides/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  const existing = db.prepare('SELECT * FROM ad_slides WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Slayd topilmadi.' });

  const title = req.body?.title !== undefined ? String(req.body.title || '').trim().slice(0, 200) : existing.title;
  if (!title) return res.status(400).json({ error: 'Sarlavha bo\'sh bo\'lmasligi kerak.' });
  const subtitle =
    req.body?.subtitle !== undefined ? String(req.body.subtitle || '').trim().slice(0, 500) : existing.subtitle;
  let link_url = existing.link_url;
  if (req.body?.link_url !== undefined) {
    link_url = normalizeAdSlideLink(req.body.link_url);
  }
  let image_url = existing.image_url;
  if (req.body?.image_url !== undefined) {
    const v = String(req.body.image_url || '').trim().slice(0, 800);
    image_url = v || null;
  }
  let video_url = existing.video_url;
  if (req.body?.video_url !== undefined) {
    const raw = req.body.video_url;
    video_url = raw === '' || raw === null ? null : normalizeAdSlideVideoUrl(raw);
  }
  let active = existing.active;
  if (req.body?.active !== undefined) {
    active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  }

  db.prepare(
    'UPDATE ad_slides SET title = ?, subtitle = ?, link_url = ?, image_url = ?, video_url = ?, active = ? WHERE id = ?',
  ).run(title, subtitle, link_url, image_url, video_url, active, id);
  const row = db.prepare('SELECT * FROM ad_slides WHERE id = ?').get(id);
  res.json({ slide: row });
});

router.delete('/ad-slides/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  const r = db.prepare('DELETE FROM ad_slides WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Slayd topilmadi.' });
  res.json({ ok: true });
});

router.post('/ad-slides/:id/move', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const direction = String(req.body?.direction || '').toLowerCase();
  if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction: up yoki down.' });
  }
  const list = db.prepare('SELECT id, sort_order FROM ad_slides ORDER BY sort_order ASC, id ASC').all();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return res.status(404).json({ error: 'Slayd topilmadi.' });
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) {
    return res.json({
      slides: db
        .prepare(
          'SELECT id, sort_order, title, subtitle, link_url, image_url, video_url, active, created_at FROM ad_slides ORDER BY sort_order ASC, id ASC',
        )
        .all(),
    });
  }
  const a = list[idx];
  const b = list[swapWith];
  const tx = db.transaction(() => {
    db.prepare('UPDATE ad_slides SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
    db.prepare('UPDATE ad_slides SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);
  });
  tx();
  const rows = db
    .prepare(
      'SELECT id, sort_order, title, subtitle, link_url, image_url, video_url, active, created_at FROM ad_slides ORDER BY sort_order ASC, id ASC',
    )
    .all();
  res.json({ slides: rows });
});

export default router;
