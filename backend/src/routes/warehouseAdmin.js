import { Router } from 'express';
import { db } from '../db/database.js';
import {
  applyChiqimStockReduction,
  applyKirimStockDelta,
  recordKirimLedgerEvent,
  reverseChiqimStock,
  reverseKirimStock,
  warehouseActorRole,
} from '../services/warehouseLedgerService.js';
import { notifyWarehouseMovement } from '../lib/warehouseMovementNotify.js';
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
import { EVENT_TYPES } from '../events/eventTypes.js';
import { actorFromRequest, publishEnterpriseEvent } from '../events/publishEvent.js';
import { getViloyatEntryById, orderMatchesViloyatEntry, PACKER_UZ_VILOYATLAR } from '../utils/viloyatPacker.js';
import { sqlStaffHasActiveWorkRole } from '../lib/workRoleArchive.js';

const router = Router();
router.use(authRequired, requireRole('warehouse_admin', 'superuser'));

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
      role_label: 'Ombor admini',
      system_role: u.role || 'warehouse_admin',
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
      req.user.id,
    );
  } catch (e) {
    console.error('warehouse-admin profile patch', e);
    return res.status(500).json({ error: 'Saqlashda xatolik.' });
  }

  const updated = db
    .prepare('SELECT id, full_name, last_name, phone, avatar_url, email, login, role FROM users WHERE id = ?')
    .get(req.user.id);
  const sp = splitUserName(updated.full_name, updated.last_name);
  publishEnterpriseEvent({
    eventType: EVENT_TYPES.INVENTORY_REMOVED,
    module: 'warehouse',
    entityType: 'product',
    entityId: id,
    ...actorFromRequest(req),
    oldValue: { stock: stockResult.stock_before },
    newValue: { stock: stockResult.stock_after, qty, movement: 'chiqim' },
    metadata: { actor_label: actorLabel, actor_role: actorRole },
  });

  res.json({
    ok: true,
    profile: {
      first_name: sp.firstName,
      last_name: sp.lastName,
      full_name: String(updated.full_name || '').trim(),
      phone: String(updated.phone || '').trim(),
      avatar_url: String(updated.avatar_url || '').trim(),
      role_label: 'Ombor admini',
      system_role: updated.role || 'warehouse_admin',
      email: String(updated.email || '').trim(),
      login: String(updated.login || '').trim(),
    },
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

/**
 * Sklad uchun: har bir sotuvchi mahsuloti alohida qator.
 * - orders_chiqim / orders_atkaz — buyurtmalar bo'yicha HISOB (ko‘rsatkich).
 * - warehouse_* — ombor qo‘lda yozadi; chiqim/atkaz/brak sahifalari faqat tasdiq + miqdor>0.
 */
router.get('/products-overview', (req, res) => {
  const qRaw = String(req.query.q || '').trim();
  const bucketRaw = String(req.query.bucket || 'active').trim().toLowerCase();
  const bucket = bucketRaw === 'delisted' || bucketRaw === 'deleted' ? bucketRaw : 'active';

  const clauses = [`p.seller_id IS NOT NULL`];
  const params = [];

  if (bucket === 'deleted') {
    clauses.push(`p.warehouse_deleted_at IS NOT NULL`);
  } else if (bucket === 'delisted') {
    clauses.push(`(p.warehouse_delisted_at IS NOT NULL OR p.warehouse_relisted_at IS NOT NULL)`);
    clauses.push(`(p.warehouse_deleted_at IS NULL OR trim(coalesce(p.warehouse_deleted_at, '')) = '')`);
  } else {
    clauses.push(`(p.warehouse_deleted_at IS NULL OR trim(coalesce(p.warehouse_deleted_at, '')) = '')`);
    clauses.push(`(p.warehouse_delisted_at IS NULL OR trim(coalesce(p.warehouse_delisted_at, '')) = '')`);
  }

  const qLc = `%${String(qRaw).toLowerCase().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
  if (qRaw) {
    clauses.push(`(
      lower(trim(coalesce(p.name_uz, ''))) LIKE ? ESCAPE '\\'
      OR lower(trim(coalesce(s.name, ''))) LIKE ? ESCAPE '\\'
    )`);
    params.push(qLc, qLc);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `
    SELECT
      p.id AS id,
      trim(coalesce(p.name_uz, '')) AS name_uz,
      trim(coalesce(p.image_url, '')) AS image_url,
      coalesce(p.stock, 0) AS stock,
      coalesce(p.price, 0) AS price,
      coalesce(p.discount_percent, 0) AS discount_percent,
      coalesce(p.brak_qty, 0) AS brak_qty,
      coalesce(p.seller_id, 0) AS seller_id,
      trim(coalesce(s.name, '')) AS seller_name,
      trim(lower(coalesce(p.status, ''))) AS status,
      p.created_at AS created_at,
      p.warehouse_approved_at AS warehouse_approved_at,
      coalesce(p.warehouse_kirim_qty, 0) AS warehouse_kirim_qty,
      coalesce(p.warehouse_chiqim_qty, 0) AS warehouse_chiqim_qty,
      coalesce(p.warehouse_atkaz_qty, 0) AS warehouse_atkaz_qty,
      p.warehouse_chiqim_confirmed_at AS warehouse_chiqim_confirmed_at,
      p.warehouse_atkaz_confirmed_at AS warehouse_atkaz_confirmed_at,
      p.warehouse_brak_confirmed_at AS warehouse_brak_confirmed_at,
      p.warehouse_delisted_at AS warehouse_delisted_at,
      p.warehouse_relisted_at AS warehouse_relisted_at,
      p.warehouse_deleted_at AS warehouse_deleted_at,
      coalesce(ord_agg.chiqim_soni, 0) AS orders_chiqim_soni,
      coalesce(ord_agg.atkaz_soni, 0) AS orders_atkaz_soni
    FROM products p
    INNER JOIN sellers s ON s.id = p.seller_id
    LEFT JOIN (
      SELECT
        oi.product_id AS pid,
        SUM(CASE
          WHEN lower(trim(coalesce(o.status, ''))) NOT IN ('cancelled', 'archived')
            AND COALESCE(o.courier_unsold_return, 0) <> 1
          THEN oi.quantity
          ELSE 0
        END) AS chiqim_soni,
        SUM(CASE
          WHEN lower(trim(coalesce(o.status, ''))) IN ('cancelled', 'archived')
            OR COALESCE(o.courier_unsold_return, 0) = 1
          THEN oi.quantity
          ELSE 0
        END) AS atkaz_soni
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      GROUP BY oi.product_id
    ) ord_agg ON ord_agg.pid = p.id
    ${whereSql}
    ORDER BY p.id DESC
    LIMIT 1200
  `,
    )
    .all(...params);

  const mapped = rows.map((r) => ({
    id: Number(r.id),
    seller_id: Number(r.seller_id),
    seller_name: String(r.seller_name || '').trim() || '—',
    name_uz: String(r.name_uz || ''),
    image_url: String(r.image_url || ''),
    stock: Number(r.stock) || 0,
    price: Number(r.price) || 0,
    discount_percent: Number(r.discount_percent) || 0,
    brak_qty: Number(r.brak_qty) || 0,
    created_at: String(r.created_at || '').trim() || null,
    warehouse_kirim_qty: Number(r.warehouse_kirim_qty) || 0,
    warehouse_chiqim_qty: Number(r.warehouse_chiqim_qty) || 0,
    warehouse_atkaz_qty: Number(r.warehouse_atkaz_qty) || 0,
    warehouse_chiqim_confirmed_at: r.warehouse_chiqim_confirmed_at || null,
    warehouse_atkaz_confirmed_at: r.warehouse_atkaz_confirmed_at || null,
    warehouse_brak_confirmed_at: r.warehouse_brak_confirmed_at || null,
    warehouse_approved_at: r.warehouse_approved_at || null,
    warehouse_delisted_at: r.warehouse_delisted_at || null,
    warehouse_relisted_at: r.warehouse_relisted_at || null,
    warehouse_deleted_at: r.warehouse_deleted_at || null,
    status: String(r.status || '').trim() || 'pending',
    orders_chiqim_soni: Number(r.orders_chiqim_soni) || 0,
    orders_atkaz_soni: Number(r.orders_atkaz_soni) || 0,
    /** Jadval ustunlari: kirim — ombor yozuvi; chiqim/atkaz — buyurtma hisobi (ko‘rsatkich) */
    kirim_soni: Number(r.warehouse_kirim_qty) || 0,
    chiqim_soni: Number(r.orders_chiqim_soni) || 0,
    atkaz_soni: Number(r.orders_atkaz_soni) || 0,
  }));

  res.json({ products: mapped });
});

function parseNonNegInt(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number.parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function warehouseActorLabel(req) {
  return String(req.user?.full_name || req.user?.login || req.user?.email || 'Ombor admini').slice(0, 160);
}

function productTitleUz(row) {
  return String(row?.name_uz || row?.name_ru || 'Mahsulot').slice(0, 120);
}

/** Ombor sonlarini tahrirlash (kirim/chiqim/atkaz/brak) */
router.patch('/products/:id/warehouse-ledger', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const row = db
    .prepare(
      `SELECT id, warehouse_kirim_qty, warehouse_chiqim_qty, warehouse_atkaz_qty, brak_qty,
              warehouse_approved_at, warehouse_chiqim_confirmed_at, warehouse_atkaz_confirmed_at, warehouse_brak_confirmed_at,
              warehouse_deleted_at
       FROM products WHERE id = ?`,
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }

  const body = req.body || {};

  // Tasdiqlangan harakat miqdori oddiy PATCH orqali o'zgartirilsa, ledger va stock
  // bir-biridan uzilib qoladi. Bunday o'zgarish faqat bekor qilish va qayta tasdiqlash
  // oqimi orqali bajarilishi kerak.
  if (body.warehouse_kirim_qty !== undefined && row.warehouse_approved_at) {
    return res.status(400).json({ error: 'Tasdiqlangan kirimni avval bekor qiling, so‘ng miqdorni o‘zgartiring.' });
  }
  if (body.warehouse_chiqim_qty !== undefined && row.warehouse_chiqim_confirmed_at) {
    return res.status(400).json({ error: 'Tasdiqlangan chiqimni avval bekor qiling, so‘ng miqdorni o‘zgartiring.' });
  }
  let kirim = parseNonNegInt(body.warehouse_kirim_qty, Number(row.warehouse_kirim_qty) || 0);
  let chiqim = parseNonNegInt(body.warehouse_chiqim_qty, Number(row.warehouse_chiqim_qty) || 0);
  let atkaz = parseNonNegInt(body.warehouse_atkaz_qty, Number(row.warehouse_atkaz_qty) || 0);
  let brak = parseNonNegInt(body.brak_qty, Number(row.brak_qty) || 0);

  if (kirim === null) kirim = 0;
  if (chiqim === null) chiqim = 0;
  if (atkaz === null) atkaz = 0;
  if (brak === null) brak = 0;

  let cqConf = row.warehouse_chiqim_confirmed_at;
  let atConf = row.warehouse_atkaz_confirmed_at;
  let brConf = row.warehouse_brak_confirmed_at;
  if (body.warehouse_chiqim_qty !== undefined && body.warehouse_chiqim_qty !== null && chiqim === 0) {
    cqConf = null;
  }
  if (body.warehouse_atkaz_qty !== undefined && body.warehouse_atkaz_qty !== null && atkaz === 0) {
    atConf = null;
  }
  if (body.brak_qty !== undefined && body.brak_qty !== null && brak === 0) {
    brConf = null;
  }

  db.prepare(
    `UPDATE products SET
      warehouse_kirim_qty = ?, warehouse_chiqim_qty = ?, warehouse_atkaz_qty = ?, brak_qty = ?,
      warehouse_chiqim_confirmed_at = ?, warehouse_atkaz_confirmed_at = ?, warehouse_brak_confirmed_at = ?
    WHERE id = ?`,
  ).run(kirim, chiqim, atkaz, brak, cqConf, atConf, brConf, id);

  res.json({ ok: true });
});

router.post('/products/:id/confirm-chiqim', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID noto'g'ri." });
  let row = db.prepare(
    `SELECT id, name_uz, warehouse_chiqim_qty, warehouse_chiqim_confirmed_at, warehouse_deleted_at
     FROM products WHERE id = ?`,
  ).get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if (row.warehouse_chiqim_confirmed_at) {
    return res.status(400).json({ error: 'Chiqim allaqachon tasdiqlangan.' });
  }

  const bodyQty = parseNonNegInt(req.body?.warehouse_chiqim_qty, null);
  if (bodyQty !== null) {
    if (bodyQty < 1) return res.status(400).json({ error: 'Chiqim soni kamida 1 bo‘lishi kerak.' });
    db.prepare('UPDATE products SET warehouse_chiqim_qty = ? WHERE id = ?').run(bodyQty, id);
    row = db.prepare(
      `SELECT id, name_uz, warehouse_chiqim_qty, warehouse_chiqim_confirmed_at, warehouse_deleted_at
       FROM products WHERE id = ?`,
    ).get(id);
  }

  if ((Number(row.warehouse_chiqim_qty) || 0) < 1) {
    return res.status(400).json({ error: 'Avval chiqim sonini kiriting (kamida 1).' });
  }

  const qty = Number(row.warehouse_chiqim_qty) || 0;
  const actorLabel = warehouseActorLabel(req);
  const actorRole = warehouseActorRole(req);
  const titleUz = productTitleUz(row);

  let stockResult;
  try {
    stockResult = applyChiqimStockReduction({
      productId: id,
      qty,
      actorUserId: req.user?.id,
      actorRole,
      actorLabel,
      notifyTitle: 'Ombor chiqimi tasdiqlandi',
      notifyBody: `${actorLabel}: «${titleUz}» chiqim soni ${qty} tasdiqlandi.`,
      markConfirmed: true,
    });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({ error: e?.message || 'Chiqim tasdiqlanmadi.' });
  }

  res.json({
    ok: true,
    confirmed_at: new Date().toISOString(),
    warehouse_chiqim_qty: qty,
    stock: stockResult.stock_after,
    stock_before: stockResult.stock_before,
  });
});

router.post('/products/:id/confirm-atkaz', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID noto'g'ri." });
  const row = db.prepare(
    'SELECT id, warehouse_atkaz_qty, warehouse_deleted_at FROM products WHERE id = ?',
  ).get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if ((Number(row.warehouse_atkaz_qty) || 0) < 1) {
    return res.status(400).json({ error: 'Avval atkaz sonini kiriting (kamida 1).' });
  }
  db.prepare(`UPDATE products SET warehouse_atkaz_confirmed_at = datetime('now') WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/**
 * HOLD SAHIFASI
 * Sayt bo'yicha status='hold' bo'lgan buyurtmalar (picker/packer navbatdan chetlashtirgan)
 * ichidagi mahsulotlarni bitta jadvalda ko'rsatadi. Har bir qator — bitta buyurtmadagi
 * bitta mahsulot qatori; "Holddan chiqarish" bosilsa, o'sha BUTUN buyurtma yana
 * 'pending' holatiga qaytadi (avtomatik ravishda sotuv/yig'ish jarayoniga qaytadi).
 */
router.get('/hold-products', (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT
      oi.id AS item_id,
      o.id AS order_id,
      o.created_at AS order_created_at,
      oi.product_id AS product_id,
      oi.quantity AS qty,
      trim(coalesce(p.name_uz, '')) AS name_uz,
      trim(coalesce(p.image_url, '')) AS image_url,
      coalesce(p.seller_id, 0) AS seller_id,
      trim(coalesce(s.name, '')) AS seller_name
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN sellers s ON s.id = p.seller_id
    WHERE lower(trim(coalesce(o.status, ''))) = 'hold'
    ORDER BY o.created_at DESC, o.id DESC, oi.id ASC
    LIMIT 1000
  `,
    )
    .all();

  res.json({
    rows: rows.map((r) => ({
      item_id: Number(r.item_id),
      order_id: Number(r.order_id),
      order_created_at: r.order_created_at || null,
      product_id: r.product_id != null ? Number(r.product_id) : null,
      qty: Number(r.qty) || 0,
      name_uz: String(r.name_uz || '') || 'Noma’lum mahsulot',
      image_url: String(r.image_url || ''),
      seller_id: Number(r.seller_id) || 0,
      seller_name: String(r.seller_name || '').trim() || '—',
    })),
  });
});

router.post('/hold-products/:orderId/release', (req, res) => {
  const orderId = Number.parseInt(req.params.orderId, 10);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: "Buyurtma ID noto'g'ri." });
  }
  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });
  if (String(order.status || '').trim().toLowerCase() !== 'hold') {
    return res.status(400).json({ error: 'Bu buyurtma hold holatida emas.' });
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('pending', orderId);

  publishEnterpriseEvent({
    eventType: EVENT_TYPES.ORDER_CONFIRMED,
    module: 'warehouse_admin',
    entityType: 'order',
    entityId: orderId,
    ...actorFromRequest(req),
    oldValue: { status: 'hold' },
    newValue: { status: 'pending' },
  });

  res.json({ ok: true, order_id: orderId, status: 'pending' });
});

/**
 * ROLLAR BO'YICHA XODIMLAR RO'YXATI (Kuryer / Seller / Operator / Packer / Picker /
 * Ekspeditor / Qabul qiluvchi sahifalari uchun).
 *
 * Superuser "Rollar" bo'limida qaysi portal_role bilan xodim qo'shsa, o'sha xodim
 * shu yerda avtomatik ko'rinadi — chunki hamma shu rollar bitta umumiy `users`
 * jadvalida (`role` ustuni) saqlanadi. Onlayn/oflayn holati `users.last_active_at`
 * asosida hisoblanadi (har bir autentifikatsiya qilingan so'rovda yangilanadi,
 * bak.: middleware/auth.js -> touchUserLastActive).
 */
const STAFF_DIRECTORY_ROLES = new Set([
  'courier',
  'seller',
  'operator',
  'packer',
  'picker',
  'expeditor',
  'order_receiver',
]);
const ONLINE_THRESHOLD_SECONDS = 180;
const REVENUE_STATUSES = `lower(trim(status)) IN ('delivered', 'completed')`;

router.get('/staff-directory/:role', (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase();
  if (!STAFF_DIRECTORY_ROLES.has(role)) {
    return res.status(400).json({ error: "Noto'g'ri rol." });
  }

  const baseRows = db
    .prepare(
      `
    SELECT
      u.id,
      u.full_name,
      u.login,
      u.phone,
      u.status,
      u.seller_id,
      u.staff_member_id,
      u.last_active_at,
      u.last_login_at,
      (
        u.last_active_at IS NOT NULL
        AND (julianday('now') - julianday(u.last_active_at)) * 86400 <= ?
      ) AS is_online
    FROM users u
    WHERE lower(trim(coalesce(u.role, ''))) = ?
    ORDER BY is_online DESC, u.full_name COLLATE NOCASE ASC
  `,
    )
    .all(ONLINE_THRESHOLD_SECONDS, role);

  const staff = baseRows.map((r) => {
    const row = {
      id: Number(r.id),
      full_name: String(r.full_name || '').trim() || '—',
      login: String(r.login || '').trim(),
      phone: String(r.phone || '').trim() || null,
      status: String(r.status || 'active'),
      last_active_at: r.last_active_at || null,
      last_login_at: r.last_login_at || null,
      online: Boolean(r.is_online),
    };

    if (role === 'courier' && r.staff_member_id) {
      const sm = db
        .prepare(
          `SELECT COALESCE(balance, 0) AS balance, COALESCE(deposit, 0) AS deposit, COALESCE(rating, 5) AS rating
           FROM staff_members WHERE id = ?`,
        )
        .get(r.staff_member_id);
      const soldCount = db
        .prepare(`SELECT COUNT(*) AS c FROM orders WHERE courier_id = ? AND ${REVENUE_STATUSES}`)
        .get(r.staff_member_id)?.c;
      const atkazCount = db
        .prepare(`SELECT COUNT(*) AS c FROM orders WHERE courier_id = ? AND courier_unsold_return = 1`)
        .get(r.staff_member_id)?.c;
      const homeLeftCount = db
        .prepare(
          `SELECT COUNT(*) AS c FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.courier_id = ? AND oi.home_left_in_courier = 1`,
        )
        .get(r.staff_member_id)?.c;
      const courierBalanceRow = db
        .prepare(`SELECT balance FROM courier_balances WHERE courier_staff_id = ?`)
        .get(r.staff_member_id);

      row.staff_member_id = Number(r.staff_member_id);
      row.sold_orders_count = Number(soldCount) || 0;
      row.atkaz_count = Number(atkazCount) || 0;
      row.home_left_count = Number(homeLeftCount) || 0;
      row.courier_balance = courierBalanceRow ? Number(courierBalanceRow.balance) || 0 : Number(sm?.balance) || 0;
      row.deposit = Number(sm?.deposit) || 0;
      row.rating_percent = Math.max(0, Math.min(100, Math.round(((Number(sm?.rating) || 5) / 5) * 100)));
    } else if (role === 'seller' && r.seller_id) {
      const s = db
        .prepare(
          `SELECT COALESCE(balance, 0) AS balance, COALESCE(commission_percent, 10) AS commission_percent, status
           FROM sellers WHERE id = ?`,
        )
        .get(r.seller_id);
      row.seller_id = Number(r.seller_id);
      row.balance = Number(s?.balance) || 0;
      row.commission_percent = Number(s?.commission_percent) || 0;
      if (s?.status) row.status = String(s.status);
    } else if ((role === 'operator' || role === 'packer' || role === 'picker') && r.staff_member_id) {
      const sm = db.prepare(`SELECT COALESCE(balance, 0) AS balance FROM staff_members WHERE id = ?`).get(
        r.staff_member_id,
      );
      row.staff_member_id = Number(r.staff_member_id);
      row.balance = Number(sm?.balance) || 0;
    } else if (role === 'expeditor' || role === 'order_receiver') {
      const todayCount = db
        .prepare(
          `SELECT COUNT(DISTINCT o.id) AS c
           FROM expeditor_closed_batches b
           JOIN orders o ON o.expeditor_batch_id = b.id
           WHERE b.expeditor_user_id = ? AND date(b.closed_at) = date('now')`,
        )
        .get(r.id)?.c;
      row.today_count = Number(todayCount) || 0;
    }

    return row;
  });

  res.json({ role, online_threshold_seconds: ONLINE_THRESHOLD_SECONDS, staff });
});

/**
 * Ekspeditor / Qabul qiluvchi — bugungi (yoki tanlangan sana) yakunlangan
 * buyurtmalar ro'yxati, "chek" ko'rinishidagi modal uchun.
 */
router.get('/staff-directory/:role/:userId/daily-orders', (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase();
  const userId = Number.parseInt(req.params.userId, 10);
  if (!['expeditor', 'order_receiver'].includes(role)) {
    return res.status(400).json({ error: "Noto'g'ri rol." });
  }
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const dateParam = String(req.query.date || '').trim();
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  const rows = db
    .prepare(
      `
    SELECT o.id AS order_id, o.total_amount, o.currency, o.status, b.closed_at, b.courier_staff_id,
           sm.full_name AS courier_name
    FROM expeditor_closed_batches b
    JOIN orders o ON o.expeditor_batch_id = b.id
    LEFT JOIN staff_members sm ON sm.id = b.courier_staff_id
    WHERE b.expeditor_user_id = ?
      AND date(b.closed_at) = COALESCE(?, date('now'))
    ORDER BY b.closed_at DESC, o.id DESC
  `,
    )
    .all(userId, targetDate);

  const orders = rows.map((r) => ({
    order_id: Number(r.order_id),
    total_amount: Number(r.total_amount) || 0,
    currency: r.currency || 'UZS',
    status: r.status || '',
    closed_at: r.closed_at,
    courier_name: r.courier_name || '—',
  }));
  const totalSum = orders.reduce((acc, o) => acc + o.total_amount, 0);

  res.json({
    role,
    user_id: userId,
    date: targetDate || new Date().toISOString().slice(0, 10),
    count: orders.length,
    total_sum: totalSum,
    orders,
  });
});

/** Kuryerning depozit summasini yangilash (Ombor admin paneli boshqaruvi). */
router.patch('/staff-directory/courier/:staffMemberId/deposit', (req, res) => {
  const staffMemberId = Number.parseInt(req.params.staffMemberId, 10);
  const deposit = Number(req.body?.deposit);
  if (!Number.isInteger(staffMemberId) || staffMemberId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  if (!Number.isFinite(deposit) || deposit < 0) {
    return res.status(400).json({ error: 'Depozit summasi noto‘g‘ri.' });
  }
  const staff = db
    .prepare(`SELECT id FROM staff_members WHERE id = ? AND lower(trim(coalesce(staff_type,''))) = 'courier'`)
    .get(staffMemberId);
  if (!staff) return res.status(404).json({ error: 'Kuryer topilmadi.' });

  db.prepare('UPDATE staff_members SET deposit = ? WHERE id = ?').run(deposit, staffMemberId);
  res.json({ ok: true, staff_member_id: staffMemberId, deposit });
});

/** Sellerning sotuv (komissiya) foizini yangilash (Ombor admin paneli boshqaruvi). */
router.patch('/staff-directory/seller/:sellerId/commission', (req, res) => {
  const sellerId = Number.parseInt(req.params.sellerId, 10);
  const commissionPercent = Number(req.body?.commission_percent);
  if (!Number.isInteger(sellerId) || sellerId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return res.status(400).json({ error: 'Foiz 0–100 oralig‘ida bo‘lishi kerak.' });
  }
  const seller = db.prepare('SELECT id FROM sellers WHERE id = ?').get(sellerId);
  if (!seller) return res.status(404).json({ error: 'Seller topilmadi.' });

  db.prepare('UPDATE sellers SET commission_percent = ? WHERE id = ?').run(commissionPercent, sellerId);
  res.json({ ok: true, seller_id: sellerId, commission_percent: commissionPercent });
});

/**
 * "Umumiy ma'lumot" modali uchun — tanlangan kun bo'yicha rol statistikasi.
 * Har bir rol o'ziga xos ma'lumot manbasidan foydalanadi (mavjud bo'lgan ustunlar asosida).
 */
router.get('/staff-directory/:role/:userId/daily-summary', (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase();
  const userId = Number.parseInt(req.params.userId, 10);
  if (!STAFF_DIRECTORY_ROLES.has(role)) {
    return res.status(400).json({ error: "Noto'g'ri rol." });
  }
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const dateParam = String(req.query.date || '').trim();
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const dateExpr = `date(coalesce(status_updated_at, created_at))`;

  const user = db.prepare('SELECT id, seller_id, staff_member_id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  const items = [];

  if (role === 'courier' && user.staff_member_id) {
    const sid = user.staff_member_id;
    const sold = db
      .prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS s FROM orders
         WHERE courier_id = ? AND ${dateExpr} = ? AND ${REVENUE_STATUSES}`,
      )
      .get(sid, targetDate);
    const cancelled = db
      .prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS s FROM orders
         WHERE courier_id = ? AND ${dateExpr} = ? AND lower(trim(status)) = 'cancelled'`,
      )
      .get(sid, targetDate);
    const atkaz = db
      .prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS s FROM orders
         WHERE courier_id = ? AND ${dateExpr} = ? AND courier_unsold_return = 1`,
      )
      .get(sid, targetDate);
    const homeLeft = db
      .prepare(
        `SELECT COUNT(DISTINCT o.id) AS c, COALESCE(SUM(o.total_amount), 0) AS s
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.courier_id = ? AND oi.home_left_in_courier = 1 AND ${dateExpr.replace(/status_updated_at|created_at/g, 'o.$&')} = ?`,
      )
      .get(sid, targetDate);
    items.push(
      { key: 'sold', label: 'Sotilgan', count: Number(sold.c) || 0, sum: Number(sold.s) || 0 },
      { key: 'cancelled', label: 'Bekor qilingan', count: Number(cancelled.c) || 0, sum: Number(cancelled.s) || 0 },
      { key: 'atkaz', label: 'Atkaz', count: Number(atkaz.c) || 0, sum: Number(atkaz.s) || 0 },
      { key: 'home_left', label: 'Uyda qoldi', count: Number(homeLeft.c) || 0, sum: Number(homeLeft.s) || 0 },
    );
  } else if (role === 'seller' && user.seller_id) {
    const sold = db
      .prepare(
        `SELECT COUNT(DISTINCT o.id) AS c, COALESCE(SUM(oi.price_at_order * oi.quantity), 0) AS s
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         WHERE p.seller_id = ? AND ${dateExpr.replace(/status_updated_at|created_at/g, 'o.$&')} = ?
           AND lower(trim(o.status)) IN ('delivered', 'completed')`,
      )
      .get(user.seller_id, targetDate);
    const cancelled = db
      .prepare(
        `SELECT COUNT(DISTINCT o.id) AS c, COALESCE(SUM(oi.price_at_order * oi.quantity), 0) AS s
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         WHERE p.seller_id = ? AND ${dateExpr.replace(/status_updated_at|created_at/g, 'o.$&')} = ?
           AND lower(trim(o.status)) = 'cancelled'`,
      )
      .get(user.seller_id, targetDate);
    items.push(
      { key: 'sold', label: 'Sotilgan', count: Number(sold.c) || 0, sum: Number(sold.s) || 0 },
      { key: 'cancelled', label: 'Bekor qilingan', count: Number(cancelled.c) || 0, sum: Number(cancelled.s) || 0 },
    );
  } else if (role === 'packer' && user.staff_member_id) {
    const packed = db
      .prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS s FROM orders
         WHERE packer_id = ? AND ${dateExpr} = ?`,
      )
      .get(user.staff_member_id, targetDate);
    items.push({ key: 'packed', label: 'Qadoqlangan', count: Number(packed.c) || 0, sum: Number(packed.s) || 0 });
  } else if ((role === 'expeditor' || role === 'order_receiver') && userId) {
    const handled = db
      .prepare(
        `SELECT COUNT(DISTINCT o.id) AS c, COALESCE(SUM(o.total_amount), 0) AS s
         FROM expeditor_closed_batches b
         JOIN orders o ON o.expeditor_batch_id = b.id
         WHERE b.expeditor_user_id = ? AND date(b.closed_at) = ?`,
      )
      .get(userId, targetDate);
    items.push({ key: 'handled', label: 'Ishlangan zakazlar', count: Number(handled.c) || 0, sum: Number(handled.s) || 0 });
  }
  // operator/picker uchun order darajasida to'g'ridan-to'g'ri biriktirish maydoni
  // hozircha mavjud emas — shu sabab bo'sh ro'yxat qaytadi (frontend "mavjud emas" deb ko'rsatadi).

  res.json({ role, user_id: userId, date: targetDate, items });
});

/** Viloyatlar ro'yxati — Ekspeditor/Qabul qiluvchi modalidagi "Kuryer" filtri uchun. */
const VILOYAT_LABELS = {
  andijon: 'Andijon viloyati',
  buxoro: 'Buxoro viloyati',
  fargona: "Farg'ona viloyati",
  jizzax: 'Jizzax viloyati',
  xorazm: 'Xorazm viloyati',
  namangan: 'Namangan viloyati',
  navoiy: 'Navoiy viloyati',
  qashqadaryo: 'Qashqadaryo viloyati',
  samarqand: 'Samarqand viloyati',
  sirdaryo: 'Sirdaryo viloyati',
  surxondaryo: 'Surxondaryo viloyati',
  toshkent_v: 'Toshkent viloyati',
  toshkent_sh: 'Toshkent shahri',
  qoraqalpoq: "Qoraqalpog'iston Respublikasi",
};

/**
 * Kuryer modalida tanlangan kategoriya (Sotilgan / Bekor qilingan / Atkaz) bo'yicha
 * shu kungi buyurtmalar ro'yxati — "chek" ko'rinishidagi scroll ro'yxat uchun.
 */
router.get('/staff-directory/courier/:userId/category-orders', (req, res) => {
  const userId = Number.parseInt(req.params.userId, 10);
  const category = String(req.query.category || '').trim().toLowerCase();
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  if (!['sold', 'cancelled', 'atkaz'].includes(category)) {
    return res.status(400).json({ error: "Noto'g'ri kategoriya." });
  }
  const dateParam = String(req.query.date || '').trim();
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const user = db.prepare('SELECT id, staff_member_id FROM users WHERE id = ?').get(userId);
  if (!user || !user.staff_member_id) return res.status(404).json({ error: 'Kuryer topilmadi.' });
  const sid = user.staff_member_id;
  const dateExpr = `date(coalesce(status_updated_at, created_at))`;

  let whereExtra = '';
  if (category === 'sold') whereExtra = `AND ${REVENUE_STATUSES}`;
  else if (category === 'cancelled') whereExtra = `AND lower(trim(status)) = 'cancelled'`;
  else if (category === 'atkaz') whereExtra = `AND courier_unsold_return = 1`;

  const rows = db
    .prepare(
      `SELECT id AS order_id, total_amount, currency, status, coalesce(status_updated_at, created_at) AS moment
       FROM orders
       WHERE courier_id = ? AND ${dateExpr} = ? ${whereExtra}
       ORDER BY moment DESC, id DESC`,
    )
    .all(sid, targetDate);

  const orders = rows.map((r) => ({
    order_id: Number(r.order_id),
    total_amount: Number(r.total_amount) || 0,
    currency: r.currency || 'UZS',
    status: r.status || '',
    moment: r.moment,
  }));
  const totalSum = orders.reduce((acc, o) => acc + o.total_amount, 0);

  res.json({ category, date: targetDate, count: orders.length, total_sum: totalSum, orders });
});

/**
 * Kuryer modalidagi "Uyda qoldi" tugmasi — o'sha kunga oid uyda qolgan mahsulotlar
 * ro'yxati (alohida modal uchun).
 */
router.get('/staff-directory/courier/:userId/home-left-products', (req, res) => {
  const userId = Number.parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const dateParam = String(req.query.date || '').trim();
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const user = db.prepare('SELECT id, staff_member_id FROM users WHERE id = ?').get(userId);
  if (!user || !user.staff_member_id) return res.status(404).json({ error: 'Kuryer topilmadi.' });
  const sid = user.staff_member_id;

  const rows = db
    .prepare(
      `
    SELECT oi.order_id, oi.product_id, oi.quantity, oi.price_at_order AS price,
           trim(coalesce(p.name_uz, '')) AS name_uz, trim(coalesce(p.image_url, '')) AS image_url,
           coalesce(o.status_updated_at, o.created_at) AS moment
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.courier_id = ? AND oi.home_left_in_courier = 1
      AND date(coalesce(o.status_updated_at, o.created_at)) = ?
    ORDER BY moment DESC
  `,
    )
    .all(sid, targetDate);

  const products = rows.map((r) => ({
    order_id: Number(r.order_id),
    product_id: r.product_id != null ? Number(r.product_id) : null,
    name_uz: String(r.name_uz || '') || "Noma'lum mahsulot",
    image_url: String(r.image_url || ''),
    quantity: Number(r.quantity) || 0,
    price: Number(r.price) || 0,
  }));
  const totalSum = products.reduce((acc, p) => acc + p.price * p.quantity, 0);

  res.json({ date: targetDate, count: products.length, total_sum: totalSum, products });
});

/**
 * Kuryer modalida "Umumiy ma'lumot" ostidagi qidiruv — zakaz ID (to'liq yoki
 * oxirgi 4-5 raqami) yoki skanerlangan kod bo'yicha, shu kuryerga tegishli
 * bitta zakazni topib, "chek" ko'rinishida ko'rsatish uchun.
 */
function computeCourierOrderDisplayStatus(order, hasHomeLeftItem) {
  if (Number(order.courier_unsold_return) === 1) return 'atkaz';
  if (hasHomeLeftItem) return 'home_left';
  const st = String(order.status || '').trim().toLowerCase();
  if (st === 'delivered' || st === 'completed') return 'sold';
  if (st === 'cancelled') return 'cancelled';
  return 'pending';
}

function loadCourierOrderReceipt(orderId, sid) {
  const order = db
    .prepare(
      `SELECT id, total_amount, currency, status, courier_unsold_return,
              coalesce(status_updated_at, created_at) AS moment
       FROM orders WHERE id = ? AND courier_id = ?`,
    )
    .get(orderId, sid);
  if (!order) return null;

  const items = db
    .prepare(
      `SELECT oi.quantity, oi.price_at_order AS price, oi.home_left_in_courier,
              trim(coalesce(p.name_uz, '')) AS name_uz
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
    )
    .all(orderId);

  const hasHomeLeft = items.some((it) => Number(it.home_left_in_courier) === 1);

  return {
    order_id: Number(order.id),
    total_amount: Number(order.total_amount) || 0,
    currency: order.currency || 'UZS',
    moment: order.moment,
    display_status: computeCourierOrderDisplayStatus(order, hasHomeLeft),
    items: items.map((it) => ({
      name_uz: String(it.name_uz || '') || "Noma'lum mahsulot",
      quantity: Number(it.quantity) || 0,
      price: Number(it.price) || 0,
    })),
  };
}

router.get('/staff-directory/courier/:userId/search-order', (req, res) => {
  const userId = Number.parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const rawQuery = String(req.query.query || '').trim();
  const digits = rawQuery.replace(/\D/g, '');
  if (!digits) {
    return res.status(400).json({ error: 'Zakaz ID kiriting.' });
  }

  const user = db.prepare('SELECT id, staff_member_id FROM users WHERE id = ?').get(userId);
  if (!user || !user.staff_member_id) return res.status(404).json({ error: 'Kuryer topilmadi.' });
  const sid = user.staff_member_id;

  // To'liq raqam bo'yicha aniq moslik, bo'lmasa oxiridagi raqamlar bo'yicha qidiruv
  let orderRow = db
    .prepare(`SELECT id FROM orders WHERE courier_id = ? AND id = ?`)
    .get(sid, Number(digits));

  if (!orderRow) {
    orderRow = db
      .prepare(
        `SELECT id FROM orders WHERE courier_id = ? AND CAST(id AS TEXT) LIKE '%' || ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(sid, digits);
  }

  if (!orderRow) {
    return res.status(404).json({ error: 'Zakaz topilmadi.' });
  }

  const receipt = loadCourierOrderReceipt(orderRow.id, sid);
  res.json({ order: receipt });
});

/** Admin — topilgan zakazning holatini o'zgartiradi (Sotildi / Bekor qilindi / Atkaz / Uyda qoldi). */
router.patch('/staff-directory/courier/:userId/order/:orderId/status', (req, res) => {
  const userId = Number.parseInt(req.params.userId, 10);
  const orderId = Number.parseInt(req.params.orderId, 10);
  const newStatus = String(req.body?.new_status || '').trim().toLowerCase();
  const allowed = ['sold', 'cancelled', 'atkaz', 'home_left'];
  if (!Number.isInteger(userId) || userId < 1 || !Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  if (!allowed.includes(newStatus)) {
    return res.status(400).json({ error: "Noto'g'ri holat." });
  }

  const user = db.prepare('SELECT id, staff_member_id FROM users WHERE id = ?').get(userId);
  if (!user || !user.staff_member_id) return res.status(404).json({ error: 'Kuryer topilmadi.' });
  const sid = user.staff_member_id;

  const order = db.prepare('SELECT id FROM orders WHERE id = ? AND courier_id = ?').get(orderId, sid);
  if (!order) return res.status(404).json({ error: 'Zakaz topilmadi.' });

  if (newStatus === 'sold') {
    db.prepare(
      `UPDATE orders SET status = 'delivered', courier_unsold_return = 0, status_updated_at = datetime('now') WHERE id = ?`,
    ).run(orderId);
    db.prepare(`UPDATE order_items SET home_left_in_courier = 0 WHERE order_id = ?`).run(orderId);
  } else if (newStatus === 'cancelled') {
    db.prepare(
      `UPDATE orders SET status = 'cancelled', courier_unsold_return = 0, status_updated_at = datetime('now') WHERE id = ?`,
    ).run(orderId);
    db.prepare(`UPDATE order_items SET home_left_in_courier = 0 WHERE order_id = ?`).run(orderId);
  } else if (newStatus === 'atkaz') {
    db.prepare(
      `UPDATE orders SET courier_unsold_return = 1, status_updated_at = datetime('now') WHERE id = ?`,
    ).run(orderId);
    db.prepare(`UPDATE order_items SET home_left_in_courier = 0 WHERE order_id = ?`).run(orderId);
  } else if (newStatus === 'home_left') {
    db.prepare(
      `UPDATE orders SET courier_unsold_return = 0, status_updated_at = datetime('now') WHERE id = ?`,
    ).run(orderId);
    db.prepare(`UPDATE order_items SET home_left_in_courier = 1 WHERE order_id = ?`).run(orderId);
  }

  const receipt = loadCourierOrderReceipt(orderId, sid);
  res.json({ order: receipt });
});

router.get('/viloyatlar-list', (_req, res) => {
  const list = PACKER_UZ_VILOYATLAR.map((v) => ({ id: v.id, name: VILOYAT_LABELS[v.id] || v.id }));
  res.json({ viloyatlar: list });
});

/** Tanlangan hudud bo'yicha faol kuryerlar ro'yxati (Ekspeditor/Qabul qiluvchi "Kuryer" filtri). */
router.get('/couriers-by-region', (req, res) => {
  const viloyatId = String(req.query.viloyat_id || '').trim();
  const entry = getViloyatEntryById(viloyatId);

  const couriers = db
    .prepare(
      `
    SELECT sm.id, sm.full_name, sm.phone,
           COALESCE(NULLIF(trim(sm.region_service_text), ''), r.name) AS region_name
    FROM staff_members sm
    LEFT JOIN regions r ON r.id = sm.region_id
    WHERE sm.staff_type = 'courier'
      AND ${sqlStaffHasActiveWorkRole('sm')}
      AND (sm.status IS NULL OR trim(sm.status) = '' OR lower(trim(sm.status)) NOT IN ('blocked', 'churn'))
    ORDER BY lower(sm.full_name)
  `,
    )
    .all();

  const filtered = entry
    ? couriers.filter((c) => orderMatchesViloyatEntry(String(c.region_name || '').toLowerCase(), entry))
    : couriers;

  res.json({
    viloyat_id: viloyatId || null,
    couriers: filtered.map((c) => ({ id: Number(c.id), full_name: c.full_name, phone: c.phone || null })),
  });
});

/**
 * Ekspeditor/Qabul qiluvchi — tanlangan kuryer bo'yicha kunlik: unga chiqarilgan
 * (topshirilgan) va undan atkaz sifatida qabul qilingan buyurtmalar soni+summasi.
 */
router.get('/staff-directory/:role/:userId/courier-summary', (req, res) => {
  const role = String(req.params.role || '').trim().toLowerCase();
  const userId = Number.parseInt(req.params.userId, 10);
  const courierStaffId = Number.parseInt(req.query.courier_staff_id, 10);
  if (!['expeditor', 'order_receiver'].includes(role)) {
    return res.status(400).json({ error: "Noto'g'ri rol." });
  }
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  if (!Number.isInteger(courierStaffId) || courierStaffId < 1) {
    return res.status(400).json({ error: "Kuryer tanlanmagan." });
  }
  const dateParam = String(req.query.date || '').trim();
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const courier = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ?').get(courierStaffId);
  if (!courier) return res.status(404).json({ error: 'Kuryer topilmadi.' });

  const dispatched = db
    .prepare(
      `SELECT COUNT(DISTINCT o.id) AS c, COALESCE(SUM(o.total_amount), 0) AS s
       FROM expeditor_closed_batches b
       JOIN orders o ON o.expeditor_batch_id = b.id
       WHERE b.expeditor_user_id = ? AND b.courier_staff_id = ? AND date(b.closed_at) = ?`,
    )
    .get(userId, courierStaffId, targetDate);

  const atkaz = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS s
       FROM orders
       WHERE courier_id = ? AND courier_unsold_return = 1
         AND date(coalesce(status_updated_at, created_at)) = ?`,
    )
    .get(courierStaffId, targetDate);

  res.json({
    role,
    user_id: userId,
    courier: { id: Number(courier.id), full_name: courier.full_name },
    date: targetDate,
    items: [
      { key: 'dispatched', label: 'Chiqarilgan', count: Number(dispatched.c) || 0, sum: Number(dispatched.s) || 0 },
      { key: 'atkaz', label: 'Atkaz qabul qilingan', count: Number(atkaz.c) || 0, sum: Number(atkaz.s) || 0 },
    ],
  });
});

router.post('/products/:id/confirm-brak', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID noto'g'ri." });
  const row = db.prepare('SELECT id, brak_qty, warehouse_deleted_at FROM products WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if ((Number(row.brak_qty) || 0) < 1) {
    return res.status(400).json({ error: 'Avval brak sonini kiriting (kamida 1).' });
  }
  db.prepare(`UPDATE products SET warehouse_brak_confirmed_at = datetime('now') WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/**
 * Saytdan yechish (sotuvda emas): status → pending. Qayta sotuvga: active.
 */
router.patch('/products/:id/sale-status', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const row = db
    .prepare('SELECT id, seller_id, status, warehouse_deleted_at FROM products WHERE id = ?')
    .get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (!row.seller_id) return res.status(400).json({ error: 'Seller mahsuloti emas.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }

  const nextRaw = String(req.body?.status || '').trim().toLowerCase();
  if (nextRaw !== 'pending' && nextRaw !== 'active') {
    return res.status(400).json({ error: "status faqat 'pending' yoki 'active' bo'lishi kerak." });
  }

  if (nextRaw === 'active') {
    db.prepare(
      `UPDATE products SET status = ?, goes_live_at = NULL, warehouse_delisted_at = NULL,
       warehouse_relisted_at = datetime('now') WHERE id = ?`,
    ).run(nextRaw, id);
  } else {
    db.prepare(
      `UPDATE products SET status = ?, goes_live_at = NULL,
       warehouse_delisted_at = CASE
         WHEN warehouse_delisted_at IS NOT NULL AND trim(coalesce(warehouse_delisted_at, '')) != '' THEN warehouse_delisted_at
         ELSE datetime('now')
       END,
       warehouse_relisted_at = NULL
       WHERE id = ?`,
    ).run(nextRaw, id);
  }

  res.json({ ok: true, status: nextRaw });
});

/** Soft-delete: mahsulot «oʻchirilganlar» ro‘yxatida qoladi, saytdan berkitiladi. */
router.delete('/products/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const row = db.prepare(
    'SELECT id, seller_id, name_uz, warehouse_deleted_at FROM products WHERE id = ?',
  ).get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (!row.seller_id) return res.status(400).json({ error: 'Seller mahsuloti emas.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.json({ ok: true, already: true });
  }

  const sellerId = Number(row.seller_id);
  const titleUz = String(row.name_uz || '').trim() || `ID ${id}`;

  db.prepare(
    `UPDATE products SET
      warehouse_deleted_at = datetime('now'),
      status = 'pending',
      goes_live_at = NULL,
      warehouse_delisted_at = COALESCE(warehouse_delisted_at, datetime('now'))
    WHERE id = ?`,
  ).run(id);

  db.prepare(
    `
    INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
    VALUES (?, ?, ?, ?, ?, 0)
  `,
  ).run(
    sellerId,
    'Mahsulot omborda o‘chirildi',
    `«${titleUz}» mahsuloti ombor ro‘yxatidan olib tashlandi (tiklash uchun administrator bilan bog‘laning).`,
    'danger',
    'products',
  );

  res.json({ ok: true });
});

/** Ombor chiqim tasdiqini bekor qilish — stockga chiqim sonini qaytarish. */
router.post('/products/:id/revoke-chiqim', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const rowFull = db
    .prepare(
      'SELECT id, seller_id, warehouse_chiqim_confirmed_at, warehouse_deleted_at, name_uz FROM products WHERE id = ?',
    )
    .get(id);
  if (!rowFull) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (rowFull.warehouse_deleted_at != null && String(rowFull.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if (!rowFull.warehouse_chiqim_confirmed_at) {
    return res.status(400).json({ error: 'Tasdiqlangan chiqim yo‘q.' });
  }

  const actorLabel = warehouseActorLabel(req);
  const actorRole = warehouseActorRole(req);
  const titleUz = productTitleUz(rowFull);

  try {
    reverseChiqimStock({
      productId: id,
      actorUserId: req.user?.id,
      actorRole,
      actorLabel,
      notifyTitle: 'Ombor chiqimi bekor qilindi',
      notifyBody: `${actorLabel}: «${titleUz}» chiqim tasdiqi bekor qilindi.`,
    });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({ error: e?.message || 'Chiqim bekor qilinmadi.' });
  }

  res.json({ ok: true });
});

/** Ombor kirim tasdiqini bekor qilish — mahsulot yana «bosh sahifa» navbatiga tushadi. */
router.post('/products/:id/revoke-kirim-approval', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const rowFull = db
    .prepare(
      'SELECT id, seller_id, warehouse_approved_at, warehouse_deleted_at, name_uz FROM products WHERE id = ?',
    )
    .get(id);
  if (!rowFull) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (rowFull.warehouse_deleted_at != null && String(rowFull.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if (!rowFull.warehouse_approved_at) {
    return res.status(400).json({ error: 'Tasdiqlangan kirim yo‘q.' });
  }
  const kirimQty = Number(
    db.prepare('SELECT coalesce(warehouse_kirim_qty, 0) AS q FROM products WHERE id = ?').get(id)?.q,
  ) || 0;
  const actorLabel = warehouseActorLabel(req);
  const actorRole = warehouseActorRole(req);
  const titleUz = productTitleUz(rowFull);

  try {
    reverseKirimStock({
      productId: id,
      kirimQty,
      actorUserId: req.user?.id,
      actorRole,
      actorLabel,
      notifyTitle: 'Ombor kirimi bekor qilindi',
      notifyBody: `${actorLabel}: «${titleUz}» kirim tasdiqi bekor qilindi${kirimQty ? ` (${kirimQty} dona yozuv)` : ''}.`,
    });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({ error: e?.message || 'Kirim bekor qilinmadi.' });
  }

  const hasSeller = rowFull.seller_id != null && Number(rowFull.seller_id) >= 1;
  if (hasSeller) {
    db.prepare(
      `UPDATE products SET
        warehouse_approved_at = NULL,
        warehouse_approved_by = NULL,
        status = 'pending',
        goes_live_at = NULL,
        warehouse_delisted_at = NULL
      WHERE id = ?`,
    ).run(id);
  } else {
    db.prepare(
      `UPDATE products SET warehouse_approved_at = NULL, warehouse_approved_by = NULL WHERE id = ?`,
    ).run(id);
  }
  res.json({ ok: true });
});

/** Ombor admini sotuvchi mahsulotini ombor uchun TASDIQLAYDI — kirim soni body yoki stock */
router.post('/products/:id/approve-kirim', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }

  const bodyQty = parseNonNegInt(req.body?.warehouse_kirim_qty, null);
  if (bodyQty !== null && bodyQty < 1) {
    return res.status(400).json({ error: 'Kirim soni kamida 1 bo‘lishi kerak.' });
  }

  const actorLabel = warehouseActorLabel(req);
  const actorRole = warehouseActorRole(req);

  let txResult;
  try {
    // better-sqlite3: avval transaction funksiyasi yaratiladi, keyin uning
    // `exclusive` varianti ishga tushiriladi.
    txResult = db.transaction(() => {
    const product = db
      .prepare(
        `SELECT id, stock, seller_id, status, name_uz, warehouse_approved_at, warehouse_deleted_at,
                coalesce(warehouse_kirim_qty, 0) AS warehouse_kirim_qty
         FROM products WHERE id = ?`,
      )
      .get(id);
    if (!product) throw Object.assign(new Error('Mahsulot topilmadi.'), { status: 404 });
    if (product.warehouse_deleted_at != null && String(product.warehouse_deleted_at).trim() !== '') {
      throw Object.assign(new Error('Mahsulot o‘chirilgan.'), { status: 400 });
    }

    const approvedBy = Number(req.user?.id) || null;
    const wasApproved = Boolean(product.warehouse_approved_at);
    const prevQty = Number(product.warehouse_kirim_qty) || 0;
    const kirimQty = bodyQty !== null ? bodyQty : (wasApproved ? prevQty : Number(product.stock) || 0);

    if (kirimQty < 1) {
      throw Object.assign(new Error('Kirim soni kamida 1 bo‘lishi kerak.'), { status: 400 });
    }

    if (wasApproved && prevQty === kirimQty) {
      return {
        already: true,
        approved_at: product.warehouse_approved_at,
        warehouse_kirim_qty: kirimQty,
        stock: product.stock,
        activated_to_sale: false,
        updated: false,
        prevQty,
        stock_before: product.stock,
        stock_after: product.stock,
      };
    }

    if (wasApproved) {
      db.prepare('UPDATE products SET warehouse_kirim_qty = ? WHERE id = ?').run(kirimQty, id);
    } else {
      db.prepare(
        `UPDATE products SET warehouse_approved_at = datetime('now'), warehouse_approved_by = ?, warehouse_kirim_qty = ?
         WHERE id = ?`,
      ).run(approvedBy, kirimQty, id);
    }

    const sellerId = product.seller_id != null ? Number(product.seller_id) : null;
    const st = String(product.status || '').trim().toLowerCase();
    let activatedToSale = false;
    if (
      !wasApproved &&
      Number.isInteger(sellerId) &&
      sellerId >= 1 &&
      st !== 'active' &&
      st !== 'scheduled'
    ) {
      db.prepare(
        `UPDATE products SET status = 'active', goes_live_at = NULL, warehouse_delisted_at = NULL WHERE id = ?`,
      ).run(id);
      activatedToSale = true;
    }

    const delta = wasApproved ? kirimQty - prevQty : kirimQty;
    let stockResult = { stock_after: Number(product.stock) || 0, stock_before: Number(product.stock) || 0 };
    if (delta !== 0) {
      stockResult = applyKirimStockDelta({
        productId: id,
        delta,
        actorUserId: req.user?.id,
        actorRole,
        actorLabel,
        notifyTitle: wasApproved ? 'Ombor kirimi yangilandi' : 'Ombor kirimi tasdiqlandi',
        notifyBody: wasApproved
          ? `${actorLabel}: «${productTitleUz(product)}» kirim soni ${prevQty} → ${kirimQty} ga yangilandi.`
          : `${actorLabel}: «${productTitleUz(product)}» omborda qabul qilindi (kirim: ${kirimQty})${
              activatedToSale ? ' va sotuvga chiqarildi.' : '.'
            }`,
        linkType: 'seller_product_warehouse_kirim',
      });
    } else {
      recordKirimLedgerEvent({
        productId: id,
        qty: kirimQty,
        actorUserId: req.user?.id,
        actorRole,
        actorLabel,
        note: wasApproved ? 'Kirim yozuvi yangilandi (son o‘zgarmadi)' : 'Kirim tasdiqlandi',
      });
      try {
        notifyWarehouseMovement({
          actorUserId: req.user?.id,
          title: wasApproved ? 'Ombor kirimi yangilandi' : 'Ombor kirimi tasdiqlandi',
          body: wasApproved
            ? `${actorLabel}: «${productTitleUz(product)}» kirim soni ${prevQty} → ${kirimQty} ga yangilandi.`
            : `${actorLabel}: «${productTitleUz(product)}» omborda qabul qilindi (kirim: ${kirimQty})${
                activatedToSale ? ' va sotuvga chiqarildi.' : '.'
              }`,
          linkType: 'seller_product_warehouse_kirim',
          linkId: id,
        });
      } catch (e) {
        console.warn('[warehouse-admin] notify kirim', e?.message || e);
      }
    }

    const fresh = db.prepare('SELECT warehouse_approved_at, warehouse_kirim_qty, stock FROM products WHERE id = ?').get(id);
    return {
      ok: true,
      approved_at: fresh.warehouse_approved_at,
      warehouse_kirim_qty: Number(fresh.warehouse_kirim_qty) || kirimQty,
      activated_to_sale: activatedToSale,
      updated: wasApproved,
      stock: Number(fresh.stock) || stockResult.stock_after || 0,
      already: false,
      prevQty,
      stock_before: stockResult.stock_before,
      stock_after: stockResult.stock_after,
    };
    }).exclusive();
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({ error: e?.message || 'Kirim tasdiqlanmadi.' });
  }

  const productForEvent = db
    .prepare('SELECT name_uz, seller_id FROM products WHERE id = ?')
    .get(id);
  publishEnterpriseEvent({
    eventType: EVENT_TYPES.INVENTORY_ADDED,
    module: 'warehouse',
    entityType: 'product',
    entityId: id,
    ...actorFromRequest(req),
    oldValue: { stock: txResult.stock_before, warehouse_kirim_qty: txResult.prevQty },
    newValue: {
      stock: Number(txResult.stock) || 0,
      warehouse_kirim_qty: Number(txResult.warehouse_kirim_qty) || 0,
      delta: txResult.updated ? Number(txResult.warehouse_kirim_qty) - txResult.prevQty : 0,
      activated_to_sale: txResult.activated_to_sale,
    },
    metadata: { actor_label: actorLabel, actor_role: actorRole, updated: txResult.updated },
  });

  res.json({
    ok: true,
    approved_at: txResult.approved_at,
    warehouse_kirim_qty: Number(txResult.warehouse_kirim_qty) || 0,
    activated_to_sale: txResult.activated_to_sale,
    updated: txResult.updated,
    stock: Number(txResult.stock) || 0,
  });
});

router.get('/sklad-peers', getSkladPeers);
router.get('/dm/messages', getDmMessages);
router.get('/dm/stories', getDmStories);
router.get('/dm/call-logs', getDmCallLogs);
router.post('/dm/call-logs', postDmCallLog);
router.post('/dm/send', postDmSend);
router.post('/chat/presence', postChatPresence);
router.get('/chat/presence', getChatPresence);

export default router;
