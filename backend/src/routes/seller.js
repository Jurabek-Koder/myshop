import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  dmThreadKeyFor,
  dmRowToPickerMessage,
  sanitizeChatPayload,
  getDmCallLogs,
  postDmCallLog,
} from '../lib/staffSkladLichka.js';

const router = Router();
router.use(authRequired, requireRole('seller'));

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPercent(value) {
  const v = Number.parseFloat(value);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  return Math.min(v, 100);
}

function toShares(price, operatorPercent, sitePercent) {
  const p = Number(price || 0);
  const op = toPercent(operatorPercent);
  const sf = toPercent(sitePercent);
  const operatorAmount = (p * op) / 100;
  const siteAmount = (p * sf) / 100;
  const sellerNet = p - operatorAmount - siteAmount;
  return {
    operatorPercent: op,
    sitePercent: sf,
    operatorAmount,
    siteAmount,
    sellerNet,
  };
}

function getSellerByUser(user) {
  if (!user?.seller_id) return null;
  return db.prepare('SELECT * FROM sellers WHERE id = ?').get(user.seller_id);
}

/** Mijoz shu sotuvchining mahsulotlari bo‘yicha buyurtma berganmi */
function assertSellerCustomerLink(sellerId, customerUserId) {
  const cid = Number.parseInt(String(customerUserId), 10);
  if (!Number.isInteger(cid) || cid < 1) return false;
  const row = db
    .prepare(
      `SELECT 1 AS ok
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ? AND p.seller_id = ?
       LIMIT 1`
    )
    .get(cid, sellerId);
  return Boolean(row);
}

function sellerDmLastSnippet(msg) {
  if (!msg) return '';
  const typ = msg.type || 'text';
  if (typ === 'text' || !typ) return String(msg.text || '').slice(0, 120);
  if (typ === 'audio') return '🔊';
  if (typ === 'video') return msg.videoNote ? '📹' : '🎬';
  if (typ === 'image') return '🖼';
  return '📎';
}

function getUserById(id) {
  return db.prepare('SELECT id, email, login, full_name, role, role_id, seller_id FROM users WHERE id = ?').get(id);
}

/** 5 tagacha rasm: JSON massiv; image_url doim birinchi rasm */
function parseAiCreativesJson(body) {
  const raw = body?.ai_creatives_json;
  if (raw == null || raw === '') return null;
  if (Array.isArray(raw)) {
    try {
      return JSON.stringify(raw);
    } catch {
      return null;
    }
  }
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return null;
    return s;
  } catch {
    return null;
  }
}

/** Namuna video (API kalitsiz ham avtomatik video maydoni to‘ldiriladi) */
const FALLBACK_PRODUCT_VIDEO_MP4 = 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4';

function fallbackPicsumGallery(query, count) {
  const base = encodeURIComponent(String(query || 'p').slice(0, 32) || 'p');
  return Array.from({ length: count }, (_, i) => `https://picsum.photos/seed/${base}${i}/400/400`);
}

async function fetchUnsplashGalleryImages(query, count) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  const q = String(query || '').trim() || 'product';
  try {
    const u = new URL('https://api.unsplash.com/search/photos');
    u.searchParams.set('query', q);
    u.searchParams.set('per_page', '12');
    u.searchParams.set('orientation', 'squarish');
    const r = await fetch(u, { headers: { Authorization: `Client-ID ${key}` } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || [])
      .map((x) => x.urls?.small || x.urls?.regular)
      .filter(Boolean)
      .slice(0, count);
  } catch {
    return [];
  }
}

async function fetchPexelsProductVideo(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const q = String(query || '').trim().slice(0, 80) || 'product';
  try {
    const u = new URL('https://api.pexels.com/videos/search');
    u.searchParams.set('query', q);
    u.searchParams.set('per_page', '1');
    const r = await fetch(u, { headers: { Authorization: key } });
    if (!r.ok) return null;
    const d = await r.json();
    const v = d.videos?.[0];
    const files = v?.video_files || [];
    const best =
      files.find((f) => f.quality === 'hd') || files.find((f) => f.quality === 'sd') || files[0];
    return best?.link || null;
  } catch {
    return null;
  }
}

