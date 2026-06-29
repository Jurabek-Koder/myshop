import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { notifyFinanceApprovers } from '../lib/staffWithdrawalFlow.js';
import {
  getSellerFinanceSummary,
  getTargetCoinSettings,
  spendSellerCoins,
} from '../lib/targetSellerFinance.js';
import { getTargetBillingWindowInfo, requireTargetBillingOpen } from '../lib/targetBillingWindow.js';
import {
  getTargetDmCallLogs,
  getTargetDmMessages,
  getTargetDmStories,
  getTargetPeers,
  postTargetDmCallLog,
  postTargetDmSend,
} from '../lib/targetChat.js';
import { fetchTargetOrdersForUser, TARGET_ORDER_BUCKET_KEYS } from '../lib/targetOrderBuckets.js';

const router = Router();

const SURVEY_STATUS_LABELS = {
  pending: 'Kutilmoqda',
  hold: 'Kutilmoqda',
  picked: "Yig'ilmoqda",
  packaged: 'Qadoqlangan',
  assigned: 'Kuryerga',
  picked_up: 'Olingan',
  on_the_way: "Yo'lda",
  delivered: 'Yetkazilgan',
  cancelled: 'Bekor qilingan',
  left_at_home: 'Atkaz',
  ordered: 'Buyurtma',
  archived: 'Arxiv',
};

function getTargetSeller(user) {
  const sellerId = Number(user?.seller_id);
  if (!Number.isFinite(sellerId) || sellerId < 1) return null;
  return db.prepare('SELECT id, name FROM sellers WHERE id = ?').get(sellerId);
}

function requireTargetPrincipal(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'target') return next();
  return res.status(403).json({ error: 'Faqat target panel foydalanuvchilari uchun.' });
}

function extractRegion(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const beforeComment = s.split(/\.\s*(Sharh|Izoh):/i)[0].trim();
  const first = beforeComment.split(/[,;]/)[0].trim();
  return first.slice(0, 80);
}

