import { db } from '../db/database.js';

/**
 * Rol-asosidagi guruh chatlari uchun umumiy mantiq.
 *
 * A'zolik ikki manbadan keladi:
 *  - "auto"    — foydalanuvchining `users.role` (yoki seller uchun seller_id) qiymati
 *                guruhning `chat_group_roles` jadvalidagi biror rolga mos kelsa.
 *  - "invited" — superuser yoki guruh admini (shu jumladan ombor admini) tomonidan
 *                qo'lda qo'shilgan, rolidan qat'iy nazar.
 *
 * Har bir so'rovda (yengil) SYNC ishlaydi: rolga endi mos kelmay qolgan "auto"
 * a'zolar guruhdan avtomatik chiqariladi (masalan xodim ishdan bo'shatilsa yoki
 * roli o'zgartirilsa); "invited" a'zolar bunga ta'sirlanmaydi.
 *
 * Superuser — HAR DOIM barcha guruhlarga to'liq huquqqa ega (formal a'zo bo'lmasa ham).
 * Ombor admini (`warehouse_admin`) — HAR DOIM barcha guruhlarda ADMIN (a'zolarni
 * qo'shish/chiqarish, admin tayinlash) — buni ham formal a'zolikdan mustaqil tekshiramiz,
 * shu bilan birga standart guruhlar uchun seed orqali haqiqiy a'zo qatori ham beriladi.
 */

export function isSuperuser(user) {
  return String(user?.role || '').trim().toLowerCase() === 'superuser' || Number(user?.role_id) === 1;
}

export function isWarehouseAdmin(user) {
  return String(user?.role || '').trim().toLowerCase() === 'warehouse_admin';
}

/** Foydalanuvchining qaysi rol-kalitlariga mos kelishi mumkinligi (seller_id fallback bilan). */
function userRoleKeys(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  const keys = new Set();
  if (role) keys.add(role);
  if (Number(user?.seller_id) > 0) keys.add('seller');
  return keys;
}

function userIsActive(userRow) {
  const status = String(userRow?.status || 'active').trim().toLowerCase();
  return status === 'active' || status === '';
}

/**
 * Bitta guruh uchun avtomatik a'zolikni joriy holatga moslashtiradi:
 *  - Rol mos keladigan, hali qo'shilmagan foydalanuvchilarni qo'shadi (source='auto').
 *  - Avval "auto" bo'lgan, endi rol mos kelmay qolgan a'zolarni o'chiradi.
 *  - "invited" (qo'lda qo'shilgan) qatorlarga tegmaydi.
 */
export function syncGroupAutoMembership(groupId) {
  const roleRows = db.prepare('SELECT role, member_role FROM chat_group_roles WHERE group_id = ?').all(groupId);
  if (roleRows.length === 0) return;

  const byRole = new Map(roleRows.map((r) => [r.role, r.member_role]));
  const roles = [...byRole.keys()];

  const placeholders = roles.map(() => '?').join(',');
  const eligibleUsers = db
    .prepare(
      `SELECT id, role, seller_id, status FROM users
       WHERE (lower(trim(coalesce(role,''))) IN (${placeholders})
              OR (IFNULL(seller_id,0) != 0 AND ? IN (${placeholders})))`,
    )
    .all(...roles, 'seller', ...roles)
    .filter(userIsActive);

  const eligibleIds = new Set();
  for (const u of eligibleUsers) {
    eligibleIds.add(u.id);
  }

  const upsert = db.prepare(
    `INSERT INTO chat_group_members (group_id, user_id, member_role, source, added_by, joined_at)
     VALUES (?, ?, ?, 'auto', NULL, datetime('now'))
     ON CONFLICT(group_id, user_id) DO NOTHING`,
  );
  const tx = db.transaction(() => {
    for (const u of eligibleUsers) {
      const roleKey = String(u.role || '').trim().toLowerCase();
      const memberRole = byRole.get(roleKey) || byRole.get('seller') || 'member';
      upsert.run(groupId, u.id, memberRole);
    }
    // Avval "auto" bo'lgan, endi mos kelmay qolganlarni chiqaramiz.
    const currentAuto = db
      .prepare(`SELECT user_id FROM chat_group_members WHERE group_id = ? AND source = 'auto'`)
      .all(groupId);
    const del = db.prepare(`DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?`);
    for (const row of currentAuto) {
      if (!eligibleIds.has(row.user_id)) del.run(groupId, row.user_id);
    }
  });
  tx();
}

export function syncAllGroupsAutoMembership() {
  const ids = db.prepare('SELECT id FROM chat_groups WHERE archived_at IS NULL').all();
  for (const { id } of ids) {
    try {
      syncGroupAutoMembership(id);
    } catch (e) {
      console.warn('[chatGroups] sync fail for group', id, e?.message || e);
    }
  }
}

export function getGroupBySlugOrId(idOrSlug) {
  const asNum = Number.parseInt(String(idOrSlug), 10);
  if (Number.isInteger(asNum) && String(asNum) === String(idOrSlug).trim()) {
    return db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(asNum);
  }
  return db.prepare('SELECT * FROM chat_groups WHERE slug = ?').get(String(idOrSlug).trim());
}

