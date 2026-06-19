/**
 * Target panel MyChat — faqat `role = target` foydalanuvchilari o‘rtasida DM va jamoa xonasi.
 */
import { db } from '../db/database.js';
import {
  archiveRowToPickerTeamMessage,
  dmRowToPickerMessage,
  dmThreadKeyFor,
  fetchSkladArchiveRows,
  getDmCallLogs,
  getDmStories,
  insertStaffChatArchiveRow,
  postDmCallLog,
  sanitizeChatPayload,
} from './staffSkladLichka.js';

export const TARGET_CHAT_ROOM = 'target';

function isTargetRoleUser(userId) {
  const row = db
    .prepare(
      `SELECT id FROM users WHERE id = ? AND lower(trim(COALESCE(role, ''))) = 'target'`,
    )
    .get(userId);
  return Boolean(row);
}

function assertTargetPeer(peerId) {
  return isTargetRoleUser(peerId);
}

export function getTargetPeers(req, res) {
  try {
    if (!isTargetRoleUser(req.user.id)) {
      return res.status(403).json({ error: 'Faqat target foydalanuvchilari uchun.' });
    }
    const selfId = req.user.id;
    const rows = db
      .prepare(
        `
      SELECT u.id, u.full_name, u.login, u.email, u.phone
      FROM users u
      WHERE u.id != ? AND lower(trim(COALESCE(u.role, ''))) = 'target'
      ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.login, CAST(u.id AS TEXT)) COLLATE NOCASE
    `,
      )
      .all(selfId);

    res.json({
      peers: rows.map((row) => ({
        id: row.id,
        full_name: String(row.full_name || '').trim(),
        login: String(row.login || '').trim(),
        email: String(row.email || '').trim(),
        phone: String(row.phone || '').trim(),
        role_label: 'Target',
      })),
    });
  } catch (e) {
    console.error('target chat/peers', e);
    res.status(500).json({ error: "Ro'yxat yuklanmadi." });
  }
}

export function getTargetDmMessages(req, res) {
  try {
    if (!isTargetRoleUser(req.user.id)) {
      return res.status(403).json({ error: 'Faqat target foydalanuvchilari uchun.' });
    }
    const selfId = req.user.id;
    const peerRaw = req.query.peerId != null ? String(req.query.peerId) : '';
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

    if (String(peerRaw) === 'myshop') {
      const rows = fetchSkladArchiveRows(limit, TARGET_CHAT_ROOM);
      const messages = rows.reverse().map((row) => archiveRowToPickerTeamMessage(row, selfId));
      return res.json({ messages, threadKey: TARGET_CHAT_ROOM });
    }

    const threadKey = dmThreadKeyFor(selfId, peerRaw);
    if (!threadKey) return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    const peerId = Number.parseInt(peerRaw, 10);
    if (!Number.isInteger(peerId) || peerId === selfId) {
      return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    }
    if (!assertTargetPeer(peerId)) {
      return res.status(403).json({ error: 'Faqat target foydalanuvchilariga yozish mumkin.' });
    }

    const rows = db
      .prepare(
        `SELECT d.client_message_id, d.sender_user_id, d.message_type, d.body, d.payload_json, d.created_at,
                u.full_name AS sender_full_name, u.login AS sender_login
         FROM staff_direct_messages d
         JOIN users u ON u.id = d.sender_user_id
         WHERE d.thread_key = ?
         ORDER BY d.id DESC
         LIMIT ?`,
      )
      .all(threadKey, limit);
    const messages = rows.reverse().map((row) => dmRowToPickerMessage(row, selfId));
    res.json({ messages, threadKey });
  } catch (e) {
    console.error('target dm/messages', e);
    res.status(500).json({ error: 'Chat yuklanmadi.' });
  }
}

export function postTargetDmSend(req, res) {
  try {
    if (!isTargetRoleUser(req.user.id)) {
      return res.status(403).json({ error: 'Faqat target foydalanuvchilari uchun.' });
    }
    const selfId = req.user.id;
    const body = req.body || {};
    const peerRaw = body.peerId != null ? String(body.peerId) : '';
    const text = String(body.text ?? '').slice(0, 8000);
    const type = String(body.messageType || 'text').trim().slice(0, 32) || 'text';
    const cidRaw = String(body.clientMessageId || '').trim().slice(0, 128) || `dm-${Date.now()}`;

    if (String(peerRaw) === 'myshop') {
      const { clientMessageId: savedId } = insertStaffChatArchiveRow(req, {
        chatRoom: TARGET_CHAT_ROOM,
        clientMessageId: cidRaw,
        messageType: type,
        text,
        isOutgoing: true,
        payloadRaw: body.payload,
      });
      return res.json({ ok: true, clientMessageId: savedId });
    }

    const threadKey = dmThreadKeyFor(selfId, peerRaw);
    if (!threadKey) return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    const peerId = Number.parseInt(peerRaw, 10);
    if (!Number.isInteger(peerId) || peerId === selfId) {
      return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    }
    if (!assertTargetPeer(peerId)) {
      return res.status(403).json({ error: 'Faqat target foydalanuvchilariga yozish mumkin.' });
    }

    const payloadClean = sanitizeChatPayload(body.payload);
    const payloadJson = payloadClean ? JSON.stringify(payloadClean) : null;

    db.prepare(
      `INSERT OR IGNORE INTO staff_direct_messages (client_message_id, thread_key, sender_user_id, message_type, body, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(cidRaw, threadKey, selfId, type, text || null, payloadJson);

    res.json({ ok: true, clientMessageId: cidRaw });
  } catch (e) {
    console.error('target dm/send', e);
    res.status(500).json({ error: 'Yuborishda xatolik.' });
  }
}

export function getTargetDmStories(req, res) {
  req.query.teamRoom = TARGET_CHAT_ROOM;
  return getDmStories(req, res);
}

export function getTargetDmCallLogs(req, res) {
  return getDmCallLogs(req, res);
}

export function postTargetDmCallLog(req, res) {
  try {
    if (!isTargetRoleUser(req.user.id)) {
      return res.status(403).json({ error: 'Faqat target foydalanuvchilari uchun.' });
    }
    const peerIdRaw = String(req.body?.peerId ?? '').trim();
    if (peerIdRaw && peerIdRaw !== 'myshop') {
      const peerId = Number.parseInt(peerIdRaw, 10);
      if (!Number.isInteger(peerId) || !assertTargetPeer(peerId)) {
        return res.status(403).json({ error: 'Faqat target foydalanuvchilariga qo‘ng‘iroq mumkin.' });
      }
    }
    return postDmCallLog(req, res);
  } catch (e) {
    console.error('target dm/call-logs POST', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
}