async function buildSuggestedAssets(searchQuery) {
  const q = String(searchQuery || '').trim() || 'product';
  let part = await fetchUnsplashGalleryImages(q, 4);
  if (!Array.isArray(part)) part = [];
  const images =
    part.length >= 4
      ? part.slice(0, 4)
      : [...part, ...fallbackPicsumGallery(q, 4 - part.length)].slice(0, 4);
  let videoUrl = await fetchPexelsProductVideo(q);
  if (!videoUrl) {
    videoUrl = FALLBACK_PRODUCT_VIDEO_MP4;
  }
  return { images, video_url: videoUrl };
}

function parseProductGalleryFromBody(body) {
  const raw = body?.image_gallery_json;
  if (raw != null && raw !== '') {
    let arr;
    if (Array.isArray(raw)) arr = raw;
    else {
      try {
        arr = JSON.parse(String(raw));
      } catch {
        arr = null;
      }
    }
    if (Array.isArray(arr)) {
      const urls = arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5);
      return {
        image_url: urls[0] || null,
        image_gallery_json: urls.length ? JSON.stringify(urls) : null,
      };
    }
  }
  const single = String(body?.image_url || '').trim() || null;
  return {
    image_url: single,
    image_gallery_json: single ? JSON.stringify([single]) : null,
  };
}

function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function normalizeLogin(value, fallback = 'seller') {
  let out = String(value || '').trim().toLowerCase();
  if (out.includes('@')) out = out.split('@')[0];
  out = out
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!out) {
    out = String(fallback || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  if (!out) out = 'seller';
  if (out.length > 40) out = out.slice(0, 40);
  if (out.length < 3) out = `${out}001`.slice(0, 3);
  return out;
}

function uniqueLogin(seed, excludeUserId = null) {
  const base = normalizeLogin(seed, 'seller');
  let candidate = base;
  let suffix = 1;

  while (true) {
    const existing = excludeUserId == null
      ? db.prepare('SELECT id FROM users WHERE lower(login) = lower(?)').get(candidate)
      : db.prepare('SELECT id FROM users WHERE lower(login) = lower(?) AND id != ?').get(candidate, excludeUserId);

    if (!existing) return candidate;

    const suffixText = String(suffix++);
    const maxBaseLen = Math.max(3, 40 - suffixText.length);
    candidate = `${base.slice(0, maxBaseLen)}${suffixText}`;
  }
}

function profilePayload(user, seller) {
  const { firstName, lastName } = splitFullName(user?.full_name);
  return {
    first_name: firstName,
    last_name: lastName,
    phone: seller?.contact_phone || '',
    login: user?.login || '',
    email: user?.email || '',
    seller_name: seller?.name || '',
    status: seller?.status || 'active',
    avatar_url: String(user?.avatar_url || '').trim(),
  };
}

function parseDateFilter(rawValue) {
  if (rawValue == null) return { ok: true, value: null };

  const value = String(rawValue).trim();
  if (!value) return { ok: true, value: null };
  if (!ISO_DATE_RE.test(value)) return { ok: false, value: null };

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null };
  if (parsed.toISOString().slice(0, 10) !== value) return { ok: false, value: null };

  return { ok: true, value };
}

function buildSellerDateWhere(sellerId, selectedDate) {
  const params = [sellerId];
  let where = 'seller_id = ?';
  if (selectedDate) {
    where += ' AND substr(created_at, 1, 10) = ?';
    params.push(selectedDate);
  }
  return { where, params };
}

