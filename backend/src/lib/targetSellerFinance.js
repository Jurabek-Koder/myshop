import { db } from '../db/database.js';

const IN_TRANSIT_STATUSES = [
  'pending',
  'hold',
  'picked',
  'packaged',
  'assigned',
  'picked_up',
  'on_the_way',
];

function readSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value != null ? String(row.value) : fallback;
}

export function getTargetCoinSettings() {
  return {
    perReferral: Math.max(0, Number(readSetting('target_coin_per_referral', '50')) || 50),
    perDeliveredOrder: Math.max(0, Number(readSetting('target_coin_per_delivered_order', '10')) || 10),
    uzsPerCoin: Math.max(1, Number(readSetting('target_coin_uzs_per_coin', '100')) || 100),
    minCoinWithdraw: Math.max(1, Number(readSetting('target_coin_min_withdraw', '10')) || 10),
  };
}

export function calcSellerPendingCommission(sellerId) {
  const sid = Number(sellerId);
  if (!Number.isFinite(sid) || sid < 1) return 0;
  const placeholders = IN_TRANSIT_STATUSES.map(() => '?').join(', ');
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(COALESCE(p.operator_share_amount, 0) * oi.quantity), 0) AS pending
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    INNER JOIN products p ON p.id = oi.product_id AND p.seller_id = ?
    WHERE lower(trim(COALESCE(o.status, ''))) IN (${placeholders})
  `,
    )
    .get(sid, ...IN_TRANSIT_STATUSES);
  return Math.round(Number(row?.pending) || 0);
}

export function getSellerFinanceSummary(sellerId) {
  const sid = Number(sellerId);
  if (!Number.isFinite(sid) || sid < 1) {
    return { balance: 0, coins: 0, pending: 0 };
  }
  const seller = db
    .prepare('SELECT COALESCE(balance, 0) AS balance, COALESCE(coins, 0) AS coins FROM sellers WHERE id = ?')
    .get(sid);
  if (!seller) return { balance: 0, coins: 0, pending: 0 };
  return {
    balance: Number(seller.balance) || 0,
    coins: Number(seller.coins) || 0,
    pending: calcSellerPendingCommission(sid),
  };
}

function insertCoinLedger({ sellerId, amount, kind, title, refKind = null, refId = null }) {
  const sid = Number(sellerId);
  const delta = Math.trunc(Number(amount) || 0);
  if (!Number.isFinite(sid) || sid < 1 || !delta) return null;

  if (refKind && refId != null) {
    const dup = db
      .prepare(
        `
      SELECT id FROM seller_coin_ledger
      WHERE seller_id = ? AND kind = ? AND ref_kind = ? AND ref_id = ?
    `,
      )
      .get(sid, kind, refKind, Number(refId));
    if (dup) return null;
  }

  const seller = db.prepare('SELECT COALESCE(coins, 0) AS coins FROM sellers WHERE id = ?').get(sid);
  if (!seller) return null;
  const next = Math.max(0, Math.trunc(Number(seller.coins) || 0) + delta);
  if (delta < 0 && next < 0) throw new Error('INSUFFICIENT_COINS');

  db.prepare('UPDATE sellers SET coins = ? WHERE id = ?').run(next, sid);
  const result = db
    .prepare(
      `
    INSERT INTO seller_coin_ledger (seller_id, amount, balance_after, kind, title, ref_kind, ref_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(sid, delta, next, kind, title, refKind, refId != null ? Number(refId) : null);
  return { id: result.lastInsertRowid, balanceAfter: next };
}

export function awardSellerCoins({ sellerId, amount, kind, title, refKind = null, refId = null }) {
  const coins = Math.trunc(Number(amount) || 0);
  if (coins <= 0) return null;
  return insertCoinLedger({ sellerId, amount: coins, kind, title, refKind, refId });
}

export function spendSellerCoins({ sellerId, amount, kind, title, refKind = null, refId = null }) {
  const coins = Math.trunc(Number(amount) || 0);
  if (coins <= 0) throw new Error('INVALID_COIN_AMOUNT');
  return insertCoinLedger({ sellerId, amount: -coins, kind, title, refKind, refId });
}

