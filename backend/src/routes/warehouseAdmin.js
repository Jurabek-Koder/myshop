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
    clauses.push(`p.warehouse_delisted_at IS NOT NULL`);
    clauses.push(`(p.warehouse_deleted_at IS NULL OR trim(coalesce(p.warehouse_deleted_at, '')) = '')`);
  } else {
    clauses.push(`(p.warehouse_deleted_at IS NULL OR trim(coalesce(p.warehouse_deleted_at, '')) = '')`);
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
      coalesce(p.brak_qty, 0) AS brak_qty,
      coalesce(p.seller_id, 0) AS seller_id,
      trim(coalesce(s.name, '')) AS seller_name,
      trim(lower(coalesce(p.status, ''))) AS status,
      p.warehouse_approved_at AS warehouse_approved_at,
      coalesce(p.warehouse_kirim_qty, 0) AS warehouse_kirim_qty,
      coalesce(p.warehouse_chiqim_qty, 0) AS warehouse_chiqim_qty,
      coalesce(p.warehouse_atkaz_qty, 0) AS warehouse_atkaz_qty,
      p.warehouse_chiqim_confirmed_at AS warehouse_chiqim_confirmed_at,
      p.warehouse_atkaz_confirmed_at AS warehouse_atkaz_confirmed_at,
      p.warehouse_brak_confirmed_at AS warehouse_brak_confirmed_at,
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
    brak_qty: Number(r.brak_qty) || 0,
    warehouse_kirim_qty: Number(r.warehouse_kirim_qty) || 0,
    warehouse_chiqim_qty: Number(r.warehouse_chiqim_qty) || 0,
    warehouse_atkaz_qty: Number(r.warehouse_atkaz_qty) || 0,
    warehouse_chiqim_confirmed_at: r.warehouse_chiqim_confirmed_at || null,
    warehouse_atkaz_confirmed_at: r.warehouse_atkaz_confirmed_at || null,
    warehouse_brak_confirmed_at: r.warehouse_brak_confirmed_at || null,
    warehouse_approved_at: r.warehouse_approved_at || null,
    warehouse_delisted_at: r.warehouse_delisted_at || null,
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

/** Ombor sonlarini tahrirlash (kirim/chiqim/atkaz/brak) */
router.patch('/products/:id/warehouse-ledger', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const row = db
    .prepare(
      `SELECT id, warehouse_kirim_qty, warehouse_chiqim_qty, warehouse_atkaz_qty, brak_qty,
              warehouse_chiqim_confirmed_at, warehouse_atkaz_confirmed_at, warehouse_brak_confirmed_at,
              warehouse_deleted_at
       FROM products WHERE id = ?`,
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }

  const body = req.body || {};
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
  const row = db.prepare(
    'SELECT id, warehouse_chiqim_qty, warehouse_deleted_at FROM products WHERE id = ?',
  ).get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if ((Number(row.warehouse_chiqim_qty) || 0) < 1) {
    return res.status(400).json({ error: 'Avval chiqim sonini kiriting (kamida 1).' });
  }
  db.prepare(`UPDATE products SET warehouse_chiqim_confirmed_at = datetime('now') WHERE id = ?`).run(id);
  res.json({ ok: true });
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
      `UPDATE products SET status = ?, goes_live_at = NULL, warehouse_delisted_at = NULL WHERE id = ?`,
    ).run(nextRaw, id);
  } else {
    db.prepare(
      `UPDATE products SET status = ?, goes_live_at = NULL,
       warehouse_delisted_at = CASE
         WHEN warehouse_delisted_at IS NOT NULL AND trim(coalesce(warehouse_delisted_at, '')) != '' THEN warehouse_delisted_at
         ELSE datetime('now')
       END
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

/** Ombor kirim tasdiqini bekor qilish — mahsulot yana «bosh sahifa» navbatiga tushadi. */
router.post('/products/:id/revoke-kirim-approval', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const row = db
    .prepare('SELECT id, warehouse_approved_at, warehouse_deleted_at FROM products WHERE id = ?')
    .get(id);
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (row.warehouse_deleted_at != null && String(row.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  if (!row.warehouse_approved_at) {
    return res.status(400).json({ error: 'Tasdiqlangan kirim yo‘q.' });
  }
  db.prepare(
    `UPDATE products SET warehouse_approved_at = NULL, warehouse_approved_by = NULL WHERE id = ?`,
  ).run(id);
  res.json({ ok: true });
});

/** Ombor admini sotuvchi mahsulotini ombor uchun TASDIQLAYDI — kirim soni = stock */
router.post('/products/:id/approve-kirim', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID noto'g'ri." });
  }
  const product = db
    .prepare('SELECT id, stock, warehouse_approved_at, warehouse_deleted_at FROM products WHERE id = ?')
    .get(id);
  if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });
  if (product.warehouse_deleted_at != null && String(product.warehouse_deleted_at).trim() !== '') {
    return res.status(400).json({ error: 'Mahsulot o‘chirilgan.' });
  }
  const approvedBy = Number(req.user?.id) || null;
  const kirimQty = Number(product.stock) || 0;
  if (product.warehouse_approved_at) {
    db.prepare('UPDATE products SET warehouse_kirim_qty = ? WHERE id = ?').run(kirimQty, id);
    return res.json({ ok: true, already: true, approved_at: product.warehouse_approved_at });
  }
  db.prepare(
    `UPDATE products SET warehouse_approved_at = datetime('now'), warehouse_approved_by = ?, warehouse_kirim_qty = ?
     WHERE id = ?`,
  ).run(approvedBy, kirimQty, id);
  const fresh = db.prepare('SELECT warehouse_approved_at FROM products WHERE id = ?').get(id);
  res.json({ ok: true, approved_at: fresh.warehouse_approved_at });
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
