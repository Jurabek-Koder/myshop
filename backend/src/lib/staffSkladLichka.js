/**
 * Sklad Lichka + jamoa xonasi (myshop) — picker va courier API uchun umumiy mantiq
 */
import { db } from '../db/database.js';
import { scheduleSkladBotAfterHumanMessage } from '../services/skladChatBot.js';

export function normalizePeerRoleName(row) {
  const rn = String(row?.role_name || '').trim().toLowerCase();
  const rl = String(row?.role_legacy || '').trim().toLowerCase();
  return rn || rl || '';
}

export function isExcludedLichkaPeerRole(name) {
  return name === 'customer' || name === 'guest';
}

export function dmThreadKeyFor(selfId, peerIdRaw) {
  if (String(peerIdRaw) === 'myshop') return `brand:${selfId}`;
  const peerId = parseInt(peerIdRaw, 10);
  if (!Number.isInteger(peerId) || peerId < 1) return null;
  const a = Math.min(selfId, peerId);
  const b = Math.max(selfId, peerId);
  return `dm:${a}-${b}`;
}

export function sanitizeChatPayload(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const o = { ...obj };
  if (o.mediaUrl != null && String(o.mediaUrl).startsWith('blob:')) delete o.mediaUrl;
  return o;
}

export function fetchSkladArchiveRows(limit, chatRoom = 'operators') {
  const room = String(chatRoom || 'operators').trim();
  const safe = room === 'sklad' || room === 'operators' ? room : 'operators';
  return db
    .prepare(
      `SELECT id, client_message_id, sender_user_id, sender_label, is_from_staff, message_type, body, payload_json, created_at
       FROM staff_chat_archive
       WHERE chat_room = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(safe, limit);
}

export function insertStaffChatArchiveRow(req, { chatRoom, clientMessageId, messageType, text, isOutgoing, payloadRaw }) {
  const userId = req.user.id;
  const cid = String(clientMessageId || '').trim().slice(0, 128) || `m-${Date.now()}`;
  const body = String(text ?? '').slice(0, 8000);
  const type = String(messageType || 'text').trim().slice(0, 32) || 'text';
  const label = String(req.user?.full_name || req.user?.login || 'xodim').trim().slice(0, 200);
  const fromStaff = isOutgoing === true || isOutgoing === 1 ? 1 : 0;
  const payloadClean = sanitizeChatPayload(payloadRaw);
  const payloadJson = payloadClean ? JSON.stringify(payloadClean) : null;
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO staff_chat_archive (client_message_id, chat_room, sender_user_id, sender_label, is_from_staff, message_type, body, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(cid, chatRoom, userId, label, fromStaff, type, body || null, payloadJson);
  return { clientMessageId: cid, inserted: result.changes > 0 };
}

export function archiveRowToPickerTeamMessage(row, selfId) {
  let payload = {};
  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = {};
    }
  }
  const created = row.created_at ? new Date(String(row.created_at).replace(' ', 'T')) : new Date();
  const time = `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
  const out = Boolean(Number(row.sender_user_id) === Number(selfId));
  const type = payload.type || row.message_type || 'text';
  const senderNick =
    String(payload.senderNick || '').trim() ||
    String(row.sender_label || '').trim() ||
    (out ? '' : 'MyShop');
  const msg = {
    id: String(row.client_message_id),
    type,
    out,
    time,
    senderNick,
  };
  if (payload.replyTo) msg.replyTo = payload.replyTo;
  if (type === 'text' || !type) {
    msg.text = payload.text != null ? String(payload.text) : String(row.body || '');
  }
  if (payload.mediaUrl) msg.mediaUrl = payload.mediaUrl;
  if (payload.videoNote) msg.videoNote = payload.videoNote;
  if (payload.durationSec != null) msg.durationSec = payload.durationSec;
  if (payload.fileName) msg.fileName = payload.fileName;
  return msg;
}

export function dmRowToPickerMessage(row, selfId) {
  let payload = {};
  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = {};
    }
  }
  const created = row.created_at ? new Date(String(row.created_at).replace(' ', 'T')) : new Date();
  const time = `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
  const out = Boolean(Number(row.sender_user_id) === Number(selfId));
  const type = payload.type || row.message_type || 'text';
  const senderNick =
    String(payload.senderNick || '').trim() ||
    String(row.sender_full_name || row.sender_login || '').trim() ||
    '';
  const msg = {
    id: String(row.client_message_id),
    type,
    out,
    time,
    senderNick,
  };
  if (payload.replyTo) msg.replyTo = payload.replyTo;
  if (type === 'text' || !type) {
    msg.text = payload.text != null ? String(payload.text) : String(row.body || '');
  }
  if (payload.mediaUrl) msg.mediaUrl = payload.mediaUrl;
  if (payload.videoNote) msg.videoNote = payload.videoNote;
  if (payload.durationSec != null) msg.durationSec = payload.durationSec;
  if (payload.fileName) msg.fileName = payload.fileName;
  return msg;
}

function assertDmPeerAllowed(peerId) {
  const row = db
    .prepare(
      `SELECT u.id, u.role AS role_legacy, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(peerId);
  if (!row) return false;
  return !isExcludedLichkaPeerRole(normalizePeerRoleName(row));
}