function buildStreamUrl(req, productId, sellerId) {
  const envBase = String(process.env.FRONTEND_URL || process.env.CORS_ORIGINS || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  const base = envBase || `${req.protocol}://${req.get('host')}`;
  const ref = Number(sellerId) > 0 ? `?ref=${sellerId}` : '';
  return `${base}/products/${productId}${ref}`;
}

function buildReferralUrl(req, userId) {
  const envBase = String(process.env.FRONTEND_URL || process.env.CORS_ORIGINS || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  const base = envBase || `${req.protocol}://${req.get('host')}`;
  return `${base}/register?id=${userId}`;
}

function mapSurveyRow(row) {
  const statusKey = String(row.status || '').toLowerCase();
  return {
    id: row.id,
    operator: row.operator_name || '—',
    date: row.created_at,
    stream: row.stream_name || '—',
    customer: row.customer_name || '—',
    region: extractRegion(row.region_raw) || '—',
    phone: row.phone || '—',
    status: SURVEY_STATUS_LABELS[statusKey] || row.status || '—',
    status_key: statusKey,
    note: row.notes || '—',
  };
}

router.use(authRequired, requireTargetPrincipal);

router.get('/access-status', (req, res) => {
  try {
    res.json(getTargetBillingWindowInfo());
  } catch (e) {
    res.status(500).json({ error: e.message || 'Hisob holati yuklanmadi.' });
  }
});

router.get('/surveys', (req, res) => {
  try {
    const seller = getTargetSeller(req.user);
    if (!seller) return res.json({ surveys: [] });

    const fromOrders = db
      .prepare(
        `
      SELECT
        o.id AS id,
        o.created_at AS created_at,
        p.name_uz AS stream_name,
        COALESCE(pl.full_name, cu.full_name, '') AS customer_name,
        COALESCE(o.order_location, pl.shipping_address, o.shipping_address, '') AS region_raw,
        COALESCE(o.contact_phone, pl.contact_phone, '') AS phone,
        COALESCE(o.status, pl.status, 'pending') AS status,
        COALESCE(pl.notes, '') AS notes,
        op.full_name AS operator_name
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      INNER JOIN products p ON p.id = oi.product_id AND p.seller_id = ?
      LEFT JOIN product_leads pl ON pl.order_id = o.id
      LEFT JOIN users op ON op.id = pl.operator_id
      LEFT JOIN users cu ON cu.id = o.user_id
      GROUP BY o.id
      ORDER BY datetime(o.created_at) DESC
      LIMIT 200
    `,
      )
      .all(seller.id);

    const fromLeads = db
      .prepare(
        `
      SELECT
        pl.id AS id,
        pl.created_at AS created_at,
        p.name_uz AS stream_name,
        COALESCE(pl.full_name, '') AS customer_name,
        COALESCE(pl.shipping_address, '') AS region_raw,
        COALESCE(pl.contact_phone, '') AS phone,
        pl.status AS status,
        COALESCE(pl.notes, '') AS notes,
        op.full_name AS operator_name
      FROM product_leads pl
      INNER JOIN products p ON p.id = pl.product_id AND p.seller_id = ?
      LEFT JOIN users op ON op.id = pl.operator_id
      WHERE pl.order_id IS NULL
      ORDER BY datetime(pl.created_at) DESC
      LIMIT 200
    `,
      )
      .all(seller.id);

    const surveys = [...fromOrders, ...fromLeads]
      .map(mapSurveyRow)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 200);

    res.json({ surveys });
  } catch (e) {
    res.status(500).json({ error: e.message || 'So\'rovnomalarni yuklab bo\'lmadi.' });
  }
});

router.get('/orders', (req, res) => {
  try {
    const bucket = String(req.query.bucket || '').trim().toLowerCase();
    if (!TARGET_ORDER_BUCKET_KEYS.includes(bucket)) {
      return res.status(400).json({ error: 'Buyurtma bo\'limi noto\'g\'ri.' });
    }
    const page = Number.parseInt(String(req.query.page || '1'), 10) || 1;
    const limit = Number.parseInt(String(req.query.limit || '50'), 10) || 50;
    const result = fetchTargetOrdersForUser(req.user.id, bucket, { page, limit });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({
      orders: result.orders,
      total: result.total,
      page: result.page,
      limit: result.limit,
      total_pages: result.total_pages,
      bucket: result.bucket,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Buyurtmalarni yuklab bo\'lmadi.' });
  }
});

router.get('/links', (req, res) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim().toLowerCase();
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '8'), 10) || 8));
    const offset = (page - 1) * limit;
    const sellerId = Number(req.user.seller_id) || null;

    let where = 'WHERE s.user_id = ?';
    const params = [userId];
    if (q) {
      where += ' AND (lower(s.stream_name) LIKE ? OR CAST(s.id AS TEXT) LIKE ? OR CAST(s.product_id AS TEXT) LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM target_affiliate_streams s ${where}`)
      .get(...params)?.c || 0;

    const rows = db
      .prepare(
        `
      SELECT
        s.id,
        s.product_id,
        s.stream_name,
        s.created_at,
        p.name_uz AS product_name,
        p.image_url AS product_image,
        p.price AS product_price,
        p.sale_price AS product_sale_price,
        p.operator_share_percent AS operator_share_percent,
        p.operator_share_amount AS operator_share_amount
      FROM target_affiliate_streams s
      JOIN products p ON p.id = s.product_id
      ${where}
      ORDER BY datetime(s.created_at) DESC, s.id DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(...params, limit, offset);

    const links = rows.map((row) => {
      const price = Number(row.product_sale_price ?? row.product_price) || 0;
      return {
        id: row.id,
        product_id: row.product_id,
        stream_name: row.stream_name,
        product_name: row.product_name || 'Mahsulot',
        product_image: row.product_image || '',
        price,
        operator_share_percent: Number(row.operator_share_percent) || 0,
        operator_share_amount: Number(row.operator_share_amount) || 0,
        created_at: row.created_at,
        url: buildStreamUrl(req, row.product_id, sellerId),
      };
    });

    res.json({
      links,
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Havolalarni yuklab bo\'lmadi.' });
  }
});

router.post('/links', (req, res) => {
  try {
    const userId = req.user.id;
    const sellerId = Number(req.user.seller_id) || null;
    const productId = Number.parseInt(String(req.body?.product_id ?? ''), 10);
    if (!Number.isFinite(productId) || productId < 1) {
      return res.status(400).json({ error: 'Mahsulot ID kerak.' });
    }

    const product = db.prepare('SELECT id, name_uz FROM products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

    const streamName = String(req.body?.stream_name || product.name_uz || 'Oqim').trim() || 'Oqim';

    const existing = db
      .prepare('SELECT id FROM target_affiliate_streams WHERE user_id = ? AND product_id = ?')
      .get(userId, productId);

    let streamId;
    if (existing) {
      db.prepare(
        'UPDATE target_affiliate_streams SET stream_name = ?, seller_id = ? WHERE id = ?',
      ).run(streamName, sellerId, existing.id);
      streamId = existing.id;
    } else {
      const result = db
        .prepare(
          'INSERT INTO target_affiliate_streams (user_id, seller_id, product_id, stream_name) VALUES (?, ?, ?, ?)',
        )
        .run(userId, sellerId, productId, streamName);
      streamId = result.lastInsertRowid;
    }

    const url = buildStreamUrl(req, productId, sellerId);
    res.status(existing ? 200 : 201).json({
      ok: true,
      id: streamId,
      url,
      stream_name: streamName,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Oqim yaratib bo\'lmadi.' });
  }
});

function emptyStatsMetrics() {
  return {
    visits: 0,
    new_count: 0,
    delivery_today: 0,
    delivery_later: 0,
    packaging: 0,
    delivering: 0,
    delivered: 0,
    take_later: 0,
    returned: 0,
  };
}

function sumStatsMetrics(rows) {
  const total = emptyStatsMetrics();
  for (const row of rows) {
    for (const key of Object.keys(total)) {
      total[key] += Number(row[key]) || 0;
    }
  }
  return total;
}

function mapStatsRow(row, mode) {
  const metrics = {
    visits: Number(row.visits) || 0,
    new_count: Number(row.new_count) || 0,
    delivery_today: Number(row.delivery_today) || 0,
    delivery_later: Number(row.delivery_later) || 0,
    packaging: Number(row.packaging) || 0,
    delivering: Number(row.delivering) || 0,
    delivered: Number(row.delivered) || 0,
    take_later: Number(row.take_later) || 0,
    returned: Number(row.returned) || 0,
  };
  if (mode === 'date') {
    return {
      key: row.stat_date,
      label: row.stat_date || '—',
      product: '—',
      ...metrics,
    };
  }
  return {
    key: row.stream_id,
    label: row.stream_name || '—',
    product: row.product_name || '—',
    ...metrics,
  };
}

router.get('/stats', (req, res) => {
  try {
    const userId = req.user.id;
    const mode = String(req.query.mode || 'stream').toLowerCase() === 'date' ? 'date' : 'stream';
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));
    const offset = (page - 1) * limit;

    let rows = [];
    if (mode === 'stream') {
      rows = db
        .prepare(
          `
        SELECT
          s.id AS stream_id,
          s.stream_name,
          p.name_uz AS product_name,
          COALESCE(leads.visits, 0) AS visits,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('pending', 'hold') THEN 1 ELSE 0 END), 0) AS new_count,
          COALESCE(SUM(CASE
            WHEN lower(trim(COALESCE(o.status, ''))) IN ('assigned', 'picked_up', 'on_the_way')
              AND date(o.created_at) = date('now')
            THEN 1 ELSE 0 END), 0) AS delivery_today,
          COALESCE(SUM(CASE
            WHEN lower(trim(COALESCE(o.status, ''))) IN ('assigned', 'picked_up', 'on_the_way')
              AND date(o.created_at) <> date('now')
            THEN 1 ELSE 0 END), 0) AS delivery_later,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('picked', 'packaged') THEN 1 ELSE 0 END), 0) AS packaging,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('assigned', 'picked_up', 'on_the_way') THEN 1 ELSE 0 END), 0) AS delivering,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('blocked', 'left_at_home') THEN 1 ELSE 0 END), 0) AS take_later,
          COALESCE(SUM(CASE
            WHEN lower(trim(COALESCE(o.status, ''))) = 'cancelled'
              OR COALESCE(o.courier_unsold_return, 0) = 1
            THEN 1 ELSE 0 END), 0) AS returned
        FROM target_affiliate_streams s
        JOIN products p ON p.id = s.product_id
        LEFT JOIN order_items oi ON oi.product_id = s.product_id
        LEFT JOIN orders o ON o.id = oi.order_id
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS visits
          FROM product_leads
          GROUP BY product_id
        ) leads ON leads.product_id = s.product_id
        WHERE s.user_id = ?
        GROUP BY s.id
        ORDER BY s.id DESC
      `,
        )
        .all(userId);
    } else {
      rows = db
        .prepare(
          `
        SELECT
          date(o.created_at) AS stat_date,
          COALESCE(SUM(leads.visits), 0) AS visits,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('pending', 'hold') THEN 1 ELSE 0 END), 0) AS new_count,
          COALESCE(SUM(CASE
            WHEN lower(trim(COALESCE(o.status, ''))) IN ('assigned', 'picked_up', 'on_the_way')
              AND date(o.created_at) = date('now')
            THEN 1 ELSE 0 END), 0) AS delivery_today,
          COALESCE(SUM(CASE
            WHEN lower(trim(COALESCE(o.status, ''))) IN ('assigned', 'picked_up', 'on_the_way')
              AND date(o.created_at) <> date('now')
            THEN 1 ELSE 0 END), 0) AS delivery_later,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('picked', 'packaged') THEN 1 ELSE 0 END), 0) AS packaging,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('assigned', 'picked_up', 'on_the_way') THEN 1 ELSE 0 END), 0) AS delivering,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
          COALESCE(SUM(CASE WHEN lower(trim(COALESCE(o.status, ''))) IN ('blocked', 'left_at_home') THEN 1 ELSE 0 END), 0) AS take_later,
          COALESCE(SUM(CASE
            WHEN lower(trim(COALESCE(o.status, ''))) = 'cancelled'
              OR COALESCE(o.courier_unsold_return, 0) = 1
            THEN 1 ELSE 0 END), 0) AS returned
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        JOIN target_affiliate_streams s ON s.product_id = p.id AND s.user_id = ?
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS visits
          FROM product_leads
          GROUP BY product_id
        ) leads ON leads.product_id = p.id
        GROUP BY date(o.created_at)
        ORDER BY date(o.created_at) DESC
      `,
        )
        .all(userId);
    }

    const mapped = rows.map((row) => mapStatsRow(row, mode));
    const total = mapped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageRows = mapped.slice(offset, offset + limit);
    const summary = sumStatsMetrics(mapped);

    res.json({
      mode,
      rows: pageRows,
      summary,
      page,
      limit,
      total,
      total_pages: totalPages,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Statistikani yuklab bo\'lmadi.' });
  }
});

function readAppSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value != null ? String(row.value) : fallback;
}

router.get('/contest', (req, res) => {
  try {
    const active = readAppSetting('contest_target_active', '1') === '1';
    const start = readAppSetting('contest_target_start', '2025-12-20');
    const end = readAppSetting('contest_target_end', '2026-12-20');
    const title = readAppSetting('contest_target_title', 'MyShop');
    const description = [
      readAppSetting('contest_target_desc1', 'MyShop jamoasidan bomba konkurs.'),
      readAppSetting(
        'contest_target_desc2',
        'Vaqtingizdan unumli foydalaning va bizning jamoamizga qo\'shiling va yil admini bo\'lish imkoniyatidan foydalaning',
      ),
    ];

    const rows = db
      .prepare(
        `
      SELECT
        u.id,
        COALESCE(NULLIF(trim(u.full_name), ''), NULLIF(trim(u.login), ''), s.name, 'Target') AS seller_name,
        COUNT(DISTINCT CASE WHEN lower(trim(COALESCE(o.status, ''))) = 'delivered' THEN o.id END) AS sold
      FROM users u
      LEFT JOIN sellers s ON s.id = u.seller_id
      LEFT JOIN target_affiliate_streams tas ON tas.user_id = u.id
      LEFT JOIN order_items oi ON oi.product_id = tas.product_id
      LEFT JOIN orders o ON o.id = oi.order_id
      WHERE lower(trim(COALESCE(u.role, ''))) = 'target'
      GROUP BY u.id
      ORDER BY sold DESC, seller_name ASC
      LIMIT 50
    `,
      )
      .all();

    const results = rows.map((row, index) => ({
      rank: index + 1,
      seller: row.seller_name || '—',
      sold: Number(row.sold) || 0,
    }));

    res.json({ active, start, end, title, description, results });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Konkurs ma\'lumotlarini yuklab bo\'lmadi.' });
  }
});

function mapWithdrawalStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return 'Tasdiqlangan';
  if (s === 'rejected' || s === 'cancelled') return 'Rad etilgan';
  if (s === 'paid') return "To'langan";
  return 'Kutilmoqda';
}

router.get('/cabinet', (req, res) => {
  try {
    const userRow = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
    const avatarUrl = String(userRow?.avatar_url || '').trim();
    const seller = getTargetSeller(req.user);
    if (!seller) {
      return res.json({ balance: 0, pending: 0, coins: 0, avatar_url: avatarUrl, coin_settings: getTargetCoinSettings() });
    }
    const summary = getSellerFinanceSummary(seller.id);
    res.json({ ...summary, avatar_url: avatarUrl, coin_settings: getTargetCoinSettings() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Kabinet ma\'lumotlarini yuklab bo\'lmadi.' });
  }
});

router.get('/payment', requireTargetBillingOpen, (req, res) => {
  try {
    const seller = getTargetSeller(req.user);
    let summary = { balance: 0, coins: 0, pending: 0 };
    let withdrawals = [];
    if (seller) {
      summary = getSellerFinanceSummary(seller.id);
      withdrawals = db
        .prepare(
          `
        SELECT id, amount, status, payout_method, created_at, reviewed_at, note, paid_out_at
        FROM withdrawal_requests
        WHERE seller_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 50
      `,
        )
        .all(seller.id);
    }
    res.json({
      balance: summary.balance,
      coins: summary.coins,
      pending: summary.pending,
      coin_settings: getTargetCoinSettings(),
      withdrawals: withdrawals.map((row) => ({
        id: row.id,
        amount: Number(row.amount) || 0,
        status: row.status,
        status_label: mapWithdrawalStatus(row.status),
        payout_method: row.payout_method || 'card',
        account: String(row.note || '').trim() || (row.payout_method === 'card' ? '—' : 'Naqd'),
        message: String(row.note || '').trim() || '—',
        created_at: row.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'To\'lov ma\'lumotlarini yuklab bo\'lmadi.' });
  }
});

router.post('/payment/withdrawal', requireTargetBillingOpen, (req, res) => {
  try {
    const seller = getTargetSeller(req.user);
    if (!seller) return res.status(404).json({ error: 'Target profilingiz topilmadi.' });

    const withdrawType = String(req.body?.type || 'money').toLowerCase();
    const fresh = db.prepare('SELECT * FROM sellers WHERE id = ?').get(seller.id);
    if (!fresh) return res.status(404).json({ error: 'Seller topilmadi.' });

    const amt = Number(req.body?.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Yaroqli summa kiriting.' });
    }

    if (withdrawType === 'coin') {
      const settings = getTargetCoinSettings();
      const coinAmount = Math.trunc(amt);
      if (coinAmount < settings.minCoinWithdraw) {
        return res.status(400).json({
          error: `Kamida ${settings.minCoinWithdraw} ta tanga yechish mumkin.`,
        });
      }
      const coinsAvailable = Math.trunc(Number(fresh.coins) || 0);
      if (coinAmount > coinsAvailable) {
        return res.status(400).json({ error: "Tangalar yetarli emas." });
      }

      const uzsAmount = coinAmount * settings.uzsPerCoin;
      const note = `Tanga: ${coinAmount} dona (${uzsAmount.toLocaleString('uz-UZ')} so'm)`;

      const result = db
        .prepare(
          `
        INSERT INTO withdrawal_requests (work_role_id, seller_id, amount, status, payout_method, note)
        VALUES (NULL, ?, ?, 'pending', 'coin', ?)
      `,
        )
        .run(fresh.id, uzsAmount, note);

      spendSellerCoins({
        sellerId: fresh.id,
        amount: coinAmount,
        kind: 'withdraw_request',
        title: `Tanga yechish so'rovi (#${result.lastInsertRowid})`,
        refKind: 'withdrawal',
        refId: result.lastInsertRowid,
      });

      const title = 'Target: tanga yechish';
      const body = `${fresh.name || 'Target'} (#${fresh.id}): ${coinAmount} tanga — ${uzsAmount.toLocaleString('uz-UZ')} so'm`;
      notifyFinanceApprovers(title, body, 'withdrawal', result.lastInsertRowid);

      db.prepare(
        `
        INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
        VALUES (?, ?, ?, 'info', 'payment', 0)
      `,
      ).run(
        fresh.id,
        'Tanga yechish so\'rovi yuborildi',
        `${coinAmount} tanga — ko'rib chiqilmoqda.`,
      );

      return res.status(201).json({ ok: true, message: "Tanga yechish so'rovi yuborildi." });
    }

    const cardNumber = String(req.body?.card_number || '').trim();
    if (!cardNumber) return res.status(400).json({ error: 'Karta raqamini kiriting.' });

    const balance = Number(fresh.balance) || 0;
    if (amt > balance) {
      return res.status(400).json({ error: "Hisobda yetarli mablag' yo'q." });
    }

    const result = db
      .prepare(
        `
      INSERT INTO withdrawal_requests (work_role_id, seller_id, amount, status, payout_method, note)
      VALUES (NULL, ?, ?, 'pending', 'card', ?)
    `,
      )
      .run(fresh.id, amt, cardNumber);

    const title = 'Target: pul yechish';
    const body = `${fresh.name || 'Target'} (#${fresh.id}): ${amt.toLocaleString('uz-UZ')} so'm (karta: ${cardNumber})`;
    notifyFinanceApprovers(title, body, 'withdrawal', result.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
      VALUES (?, ?, ?, 'info', 'payment', 0)
    `,
    ).run(
      fresh.id,
      'Pul yechish so\'rovi yuborildi',
      `${amt.toLocaleString('uz-UZ')} so'm — ko'rib chiqilmoqda.`,
    );

    res.status(201).json({ ok: true, message: "So'rov yuborildi. Tez orada ko'rib chiqiladi." });
  } catch (e) {
    res.status(500).json({ error: e.message || 'So\'rov yuborib bo\'lmadi.' });
  }
});

router.get('/referral', (req, res) => {
  try {
    const userId = req.user.id;
    const url = buildReferralUrl(req, userId);
    const referrals = db
      .prepare(
        `
      SELECT id, full_name, login, email, phone, created_at
      FROM users
      WHERE referred_by_user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 100
    `,
      )
      .all(userId);

    res.json({
      url,
      total: referrals.length,
      referrals: referrals.map((row) => ({
        id: row.id,
        name: String(row.full_name || row.login || row.email || 'Foydalanuvchi').trim(),
        email: String(row.email || '').trim() || '—',
        phone: String(row.phone || '').trim() || '—',
        created_at: row.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Referal ma\'lumotlarini yuklab bo\'lmadi.' });
  }
});

function splitProfileName(fullName, lastName) {
  const last = String(lastName || '').trim();
  if (last) {
    return {
      first_name: String(fullName || '').trim(),
      last_name: last,
    };
  }
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { first_name: parts[0] || '', last_name: '' };
  }
  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1],
  };
}

router.get('/favorites/ids', (req, res) => {
  try {
    const rows = db
      .prepare('SELECT product_id FROM target_favorites WHERE user_id = ? ORDER BY id DESC')
      .all(req.user.id);
    res.json({ product_ids: rows.map((row) => row.product_id) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Saralanganlarni yuklab bo\'lmadi.' });
  }
});

router.get('/favorites', (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '12'), 10) || 12));
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    const total = db
      .prepare('SELECT COUNT(*) AS c FROM target_favorites WHERE user_id = ?')
      .get(userId)?.c || 0;

    const rows = db
      .prepare(
        `
      SELECT
        f.id,
        f.product_id,
        f.created_at,
        p.name_uz AS product_name,
        p.image_url AS product_image,
        p.price AS product_price,
        p.sale_price AS product_sale_price,
        p.stock AS product_stock,
        p.operator_share_percent AS operator_share_percent,
        p.operator_share_amount AS operator_share_amount
      FROM target_favorites f
      JOIN products p ON p.id = f.product_id
      WHERE f.user_id = ?
      ORDER BY datetime(f.created_at) DESC, f.id DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(userId, limit, offset);

    const favorites = rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      name_uz: row.product_name || 'Mahsulot',
      image_url: row.product_image || '',
      price: Number(row.product_sale_price ?? row.product_price) || 0,
      stock: Number(row.product_stock) || 0,
      operator_share_percent: Number(row.operator_share_percent) || 0,
      operator_share_amount: Number(row.operator_share_amount) || 0,
      created_at: row.created_at,
    }));

    res.json({
      favorites,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Saralanganlarni yuklab bo\'lmadi.' });
  }
});

