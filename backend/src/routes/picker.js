import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, getUserAllowedPages } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { scheduleSkladBotAfterHumanMessage } from '../services/skladChatBot.js';
import {
  normalizePeerRoleName,
  isExcludedLichkaPeerRole,
  fetchSkladArchiveRows,
  insertStaffChatArchiveRow,
  archiveRowToPickerTeamMessage,
  getSkladPeers,
  postChatPresence,
  getChatPresence,
  getDmMessages,
  postDmSend,
  getDmStories,
  getDmCallLogs,
  postDmCallLog,
} from '../lib/staffSkladLichka.js';

const router = Router();
router.use(authRequired, requireRole('picker'));

function getPickerWorkRoleByUserRow(userRow) {
  const login = String(userRow?.login || '').trim();
  const email = String(userRow?.email || '').trim();
  if (!login && !email) return null;
  return db.prepare(`
    SELECT * FROM work_roles
    WHERE deleted_at IS NULL
      AND (lower(login) = lower(?) OR lower(IFNULL(email, '')) = lower(?))
      AND (lower(role_name) = 'picker' OR lower(role_name) LIKE '%picker%')
    LIMIT 1
  `).get(login, email);
}

function getPickerWorkRole(req) {
  return getPickerWorkRoleByUserRow(req.user);
}

function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(order.id);
  return order;
}

router.get('/orders', (req, res) => {
  const status = req.query.status === 'picked' ? 'picked' : 'pending';
  const orderBy = status === 'picked' ? 'o.created_at DESC' : 'o.created_at ASC';
  const limit = status === 'pending' ? 20 : 100;
  const orders = db.prepare(`
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at
    FROM orders o
    WHERE o.status = ?
    ORDER BY ${orderBy}
    LIMIT ?
  `).all(status, limit);

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
  }

  res.json({ orders });
});

router.get('/packers', (req, res) => {
  const packers = db.prepare(`
    SELECT id, full_name, phone, status, orders_handled
    FROM staff_members
    WHERE staff_type = ? AND (status = 'active' OR status = 'pending')
    ORDER BY full_name
  `).all('packer');
  res.json({ packers });
});

router.patch('/orders/:id/status', (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const { status, packer_id: packerId } = req.body;

  if (isNaN(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });
  const statusStr = String(status || '').trim();

  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });

  /** Hold: navbatdan keyinroqqa — packerga yuborilmaydi */
  if (statusStr === 'hold') {
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Faqat kutilayotgan zakazni hold qilish mumkin.' });
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('hold', orderId);
    return res.json(orderWithItems(orderId));
  }

  if (statusStr !== 'picked') return res.status(400).json({ error: 'Faqat status = picked yoki hold qabul qilinadi.' });
  if (order.status !== 'pending') return res.status(400).json({ error: 'Faqat pending buyurtmani yig\'ish mumkin.' });

  const lineGroups = db
    .prepare(
      `
    SELECT oi.product_id,
           SUM(oi.quantity) AS qty,
           MAX(p.name_uz) AS name_uz,
           MAX(p.stock) AS stock
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    GROUP BY oi.product_id
  `
    )
    .all(orderId);
  for (const g of lineGroups) {
    const need = Number(g.qty) || 0;
    const st = g.stock != null ? Number(g.stock) : 0;
    if (need > 0 && st < need) {
      return res.status(400).json({
        error: `“${g.name_uz || 'Mahsulot'}” omborda yetarli emas (${st} ta, kerak ${need}). Hold qiling.`,
      });
    }
  }

  const packerIdNum = packerId != null ? parseInt(packerId, 10) : null;
  if (packerIdNum != null && Number.isInteger(packerIdNum) && packerIdNum > 0) {
    const packer = db.prepare('SELECT id FROM staff_members WHERE id = ? AND staff_type = ?').get(packerIdNum, 'packer');
    if (!packer) return res.status(400).json({ error: 'Packer topilmadi.' });
    db.prepare('UPDATE orders SET status = ?, packer_id = ? WHERE id = ?').run('picked', packerIdNum, orderId);
  } else {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('picked', orderId);
  }

  const updated = orderWithItems(orderId);
  res.json(updated);
});

