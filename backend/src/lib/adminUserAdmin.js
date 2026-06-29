import { db } from '../db/database.js';
import { isSuperuserUserRow } from './portalAccess.js';
import { insertProjectAuditEntry } from './projectAuditLog.js';

function normalizeRoleName(value) {
  return String(value || '').trim().toLowerCase();
}

function runIgnore(sql, ...params) {
  try {
    db.prepare(sql).run(...params);
  } catch {
    /* jadval/ustun bo‘lmasa yoki allaqachon tozalangan */
  }
}

function resolveSellerIdForUser(userId, userRow) {
  const fromUser = Number(userRow?.seller_id);
  if (Number.isInteger(fromUser) && fromUser > 0) return fromUser;
  const linked = db.prepare('SELECT id FROM sellers WHERE user_id = ?').get(userId);
  return linked?.id ? Number(linked.id) : null;
}

function cleanupSellerForUser(userId, sellerId) {
  if (!Number.isInteger(sellerId) || sellerId < 1) return null;

  const productIds = db
    .prepare('SELECT id FROM products WHERE seller_id = ?')
    .all(sellerId)
    .map((r) => Number(r.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (productIds.length) {
    const ph = productIds.map(() => '?').join(',');
    const orderItemCount =
      Number(
        db
          .prepare(`SELECT COUNT(*) AS c FROM order_items WHERE product_id IN (${ph})`)
          .get(...productIds)?.c,
      ) || 0;
    if (orderItemCount > 0) {
      return `Bu sellerning mahsulotlari ${orderItemCount} ta buyurtmada ishlatilgan. Avval buyurtmalarni ko‘rib chiqing.`;
    }
  }

  runIgnore('DELETE FROM seller_notifications WHERE seller_id = ?', sellerId);
  runIgnore('DELETE FROM seller_coin_ledger WHERE seller_id = ?', sellerId);
  runIgnore('DELETE FROM seller_order_earnings WHERE seller_id = ?', sellerId);

  if (productIds.length) {
    const ph = productIds.map(() => '?').join(',');
    runIgnore(`DELETE FROM target_favorites WHERE product_id IN (${ph})`, ...productIds);
    runIgnore(`DELETE FROM target_affiliate_streams WHERE product_id IN (${ph})`, ...productIds);
    runIgnore(`DELETE FROM product_leads WHERE product_id IN (${ph})`, ...productIds);
    runIgnore(`DELETE FROM products WHERE seller_id = ?`, sellerId);
  }

  runIgnore('UPDATE users SET seller_id = NULL WHERE seller_id = ?', sellerId);
  runIgnore('UPDATE users SET seller_id = NULL WHERE id = ?', userId);
  runIgnore('UPDATE withdrawal_requests SET seller_id = NULL WHERE seller_id = ?', sellerId);
  runIgnore('UPDATE sellers SET user_id = NULL WHERE id = ?', sellerId);
  runIgnore('DELETE FROM sellers WHERE id = ?', sellerId);
  return null;
}

function purgeUserReferences(userId) {
  const id = Number(userId);
  const idText = String(id);

  runIgnore('DELETE FROM user_password_history WHERE user_id = ?', id);
  runIgnore('DELETE FROM user_device_events WHERE user_id = ?', id);
  runIgnore('DELETE FROM user_notifications WHERE user_id = ?', id);
  runIgnore('DELETE FROM password_reset_tokens WHERE user_id = ?', id);
  runIgnore('DELETE FROM user_oauth_accounts WHERE user_id = ?', id);
  runIgnore('DELETE FROM staff_chat_presence WHERE user_id = ?', id);
  runIgnore('DELETE FROM lichka_dm_call_logs WHERE owner_user_id = ?', id);
  runIgnore('DELETE FROM target_favorites WHERE user_id = ?', id);
  runIgnore('DELETE FROM target_affiliate_streams WHERE user_id = ?', id);
  runIgnore('DELETE FROM courier_call_logs WHERE user_id = ?', id);
  runIgnore('DELETE FROM operator_earnings WHERE operator_id = ?', id);
  runIgnore('DELETE FROM payroll_employees WHERE user_id = ?', id);
  runIgnore('DELETE FROM finance_logs WHERE actor_user_id = ?', id);
  runIgnore('DELETE FROM accounting_finance_audit WHERE actor_user_id = ?', id);

  runIgnore(
    `DELETE FROM staff_direct_messages
     WHERE sender_user_id = ?
        OR thread_key = ?
        OR thread_key LIKE ?
        OR thread_key LIKE ?`,
    id,
    `brand:${idText}`,
    `dm:${idText}-%`,
    `%-${idText}`,
  );
  runIgnore('DELETE FROM staff_chat_archive WHERE sender_user_id = ?', id);

  const nullify = [
    ['UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = ?', id],
    ['UPDATE sellers SET user_id = NULL WHERE user_id = ?', id],
    ['UPDATE staff_members SET user_id = NULL WHERE user_id = ?', id],
    ['UPDATE products SET ai_target_approved_by = NULL WHERE ai_target_approved_by = ?', id],
    ['UPDATE products SET warehouse_approved_by = NULL WHERE warehouse_approved_by = ?', id],
    ['UPDATE product_leads SET operator_id = NULL WHERE operator_id = ?', id],
    ['UPDATE twilio_sms_messages SET operator_user_id = NULL WHERE operator_user_id = ?', id],
    ['UPDATE withdrawal_requests SET reviewed_by = NULL WHERE reviewed_by = ?', id],
    ['UPDATE withdrawal_requests SET paid_out_by = NULL WHERE paid_out_by = ?', id],
    ['UPDATE expeditor_closed_batches SET expeditor_user_id = NULL WHERE expeditor_user_id = ?', id],
    ['UPDATE project_audit_log SET actor_user_id = NULL WHERE actor_user_id = ?', id],
    ['UPDATE project_audit_log SET edited_by_user_id = NULL WHERE edited_by_user_id = ?', id],
    ['UPDATE payroll_employees SET updated_by = NULL WHERE updated_by = ?', id],
    ['UPDATE payroll_settings SET updated_by = NULL WHERE updated_by = ?', id],
    ['UPDATE payroll_payment_cycles SET paid_by = NULL WHERE paid_by = ?', id],
    ['UPDATE payroll_advance_runs SET superuser_approved_by = NULL WHERE superuser_approved_by = ?', id],
    ['UPDATE payroll_advance_runs SET accounting_assigned_by = NULL WHERE accounting_assigned_by = ?', id],
    ['UPDATE payroll_advance_items SET assigned_by = NULL WHERE assigned_by = ?', id],
    ['UPDATE payroll_advance_items SET distributed_by = NULL WHERE distributed_by = ?', id],
    ['UPDATE accounting_expenses SET created_by = NULL WHERE created_by = ?', id],
    ['UPDATE accounting_expenses SET updated_by = NULL WHERE updated_by = ?', id],
    ['UPDATE accounting_cashbox_movements SET created_by = NULL WHERE created_by = ?', id],
    ['UPDATE accounting_income SET created_by = NULL WHERE created_by = ?', id],
    ['UPDATE financial_reports SET created_by = NULL WHERE created_by = ?', id],
    ['UPDATE payrolls SET created_by = NULL WHERE created_by = ?', id],
    ['UPDATE payrolls SET updated_by = NULL WHERE updated_by = ?', id],
    ['UPDATE payrolls SET paid_by = NULL WHERE paid_by = ?', id],
    ['UPDATE courier_balances SET updated_by = NULL WHERE updated_by = ?', id],
    ['UPDATE warehouse_ledger_events SET actor_user_id = NULL WHERE actor_user_id = ?', id],
    ['UPDATE orders SET operator_id = NULL WHERE operator_id = ?', id],
  ];
  for (const [sql, param] of nullify) runIgnore(sql, param);
}

function insightBlock(key, label, value, unit = '') {
  const num = Number(value) || 0;
  return { key, label, value: num, unit, drillable: num > 0 };
}

const INSIGHT_BLOCK_LABELS = {
  messages: 'Xabarlar',
  orders: 'Buyurtmalar',
  orders_sum: 'Buyurtma summasi',
  orders_delivered: 'Yetkazilgan buyurtma',
  orders_atkaz: 'Atkaz buyurtma',
  orders_archive: 'Arxiv buyurtma',
  seller_products: 'Mahsulotlar',
  seller_stock_sum: 'Mahsulot summasi',
  seller_delivered: 'Yetkazilgan mahsulot',
  seller_delivered_sum: 'Yetkazilgan summa',
  seller_atkaz: 'Atkaz mahsulot',
  seller_wh_atkaz: 'Ombor atkaz',
  seller_archive: 'Arxiv mahsulot',
  seller_brak: 'Brak dona',
  seller_brak_products: 'Brak mahsulot',
};

function mapOrderStatusLabel(status) {
  const s = String(status || '').trim().toLowerCase();
  const map = {
    pending: 'Kutilmoqda',
    processing: 'Jarayonda',
    delivery: 'Yetkazish',
    on_the_way: 'Yo‘lda',
    delivered: 'Yetkazilgan',
    completed: 'Yakunlangan',
    cancelled: 'Bekor',
    archived: 'Arxiv',
    hold: 'Kutish',
    assigned: 'Kuryerga biriktirilgan',
    picked_up: 'Olingan',
    picked: 'Yig‘ilgan',
    packaged: 'Qadoqlangan',
  };
  return map[s] || status || '—';
}

function mapInsightItem(payload) {
  return {
    deletable: true,
    products: [],
    image_url: null,
    ...payload,
  };
}

function normalizeProductImageUrl(value) {
  const url = String(value || '').trim();
  return url || null;
}

function mapProductLine(row) {
  const name = String(row.name || row.name_uz || row.name_ru || 'Mahsulot').trim();
  return {
    id: row.product_id != null ? Number(row.product_id) : row.id != null ? Number(row.id) : null,
    name,
    quantity: Number(row.quantity ?? row.stock ?? 0) || 0,
    image_url: normalizeProductImageUrl(row.image_url),
  };
}

function fetchUserOrdersItems(userId, filterKey) {
  let statusSql = '1=1';
  if (filterKey === 'orders_delivered') {
    statusSql = "lower(trim(coalesce(o.status, ''))) IN ('delivered', 'completed')";
  } else if (filterKey === 'orders_atkaz') {
    statusSql =
      "lower(trim(coalesce(o.status, ''))) = 'cancelled' OR COALESCE(o.courier_unsold_return, 0) = 1";
  } else if (filterKey === 'orders_archive') {
    statusSql = "lower(trim(coalesce(o.status, ''))) = 'archived'";
  }

  const orders = db
    .prepare(
      `SELECT o.id, o.status, o.total_amount, o.created_at, COALESCE(o.courier_unsold_return, 0) AS courier_unsold_return
       FROM orders o
       WHERE o.user_id = ? AND (${statusSql})
       ORDER BY datetime(o.created_at) DESC, o.id DESC
       LIMIT 100`,
    )
    .all(userId);

  return orders.map((o) => {
    const lines = db
      .prepare(
        `SELECT oi.quantity, oi.price_at_order, p.id AS product_id,
                trim(coalesce(p.name_uz, p.name_ru, 'Mahsulot')) AS name,
                p.image_url
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
      )
      .all(o.id);
    const products = lines.map((l) => mapProductLine(l));
    const productText =
      products.map((l) => `${l.name} ×${l.quantity}`).join(', ') || 'Mahsulot ko‘rsatilmagan';
    const statusLabel = mapOrderStatusLabel(o.status);
    const atkazNote = Number(o.courier_unsold_return) === 1 ? ' (kuryer atkaz)' : '';
    return mapInsightItem({
      id: String(o.id),
      itemType: 'order',
      products,
      productName: products[0]?.name || 'Mahsulot',
      productQty: products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0),
      image_url: products[0]?.image_url || null,
      primary: productText,
      secondary: `Buyurtma #${o.id} · ${statusLabel}${atkazNote}`,
      detail: `${Math.round(Number(o.total_amount) || 0).toLocaleString('uz-UZ')} so‘m`,
      date: o.created_at,
    });
  });
}

function fetchMessagesItems(userId) {
  const idText = String(userId);
  const items = [];

  const notifications = db
    .prepare(
      `SELECT id, title, body, created_at
       FROM user_notifications WHERE user_id = ?
       ORDER BY datetime(created_at) DESC, id DESC LIMIT 80`,
    )
    .all(userId);
  for (const row of notifications) {
    items.push(
      mapInsightItem({
        id: `n-${row.id}`,
        itemType: 'notification',
        primary: row.title || 'Xabar',
        secondary: String(row.body || '').slice(0, 120) || '—',
        detail: 'Bildirishnoma',
        date: row.created_at,
      }),
    );
  }

  try {
    const dms = db
      .prepare(
        `SELECT id, body, message_type, created_at, sender_user_id
         FROM staff_direct_messages
         WHERE sender_user_id = ?
            OR thread_key = ?
            OR thread_key LIKE ?
            OR thread_key LIKE ?
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT 80`,
      )
      .all(userId, `brand:${idText}`, `dm:${idText}-%`, `%-${idText}`);
    for (const row of dms) {
      const isOwn = Number(row.sender_user_id) === Number(userId);
      items.push(
        mapInsightItem({
          id: `dm-${row.id}`,
          itemType: 'dm',
          primary: String(row.body || row.message_type || 'Chat xabari').slice(0, 100),
          secondary: isOwn ? 'Yuborilgan' : 'Qabul qilingan',
          detail: 'Chat',
          date: row.created_at,
        }),
      );
    }
  } catch {
    /* ignore */
  }

  items.sort(
    (a, b) =>
      (Date.parse(String(b.date || '').replace(' ', 'T')) || 0) -
      (Date.parse(String(a.date || '').replace(' ', 'T')) || 0),
  );
  return items.slice(0, 100);
}

function fetchSellerProductsItems(sellerId, mode) {
  let extraWhere = '1=1';
  if (mode === 'archive') {
    extraWhere = `(trim(coalesce(warehouse_deleted_at, '')) <> ''
      OR trim(coalesce(warehouse_delisted_at, '')) <> ''
      OR trim(coalesce(off_sale_variant, '')) <> ''
      OR (lower(trim(coalesce(status, ''))) <> '' AND lower(trim(status)) NOT IN ('active', 'scheduled', 'pending')))`;
  } else if (mode === 'brak_products') {
    extraWhere = "lower(trim(coalesce(off_sale_variant, ''))) = 'brak'";
  } else if (mode === 'brak_qty') {
    extraWhere = 'COALESCE(brak_qty, 0) > 0';
  } else if (mode === 'wh_atkaz') {
    extraWhere = 'COALESCE(warehouse_atkaz_qty, 0) > 0';
  }

  const rows = db
    .prepare(
      `SELECT id, name_uz, name_ru, price, stock, status, brak_qty, warehouse_atkaz_qty, created_at, image_url
       FROM products
       WHERE seller_id = ? AND (${extraWhere})
       ORDER BY id DESC
       LIMIT 120`,
    )
    .all(sellerId);

  return rows.map((p) => {
    const name = String(p.name_uz || p.name_ru || `Mahsulot #${p.id}`).trim();
    const stock = Number(p.stock) || 0;
    const price = Number(p.price) || 0;
    let detail = `${price.toLocaleString('uz-UZ')} so‘m`;
    if (mode === 'brak_qty' || mode === 'brak_products') {
      detail = `Brak: ${Number(p.brak_qty) || 0} dona`;
    } else if (mode === 'wh_atkaz') {
      detail = `Ombor atkaz: ${Number(p.warehouse_atkaz_qty) || 0} dona`;
    } else if (mode === 'all' || mode === 'stock_sum') {
      detail = `Stock ${stock} · ${Math.round(price * stock).toLocaleString('uz-UZ')} so‘m`;
    }
    const productLine = mapProductLine({ ...p, name, quantity: stock, product_id: p.id });
    return mapInsightItem({
      id: String(p.id),
      itemType: 'product',
      productName: name,
      productQty: stock,
      image_url: productLine.image_url,
      products: [productLine],
      primary: name,
      secondary: `Holat: ${p.status || '—'}`,
      detail,
      date: p.created_at,
    });
  });
}

function fetchSellerOrderLineItems(sellerId, mode) {
  let statusSql = '1=1';
  if (mode === 'delivered') {
    statusSql = "lower(trim(coalesce(o.status, ''))) IN ('delivered', 'completed')";
  } else if (mode === 'atkaz') {
    statusSql =
      "lower(trim(coalesce(o.status, ''))) IN ('cancelled', 'archived') OR COALESCE(o.courier_unsold_return, 0) = 1";
  }

  const rows = db
    .prepare(
      `SELECT oi.order_id, oi.quantity, oi.price_at_order, o.created_at, o.status,
              trim(coalesce(p.name_uz, p.name_ru, 'Mahsulot')) AS name, p.id AS product_id, p.image_url
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN products p ON p.id = oi.product_id
       WHERE p.seller_id = ? AND (${statusSql})
       ORDER BY datetime(o.created_at) DESC, oi.id DESC
       LIMIT 120`,
    )
    .all(sellerId);

  return rows.map((r) => {
    const qty = Number(r.quantity) || 0;
    const price = Number(r.price_at_order) || 0;
    const productLine = mapProductLine(r);
    return mapInsightItem({
      id: `${r.order_id}-${r.product_id}`,
      itemType: 'order_line',
      orderId: r.order_id,
      productId: r.product_id,
      productName: r.name,
      productQty: qty,
      image_url: productLine.image_url,
      products: [productLine],
      primary: `${r.name} ×${qty}`,
      secondary: `Buyurtma #${r.order_id} · ${mapOrderStatusLabel(r.status)}`,
      detail: `${Math.round(qty * price).toLocaleString('uz-UZ')} so‘m`,
      date: r.created_at,
    });
  });
}

function purgeOrderRecords(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) return;
  runIgnore('DELETE FROM order_items WHERE order_id = ?', id);
  runIgnore('DELETE FROM user_device_events WHERE order_id = ?', id);
  runIgnore('DELETE FROM product_leads WHERE order_id = ?', id);
  runIgnore('DELETE FROM courier_call_logs WHERE order_id = ?', id);
  runIgnore('DELETE FROM ai_call_transcripts WHERE order_id = ?', id);
  runIgnore('DELETE FROM operator_earnings WHERE order_id = ?', id);
  runIgnore('DELETE FROM seller_order_earnings WHERE order_id = ?', id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}

function deleteInsightProduct(productId, sellerId) {
  const pid = Number(productId);
  const sid = Number(sellerId);
  const product = db.prepare('SELECT id, seller_id FROM products WHERE id = ?').get(pid);
  if (!product) return { ok: false, status: 404, error: 'Mahsulot topilmadi.' };
  if (Number(product.seller_id) !== sid) {
    return { ok: false, status: 403, error: 'Bu mahsulot ushbu sellerga tegishli emas.' };
  }
  const usedInOrders =
    Number(db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE product_id = ?').get(pid)?.c) || 0;
  if (usedInOrders > 0) {
    return {
      ok: false,
      status: 409,
      error: 'Mahsulot buyurtmalarda ishlatilgan. Avval tegishli buyurtmani o‘chiring.',
    };
  }
  runIgnore('DELETE FROM target_favorites WHERE product_id = ?', pid);
  runIgnore('DELETE FROM target_affiliate_streams WHERE product_id = ?', pid);
  runIgnore('DELETE FROM product_leads WHERE product_id = ?', pid);
  db.prepare('DELETE FROM products WHERE id = ?').run(pid);
  return { ok: true, status: 200 };
}

export function deleteAdminUserInsightItem({ userId, blockKey, itemId }) {
  const uid = Number(userId);
  const key = String(blockKey || '').trim();
  const rawItemId = String(itemId || '').trim();
  if (!Number.isInteger(uid) || uid < 1 || !INSIGHT_BLOCK_LABELS[key] || !rawItemId) {
    return { ok: false, status: 400, error: 'Noto‘g‘ri so‘rov.' };
  }

  const user = db.prepare('SELECT id, seller_id FROM users WHERE id = ?').get(uid);
  if (!user) return { ok: false, status: 404, error: 'Foydalanuvchi topilmadi.' };

  const sellerId = resolveSellerIdForUser(uid, user);

  try {
    if (key === 'messages') {
      if (rawItemId.startsWith('n-')) {
        const nid = Number(rawItemId.slice(2));
        const row = db.prepare('SELECT id FROM user_notifications WHERE id = ? AND user_id = ?').get(nid, uid);
        if (!row) return { ok: false, status: 404, error: 'Xabar topilmadi.' };
        db.prepare('DELETE FROM user_notifications WHERE id = ?').run(nid);
        return { ok: true, status: 200 };
      }
      if (rawItemId.startsWith('dm-')) {
        const did = Number(rawItemId.slice(3));
        const idText = String(uid);
        const row = db
          .prepare(
            `SELECT id FROM staff_direct_messages
             WHERE id = ?
               AND (sender_user_id = ? OR thread_key = ? OR thread_key LIKE ? OR thread_key LIKE ?)`,
          )
          .get(did, uid, `brand:${idText}`, `dm:${idText}-%`, `%-${idText}`);
        if (!row) return { ok: false, status: 404, error: 'Chat xabari topilmadi.' };
        db.prepare('DELETE FROM staff_direct_messages WHERE id = ?').run(did);
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 400, error: 'Noto‘g‘ri xabar ID.' };
    }

    if (['orders', 'orders_sum', 'orders_delivered', 'orders_atkaz', 'orders_archive'].includes(key)) {
      const orderId = Number(rawItemId);
      const order = db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(orderId, uid);
      if (!order) return { ok: false, status: 404, error: 'Buyurtma topilmadi.' };
      db.transaction(() => purgeOrderRecords(orderId))();
      return { ok: true, status: 200 };
    }

    if (
      [
        'seller_delivered',
        'seller_delivered_sum',
        'seller_atkaz',
      ].includes(key)
    ) {
      const parts = rawItemId.split('-');
      const orderId = Number(parts[0]);
      const productId = Number(parts[1]);
      if (!Number.isInteger(orderId) || !Number.isInteger(productId) || !sellerId) {
        return { ok: false, status: 400, error: 'Noto‘g‘ri yozuv ID.' };
      }
      const line = db
        .prepare(
          `SELECT oi.order_id, p.seller_id
           FROM order_items oi
           INNER JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = ? AND oi.product_id = ?`,
        )
        .get(orderId, productId);
      if (!line || Number(line.seller_id) !== Number(sellerId)) {
        return { ok: false, status: 404, error: 'Buyurtma qatori topilmadi.' };
      }
      db.transaction(() => {
        db.prepare('DELETE FROM order_items WHERE order_id = ? AND product_id = ?').run(orderId, productId);
        const remaining =
          Number(db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?').get(orderId)?.c) || 0;
        if (remaining === 0) purgeOrderRecords(orderId);
      })();
      return { ok: true, status: 200 };
    }

    if (
      [
        'seller_products',
        'seller_stock_sum',
        'seller_wh_atkaz',
        'seller_archive',
        'seller_brak',
        'seller_brak_products',
      ].includes(key)
    ) {
      if (!sellerId) return { ok: false, status: 404, error: 'Seller topilmadi.' };
      return deleteInsightProduct(Number(rawItemId), sellerId);
    }

    return { ok: false, status: 400, error: 'Bu bo‘lim uchun o‘chirish qo‘llab-quvvatlanmaydi.' };
  } catch (e) {
    const raw = String(e?.message || '');
    if (/FOREIGN KEY constraint failed/i.test(raw)) {
      return { ok: false, status: 409, error: 'O‘chirib bo‘lmadi: bog‘liq yozuvlar qolgan.' };
    }
    return { ok: false, status: 500, error: raw || 'O‘chirishda xatolik.' };
  }
}

export function getAdminUserDeletionInsightDetail(userId, blockKey) {
  const id = Number(userId);
  const key = String(blockKey || '').trim();
  if (!Number.isInteger(id) || id < 1 || !INSIGHT_BLOCK_LABELS[key]) return null;

  const user = db.prepare('SELECT id, role, seller_id FROM users WHERE id = ?').get(id);
  if (!user) return null;

  const sellerId = resolveSellerIdForUser(id, user);
  let items = [];

  if (key === 'messages') {
    items = fetchMessagesItems(id);
  } else if (['orders', 'orders_sum', 'orders_delivered', 'orders_atkaz', 'orders_archive'].includes(key)) {
    items = fetchUserOrdersItems(id, key);
  } else if (key === 'seller_products' || key === 'seller_stock_sum') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerProductsItems(sellerId, key === 'seller_stock_sum' ? 'stock_sum' : 'all');
  } else if (key === 'seller_delivered' || key === 'seller_delivered_sum') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerOrderLineItems(sellerId, 'delivered');
  } else if (key === 'seller_atkaz') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerOrderLineItems(sellerId, 'atkaz');
  } else if (key === 'seller_wh_atkaz') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerProductsItems(sellerId, 'wh_atkaz');
  } else if (key === 'seller_archive') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerProductsItems(sellerId, 'archive');
  } else if (key === 'seller_brak') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerProductsItems(sellerId, 'brak_qty');
  } else if (key === 'seller_brak_products') {
    if (!sellerId) return { block: { key, label: INSIGHT_BLOCK_LABELS[key] }, items: [] };
    items = fetchSellerProductsItems(sellerId, 'brak_products');
  }

  return {
    block: { key, label: INSIGHT_BLOCK_LABELS[key] },
    items,
  };
}

