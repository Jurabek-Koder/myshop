import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const CallContext = createContext(null);

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function readToken() {
  try {
    return sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken') || '';
  } catch {
    return '';
  }
}

function socketBaseUrl() {
  const explicit = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (explicit) return explicit;
  const proxyTarget = String(import.meta.env.VITE_API_PROXY_TARGET || '').replace(/\/$/, '');
  if (proxyTarget) return proxyTarget;
  if (import.meta.env.DEV) return 'http://127.0.0.1:3000';
  return window.location.origin;
}

function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Global WebRTC qo'ng'iroq boshqaruvchisi — Telegramga o'xshash, TO'LIQ
 * ilova ichida (hech qanday tashqi telefon qo'ng'irog'i yo'q). Bitta
 * marta App ildizida ulanadi va butun ilova bo'ylab (qaysi dashboardda
 * bo'lishidan qat'iy nazar) ishlaydi.
 *
 * 1:1 qo'ng'iroq — bitta RTCPeerConnection.
 * Guruh qo'ng'irog'i — "mesh": har bir ishtirokchi bilan ALOHIDA
 * RTCPeerConnection (Map<userId, RTCPeerConnection>).
 */
export function CallProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());

  // idle | dm-outgoing | dm-incoming | dm-active | group-outgoing | group-incoming | group-active
  const [callState, setCallState] = useState({ status: 'idle' });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(() => new Map()); // userId -> MediaStream (group) or 'peer' key for dm
  const [toast, setToast] = useState('');

  const pcRef = useRef(null); // dm uchun bitta
  const groupPcsRef = useRef(new Map()); // group uchun userId -> RTCPeerConnection
  const pendingIceRef = useRef(new Map()); // userId -> candidate[] (pc hali tayyor bo'lmasa)
  const callStateRef = useRef(callState);
  callStateRef.current = callState;
  const startedAtRef = useRef(0);
  const answeredAtRef = useRef(0);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  // ---------- Socket ulanishi ----------
  useEffect(() => {
    if (!user?.id) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketReady(false);
      return undefined;
    }
    const token = readToken();
    if (!token) return undefined;

    const socket = io(socketBaseUrl(), {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1200,
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketReady(true));
    socket.on('disconnect', () => setSocketReady(false));
    socket.on('presence:update', ({ userId, online }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(Number(userId));
        else next.delete(Number(userId));
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isOnline = useCallback((userId) => onlineUserIds.has(Number(userId)), [onlineUserIds]);

  // ---------- Yordamchi: mahalliy media olish ----------
  const acquireLocalMedia = useCallback(async (mode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? { facingMode: 'user' } : false,
    });
    setLocalStream(stream);
    return stream;
  }, []);

  const stopLocalMedia = useCallback(() => {
    setLocalStream((prev) => {
      prev?.getTracks?.().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const resetAll = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    for (const pc of groupPcsRef.current.values()) pc.close();
    groupPcsRef.current = new Map();
    pendingIceRef.current = new Map();
    stopLocalMedia();
    setRemoteStreams(new Map());
    setCallState({ status: 'idle' });
    startedAtRef.current = 0;
    answeredAtRef.current = 0;
  }, [stopLocalMedia]);

  const durationSeconds = () => (answeredAtRef.current ? Math.round((Date.now() - answeredAtRef.current) / 1000) : 0);

  // ---------- DM: chiquvchi qo'ng'iroq ----------
  const startDmCall = useCallback(
    async (peer, mode = 'voice') => {
      if (!socketRef.current || !peer?.id) return;
      try {
        const stream = await acquireLocalMedia(mode);
        const callId = uuid();
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socketRef.current.emit('call:ice-candidate', { callId, targetUserId: peer.id, candidate: e.candidate });
          }
        };
        pc.ontrack = (e) => {
          setRemoteStreams(new Map([['dm', e.streams[0]]]));
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        startedAtRef.current = Date.now();
        setCallState({ status: 'dm-outgoing', callId, mode, peer });
        socketRef.current.emit('call:dm:invite', { callId, calleeId: peer.id, mode, sdp: offer });
      } catch (e) {
        showToast('Kamera/mikrofonga ruxsat berilmadi.');
        resetAll();
      }
    },
    [acquireLocalMedia, isOnline, resetAll, showToast],
  );

  // ---------- DM: kiruvchini qabul qilish ----------
  const answerDmCall = useCallback(async () => {
    const cs = callStateRef.current;
    if (cs.status !== 'dm-incoming') return;
    try {
      const stream = await acquireLocalMedia(cs.mode);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit('call:ice-candidate', { callId: cs.callId, targetUserId: cs.peer.id, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => setRemoteStreams(new Map([['dm', e.streams[0]]]));
      await pc.setRemoteDescription(new RTCSessionDescription(cs.offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const pending = pendingIceRef.current.get(cs.peer.id) || [];
      for (const c of pending) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingIceRef.current.delete(cs.peer.id);
      answeredAtRef.current = Date.now();
      setCallState({ ...cs, status: 'dm-active' });
      socketRef.current.emit('call:dm:answer', { callId: cs.callId, sdp: answer });
    } catch {
      showToast('Kamera/mikrofonga ruxsat berilmadi.');
      socketRef.current?.emit('call:dm:decline', { callId: cs.callId });
      resetAll();
    }
  }, [acquireLocalMedia, resetAll, showToast]);

  const declineDmCall = useCallback(() => {
    const cs = callStateRef.current;
    if (cs.callId) socketRef.current?.emit('call:dm:decline', { callId: cs.callId });
    resetAll();
  }, [resetAll]);

  // ---------- Guruh: boshlash ----------
  const startGroupCall = useCallback(
    async (group, mode = 'voice') => {
      if (!socketRef.current || !group?.id) return;
      try {
        const stream = await acquireLocalMedia(mode);
        const callId = uuid();
        startedAtRef.current = Date.now();
        answeredAtRef.current = Date.now();
        setCallState({ status: 'group-active', callId, mode, group, participants: new Map() });
        socketRef.current.emit('call:group:start', { callId, groupId: group.id, mode });
      } catch {
        showToast('Kamera/mikrofonga ruxsat berilmadi.');
        resetAll();
      }
    },
    [acquireLocalMedia, resetAll, showToast],
  );

  const joinGroupCall = useCallback(async () => {
    const cs = callStateRef.current;
    if (cs.status !== 'group-incoming') return;
    try {
      const stream = await acquireLocalMedia(cs.mode);
      answeredAtRef.current = Date.now();
      setCallState({ ...cs, status: 'group-active', participants: new Map() });
      socketRef.current.emit('call:group:join', { callId: cs.callId });
      return stream;
    } catch {
      showToast('Kamera/mikrofonga ruxsat berilmadi.');
      socketRef.current?.emit('call:group:decline', { callId: cs.callId });
      resetAll();
    }
    return undefined;
  }, [acquireLocalMedia, resetAll, showToast]);

  const declineGroupCall = useCallback(() => {
    const cs = callStateRef.current;
    if (cs.callId) socketRef.current?.emit('call:group:decline', { callId: cs.callId });
    resetAll();
  }, [resetAll]);

  const createGroupPeerConnection = useCallback(
    (peerId, callId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      if (localStream) localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit('call:ice-candidate', { callId, targetUserId: peerId, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        setRemoteStreams((prev) => new Map(prev).set(peerId, e.streams[0]));
      };
      groupPcsRef.current.set(peerId, pc);
      return pc;
    },
    [localStream],
  );

  const endCall = useCallback(() => {
    const cs = callStateRef.current;
    if (cs.callId) {
      socketRef.current?.emit('call:end', { callId: cs.callId, durationSeconds: durationSeconds() });
    }
    resetAll();
  }, [resetAll]);

  // ---------- Socket event tinglovchilar ----------
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;

    const onDmIncoming = ({ callId, fromUserId, fromName, mode, sdp }) => {
      if (callStateRef.current.status !== 'idle') {
        socket.emit('call:dm:decline', { callId });
        return;
      }
      setCallState({ status: 'dm-incoming', callId, mode, peer: { id: fromUserId, displayName: fromName }, offerSdp: sdp });
    };
    const onDmAnswered = async ({ callId, sdp }) => {
      if (callStateRef.current.callId !== callId || !pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      answeredAtRef.current = Date.now();
      setCallState((prev) => ({ ...prev, status: 'dm-active' }));
    };
    const onIceCandidate = async ({ callId, fromUserId, candidate }) => {
      const cs = callStateRef.current;
      if (cs.callId !== callId) return;
      if (cs.kind !== 'group' && (cs.status === 'dm-active' || cs.status === 'dm-outgoing')) {
        if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        else {
          const arr = pendingIceRef.current.get(fromUserId) || [];
          arr.push(candidate);
          pendingIceRef.current.set(fromUserId, arr);
        }
        return;
      }
      const pc = groupPcsRef.current.get(fromUserId);
      if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      else {
        const arr = pendingIceRef.current.get(fromUserId) || [];
        arr.push(candidate);
        pendingIceRef.current.set(fromUserId, arr);
      }
    };
    const onDmDeclined = () => {
      showToast('Qo‘ng‘iroq rad etildi.');
      resetAll();
    };
    const onDmCancelled = () => {
      showToast('Qo‘ng‘iroq bekor qilindi.');
      resetAll();
    };
    const onDmUnavailable = () => {
      showToast('Foydalanuvchi oflayn.');
      resetAll();
    };
    const onDmNoAnswer = () => {
      showToast('Javob berilmadi.');
      resetAll();
    };
    const onEnded = () => {
      resetAll();
    };

    const onGroupIncoming = ({ callId, groupId, groupTitle, fromUserId, fromName, mode }) => {
      if (callStateRef.current.status !== 'idle') {
        socket.emit('call:group:decline', { callId });
        return;
      }
      setCallState({
        status: 'group-incoming',
        callId,
        mode,
        group: { id: groupId, title: groupTitle },
        fromName,
        fromUserId,
      });
    };
    const onGroupStarted = ({ ringing, offline }) => {
      setCallState((prev) => (prev.status === 'group-active' ? { ...prev, ringing, offline } : prev));
    };
    const onExistingPeers = ({ callId, peers }) => {
      for (const peer of peers) {
        createGroupPeerConnection(peer.userId, callId);
      }
      setCallState((prev) => {
        if (prev.status !== 'group-active') return prev;
        const participants = new Map(prev.participants);
        for (const peer of peers) participants.set(peer.userId, { name: peer.name, status: 'connecting' });
        return { ...prev, participants };
      });
    };
    const onPeerJoined = async ({ callId, newUserId, newUserName }) => {
      const pc = createGroupPeerConnection(newUserId, callId);
      setCallState((prev) => {
        if (prev.status !== 'group-active') return prev;
        const participants = new Map(prev.participants);
        participants.set(newUserId, { name: newUserName, status: 'connecting' });
        return { ...prev, participants };
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:group:offer', { callId, targetUserId: newUserId, sdp: offer });
    };
    const onGroupOffer = async ({ callId, fromUserId, sdp }) => {
      let pc = groupPcsRef.current.get(fromUserId);
      if (!pc) pc = createGroupPeerConnection(fromUserId, callId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const pending = pendingIceRef.current.get(fromUserId) || [];
      for (const c of pending) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingIceRef.current.delete(fromUserId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:group:answer', { callId, targetUserId: fromUserId, sdp: answer });
    };
    const onGroupAnswer = async ({ fromUserId, sdp }) => {
      const pc = groupPcsRef.current.get(fromUserId);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const pending = pendingIceRef.current.get(fromUserId) || [];
      for (const c of pending) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingIceRef.current.delete(fromUserId);
    };
    const onPeerLeft = ({ userId }) => {
      const pc = groupPcsRef.current.get(userId);
      pc?.close();
      groupPcsRef.current.delete(userId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      setCallState((prev) => {
        if (prev.status !== 'group-active') return prev;
        const participants = new Map(prev.participants);
        participants.delete(userId);
        return { ...prev, participants };
      });
    };

    socket.on('call:dm:incoming', onDmIncoming);
    socket.on('call:dm:answered', onDmAnswered);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:dm:declined', onDmDeclined);
    socket.on('call:dm:cancelled', onDmCancelled);
    socket.on('call:dm:unavailable', onDmUnavailable);
    socket.on('call:dm:no_answer', onDmNoAnswer);
    socket.on('call:ended', onEnded);
    socket.on('call:group:incoming', onGroupIncoming);
    socket.on('call:group:started', onGroupStarted);
    socket.on('call:group:existing-peers', onExistingPeers);
    socket.on('call:group:peer-joined', onPeerJoined);
    socket.on('call:group:offer', onGroupOffer);
    socket.on('call:group:answer', onGroupAnswer);
    socket.on('call:group:peer-left', onPeerLeft);

    return () => {
      socket.off('call:dm:incoming', onDmIncoming);
      socket.off('call:dm:answered', onDmAnswered);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:dm:declined', onDmDeclined);
      socket.off('call:dm:cancelled', onDmCancelled);
      socket.off('call:dm:unavailable', onDmUnavailable);
      socket.off('call:dm:no_answer', onDmNoAnswer);
      socket.off('call:ended', onEnded);
      socket.off('call:group:incoming', onGroupIncoming);
      socket.off('call:group:started', onGroupStarted);
      socket.off('call:group:existing-peers', onExistingPeers);
      socket.off('call:group:peer-joined', onPeerJoined);
      socket.off('call:group:offer', onGroupOffer);
      socket.off('call:group:answer', onGroupAnswer);
      socket.off('call:group:peer-left', onPeerLeft);
    };
  }, [socketReady, createGroupPeerConnection, resetAll, showToast]);

  const value = {
    socketReady,
    isOnline,
    callState,
    localStream,
    remoteStreams,
    toast,
    startDmCall,
    answerDmCall,
    declineDmCall,
    startGroupCall,
    joinGroupCall,
    declineGroupCall,
    endCall,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall CallProvider ichida ishlatilishi kerak');
  return ctx;
}