function createSellerNotification(sellerId, title, message, type = 'info', linkView = 'dashboard') {
  if (!sellerId) return;
  db.prepare(`
    INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(sellerId, String(title || '').trim(), String(message || '').trim(), String(type || 'info').trim() || 'info', linkView || null);
}

/** Super Admin (AI Target / kampaniya tasdiqlari) */
function notifySuperusers(title, body, linkType = null, linkId = null) {
  const superusers = db.prepare('SELECT id FROM users WHERE LOWER(role) = ?').all('superuser');
  if (!superusers.length) return;
  const ins = db.prepare(
    'INSERT INTO user_notifications (user_id, title, body, link_type, link_id) VALUES (?, ?, ?, ?, ?)',
  );
  const t = String(title || '').trim();
  const b = String(body || '').trim();
  for (const su of superusers) {
    ins.run(su.id, t, b, linkType || null, linkId != null ? Number(linkId) : null);
  }
}

router.get('/me', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });
  res.json({ seller });
});

/**
 * 1-slotdagi rasm yuklangach: 2–5 slotlar uchun internetdan o‘xshash rasmlar + video tavsiyasi.
 * UNSPLASH_ACCESS_KEY / PEXELS_API_KEY ixtiyoriy (.env); bo‘lmasa Picsum + namuna MP4.
 */
router.post('/suggest-assets', async (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const nameUz = String(req.body?.name_uz || '').trim();
  const category = String(req.body?.category || '').trim();
  const searchQueryRaw = String(req.body?.search_query || '').trim();
  const searchQuery =
    searchQueryRaw || [nameUz, category].filter(Boolean).join(' ') || 'product';

  try {
    const assets = await buildSuggestedAssets(searchQuery);
    res.json(assets);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Tavsiyalar yuklanmadi.' });
  }
});

router.get('/profile', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const currentUser = getUserById(req.user.id);
  if (!currentUser) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  if (!String(currentUser.login || '').trim()) {
    const generatedLogin = uniqueLogin(currentUser.email || seller.email || currentUser.full_name || `seller${currentUser.id}`, currentUser.id);
    db.prepare('UPDATE users SET login = ? WHERE id = ?').run(generatedLogin, currentUser.id);
    currentUser.login = generatedLogin;
  }

  res.json({ profile: profilePayload(currentUser, seller) });
});

router.patch('/profile', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const currentUser = getUserById(req.user.id);
  if (!currentUser) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  const firstName = String(req.body?.first_name || '').trim();
  const lastName = String(req.body?.last_name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const loginRaw = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  const avatarUrl =
    req.body?.avatar_url !== undefined
      ? String(req.body.avatar_url || '').trim().slice(0, 200000)
      : String(currentUser.avatar_url || '').trim();

  if (!firstName) return res.status(400).json({ error: 'Ismni kiriting.' });
  if (!lastName) return res.status(400).json({ error: 'Familiyani kiriting.' });
  if (!email) return res.status(400).json({ error: 'Emailni kiriting.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email formati noto\'g\'ri.' });
  if (!loginRaw) return res.status(400).json({ error: 'Loginni kiriting.' });
  if (phone && phone.length > 30) return res.status(400).json({ error: 'Telefon juda uzun.' });
  if (password && password.length < 5) return res.status(400).json({ error: 'Parol kamida 5 belgidan iborat bo\'lsin.' });

  const login = normalizeLogin(loginRaw, email || `seller${currentUser.id}`);

  const duplicateEmail = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, currentUser.id);
  if (duplicateEmail) return res.status(409).json({ error: 'Bu email boshqa foydalanuvchiga biriktirilgan.' });

  const duplicateLogin = db.prepare('SELECT id FROM users WHERE lower(login) = lower(?) AND id != ?').get(login, currentUser.id);
  if (duplicateLogin) return res.status(409).json({ error: 'Bu login band, boshqasini tanlang.' });

  const fullName = `${firstName} ${lastName}`.trim();

  try {
    const tx = db.transaction(() => {
      if (password) {
        const passwordHash = bcrypt.hashSync(password, 12);
        db.prepare('UPDATE users SET full_name = ?, email = ?, login = ?, password_hash = ?, avatar_url = ? WHERE id = ?')
          .run(fullName, email, login, passwordHash, avatarUrl || null, currentUser.id);
      } else {
        db.prepare('UPDATE users SET full_name = ?, email = ?, login = ?, avatar_url = ? WHERE id = ?')
          .run(fullName, email, login, avatarUrl || null, currentUser.id);
      }

      db.prepare('UPDATE sellers SET contact_phone = ?, email = ? WHERE id = ?')
        .run(phone || null, email, seller.id);
    });

    tx();
    createSellerNotification(seller.id, 'Profil yangilandi', 'Profil ma\'lumotlari muvaffaqiyatli yangilandi.', 'info', 'profile');
  } catch (err) {
    if (String(err?.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Email yoki login allaqachon band.' });
    }
    throw err;
  }

  const updatedUser = getUserById(currentUser.id);
  const updatedSeller = getSellerByUser(updatedUser);
  res.json({ ok: true, profile: profilePayload(updatedUser, updatedSeller) });
});

router.get('/notifications', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const dateFilter = parseDateFilter(req.query?.date);
  if (!dateFilter.ok) {
    return res.status(400).json({ error: 'Sana formati noto\'g\'ri. YYYY-MM-DD yuboring.' });
  }

  const scope = buildSellerDateWhere(seller.id, dateFilter.value);

  const notifications = db.prepare(`
    SELECT id, seller_id, title, message, type, link_view, is_read, created_at
    FROM seller_notifications
    WHERE ${scope.where}
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  `).all(...scope.params);

  const unreadRow = db.prepare(`
    SELECT COUNT(*) as c
    FROM seller_notifications
    WHERE ${scope.where} AND is_read = 0
  `).get(...scope.params);

  res.json({
    notifications,
    unread_count: Number(unreadRow?.c || 0),
    selected_date: dateFilter.value,
  });
});

router.patch('/notifications/:id/read', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri notification ID.' });

  const result = db.prepare(`
    UPDATE seller_notifications
    SET is_read = 1
    WHERE id = ? AND seller_id = ?
  `).run(id, seller.id);

  if (result.changes < 1) return res.status(404).json({ error: 'Notification topilmadi.' });
  res.json({ ok: true });
});

router.post('/notifications/read-all', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const dateFilter = parseDateFilter(req.body?.date);
  if (!dateFilter.ok) {
    return res.status(400).json({ error: 'Sana formati noto\'g\'ri. YYYY-MM-DD yuboring.' });
  }

  const scope = buildSellerDateWhere(seller.id, dateFilter.value);

  const result = db.prepare(`
    UPDATE seller_notifications
    SET is_read = 1
    WHERE ${scope.where} AND is_read = 0
  `).run(...scope.params);

  res.json({ ok: true, updated: result.changes || 0 });
});

router.get('/dashboard', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const dateFilter = parseDateFilter(req.query?.date);
  if (!dateFilter.ok) {
    return res.status(400).json({ error: 'Sana formati noto\'g\'ri. YYYY-MM-DD yuboring.' });
  }

  const scope = buildSellerDateWhere(seller.id, dateFilter.value);

  const products = db.prepare(`
    SELECT id, name_uz, category, price, stock, image_url, image_gallery_json, video_url, operator_share_percent, site_fee_percent,
           operator_share_amount, site_fee_amount, seller_net_amount, status, goes_live_at, created_at,
           COALESCE(ai_marketing_opt_in, 0) AS ai_marketing_opt_in
    FROM products
    WHERE ${scope.where}
    ORDER BY created_at DESC
  `).all(...scope.params);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as products_count,
      COALESCE(SUM(stock), 0) as total_stock,
      COALESCE(SUM(price), 0) as gross_price_total,
      COALESCE(SUM(operator_share_amount), 0) as operator_share_total,
      COALESCE(SUM(site_fee_amount), 0) as site_fee_total,
      COALESCE(SUM(seller_net_amount), 0) as seller_net_total
    FROM products
    WHERE ${scope.where}
  `).get(...scope.params);

  res.json({
    seller,
    summary,
    products,
    selected_date: dateFilter.value,
  });
});