export function creditSellerForDeliveredOrder(orderId) {
  const oid = Number(orderId);
  if (!Number.isFinite(oid) || oid < 1) return;

  const settings = getTargetCoinSettings();
  const rows = db
    .prepare(
      `
    SELECT
      p.seller_id AS seller_id,
      COALESCE(SUM(COALESCE(p.operator_share_amount, 0) * oi.quantity), 0) AS commission
    FROM order_items oi
    INNER JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ? AND p.seller_id IS NOT NULL
    GROUP BY p.seller_id
  `,
    )
    .all(oid);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const sellerId = Number(row.seller_id);
      if (!Number.isFinite(sellerId) || sellerId < 1) continue;

      const exists = db
        .prepare('SELECT id FROM seller_order_earnings WHERE seller_id = ? AND order_id = ?')
        .get(sellerId, oid);
      if (exists) continue;

      const commission = Math.round(Number(row.commission) || 0);
      const coins = settings.perDeliveredOrder;

      db.prepare(
        `
        INSERT INTO seller_order_earnings (seller_id, order_id, commission, coins)
        VALUES (?, ?, ?, ?)
      `,
      ).run(sellerId, oid, commission, coins);

      if (commission > 0) {
        db.prepare('UPDATE sellers SET balance = COALESCE(balance, 0) + ? WHERE id = ?').run(commission, sellerId);
      }

      if (coins > 0) {
        awardSellerCoins({
          sellerId,
          amount: coins,
          kind: 'earn_order',
          title: `Yetkazilgan buyurtma #${oid}`,
          refKind: 'order',
          refId: oid,
        });
      }

      if (commission > 0 || coins > 0) {
        const parts = [];
        if (commission > 0) parts.push(`${commission.toLocaleString('uz-UZ')} so'm balansga`);
        if (coins > 0) parts.push(`+${coins} tanga`);
        db.prepare(
          `
          INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
          VALUES (?, ?, ?, 'success', 'cabinet', 0)
        `,
        ).run(
          sellerId,
          'Buyurtma yetkazildi',
          `#${oid}: ${parts.join(', ')}.`,
        );
      }
    }
  });
  tx();
}

export function awardReferralCoins(referrerUserId, newUserId) {
  const referrerId = Number(referrerUserId);
  const newId = Number(newUserId);
  if (!Number.isFinite(referrerId) || referrerId < 1 || !Number.isFinite(newId) || newId < 1) return;

  const referrer = db
    .prepare('SELECT id, seller_id, role FROM users WHERE id = ?')
    .get(referrerId);
  if (!referrer) return;

  const sellerId = Number(referrer.seller_id);
  if (!Number.isFinite(sellerId) || sellerId < 1) return;

  const settings = getTargetCoinSettings();
  if (settings.perReferral <= 0) return;

  const tx = db.transaction(() => {
    const entry = awardSellerCoins({
      sellerId,
      amount: settings.perReferral,
      kind: 'earn_referral',
      title: 'Yangi referal',
      refKind: 'user',
      refId: newId,
    });
    if (!entry) return;

    db.prepare(
      `
      INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
      VALUES (?, ?, ?, 'success', 'referral', 0)
    `,
    ).run(
      sellerId,
      'Referal tangasi',
      `Yangi foydalanuvchi ro'yxatdan o'tdi. +${settings.perReferral} tanga.`,
    );
  });
  tx();
}

export function refundCoinWithdrawal(sellerId, coinAmount, withdrawalId) {
  const coins = Math.trunc(Number(coinAmount) || 0);
  if (coins <= 0) return;
  awardSellerCoins({
    sellerId,
    amount: coins,
    kind: 'withdraw_refund',
    title: `Tanga yechish bekor (#${withdrawalId})`,
    refKind: 'withdrawal',
    refId: withdrawalId,
  });
}

export function parseCoinAmountFromWithdrawalNote(note) {
  const m = String(note || '').match(/Tanga:\s*(\d+)/i);
  if (!m) return 0;
  return Math.trunc(Number(m[1]) || 0);
}