export const SKLAD_PRESENCE_STATES = new Set([
  'idle',
  'typing',
  'recording_audio',
  'recording_video',
  'choosing_attachment',
  'preview_media',
]);

export function getSkladPeers(req, res) {
  try {
    const selfId = req.user.id;
    const operatorsOnly = ['1', 'true', 'yes'].includes(String(req.query.operatorsOnly || '').toLowerCase());
    const rows = db.prepare(`
      SELECT u.id, u.full_name, u.login, u.email, u.phone, u.role AS role_legacy,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id != ?
      ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.login, CAST(u.id AS TEXT)) COLLATE NOCASE
    `).all(selfId);

    const peers = rows
      .filter((row) => {
        if (isExcludedLichkaPeerRole(normalizePeerRoleName(row))) return false;
        if (operatorsOnly && normalizePeerRoleName(row) !== 'operator') return false;
        return true;
      })
      .map((row) => ({
        id: row.id,
        full_name: row.full_name || '',
        login: row.login || '',
        email: row.email || '',
        phone: row.phone || '',
        role_label: row.role_name || row.role_legacy || '',
        /** `users.role` (tizim roli) — superuser guruhlari filtri uchun */
        system_role: String(row.role_legacy || '').trim().toLowerCase(),
      }));

    res.json({ peers });
  } catch (e) {
    console.error('sklad-peers', e);
    res.status(500).json({ error: "Ro'yxat yuklanmadi." });
  }
}