router.get('/products', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const products = db.prepare(`
    SELECT
      id, name_uz, name_ru, description_uz, price, currency, image_url, image_gallery_json, video_url, category, stock,
      seller_id, status, goes_live_at, operator_share_percent, site_fee_percent, operator_share_amount, site_fee_amount, seller_net_amount,
      created_at, COALESCE(ai_marketing_opt_in, 0) AS ai_marketing_opt_in, ai_creatives_json
    FROM products
    WHERE seller_id = ?
    ORDER BY created_at DESC
  `).all(seller.id);

  res.json({ products });
});

router.post('/products', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const nameUz = String(req.body?.name_uz || '').trim();
  const nameRu = String(req.body?.name_ru || '').trim() || null;
  const descriptionUz = String(req.body?.description_uz || '').trim() || null;
  const { image_url: imageUrl, image_gallery_json: galleryJson } = parseProductGalleryFromBody(req.body);
  const videoUrl = String(req.body?.video_url || '').trim() || null;
  const category = String(req.body?.category || '').trim() || null;
  const currency = String(req.body?.currency || 'UZS').trim() || 'UZS';
  const price = Number.parseFloat(req.body?.price);
  const stock = req.body?.stock != null ? Number.parseInt(req.body.stock, 10) : 0;

  if (!nameUz) return res.status(400).json({ error: 'Mahsulot nomi kerak.' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Noto\'g\'ri narx.' });
  if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Noto\'g\'ri stock.' });

  const operatorPercent = toPercent(req.body?.operator_share_percent);
  const sitePercent = toPercent(req.body?.site_fee_percent);
  if (operatorPercent + sitePercent > 100) {
    return res.status(400).json({ error: 'Operator ulushi va sayt foizi yig\'indisi 100% dan oshmasligi kerak.' });
  }

  const share = toShares(price, operatorPercent, sitePercent);

  const aiCreativesJson = parseAiCreativesJson(req.body);
  let creativesArr = [];
  if (aiCreativesJson) {
    try {
      creativesArr = JSON.parse(aiCreativesJson);
    } catch {
      creativesArr = [];
    }
  }
  if (!Array.isArray(creativesArr) || creativesArr.length < 4) {
    return res.status(400).json({
      error: '«Saqlash» uchun kamida 4 ta kreativ kerak. Avval rasm yuklang, keyin «Reklama qilish» ni bosing.',
    });
  }
  if (!imageUrl) {
    return res.status(400).json({ error: 'Kamida bitta mahsulot rasmi kerak.' });
  }

  const aiMarketingOptIn = 1;

  const result = db.prepare(`
    INSERT INTO products (
      name_uz, name_ru, description_uz, price, currency, image_url, image_gallery_json, video_url, category, stock,
      seller_id, operator_share_percent, site_fee_percent, operator_share_amount, site_fee_amount, seller_net_amount,
      ai_marketing_opt_in, ai_creatives_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nameUz,
    nameRu,
    descriptionUz,
    price,
    currency,
    imageUrl,
    galleryJson,
    videoUrl,
    category,
    stock,
    seller.id,
    share.operatorPercent,
    share.sitePercent,
    share.operatorAmount,
    share.siteAmount,
    share.sellerNet,
    aiMarketingOptIn,
    aiCreativesJson
  );

  const created = db.prepare(`
    SELECT
      id, name_uz, name_ru, description_uz, price, currency, image_url, image_gallery_json, video_url, category, stock,
      seller_id, status, goes_live_at, operator_share_percent, site_fee_percent, operator_share_amount, site_fee_amount, seller_net_amount,
      created_at, COALESCE(ai_marketing_opt_in, 0) AS ai_marketing_opt_in, ai_creatives_json
    FROM products
    WHERE id = ?
  `).get(result.lastInsertRowid);

  createSellerNotification(seller.id, 'Yangi mahsulot qo\'shildi', `${nameUz} mahsuloti qo\'shildi.`, 'success', 'products');

  if (aiMarketingOptIn === 1) {
    notifySuperusers(
      'AI Target: tasdiq kerak',
      `Ushbu mahsulot uchun targetni ishga tushiraymi? Kampaniya qoralama tayyor. Mahsulot #${created.id} — ${nameUz}`,
      'seller_product_ai_target',
      created.id
    );
  }

  res.status(201).json(created);
});

