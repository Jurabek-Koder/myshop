import { db } from '../db/database.js';

/** Bloklangan / o‘chirilgan / noto‘g‘ri login — bir xil xabar (xavfsizlik uchun). */
export const LOGIN_ACCESS_DENIED_MESSAGE =
  "Kechirasiz, bunday foydalanuvchi mavjud emas. Iltimos, ma'lumotlaringizni tekshiring va qaytadan urinib ko'ring.";

export function isSuperuserUserRow(user) {
  if (!user) return false;
  if (Number(user.role_id) === 1) return true;
  return String(user.role || '').trim().toLowerCase() === 'superuser';
}

export function isUserLoginAllowed(user) {
  if (!user?.id) return false;
  if (isSuperuserUserRow(user)) return true;
  const status = String(user.status || 'active').trim().toLowerCase();
  return status === 'active' || status === '';
}

/** `work_roles` bilan bog‘langan portal `users` qatorlari */
export function findUsersLinkedToWorkRole(workRole) {
  const login = String(workRole?.login || '').trim().toLowerCase();
  const email = String(workRole?.email || '').trim().toLowerCase();
  const phone = String(workRole?.phone || '').trim();
  const portalRole = String(workRole?.portal_role || '').trim().toLowerCase();

  const emailCandidates = new Set();
  if (email) emailCandidates.add(email);
  if (login) {
    emailCandidates.add(`${login}@courier.myshop.local`);
    if (portalRole) emailCandidates.add(`${login}@${portalRole}.myshop.local`);
    if (!email) emailCandidates.add(`${login}@seller.local`);
  }

  const emails = [...emailCandidates].filter(Boolean);
  const emailClause = emails.length
    ? ` OR lower(trim(email)) IN (${emails.map(() => 'lower(?)').join(', ')})`
    : '';
  const emailParams = emails;

  return db
    .prepare(
      `
    SELECT DISTINCT id, role, role_id, status, staff_member_id
    FROM users
    WHERE (? != '' AND lower(trim(ifnull(login, ''))) = lower(?))
       OR (? != '' AND lower(trim(email)) = lower(?))
       OR (? != '' AND trim(ifnull(phone, '')) = ?)
       ${emailClause}
  `,
    )
    .all(login, login, email, email, phone, phone, ...emailParams);
}

export function setPortalAccessForWorkRole(workRole, allowed) {
  const nextStatus = allowed ? 'active' : 'blocked';
  const linked = findUsersLinkedToWorkRole(workRole);
  let updated = 0;

  for (const user of linked) {
    if (isSuperuserUserRow(user)) continue;
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(nextStatus, user.id);
    updated += 1;

    if (Number(user.staff_member_id) > 0) {
      db.prepare('UPDATE staff_members SET status = ? WHERE id = ?').run(
        allowed ? 'active' : 'blocked',
        user.staff_member_id,
      );
    }
  }

  const sellerEmail = String(workRole?.email || resolveSellerEmailFromWorkRole(workRole) || '')
    .trim()
    .toLowerCase();
  if (sellerEmail) {
    db.prepare('UPDATE sellers SET status = ? WHERE lower(email) = lower(?)').run(
      allowed ? 'active' : 'blocked',
      sellerEmail,
    );
  }

  return updated;
}

function resolveSellerEmailFromWorkRole(workRole) {
  const rawEmail = String(workRole?.email || '').trim().toLowerCase();
  if (rawEmail) return rawEmail;
  const rawLogin = String(workRole?.login || '').trim().toLowerCase();
  if (!rawLogin) return '';
  if (rawLogin.includes('@')) return rawLogin;
  return `${rawLogin}@seller.local`;
}

export function denyPortalAccessForWorkRole(workRole) {
  return setPortalAccessForWorkRole(workRole, false);
}

export function restorePortalAccessForWorkRole(workRole) {
  return setPortalAccessForWorkRole(workRole, true);
}
