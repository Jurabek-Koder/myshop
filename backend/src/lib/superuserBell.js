import { db } from '../db/database.js';

/**
 * Superuser (yoki role_id = 1) foydalanuvchilarga topbar bildirishnomasi.
 */
export function notifySuperusersBell({ actorUserId, title, body, linkType, linkId }) {
  const supers = db
    .prepare(`SELECT id FROM users WHERE (lower(trim(coalesce(role,''))) = 'superuser' OR role_id = 1)`)
    .all();
  const ins = db.prepare(`
    INSERT INTO user_notifications (user_id, title, body, link_type, link_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const lid = Number(linkId);
  for (const row of supers) {
    const uid = Number(row.id);
    if (!Number.isInteger(uid) || uid === Number(actorUserId)) continue;
    try {
      ins.run(uid, title, body, linkType, Number.isInteger(lid) ? lid : null);
    } catch (e) {
      console.warn('[superuserBell] user_notifications insert', e?.message || e);
    }
  }
}