router.post('/orders/assign-batch', (req, res) => {
  const { order_ids: orderIdsRaw, packer_id: packerId } = req.body;
  const orderIds = Array.isArray(orderIdsRaw) ? orderIdsRaw.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0) : [];
  const packerIdNum = packerId != null ? parseInt(packerId, 10) : null;

  if (orderIds.length === 0) return res.status(400).json({ error: 'Zakaz ID lar kerak.' });
  if (!Number.isInteger(packerIdNum) || packerIdNum < 1) return res.status(400).json({ error: 'To\'g\'ri packer ID kerak.' });

  const packer = db.prepare('SELECT id FROM staff_members WHERE id = ? AND staff_type = ?').get(packerIdNum, 'packer');
  if (!packer) return res.status(400).json({ error: 'Packer topilmadi.' });

  const update = db.prepare('UPDATE orders SET packer_id = ? WHERE id = ? AND status = ?');
  let updated = 0;
  for (const id of orderIds) {
    const r = update.run(packerIdNum, id, 'picked');
    if (r.changes) updated += 1;
  }

  res.json({ assigned: updated, total: orderIds.length });
});

router.get('/balance', (req, res) => {
  const workRole = getPickerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Picker work role topilmadi.' });
  const balance = Number(workRole.total_amount) || 0;
  res.json({ balance });
});

/** Picker o‘z pul yechish tarixini ko‘radi */
router.get('/withdrawals', (req, res) => {
  const workRole = getPickerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Picker work role topilmadi.' });
  const rows = db.prepare(`
    SELECT id, amount, status, payout_method, created_at, reviewed_at, note
    FROM withdrawal_requests
    WHERE work_role_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 50
  `).all(workRole.id);
  res.json({ withdrawals: rows });
});

/** Operator lead orqali yaratilgan, hali yig‘ish kutayotgan zakazlar */
/** Packerga tayinlangan (picked + packer_id), mahsulot bo‘yicha guruhlangan navbat */
router.get('/orders/packer-queue', (_req, res) => {
  try {
    const agg = db.prepare(`
      SELECT oi.product_id,
             COUNT(DISTINCT o.id) AS orders_count,
             SUM(oi.quantity) AS units_in_queue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status = 'picked' AND o.packer_id IS NOT NULL
      GROUP BY oi.product_id
      ORDER BY MIN(datetime(o.created_at)) ASC
    `).all();

    const products = [];
    for (const a of agg) {
      const pid = a.product_id;
      const p = db.prepare('SELECT id, name_uz, image_url, stock FROM products WHERE id = ?').get(pid);
      const orderRows = db
        .prepare(
          `
      SELECT o.id, o.created_at, o.total_amount, o.shipping_address, o.contact_phone,
             SUM(oi.quantity) AS item_quantity
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id AND oi.product_id = ?
      WHERE o.status = 'picked' AND o.packer_id IS NOT NULL
      GROUP BY o.id
      ORDER BY datetime(o.created_at) ASC
    `
        )
        .all(pid);

      products.push({
        product_id: pid,
        name_uz: p?.name_uz || `Mahsulot #${pid}`,
        image_url: p?.image_url || null,
        stock: p?.stock != null ? Number(p.stock) : 0,
        orders_count: Number(a.orders_count) || 0,
        units_in_queue: Number(a.units_in_queue) || 0,
        orders: orderRows.map((row) => ({
          id: row.id,
          created_at: row.created_at,
          total_amount: row.total_amount,
          shipping_address: row.shipping_address,
          contact_phone: row.contact_phone,
          item_quantity: Number(row.item_quantity) || 0,
        })),
      });
    }

    res.json({ products });
  } catch (e) {
    console.error('packer-queue', e);
    res.status(500).json({ error: 'Navbat yuklanmadi.' });
  }
});

