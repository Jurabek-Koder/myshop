import { db } from '../db/database.js';

export const notificationService = {
  notifyUser(userId, { title = '', body = '', linkType = null, linkId = null } = {}) {
    if (!userId) return null;
    try {
      const hasLink = linkType !== null || linkId !== null;
      const stmt = hasLink
        ? db.prepare('INSERT INTO user_notifications (user_id, title, body, link_type, link_id) VALUES (?, ?, ?, ?, ?)')
        : db.prepare('INSERT INTO user_notifications (user_id, title, body) VALUES (?, ?, ?)');
      const result = hasLink
        ? stmt.run(userId, String(title), String(body), linkType, linkId)
        : stmt.run(userId, String(title), String(body));
      return result.lastInsertRowid;
    } catch (e) {
      console.warn('[notificationService]', e?.message || e);
      return null;
    }
  },
};
