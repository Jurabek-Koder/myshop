import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, getUserAllowedPages } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { scheduleSkladBotAfterHumanMessage } from '../services/skladChatBot.js';
import { enqueueAiCallForPendingOrder } from '../modules/operator/call-operator.service.js';
import {
  handleAiCallsList,
  handleAiPendingOrdersForAiCall,
  handleAiTestSamplesFlag,
  handleAiSampleRecording,
  handleCustomerConversationsFeed,
  handleSeedTestAiRecordings,
  handleSeedTestAiConversation,
  handleTestDialogAudioClips,
} from '../modules/operator/call-operator.controller.js';
import {
  getSkladPeers,
  getDmMessages,
  postDmSend,
  getDmStories,
  postChatPresence,
  getChatPresence,
  getDmCallLogs,
  postDmCallLog,
} from '../lib/staffSkladLichka.js';

const router = Router();
router.use(authRequired, requireRole('superuser'));

function normalizeRoleName(value) {
  return String(value || '').trim().toLowerCase();
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

function ensureSellerProfileForUser(userId, fullName, email) {
  let seller = db.prepare('SELECT id FROM sellers WHERE user_id = ?').get(userId);

  if (!seller && email) {
    seller = db.prepare('SELECT id FROM sellers WHERE lower(email) = lower(?)').get(email);
  }

  if (!seller) {
    const result = db.prepare(
      'INSERT INTO sellers (name, contact_phone, email, region_id, balance, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(fullName || 'Seller', null, email || null, null, 0, 'active', userId);
    return result.lastInsertRowid;
  }

  db.prepare('UPDATE sellers SET user_id = ?, name = ?, email = COALESCE(?, email) WHERE id = ?').run(
    userId,
    fullName || 'Seller',
    email || null,
    seller.id
  );

  return seller.id;
}

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.login,
      u.phone,
      u.full_name,
      u.role,
      u.role_id,
      COALESCE(NULLIF(trim(COALESCE(u.status, '')), ''), 'active') as status,
      u.seller_id,
      u.staff_member_id,
      u.created_at,
      COALESCE(
        NULLIF(trim(COALESCE(u.registered_ip, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.ip FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'register' ORDER BY e.id ASC LIMIT 1), '')), '')
      ) AS registered_ip,
      COALESCE(
        NULLIF(trim(COALESCE(u.registered_user_agent, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.user_agent FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'register' ORDER BY e.id ASC LIMIT 1), '')), '')
      ) AS registered_user_agent,
      COALESCE(
        NULLIF(trim(COALESCE(u.registered_device, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.device FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'register' ORDER BY e.id ASC LIMIT 1), '')), ''),
        NULLIF(trim(COALESCE(u.last_login_device, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.device FROM user_device_events e WHERE e.user_id = u.id ORDER BY e.id DESC LIMIT 1), '')), '')
      ) AS registered_device,
      COALESCE(
        NULLIF(trim(COALESCE(u.registered_location, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.location FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'register' ORDER BY e.id ASC LIMIT 1), '')), '')
      ) AS registered_location,
      COALESCE(
        NULLIF(trim(COALESCE(u.last_login_at, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.created_at FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'login' ORDER BY e.id DESC LIMIT 1), '')), ''),
        NULLIF(trim(COALESCE((SELECT o.created_at FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ) AS last_login_at,
      COALESCE(
        NULLIF(trim(COALESCE(u.last_login_ip, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.ip FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'login' ORDER BY e.id DESC LIMIT 1), '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_ip FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ) AS last_login_ip,
      COALESCE(
        NULLIF(trim(COALESCE(u.last_login_user_agent, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.user_agent FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'login' ORDER BY e.id DESC LIMIT 1), '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_user_agent FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ) AS last_login_user_agent,
      COALESCE(
        NULLIF(trim(COALESCE(u.last_login_device, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.device FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'login' ORDER BY e.id DESC LIMIT 1), '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_device FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ) AS last_login_device,
      COALESCE(
        NULLIF(trim(COALESCE(u.last_login_location, '')), ''),
        NULLIF(trim(COALESCE((SELECT e.location FROM user_device_events e WHERE e.user_id = u.id AND e.event_type = 'login' ORDER BY e.id DESC LIMIT 1), '')), ''),
        NULLIF(trim(COALESCE((SELECT o.order_location FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1), '')), '')
      ) AS last_login_location,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders_count,
      (SELECT o.created_at FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1) AS latest_order_at,
      (SELECT o.order_device FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1) AS latest_order_device,
      (SELECT o.order_ip FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1) AS latest_order_ip,
      (SELECT o.order_location FROM orders o WHERE o.user_id = u.id ORDER BY o.id DESC LIMIT 1) AS latest_order_location,
      u.password_plain,
      (
        SELECT GROUP_CONCAT(CAST(h.id AS TEXT) || '::' || h.password_plain, ' || ')
        FROM (
          SELECT id, password_plain
          FROM user_password_history
          WHERE user_id = u.id AND length(trim(COALESCE(password_plain, ''))) > 0
          ORDER BY id DESC
          LIMIT 6
        ) h
      ) AS password_history_preview,
      CASE
        WHEN length(trim(IFNULL(u.password_hash, ''))) > 0
          THEN substr(u.password_hash, 1, 14) || '...'
        ELSE ''
      END AS password_hash_preview,
      CASE
        WHEN length(trim(IFNULL(u.password_hash, ''))) > 0 THEN 1
        ELSE 0
      END AS has_password_hash,
      r.name as role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.id DESC
  `).all();
  res.json({ users });
});

/**
 * AI Call-Operator — faqat superuser ko‘radi.
 */
router.get('/ai-calls', handleAiCallsList);
router.get('/ai-call/pending-orders', handleAiPendingOrdersForAiCall);
router.get('/ai-call/test-samples-flag', handleAiTestSamplesFlag);
router.get('/ai-call/sample-recording/:id', handleAiSampleRecording);
router.post('/ai-call/seed-test-recordings', handleSeedTestAiRecordings);
router.post('/ai-call/seed-test-conversation', handleSeedTestAiConversation);
router.post('/ai-call/test-dialog-clips', handleTestDialogAudioClips);
router.get('/customer-conversations', handleCustomerConversationsFeed);
router.get('/ai-call/recording', async (req, res) => {
  try {
    const urlRaw = String(req.query.url || '').trim();
    if (!urlRaw) return res.status(400).json({ error: 'url kerak' });
    let u;
    try {
      u = new URL(urlRaw);
    } catch {
      return res.status(400).json({ error: 'url noto‘g‘ri' });
    }
    if (u.protocol !== 'https:') return res.status(400).json({ error: 'faqat https' });

    // SSRF himoya: faqat Vapi domen(lar)i
    const host = String(u.hostname || '').toLowerCase();
    if (!(host === 'vapi.ai' || host.endsWith('.vapi.ai'))) {
      return res.status(403).json({ error: 'Ruxsat berilmagan host' });
    }

    const r = await fetch(u.toString(), { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: `Upstream error: ${r.status}` });

    const ct = r.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=300');

    // Node.js fetch body — Web stream; Buffer ga yig‘ish eng ishonchli (qisqa yozuvlar).
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  } catch (e) {
    console.warn('recording proxy', e);
    res.status(500).json({ error: 'Audio yuklanmadi' });
  }
});
router.post('/ai-call/start', async (req, res) => {
  const orderId = parseInt(String(req.body?.order_id ?? ''), 10);
  if (!Number.isFinite(orderId) || orderId < 1) return res.status(400).json({ error: 'order_id noto\'g\'ri' });
  try {
    await enqueueAiCallForPendingOrder({ orderId, operatorId: req.user.id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'AI qo‘ng‘iroq start xatolik' });
  }
});

router.patch('/users/:id/role', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { role_id } = req.body;
  if (isNaN(userId) || userId < 1) return res.status(400).json({ error: 'Noto\'g\'ri foydalanuvchi ID.' });

  const roleId = role_id != null ? parseInt(role_id, 10) : null;
  if (roleId !== null && (isNaN(roleId) || roleId < 1)) return res.status(400).json({ error: 'Noto\'g\'ri role_id.' });

  const user = db.prepare('SELECT id, email, full_name, role, seller_id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  if (normalizeRoleName(user.role) === 'superuser') {
    return res.status(403).json({ error: 'Superuser rolini o\'zgartirish mumkin emas.' });
  }

  const role = roleId ? db.prepare('SELECT id, name FROM roles WHERE id = ?').get(roleId) : null;
  if (roleId && !role) return res.status(404).json({ error: 'Role topilmadi.' });

  const nextRole = normalizeRoleName(role?.name || 'customer') || 'customer';

  const tx = db.transaction(() => {
    let sellerId = null;

    if (nextRole === 'seller') {
      sellerId = ensureSellerProfileForUser(userId, user.full_name, user.email);
    } else if (user.seller_id) {
      db.prepare('UPDATE sellers SET user_id = NULL WHERE id = ? AND user_id = ?').run(user.seller_id, userId);
    }

    db.prepare('UPDATE users SET role = ?, role_id = ?, seller_id = ? WHERE id = ?').run(nextRole, roleId || 2, sellerId, userId);
  });

  tx();

  const updated = db.prepare('SELECT id, email, full_name, role, role_id, seller_id FROM users WHERE id = ?').get(userId);
  res.json(updated);
});

router.patch('/users/:id/status', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const statusRaw = String(req.body?.status || '').trim().toLowerCase();
  const status = statusRaw === 'blocked' ? 'blocked' : statusRaw === 'active' ? 'active' : '';
  if (isNaN(userId) || userId < 1) return res.status(400).json({ error: 'Noto\'g\'ri foydalanuvchi ID.' });
  if (!status) return res.status(400).json({ error: 'status active yoki blocked bo\'lishi kerak.' });

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  if (normalizeRoleName(user.role) === 'superuser') {
    return res.status(403).json({ error: 'Superuser statusini o\'zgartirib bo\'lmaydi.' });
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  const updated = db
    .prepare('SELECT id, email, login, full_name, role, role_id, seller_id, status FROM users WHERE id = ?')
    .get(userId);
  return res.json({ ok: true, user: updated });
});

router.patch('/users/:id/password', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId) || userId < 1) {
    return res.status(400).json({ error: 'Noto\'g\'ri foydalanuvchi ID.' });
  }

  const user = db.prepare('SELECT id, role, email, full_name FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  if (normalizeRoleName(user.role) === 'superuser') {
    return res.status(403).json({ error: 'Superuser parolini bu yerda almashtirib bo\'lmaydi.' });
  }

  const raw = req.body?.password != null ? String(req.body.password).trim() : '';
  const generated =
    raw ||
    `${Math.random().toString(36).slice(2, 6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}${String(Date.now()).slice(-2)}!`;

  if (generated.length < 6) {
    return res.status(400).json({ error: "Parol kamida 6 ta belgidan iborat bo'lsin." });
  }

  const passwordHash = bcrypt.hashSync(generated, 12);
  const prev = db.prepare('SELECT password_plain FROM users WHERE id = ?').get(userId);
  const prevPlain = String(prev?.password_plain || '').trim();
  if (prevPlain && prevPlain !== generated) {
    db.prepare('INSERT INTO user_password_history (user_id, password_plain, note) VALUES (?, ?, ?)').run(
      userId,
      prevPlain,
      'Superuser parolni yangilashdan oldingi parol',
    );
  }
  db.prepare('UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?').run(passwordHash, generated, userId);

  return res.json({
    ok: true,
    user_id: userId,
    full_name: user.full_name,
    email: user.email,
    temporary_password: generated,
  });
});

router.delete('/users/:id/password-history/:historyId', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const historyId = parseInt(req.params.historyId, 10);
  if (isNaN(userId) || userId < 1 || isNaN(historyId) || historyId < 1) {
    return res.status(400).json({ error: "Noto'g'ri ID." });
  }

  const row = db.prepare('SELECT id, user_id FROM user_password_history WHERE id = ?').get(historyId);
  if (!row || Number(row.user_id) !== Number(userId)) {
    return res.status(404).json({ error: 'Parol tarixi topilmadi.' });
  }

  db.prepare('DELETE FROM user_password_history WHERE id = ?').run(historyId);
  return res.json({ ok: true });
});

const courierRoleId = () => db.prepare('SELECT id FROM roles WHERE name = ?').get('courier')?.id || 3;

router.get('/couriers', (req, res) => {
  const list = db.prepare(`
    SELECT u.id, u.full_name, u.login, u.email, u.created_at, u.staff_member_id,
           s.phone, s.orders_handled, s.rating, s.status as staff_status, s.region_id,
           COALESCE(NULLIF(trim(s.region_service_text), ''), r.name) as region_name
    FROM users u
    LEFT JOIN staff_members s ON s.id = u.staff_member_id AND s.staff_type = 'courier'
    LEFT JOIN regions r ON r.id = s.region_id
    WHERE LOWER(u.role) = 'courier'
    ORDER BY u.id
  `).all();
  res.json({ couriers: list });
});

router.post('/couriers', (req, res) => {
  const full_name = String(req.body?.full_name || '').trim();
  const login = String(req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();
  const phone = String(req.body?.phone || '').trim() || null;

  if (!full_name) return res.status(400).json({ error: 'Ism kerak.' });
  if (!login || login.length < 3) return res.status(400).json({ error: 'Login kamida 3 belgi.' });
  if (!password || password.length < 5) return res.status(400).json({ error: 'Parol kamida 5 belgi.' });

  const existingLogin = db.prepare('SELECT id FROM users WHERE lower(login) = ?').get(login);
  if (existingLogin) return res.status(409).json({ error: 'Bu login band.' });

  const email = `${login}@courier.myshop.local`;
  const password_hash = bcrypt.hashSync(password, 12);

  const tx = db.transaction(() => {
    const staffResult = db.prepare(`
      INSERT INTO staff_members (staff_type, full_name, phone, status) VALUES (?, ?, ?, 'active')
    `).run('courier', full_name, phone);
    const staffId = staffResult.lastInsertRowid;

    const userResult = db.prepare(`
      INSERT INTO users (email, login, password_hash, full_name, role, role_id, staff_member_id)
      VALUES (?, ?, ?, ?, 'courier', ?, ?)
    `).run(email, login, password_hash, full_name, courierRoleId(), staffId);

    db.prepare('UPDATE staff_members SET user_id = ? WHERE id = ?').run(userResult.lastInsertRowid, staffId);

    return { userId: userResult.lastInsertRowid, staffId };
  });

  const created = tx();
  const user = db.prepare('SELECT id, full_name, login, email, role, staff_member_id FROM users WHERE id = ?').get(created.userId);
  const staff = db.prepare('SELECT id, phone, orders_handled, rating, status FROM staff_members WHERE id = ?').get(created.staffId);
  res.status(201).json({ courier: { ...user, phone: staff?.phone, orders_handled: staff?.orders_handled } });
});

router.patch('/couriers/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const user = db.prepare('SELECT id, role, staff_member_id FROM users WHERE id = ?').get(id);
  if (!user || normalizeRoleName(user.role) !== 'courier') return res.status(404).json({ error: 'Kuryer topilmadi.' });

  const full_name = req.body?.full_name != null ? String(req.body.full_name).trim() : null;
  const login = req.body?.login != null ? String(req.body.login).trim().toLowerCase() : null;
  const password = req.body?.password != null ? String(req.body.password).trim() : null;
  const phone = req.body?.phone !== undefined ? (String(req.body.phone).trim() || null) : null;

  if (login !== null && login.length < 3) return res.status(400).json({ error: 'Login kamida 3 belgi.' });
  if (password !== null && password.length < 5) return res.status(400).json({ error: 'Parol kamida 5 belgi.' });

  if (login !== null) {
    const existing = db.prepare('SELECT id FROM users WHERE lower(login) = ? AND id != ?').get(login, id);
    if (existing) return res.status(409).json({ error: 'Bu login band.' });
  }

  const tx = db.transaction(() => {
    const updates = [];
    const params = [];
    if (full_name !== null) { updates.push('full_name = ?'); params.push(full_name); }
    if (login !== null) { updates.push('login = ?'); params.push(login); }
    if (password !== null) {
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(password, 12));
    }
    if (updates.length) {
      params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    if (user.staff_member_id && phone !== undefined) {
      db.prepare('UPDATE staff_members SET phone = ? WHERE id = ?').run(phone, user.staff_member_id);
    }
  });
  tx();

  const updated = db.prepare('SELECT id, full_name, login, email, role, staff_member_id FROM users WHERE id = ?').get(id);
  const staff = user.staff_member_id ? db.prepare('SELECT phone, orders_handled, rating FROM staff_members WHERE id = ?').get(user.staff_member_id) : null;
  res.json({ courier: { ...updated, phone: staff?.phone, orders_handled: staff?.orders_handled } });
});

function getCourierFee() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('courier_fee_per_order');
  const val = Number(row?.value);
  return Number.isFinite(val) && val >= 0 ? val : 25000;
}

router.get('/courier-fee', (req, res) => {
  res.json({ courier_fee_per_order: getCourierFee() });
});

router.patch('/courier-fee', (req, res) => {
  const fee = req.body?.courier_fee_per_order;
  const num = fee != null ? Number(fee) : NaN;
  if (!Number.isFinite(num) || num < 0) {
    return res.status(400).json({ error: 'Kuryer haqqi 0 dan katta son bo\'lishi kerak.' });
  }
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('courier_fee_per_order', String(Math.round(num)));
  res.json({ courier_fee_per_order: getCourierFee() });
});

router.get('/stats', (req, res) => {
  const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const productsCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  const ordersCount = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total_amount), 0) as s FROM orders WHERE status != ?').get('cancelled').s;
  const superuserCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get('superuser').c;
  const pendingSellerProducts = db
    .prepare(
      `SELECT COUNT(*) as c FROM products
       WHERE seller_id IS NOT NULL
         AND (
           status IS NULL
           OR TRIM(COALESCE(status, '')) = ''
           OR LOWER(TRIM(status)) = 'pending'
         )`
    )
    .get().c;
  res.json({
    users: usersCount,
    products: productsCount,
    orders: ordersCount,
    totalRevenue,
    superusers: superuserCount,
    pendingSellerProducts,
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

/** Ichki chat arxivi: sklad | operator | courier | seller | customer — MyShop jamoasi odatda oxirgi 100 ta */
router.get('/chat/archive', (req, res) => {
  const room = String(req.query.room || 'sklad').trim() || 'sklad';
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  const rows = db
    .prepare(
      `SELECT id, client_message_id, chat_room, sender_user_id, sender_label, is_from_staff, message_type, body, payload_json, created_at
       FROM staff_chat_archive WHERE chat_room = ? ORDER BY id DESC LIMIT ?`
    )
    .all(room, limit);
  res.json({ messages: rows.reverse() });
});

/** MyShop jamoasi: sklad guruh chatiga javob (picker ilovasida «kiruvchi» sifatida ko‘rinadi) */
router.post('/chat/sklad-message', (req, res) => {
  const userId = req.user.id;
  const label = String(req.user.full_name || req.user.login || 'MyShop').trim().slice(0, 200);
  const cid = String(req.body?.clientMessageId || `ms-${Date.now()}`).trim().slice(0, 128);
  const text = String(req.body?.text ?? '').slice(0, 8000);
  const type = String(req.body?.messageType || 'text').trim().slice(0, 32) || 'text';
  let payloadJson = null;
  if (req.body?.payload != null && typeof req.body.payload === 'object') {
    try {
      payloadJson = JSON.stringify(req.body.payload);
    } catch {
      payloadJson = null;
    }
  }
  if (!text && type === 'text') {
    return res.status(400).json({ error: 'Matn kiriting.' });
  }
  try {
    const ins = db.prepare(
      `INSERT OR IGNORE INTO staff_chat_archive (client_message_id, chat_room, sender_user_id, sender_label, is_from_staff, message_type, body, payload_json)
       VALUES (?, 'sklad', ?, ?, 0, ?, ?, ?)`
    );
    const result = ins.run(cid, userId, label, type, text || null, payloadJson);
    if (result.changes > 0) {
      scheduleSkladBotAfterHumanMessage(db, {
        chatRoom: 'sklad',
        text,
        clientMessageId: cid,
        messageType: type,
        payloadRaw: req.body?.payload,
      });
    }
  } catch (e) {
    console.warn('admin sklad-message', e);
    return res.status(500).json({ error: 'Saqlanmadi.' });
  }
  res.status(201).json({ ok: true, clientMessageId: cid });
});

/** Lichka: barcha «MyShop» (brand) bilan suhbatlar — oxirgi xabarlar */
router.get('/dm/brand-inbox', (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  const rows = db
    .prepare(
      `SELECT d.id, d.client_message_id, d.thread_key, d.sender_user_id, d.message_type, d.body, d.payload_json, d.created_at,
              u.full_name AS sender_full_name, u.login AS sender_login
       FROM staff_direct_messages d
       JOIN users u ON u.id = d.sender_user_id
       WHERE d.thread_key LIKE 'brand:%'
       ORDER BY d.id DESC
       LIMIT ?`
    )
    .all(limit);
  const messages = rows.reverse().map((row) => {
    const pickerUserId = String(row.thread_key || '').startsWith('brand:')
      ? parseInt(String(row.thread_key).slice('brand:'.length), 10)
      : null;
    return {
      id: row.id,
      client_message_id: row.client_message_id,
      thread_key: row.thread_key,
      picker_user_id: Number.isInteger(pickerUserId) ? pickerUserId : null,
      sender_user_id: row.sender_user_id,
      sender_full_name: row.sender_full_name,
      sender_login: row.sender_login,
      message_type: row.message_type,
      body: row.body,
      payload_json: row.payload_json,
      created_at: row.created_at,
    };
  });
  res.json({ messages });
});

const META_ADS_SETTINGS_KEY = 'meta_ads_settings';
const META_GRAPH_VERSION = 'v21.0';

function readMetaAdsStoredObject() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(META_ADS_SETTINGS_KEY);
  if (!row?.value) return {};
  try {
    return JSON.parse(String(row.value));
  } catch {
    return {};
  }
}

function normalizeMetaAdsPublic(o) {
  const base = {
    connected: false,
    ad_account_id: '',
    pixel_id: '',
    daily_budget_uzs: '',
    note: '',
    active_campaigns: 0,
    pending_approval: 0,
    updated_at: null,
    access_token_configured: false,
  };
  const src = o && typeof o === 'object' ? o : {};
  const ac = parseInt(String(src.active_campaigns ?? '0'), 10);
  const pa = parseInt(String(src.pending_approval ?? '0'), 10);
  const tok = String(src.access_token || '').trim();
  return {
    ...base,
    connected: Boolean(src.connected),
    ad_account_id: String(src.ad_account_id || '').trim().slice(0, 64),
    pixel_id: String(src.pixel_id || '').trim().slice(0, 64),
    daily_budget_uzs: String(src.daily_budget_uzs || '').trim().slice(0, 32),
    note: String(src.note || '').trim().slice(0, 500),
    active_campaigns: Number.isFinite(ac) ? Math.min(999, Math.max(0, ac)) : 0,
    pending_approval: Number.isFinite(pa) ? Math.min(999, Math.max(0, pa)) : 0,
    updated_at: src.updated_at || null,
    access_token_configured: Boolean(tok) || Boolean(String(process.env.META_ACCESS_TOKEN || '').trim()),
  };
}

function normalizeAdAccountIdForGraph(id) {
  const s = String(id || '').trim().replace(/^act_/i, '');
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  return `act_${digits}`;
}

async function metaGraphFetch(pathWithLeadingSlash, accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw new Error('Token yo‘q.');
  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}${pathWithLeadingSlash.startsWith('/') ? '' : '/'}${pathWithLeadingSlash}`);
  u.searchParams.set('access_token', token);
  const r = await fetch(u.toString(), { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (data.error) {
    const msg = String(data.error.message || data.error.error_user_msg || data.error.type || 'Meta API xatosi');
    throw new Error(msg);
  }
  return data;
}

/** Meta Ads sozlamalari (GET: token yo‘q, faqat access_token_configured) */
router.get('/meta-ads/settings', (req, res) => {
  try {
    const stored = readMetaAdsStoredObject();
    res.json(normalizeMetaAdsPublic(stored));
  } catch (e) {
    console.error('meta-ads settings get', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

router.patch('/meta-ads/settings', (req, res) => {
  try {
    const body = req.body || {};
    const stored = readMetaAdsStoredObject();
    const prev = normalizeMetaAdsPublic(stored);
    let accessToken = String(stored.access_token || '').trim();

    if (body.access_token !== undefined) {
      const t = String(body.access_token || '').trim();
      if (t === '' || t === '__CLEAR__') accessToken = '';
      else accessToken = t.slice(0, 2048);
    }

    const acRaw = parseInt(String(body.active_campaigns ?? prev.active_campaigns), 10);
    const paRaw = parseInt(String(body.pending_approval ?? prev.pending_approval), 10);
    const next = {
      connected: body.connected != null ? Boolean(body.connected) : prev.connected,
      ad_account_id: body.ad_account_id != null ? String(body.ad_account_id || '').trim().slice(0, 64) : prev.ad_account_id,
      pixel_id: body.pixel_id != null ? String(body.pixel_id || '').trim().slice(0, 64) : prev.pixel_id,
      daily_budget_uzs: body.daily_budget_uzs != null ? String(body.daily_budget_uzs || '').trim().slice(0, 32) : prev.daily_budget_uzs,
      note: body.note != null ? String(body.note || '').trim().slice(0, 500) : prev.note,
      active_campaigns: Number.isFinite(acRaw) ? Math.min(999, Math.max(0, acRaw)) : prev.active_campaigns,
      pending_approval: Number.isFinite(paRaw) ? Math.min(999, Math.max(0, paRaw)) : prev.pending_approval,
      updated_at: new Date().toISOString(),
      access_token: accessToken,
    };

    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      META_ADS_SETTINGS_KEY,
      JSON.stringify(next),
    );
    const pub = normalizeMetaAdsPublic(next);
    res.json({ ok: true, ...pub });
  } catch (e) {
    console.error('meta-ads settings patch', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

/** Meta dan kampaniya ro‘yxati (Graph API) */
router.get('/meta-ads/campaigns', async (req, res) => {
  try {
    const stored = readMetaAdsStoredObject();
    const pub = normalizeMetaAdsPublic(stored);
    let token = String(stored.access_token || '').trim();
    if (!token) token = String(process.env.META_ACCESS_TOKEN || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Graph API access token yo‘q. Token maydoniga yoki server .env da META_ACCESS_TOKEN qo‘ying.' });
    }
    const act = normalizeAdAccountIdForGraph(pub.ad_account_id);
    if (!act) {
      return res.status(400).json({ error: 'Reklama akkaunti ID kiritilmagan yoki noto‘g‘ri.' });
    }
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const fields = 'id,name,status,effective_status,objective,daily_budget,created_time';
    const data = await metaGraphFetch(`/${act}/campaigns?fields=${encodeURIComponent(fields)}&limit=${limit}`, token);
    const campaigns = Array.isArray(data.data) ? data.data : [];
    res.json({ campaigns, count: campaigns.length, ad_account: act });
  } catch (e) {
    console.error('meta-ads campaigns', e);
    res.status(502).json({ error: String(e.message || e || 'Meta dan olinmadi.') });
  }
});

/** Superuser: ichki chat (picker/kuryer/operator bilan bir xil API) */
router.get('/profile', (req, res) => {
  try {
    const u = db
      .prepare('SELECT id, email, login, full_name, last_name, avatar_url, role, phone FROM users WHERE id = ?')
      .get(req.user.id);
    if (!u) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
    const { firstName, lastName } = splitUserName(u.full_name, u.last_name);
    res.json({
      profile: {
        first_name: firstName,
        last_name: lastName,
        full_name: u.full_name,
        email: u.email,
        login: u.login || '',
        phone: String(u.phone || '').trim(),
        avatar_url: String(u.avatar_url || '').trim(),
        role_label: u.role || 'superuser',
        system_role: u.role,
      },
    });
  } catch (e) {
    console.error('admin profile GET', e);
    res.status(500).json({ error: 'Profil yuklanmadi.' });
  }
});

router.patch('/profile', async (req, res) => {
  try {
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

    const pwdRaw = body.password !== undefined && body.password !== null ? String(body.password) : '';
    const password = pwdRaw.trim();

    if (!mergedFullName) return res.status(400).json({ error: "Ism bo'sh bo'lmasin." });
    if (!email) return res.status(400).json({ error: 'Email kiriting.' });
    if (!login) return res.status(400).json({ error: 'Login kiriting.' });

    const emailTaken = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, userId);
    if (emailTaken) return res.status(409).json({ error: 'Bu email allaqachon band.' });

    const loginTaken = db
      .prepare("SELECT id FROM users WHERE lower(IFNULL(login, '')) = lower(?) AND id != ?")
      .get(login, userId);
    if (loginTaken) return res.status(409).json({ error: 'Bu login allaqachon band.' });

    if (password && password.length < 6) {
      return res.status(400).json({ error: "Parol kamida 6 belgi bo'lishi kerak." });
    }

    let passwordHash = current.password_hash;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    db.prepare(
      'UPDATE users SET full_name = ?, last_name = ?, avatar_url = ?, email = ?, login = ?, phone = ?, password_hash = ? WHERE id = ?'
    ).run(mergedFullName, lastName || null, avatarUrl || null, email, login, phone || null, passwordHash, userId);

    const updated = db
      .prepare(
        'SELECT id, email, login, full_name, last_name, avatar_url, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?'
      )
      .get(userId);
    updated.allowed_pages = getUserAllowedPages(updated);
    res.json({
      ok: true,
      user: updated,
      profile: {
        first_name: String(updated.full_name || '').trim(),
        last_name: String(updated.last_name || '').trim(),
        avatar_url: String(updated.avatar_url || '').trim(),
        role_label: updated.role || 'superuser',
        system_role: updated.role,
      },
    });
  } catch (e) {
    console.error('admin profile PATCH', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

router.get('/sklad-peers', getSkladPeers);
router.get('/dm/messages', getDmMessages);
router.get('/dm/stories', getDmStories);
router.get('/dm/call-logs', getDmCallLogs);
router.post('/dm/call-logs', postDmCallLog);
router.post('/dm/send', postDmSend);
router.post('/chat/presence', postChatPresence);
router.get('/chat/presence', getChatPresence);

/** Superuser: ichki chat uchun yangi guruhlar (rol, vazifalar, adminlar) */
const STAFF_GROUP_TARGET_ROLES = new Set([
  'operator',
  'courier',
  'picker',
  'packer',
  'expeditor',
  'order_receiver',
  'seller',
  'superuser',
]);

const ORDER_USERS_BY_NAME = `ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.login, CAST(u.id AS TEXT)) COLLATE NOCASE`;

/**
 * Guruh admini nomzodi guruhning «target» roliga mosmi (seller: seller_id yoki role=seller).
 */
function isEligibleStaffGroupAdmin(row, targetRole) {
  const legacy = String(row.role_legacy || '').trim().toLowerCase();
  const sellerId = row.seller_id != null ? Number(row.seller_id) : 0;
  if (legacy === 'guest') return false;
  if (targetRole === 'seller') {
    return legacy === 'seller' || (Number.isFinite(sellerId) && sellerId > 0);
  }
  if (targetRole === 'superuser') {
    return legacy === 'superuser' || Number(row.role_id) === 1;
  }
  return legacy === targetRole;
}

function listStaffGroupAdminCandidates(targetRole, selfId) {
  if (targetRole === 'seller') {
    return db
      .prepare(
        `SELECT u.id, u.full_name, u.login, u.email, u.phone, u.role AS role_legacy, u.role_id, u.seller_id,
                COALESCE(NULLIF(TRIM(r.name), ''), u.role, 'seller') AS role_label
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id != ?
           AND (
             lower(trim(COALESCE(u.role, ''))) = 'seller'
             OR IFNULL(u.seller_id, 0) != 0
           )
         ${ORDER_USERS_BY_NAME}`,
      )
      .all(selfId);
  }
  if (targetRole === 'superuser') {
    return db
      .prepare(
        `SELECT u.id, u.full_name, u.login, u.email, u.phone, u.role AS role_legacy, u.role_id, u.seller_id,
                COALESCE(r.name, u.role, 'superuser') AS role_label
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id != ?
           AND (lower(trim(COALESCE(u.role, ''))) = 'superuser' OR IFNULL(u.role_id, 0) = 1)
         ${ORDER_USERS_BY_NAME}`,
      )
      .all(selfId);
  }
  return db
    .prepare(
      `SELECT u.id, u.full_name, u.login, u.email, u.phone, u.role AS role_legacy, u.role_id, u.seller_id,
              COALESCE(r.name, u.role) AS role_label
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id != ? AND lower(trim(COALESCE(u.role, ''))) = ?
       ${ORDER_USERS_BY_NAME}`,
    )
    .all(selfId, targetRole);
}

/** Guruh adminlari ro‘yxati: har bir «target» rol uchun mos foydalanuvchilar (seller — seller_id bilan ham) */
router.get('/staff-group-admin-candidates', (req, res) => {
  const target = normalizeRoleName(req.query.target_role || '');
  if (!STAFF_GROUP_TARGET_ROLES.has(target)) {
    return res.status(400).json({ error: 'Noto‘g‘ri rol.' });
  }
  try {
    const selfId = req.user.id;
    const rows = listStaffGroupAdminCandidates(target, selfId);
    const peers = rows.map((row) => ({
      id: row.id,
      full_name: row.full_name || '',
      login: row.login || '',
      email: row.email || '',
      phone: row.phone || '',
      role_label: String(row.role_label || row.role_legacy || '').trim(),
      system_role: String(row.role_legacy || '').trim().toLowerCase(),
    }));
    res.json({ peers });
  } catch (e) {
    console.error('admin staff-group-admin-candidates', e);
    res.status(500).json({ error: 'Ro‘yxat yuklanmadi.' });
  }
});

router.get('/staff-groups', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, title, target_role, tasks_description, admin_user_ids_json, created_by, created_at
         FROM superuser_staff_groups ORDER BY id DESC`,
      )
      .all();
    const groups = rows.map((r) => ({
      id: r.id,
      title: r.title,
      target_role: r.target_role,
      tasks_description: r.tasks_description,
      admin_user_ids: (() => {
        try {
          return JSON.parse(r.admin_user_ids_json || '[]');
        } catch {
          return [];
        }
      })(),
      created_by: r.created_by,
      created_at: r.created_at,
    }));
    res.json({ groups });
  } catch (e) {
    console.error('admin staff-groups GET', e);
    res.status(500).json({ error: 'Ro‘yxat yuklanmadi.' });
  }
});

router.post('/staff-groups', (req, res) => {
  try {
    const title = String(req.body?.title ?? '').trim().slice(0, 200);
    const targetRole = normalizeRoleName(req.body?.target_role);
    const tasksDescription = String(req.body?.tasks_description ?? '').slice(0, 8000);
    const rawIds = req.body?.admin_user_ids;
    if (!title) return res.status(400).json({ error: 'Guruh nomi kiriting.' });
    if (!STAFF_GROUP_TARGET_ROLES.has(targetRole)) {
      return res.status(400).json({ error: 'Noto‘g‘ri rol tanlangan.' });
    }
    const adminIds = Array.isArray(rawIds) ? rawIds : [];
    const unique = [...new Set(adminIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isInteger(n) && n > 0))];
    if (unique.length === 0) {
      return res.status(400).json({ error: 'Kamida bitta guruh admini tanlang.' });
    }

    const peerRows = db
      .prepare(
        `SELECT u.id, u.role AS role_legacy, r.name AS role_name, u.role_id, u.seller_id
         FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id IN (${unique.map(() => '?').join(',')})`,
      )
      .all(...unique);
    if (peerRows.length !== unique.length) {
      return res.status(400).json({ error: 'Ba‘zi foydalanuvchilar topilmadi.' });
    }
    for (const row of peerRows) {
      if (!isEligibleStaffGroupAdmin(row, targetRole)) {
        return res.status(400).json({
          error: 'Tanlangan foydalanuvchi bu guruh roli uchun guruh admini sifatida mos emas.',
        });
      }
    }

    const json = JSON.stringify(unique);
    const result = db
      .prepare(
        `INSERT INTO superuser_staff_groups (title, target_role, tasks_description, admin_user_ids_json, created_by)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(title, targetRole, tasksDescription, json, req.user.id);

    const created = db
      .prepare(
        `SELECT id, title, target_role, tasks_description, admin_user_ids_json, created_by, created_at
         FROM superuser_staff_groups WHERE id = ?`,
      )
      .get(result.lastInsertRowid);

    res.status(201).json({
      group: {
        id: created.id,
        title: created.title,
        target_role: created.target_role,
        tasks_description: created.tasks_description,
        admin_user_ids: unique,
        created_by: created.created_by,
        created_at: created.created_at,
      },
    });
  } catch (e) {
    console.error('admin staff-groups POST', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

export default router;