router.patch('/products/:id', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, seller.id);
  if (!existing) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  let nextImageUrl = existing.image_url || null;
  let nextGalleryJson = existing.image_gallery_json || null;
  if (req.body?.image_gallery_json !== undefined) {
    const parsed = parseProductGalleryFromBody(req.body);
    nextImageUrl = parsed.image_url;
    nextGalleryJson = parsed.image_gallery_json;
  } else if (req.body?.image_url !== undefined) {
    const single = String(req.body.image_url ?? '').trim() || null;
    nextImageUrl = single;
    nextGalleryJson = single ? JSON.stringify([single]) : null;
  }

  const next = {
    name_uz: req.body?.name_uz != null ? String(req.body.name_uz).trim() : existing.name_uz,
    name_ru: req.body?.name_ru != null ? String(req.body.name_ru).trim() : existing.name_ru,
    description_uz:
      req.body?.description_uz !== undefined ? String(req.body.description_uz ?? '').trim() || null : existing.description_uz,
    image_url: nextImageUrl,
    image_gallery_json: nextGalleryJson,
    video_url: req.body?.video_url != null ? String(req.body.video_url).trim() : existing.video_url,
    category: req.body?.category != null ? String(req.body.category).trim() : existing.category,
    currency: req.body?.currency != null ? String(req.body.currency).trim() : existing.currency,
    price: req.body?.price != null ? Number.parseFloat(req.body.price) : existing.price,
    stock: req.body?.stock != null ? Number.parseInt(req.body.stock, 10) : existing.stock,
    ai_marketing_opt_in:
      req.body?.ai_marketing_opt_in !== undefined
        ? Number(req.body.ai_marketing_opt_in) === 1
          ? 1
          : 0
        : Number(existing.ai_marketing_opt_in) === 1
          ? 1
          : 0,
  };

  if (!next.name_uz) return res.status(400).json({ error: 'Mahsulot nomi kerak.' });
  if (!Number.isFinite(next.price) || next.price < 0) return res.status(400).json({ error: 'Noto\'g\'ri narx.' });
  if (!Number.isInteger(next.stock) || next.stock < 0) return res.status(400).json({ error: 'Noto\'g\'ri stock.' });

  const operatorPercent = req.body?.operator_share_percent != null
    ? toPercent(req.body.operator_share_percent)
    : toPercent(existing.operator_share_percent);
  const sitePercent = req.body?.site_fee_percent != null
    ? toPercent(req.body.site_fee_percent)
    : toPercent(existing.site_fee_percent);

  if (operatorPercent + sitePercent > 100) {
    return res.status(400).json({ error: 'Operator ulushi va sayt foizi yig\'indisi 100% dan oshmasligi kerak.' });
  }

  const share = toShares(next.price, operatorPercent, sitePercent);

  let nextStatus = existing.status;
  let nextGoes = existing.goes_live_at;
  if (String(existing.status || '').toLowerCase() === 'scheduled') {
    nextStatus = 'approved';
    nextGoes = null;
  }

  const prevAiOpt = Number(existing.ai_marketing_opt_in) === 1 ? 1 : 0;

  let nextAiCreativesJson = existing.ai_creatives_json || null;
  if (req.body?.ai_creatives_json !== undefined) {
    if (req.body.ai_creatives_json === null || req.body.ai_creatives_json === '') {
      nextAiCreativesJson = null;
    } else {
      nextAiCreativesJson = parseAiCreativesJson(req.body);
    }
  }

  db.prepare(`
    UPDATE products
    SET
      name_uz = ?,
      name_ru = ?,
      description_uz = ?,
      image_url = ?,
      image_gallery_json = ?,
      video_url = ?,
      category = ?,
      currency = ?,
      price = ?,
      stock = ?,
      status = ?,
      goes_live_at = ?,
      operator_share_percent = ?,
      site_fee_percent = ?,
      operator_share_amount = ?,
      site_fee_amount = ?,
      seller_net_amount = ?,
      ai_marketing_opt_in = ?,
      ai_creatives_json = ?
    WHERE id = ? AND seller_id = ?
  `).run(
    next.name_uz,
    next.name_ru || null,
    next.description_uz || null,
    next.image_url || null,
    next.image_gallery_json || null,
    next.video_url || null,
    next.category || null,
    next.currency || 'UZS',
    next.price,
    next.stock,
    nextStatus,
    nextGoes || null,
    share.operatorPercent,
    share.sitePercent,
    share.operatorAmount,
    share.siteAmount,
    share.sellerNet,
    next.ai_marketing_opt_in,
    nextAiCreativesJson,
    id,
    seller.id
  );

  const updated = db.prepare(`
    SELECT
      id, name_uz, name_ru, description_uz, price, currency, image_url, image_gallery_json, video_url, category, stock,
      seller_id, status, goes_live_at, operator_share_percent, site_fee_percent, operator_share_amount, site_fee_amount, seller_net_amount,
      created_at, COALESCE(ai_marketing_opt_in, 0) AS ai_marketing_opt_in, ai_creatives_json
    FROM products
    WHERE id = ?
  `).get(id);

  createSellerNotification(seller.id, 'Mahsulot yangilandi', `${next.name_uz} mahsuloti yangilandi.`, 'info', 'products');

  if (next.ai_marketing_opt_in === 1 && prevAiOpt !== 1) {
    notifySuperusers(
      'AI Target: tasdiq kerak',
      `Ushbu mahsulot uchun reklama (Meta) kampaniyasini ishga tushiraymi? Mahsulot #${id} — ${next.name_uz}`,
      'seller_product_ai_target',
      id
    );
  }

  res.json(updated);
});