router.get('/orders/operator-approved', (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at
    FROM orders o
    WHERE o.status = 'pending'
      AND EXISTS (
        SELECT 1 FROM product_leads pl
        WHERE pl.order_id = o.id
          AND pl.status = 'ordered'
          AND pl.operator_id IS NOT NULL
      )
    ORDER BY datetime(o.created_at) DESC
    LIMIT 30
  `).all();

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
  }

  res.json({ orders });
});

router.post('/withdrawal', (req, res) => {
  const workRole = getPickerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Picker work role topilmadi.' });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Yaroqli summa kiriting.' });
  const balance = Number(workRole.total_amount) || 0;
  if (amount > balance) return res.status(400).json({ error: 'Hisobda yetarli mablag\' yo\'q.' });
  const payoutRaw = String(req.body?.payout_method || 'cash').trim().toLowerCase();
  const payoutMethod = payoutRaw === 'card' ? 'card' : 'cash';
  const result = db.prepare(`
    INSERT INTO withdrawal_requests (work_role_id, amount, status, payout_method) VALUES (?, ?, 'pending', ?)
  `).run(workRole.id, amount, payoutMethod);
  const wrId = result.lastInsertRowid;
  const title = 'Pul yechish so\'rovi';
  const methodUz = payoutMethod === 'card' ? 'karta' : 'naqd';
  const body = `${workRole.role_name || workRole.login}: ${amount.toLocaleString('uz-UZ')} so'm (${methodUz})`;
  const superusers = db.prepare('SELECT id FROM users WHERE LOWER(role) = ?').all('superuser');
  const ins = db.prepare('INSERT INTO user_notifications (user_id, title, body, link_type, link_id) VALUES (?, ?, ?, ?, ?)');
  for (const su of superusers) {
    ins.run(su.id, title, body, 'withdrawal', wrId);
  }
  res.status(201).json({ ok: true, message: 'So\'rov superuserga yuborildi.' });
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
  const u = db.prepare(
    'SELECT id, email, login, full_name, last_name, avatar_url, role, phone FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  const wr = getPickerWorkRoleByUserRow(u);
  const { firstName, lastName } = splitUserName(u.full_name, u.last_name);
  res.json({
    profile: {
      first_name: firstName,
      last_name: lastName,
      full_name: u.full_name,
      email: u.email,
      login: u.login || '',
      phone: u.phone || wr?.phone || '',
      avatar_url: String(u.avatar_url || '').trim(),
      role_label: wr?.role_name || u.role,
      system_role: u.role,
    },
  });
});

router.patch('/profile', async (req, res) => {
  const userId = req.user.id;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!current) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  const body = req.body || {};
  const fullName =
    body.full_name !== undefined && body.full_name !== null
      ? String(body.full_name).trim()
      : String(current.full_name || '').trim();
  const email =
    body.email !== undefined && body.email !== null
      ? String(body.email).trim().toLowerCase()
      : String(current.email || '').trim().toLowerCase();
  const login =
    body.login !== undefined && body.login !== null
      ? String(body.login).trim().toLowerCase()
      : String(current.login || '').trim().toLowerCase();
  const phone =
    body.phone !== undefined && body.phone !== null
      ? String(body.phone).trim()
      : String(current.phone || '').trim();
  const currentSplit = splitUserName(current.full_name, current.last_name);
  const firstNameRaw =
    body.first_name !== undefined && body.first_name !== null
      ? String(body.first_name).trim()
      : currentSplit.firstName;
  const lastName =
    body.last_name !== undefined && body.last_name !== null
      ? String(body.last_name).trim().slice(0, 120)
      : String(current.last_name || '').trim();
  const avatarUrl =
    body.avatar_url !== undefined
      ? String(body.avatar_url || '').trim().slice(0, 200000)
      : String(current.avatar_url || '').trim();
  const mergedFullName = `${firstNameRaw}${lastName ? ` ${lastName}` : ''}`.trim() || fullName;

  const hasRoleLabel = Object.prototype.hasOwnProperty.call(body, 'role_label');
  const roleLabel = hasRoleLabel ? String(body.role_label ?? '').trim().slice(0, 120) : null;

  const pwdRaw = body.password !== undefined && body.password !== null ? String(body.password) : '';
  const password = pwdRaw.trim();

  if (!mergedFullName) return res.status(400).json({ error: 'Ism bo\'sh bo\'lmasin.' });
  if (!email) return res.status(400).json({ error: 'Email kiriting.' });
  if (!login) return res.status(400).json({ error: 'Login kiriting.' });

  const emailTaken = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, userId);
  if (emailTaken) return res.status(409).json({ error: 'Bu email allaqachon band.' });

  const loginTaken = db
    .prepare("SELECT id FROM users WHERE lower(IFNULL(login, '')) = lower(?) AND id != ?")
    .get(login, userId);
  if (loginTaken) return res.status(409).json({ error: 'Bu login allaqachon band.' });

  if (password && password.length < 6) {
    return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lishi kerak.' });
  }

  let passwordHash = current.password_hash;
  if (password) {
    passwordHash = await bcrypt.hash(password, 12);
  }

  const wr = getPickerWorkRoleByUserRow(current);

  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE users SET full_name = ?, last_name = ?, avatar_url = ?, email = ?, login = ?, phone = ?, password_hash = ? WHERE id = ?'
    ).run(mergedFullName, lastName || null, avatarUrl || null, email, login, phone || null, passwordHash, userId);

    if (wr) {
      if (hasRoleLabel) {
        const nameForWr = roleLabel || 'Picker';
        db.prepare(
          'UPDATE work_roles SET role_name = ?, login = ?, email = ?, phone = ? WHERE id = ?'
        ).run(nameForWr, login, email, phone || null, wr.id);
      } else {
        db.prepare('UPDATE work_roles SET login = ?, email = ?, phone = ? WHERE id = ?').run(
          login,
          email,
          phone || null,
          wr.id
        );
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(500).json({ error: 'Saqlashda xatolik.' });
  }

  const updated = db
    .prepare(
      'SELECT id, email, login, full_name, last_name, avatar_url, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?'
    )
    .get(userId);
  updated.allowed_pages = getUserAllowedPages(updated);
  const wr2 = getPickerWorkRoleByUserRow(updated);
  res.json({
    ok: true,
    user: updated,
    profile: {
      first_name: String(updated.full_name || '').trim(),
      last_name: String(updated.last_name || '').trim(),
      avatar_url: String(updated.avatar_url || '').trim(),
      role_label: wr2?.role_name || updated.role,
      system_role: updated.role,
    },
  });
});

