import { db } from '../db/database.js';
import { notifyFinanceApprovers } from './staffWithdrawalFlow.js';

export function resolveWithdrawalWorkerUserId(workRole, sellerRow) {
  if (workRole && workRole.login) {
    const byLogin = db
      .prepare("SELECT id FROM users WHERE length(trim(ifnull(login, ''))) > 0 AND lower(login) = lower(?)")
      .get(workRole.login);
    if (byLogin) return byLogin.id;
  }
  if (workRole?.email && String(workRole.email).trim()) {
    const byEmail = db
      .prepare("SELECT id FROM users WHERE length(trim(ifnull(email, ''))) > 0 AND lower(email) = lower(?)")
      .get(workRole.email);
    if (byEmail) return byEmail.id;
  }
  if (sellerRow?.user_id) return sellerRow.user_id;
  return null;
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function applyWithdrawalReview({ reviewerUserId, withdrawalId, status, note }) {
  const id = withdrawalId;
  const st = String(status || '').trim().toLowerCase();
  const noteTrim = String(note || '').trim();
  if (!Number.isFinite(id) || id < 1) return { ok: false, status: 400, error: "Noto'g'ri ID." };
  if (st !== 'approved' && st !== 'rejected')
    return { ok: false, status: 400, error: "status: approved yoki rejected bo'lishi kerak." };

  const row = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ? AND status = ?').get(id, 'pending');
  if (!row) return { ok: false, status: 404, error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan." };

  const workRole = row.work_role_id ? db.prepare('SELECT * FROM work_roles WHERE id = ?').get(row.work_role_id) : null;
  const sellerRow = row.seller_id ? db.prepare('SELECT * FROM sellers WHERE id = ?').get(row.seller_id) : null;
  if (!workRole && !sellerRow) return { ok: false, status: 404, error: "Bog'lanish topilmadi." };

  db.prepare(`
    UPDATE withdrawal_requests SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?, note = ?, paid_out_at = NULL, paid_out_by = NULL WHERE id = ?
  `).run(st, reviewerUserId, noteTrim || null, id);

  const notifyUserId = resolveWithdrawalWorkerUserId(workRole, sellerRow);

  const amountStr = `${Number(row.amount).toLocaleString('uz-UZ')} so'm`;
  const payerLabel =
    sellerRow?.name ? `Seller: ${sellerRow.name}` : workRole ? (workRole.role_name || workRole.login || 'Ishchi rol') : '';

  if (st === 'approved') {
    if (workRole) {
      const newTotal = Math.max(0, (Number(workRole.total_amount) || 0) - Number(row.amount));
      db.prepare('UPDATE work_roles SET total_amount = ? WHERE id = ?').run(newTotal, workRole.id);
    } else if (sellerRow) {
      const newBal = Math.max(0, (Number(sellerRow.balance) || 0) - Number(row.amount));
      db.prepare('UPDATE sellers SET balance = ? WHERE id = ?').run(newBal, sellerRow.id);
    }
    if (notifyUserId) {
      db.prepare('INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)').run(
        notifyUserId,
        'Pul yechish tasdiqlandi',
        noteTrim || `So'rovingiz superuser tomonidan tasdiqlandi. ${amountStr}. Buxgalteriya pul berishini yozib oladi.`,
      );
    } else if (sellerRow?.id) {
      db.prepare(`
        INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
        VALUES (?, ?, ?, 'success', 'finance', 0)
      `).run(
        sellerRow.id,
        'Pul yechish tasdiqlandi',
        noteTrim ||
          `So'rovingiz tasdiqlandi. ${amountStr}. Buxgalteriya pul berilguncha kuting.`,
      );
    }
    notifyFinanceApprovers(
      `Buxgalteriya: to'lov kutmoqda (#${id})`,
      `${payerLabel || 'Nominal'} · ${amountStr}. «Pul berildi» tugmasini bosing.`,
      'withdrawal_payout',
      id,
    );
  }
  if (st === 'rejected') {
    if (notifyUserId) {
      const title = 'Pul yechish rad etildi';
      const body = noteTrim || "So'rovingiz rad etildi.";
      db.prepare('INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)').run(notifyUserId, title, body);
    } else if (sellerRow?.id) {
      db.prepare(`
        INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
        VALUES (?, ?, ?, 'danger', 'finance', 0)
      `).run(sellerRow.id, 'Pul yechish rad etildi', noteTrim || "So'rovingiz rad etildi.");
    }
  }
  return { ok: true };
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function applyWithdrawalMarkPaid({ payerUserId, withdrawalId }) {
  const id = withdrawalId;
  if (!Number.isFinite(id) || id < 1) return { ok: false, status: 400, error: "Noto'g'ri ID." };
  const row = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(id);
  if (!row) return { ok: false, status: 404, error: "So'rov topilmadi." };
  if (String(row.status) !== 'approved')
    return { ok: false, status: 400, error: "Faqat tasdiqlangan so'rov uchun." };
  if (row.paid_out_at != null && String(row.paid_out_at).trim() !== '')
    return { ok: false, status: 400, error: 'Pul berilgani allaqachon qayd etilgan.' };

  db.prepare(`
    UPDATE withdrawal_requests SET paid_out_at = datetime('now'), paid_out_by = ? WHERE id = ?
  `).run(payerUserId, id);

  const workRole = row.work_role_id ? db.prepare('SELECT * FROM work_roles WHERE id = ?').get(row.work_role_id) : null;
  const sellerRow = row.seller_id ? db.prepare('SELECT * FROM sellers WHERE id = ?').get(row.seller_id) : null;
  const label =
    sellerRow?.name ? `Seller ${sellerRow.name}` : workRole ? (workRole.role_name || workRole.login) : `#${id}`;

  notifyFinanceApprovers(
    `To'lov bajarildi (#${id})`,
    `${label}: ${Number(row.amount).toLocaleString('uz-UZ')} so'm — buxgalteriya tasdiqladi.`,
  );

  const uid = resolveWithdrawalWorkerUserId(workRole, sellerRow);
  if (uid) {
    db.prepare('INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)').run(
      uid,
      'Pul chiqarildi',
      `Siz so'ragan ${Number(row.amount).toLocaleString('uz-UZ')} so'm buxgalteriya tomonidan berilgani qayd etildi.`,
    );
  } else if (sellerRow?.id) {
    db.prepare(`
      INSERT INTO seller_notifications (seller_id, title, message, type, link_view, is_read)
      VALUES (?, ?, ?, 'success', 'finance', 0)
    `).run(
      sellerRow.id,
      'Pul chiqarildi',
      `So'ragan ${Number(row.amount).toLocaleString('uz-UZ')} so'm berilgani qayd etildi.`,
    );
  }

  return { ok: true };
}