/** Foydalanuvchi shu guruhning (formal) a'zosi bo'lishini ta'minlaydi — superuser/ombor admin har doim ruxsat etilgan. */
export function canAccessGroup(group, user) {
  if (!group) return false;
  if (isSuperuser(user)) return true;
  if (isWarehouseAdmin(user)) return true;
  syncGroupAutoMembership(group.id);
  const row = db
    .prepare('SELECT 1 FROM chat_group_members WHERE group_id = ? AND user_id = ?')
    .get(group.id, user.id);
  return Boolean(row);
}

/** Guruhni BOSHQARISH huquqi (a'zo qo'shish/chiqarish, admin tayinlash) — superuser/ombor admin/guruh admini. */
export function canManageGroup(group, user) {
  if (!group) return false;
  if (isSuperuser(user)) return true;
  if (isWarehouseAdmin(user)) return true;
  syncGroupAutoMembership(group.id);
  const row = db
    .prepare(`SELECT member_role FROM chat_group_members WHERE group_id = ? AND user_id = ?`)
    .get(group.id, user.id);
  return row?.member_role === 'admin';
}

/** Joriy foydalanuvchi ko'rishi mumkin bo'lgan guruhlar ro'yxati (superuser/ombor admin — barchasi). */
export function listGroupsForUser(user) {
  const groups = db.prepare('SELECT * FROM chat_groups WHERE archived_at IS NULL ORDER BY kind DESC, id ASC').all();
  if (isSuperuser(user) || isWarehouseAdmin(user)) {
    return groups.map((g) => ({ ...g, my_member_role: isWarehouseAdmin(user) ? 'admin' : 'admin' }));
  }
  const keys = userRoleKeys(user);
  const out = [];
  for (const g of groups) {
    // Faqat mos rol-guruhlarni (yoki avval qo'lda qo'shilganini) sinxronlab tekshiramiz.
    const roleRows = db.prepare('SELECT role FROM chat_group_roles WHERE group_id = ?').all(g.id);
    const hasRoleMatch = roleRows.some((r) => keys.has(r.role));
    if (hasRoleMatch) syncGroupAutoMembership(g.id);
    const mem = db
      .prepare('SELECT member_role FROM chat_group_members WHERE group_id = ? AND user_id = ?')
      .get(g.id, user.id);
    if (mem) out.push({ ...g, my_member_role: mem.member_role });
  }
  return out;
}

const ROLE_LABELS = {
  courier: 'Kuryer',
  seller: 'Seller',
  operator: 'Operator',
  target: 'Targetolog',
  picker: 'Picker',
  packer: 'Packer',
  expeditor: 'Ekspeditor',
  order_receiver: 'Qabul qiluvchi',
  warehouse_admin: 'Ombor admin',
  superuser: 'Superuser',
  accounting: 'Buxgalteriya',
  customer: 'Mijoz',
};

export function roleLabel(role) {
  return ROLE_LABELS[String(role || '').trim().toLowerCase()] || role || '';
}

export function listGroupMembers(groupId) {
  syncGroupAutoMembership(groupId);
  const rows = db
    .prepare(
      `SELECT m.user_id, m.member_role, m.source, m.joined_at,
              u.full_name, u.login, u.email, u.phone, u.role AS user_role
       FROM chat_group_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY (m.member_role = 'admin') DESC,
                COALESCE(NULLIF(TRIM(u.full_name), ''), u.login) COLLATE NOCASE ASC`,
    )
    .all(groupId);
  return rows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name || '',
    login: r.login || '',
    email: r.email || '',
    phone: r.phone || '',
    role: r.user_role,
    role_label: roleLabel(r.user_role),
    member_role: r.member_role,
    source: r.source,
    joined_at: r.joined_at,
  }));
}

export const CHAT_GROUP_ASSIGNABLE_ROLES = [
  'courier',
  'seller',
  'operator',
  'target',
  'picker',
  'packer',
  'expeditor',
  'order_receiver',
  'warehouse_admin',
  'superuser',
];

/** Guruhga hali a'zo bo'lmagan xodimlarni (ixtiyoriy rol filtri bilan) ro'yxatlaydi — taklif qilish uchun. */
export function listInviteCandidates(groupId, roleFilter) {
  const already = new Set(
    db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId).map((r) => r.user_id),
  );
  const roleLc = String(roleFilter || '').trim().toLowerCase();
  let rows;
  if (roleLc && CHAT_GROUP_ASSIGNABLE_ROLES.includes(roleLc)) {
    rows = db
      .prepare(
        `SELECT id, full_name, login, email, phone, role FROM users
         WHERE lower(trim(coalesce(role,''))) = ? AND lower(trim(coalesce(status,'active'))) = 'active'
         ORDER BY COALESCE(NULLIF(TRIM(full_name), ''), login) COLLATE NOCASE ASC`,
      )
      .all(roleLc);
  } else {
    rows = db
      .prepare(
        `SELECT id, full_name, login, email, phone, role FROM users
         WHERE lower(trim(coalesce(status,'active'))) = 'active'
           AND lower(trim(coalesce(role,''))) NOT IN ('customer','')
         ORDER BY COALESCE(NULLIF(TRIM(full_name), ''), login) COLLATE NOCASE ASC`,
      )
      .all();
  }
  return rows
    .filter((r) => !already.has(r.id))
    .map((r) => ({
      id: r.id,
      full_name: r.full_name || '',
      login: r.login || '',
      email: r.email || '',
      phone: r.phone || '',
      role: r.role,
      role_label: roleLabel(r.role),
    }));
}
