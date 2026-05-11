import { Router } from 'express';
import { db } from '../db/database.js';
import { optionalAuth } from '../middleware/auth.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { productValidation, idParam } from '../middleware/validate.js';

const router = Router();

const PRODUCT_FIELDS = [
  'id',
  'name_uz',
  'name_ru',
  'description_uz',
  'price',
  'currency',
  'image_url',
  'image_gallery_json',
  'video_url',
  'category',
  'stock',
  'seller_id',
  'status',
  'operator_share_percent',
  'site_fee_percent',
  'operator_share_amount',
  'site_fee_amount',
  'seller_net_amount',
  'discount_percent',
  'promotion_ends_at',
  'created_at',
  'goes_live_at',
].join(', ');

function promoteScheduledProducts() {
  try {
    db.prepare(`
      UPDATE products
      SET status = 'active', goes_live_at = NULL
      WHERE lower(trim(coalesce(status, ''))) = 'scheduled'
        AND goes_live_at IS NOT NULL
        AND datetime(substr(replace(replace(trim(goes_live_at), 'T', ' '), 'Z', ''), 1, 19)) <= datetime('now')
    `).run();
  } catch (_) {}
}

function isOnPromotion(product) {
  const discount = Number(product?.discount_percent) || 0;
  if (discount <= 0) return false;
  const endsAt = product?.promotion_ends_at;
  if (!endsAt) return true;
  const end = new Date(String(endsAt).replace(' ', 'T'));
  return !Number.isNaN(end.getTime()) && end > new Date();
}

function addSalePrice(product) {
  const p = { ...product };
  if (isOnPromotion(p)) {
    const discount = Number(p.discount_percent) || 0;
    p.sale_price = Math.round((Number(p.price) || 0) * (1 - discount / 100));
  }
  return p;
}

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

function validateSeller(sellerId) {
  if (sellerId == null) return true;
  const seller = db.prepare('SELECT id FROM sellers WHERE id = ?').get(sellerId);
  return Boolean(seller);
}

function parseProductGalleryBody(body) {
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

router.get('/', optionalAuth, (req, res) => {
  promoteScheduledProducts();
  const category = req.query.category ? String(req.query.category).trim() : null;
  const sellerIdRaw = req.query.seller_id != null ? Number.parseInt(req.query.seller_id, 10) : null;
  const aksiyaOnly = req.query.aksiya === '1' || req.query.aksiya === 'true';
  const q = req.query.q ? String(req.query.q).trim() : null;

  const forPublic = req.user?.role !== 'superuser' && req.user?.role !== 'admin' && req.user?.role !== 'seller';
  let sql = `SELECT ${PRODUCT_FIELDS} FROM products WHERE 1=1`;
  const params = [];

  if (forPublic) {
    sql += ' AND (status = ? OR status IS NULL)';
    params.push('active');
  }

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (Number.isInteger(sellerIdRaw) && sellerIdRaw > 0) {
    sql += ' AND seller_id = ?';
    params.push(sellerIdRaw);
  }

  if (q && q.length > 0) {
    sql += ' AND (name_uz LIKE ? OR name_ru LIKE ?)';
    const like = '%' + q + '%';
    params.push(like, like);
  }

  sql += ' ORDER BY created_at DESC';
  let products = db.prepare(sql).all(...params);

  if (aksiyaOnly) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    products = products.filter((p) => {
      const discount = Number(p.discount_percent) || 0;
      if (discount <= 0) return false;
      const endsAt = p.promotion_ends_at;
      if (!endsAt) return true;
      return String(endsAt).slice(0, 19) >= now;
    });
  }

  products = products.map(addSalePrice);
  res.json({ products });
});

router.get('/categories', (_req, res) => {
  promoteScheduledProducts();
  const rows = db.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != "" ORDER BY category').all();
  res.json({ categories: rows.map((r) => r.category) });
});