export function postChatPresence(req, res) {
  try {
    const userId = req.user.id;
    const roomRaw = String(req.body?.chatRoom || 'sklad').trim() || 'sklad';
    const room = roomRaw === 'sklad' || roomRaw === 'operators' ? roomRaw : 'sklad';
    const state = String(req.body?.state || 'idle').trim();
    if (!SKLAD_PRESENCE_STATES.has(state)) return res.status(400).json({ error: 'Noto‘g‘ri holat.' });
    db.prepare(
      `INSERT INTO staff_chat_presence (user_id, chat_room, state, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, chat_room) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`
    ).run(userId, room, state);
    res.json({ ok: true });
  } catch (e) {
    console.error('chat/presence POST', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
}

export function getChatPresence(req, res) {
  try {
    const selfId = req.user.id;
    const roomRaw = String(req.query.room || 'sklad').trim() || 'sklad';
    const room = roomRaw === 'sklad' || roomRaw === 'operators' ? roomRaw : 'sklad';
    const staleSeconds = Math.min(60, Math.max(5, parseInt(String(req.query.staleSec || '14'), 10) || 14));
    const rows = db
      .prepare(
        `SELECT p.user_id, p.state, p.updated_at,
                u.full_name, u.login
         FROM staff_chat_presence p
         JOIN users u ON u.id = p.user_id
         WHERE p.chat_room = ?
           AND p.user_id != ?
           AND p.state != 'idle'
           AND datetime(p.updated_at) > datetime('now', ?)`
      )
      .all(room, selfId, `-${staleSeconds} seconds`);

    const peers = rows.map((row) => ({
      userId: row.user_id,
      displayName: String(row.full_name || '').trim(),
      login: String(row.login || '').trim(),
      state: row.state,
      updatedAt: row.updated_at,
    }));
    res.json({ peers });
  } catch (e) {
    console.error('chat/presence GET', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
}

export function getDmMessages(req, res) {
  try {
    const selfId = req.user.id;
    const peerRaw = req.query.peerId != null ? String(req.query.peerId) : '';
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

    if (String(peerRaw) === 'myshop') {
      const teamRoomRaw = String(req.query.teamRoom || 'operators').trim();
      const teamRoom = teamRoomRaw === 'sklad' || teamRoomRaw === 'operators' ? teamRoomRaw : 'operators';
      const rows = fetchSkladArchiveRows(limit, teamRoom);
      const messages = rows.reverse().map((row) => archiveRowToPickerTeamMessage(row, selfId));
      return res.json({ messages, threadKey: teamRoom });
    }

    const threadKey = dmThreadKeyFor(selfId, peerRaw);
    if (!threadKey) return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    const peerId = parseInt(peerRaw, 10);
    if (!assertDmPeerAllowed(peerId)) return res.status(400).json({ error: 'Bu foydalanuvchiga yozib bo‘lmaydi.' });

    const rows = db
      .prepare(
        `SELECT d.client_message_id, d.sender_user_id, d.message_type, d.body, d.payload_json, d.created_at,
                u.full_name AS sender_full_name, u.login AS sender_login
         FROM staff_direct_messages d
         JOIN users u ON u.id = d.sender_user_id
         WHERE d.thread_key = ?
         ORDER BY d.id DESC
         LIMIT ?`
      )
      .all(threadKey, limit);
    const messages = rows.reverse().map((row) => dmRowToPickerMessage(row, selfId));
    res.json({ messages, threadKey });
  } catch (e) {
    console.error('dm/messages', e);
    res.status(500).json({ error: 'Lichka yuklanmadi.' });
  }
}

export function postDmSend(req, res) {
  try {
    const selfId = req.user.id;
    const body = req.body || {};
    const peerRaw = body.peerId != null ? String(body.peerId) : '';
    const text = String(body.text ?? '').slice(0, 8000);
    const type = String(body.messageType || 'text').trim().slice(0, 32) || 'text';
    const cidRaw = String(body.clientMessageId || '').trim().slice(0, 128) || `dm-${Date.now()}`;

    if (String(peerRaw) === 'myshop') {
      try {
        const teamRoomRaw = String(body.teamRoom || 'operators').trim();
        const teamRoom = teamRoomRaw === 'sklad' || teamRoomRaw === 'operators' ? teamRoomRaw : 'operators';
        const { clientMessageId: savedId, inserted } = insertStaffChatArchiveRow(req, {
          chatRoom: teamRoom,
          clientMessageId: cidRaw,
          messageType: type,
          text,
          isOutgoing: true,
          payloadRaw: body.payload,
        });
        if (inserted) {
          scheduleSkladBotAfterHumanMessage(db, {
            chatRoom: teamRoom,
            text,
            clientMessageId: savedId,
            messageType: type,
            payloadRaw: body.payload,
          });
        }
        return res.json({ ok: true, clientMessageId: savedId });
      } catch (e) {
        console.warn('dm/send myshop → sklad', e);
        return res.status(500).json({ error: 'Yuborishda xatolik.' });
      }
    }

    const threadKey = dmThreadKeyFor(selfId, peerRaw);
    if (!threadKey) return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    const peerId = parseInt(peerRaw, 10);
    if (!Number.isInteger(peerId) || peerId === selfId) {
      return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    }
    if (!assertDmPeerAllowed(peerId)) return res.status(400).json({ error: 'Bu foydalanuvchiga yozib bo‘lmaydi.' });

    const payloadClean = sanitizeChatPayload(body.payload);
    const payloadJson = payloadClean ? JSON.stringify(payloadClean) : null;

    db.prepare(
      `INSERT OR IGNORE INTO staff_direct_messages (client_message_id, thread_key, sender_user_id, message_type, body, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(cidRaw, threadKey, selfId, type, text || null, payloadJson);

    res.json({ ok: true, clientMessageId: cidRaw });
  } catch (e) {
    console.error('dm/send', e);
    res.status(500).json({ error: 'Yuborishda xatolik.' });
  }
}

/** Jamoa xonasidagi so‘nggi hikoyalar (har bir foydalanuvchi uchun bittadan) — barcha rollar o‘qiydi */
export function getDmStories(req, res) {
  try {
    const teamRoomRaw = String(req.query.teamRoom || 'operators').trim();
    const teamRoom = teamRoomRaw === 'sklad' || teamRoomRaw === 'operators' ? teamRoomRaw : 'operators';
    const limit = Math.min(300, Math.max(20, parseInt(String(req.query.limit || '120'), 10) || 120));
    const rows = db
      .prepare(
        `SELECT id, sender_user_id, sender_label, payload_json, created_at
         FROM staff_chat_archive
         WHERE chat_room = ? AND message_type = 'story'
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(teamRoom, limit);
    const byUser = new Map();
    for (const row of rows) {
      const uid = Number(row.sender_user_id);
      if (!Number.isInteger(uid) || uid < 1) continue;
      if (byUser.has(uid)) continue;
      let payload = {};
      try {
        payload = row.payload_json ? JSON.parse(row.payload_json) : {};
      } catch {
        payload = {};
      }
      const mediaUrl = String(payload.mediaUrl || '').trim();
      if (!mediaUrl) continue;
      const displayName =
        String(payload.senderNick || '').trim() ||
        String(row.sender_label || '').trim() ||
        '?';
      byUser.set(uid, {
        userId: uid,
        displayName,
        mediaUrl,
        createdAt: row.created_at != null ? String(row.created_at) : '',
      });
    }
    res.json({ stories: [...byUser.values()] });
  } catch (e) {
    console.error('dm/stories', e);
    res.status(500).json({ error: 'Hikoyalar yuklanmadi.' });
  }
}

/** Chatdan boshlangan qo‘ng‘iroqlar jurnali (har bir foydalanuvchi o‘z qatorlari) */
export function getDmCallLogs(req, res) {
  try {
    const selfId = req.user.id;
    const limit = Math.min(300, Math.max(1, parseInt(String(req.query.limit || '120'), 10) || 120));
    const rows = db
      .prepare(
        `SELECT id, direction, counterpart_key, counterpart_label, call_mode, created_at
         FROM lichka_dm_call_logs
         WHERE owner_user_id = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(selfId, limit);
    res.json({ logs: rows });
  } catch (e) {
    console.error('dm/call-logs GET', e);
    res.status(500).json({ error: 'Jurnal yuklanmadi.' });
  }
}

/**
 * Chiquvchi qo‘ng‘iroqni jurnalga yozadi; raqamli suhbatdosh uchun qabul qiluvchiga «kiruvchi» yozuvi ham qo‘shiladi.
 */
export function postDmCallLog(req, res) {
  try {
    const selfId = req.user.id;
    const peerIdRaw = String(req.body?.peerId ?? '').trim();
    const peerDisplayName = String(req.body?.peerDisplayName ?? '').trim();
    const modeRaw = String(req.body?.mode ?? 'voice').trim().toLowerCase();
    const callMode = modeRaw === 'video' ? 'video' : 'voice';
    if (!peerIdRaw) return res.status(400).json({ error: 'Suhbatdosh ko‘rsatilmagan.' });

    const selfRow = db.prepare('SELECT id, full_name, login FROM users WHERE id = ?').get(selfId);
    if (!selfRow) return res.status(401).json({ error: 'Sessiya.' });
    const selfLabel = String(selfRow.full_name || selfRow.login || `#${selfId}`).trim();

    const insert = db.prepare(
      `INSERT INTO lichka_dm_call_logs (owner_user_id, direction, counterpart_key, counterpart_label, call_mode)
       VALUES (?, ?, ?, ?, ?)`
    );

    if (peerIdRaw === 'myshop') {
      insert.run(selfId, 'out', 'myshop', peerDisplayName || 'MyShop', callMode);
      return res.json({ ok: true });
    }

    const peerId = parseInt(peerIdRaw, 10);
    if (!Number.isInteger(peerId) || peerId < 1 || peerId === selfId) {
      return res.status(400).json({ error: 'Noto‘g‘ri suhbatdosh.' });
    }

    const peerRow = db.prepare('SELECT id, full_name, login FROM users WHERE id = ?').get(peerId);
    if (!peerRow) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

    const peerLabel = peerDisplayName || String(peerRow.full_name || peerRow.login || `#${peerId}`).trim();

    insert.run(selfId, 'out', String(peerId), peerLabel, callMode);
    insert.run(peerId, 'in', String(selfId), selfLabel, callMode);

    res.json({ ok: true });
  } catch (e) {
    console.error('dm/call-logs POST', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
}