router.post('/favorites', (req, res) => {
  try {
    const productId = Number(req.body?.product_id);
    if (!Number.isFinite(productId) || productId < 1) {
      return res.status(400).json({ error: 'Mahsulot tanlanmadi.' });
    }
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

    db.prepare(
      `
      INSERT OR IGNORE INTO target_favorites (user_id, product_id)
      VALUES (?, ?)
    `,
    ).run(req.user.id, productId);

    res.json({ ok: true, product_id: productId });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Saralanganlarga qo\'shib bo\'lmadi.' });
  }
});

router.delete('/favorites/:productId', (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId) || productId < 1) {
      return res.status(400).json({ error: 'Mahsulot tanlanmadi.' });
    }
    db.prepare('DELETE FROM target_favorites WHERE user_id = ? AND product_id = ?').run(
      req.user.id,
      productId,
    );
    res.json({ ok: true, product_id: productId });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Saralanganlardan olib bo\'lmadi.' });
  }
});

router.get('/notifications', (req, res) => {
  try {
    const seller = getTargetSeller(req.user);
    const userId = Number(req.user?.id);

    const sellerRows = seller
      ? db
          .prepare(
            `
      SELECT id, seller_id, title, message, type, link_view, is_read, created_at
      FROM seller_notifications
      WHERE seller_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 50
    `,
          )
          .all(seller.id)
      : [];

    const userRows =
      Number.isFinite(userId) && userId > 0
        ? db
            .prepare(
              `
      SELECT id, title, body, created_at, read_at
      FROM user_notifications
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 50
    `,
            )
            .all(userId)
        : [];

    const notifications = [
      ...sellerRows.map((row) => ({
        id: `s:${row.id}`,
        source: 'seller',
        title: row.title || 'Xabar',
        message: row.message || '',
        type: row.type,
        link_view: row.link_view,
        is_read: Number(row.is_read) ? 1 : 0,
        created_at: row.created_at,
      })),
      ...userRows.map((row) => ({
        id: `u:${row.id}`,
        source: 'user',
        title: row.title || 'Xabar',
        message: row.body || '',
        type: 'info',
        link_view: 'payment',
        is_read: row.read_at ? 1 : 0,
        created_at: row.created_at,
      })),
    ]
      .sort((a, b) => {
        const ta = Date.parse(String(a.created_at || '')) || 0;
        const tb = Date.parse(String(b.created_at || '')) || 0;
        return tb - ta;
      })
      .slice(0, 50);

    const unreadCount = notifications.filter((n) => !Number(n.is_read)).length;

    res.json({
      notifications,
      unread_count: unreadCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Bildirishnomalar yuklanmadi.' });
  }
});

router.patch('/notifications/:id/read', (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const seller = getTargetSeller(req.user);
    const userId = Number(req.user?.id);

    if (rawId.startsWith('u:')) {
      const id = Number.parseInt(rawId.slice(2), 10);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Noto\'g\'ri bildirishnoma ID.' });
      }
      const result = db
        .prepare(
          `
        UPDATE user_notifications
        SET read_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `,
        )
        .run(id, userId);
      if (result.changes < 1) return res.status(404).json({ error: 'Bildirishnoma topilmadi.' });
      return res.json({ ok: true });
    }

    const sellerNotifId = rawId.startsWith('s:')
      ? Number.parseInt(rawId.slice(2), 10)
      : Number.parseInt(rawId, 10);
    if (!seller) return res.status(404).json({ error: 'Target profilingiz topilmadi.' });
    if (!Number.isInteger(sellerNotifId) || sellerNotifId < 1) {
      return res.status(400).json({ error: 'Noto\'g\'ri bildirishnoma ID.' });
    }

    const result = db
      .prepare(
        `
      UPDATE seller_notifications
      SET is_read = 1
      WHERE id = ? AND seller_id = ?
    `,
      )
      .run(sellerNotifId, seller.id);

    if (result.changes < 1) return res.status(404).json({ error: 'Bildirishnoma topilmadi.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Bildirishnoma yangilanmadi.' });
  }
});

