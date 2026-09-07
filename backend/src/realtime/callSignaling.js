import { db } from '../db/database.js';
import { dmThreadKeyFor } from '../lib/staffSkladLichka.js';
import { listGroupMembers, syncGroupAutoMembership } from '../services/chatGroupsService.js';
import { isUserOnline } from './socketServer.js';

/**
 * Haqiqiy (real-time) qo'ng'iroq signalizatsiyasi — Socket.IO orqali.
 * Bu modul MEDIA (ovoz/video) ni o'zi uzatmaydi — faqat ikki (yoki guruh
 * holida bir nechta) brauzer o'rtasida WebRTC SDP/ICE ma'lumotlarini
 * uzatib, ularning TO'G'RIDAN-TO'G'RI (peer-to-peer) ulanishini o'rnatishga
 * yordam beradi. Guruh qo'ng'irog'i — "mesh": har bir ishtirokchi
 * boshqa HAR BIR ishtirokchi bilan alohida ulanish hosil qiladi.
 *
 * Faol qo'ng'iroqlar holati xotirada (RAM) saqlanadi — server qayta
 * ishga tushsa, faol qo'ng'iroqlar tugaydi (bu normal, chunki ular
 * baribir real-time va serverga bog'liq).
 */

const RING_TIMEOUT_MS = 45_000;

/** callId -> { kind, mode, initiatorId, targetKey, groupId?, calleeId?, participants: Map<userId,status>, startedAt, answeredAt, ringTimer } */
const activeCalls = new Map();

function userInfo(userId) {
  return db.prepare('SELECT id, full_name, login, role FROM users WHERE id = ?').get(userId);
}

function displayName(u) {
  if (!u) return 'Foydalanuvchi';
  return String(u.full_name || u.login || `#${u.id}`).trim();
}

function insertDmCallLogMessage({ selfId, peerId, mode, status, durationSeconds }) {
  const threadKey = dmThreadKeyFor(selfId, peerId);
  const cid = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = JSON.stringify({ mode, status, durationSeconds: durationSeconds || 0 });
  try {
    db.prepare(
      `INSERT OR IGNORE INTO staff_direct_messages (client_message_id, thread_key, sender_user_id, message_type, body, payload_json)
       VALUES (?, ?, ?, 'call_log', NULL, ?)`,
    ).run(cid, threadKey, selfId, payload);
  } catch (e) {
    console.error('[call] dm log insert', e?.message || e);
  }
}

function insertGroupCallLogMessage({ groupId, initiatorId, mode, status, durationSeconds, participantsSummary }) {
  const cid = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = JSON.stringify({ mode, status, durationSeconds: durationSeconds || 0, participants: participantsSummary || [] });
  try {
    db.prepare(
      `INSERT OR IGNORE INTO chat_group_messages (group_id, client_message_id, sender_user_id, message_type, body, payload_json)
       VALUES (?, ?, ?, 'call_log', NULL, ?)`,
    ).run(groupId, cid, initiatorId, payload);
  } catch (e) {
    console.error('[call] group log insert', e?.message || e);
  }
}

function cleanupCall(callId) {
  const call = activeCalls.get(callId);
  if (call?.ringTimer) clearTimeout(call.ringTimer);
  activeCalls.delete(callId);
}

