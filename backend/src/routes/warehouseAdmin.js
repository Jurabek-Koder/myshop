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
 * chiqim — bekor/pochta qaytganlari (archived ham) chiqariladi: buyurtmalar bo'yicha aktiv qty yig'indisi;
 * atkaz — cancelled/archived yoki courier qaytarilgan; kirim — hozircha omborda alohida jurnal yo‘q, 0.
 */
router.get('/products-overview', (req, res) => {
  const qRaw = String(req.query.q || '').trim();
  const clauses = [`p.seller_id IS NOT NULL`];
  const params = [];

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
      0 AS kirim_soni,
      coalesce(ord_agg.chiqim_soni, 0) AS chiqim_soni,
      coalesce(ord_agg.atkaz_soni, 0) AS atkaz_soni
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
    LIMIT 500
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
    kirim_soni: Number(r.kirim_soni) || 0,
    chiqim_soni: Number(r.chiqim_soni) || 0,
    atkaz_soni: Number(r.atkaz_soni) || 0,
  }));

  res.json({ products: mapped });
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
