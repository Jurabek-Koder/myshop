import { db } from '../db/database.js';
import { buildProductReportRow, isProductArchived } from '../lib/productShareCalc.js';

const PRODUCT_SELECT = `
  SELECT p.id, p.name_uz, p.name_ru, p.price, p.currency, p.image_url,
         p.operator_share_percent, p.site_fee_percent,
         p.discount_percent, p.promotion_ends_at,
         p.seller_id, p.status, p.created_at,
         p.off_sale_variant, p.warehouse_deleted_at, p.warehouse_delisted_at,
         s.name AS seller_name
  FROM products p
  LEFT JOIN sellers s ON s.id = p.seller_id
`;

const DELIVERED_STATUSES = `lower(trim(coalesce(o.status, ''))) IN ('delivered', 'completed')`;

function loadSalesMaps() {
  const dayRows = db
    .prepare(
      `SELECT oi.product_id,
              COUNT(DISTINCT date(o.created_at)) AS sale_days
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${DELIVERED_STATUSES}
       GROUP BY oi.product_id`,
    )
    .all();
  const dayMap = new Map(dayRows.map((r) => [r.product_id, Number(r.sale_days) || 0]));

  const lineRows = db
    .prepare(
      `SELECT oi.product_id, oi.quantity, oi.price_at_order
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${DELIVERED_STATUSES}`,
    )
    .all();

  const linesMap = new Map();
  for (const row of lineRows) {
    const pid = row.product_id;
    if (!linesMap.has(pid)) linesMap.set(pid, []);
    linesMap.get(pid).push(row);
  }

  return { dayMap, linesMap };
}

function mapProducts(rows, { dayMap, linesMap }) {
  return rows.map((p) =>
    buildProductReportRow(p, {
      soldLines: linesMap.get(p.id) || [],
      saleDays: dayMap.get(p.id) || 0,
    }),
  );
}

export function listProductsReport({ limit = 500, sellerId, archived = false } = {}) {
  const cap = Math.min(2000, Math.max(1, Number(limit) || 500));
  let sql = `${PRODUCT_SELECT} WHERE 1=1`;
  const params = [];

  if (sellerId) {
    sql += ` AND p.seller_id = ?`;
    params.push(Number(sellerId));
  }

  sql += ` ORDER BY p.id DESC LIMIT ?`;
  params.push(cap * 4);

  const allRows = db.prepare(sql).all(...params);
  const sales = loadSalesMaps();

  const filtered = allRows.filter((row) => {
    const arch = isProductArchived(row);
    return archived ? arch.archived : !arch.archived;
  });

  return mapProducts(filtered.slice(0, cap), sales);
}

export function listArchivedProductsReport(opts = {}) {
  return listProductsReport({ ...opts, archived: true });
}
