import { db } from '../db/database.js';
import { notifyWarehouseMovement } from '../lib/warehouseMovementNotify.js';

function productMeta(productId) {
  return db
    .prepare(
      `SELECT p.id, p.stock, trim(coalesce(p.name_uz, '')) AS name_uz, p.seller_id,
              trim(coalesce(s.name, '')) AS seller_name
       FROM products p
       LEFT JOIN sellers s ON s.id = p.seller_id
       WHERE p.id = ?`,
    )
    .get(productId);
}

function insertEvent({
  productId,
  eventType,
  qty,
  stockBefore,
  stockAfter,
  actorUserId,
  actorRole,
  actorLabel,
  productName,
  sellerId,
  sellerName,
  note,
}) {
  const r = db
    .prepare(
      `INSERT INTO warehouse_ledger_events (
        product_id, event_type, qty, stock_before, stock_after,
        actor_user_id, actor_role, actor_label, product_name, seller_id, seller_name, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      productId,
      eventType,
      qty,
      stockBefore,
      stockAfter,
      actorUserId ?? null,
      actorRole ?? null,
      actorLabel ?? null,
      productName ?? null,
      sellerId ?? null,
      sellerName ?? null,
      note ?? null,
    );
  return Number(r.lastInsertRowid);
}

export function warehouseActorRole(req) {
  const r = String(req?.user?.role || '')
    .trim()
    .toLowerCase();
  if (r === 'superuser' || Number(req?.user?.role_id) === 1) return 'superuser';
  return 'warehouse_admin';
}

export function recordKirimLedgerEvent({
  productId,
  qty,
  actorUserId,
  actorRole,
  actorLabel,
  note,
}) {
  const q = Number(qty) || 0;
  if (q < 1) return null;
  const meta = productMeta(productId);
  if (!meta) return null;
  const stock = Number(meta.stock) || 0;
  return insertEvent({
    productId,
    eventType: 'kirim',
    qty: q,
    stockBefore: stock,
    stockAfter: stock,
    actorUserId,
    actorRole,
    actorLabel,
    productName: meta.name_uz || null,
    sellerId: meta.seller_id ?? null,
    sellerName: meta.seller_name || null,
    note: note || 'Kirim tasdiqlandi',
  });
}

/**
 * Kirim tasdiqlanganda — OMBORDAGI UMUMIY SON (stock) shu kirim miqdoriga OSHADI.
 * Chiqim ustuniga (warehouse_chiqim_qty) hech qanday ta'sir qilmaydi — ular mustaqil.
 */
export function applyKirimStockDelta({
  productId,
  delta,
  actorUserId,
  actorRole,
  actorLabel,
  notifyTitle,
  notifyBody,
  linkType,
  note,
}) {
  const d = Number(delta) || 0;
  if (d === 0) return { applied: false, stock_before: null, stock_after: null, event_id: null };

  const meta = productMeta(productId);
  if (!meta) throw Object.assign(new Error('Mahsulot topilmadi.'), { status: 404 });

  const stockBefore = Number(meta.stock) || 0;
  const stockAfter = stockBefore + d;
  if (stockAfter < 0) {
    throw Object.assign(new Error('Mahsulot soni manfiy bo‘lishi mumkin emas.'), { status: 400 });
  }

  const eventId = db.transaction(() => {
    db.prepare(
      'UPDATE products SET stock = ?, warehouse_kirim_stock_applied = coalesce(warehouse_kirim_stock_applied, 0) + ? WHERE id = ?',
    ).run(stockAfter, d, productId);
    return insertEvent({
      productId,
      eventType: 'kirim',
      qty: d,
      stockBefore,
      stockAfter,
      actorUserId,
      actorRole,
      actorLabel,
      productName: meta.name_uz || null,
      sellerId: meta.seller_id ?? null,
      sellerName: meta.seller_name || null,
      note: note ?? null,
    });
  })();

  if (notifyTitle && notifyBody) {
    try {
      notifyWarehouseMovement({
        actorUserId,
        title: notifyTitle,
        body: notifyBody,
        linkType: linkType || 'seller_product_warehouse_kirim',
        linkId: productId,
      });
    } catch (e) {
      console.warn('[warehouseLedger] notify kirim', e?.message || e);
    }
  }

  return { applied: true, stock_before: stockBefore, stock_after: stockAfter, event_id: eventId };
}

/**
 * Chiqim tasdiqlanganda — OMBORDAGI UMUMIY SON (stock) shu chiqim miqdoriga KAMAYADI.
 * Kirim ustuniga (warehouse_kirim_qty) hech qanday ta'sir qilmaydi — ular mustaqil.
 */
export function applyChiqimStockReduction({
  productId,
  qty,
  actorUserId,
  actorRole,
  actorLabel,
  notifyTitle,
  notifyBody,
  linkType,
  markConfirmed = false,
}) {
  const q = Number(qty) || 0;
  if (q < 1) throw Object.assign(new Error('Chiqim soni kamida 1 bo‘lishi kerak.'), { status: 400 });

  const meta = productMeta(productId);
  if (!meta) throw Object.assign(new Error('Mahsulot topilmadi.'), { status: 404 });

  const stockBefore = Number(meta.stock) || 0;
  if (stockBefore < q) {
    throw Object.assign(
      new Error(`Omborda yetarli mahsulot yo‘q (mavjud: ${stockBefore}, chiqim: ${q}).`),
      { status: 400 },
    );
  }
  const stockAfter = stockBefore - q;

  const eventId = db.transaction(() => {
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stockAfter, productId);
    if (markConfirmed) {
      db.prepare(`UPDATE products SET warehouse_chiqim_confirmed_at = datetime('now') WHERE id = ?`).run(productId);
    }
    return insertEvent({
      productId,
      eventType: 'chiqim',
      qty: q,
      stockBefore,
      stockAfter,
      actorUserId,
      actorRole,
      actorLabel,
      productName: meta.name_uz || null,
      sellerId: meta.seller_id ?? null,
      sellerName: meta.seller_name || null,
    });
  })();

  if (notifyTitle && notifyBody) {
    try {
      notifyWarehouseMovement({
        actorUserId,
        title: notifyTitle,
        body: notifyBody,
        linkType: linkType || 'seller_product_warehouse_chiqim',
        linkId: productId,
      });
    } catch (e) {
      console.warn('[warehouseLedger] notify chiqim', e?.message || e);
    }
  }

  return { applied: true, stock_before: stockBefore, stock_after: stockAfter, event_id: eventId };
}

/** Kirim tasdiqini bekor qilganda — qo'shilgan miqdorni stockdan qaytarib ayiradi. */
export function reverseKirimStock({
  productId,
  kirimQty,
  actorUserId,
  actorRole,
  actorLabel,
  notifyTitle,
  notifyBody,
}) {
  const meta = productMeta(productId);
  if (!meta) throw Object.assign(new Error('Mahsulot topilmadi.'), { status: 404 });

  const appliedRow = db
    .prepare('SELECT coalesce(warehouse_kirim_stock_applied, 0) AS applied, coalesce(warehouse_kirim_qty, 0) AS kirim_qty FROM products WHERE id = ?')
    .get(productId);
  const q = Number(appliedRow?.applied) || 0;
  const fallbackQ = Number(appliedRow?.kirim_qty) || 0;
  const effectiveQ = q > 0 ? q : fallbackQ;
  if (effectiveQ < 1) return { applied: false, stock_before: null, stock_after: null, event_id: null };

  const stockBefore = Number(meta.stock) || 0;
  const stockAfter = Math.max(0, stockBefore - effectiveQ);

  const eventId = db.transaction(() => {
    const existing = db.prepare('SELECT warehouse_approved_at FROM products WHERE id = ?').get(productId);
    if (!existing?.warehouse_approved_at) {
      throw Object.assign(new Error('Tasdiqlangan kirim yo‘q.'), { status: 400 });
    }
    db.prepare(
      'UPDATE products SET stock = ?, warehouse_kirim_stock_applied = 0, warehouse_kirim_qty = 0 WHERE id = ?',
    ).run(stockAfter, productId);
    return insertEvent({
      productId,
      eventType: 'kirim_revoke',
      qty: -effectiveQ,
      stockBefore,
      stockAfter,
      actorUserId,
      actorRole,
      actorLabel,
      productName: meta.name_uz || null,
      sellerId: meta.seller_id ?? null,
      sellerName: meta.seller_name || null,
      note: kirimQty ? `Kirim tasdiqi bekor (${kirimQty} yozuv)` : 'Kirim tasdiqi bekor qilindi',
    });
  })();

  if (notifyTitle && notifyBody) {
    try {
      notifyWarehouseMovement({
        actorUserId,
        title: notifyTitle,
        body: notifyBody,
        linkType: 'seller_product_warehouse_kirim',
        linkId: productId,
      });
    } catch (e) {
      console.warn('[warehouseLedger] notify kirim revoke', e?.message || e);
    }
  }

  return { applied: true, stock_before: stockBefore, stock_after: stockAfter, event_id: eventId };
}

const EVENT_TYPE_LABELS = {
  kirim: 'Kirim',
  chiqim: 'Chiqim',
  kirim_revoke: 'Kirim bekor',
  chiqim_revoke: 'Chiqim bekor',
};

/** Chiqim tasdiqini bekor qilganda — ayirilgan miqdorni stockga qaytarib qo'shadi. */
export function reverseChiqimStock({
  productId,
  actorUserId,
  actorRole,
  actorLabel,
  notifyTitle,
  notifyBody,
}) {
  const meta = productMeta(productId);
  if (!meta) throw Object.assign(new Error('Mahsulot topilmadi.'), { status: 404 });

  const row = db
    .prepare(
      `SELECT warehouse_chiqim_qty, warehouse_chiqim_confirmed_at FROM products WHERE id = ?`,
    )
    .get(productId);

  if (!row || !row.warehouse_chiqim_confirmed_at) {
    return { applied: false, stock_before: null, stock_after: null, event_id: null };
  }

  const q = Number(row.warehouse_chiqim_qty) || 0;
  const stockBefore = Number(meta.stock) || 0;
  const stockAfter = stockBefore + q;

  const eventId = db.transaction(() => {
    const existing = db.prepare('SELECT warehouse_chiqim_confirmed_at FROM products WHERE id = ?').get(productId);
    if (!existing?.warehouse_chiqim_confirmed_at) {
      throw Object.assign(new Error('Tasdiqlangan chiqim yo‘q.'), { status: 400 });
    }
    db.prepare(
      'UPDATE products SET stock = ?, warehouse_chiqim_confirmed_at = NULL WHERE id = ?',
    ).run(stockAfter, productId);
    return insertEvent({
      productId,
      eventType: 'chiqim_revoke',
      qty: -q,
      stockBefore,
      stockAfter,
      actorUserId,
      actorRole,
      actorLabel,
      productName: meta.name_uz || null,
      sellerId: meta.seller_id ?? null,
      sellerName: meta.seller_name || null,
      note: 'Chiqim tasdiqi bekor qilindi',
    });
  })();

  if (notifyTitle && notifyBody) {
    try {
      notifyWarehouseMovement({
        actorUserId,
        title: notifyTitle,
        body: notifyBody,
        linkType: 'seller_product_warehouse_chiqim',
        linkId: productId,
      });
    } catch (e) {
      console.warn('[warehouseLedger] notify chiqim revoke', e?.message || e);
    }
  }

  return { applied: true, stock_before: stockBefore, stock_after: stockAfter, event_id: eventId };
}

export function listWarehouseLedgerEvents({ sinceId = 0, limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const sid = Math.max(Number(sinceId) || 0, 0);

  const rows = db
    .prepare(
      `SELECT id, product_id, event_type, qty, stock_before, stock_after,
              actor_user_id, actor_role, actor_label, product_name, seller_id, seller_name, note, created_at
       FROM warehouse_ledger_events
       WHERE id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(sid, lim);

  return rows.map((r) => ({
    id: Number(r.id),
    product_id: Number(r.product_id),
    event_type: String(r.event_type || ''),
    event_label: EVENT_TYPE_LABELS[r.event_type] || r.event_type,
    qty: Number(r.qty) || 0,
    stock_before: Number(r.stock_before) || 0,
    stock_after: Number(r.stock_after) || 0,
    actor_user_id: r.actor_user_id != null ? Number(r.actor_user_id) : null,
    actor_role: r.actor_role || null,
    actor_label: r.actor_label || null,
    product_name: r.product_name || '',
    seller_id: r.seller_id != null ? Number(r.seller_id) : null,
    seller_name: r.seller_name || '',
    note: r.note || null,
    created_at: r.created_at,
  }));
}

export function listWarehouseLedgerFeed({ limit = 80 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 80, 1), 500);
  const rows = db
    .prepare(
      `SELECT id, product_id, event_type, qty, stock_before, stock_after,
              actor_user_id, actor_role, actor_label, product_name, seller_id, seller_name, note, created_at
       FROM warehouse_ledger_events
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(lim);

  return rows.map((r) => ({
    id: Number(r.id),
    product_id: Number(r.product_id),
    event_type: String(r.event_type || ''),
    event_label: EVENT_TYPE_LABELS[r.event_type] || r.event_type,
    qty: Number(r.qty) || 0,
    stock_before: Number(r.stock_before) || 0,
    stock_after: Number(r.stock_after) || 0,
    actor_user_id: r.actor_user_id != null ? Number(r.actor_user_id) : null,
    actor_role: r.actor_role || null,
    actor_label: r.actor_label || null,
    product_name: r.product_name || '',
    seller_id: r.seller_id != null ? Number(r.seller_id) : null,
    seller_name: r.seller_name || '',
    note: r.note || null,
    created_at: r.created_at,
  }));
}