router.post('/products/:id/publish', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT id, name_uz, status FROM products WHERE id = ? AND seller_id = ?').get(id, seller.id);
  if (!existing) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  const st = String(existing.status || '').trim().toLowerCase();
  if (st !== 'approved') {
    return res.status(400).json({
      error: 'Faqat superuser tasdiqlagan mahsulotni saytga chiqarish mumkin. Avval admin tasdiqlashi kerak.',
    });
  }

  const row = db.prepare(`SELECT datetime('now', '+24 hours') as t`).get();
  const goesLiveAt = row?.t || null;
  db.prepare(`UPDATE products SET status = 'scheduled', goes_live_at = ? WHERE id = ? AND seller_id = ?`).run(goesLiveAt, id, seller.id);

  createSellerNotification(
    seller.id,
    'Sotuv rejalashtirildi',
    `«${existing.name_uz || 'Mahsulot'}» taxminan 24 soatdan keyin sotuvda ochiladi.`,
    'success',
    'products'
  );

  const updated = db.prepare(`
    SELECT
      id, name_uz, name_ru, description_uz, price, currency, image_url, video_url, category, stock,
      seller_id, status, goes_live_at, operator_share_percent, site_fee_percent, operator_share_amount, site_fee_amount, seller_net_amount,
      created_at, COALESCE(ai_marketing_opt_in, 0) AS ai_marketing_opt_in, ai_creatives_json
    FROM products
    WHERE id = ?
  `).get(id);

  res.json(updated);
});

