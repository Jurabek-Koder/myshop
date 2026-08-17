import { db } from '../db/database.js';
import { denyPortalAccessForWorkRole, findUsersLinkedToWorkRole, restorePortalAccessForWorkRole } from './portalAccess.js';

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** staff_members ↔ work_roles bog‘lanishini login/email orqali yangilash */
export function linkStaffMembersToWorkRole(workRole) {
  if (!workRole?.id) return 0;
  let linked = 0;
  const users = findUsersLinkedToWorkRole(workRole);
  const portalType = String(workRole.portal_role || '').trim().toLowerCase();

  for (const user of users) {
    const staffIds = new Set();
    if (Number(user.staff_member_id) > 0) staffIds.add(Number(user.staff_member_id));

    const byUser = db
      .prepare(
        `
        SELECT id FROM staff_members
        WHERE user_id = ?
          AND (? = '' OR lower(trim(staff_type)) = lower(?))
      `,
      )
      .all(user.id, portalType, portalType);
    for (const row of byUser) staffIds.add(row.id);

    for (const staffId of staffIds) {
      db.prepare('UPDATE staff_members SET work_role_id = ? WHERE id = ?').run(workRole.id, staffId);
      linked += 1;
    }
  }
  return linked;
}

/** Mavjud rollar uchun staff_members.work_role_id ni to‘ldirish */
export function backfillStaffWorkRoleIds() {
  const roles = db.prepare('SELECT * FROM work_roles').all();
  let n = 0;
  for (const wr of roles) {
    n += linkStaffMembersToWorkRole(wr);
  }
  return n;
}

/**
 * Faol (arxivlanmagan) rol ID — operator/panel cheklarida ko‘rsatish uchun.
 * Arxivlangan rol bo‘lsa null (hisob-kitob va ko‘rinishdan chiqadi).
 */
export function getActiveStaffRoleDisplay(staffMemberId) {
  const id = Number(staffMemberId);
  if (!Number.isInteger(id) || id < 1) return null;

  const direct = db
    .prepare(
      `
    SELECT sm.full_name, wr.id AS role_id
    FROM staff_members sm
    INNER JOIN work_roles wr ON wr.id = sm.work_role_id AND wr.deleted_at IS NULL
    WHERE sm.id = ?
  `,
    )
    .get(id);
  if (direct?.role_id) {
    return { id: direct.role_id, full_name: direct.full_name };
  }

  const fallback = db
    .prepare(
      `
    SELECT sm.full_name, wr.id AS role_id
    FROM staff_members sm
    LEFT JOIN users u ON u.id = sm.user_id OR u.staff_member_id = sm.id
    INNER JOIN work_roles wr ON wr.deleted_at IS NULL
      AND lower(trim(wr.portal_role)) = lower(trim(sm.staff_type))
      AND (
        (length(trim(ifnull(wr.login,''))) > 0 AND lower(trim(wr.login)) = lower(trim(ifnull(u.login,''))))
        OR (length(trim(ifnull(wr.email,''))) > 0 AND lower(trim(wr.email)) = lower(trim(ifnull(u.email,''))))
      )
    WHERE sm.id = ?
    LIMIT 1
  `,
    )
    .get(id);

  if (fallback?.role_id) {
    db.prepare('UPDATE staff_members SET work_role_id = ? WHERE id = ?').run(fallback.role_id, id);
    return { id: fallback.role_id, full_name: fallback.full_name };
  }

  return null;
}

/** SQL: faqat arxivlanmagan work_role ga ega staff */
export function sqlStaffHasActiveWorkRole(staffAlias = 'sm') {
  return `(
    ${staffAlias}.work_role_id IS NULL
    OR EXISTS (
      SELECT 1 FROM work_roles wr_active
      WHERE wr_active.id = ${staffAlias}.work_role_id
        AND wr_active.deleted_at IS NULL
    )
  )`;
}

