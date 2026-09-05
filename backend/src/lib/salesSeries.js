import { db } from '../db/database.js';

const PERIODS = new Set(['day', 'week', 'month', 'year']);

const UZ_MONTHS = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyun',
  'Iyul',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Dushanba boshlangan hafta kaliti: YYYY-MM-DD */
function weekStartMondayKey(isoDateTime) {
  const row = db
    .prepare(
      `SELECT date(?, '-' || ((cast(strftime('%w', ?) as integer) + 6) % 7) || ' days') as wk`,
    )
    .get(isoDateTime, isoDateTime);
  return row?.wk || String(isoDateTime).slice(0, 10);
}

function addDaysIso(isoDateStr, deltaDays) {
  const row = db.prepare(`SELECT date(?, ?) as d`).get(isoDateStr, `${deltaDays >= 0 ? '+' : ''}${deltaDays} days`);
  return row?.d || isoDateStr;
}

function todayIso() {
  const row = db.prepare(`SELECT date('now', 'localtime') as d`).get();
  return row?.d || new Date().toISOString().slice(0, 10);
}

function formatDayLabel(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return s;
  return `${d}-${UZ_MONTHS[m - 1] || m}`;
}

function formatWeekLabel(isoWeekStart) {
  return `Hafta ${formatDayLabel(isoWeekStart)}`;
}

function formatMonthLabel(ym) {
  const s = String(ym || '');
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return s;
  const mi = parseInt(m[2], 10);
  return `${UZ_MONTHS[mi - 1] || m[2]} ${m[1]}`;
}

function formatYearLabel(y) {
  return String(y);
}

function rowsToMap(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r.bucket || '').trim();
    if (!k) continue;
    m.set(k, {
      revenue: Number(r.revenue || 0),
      order_count: Number(r.order_count || 0),
    });
  }
  return m;
}

/**
 * @param {'day'|'week'|'month'|'year'} period
 * @param {{ sellerId?: number }} [opts]
 */