router.delete('/products/:id', (req, res) => {
  const seller = getSellerByUser(req.user);
  if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });

  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const existing = db.prepare('SELECT id, name_uz FROM products WHERE id = ? AND seller_id = ?').get(id, seller.id);
  if (!existing) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  db.prepare('DELETE FROM products WHERE id = ? AND seller_id = ?').run(id, seller.id);
  createSellerNotification(seller.id, 'Mahsulot o\'chirildi', `${existing.name_uz || `ID ${id}`} mahsuloti o\'chirildi.`, 'danger', 'products');
  res.json({ ok: true });
});

/** Mijozlar (sotuvchi mahsulotlari bo‘yicha buyurtma berganlar) + oxirgi xabar qisqachasi */
router.get('/chat/threads', (req, res) => {
  try {
    const seller = getSellerByUser(req.user);
    if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });
    const selfId = req.user.id;

    const rows = db
      .prepare(
        `SELECT o.user_id AS customer_id, u.full_name, u.login, u.phone AS customer_phone,
                GROUP_CONCAT(DISTINCT pr.name_uz) AS product_names
         FROM orders o
         JOIN users u ON u.id = o.user_id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products pr ON pr.id = oi.product_id
         WHERE pr.seller_id = ?
         GROUP BY o.user_id, u.full_name, u.login, u.phone`
      )
      .all(seller.id);

    const threads = rows.map((r) => {
      const names = String(r.product_names || '')
        .split(',')
        .map((x) => String(x || '').trim())
        .filter(Boolean);
      const productSummary = names.slice(0, 4).join(', ') || '—';

      const threadKey = dmThreadKeyFor(selfId, r.customer_id);
      const last = db
        .prepare(
          `SELECT d.client_message_id, d.sender_user_id, d.message_type, d.body, d.payload_json, d.created_at,
                  u.full_name AS sender_full_name, u.login AS sender_login
           FROM staff_direct_messages d
           JOIN users u ON u.id = d.sender_user_id
           WHERE d.thread_key = ?
           ORDER BY d.id DESC
           LIMIT 1`
        )
        .get(threadKey);

      let lastMessage = null;
      let sortKey = '';
      if (last) {
        const msg = dmRowToPickerMessage(last, selfId);
        sortKey = String(last.created_at || '');
        lastMessage = {
          snippet: sellerDmLastSnippet(msg),
          time: msg.time,
          out: msg.out,
        };
      }

      return {
        customerUserId: r.customer_id,
        displayName:
          String(r.full_name || '').trim() || r.login || `Mijoz #${r.customer_id}`,
        login: r.login || '',
        phone: String(r.customer_phone || '').trim(),
        productSummary,
        lastMessage,
        _sortKey: sortKey,
      };
    });

    threads.sort((a, b) => {
      if (a._sortKey !== b._sortKey) return b._sortKey.localeCompare(a._sortKey);
      return (b.customerUserId || 0) - (a.customerUserId || 0);
    });
    for (const t of threads) delete t._sortKey;

    res.json({ threads });
  } catch (e) {
    console.error('seller chat/threads', e);
    res.status(500).json({ error: 'Ro‘yxat yuklanmadi.' });
  }
});