router.get('/settings', (req, res) => {
  try {
    const row = db
      .prepare(
        `
      SELECT full_name, last_name, phone, email, avatar_url, telegram_id, about_bio, target_region_id, target_district_id
      FROM users WHERE id = ?
    `,
      )
      .get(req.user.id);
    if (!row) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
    const names = splitProfileName(row.full_name, row.last_name);
    res.json({
      profile: {
        ...names,
        region_id: String(row.target_region_id || '').trim(),
        district_id: String(row.target_district_id || '').trim(),
        telegram_id: String(row.telegram_id || '').trim(),
        about: String(row.about_bio || '').trim(),
        phone: String(row.phone || '').trim(),
        email: String(row.email || '').trim(),
        avatar_url: String(row.avatar_url || '').trim(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Sozlamalarni yuklab bo\'lmadi.' });
  }
});

router.patch('/settings', (req, res) => {
  try {
    const body = req.body || {};
    const firstName = String(body.first_name ?? '').trim();
    const lastName = String(body.last_name ?? '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || firstName;
    if (!fullName) return res.status(400).json({ error: "Ism bo'sh bo'lmasin." });

    const regionId = body.region_id != null ? String(body.region_id).trim() : null;
    const districtId = body.district_id != null ? String(body.district_id).trim() : null;
    const telegramId = body.telegram_id != null ? String(body.telegram_id).trim() : null;
    const about = body.about != null ? String(body.about).trim().slice(0, 2000) : null;

    db.prepare(
      `
      UPDATE users
      SET full_name = ?, last_name = ?, telegram_id = ?, about_bio = ?, target_region_id = ?, target_district_id = ?
      WHERE id = ?
    `,
    ).run(
      fullName,
      lastName || null,
      telegramId || null,
      about || null,
      regionId || null,
      districtId || null,
      req.user.id,
    );

    res.json({ ok: true, message: 'Saqlandi.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Saqlab bo\'lmadi.' });
  }
});

router.patch('/settings/contact', (req, res) => {
  try {
    const body = req.body || {};
    const userId = req.user.id;
    const current = db.prepare('SELECT id, phone, email FROM users WHERE id = ?').get(userId);
    if (!current) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

    const phone = body.phone != null ? String(body.phone).trim() : String(current.phone || '').trim();
    const email = body.email != null ? String(body.email).trim().toLowerCase() : String(current.email || '').trim().toLowerCase();

    if (!email) return res.status(400).json({ error: 'Email kiriting.' });
    if (!email.includes('@')) return res.status(400).json({ error: 'Email noto\'g\'ri.' });

    const emailTaken = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, userId);
    if (emailTaken) return res.status(409).json({ error: 'Bu email allaqachon band.' });

    db.prepare('UPDATE users SET phone = ?, email = ? WHERE id = ?').run(phone || null, email, userId);

    res.json({ ok: true, message: 'Saqlandi.', profile: { phone, email } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Saqlab bo\'lmadi.' });
  }
});

router.patch('/settings/avatar', (req, res) => {
  try {
    const avatarUrl = String(req.body?.avatar_url ?? '').trim().slice(0, 200000);
    if (!avatarUrl) return res.status(400).json({ error: 'Rasm tanlang.' });
    const allowed =
      avatarUrl.startsWith('data:image/')
      || avatarUrl.startsWith('http')
      || avatarUrl.startsWith('/uploads/')
      || avatarUrl.startsWith('/');
    if (!allowed) return res.status(400).json({ error: 'Noto\'g\'ri rasm formati.' });

    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
    res.json({ ok: true, message: 'Profil rasmi saqlandi.', avatar_url: avatarUrl });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Profil rasmini saqlab bo\'lmadi.' });
  }
});

