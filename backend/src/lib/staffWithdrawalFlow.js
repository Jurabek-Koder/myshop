import { db } from '../db/database.js';

export function listSuperuserIds() {
  const q = `
    SELECT id FROM users
    WHERE (lower(trim(coalesce(role, ''))) = 'superuser' OR CAST(role_id AS INTEGER) = 1)
  `;
  return db.prepare(q).all().map((r) => r.id);
}

export function notifyAllSuperusers(title, body, linkType = null, linkId = null) {
  const ids = listSuperuserIds();
  if (!ids.length) return;
  const ins = db.prepare(
    linkType != null && linkId != null
      ? 'INSERT INTO user_notifications (user_id, title, body, link_type, link_id) VALUES (?, ?, ?, ?, ?)'
      : 'INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)',
  );
  const tx = db.transaction(() => {
    for (const uid of ids) {
      if (linkType != null && linkId != null) ins.run(uid, title, body, linkType, Number(linkId));
      else ins.run(uid, title, body);
    }
  });
  tx();
}

/** Portal ishchi ro‘yi: portal_role → keyin login/email bilan role_name (eski yozuvlar) */
export function getWorkRoleByUserPortalRole(user, portalRoleLower) {
  const login = String(user?.login || '').trim();
  const email = String(user?.email || '').trim();
  const pr = String(portalRoleLower || '').trim().toLowerCase();
  if (!pr || (!login && !email)) return null;

  let row = db.prepare(
    `
    SELECT * FROM work_roles
    WHERE deleted_at IS NULL
      AND lower(trim(coalesce(portal_role,''))) = ?
      AND (
        (length(trim(login)) > 0 AND lower(login) = lower(?))
        OR (length(trim(coalesce(email,''))) > 0 AND lower(trim(email)) = lower(?))
      )
    LIMIT 1
  `,
  ).get(pr, login, email);
  if (row) return row;

  const fb = {
    picker: "(lower(role_name) LIKE '%picker%')",
    packer:
      "(lower(role_name) = 'packer' OR lower(role_name) LIKE '%packer%' OR lower(role_name) LIKE '%qadoq%')",
    courier: "(lower(role_name) LIKE '%kuryer%' OR lower(role_name) LIKE '%courier%')",
    operator: "(lower(role_name) LIKE '%operator%')",
    expeditor: "(lower(role_name) LIKE '%ekspeditor%' OR lower(role_name) LIKE '%expeditor%')",
    order_receiver: "(lower(role_name) LIKE '%qabul%')",
  }[pr];
  if (!fb) return null;
  row = db
    .prepare(
      `
    SELECT * FROM work_roles
    WHERE deleted_at IS NULL AND ${fb}
      AND (
        (length(trim(login)) > 0 AND lower(login) = lower(?))
        OR (length(trim(coalesce(email,''))) > 0 AND lower(trim(email)) = lower(?))
      )
    LIMIT 1
  `,
    )
    .get(login, email);
  return row || null;
}

export function createPendingWithdrawalForWorkRole({ workRoleRow, amount, payoutMethod }) {
  const amt = Number(amount);
  const pmRaw = String(payoutMethod || 'cash').trim().toLowerCase();
  const payout = pmRaw === 'card' ? 'card' : 'cash';
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('INVALID_AMOUNT');
  const balance = Number(workRoleRow.total_amount) || 0;
  if (amt > balance) throw new Error('INSUFFICIENT_BALANCE');
  const result = db
    .prepare(
      `
    INSERT INTO withdrawal_requests (work_role_id, seller_id, amount, status, payout_method)
    VALUES (?, NULL, ?, 'pending', ?)
  `,
    )
    .run(workRoleRow.id, amt, payout);
  const wrId = result.lastInsertRowid;
  const title = "Pul yechish so'rovi";
  const label = workRoleRow.role_name || workRoleRow.login || 'Ishchi rol';
  const methodUz = payout === 'card' ? 'karta' : 'naqd';
  const body = `${label}: ${amt.toLocaleString('uz-UZ')} so'm (${methodUz})`;
  notifyAllSuperusers(title, body, 'withdrawal', wrId);
  return { ok: true, message: `So'rov superuserga yuborildi.`, id: wrId };
}

export function createPendingWithdrawalForSeller({ sellerRow, amount, payoutMethod }) {
  const amt = Number(amount);
  const pmRaw = String(payoutMethod || 'cash').trim().toLowerCase();
  const payout = pmRaw === 'card' ? 'card' : 'cash';
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('INVALID_AMOUNT');
  const balance = Number(sellerRow.balance) || 0;
  if (amt > balance) throw new Error('INSUFFICIENT_BALANCE');
  const result = db
    .prepare(
      `
    INSERT INTO withdrawal_requests (work_role_id, seller_id, amount, status, payout_method)
    VALUES (NULL, ?, ?, 'pending', ?)
  `,
    )
    .run(sellerRow.id, amt, payout);
  const wrId = result.lastInsertRowid;
  const title = 'Seller: pul yechish';
  const methodUz = payout === 'card' ? 'karta' : 'naqd';
  const body = `${sellerRow.name || 'Seller'} (#${sellerRow.id}): ${amt.toLocaleString('uz-UZ')} so'm (${methodUz})`;
  notifyAllSuperusers(title, body, 'withdrawal', wrId);
  return { ok: true, message: `So'rov superuserga yuborildi.`, id: wrId };
}
