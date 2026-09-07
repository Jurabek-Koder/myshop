import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import { dmThreadKeyFor } from '../lib/staffSkladLichka.js';
import { listGroupsForUser, syncGroupAutoMembership } from '../services/chatGroupsService.js';

/**
 * BUTUN ilova bo'ylab bitta joyda: "Barchasi/Shaxsiy/Guruhlar/Yangi" ro'yxatida
 * HALI OCHILMAGAN suhbatlar uchun ham to'g'ri "o'qilmagan xabar" belgisini
 * chiqarish uchun kerak bo'lgan MA'LUMOT (avval bu faqat joriy sessiyada
 * ochilgan suhbat uchun ishlardi, chunki xabarlar faqat o'sha payt yuklanardi).
 *
 * Uchta manba birlashtiriladi:
 *  - staff_direct_messages (shaxsiy 1:1 — thread_key 'dm:a-b')
 *  - chat_group_messages (guruh chatlari)
 *  - staff_chat_archive (umumiy "MyShop" jamoa xonasi — teamRoom bo'yicha)
 */
const router = Router();
router.use(authRequired);

function displayName(u) {
  if (!u) return '';
  return String(u?.full_name || u?.login || `#${u?.id}`).trim();
}

router.get('/unread-summary', (req, res) => {
  try {
    const selfId = req.user.id;
    const teamRoomRaw = String(req.query.teamRoom || 'operators').trim();
    const teamRoom = ['sklad', 'operators', 'target'].includes(teamRoomRaw) ? teamRoomRaw : 'operators';

    const readRows = db.prepare('SELECT thread_key, last_read_message_id FROM chat_read_state WHERE user_id = ?').all(selfId);
    const readMap = new Map(readRows.map((r) => [r.thread_key, r.last_read_message_id]));

    const items = {};

    // ---------- 1) Shaxsiy (DM) suhbatlar ----------
    const dmThreadRows = db
      .prepare(
        `SELECT DISTINCT thread_key FROM staff_direct_messages
         WHERE thread_key LIKE 'dm:%' AND (thread_key LIKE ? OR thread_key LIKE ?)`,
      )
      .all(`dm:${selfId}-%`, `%-${selfId}`);
    const lastMsgStmt = db.prepare(
      `SELECT id, sender_user_id, message_type, body, created_at
       FROM staff_direct_messages WHERE thread_key = ? ORDER BY id DESC LIMIT 1`,
    );
    const userStmt = db.prepare('SELECT id, full_name, login FROM users WHERE id = ?');
    for (const row of dmThreadRows) {
      const m = /^dm:(\d+)-(\d+)$/.exec(row.thread_key);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      const peerId = a === selfId ? b : a;
      const last = lastMsgStmt.get(row.thread_key);
      if (!last) continue;
      const lastReadId = readMap.get(row.thread_key) || 0;
      const unread = last.id > lastReadId && Number(last.sender_user_id) !== selfId;
      items[String(peerId)] = {
        lastMessageId: last.id,
        lastAt: last.created_at,
        unread,
        preview: last.message_type === 'text' ? String(last.body || '').slice(0, 140) : `[${last.message_type}]`,
        senderName: displayName(userStmt.get(last.sender_user_id)),
      };
    }

    // ---------- 2) Guruh chatlari ----------
    const groups = listGroupsForUser(req.user);
    const lastGroupMsgStmt = db.prepare(
      `SELECT id, sender_user_id, message_type, body, created_at
       FROM chat_group_messages WHERE group_id = ? ORDER BY id DESC LIMIT 1`,
    );
    for (const g of groups) {
      const key = `group:${g.id}`;
      const last = lastGroupMsgStmt.get(g.id);
      if (!last) continue;
      const lastReadId = readMap.get(key) || 0;
      const unread = last.id > lastReadId && Number(last.sender_user_id) !== selfId;
      items[key] = {
        lastMessageId: last.id,
        lastAt: last.created_at,
        unread,
        preview: last.message_type === 'text' ? String(last.body || '').slice(0, 140) : `[${last.message_type}]`,
        senderName: displayName(userStmt.get(last.sender_user_id)),
      };
    }

    // ---------- 3) MyShop jamoa xonasi ----------
    const lastArchiveRow = db
      .prepare(
        `SELECT id, sender_user_id, is_from_staff, message_type, body, created_at
         FROM staff_chat_archive WHERE chat_room = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(teamRoom);
    if (lastArchiveRow) {
      const lastReadId = readMap.get('myshop') || 0;
      const isMine = Number(lastArchiveRow.sender_user_id) === selfId;
      const unread = lastArchiveRow.id > lastReadId && !isMine;
      items.myshop = {
        lastMessageId: lastArchiveRow.id,
        lastAt: lastArchiveRow.created_at,
        unread,
        preview:
          lastArchiveRow.message_type === 'text' ? String(lastArchiveRow.body || '').slice(0, 140) : `[${lastArchiveRow.message_type}]`,
        senderName: lastArchiveRow.sender_user_id ? displayName(userStmt.get(lastArchiveRow.sender_user_id)) : 'MyShop',
      };
    }

    res.json({ items });
  } catch (e) {
    console.error('chat/unread-summary', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

router.post('/mark-read', (req, res) => {
  try {
    const selfId = req.user.id;
    let { threadKey, peerId, groupId, messageId } = req.body || {};

    if (!threadKey) {
      if (groupId != null) threadKey = `group:${Number(groupId)}`;
      else if (peerId === 'myshop') threadKey = 'myshop';
      else if (peerId != null) threadKey = dmThreadKeyFor(selfId, peerId);
    }
    if (!threadKey) return res.status(400).json({ error: 'thread aniqlanmadi.' });

    let lastId = Number(messageId) || 0;
    if (!lastId) {
      // messageId berilmasa — shu threadning eng oxirgi xabarini o'qilgan deb belgilaymiz.
      if (threadKey === 'myshop') {
        const teamRoomRaw = String(req.body?.teamRoom || 'operators').trim();
        const teamRoom = ['sklad', 'operators', 'target'].includes(teamRoomRaw) ? teamRoomRaw : 'operators';
        const row = db
          .prepare('SELECT id FROM staff_chat_archive WHERE chat_room = ? ORDER BY id DESC LIMIT 1')
          .get(teamRoom);
        lastId = row?.id || 0;
      } else if (threadKey.startsWith('group:')) {
        const gid = Number(threadKey.slice('group:'.length));
        syncGroupAutoMembership(gid);
        const row = db.prepare('SELECT id FROM chat_group_messages WHERE group_id = ? ORDER BY id DESC LIMIT 1').get(gid);
        lastId = row?.id || 0;
      } else if (threadKey.startsWith('dm:')) {
        const row = db.prepare('SELECT id FROM staff_direct_messages WHERE thread_key = ? ORDER BY id DESC LIMIT 1').get(threadKey);
        lastId = row?.id || 0;
      }
    }
    if (!lastId) return res.json({ ok: true, skipped: true });

    db.prepare(
      `INSERT INTO chat_read_state (user_id, thread_key, last_read_message_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, thread_key) DO UPDATE SET
         last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id),
         updated_at = excluded.updated_at`,
    ).run(selfId, threadKey, lastId);

    res.json({ ok: true });
  } catch (e) {
    console.error('chat/mark-read', e);
    res.status(500).json({ error: 'Belgilanmadi.' });
  }
});

export default router;