router.get('/chat/peers', getTargetPeers);
router.get('/dm/messages', getTargetDmMessages);
router.get('/dm/stories', getTargetDmStories);
router.get('/dm/call-logs', getTargetDmCallLogs);
router.post('/dm/call-logs', postTargetDmCallLog);
router.post('/dm/send', postTargetDmSend);

router.patch('/settings/password', async (req, res) => {
  try {
    const pwd = String(req.body?.new_password || '').trim();
    const confirm = String(req.body?.confirm_password || '').trim();
    if (!pwd) return res.status(400).json({ error: 'Yangi parol kiriting.' });
    if (pwd.length < 6) return res.status(400).json({ error: "Parol kamida 6 belgi bo'lishi kerak." });
    if (pwd !== confirm) return res.status(400).json({ error: 'Parollar mos kelmadi.' });

    const current = db.prepare('SELECT id, password_plain FROM users WHERE id = ?').get(req.user.id);
    if (!current) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

    const oldPlain = String(current.password_plain || '').trim();
    if (oldPlain && oldPlain !== pwd) {
      db.prepare('INSERT INTO user_password_history (user_id, password_plain, note) VALUES (?, ?, ?)').run(
        req.user.id,
        oldPlain,
        "Target panel: parol o'zgartirish",
      );
    }

    const passwordHash = await bcrypt.hash(pwd, 12);
    db.prepare('UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?').run(
      passwordHash,
      pwd,
      req.user.id,
    );

    res.json({ ok: true, message: "Parol o'zgartirildi." });
  } catch (e) {
    res.status(500).json({ error: e.message || "Parolni o'zgartirib bo'lmadi." });
  }
});

export default router;