export function computeSalesSeries(period, opts = {}) {
  const p = String(period || 'month').toLowerCase();
  if (!PERIODS.has(p)) {
    return { period: 'month', points: [], error: 'invalid_period' };
  }

  const sellerId = opts.sellerId != null ? Number(opts.sellerId) : null;
  const hasSeller = Number.isInteger(sellerId) && sellerId > 0;

  const statusClause = "lower(trim(o.status)) NOT IN ('cancelled', 'archived')";

  let rows;
  const today = todayIso();

  if (p === 'day') {
    const start = addDaysIso(today, -13);
    if (hasSeller) {
      rows = db
        .prepare(
          `SELECT date(o.created_at) as bucket,
                  SUM(oi.quantity * oi.price_at_order) as revenue,
                  COUNT(DISTINCT o.id) as order_count
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           JOIN products p ON p.id = oi.product_id
           WHERE p.seller_id = ?
             AND ${statusClause}
             AND date(o.created_at) >= date(?)
           GROUP BY date(o.created_at)
           ORDER BY bucket ASC`,
        )
        .all(sellerId, start);
    } else {
      rows = db
        .prepare(
          `SELECT date(o.created_at) as bucket,
                  SUM(o.total_amount) as revenue,
                  COUNT(*) as order_count
           FROM orders o
           WHERE ${statusClause}
             AND date(o.created_at) >= date(?)
           GROUP BY date(o.created_at)
           ORDER BY bucket ASC`,
        )
        .all(start);
    }
    const map = rowsToMap(rows);
    const points = [];
    for (let i = 0; i < 14; i += 1) {
      const key = addDaysIso(start, i);
      const v = map.get(key) || { revenue: 0, order_count: 0 };
      points.push({
        key,
        label: formatDayLabel(key),
        revenue: v.revenue,
        order_count: v.order_count,
      });
    }
    return { period: p, points };
  }

  if (p === 'week') {
    const start = addDaysIso(today, -8 * 7 + 1);
    const weekStartExpr =
      "date(o.created_at, '-' || ((cast(strftime('%w', o.created_at) as integer) + 6) % 7) || ' days')";

    if (hasSeller) {
      rows = db
        .prepare(
          `SELECT ${weekStartExpr} as bucket,
                  SUM(oi.quantity * oi.price_at_order) as revenue,
                  COUNT(DISTINCT o.id) as order_count
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           JOIN products p ON p.id = oi.product_id
           WHERE p.seller_id = ?
             AND ${statusClause}
             AND date(o.created_at) >= date(?)
           GROUP BY bucket
           ORDER BY bucket ASC`,
        )
        .all(sellerId, start);
    } else {
      rows = db
        .prepare(
          `SELECT ${weekStartExpr} as bucket,
                  SUM(o.total_amount) as revenue,
                  COUNT(*) as order_count
           FROM orders o
           WHERE ${statusClause}
             AND date(o.created_at) >= date(?)
           GROUP BY bucket
           ORDER BY bucket ASC`,
        )
        .all(start);
    }
    const map = rowsToMap(rows);
    const points = [];
    let k = weekStartMondayKey(`${start}T12:00:00`);
    for (let j = 0; j < 8; j += 1) {
      const v = map.get(k) || { revenue: 0, order_count: 0 };
      points.push({
        key: k,
        label: formatWeekLabel(k),
        revenue: v.revenue,
        order_count: v.order_count,
      });
      k = addDaysIso(k, 7);
    }
    return { period: p, points };
  }

  if (p === 'month') {
    const startYmRow = db.prepare(`SELECT strftime('%Y-%m', date(?, '-11 months')) as ym`).get(today);
    const startYm = startYmRow?.ym || `${today.slice(0, 7)}`;

    if (hasSeller) {
      rows = db
        .prepare(
          `SELECT strftime('%Y-%m', o.created_at) as bucket,
                  SUM(oi.quantity * oi.price_at_order) as revenue,
                  COUNT(DISTINCT o.id) as order_count
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           JOIN products p ON p.id = oi.product_id
           WHERE p.seller_id = ?
             AND ${statusClause}
             AND strftime('%Y-%m', o.created_at) >= ?
           GROUP BY bucket
           ORDER BY bucket ASC`,
        )
        .all(sellerId, startYm);
    } else {
      rows = db
        .prepare(
          `SELECT strftime('%Y-%m', o.created_at) as bucket,
                  SUM(o.total_amount) as revenue,
                  COUNT(*) as order_count
           FROM orders o
           WHERE ${statusClause}
             AND strftime('%Y-%m', o.created_at) >= ?
           GROUP BY bucket
           ORDER BY bucket ASC`,
        )
        .all(startYm);
    }
    const map = rowsToMap(rows);
    const points = [];
    let [y, mo] = startYm.split('-').map((x) => parseInt(x, 10));
    for (let i = 0; i < 12; i += 1) {
      const key = `${y}-${pad2(mo)}`;
      const v = map.get(key) || { revenue: 0, order_count: 0 };
      points.push({
        key,
        label: formatMonthLabel(key),
        revenue: v.revenue,
        order_count: v.order_count,
      });
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
    }
    return { period: p, points };
  }

  /* year */
  const startYearRow = db.prepare(`SELECT cast(strftime('%Y', date(?, '-4 years')) as integer) as y`).get(today);
  let y0 = startYearRow?.y;
  if (!Number.isFinite(y0)) y0 = parseInt(today.slice(0, 4), 10) - 4;

  if (hasSeller) {
    rows = db
      .prepare(
        `SELECT strftime('%Y', o.created_at) as bucket,
                SUM(oi.quantity * oi.price_at_order) as revenue,
                COUNT(DISTINCT o.id) as order_count
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE p.seller_id = ?
           AND ${statusClause}
           AND cast(strftime('%Y', o.created_at) as integer) >= ?
         GROUP BY bucket
         ORDER BY bucket ASC`,
      )
      .all(sellerId, y0);
  } else {
    rows = db
      .prepare(
        `SELECT strftime('%Y', o.created_at) as bucket,
                SUM(o.total_amount) as revenue,
                COUNT(*) as order_count
         FROM orders o
         WHERE ${statusClause}
           AND cast(strftime('%Y', o.created_at) as integer) >= ?
         GROUP BY bucket
         ORDER BY bucket ASC`,
      )
      .all(y0);
  }
  const map = rowsToMap(rows);
  const points = [];
  const endY = parseInt(today.slice(0, 4), 10);
  for (let y = y0; y <= endY; y += 1) {
    const key = String(y);
    const v = map.get(key) || { revenue: 0, order_count: 0 };
    points.push({
      key,
      label: formatYearLabel(key),
      revenue: v.revenue,
      order_count: v.order_count,
    });
  }
  if (points.length === 0) {
    const y = endY;
    const key = String(y);
    points.push({ key, label: formatYearLabel(key), revenue: 0, order_count: 0 });
  }
  return { period: p, points };
}