export function registerCallSignaling(io, socket) {
  const selfId = Number(socket.user?.id);
  if (!Number.isInteger(selfId) || selfId <= 0) return;

  // ---------- 1:1 (DM) qo'ng'iroqlar ----------

  socket.on('call:dm:invite', ({ callId, calleeId, mode, sdp } = {}) => {
    const targetId = Number(calleeId);
    if (!callId || !Number.isInteger(targetId) || targetId === selfId) return;
    const targetUser = userInfo(targetId);
    if (!targetUser) return;
    const callMode = mode === 'video' ? 'video' : 'voice';

    if (!isUserOnline(targetId)) {
      socket.emit('call:dm:unavailable', { callId });
      insertDmCallLogMessage({ selfId, peerId: targetId, mode: callMode, status: 'missed_offline', durationSeconds: 0 });
      return;
    }

    const ringTimer = setTimeout(() => {
      const c = activeCalls.get(callId);
      if (!c || c.answeredAt) return;
      socket.emit('call:dm:no_answer', { callId });
      io.to(`user:${targetId}`).emit('call:dm:cancelled', { callId });
      insertDmCallLogMessage({ selfId, peerId: targetId, mode: callMode, status: 'no_answer', durationSeconds: 0 });
      cleanupCall(callId);
    }, RING_TIMEOUT_MS);

    activeCalls.set(callId, {
      kind: 'dm',
      mode: callMode,
      initiatorId: selfId,
      calleeId: targetId,
      startedAt: Date.now(),
      answeredAt: null,
      ringTimer,
    });

    io.to(`user:${targetId}`).emit('call:dm:incoming', {
      callId,
      fromUserId: selfId,
      fromName: displayName(socket.user),
      mode: callMode,
      sdp,
    });
  });

  socket.on('call:dm:answer', ({ callId, sdp } = {}) => {
    const call = activeCalls.get(callId);
    if (!call || call.kind !== 'dm' || call.calleeId !== selfId) return;
    if (call.ringTimer) clearTimeout(call.ringTimer);
    call.answeredAt = Date.now();
    io.to(`user:${call.initiatorId}`).emit('call:dm:answered', { callId, sdp });
  });

  socket.on('call:dm:decline', ({ callId } = {}) => {
    const call = activeCalls.get(callId);
    if (!call || call.kind !== 'dm' || call.calleeId !== selfId) return;
    io.to(`user:${call.initiatorId}`).emit('call:dm:declined', { callId });
    insertDmCallLogMessage({ selfId: call.initiatorId, peerId: call.calleeId, mode: call.mode, status: 'declined', durationSeconds: 0 });
    cleanupCall(callId);
  });

  socket.on('call:dm:cancel', ({ callId } = {}) => {
    const call = activeCalls.get(callId);
    if (!call || call.kind !== 'dm' || call.initiatorId !== selfId || call.answeredAt) return;
    io.to(`user:${call.calleeId}`).emit('call:dm:cancelled', { callId });
    insertDmCallLogMessage({ selfId: call.initiatorId, peerId: call.calleeId, mode: call.mode, status: 'cancelled', durationSeconds: 0 });
    cleanupCall(callId);
  });

  // ---------- Umumiy: ICE almashish (dm va guruh uchun bitta yo'l) ----------
  socket.on('call:ice-candidate', ({ callId, targetUserId, candidate } = {}) => {
    const targetId = Number(targetUserId);
    if (!callId || !Number.isInteger(targetId) || !candidate) return;
    io.to(`user:${targetId}`).emit('call:ice-candidate', { callId, fromUserId: selfId, candidate });
  });

  socket.on('call:end', ({ callId, durationSeconds } = {}) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    const dur = Math.max(0, Math.round(Number(durationSeconds) || 0));

    if (call.kind === 'dm') {
      if (call.initiatorId !== selfId && call.calleeId !== selfId) return;
      const otherId = call.initiatorId === selfId ? call.calleeId : call.initiatorId;
      io.to(`user:${otherId}`).emit('call:ended', { callId });
      insertDmCallLogMessage({
        selfId: call.initiatorId,
        peerId: call.calleeId,
        mode: call.mode,
        status: call.answeredAt ? 'ended' : 'no_answer',
        durationSeconds: dur,
      });
      cleanupCall(callId);
      return;
    }

    if (call.kind === 'group') {
      const p = call.participants.get(selfId);
      if (p) p.status = 'left';
      io.to(`group:${call.groupId}`).emit('call:group:peer-left', { callId, userId: selfId });

      const stillJoined = [...call.participants.values()].some((v) => v.status === 'joined');
      if (!stillJoined) {
        const summary = [...call.participants.entries()].map(([uid, v]) => ({ userId: uid, status: v.status }));
        insertGroupCallLogMessage({
          groupId: call.groupId,
          initiatorId: call.initiatorId,
          mode: call.mode,
          status: call.answeredAt ? 'ended' : 'no_answer',
          durationSeconds: dur,
          participantsSummary: summary,
        });
        cleanupCall(callId);
      }
    }
  });

  // ---------- Guruh qo'ng'iroqlari (mesh) ----------

  socket.on('call:group:start', ({ callId, groupId, mode } = {}) => {
    const gid = Number(groupId);
    if (!callId || !Number.isInteger(gid)) return;
    const group = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(gid);
    if (!group) return;
    syncGroupAutoMembership(gid);
    const members = listGroupMembers(gid).filter((m) => m.user_id !== selfId);
    const callMode = mode === 'video' ? 'video' : 'voice';

    const participants = new Map();
    participants.set(selfId, { status: 'joined', name: displayName(socket.user) });

    const ringing = [];
    const offlineIds = [];
    for (const m of members) {
      if (isUserOnline(m.user_id)) {
        participants.set(m.user_id, { status: 'invited', name: m.full_name || m.login });
        ringing.push(m.user_id);
      } else {
        participants.set(m.user_id, { status: 'missed_offline', name: m.full_name || m.login });
        offlineIds.push(m.user_id);
      }
    }

    activeCalls.set(callId, {
      kind: 'group',
      groupId: gid,
      mode: callMode,
      initiatorId: selfId,
      participants,
      startedAt: Date.now(),
      answeredAt: ringing.length > 0 ? null : Date.now(),
    });

    socket.join(`group:${gid}`);
    for (const uid of ringing) {
      io.to(`user:${uid}`).emit('call:group:incoming', {
        callId,
        groupId: gid,
        groupTitle: group.title,
        fromUserId: selfId,
        fromName: displayName(socket.user),
        mode: callMode,
      });
    }

    socket.emit('call:group:started', { callId, ringing, offline: offlineIds });

    if (ringing.length === 0) {
      // Hech kim onlayn emas — darhol "hech kim javob bermadi" sifatida yakunlanadi.
      const summary = [...participants.entries()].map(([uid, v]) => ({ userId: uid, status: v.status }));
      insertGroupCallLogMessage({
        groupId: gid,
        initiatorId: selfId,
        mode: callMode,
        status: 'no_answer',
        durationSeconds: 0,
        participantsSummary: summary,
      });
      cleanupCall(callId);
    }
  });

  socket.on('call:group:join', ({ callId } = {}) => {
    const call = activeCalls.get(callId);
    if (!call || call.kind !== 'group') return;
    const p = call.participants.get(selfId);
    if (!p) return;
    p.status = 'joined';
    if (!call.answeredAt) call.answeredAt = Date.now();
    socket.join(`group:${call.groupId}`);

    const existingPeers = [...call.participants.entries()]
      .filter(([uid, v]) => uid !== selfId && v.status === 'joined')
      .map(([uid, v]) => ({ userId: uid, name: v.name }));

    socket.emit('call:group:existing-peers', { callId, peers: existingPeers });
    for (const peer of existingPeers) {
      io.to(`user:${peer.userId}`).emit('call:group:peer-joined', {
        callId,
        newUserId: selfId,
        newUserName: p.name,
      });
    }
  });

  socket.on('call:group:decline', ({ callId } = {}) => {
    const call = activeCalls.get(callId);
    if (!call || call.kind !== 'group') return;
    const p = call.participants.get(selfId);
    if (p) p.status = 'declined';
    io.to(`user:${call.initiatorId}`).emit('call:group:peer-declined', { callId, userId: selfId });
  });

  socket.on('call:group:offer', ({ callId, targetUserId, sdp } = {}) => {
    const targetId = Number(targetUserId);
    if (!callId || !Number.isInteger(targetId)) return;
    io.to(`user:${targetId}`).emit('call:group:offer', { callId, fromUserId: selfId, sdp });
  });

  socket.on('call:group:answer', ({ callId, targetUserId, sdp } = {}) => {
    const targetId = Number(targetUserId);
    if (!callId || !Number.isInteger(targetId)) return;
    io.to(`user:${targetId}`).emit('call:group:answer', { callId, fromUserId: selfId, sdp });
  });

  socket.on('disconnect', () => {
    for (const [callId, call] of activeCalls.entries()) {
      if (call.kind === 'dm') {
        if (call.initiatorId === selfId || call.calleeId === selfId) {
          const otherId = call.initiatorId === selfId ? call.calleeId : call.initiatorId;
          io.to(`user:${otherId}`).emit('call:ended', { callId });
          insertDmCallLogMessage({
            selfId: call.initiatorId,
            peerId: call.calleeId,
            mode: call.mode,
            status: call.answeredAt ? 'ended' : 'no_answer',
            durationSeconds: call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0,
          });
          cleanupCall(callId);
        }
      } else if (call.kind === 'group') {
        const p = call.participants.get(selfId);
        if (p && p.status === 'joined') {
          p.status = 'left';
          io.to(`group:${call.groupId}`).emit('call:group:peer-left', { callId, userId: selfId });
          const stillJoined = [...call.participants.values()].some((v) => v.status === 'joined');
          if (!stillJoined) {
            const summary = [...call.participants.entries()].map(([uid, v]) => ({ userId: uid, status: v.status }));
            insertGroupCallLogMessage({
              groupId: call.groupId,
              initiatorId: call.initiatorId,
              mode: call.mode,
              status: call.answeredAt ? 'ended' : 'no_answer',
              durationSeconds: call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0,
              participantsSummary: summary,
            });
            cleanupCall(callId);
          }
        }
      }
    }
  });
}