router.get('/dm/messages', (req, res) => {
  try {
    const seller = getSellerByUser(req.user);
    if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });
    const selfId = req.user.id;
    const peerRaw = req.query.peerId != null ? String(req.query.peerId) : '';
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

    if (String(peerRaw) === 'myshop') {
      return res.status(400).json({ error: 'Bu yerda jamoa chati yo‘q.' });
    }
    const peerId = parseInt(peerRaw, 10);
    if (!Number.isInteger(peerId)) return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    if (!assertSellerCustomerLink(seller.id, peerId)) {
      return res.status(403).json({ error: 'Bu mijoz bilan yozishmaga ruxsat yo‘q.' });
    }

    const threadKey = dmThreadKeyFor(selfId, peerRaw);
    const msgRows = db
      .prepare(
        `SELECT d.client_message_id, d.sender_user_id, d.message_type, d.body, d.payload_json, d.created_at,
                u.full_name AS sender_full_name, u.login AS sender_login
         FROM staff_direct_messages d
         JOIN users u ON u.id = d.sender_user_id
         WHERE d.thread_key = ?
         ORDER BY d.id DESC
         LIMIT ?`
      )
      .all(threadKey, limit);
    const messages = msgRows.reverse().map((row) => dmRowToPickerMessage(row, selfId));
    res.json({ messages, threadKey });
  } catch (e) {
    console.error('seller dm/messages', e);
    res.status(500).json({ error: 'Lichka yuklanmadi.' });
  }
});

router.post('/dm/send', (req, res) => {
  try {
    const seller = getSellerByUser(req.user);
    if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });
    const selfId = req.user.id;
    const body = req.body || {};
    const peerRaw = body.peerId != null ? String(body.peerId) : '';
    const text = String(body.text ?? '').slice(0, 8000);
    const type = String(body.messageType || 'text').trim().slice(0, 32) || 'text';
    const cidRaw = String(body.clientMessageId || '').trim().slice(0, 128) || `dm-${Date.now()}`;

    if (String(peerRaw) === 'myshop') {
      return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    }
    const peerId = parseInt(peerRaw, 10);
    if (!Number.isInteger(peerId) || peerId === selfId) {
      return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    }
    if (!assertSellerCustomerLink(seller.id, peerId)) {
      return res.status(403).json({ error: 'Bu mijozga xabar yuborish mumkin emas.' });
    }

    const threadKey = dmThreadKeyFor(selfId, peerRaw);
    if (!threadKey) return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });

    const payloadClean = sanitizeChatPayload(body.payload);
    const payloadJson = payloadClean ? JSON.stringify(payloadClean) : null;

    db.prepare(
      `INSERT OR IGNORE INTO staff_direct_messages (client_message_id, thread_key, sender_user_id, message_type, body, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(cidRaw, threadKey, selfId, type, text || null, payloadJson);

    res.json({ ok: true, clientMessageId: cidRaw });
  } catch (e) {
    console.error('seller dm/send', e);
    res.status(500).json({ error: 'Yuborilmadi.' });
  }
});

router.get('/dm/call-logs', getDmCallLogs);

router.post('/dm/call-logs', (req, res) => {
  try {
    const seller = getSellerByUser(req.user);
    if (!seller) return res.status(404).json({ error: 'Seller profilingiz topilmadi.' });
    const peerIdRaw = String(req.body?.peerId ?? '').trim();
    if (peerIdRaw === 'myshop') {
      return res.status(400).json({ error: 'Bu yerda jamoa chizig‘i yo‘q.' });
    }
    const peerId = parseInt(peerIdRaw, 10);
    if (Number.isInteger(peerId) && peerId >= 1 && !assertSellerCustomerLink(seller.id, peerId)) {
      return res.status(403).json({ error: 'Bu mijoz bilan qo‘ng‘iroq qayd etilmaydi.' });
    }
    return postDmCallLog(req, res);
  } catch (e) {
    console.error('seller dm/call-logs POST', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

export default router;