router.get('/:id', optionalAuth, idParam, (req, res) => {
  promoteScheduledProducts();
  const product = db.prepare(`SELECT ${PRODUCT_FIELDS} FROM products WHERE id = ?`).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  const role = String(req.user?.role || '').toLowerCase();
  const isPrivileged = role === 'superuser' || role === 'admin';
  const isOwnerSeller = role === 'seller' && req.user?.seller_id && product.seller_id === req.user.seller_id;
  const st = String(product.status ?? '').trim().toLowerCase();

  if (!isPrivileged && !isOwnerSeller) {
    const legacyPublic = !product.seller_id && (product.status == null || st === '');
    if (st !== 'active' && !legacyPublic) {
      return res.status(404).json({ error: 'Mahsulot topilmadi.' });
    }
  }

  res.json(addSalePrice(product));
});

router.post('/', authRequired, requireRole('admin', 'superuser', 'seller'), productValidation, (req, res) => {
  const { name_uz, name_ru, description_uz, price, currency, video_url, category, stock } = req.body;
  const { image_url, image_gallery_json: galleryJsonInsert } = parseProductGalleryBody(req.body);

  let sellerId = req.body?.seller_id != null ? Number.parseInt(req.body.seller_id, 10) : null;
  if (req.user.role === 'seller') {
    if (!req.user.seller_id) return res.status(400).json({ error: 'Seller profilingiz topilmadi.' });
    sellerId = req.user.seller_id;
  }

  if (sellerId != null && (!Number.isInteger(sellerId) || sellerId < 1)) {
    return res.status(400).json({ error: 'Noto\'g\'ri seller_id.' });
  }
  if (!validateSeller(sellerId)) {
    return res.status(404).json({ error: 'Seller topilmadi.' });
  }

  const operatorSharePercent = toPercent(req.body?.operator_share_percent);
  const siteFeePercent = toPercent(req.body?.site_fee_percent);
  if (operatorSharePercent + siteFeePercent > 100) {
    return res.status(400).json({ error: 'Operator ulushi va sayt foizi yig\'indisi 100% dan oshmasligi kerak.' });
  }

  const share = toShares(price, operatorSharePercent, siteFeePercent);

  const result = db.prepare(
    `INSERT INTO products (
      name_uz, name_ru, description_uz, price, currency, image_url, image_gallery_json, video_url, category, stock,
      seller_id, operator_share_percent, site_fee_percent, operator_share_amount, site_fee_amount, seller_net_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name_uz || null,
    name_ru || null,
    description_uz || null,
    price,
    currency || 'UZS',
    image_url || null,
    galleryJsonInsert,
    video_url || null,
    category || null,
    stock ?? 0,
    sellerId,
    share.operatorPercent,
    share.sitePercent,
    share.operatorAmount,
    share.siteAmount,
    share.sellerNet
  );

  const product = db.prepare(`SELECT ${PRODUCT_FIELDS} FROM products WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(product);
});

router.patch('/:id', authRequired, requireRole('admin', 'superuser', 'seller'), idParam, (req, res) => {
  const existing = db.prepare(`SELECT ${PRODUCT_FIELDS} FROM products WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  if (req.user.role === 'seller') {
    if (!req.user.seller_id) return res.status(403).json({ error: 'Seller profilingiz topilmadi.' });
    if (existing.seller_id !== req.user.seller_id) {
      return res.status(403).json({ error: 'Faqat o\'zingizning mahsulotingizni tahrirlashingiz mumkin.' });
    }
  }

  const canSetStatus = req.user.role === 'superuser' || req.user.role === 'admin';

  let nextImageUrl = existing.image_url || null;
  let nextGalleryJson = existing.image_gallery_json || null;
  if (req.body?.image_gallery_json !== undefined) {
    const p = parseProductGalleryBody(req.body);
    nextImageUrl = p.image_url;
    nextGalleryJson = p.image_gallery_json;
  } else if (req.body?.image_url !== undefined) {
    const single = req.body.image_url ? String(req.body.image_url).trim() : null;
    nextImageUrl = single;
    nextGalleryJson = single ? JSON.stringify([single]) : null;
  }

  const next = {
    name_uz: req.body?.name_uz != null ? String(req.body.name_uz).trim() : existing.name_uz,
    name_ru:
      req.body?.name_ru !== undefined ? (req.body.name_ru ? String(req.body.name_ru).trim() : null) : existing.name_ru,
    description_uz:
      req.body?.description_uz !== undefined
        ? (req.body.description_uz ? String(req.body.description_uz).trim() : null)
        : existing.description_uz,
    price: req.body?.price != null ? Number.parseFloat(req.body.price) : existing.price,
    image_url: nextImageUrl,
    image_gallery_json: nextGalleryJson,
    video_url:
      req.body?.video_url !== undefined ? (req.body.video_url ? String(req.body.video_url).trim() : null) : existing.video_url,
    category:
      req.body?.category !== undefined ? (req.body.category ? String(req.body.category).trim() : null) : existing.category,
    stock: req.body?.stock != null ? Number.parseInt(req.body.stock, 10) : existing.stock,
    seller_id: existing.seller_id,
    status: existing.status ?? 'pending',
    goes_live_at: existing.goes_live_at ?? null,
    discount_percent: req.body?.discount_percent != null ? Math.min(100, Math.max(0, Number.parseFloat(req.body.discount_percent))) : (existing.discount_percent ?? 0),
    promotion_ends_at: req.body?.promotion_ends_at !== undefined ? (req.body.promotion_ends_at ? String(req.body.promotion_ends_at).trim() : null) : (existing.promotion_ends_at ?? null),
  };

  if (canSetStatus && req.body?.status === 'pending') {
    next.status = 'pending';
    next.goes_live_at = null;
  }
  if (canSetStatus && req.body?.status === 'active') {
    next.status = 'active';
    next.goes_live_at = null;
  }
  if (canSetStatus && req.body?.status === 'approved') {
    next.status = 'approved';
    next.goes_live_at = null;
  }

  if (req.user.role === 'seller') {
    const st = String(next.status || '').toLowerCase();
    if (st === 'scheduled') {
      next.status = 'approved';
      next.goes_live_at = null;
    }
  }

  if (req.user.role !== 'seller' && req.body?.seller_id != null) {
    next.seller_id = Number.parseInt(req.body.seller_id, 10);
    if (!Number.isInteger(next.seller_id) || next.seller_id < 1) {
      next.seller_id = null;
    }
  }

  if (!next.name_uz) return res.status(400).json({ error: 'Mahsulot nomi kerak.' });
  if (!Number.isFinite(next.price) || next.price < 0) return res.status(400).json({ error: 'Noto\'g\'ri narx.' });
  if (!Number.isInteger(next.stock) || next.stock < 0) return res.status(400).json({ error: 'Noto\'g\'ri stock.' });
  if (!validateSeller(next.seller_id)) return res.status(404).json({ error: 'Seller topilmadi.' });

  const operatorSharePercent = req.body?.operator_share_percent != null
    ? toPercent(req.body.operator_share_percent)
    : toPercent(existing.operator_share_percent);
  const siteFeePercent = req.body?.site_fee_percent != null
    ? toPercent(req.body.site_fee_percent)
    : toPercent(existing.site_fee_percent);

  if (operatorSharePercent + siteFeePercent > 100) {
    return res.status(400).json({ error: 'Operator ulushi va sayt foizi yig\'indisi 100% dan oshmasligi kerak.' });
  }

  const share = toShares(next.price, operatorSharePercent, siteFeePercent);

  db.prepare(
    `UPDATE products
      SET
        name_uz = ?,
        name_ru = ?,
        description_uz = ?,
        price = ?,
        image_url = ?,
        image_gallery_json = ?,
        video_url = ?,
        category = ?,
        stock = ?,
        seller_id = ?,
        status = ?,
        goes_live_at = ?,
        operator_share_percent = ?,
        site_fee_percent = ?,
        operator_share_amount = ?,
        site_fee_amount = ?,
        seller_net_amount = ?,
        discount_percent = ?,
        promotion_ends_at = ?
      WHERE id = ?`
  ).run(
    next.name_uz,
    next.name_ru || null,
    next.description_uz || null,
    next.price,
    next.image_url || null,
    next.image_gallery_json || null,
    next.video_url || null,
    next.category || null,
    next.stock,
    next.seller_id,
    next.status,
    next.goes_live_at || null,
    share.operatorPercent,
    share.sitePercent,
    share.operatorAmount,
    share.siteAmount,
    share.sellerNet,
    next.discount_percent,
    next.promotion_ends_at || null,
    req.params.id
  );

  const product = db.prepare(`SELECT ${PRODUCT_FIELDS} FROM products WHERE id = ?`).get(req.params.id);
  res.json(product);
});

export default router;
