/**
 * Target panel — har bir foydalanuvchining o‘z oqimlari (target_affiliate_streams) bo‘yicha buyurtmalar.
 */
import { db } from '../db/database.js';

export const TARGET_ORDER_BUCKET_KEYS = ['sold', 'cancelled', 'take_later', 'atkaz', 'archive'];

const BUCKET_WHERE = {
  sold: "lower(trim(coalesce(o.status, ''))) = 'delivered'",
  cancelled:
    "lower(trim(coalesce(o.status, ''))) = 'cancelled' AND COALESCE(o.courier_unsold_return, 0) = 0",
  take_later: "lower(trim(coalesce(o.status, ''))) = 'blocked'",
  atkaz:
    "(lower(trim(coalesce(o.status, ''))) = 'left_at_home' OR COALESCE(o.courier_unsold_return, 0) = 1)",
  archive: "lower(trim(coalesce(o.status, ''))) = 'archived'",
};

const STATUS_LABELS = {
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
  blocked: 'Keyin oladi',
  ordered: 'Buyurtma',
  archived: 'Arxiv',
};

function extractRegion(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const beforeComment = s.split(/\.\s*(Sharh|Izoh):/i)[0].trim();
  const first = beforeComment.split(/[,;]/)[0].trim();
  return first.slice(0, 80);
}

function mapOrderRow(row) {
  const statusKey = String(row.status || '').toLowerCase();
  let status = STATUS_LABELS[statusKey] || row.status || '—';
  if (Number(row.courier_unsold_return) === 1 && statusKey === 'cancelled') {
    status = 'Atkaz';
  }
  return {
    id: row.id,
    operator: row.operator_name || '—',
    date: row.created_at,
    stream: row.stream_name || '—',
    product: row.product_name || '—',
    customer: row.customer_name || '—',
    region: extractRegion(row.region_raw) || '—',
    phone: row.phone || '—',
    status,
    status_key: Number(row.courier_unsold_return) === 1 ? 'left_at_home' : statusKey,
    note: row.notes || '—',
  };
}

export function fetchTargetOrdersForUser(userId, bucket, { page = 1, limit = 50 } = {}) {
  const bucketKey = String(bucket || '').trim().toLowerCase();
  const where = BUCKET_WHERE[bucketKey];
  if (!where) {
    return { ok: false, error: 'Noto‘g‘ri buyurtma bo‘limi.' };
  }

  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  const countRow = db
    .prepare(
      `
    SELECT COUNT(DISTINCT o.id) AS c
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    INNER JOIN products p ON p.id = oi.product_id
    INNER JOIN target_affiliate_streams s ON s.product_id = p.id AND s.user_id = ?
    WHERE ${where}
  `,
    )
    .get(userId);

  const total = Number(countRow?.c) || 0;

  const rows = db
    .prepare(
      `
    SELECT DISTINCT
      o.id AS id,
      o.created_at AS created_at,
      COALESCE(s.stream_name, p.name_uz, '') AS stream_name,
      p.name_uz AS product_name,
      COALESCE(pl.full_name, cu.full_name, '') AS customer_name,
      COALESCE(o.order_location, pl.shipping_address, o.shipping_address, '') AS region_raw,
      COALESCE(o.contact_phone, pl.contact_phone, '') AS phone,
      COALESCE(o.status, pl.status, 'pending') AS status,
      COALESCE(o.courier_unsold_return, 0) AS courier_unsold_return,
      COALESCE(pl.notes, '') AS notes,
      op.full_name AS operator_name
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    INNER JOIN products p ON p.id = oi.product_id
    INNER JOIN target_affiliate_streams s ON s.product_id = p.id AND s.user_id = ?
    LEFT JOIN product_leads pl ON pl.order_id = o.id
    LEFT JOIN users op ON op.id = pl.operator_id
    LEFT JOIN users cu ON cu.id = o.user_id
    WHERE ${where}
    ORDER BY datetime(COALESCE(o.status_updated_at, o.created_at)) DESC, o.id DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(userId, safeLimit, offset);

  return {
    ok: true,
    orders: rows.map(mapOrderRow),
    total,
    page: safePage,
    limit: safeLimit,
    total_pages: Math.max(1, Math.ceil(total / safeLimit)),
    bucket: bucketKey,
  };
}