/**
 * Rolni arxivlash — superuser «O'chirish».
 * ID boshqa joylarda ko‘rinmaydi va hisobga olinmaydi; faqat superuser arxivida (savat) qoladi.
 */
export function archiveWorkRole(workRoleOrId) {
  const row =
    workRoleOrId && typeof workRoleOrId === 'object'
      ? workRoleOrId
      : db.prepare('SELECT * FROM work_roles WHERE id = ?').get(workRoleOrId);
  if (!row?.id) return false;
  if (row.deleted_at != null && String(row.deleted_at).trim() !== '') return true;

  denyPortalAccessForWorkRole(row);
  linkStaffMembersToWorkRole(row);

  const users = findUsersLinkedToWorkRole(row);
  for (const user of users) {
    if (Number(user.staff_member_id) > 0) {
      db.prepare(`UPDATE staff_members SET status = 'archived', work_role_id = ? WHERE id = ?`).run(
        row.id,
        user.staff_member_id,
      );
    }
    const staffRows = db
      .prepare(`SELECT id FROM staff_members WHERE user_id = ? OR id = ?`)
      .all(user.id, Number(user.staff_member_id) || -1);
    for (const s of staffRows) {
      db.prepare(`UPDATE staff_members SET status = 'archived', work_role_id = ? WHERE id = ?`).run(row.id, s.id);
    }
  }

  db.prepare(`UPDATE payroll_employees SET active = 0 WHERE work_role_id = ?`).run(row.id);

  db.prepare(
    `
    UPDATE withdrawal_requests
    SET status = 'rejected',
        note = trim(COALESCE(note, '') || ' [Rol arxivlandi]')
    WHERE work_role_id = ? AND status = 'pending'
  `,
  ).run(row.id);

  db.prepare(`UPDATE work_roles SET deleted_at = ?, status = 'blocked' WHERE id = ?`).run(nowSql(), row.id);
  return true;
}

/** Arxivdan tiklash */
export function restoreArchivedWorkRole(workRoleOrId) {
  const row =
    workRoleOrId && typeof workRoleOrId === 'object'
      ? workRoleOrId
      : db.prepare('SELECT * FROM work_roles WHERE id = ?').get(workRoleOrId);
  if (!row?.id) return false;

  db.prepare('UPDATE work_roles SET deleted_at = NULL, status = ? WHERE id = ?').run('active', row.id);
  restorePortalAccessForWorkRole(row);
  linkStaffMembersToWorkRole(row);

  const users = findUsersLinkedToWorkRole(row);
  for (const user of users) {
    if (Number(user.staff_member_id) > 0) {
      db.prepare(`UPDATE staff_members SET status = 'active', work_role_id = ? WHERE id = ?`).run(
        row.id,
        user.staff_member_id,
      );
    }
  }

  db.prepare(`UPDATE payroll_employees SET active = 1 WHERE work_role_id = ?`).run(row.id);
  return true;
}

/** Moliya tarixli rollarni butunlay o‘chirish taqiqlanadi — faqat arxivda saqlanadi */
export function workRoleHasArchiveHistory(workRoleId) {
  const id = Number(workRoleId);
  if (!Number.isInteger(id) || id < 1) return false;
  const ledger = db.prepare('SELECT 1 FROM work_role_ledger_entries WHERE work_role_id = ? LIMIT 1').get(id);
  if (ledger) return true;
  const wd = db.prepare('SELECT 1 FROM withdrawal_requests WHERE work_role_id = ? LIMIT 1').get(id);
  if (wd) return true;
  const pay = db.prepare('SELECT 1 FROM payroll_employees WHERE work_role_id = ? LIMIT 1').get(id);
  if (pay) return true;
  const orders = db
    .prepare(
      `
    SELECT 1 FROM orders o
    JOIN staff_members sm ON sm.id IN (o.courier_id, o.packer_id)
    WHERE sm.work_role_id = ?
    LIMIT 1
  `,
    )
    .get(id);
  return Boolean(orders);
}
