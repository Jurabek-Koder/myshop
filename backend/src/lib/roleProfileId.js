import { db } from '../db/database.js';

/** Har bir sklad roli — `staff_members` dagi alohida, o‘zgarmas ID */
export const STAFF_ROLE_TO_TYPE = {
  courier: 'courier',
  operator: 'operator',
  picker: 'picker',
  packer: 'packer',
  expeditor: 'expeditor',
  order_receiver: 'order_receiver',
  warehouse_admin: 'warehouse_admin',
};

/**
 * Joriy login roli uchun doimiy profil ID:
 * - seller → sellers.id
 * - sklad rollari → staff_members.id (staff_type bo‘yicha)
 * - customer / admin / accounting → null
 */
export function resolveRoleProfileId(userRow) {
  if (!userRow?.id) return null;
  const role = String(userRow.role || '').toLowerCase().trim();

  if (role === 'seller') {
    const sid = Number(userRow.seller_id);
    if (Number.isInteger(sid) && sid > 0) {
      const seller = db.prepare('SELECT id FROM sellers WHERE id = ?').get(sid);
      if (seller) return seller.id;
    }
    const byUser = db.prepare('SELECT id FROM sellers WHERE user_id = ? ORDER BY id ASC LIMIT 1').get(userRow.id);
    return byUser?.id ?? null;
  }

  const staffType = STAFF_ROLE_TO_TYPE[role];
  if (!staffType) return null;

  const byUserType = db
    .prepare(
      `
    SELECT id FROM staff_members
    WHERE user_id = ? AND lower(trim(staff_type)) = lower(?)
    ORDER BY id ASC
    LIMIT 1
  `,
    )
    .get(userRow.id, staffType);
  if (byUserType?.id) return byUserType.id;

  const linkedId = Number(userRow.staff_member_id);
  if (Number.isInteger(linkedId) && linkedId > 0) {
    const linked = db.prepare('SELECT id, staff_type FROM staff_members WHERE id = ?').get(linkedId);
    if (linked && String(linked.staff_type || '').toLowerCase().trim() === staffType) {
      return linked.id;
    }
  }

  return null;
}

export function resolveRoleProfileKind(userRow) {
  const role = String(userRow?.role || '').toLowerCase().trim();
  if (role === 'seller') return 'seller';
  if (STAFF_ROLE_TO_TYPE[role]) return 'staff';
  return null;
}

export function enrichUserWithRoleProfile(userRow) {
  if (!userRow) return userRow;
  const role_profile_id = resolveRoleProfileId(userRow);
  const role_profile_kind = role_profile_id != null ? resolveRoleProfileKind(userRow) : null;
  return { ...userRow, role_profile_id, role_profile_kind };
}

/** Mavjud xodimlar uchun staff_members profili (operator va boshqalar) */
export function backfillStaffRoleProfiles() {
  for (const staffType of Object.values(STAFF_ROLE_TO_TYPE)) {
    const users = db
      .prepare(`SELECT id, full_name, phone FROM users WHERE lower(trim(role)) = lower(?)`)
      .all(staffType);
    for (const u of users) {
      let staff = db
        .prepare(
          `SELECT id FROM staff_members WHERE user_id = ? AND lower(trim(staff_type)) = lower(?) LIMIT 1`,
        )
        .get(u.id, staffType);
      if (!staff) {
        const ins = db
          .prepare(
            `INSERT INTO staff_members (staff_type, full_name, phone, status) VALUES (?, ?, ?, 'active')`,
          )
          .run(staffType, String(u.full_name || staffType).trim() || staffType, u.phone || null);
        staff = { id: ins.lastInsertRowid };
      } else {
        db.prepare(`UPDATE staff_members SET user_id = ? WHERE id = ?`).run(u.id, staff.id);
      }
    }
  }
}