/** Sklad / do‘kon: barcha xodimlar (customer va guest dan tashqari) — yangi rol qo‘shilsa avtomatik ro‘yxatda */
router.get('/sklad-peers', (req, res) => {
  try {
    const selfId = req.user.id;
    const rows = db.prepare(`
      SELECT u.id, u.full_name, u.login, u.email, u.phone, u.role AS role_legacy,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id != ?
      ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.login, CAST(u.id AS TEXT)) COLLATE NOCASE
    `).all(selfId);

    const peers = rows
      .filter((row) => !isExcludedLichkaPeerRole(normalizePeerRoleName(row)))
      .map((row) => ({
        id: row.id,
        full_name: row.full_name || '',
        login: row.login || '',
        email: row.email || '',
        phone: row.phone || '',
        role_label: row.role_name || row.role_legacy || '',
      }));

    res.json({ peers });
  } catch (e) {
    console.error('sklad-peers', e);
    res.status(500).json({ error: 'Ro\'yxat yuklanmadi.' });
  }
});

const SKLAD_PRESENCE_STATES = new Set([
  'idle',
  'typing',
  'recording_audio',
  'recording_video',
  'choosing_attachment',
  'preview_media',
]);

/** Sklad chat: kim yozmoqda / qanday media — boshqalar sarlavha ostida ko‘radi */
router.post('/chat/presence', (req, res) => {
  try {
    const userId = req.user.id;
    const roomRaw = String(req.body?.chatRoom || 'sklad').trim() || 'sklad';
    const room = roomRaw === 'sklad' || roomRaw === 'operators' ? roomRaw : 'sklad';
    const state = String(req.body?.state || 'idle').trim();
    if (!SKLAD_PRESENCE_STATES.has(state)) return res.status(400).json({ error: 'Noto‘g‘ri holat.' });
    db.prepare(
      `INSERT INTO staff_chat_presence (user_id, chat_room, state, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, chat_room) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`
    ).run(userId, room, state);
    res.json({ ok: true });
  } catch (e) {
    console.error('picker chat/presence POST', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

router.get('/chat/presence', (req, res) => {
  try {
    const selfId = req.user.id;
    const roomRaw = String(req.query.room || 'sklad').trim() || 'sklad';
    const room = roomRaw === 'sklad' || roomRaw === 'operators' ? roomRaw : 'sklad';
    const staleSeconds = Math.min(60, Math.max(5, parseInt(String(req.query.staleSec || '14'), 10) || 14));
    const rows = db
      .prepare(
        `SELECT p.user_id, p.state, p.updated_at,
                u.full_name, u.login
         FROM staff_chat_presence p
         JOIN users u ON u.id = p.user_id
         WHERE p.chat_room = ?
           AND p.user_id != ?
           AND p.state != 'idle'
           AND datetime(p.updated_at) > datetime('now', ?)`
      )
      .all(room, selfId, `-${staleSeconds} seconds`);

    const peers = rows.map((row) => ({
      userId: row.user_id,
      displayName: String(row.full_name || '').trim(),
      login: String(row.login || '').trim(),
      state: row.state,
      updatedAt: row.updated_at,
    }));
    res.json({ peers });
  } catch (e) {
    console.error('picker chat/presence GET', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

/** Jamoa chat (sklad): oxirgi xabarlar — barcha pickerga bir xil tarix */
router.get('/chat/messages', (req, res) => {
  try {
    const selfId = req.user.id;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
    const rows = fetchSkladArchiveRows(limit, 'sklad');
    const messages = rows.reverse().map((row) => archiveRowToPickerTeamMessage(row, selfId));
    res.json({ messages });
  } catch (e) {
    console.error('picker chat/messages', e);
    res.status(500).json({ error: 'Chat yuklanmadi.' });
  }
});

/** Sklad ichki chat: xabarlar arxivlanadi (superuser ko‘radi). Picker o‘chirsa ham qator bazadan avtomatik o‘chmaydi. */
router.post('/chat/archive', (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Kirish kerak.' });

  const { clientMessageId, chatRoom: roomRaw, messageType, text, isOutgoing, payload: payloadRaw } = req.body || {};
  const allowedRooms = new Set(['sklad', 'operator', 'courier', 'seller', 'customer']);
  const chatRoom = allowedRooms.has(String(roomRaw || '').trim()) ? String(roomRaw).trim() : 'sklad';

  try {
    const { clientMessageId: savedId, inserted } = insertStaffChatArchiveRow(req, {
      chatRoom,
      clientMessageId,
      messageType,
      text,
      isOutgoing,
      payloadRaw,
    });
    if (inserted) {
      scheduleSkladBotAfterHumanMessage(db, {
        chatRoom,
        text: String(text ?? ''),
        clientMessageId: savedId,
        messageType,
        payloadRaw,
      });
    }
  } catch (e) {
    console.warn('staff_chat_archive', e);
    return res.status(500).json({ error: 'Arxivlashda xatolik.' });
  }

  res.json({ ok: true });
});

/** Lichka: boshqa foydalanuvchi yoki MyShop (jamoa chat bilan bir xil sklad tarix) */
router.get('/dm/messages', getDmMessages);
router.get('/dm/stories', getDmStories);
router.get('/dm/call-logs', getDmCallLogs);
router.post('/dm/call-logs', postDmCallLog);

router.post('/dm/send', postDmSend);

export default router;