export function getAdminUserDeletionInsights(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;

  const user = db
    .prepare(
      `SELECT id, full_name, email, login, role, status, seller_id, created_at
       FROM users WHERE id = ?`,
    )
    .get(id);
  if (!user) return null;

  const idText = String(id);
  const notifCount =
    Number(db.prepare('SELECT COUNT(*) AS c FROM user_notifications WHERE user_id = ?').get(id)?.c) || 0;
  let dmCount = 0;
  try {
    dmCount =
      Number(
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM staff_direct_messages
             WHERE sender_user_id = ?
                OR thread_key = ?
                OR thread_key LIKE ?
                OR thread_key LIKE ?`,
          )
          .get(id, `brand:${idText}`, `dm:${idText}-%`, `%-${idText}`)?.c,
      ) || 0;
  } catch {
    /* jadval bo‘lmasa */
  }

  const orderAgg = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(total_amount), 0) AS sum_amount,
         COALESCE(SUM(CASE WHEN lower(trim(coalesce(status, ''))) IN ('delivered', 'completed') THEN 1 ELSE 0 END), 0) AS delivered,
         COALESCE(SUM(CASE
           WHEN lower(trim(coalesce(status, ''))) = 'cancelled'
             OR COALESCE(courier_unsold_return, 0) = 1
           THEN 1 ELSE 0 END), 0) AS atkaz,
         COALESCE(SUM(CASE WHEN lower(trim(coalesce(status, ''))) = 'archived' THEN 1 ELSE 0 END), 0) AS archived
       FROM orders WHERE user_id = ?`,
    )
    .get(id);

  const blocks = [
    insightBlock('messages', 'Xabarlar', notifCount + dmCount, 'ta'),
    insightBlock('orders', 'Buyurtmalar', orderAgg?.total, 'ta'),
    insightBlock('orders_sum', 'Buyurtma summasi', Math.round(Number(orderAgg?.sum_amount) || 0), 'so‘m'),
    insightBlock('orders_delivered', 'Yetkazilgan buyurtma', orderAgg?.delivered, 'ta'),
    insightBlock('orders_atkaz', 'Atkaz buyurtma', orderAgg?.atkaz, 'ta'),
    insightBlock('orders_archive', 'Arxiv buyurtma', orderAgg?.archived, 'ta'),
  ];

  const sellerId = resolveSellerIdForUser(id, user);
  if (sellerId) {
    const prodAgg = db
      .prepare(
        `SELECT
           COUNT(*) AS product_count,
           COALESCE(SUM(COALESCE(price, 0) * COALESCE(stock, 0)), 0) AS stock_sum,
           COALESCE(SUM(COALESCE(brak_qty, 0)), 0) AS brak_qty_sum,
           COALESCE(SUM(COALESCE(warehouse_atkaz_qty, 0)), 0) AS warehouse_atkaz_qty,
           COALESCE(SUM(CASE
             WHEN trim(coalesce(warehouse_deleted_at, '')) <> ''
               OR trim(coalesce(warehouse_delisted_at, '')) <> ''
               OR trim(coalesce(off_sale_variant, '')) <> ''
               OR (
                 lower(trim(coalesce(status, ''))) <> ''
                 AND lower(trim(status)) NOT IN ('active', 'scheduled', 'pending')
               )
             THEN 1 ELSE 0 END), 0) AS archive_count,
           COALESCE(SUM(CASE WHEN lower(trim(coalesce(off_sale_variant, ''))) = 'brak' THEN 1 ELSE 0 END), 0) AS brak_product_count
         FROM products WHERE seller_id = ?`,
      )
      .get(sellerId);

    const soldAgg = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE
             WHEN lower(trim(coalesce(o.status, ''))) IN ('delivered', 'completed')
             THEN oi.quantity ELSE 0 END), 0) AS delivered_qty,
           COALESCE(SUM(CASE
             WHEN lower(trim(coalesce(o.status, ''))) IN ('cancelled', 'archived')
               OR COALESCE(o.courier_unsold_return, 0) = 1
             THEN oi.quantity ELSE 0 END), 0) AS atkaz_qty,
           COALESCE(SUM(CASE
             WHEN lower(trim(coalesce(o.status, ''))) IN ('delivered', 'completed')
             THEN oi.quantity * COALESCE(oi.price_at_order, 0) ELSE 0 END), 0) AS delivered_sum
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         INNER JOIN products p ON p.id = oi.product_id
         WHERE p.seller_id = ?`,
      )
      .get(sellerId);

    blocks.push(
      insightBlock('seller_products', 'Mahsulotlar', prodAgg?.product_count, 'ta'),
      insightBlock('seller_stock_sum', 'Mahsulot summasi', Math.round(Number(prodAgg?.stock_sum) || 0), 'so‘m'),
      insightBlock('seller_delivered', 'Yetkazilgan mahsulot', soldAgg?.delivered_qty, 'dona'),
      insightBlock(
        'seller_delivered_sum',
        'Yetkazilgan summa',
        Math.round(Number(soldAgg?.delivered_sum) || 0),
        'so‘m',
      ),
      insightBlock('seller_atkaz', 'Atkaz mahsulot', soldAgg?.atkaz_qty, 'dona'),
      insightBlock('seller_wh_atkaz', 'Ombor atkaz', prodAgg?.warehouse_atkaz_qty, 'dona'),
      insightBlock('seller_archive', 'Arxiv mahsulot', prodAgg?.archive_count, 'ta'),
      insightBlock('seller_brak', 'Brak dona', prodAgg?.brak_qty_sum, 'dona'),
      insightBlock('seller_brak_products', 'Brak mahsulot', prodAgg?.brak_product_count, 'ta'),
    );
  }

  return {
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      login: user.login,
      role: user.role,
      status: user.status,
      seller_id: sellerId,
    },
    blocks,
  };
}

export function listAdminUserMessages(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;
  const user = db.prepare('SELECT id, full_name, email, login, role FROM users WHERE id = ?').get(id);
  if (!user) return null;

  const notifications = db
    .prepare(
      `SELECT id, title, body, created_at, read_at, link_type, link_id
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 200`,
    )
    .all(id);

  return { user, messages: notifications };
}

export function sendAdminUserMessage({ targetUserId, actorUserId, title, body }) {
  const id = Number(targetUserId);
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, status: 400, error: 'Noto‘g‘ri foydalanuvchi ID.' };
  }

  const user = db.prepare('SELECT id, role, full_name, email FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, status: 404, error: 'Foydalanuvchi topilmadi.' };

  const titleText = String(title || 'MyShop xabari').trim().slice(0, 200) || 'MyShop xabari';
  const bodyText = String(body || '').trim().slice(0, 4000);
  if (!bodyText) return { ok: false, status: 400, error: 'Xabar matnini kiriting.' };

  const ins = db
    .prepare(
      `INSERT INTO user_notifications (user_id, title, body, link_type, link_id)
       VALUES (?, ?, ?, 'admin_message', ?)`,
    )
    .run(id, titleText, bodyText, Number(actorUserId) || null);

  try {
    insertProjectAuditEntry({
      source: 'admin',
      actorUserId,
      actorRole: 'superuser',
      method: 'POST',
      path: `/api/admin/users/${id}/messages`,
      statusCode: 201,
      summaryOriginal: `ADMIN_MESSAGE user_id=${id}`,
      payloadOriginal: { title: titleText, preview: bodyText.slice(0, 120) },
    });
  } catch {
    /* ignore audit errors */
  }

  const row = db
    .prepare(
      `SELECT id, title, body, created_at, read_at, link_type, link_id
       FROM user_notifications WHERE id = ?`,
    )
    .get(ins.lastInsertRowid);

  return { ok: true, status: 201, message: row };
}

export function deleteAdminManagedUser({ targetUserId, actorUserId }) {
  const id = Number(targetUserId);
  const actorId = Number(actorUserId);
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, status: 400, error: 'Noto‘g‘ri foydalanuvchi ID.' };
  }
  if (id === actorId) {
    return { ok: false, status: 403, error: 'O‘zingizni o‘chirib bo‘lmaydi.' };
  }

  const user = db.prepare('SELECT id, role, role_id, email, full_name, seller_id FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, status: 404, error: 'Foydalanuvchi topilmadi.' };
  if (normalizeRoleName(user.role) === 'superuser' || isSuperuserUserRow(user)) {
    return { ok: false, status: 403, error: 'Superuserni o‘chirib bo‘lmaydi.' };
  }

  const ordersCount = Number(db.prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id = ?').get(id)?.c) || 0;
  if (ordersCount > 0) {
    return {
      ok: false,
      status: 409,
      error: `Bu foydalanuvchida ${ordersCount} ta buyurtma bor. Avval buyurtmalarni ko‘rib chiqing yoki foydalanuvchini bloklang.`,
    };
  }

  const sellerId = resolveSellerIdForUser(id, user);

  const tx = db.transaction(() => {
    if (sellerId) {
      const sellerBlock = cleanupSellerForUser(id, sellerId);
      if (sellerBlock) {
        const err = new Error(sellerBlock);
        err.statusCode = 409;
        throw err;
      }
    }
    purgeUserReferences(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  try {
    tx();
  } catch (e) {
    if (Number(e?.statusCode) === 409) {
      return { ok: false, status: 409, error: e.message };
    }
    const raw = String(e?.message || '');
    if (/FOREIGN KEY constraint failed/i.test(raw)) {
      return {
        ok: false,
        status: 409,
        error:
          'Foydalanuvchini o‘chirib bo‘lmadi: bazada hali bog‘liq yozuvlar qolgan. Buyurtma, chat yoki moliya jurnali bor bo‘lishi mumkin.',
      };
    }
    return { ok: false, status: 500, error: raw || 'O‘chirishda xatolik.' };
  }

  try {
    insertProjectAuditEntry({
      source: 'admin',
      actorUserId: actorId,
      actorRole: 'superuser',
      method: 'DELETE',
      path: `/api/admin/users/${id}`,
      statusCode: 200,
      summaryOriginal: `DELETE_USER user_id=${id} email=${String(user.email || '').slice(0, 80)}`,
      payloadOriginal: { role: user.role, seller_id: user.seller_id },
    });
  } catch {
    /* ignore */
  }

  return { ok: true, status: 200 };
}
