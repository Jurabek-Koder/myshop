import { db } from '../db/database.js';

/** Buxgalteriya (accounting) foydalanuvchilariga topbar bildirishnomasi. */
export function notifyAccountantsBell({ actorUserId, title, body, linkType, linkId }) {
  const accountants = db
    .prepare(`SELECT id FROM users WHERE lower(trim(coalesce(role,''))) = 'accounting'`)
    .all();
  const ins = db.prepare(`
    INSERT INTO user_notifications (user_id, title, body, link_type, link_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const lid = Number(linkId);
  for (const row of accountants) {
    const uid = Number(row.id);
    if (!Number.isInteger(uid) || uid === Number(actorUserId)) continue;
    try {
      ins.run(uid, title, body, linkType, Number.isInteger(lid) ? lid : null);
    } catch (e) {
      console.warn('[accountantBell] user_notifications insert', e?.message || e);
    }
  }
}
