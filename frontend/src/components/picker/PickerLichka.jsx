import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PickerChatCompose from './PickerChatCompose';
import PickerVideoNote from './PickerVideoNote';
import PickerChatAudio from './PickerChatAudio';
import PickerChatInlineVideo from './PickerChatInlineVideo';
import {
  uploadStaffChatMediaFromBlobUrl,
  uploadStaffChatMedia,
  resolveStaffChatMediaUrl,
} from '../../utils/staffChatMedia.js';
import PickerStoryRecorder from './PickerStoryRecorder';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

function peerStoryKey(p) {
  if (!p || p.id == null) return '';
  if (p.id === 'self_story') return 'self_story';
  return p.id === 'myshop' ? 'myshop' : String(p.id);
}

function storyUrlForPeer(p, staffStoriesByUserId) {
  if (!p || p.id === 'myshop') return '';
  const uid = Number(p.id);
  if (!Number.isInteger(uid) || uid < 1) return '';
  return staffStoriesByUserId[uid]?.mediaUrl || '';
}

function dmInitials(name) {
  const s = String(name || '?').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  if (s.length <= 2) return s.toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function nowTimeLabel() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function dmSnippet(m, tr) {
  if (!m || !tr) return '';
  const typ = m.type || 'text';
  if (typ === 'text') return String(m.text || '').slice(0, 120) || tr.chatSnippetMsg;
  if (typ === 'audio') return tr.chatSnippetAudio;
  if (typ === 'video') return m.videoNote ? tr.chatSnippetVideoNote : tr.chatSnippetVideo;
  if (typ === 'image') return tr.chatSnippetImage;
  return `📎 ${m.fileName || tr.chatSnippetFileFallback}`;
}

function dmCopyableText(m, tr) {
  if (!m || !tr) return '';
  if ((m.type === 'text' || !m.type) && m.text) return String(m.text);
  return dmSnippet(m, tr);
}

function dmReplyAuthorNick(m, pickerNick, peerName) {
  const p = String(pickerNick || '').trim();
  const b = String(peerName || '').trim();
  const fromMsg = String(m?.senderNick || '').trim();
  if (fromMsg) return fromMsg;
  return m?.out ? p || 'Picker' : b || '?';
}

/** Profil / serverdan kelgan avatar — to‘liq URL (nisbiy yo‘llar uchun API bazasi) */
function resolveAvatarDisplayUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('data:') || s.startsWith('blob:') || /^https?:\/\//i.test(s)) return s;
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (s.startsWith('/')) return `${base}${s}`;
  return s;
}

function pickerMsgIsOutgoing(m) {
  if (!m || typeof m !== 'object') return false;
  if (m.out === true || m.out === 1) return true;
  if (m.out === false || m.out === 0) return false;
  if (typeof m.out === 'string') {
    const s = m.out.toLowerCase().trim();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return false;
}

function playNotifTonePreview(toneId) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime + 0.02;
  const presets = {
    tomchi: [920, 720],
    iphone_ching: [1320, 1760],
    redmi_sms: [820, 980, 1120],
    classic_beep: [900, 900],
    crystal_ping: [1180, 1480, 1880],
  };
  const seq = presets[toneId] || presets.tomchi;
  seq.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const start = now + idx * 0.13;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.12);
  });
  window.setTimeout(() => void ctx.close().catch(() => {}), 1000);
}

/**
 * Server blob/data URL saqlamaydi — yangilashda shu id dagi mahalliy mediaUrl saqlanadi
 * (aks holda yuborilgan video/audio fayl “yo‘qolgan” ko‘rinadi).
 */
function mergeServerMessagesWithLocalBlobs(filteredServer, prevList) {
  const prevById = new Map();
  for (const m of prevList || []) {
    if (m?.id != null) prevById.set(String(m.id), m);
  }
  return (filteredServer || []).map((sv) => {
    if (!sv || !pickerMsgIsOutgoing(sv)) return sv;
    const typ = sv.type || 'text';
    if (!['audio', 'video', 'image', 'file'].includes(typ)) return sv;
    const url = sv.mediaUrl != null ? String(sv.mediaUrl) : '';
    if (url && !url.startsWith('blob:')) return sv;
    const pr = prevById.get(String(sv.id));
    const prUrl = pr?.mediaUrl != null ? String(pr.mediaUrl) : '';
    if (prUrl && (prUrl.startsWith('blob:') || prUrl.startsWith('data:'))) {
      const next = { ...sv, mediaUrl: pr.mediaUrl };
      if (pr.fileName && !sv.fileName) next.fileName = pr.fileName;
      if (pr.videoNote) next.videoNote = true;
      if (pr.durationSec != null && sv.durationSec == null) next.durationSec = pr.durationSec;
      return next;
    }
    return sv;
  });
}

/**
 * Lichka: sklad ro‘yxati; yozishma — jamoa chat bilan bir xil compose va xabar menyusi.
 */
export default function PickerLichka({
  t,
  request,
  peers,
  peersLoading,
  activePeer,
  setActivePeer,
  threads,
  setThreads,
  pickerChatNick,
  skladPurgedRef,
  onOpenMyShopGroup,
  onSkladThreadPurge,
  /** MyShop (sklad) thread: boshqalar yozmoqda — dashboard poll qiladi */
  skladPresenceSubtitle = '',
  onSkladPresence = null,
  /** API prefiks: `/picker` yoki `/courier` */
  apiPrefix = '/picker',
  /** MyShop jamoa tredi: `operators` (faqat operatorlar guruhi) yoki `sklad` */
  teamChatRoom = 'operators',
  /** Ro‘yxat tashqarida (masalan seller chap panel) — orqaga tugmasi yo‘q */
  embedMode = false,
  /** Ro‘yxat ko‘rinishi sarlavhasi (masalan kuryer paneli) */
  listTitleOverride = null,
  listSubtitleOverride = null,
  listRegionAriaOverride = null,
  hideListTopBar = true,
  onOpenSidePanel = null,
  /** Seller MyShop chat: desktop rail pastida «chatdan chiqish» (masalan dashboard) */
  onExitChat = null,
  /** Superuser admin chat: rail eng yuqorida «+» (guruh yaratish) — faqat `onClick` berilganda */
  railTopPlusAction = null,
  /** Yangi hikoya (+) — ixtiyoriy; berilmasa tugma ko‘rinadi, bosilganda hech narsa */
  onAddStory = null,
  /** Jamoa hikoyalari sinxroni — barcha xodim rollari (picker, kuryer, operator) uchun */
  staffUserId = null,
}) {
  const apiBase = String(apiPrefix || '/picker').replace(/\/$/, '') || '/picker';
  const teamRoomQ = `&teamRoom=${encodeURIComponent(teamChatRoom === 'sklad' ? 'sklad' : 'operators')}`;
  /** Jamoa xonasi hikoyalari: seller emas — backend JWT bilan ishlaydi (test/real farqi yo‘q) */
  const canUseTeamStories = useMemo(() => !String(apiPrefix || '').includes('/seller'), [apiPrefix]);
  const hasStaffUserId = useMemo(() => {
    const sid = Number(staffUserId);
    return Number.isInteger(sid) && sid > 0;
  }, [staffUserId]);
  const [dmChatInput, setDmChatInput] = useState('');
  const [dmReplyTo, setDmReplyTo] = useState(null);
  const dmReplyToRef = useRef(null);
  const [dmActionMenu, setDmActionMenu] = useState(null);
  const [dmHiddenIds, setDmHiddenIds] = useState({});
  const [dmToast, setDmToast] = useState('');
  /** Rasm: to‘liq ekran ko‘rinish */
  const [dmImageLightbox, setDmImageLightbox] = useState('');
  const [dmListSearch, setDmListSearch] = useState('');
  const [dmSearchFocused, setDmSearchFocused] = useState(false);
  const [dmListTab, setDmListTab] = useState('all');
  const [dmCallLogs, setDmCallLogs] = useState([]);
  const [dmCallLogsLoading, setDmCallLogsLoading] = useState(false);
  const [dmSettingsPage, setDmSettingsPage] = useState('root');
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', phone: '', avatar_url: '' });
  /** O‘z avatarim (chat “Hikoyam”, chiquvchi xabarlar) — serverdan yuklanadi, saqlashdan keyin yangilanadi */
  const [selfAvatarUrl, setSelfAvatarUrl] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState('');
  const listRef = useRef(null);
  const dmListSearchRef = useRef(null);
  const avatarGalleryRef = useRef(null);
  const avatarCameraRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const bubblePressRef = useRef({ moved: false, startY: 0 });
  /** Sessiyada chatdan olib tashlangan DM id lar (threadKey → Set) */
  const dmSessionRemovedRef = useRef({});
  const { theme, toggleTheme } = useTheme();
  const { notificationsEnabled, setNotificationsEnabled, locale, setLocale, notifTone, setNotifTone } =
    usePickerUiSettings();

  /** Barcha rollar (picker, kuryer, operator, seller): ≤1024 mobil Telegram; ≥1025 desktop (rail). */
  const isDesktop = useMediaQuery('(min-width: 1025px)');

  /** Ko‘rilgan hikoyalar qatoridan yo‘qoladi (sessiya) */
  const [dismissedStoryKeys, setDismissedStoryKeys] = useState([]);
  const [activeStoryPeer, setActiveStoryPeer] = useState(null);
  const [storyRecorderOpen, setStoryRecorderOpen] = useState(false);
  /** Yuklangan o‘z hikoyam — chat ustidagi lentada va to‘liq ekranda */
  const [publishedStoryMediaUrl, setPublishedStoryMediaUrl] = useState('');
  /** Serverdan: har bir userId uchun so‘nggi hikoya mediaUrl */
  const [staffStoriesByUserId, setStaffStoriesByUserId] = useState({});

  const resolvedSelfAvatar = useMemo(() => resolveAvatarDisplayUrl(selfAvatarUrl), [selfAvatarUrl]);

  const threadKey = activePeer ? (activePeer.id === 'myshop' ? 'myshop' : String(activePeer.id)) : '';
  const peerName = String(activePeer?.displayName || '').trim() || t.lichkaDirect;
  const messages = threads[threadKey] || [];
  const hiddenForThread = dmHiddenIds[threadKey] || [];

  const visibleMessages = useMemo(
    () => messages.filter((m) => !hiddenForThread.includes(m.id)),
    [messages, hiddenForThread]
  );

  useEffect(() => {
    dmReplyToRef.current = dmReplyTo;
  }, [dmReplyTo]);

  useEffect(() => {
    if (!dmImageLightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setDmImageLightbox('');
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [dmImageLightbox]);

  const clearDmLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onDmMessagePointerDown = useCallback(
    (e, m) => {
      if (e.target.closest('audio, video, a[href], button, input, textarea, .picker-tg-video-note-open')) return;
      bubblePressRef.current = {
        moved: false,
        startY: e.clientY ?? e.touches?.[0]?.clientY ?? 0,
      };
      clearDmLongPress();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        setDmActionMenu({ message: m, step: 'menu' });
      }, 480);
    },
    [clearDmLongPress]
  );

  const onDmMessagePointerMove = useCallback(
    (e) => {
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (y == null) return;
      if (Math.abs(y - bubblePressRef.current.startY) > 14) {
        bubblePressRef.current.moved = true;
        clearDmLongPress();
      }
    },
    [clearDmLongPress]
  );

  const onDmMessagePointerUp = useCallback(() => {
    clearDmLongPress();
  }, [clearDmLongPress]);

  const onDmMessageContextMenu = useCallback(
    (e, m) => {
      e.preventDefault();
      clearDmLongPress();
      setDmActionMenu({ message: m, step: 'menu' });
    },
    [clearDmLongPress]
  );

  const scrollDmToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const appendDmMessage = useCallback(
    async (msg) => {
      if (!threadKey) return;
      const reply = dmReplyToRef.current;
      const replyTo = reply
        ? {
            id: reply.id,
            snippet: reply.snippet,
            type: reply.type,
            out: reply.out,
            ...(reply.senderNick ? { senderNick: reply.senderNick } : {}),
          }
        : undefined;
      const time = msg.time || nowTimeLabel();
      const id = msg.id || `dm-${Date.now()}`;
      const nick = pickerChatNick;
      let built = {
        ...msg,
        id,
        time,
        out: true,
        senderNick: msg.senderNick || nick,
        ...(replyTo ? { replyTo } : {}),
      };

      const blobUrl = built.mediaUrl && String(built.mediaUrl).startsWith('blob:') ? String(built.mediaUrl) : null;
      if (blobUrl && request) {
        setDmToast(t.chatMediaUploading);
        try {
          const serverUrl = await uploadStaffChatMediaFromBlobUrl(request, blobUrl, built.fileName);
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (_) {}
          built = { ...built, mediaUrl: serverUrl };
          setDmToast('');
        } catch (e) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (_) {}
          setDmToast(String(e?.message || t.chatMediaUploadFail));
          throw e;
        }
      }

      setThreads((prev) => ({
        ...prev,
        [threadKey]: [...(prev[threadKey] || []), built],
      }));
      if (reply) setDmReplyTo(null);
      scrollDmToBottom();
      if (request && activePeer?.id) {
        const peerParam = activePeer.id === 'myshop' ? 'myshop' : activePeer.id;
        const text =
          built.type === 'text' || !built.type ? String(built.text || '') : dmSnippet(built, t);
        const mediaUrl =
          built.mediaUrl && !String(built.mediaUrl).startsWith('blob:')
            ? String(built.mediaUrl)
            : undefined;
        const payload = {
          type: built.type || 'text',
          text: built.text,
          senderNick: built.senderNick,
          replyTo: built.replyTo,
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(built.videoNote ? { videoNote: true } : {}),
          ...(built.durationSec != null ? { durationSec: built.durationSec } : {}),
          ...(built.fileName ? { fileName: built.fileName } : {}),
        };
        void request(`${apiBase}/dm/send`, {
          method: 'POST',
          body: JSON.stringify({
            peerId: peerParam,
            clientMessageId: built.id,
            messageType: built.type || 'text',
            text,
            payload,
            ...(peerParam === 'myshop' ? { teamRoom: teamChatRoom === 'sklad' ? 'sklad' : 'operators' } : {}),
          }),
        });
      }
    },
    [threadKey, pickerChatNick, setThreads, request, activePeer?.id, t, scrollDmToBottom, apiBase, teamChatRoom]
  );

  const sendDmText = useCallback(() => {
    const text = String(dmChatInput || '').trim();
    if (!text || !threadKey) return;
    appendDmMessage({ type: 'text', text });
    setDmChatInput('');
  }, [dmChatInput, threadKey, appendDmMessage]);

  useEffect(() => {
    if (!activePeer?.id) return;
    setDmChatInput('');
    setDmReplyTo(null);
  }, [activePeer?.id]);

  useEffect(() => {
    if (!activePeer?.id || !request) return;
    const key = activePeer.id === 'myshop' ? 'myshop' : String(activePeer.id);
    let cancelled = false;
    (async () => {
      try {
        const peerParam = activePeer.id === 'myshop' ? 'myshop' : activePeer.id;
        const res = await request(
          `${apiBase}/dm/messages?peerId=${encodeURIComponent(peerParam)}&limit=100${
            peerParam === 'myshop' ? teamRoomQ : ''
          }`
        );
        const d = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const fromServer = Array.isArray(d.messages) ? d.messages : [];
        const purgedSklad = key === 'myshop' && skladPurgedRef?.current ? skladPurgedRef.current : null;
        const afterSkladPurge =
          purgedSklad && purgedSklad.size > 0
            ? fromServer.filter((m) => !purgedSklad.has(m.id))
            : fromServer;
        const removed = dmSessionRemovedRef.current[key];
        const filteredServer =
          removed && removed.size > 0
            ? afterSkladPurge.filter((m) => !removed.has(m.id))
            : afterSkladPurge;
        setThreads((prev) => {
          const serverIds = new Set(filteredServer.map((m) => m.id));
          const prevList = prev[key] || [];
          const mergedServer = mergeServerMessagesWithLocalBlobs(filteredServer, prevList);
          const pending = prevList.filter((m) => m.out && !serverIds.has(m.id));
          return { ...prev, [key]: [...mergedServer, ...pending] };
        });
      } catch {
        /* tarmoq */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePeer?.id, request, setThreads, skladPurgedRef, apiBase, teamRoomQ]);

  /** MyShop = sklad chat — bot javoblari uchun yengil yangilash */
  useEffect(() => {
    if (!request || activePeer?.id !== 'myshop') return;
    const key = 'myshop';
    const tick = async () => {
      try {
        const res = await request(`${apiBase}/dm/messages?peerId=myshop&limit=100${teamRoomQ}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const fromServer = Array.isArray(d.messages) ? d.messages : [];
        const purgedSklad = skladPurgedRef?.current;
        const afterSkladPurge =
          purgedSklad && purgedSklad.size > 0
            ? fromServer.filter((m) => !purgedSklad.has(m.id))
            : fromServer;
        const removed = dmSessionRemovedRef.current[key];
        const filteredServer =
          removed && removed.size > 0
            ? afterSkladPurge.filter((m) => !removed.has(m.id))
            : afterSkladPurge;
        setThreads((prev) => {
          const serverIds = new Set(filteredServer.map((m) => m.id));
          const prevList = prev[key] || [];
          const mergedServer = mergeServerMessagesWithLocalBlobs(filteredServer, prevList);
          const pending = prevList.filter((m) => m.out && !serverIds.has(m.id));
          return { ...prev, [key]: [...mergedServer, ...pending] };
        });
      } catch {
        /* tarmoq */
      }
    };
    const id = setInterval(tick, 13000);
    return () => clearInterval(id);
  }, [activePeer?.id, request, setThreads, skladPurgedRef, apiBase, teamRoomQ]);

  useEffect(() => {
    if (!activePeer || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [activePeer, visibleMessages.length]);

  useEffect(() => () => clearDmLongPress(), [clearDmLongPress]);

  const listTitle = listTitleOverride ?? t.lichkaTitle;
  const listSubtitle = listSubtitleOverride ?? t.lichkaSubtitle;
  const listRegionAria = listRegionAriaOverride ?? t.lichkaRegionAria;

  const dmPeerPreview = useMemo(() => {
    const map = {};
    for (const p of peers) {
      const key = p.id === 'myshop' ? 'myshop' : String(p.id);
      const msgs = threads[key] || [];
      const last = msgs[msgs.length - 1];
      const snippet = last ? dmSnippet(last, t) : '';
      const time = last?.time || '';
      const unreadDot = Boolean(last && !pickerMsgIsOutgoing(last));
      map[key] = { snippet, time, unreadDot };
    }
    return map;
  }, [peers, threads, t]);

  const storyPeersForRow = useMemo(() => {
    return peers
      .filter((p) => !dismissedStoryKeys.includes(peerStoryKey(p)))
      .sort((a, b) => {
        const ka = peerStoryKey(a);
        const kb = peerStoryKey(b);
        const sa = storyUrlForPeer(a, staffStoriesByUserId) ? 2 : dmPeerPreview[ka]?.snippet ? 1 : 0;
        const sb = storyUrlForPeer(b, staffStoriesByUserId) ? 2 : dmPeerPreview[kb]?.snippet ? 1 : 0;
        if (sb !== sa) return sb - sa;
        return 0;
      });
  }, [peers, dismissedStoryKeys, dmPeerPreview, staffStoriesByUserId]);

  const myStoryMediaUrl = useMemo(() => {
    if (dismissedStoryKeys.includes('self_story')) return '';
    if (hasStaffUserId && staffStoriesByUserId[Number(staffUserId)]?.mediaUrl) {
      return staffStoriesByUserId[Number(staffUserId)].mediaUrl;
    }
    return publishedStoryMediaUrl;
  }, [dismissedStoryKeys, hasStaffUserId, staffUserId, staffStoriesByUserId, publishedStoryMediaUrl]);

  const myStoryHasRing = Boolean(myStoryMediaUrl);

  const dismissStoryByKey = useCallback((key) => {
    if (!key) return;
    setDismissedStoryKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    if (key === 'self_story') {
      setPublishedStoryMediaUrl('');
    }
    setActiveStoryPeer(null);
  }, []);

  const loadStaffStories = useCallback(async () => {
    if (!canUseTeamStories) return;
    try {
      const room = teamChatRoom === 'sklad' ? 'sklad' : 'operators';
      const res = await request(`${apiBase}/dm/stories?teamRoom=${encodeURIComponent(room)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = Array.isArray(data.stories) ? data.stories : [];
      const map = {};
      for (const s of list) {
        const uid = Number(s.userId);
        if (!Number.isInteger(uid) || uid < 1 || !s.mediaUrl) continue;
        map[uid] = { mediaUrl: String(s.mediaUrl), displayName: String(s.displayName || '') };
      }
      setStaffStoriesByUserId(map);
    } catch {
      /* tarmoq */
    }
  }, [canUseTeamStories, apiBase, request, teamChatRoom]);

  useEffect(() => {
    void loadStaffStories();
  }, [loadStaffStories]);

  useEffect(() => {
    if (!canUseTeamStories) return undefined;
    const id = window.setInterval(() => void loadStaffStories(), 28000);
    return () => clearInterval(id);
  }, [canUseTeamStories, loadStaffStories]);

  const handleStoryComplete = useCallback(
    async (blob) => {
      if (!blob || blob.size < 1) return;
      try {
        const mediaUrl = await uploadStaffChatMedia(request, blob, 'story.webm');
        if (onAddStory) await onAddStory({ blob, mediaUrl });
        setPublishedStoryMediaUrl(mediaUrl);
        setDismissedStoryKeys((prev) => prev.filter((k) => k !== 'self_story'));
        const posterId = Number(staffUserId);
        if (canUseTeamStories && Number.isInteger(posterId) && posterId > 0) {
          setStaffStoriesByUserId((prev) => ({
            ...prev,
            [posterId]: {
              mediaUrl,
              displayName: String(pickerChatNick || '').trim() || '…',
            },
          }));
        }
        if (canUseTeamStories) {
          try {
            const room = teamChatRoom === 'sklad' ? 'sklad' : 'operators';
            const res = await request(`${apiBase}/dm/send`, {
              method: 'POST',
              body: JSON.stringify({
                peerId: 'myshop',
                teamRoom: room,
                messageType: 'story',
                text: '',
                clientMessageId: `story-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                payload: {
                  type: 'story',
                  mediaUrl,
                  senderNick: pickerChatNick,
                },
              }),
            });
            if (res.ok) await loadStaffStories();
          } catch {
            /* jamoa yozuvi bo‘lmasa ham mahalliy ko‘rinish qoladi */
          }
        }
        setDmToast(t.storyRecorderDone || '');
        setTimeout(() => setDmToast(''), 2800);
      } catch (e) {
        setDmToast(String(e.message || e));
        setTimeout(() => setDmToast(''), 3500);
      }
    },
    [request, onAddStory, t, canUseTeamStories, teamChatRoom, apiBase, pickerChatNick, loadStaffStories, staffUserId]
  );

  useEffect(() => {
    if (!activeStoryPeer) return undefined;
    if (activeStoryPeer.id === 'self_story') return undefined;
    if (activeStoryPeer.storyMediaUrl) return undefined;
    const key = peerStoryKey(activeStoryPeer);
    const id = window.setTimeout(() => dismissStoryByKey(key), 6500);
    return () => clearTimeout(id);
  }, [activeStoryPeer, dismissStoryByKey]);

  useEffect(() => {
    if (!activeStoryPeer) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeStoryPeer]);

  useEffect(() => {
    if (!activeStoryPeer) return undefined;
    const k = peerStoryKey(activeStoryPeer);
    const onKey = (e) => {
      if (e.key === 'Escape') dismissStoryByKey(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeStoryPeer, dismissStoryByKey]);

  const dmUnreadCount = useMemo(
    () =>
      peers.filter((p) => {
        const key = p.id === 'myshop' ? 'myshop' : String(p.id);
        return dmPeerPreview[key]?.unreadDot;
      }).length,
    [peers, dmPeerPreview]
  );

  const groupPeersCount = useMemo(() => peers.filter((p) => p.id === 'myshop').length, [peers]);

  const filteredDmPeers = useMemo(() => {
    let list = [...peers];
    if (dmListTab === 'personal') list = list.filter((p) => p.id !== 'myshop');
    else if (dmListTab === 'group') list = list.filter((p) => p.id === 'myshop');
    else if (dmListTab === 'new') {
      list = list.filter((p) => {
        const key = p.id === 'myshop' ? 'myshop' : String(p.id);
        return dmPeerPreview[key]?.unreadDot;
      });
    }
    const q = dmListSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => `${p.displayName} ${p.roleLabel || ''}`.toLowerCase().includes(q));
    }
    return list;
  }, [peers, dmListTab, dmListSearch, dmPeerPreview]);

  const dmSettingsSubtitle = t.dmSettingsSubtitle || t.lichkaSubtitle;
  const dmSettingsItems = useMemo(
    () => [
      {
        id: 'profile',
        title: t.dmSettingsProfileTitle || 'Profil',
        subtitle: t.dmSettingsProfileSubtitle || 'Ism, login va aloqa maʼlumotlari',
      },
      {
        id: 'notifications',
        title: t.dmSettingsNotificationsTitle || 'Bildirishnomalar',
        subtitle: t.dmSettingsNotificationsSubtitle || 'Ovoz, vibratsiya va badge',
      },
      {
        id: 'privacy',
        title: t.dmSettingsPrivacyTitle || 'Maxfiylik',
        subtitle: t.dmSettingsPrivacySubtitle || 'Oxirgi faollik va bloklanganlar',
      },
      {
        id: 'appearance',
        title: t.dmSettingsAppearanceTitle || 'Ko‘rinish',
        subtitle: t.dmSettingsAppearanceSubtitle || 'Mavzu va chat foni',
      },
      {
        id: 'language',
        title: t.dmSettingsLanguageTitle || 'Til',
        subtitle: t.dmSettingsLanguageSubtitle || 'Ilova tili',
      },
    ],
    [t]
  );
  const notifToneOptions = useMemo(
    () => [
      { id: 'tomchi', label: 'Tomchi' },
      { id: 'iphone_ching', label: 'iPhone ching' },
      { id: 'redmi_sms', label: 'Redmi SMS' },
      { id: 'classic_beep', label: 'Classic beep' },
      { id: 'crystal_ping', label: 'Crystal ping' },
    ],
    []
  );

  const dmListCenterTitle =
    dmListTab === 'settings' && dmSettingsPage === 'root'
      ? t.dmSettingsTitle || t.dmBottomSettings
      : dmListTab === 'settings'
        ? dmSettingsItems.find((x) => x.id === dmSettingsPage)?.title || (t.dmSettingsTitle || t.dmBottomSettings)
        : dmListTab === 'calls'
          ? t.dmCallHistoryTitle
          : listTitleOverride ?? t.dmListChatsTitle;

  const formatDmCallTime = useCallback(
    (createdAt) => {
      const raw = String(createdAt || '').trim();
      if (!raw) return '—';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw;
      try {
        const loc = locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-GB' : 'uz-UZ';
        return d.toLocaleString(loc, {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return d.toLocaleString();
      }
    },
    [locale]
  );

  const loadDmCallLogs = useCallback(async () => {
    if (!request) return;
    setDmCallLogsLoading(true);
    try {
      const res = await request(`${apiBase}/dm/call-logs?limit=120`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setDmCallLogs(Array.isArray(d.logs) ? d.logs : []);
    } catch {
      setDmCallLogs([]);
    } finally {
      setDmCallLogsLoading(false);
    }
  }, [request, apiBase]);

  useEffect(() => {
    if (dmListTab === 'calls') void loadDmCallLogs();
  }, [dmListTab, loadDmCallLogs]);

  const logChatCallAndDial = useCallback(
    async (peer, mode = 'voice') => {
      if (!peer?.id || !request) return;
      const rawTel = String(peer.phone || '').replace(/\s/g, '');
      if (!rawTel) {
        setDmToast(t.dmCallNoPhone);
        window.setTimeout(() => setDmToast(''), 2800);
        return;
      }
      const callMode = mode === 'video' ? 'video' : 'voice';
      try {
        const res = await request(`${apiBase}/dm/call-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            peerId: peer.id === 'myshop' ? 'myshop' : peer.id,
            peerDisplayName: peer.displayName,
            mode: callMode,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        void loadDmCallLogs();
        const clean = rawTel.replace(/^tel:/i, '').replace(/\s/g, '');
        const telHref = `tel:${clean}`;
        /** Tor ekran (≤1024): video ham oddiy telefon qo‘ng‘irog‘i; keng ekran: video uchun FaceTime URI */
        if (callMode === 'video' && isDesktop) {
          const facetimeHref = (() => {
            if (!clean) return null;
            if (clean.startsWith('+')) return `facetime:${clean}`;
            const digits = clean.replace(/\D/g, '');
            if (!digits) return null;
            return `facetime:+${digits}`;
          })();
          if (facetimeHref) {
            window.location.href = facetimeHref;
            return;
          }
        }
        window.location.href = telHref;
      } catch (e) {
        setDmToast(String(e.message || t.errGeneric));
        window.setTimeout(() => setDmToast(''), 3200);
      }
    },
    [request, apiBase, t.dmCallNoPhone, t.errGeneric, loadDmCallLogs, isDesktop]
  );

  const activatePeerFromCallLog = useCallback(
    (log) => {
      const key = String(log?.counterpart_key || '').trim();
      if (!key) return;
      if (key === 'myshop') {
        const p = peers.find((x) => x.id === 'myshop');
        if (p) setActivePeer(p);
        return;
      }
      const p = peers.find((x) => String(x.id) === key);
      if (p) setActivePeer(p);
    },
    [peers, setActivePeer]
  );

  const filteredDmCallLogs = useMemo(() => {
    if (dmListTab !== 'calls') return dmCallLogs;
    const q = dmListSearch.trim().toLowerCase();
    if (!q) return dmCallLogs;
    return dmCallLogs.filter((row) => {
      const label = String(row.counterpart_label || '').toLowerCase();
      const key = String(row.counterpart_key || '').toLowerCase();
      return label.includes(q) || key.includes(q);
    });
  }, [dmListTab, dmCallLogs, dmListSearch]);

  useEffect(() => {
    if (dmListTab !== 'settings') {
      setDmSettingsPage('root');
    }
  }, [dmListTab]);

  const loadProfileSettings = useCallback(async () => {
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await request(`${apiBase}/profile`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const p = data.profile || {};
      setProfileForm({
        first_name: String(p.first_name || p.full_name || '').trim(),
        last_name: String(p.last_name || '').trim(),
        phone: String(p.phone || '').trim(),
        avatar_url: String(p.avatar_url || '').trim(),
      });
      setSelfAvatarUrl(String(p.avatar_url || '').trim());
    } catch (e) {
      setProfileError(e.message || 'Profil yuklanmadi');
    } finally {
      setProfileLoading(false);
    }
  }, [request, apiBase]);

  const hydrateSelfAvatar = useCallback(async () => {
    try {
      const res = await request(`${apiBase}/profile`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setSelfAvatarUrl(String(data.profile?.avatar_url || '').trim());
    } catch {
      /* tarmoq / endpoint yo‘q — chatda initsiallar qoladi */
    }
  }, [request, apiBase]);

  useEffect(() => {
    void hydrateSelfAvatar();
  }, [hydrateSelfAvatar]);

  useEffect(() => {
    if (dmListTab === 'settings' && dmSettingsPage === 'profile') {
      void loadProfileSettings();
    }
  }, [dmListTab, dmSettingsPage, loadProfileSettings]);

  const onPickProfileImage = useCallback((file) => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setProfileError('Rasm fayl tanlang.');
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const url = String(fr.result || '');
      setProfileForm((prev) => ({ ...prev, avatar_url: url }));
      setSelfAvatarUrl(url);
      setProfileError('');
    };
    fr.onerror = () => setProfileError('Rasmni o‘qib bo‘lmadi.');
    fr.readAsDataURL(file);
  }, []);

  const saveProfileSettings = useCallback(async () => {
    const first = String(profileForm.first_name || '').trim();
    const last = String(profileForm.last_name || '').trim();
    const phone = String(profileForm.phone || '').trim();
    const avatar = String(profileForm.avatar_url || '').trim();
    const fullName = `${first}${last ? ` ${last}` : ''}`.trim();
    if (!first) {
      setProfileError('Ism kiriting.');
      return;
    }
    setProfileSaving(true);
    setProfileError('');
    setProfileOk('');
    try {
      const res = await request(`${apiBase}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          full_name: fullName,
          phone,
          avatar_url: avatar || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.profile && data.profile.avatar_url !== undefined) {
        setSelfAvatarUrl(String(data.profile.avatar_url || '').trim());
      }
      setProfileOk(t.profileSaved || 'Maʼlumotlar saqlandi.');
    } catch (e) {
      setProfileError(e.message || 'Saqlashda xatolik');
    } finally {
      setProfileSaving(false);
    }
  }, [profileForm, request, apiBase, t.profileSaved]);

  const renderPublishedStoryStrip = () => {
    if (!myStoryMediaUrl) return null;
    const src = resolveStaffChatMediaUrl(myStoryMediaUrl);
    return (
      <div className="picker-lichka-story-chat-top" role="region" aria-label={t.storyChatTopAria || ''}>
        <div className="picker-lichka-story-chat-top-inner">
          <div className="picker-lichka-story-chat-top-media">
            <video src={src} muted playsInline loop autoPlay className="picker-lichka-story-chat-top-video" />
          </div>
          <p className="picker-lichka-story-chat-top-caption">{t.storyChatTopCaption}</p>
          <button
            type="button"
            className="picker-lichka-story-chat-top-close"
            onClick={() => dismissStoryByKey('self_story')}
            aria-label={t.storyOverlayCloseAria}
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  const renderStoryPortal = () => {
    if (!activeStoryPeer) return null;
    const k = peerStoryKey(activeStoryPeer);
    const prev = dmPeerPreview[k] || {};
    const isSelfStory = activeStoryPeer.id === 'self_story';
    const selfVideoSrc =
      isSelfStory && myStoryMediaUrl ? resolveStaffChatMediaUrl(myStoryMediaUrl) : '';
    const peerVideoSrc =
      !isSelfStory && activeStoryPeer.storyMediaUrl
        ? resolveStaffChatMediaUrl(activeStoryPeer.storyMediaUrl)
        : '';
    const showVideoStory = Boolean(selfVideoSrc || peerVideoSrc);
    return createPortal(
      <div
        className="picker-lichka-story-overlay"
        role="presentation"
        onClick={() => dismissStoryByKey(k)}
      >
        <div
          className={`picker-lichka-story-overlay-inner ${showVideoStory ? 'picker-lichka-story-overlay-inner--self' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={t.storyOverlayAria || 'Story'}
          onClick={(e) => e.stopPropagation()}
        >
          {!showVideoStory && !isSelfStory ? (
            <div className="picker-lichka-story-overlay-progress" key={k} aria-hidden />
          ) : null}
          <button
            type="button"
            className="picker-lichka-story-overlay-x"
            onClick={() => dismissStoryByKey(k)}
            aria-label={t.storyOverlayCloseAria}
          >
            ×
          </button>
          {showVideoStory ? (
            <div className="picker-lichka-story-overlay-self">
              <video
                src={selfVideoSrc || peerVideoSrc}
                controls
                autoPlay
                playsInline
                className="picker-lichka-story-overlay-video"
                onEnded={() => dismissStoryByKey(k)}
              />
            </div>
          ) : (
            <div className="picker-lichka-story-overlay-content">
              <div className="picker-lichka-story-overlay-avatar" aria-hidden>
                {dmInitials(activeStoryPeer.displayName)}
              </div>
              <p className="picker-lichka-story-overlay-name">{activeStoryPeer.displayName}</p>
              {prev.snippet ? <p className="picker-lichka-story-overlay-text">{prev.snippet}</p> : null}
              <p className="picker-lichka-story-overlay-hint">{t.storyOverlayAutoHint}</p>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  const renderStoryRecorder = () => (
    <PickerStoryRecorder
      open={storyRecorderOpen}
      onClose={() => setStoryRecorderOpen(false)}
      onComplete={handleStoryComplete}
      t={t}
    />
  );

  const renderDmThread = () => (
    <>
    <div
      className="picker-tg-chat picker-lichka-thread picker-lichka--flex-mount"
      dir="ltr"
      role="region"
      aria-label={t.lichkaThreadAria}
    >
      <header className="picker-tg-head picker-lichka-thread-head">
        {embedMode ? (
          <span className="picker-tg-head-hamburger picker-lichka-back picker-lichka-embed-head-spacer" aria-hidden />
        ) : (
          <button
            type="button"
            className="picker-tg-head-hamburger picker-lichka-back"
            onClick={() => setActivePeer(null)}
            aria-label={t.lichkaBack}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className="picker-tg-head-avatar picker-lichka-head-avatar" aria-hidden>
          <span>{dmInitials(activePeer.displayName)}</span>
        </div>
        <div className="picker-tg-head-text">
          {activePeer.id === 'myshop' && onOpenMyShopGroup ? (
            <div
              className="picker-tg-head-title picker-tg-head-title--tap"
              role="button"
              tabIndex={0}
              onClick={() => onOpenMyShopGroup()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenMyShopGroup();
                }
              }}
            >
              {activePeer.displayName}
            </div>
          ) : (
            <div className="picker-tg-head-title">{activePeer.displayName}</div>
          )}
          <div
            className={`picker-tg-head-status ${
              activePeer.id === 'myshop' && skladPresenceSubtitle ? 'picker-tg-head-status--presence' : ''
            }`}
          >
            {activePeer.id === 'myshop'
              ? skladPresenceSubtitle || t.chatOnline
              : activePeer.roleLabel || t.lichkaDirect}
          </div>
        </div>
        <div className="picker-tg-head-actions picker-tg-head-actions--call">
          <button
            type="button"
            className="picker-tg-icon-btn picker-tg-icon-btn--call"
            title={!String(activePeer?.phone || '').trim() ? t.dmCallNoPhone : undefined}
            aria-label={t.dmCallPeerAria}
            onClick={() => void logChatCallAndDial(activePeer, 'voice')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden>
              <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="picker-tg-icon-btn picker-tg-icon-btn--call"
            title={
              !String(activePeer?.phone || '').trim()
                ? t.dmCallNoPhone
                : isDesktop
                  ? t.dmVideoCallDesktopHint
                  : undefined
            }
            aria-label={t.dmVideoCallPeerAria}
            onClick={() => void logChatCallAndDial(activePeer, 'video')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden>
              <path
                d="M23 7l-7 5 7 5V7z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="picker-tg-body">
        {renderPublishedStoryStrip()}
        <div className="picker-tg-pattern" aria-hidden />
        <div className="picker-tg-scroll" ref={listRef}>
          <div className="picker-tg-date-pill">{t.chatToday}</div>
          {visibleMessages.length === 0 ? (
            <p className="picker-lichka-empty-thread">{t.lichkaEmptyThread}</p>
          ) : (
            visibleMessages.map((m) => {
              const isOut = pickerMsgIsOutgoing(m);
              const isVideoNote = m.type === 'video' && m.videoNote;
              const bareMedia =
                !isVideoNote && ['image', 'audio', 'video'].includes(String(m.type || ''));
              const msgNick = (m.senderNick || (isOut ? pickerChatNick : peerName)).trim();
              const initials = dmInitials(msgNick);
              const outAvatarSrc = isOut ? resolvedSelfAvatar : '';
              const avatarEl = (
                <div
                  className={`picker-tg-avatar ${isOut ? 'picker-tg-avatar--out' : 'picker-tg-avatar--in'}`}
                  title={msgNick}
                  aria-hidden
                >
                  {outAvatarSrc ? (
                    <img src={outAvatarSrc} alt="" className="picker-tg-avatar-img" />
                  ) : (
                    <span className="picker-tg-avatar-text">{initials}</span>
                  )}
                </div>
              );
              const bubbleEl = (
                <div
                  role="button"
                  tabIndex={0}
                  className={`picker-tg-bubble ${isOut ? 'picker-tg-bubble-out' : 'picker-tg-bubble-in'} ${m.type && m.type !== 'text' && !isVideoNote ? 'picker-tg-bubble--media' : ''} ${bareMedia ? 'picker-tg-bubble--bare-media' : ''} ${isVideoNote ? `picker-tg-bubble--video-note${m.replyTo ? ' picker-tg-bubble--video-note-reply' : ''}` : ''}`}
                  onPointerDown={(e) => onDmMessagePointerDown(e, m)}
                  onPointerMove={onDmMessagePointerMove}
                  onPointerUp={onDmMessagePointerUp}
                  onPointerCancel={onDmMessagePointerUp}
                  onContextMenu={(e) => onDmMessageContextMenu(e, m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDmReplyTo({
                        id: m.id,
                        snippet: dmSnippet(m, t),
                        type: m.type || 'text',
                        out: isOut,
                        senderNick: dmReplyAuthorNick({ ...m, out: isOut }, pickerChatNick, peerName),
                      });
                    }
                  }}
                >
                  {m.replyTo && (
                    <button
                      type="button"
                      className="picker-tg-reply-quote"
                      onClick={(e) => {
                        e.stopPropagation();
                        const idEsc = String(m.replyTo.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        document.querySelector(`[data-picker-dm-msg="${idEsc}"]`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                      }}
                    >
                      <span className="picker-tg-reply-quote-bar" aria-hidden />
                      <span className="picker-tg-reply-quote-inner">
                        <span className="picker-tg-reply-quote-name">
                          {m.replyTo.senderNick && String(m.replyTo.senderNick).trim()
                            ? m.replyTo.senderNick
                            : m.replyTo.out
                              ? t.chatYou
                              : peerName}
                        </span>
                        <span className="picker-tg-reply-quote-snippet">{m.replyTo.snippet}</span>
                      </span>
                    </button>
                  )}
                  <div
                    className={`picker-tg-bubble-inner ${m.type && m.type !== 'text' && !isVideoNote ? 'picker-tg-bubble-inner--stack' : ''} ${bareMedia ? 'picker-tg-bubble-inner--bare-media' : ''} ${isVideoNote ? 'picker-tg-bubble-inner--video-note' : ''}`}
                  >
                    <div
                      className={`picker-tg-bubble-content${
                        m.type && m.type !== 'text' && !isVideoNote ? '' : ' picker-tg-bubble-content--text-row'
                      }`}
                    >
                      {m.type === 'audio' && m.mediaUrl && (
                        <PickerChatAudio
                          src={resolveStaffChatMediaUrl(m.mediaUrl)}
                          playAria={t.chatAudioPlayAria}
                          pauseAria={t.chatAudioPauseAria}
                        />
                      )}
                      {m.type === 'video' && m.mediaUrl && isVideoNote && (
                        <PickerVideoNote
                          src={resolveStaffChatMediaUrl(m.mediaUrl)}
                          out={isOut}
                          sentTitle={t.chatSent}
                          playAria={t.composeVideoNotePlayAria}
                        />
                      )}
                      {m.type === 'video' && m.mediaUrl && !isVideoNote && (
                        <PickerChatInlineVideo
                          src={resolveStaffChatMediaUrl(m.mediaUrl)}
                          playAria={t.chatInlineVideoPlayAria}
                        />
                      )}
                      {m.type === 'image' && m.mediaUrl && (
                        <div
                          role="button"
                          tabIndex={0}
                          className="picker-tg-msg-img-wrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDmImageLightbox(resolveStaffChatMediaUrl(m.mediaUrl));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setDmImageLightbox(resolveStaffChatMediaUrl(m.mediaUrl));
                            }
                          }}
                        >
                          <img src={resolveStaffChatMediaUrl(m.mediaUrl)} alt="" className="picker-tg-msg-img" />
                        </div>
                      )}
                      {m.type === 'file' && m.mediaUrl && (
                        <a
                          href={resolveStaffChatMediaUrl(m.mediaUrl)}
                          download={m.fileName}
                          className="picker-tg-msg-file"
                        >
                          📎 {m.fileName || t.chatSnippetFileFallback}
                        </a>
                      )}
                      {(m.type === 'text' || !m.type) && m.text != null && (
                        <p className="picker-tg-bubble-text">{m.text}</p>
                      )}
                      {!isVideoNote && (
                        <span className="picker-tg-meta">
                          <span className="picker-tg-time">
                            {m.time}
                            {m.durationSec ? ` · ${m.durationSec}s` : ''}
                          </span>
                          {isOut && (
                            <span className="picker-tg-checks" aria-hidden title={t.chatSent}>
                              <svg width="19" height="11" viewBox="0 0 19 11" fill="none" className="picker-tg-check-svg">
                                <path d="M1 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7 5.5l2.5 2.5L18 1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
              return (
                <div
                  key={m.id}
                  data-picker-dm-msg={m.id}
                  className={`picker-tg-row ${isOut ? 'picker-tg-row-out' : 'picker-tg-row-in'}`}
                >
                  <div className={`picker-tg-row-cluster ${isOut ? 'picker-tg-row-cluster--out' : 'picker-tg-row-cluster--in'}`}>
                    {isOut ? (
                      <>
                        {bubbleEl}
                        {avatarEl}
                      </>
                    ) : (
                      <>
                        {avatarEl}
                        {bubbleEl}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {dmToast ? <div className="picker-tg-toast" role="status">{dmToast}</div> : null}

      {dmImageLightbox ? (
        <div
          className="picker-tg-img-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t.chatImageLightboxAria}
          onClick={() => setDmImageLightbox('')}
        >
          <button
            type="button"
            className="picker-tg-img-lightbox-close"
            aria-label={t.chatImageLightboxClose}
            onClick={(e) => {
              e.stopPropagation();
              setDmImageLightbox('');
            }}
          >
            ×
          </button>
          <img
            src={dmImageLightbox}
            alt=""
            className="picker-tg-img-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {dmActionMenu && (
        <>
          <div className="picker-tg-menu-backdrop" onClick={() => setDmActionMenu(null)} aria-hidden />
          <div className="picker-tg-action-sheet" role="dialog" aria-labelledby="picker-dm-actions-title">
            {dmActionMenu.step === 'delete' ? (
              <>
                <div id="picker-dm-actions-title" className="picker-tg-action-sheet-title">
                  {t.chatDeleteChooseTitle}
                </div>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn"
                  onClick={() => {
                    const msg = dmActionMenu.message;
                    setDmHiddenIds((prev) => ({
                      ...prev,
                      [threadKey]: [...new Set([...(prev[threadKey] || []), msg.id])],
                    }));
                    setDmActionMenu(null);
                    if (dmReplyTo?.id === msg.id) setDmReplyTo(null);
                  }}
                >
                  {t.chatDeleteForMe}
                </button>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--danger"
                  onClick={() => {
                    const id = dmActionMenu.message.id;
                    if (threadKey === 'myshop') {
                      onSkladThreadPurge?.(id);
                    } else {
                      if (!dmSessionRemovedRef.current[threadKey]) {
                        dmSessionRemovedRef.current[threadKey] = new Set();
                      }
                      dmSessionRemovedRef.current[threadKey].add(id);
                    }
                    setThreads((prev) => ({
                      ...prev,
                      [threadKey]: (prev[threadKey] || []).filter((x) => x.id !== id),
                    }));
                    setDmHiddenIds((prev) => ({
                      ...prev,
                      [threadKey]: (prev[threadKey] || []).filter((hid) => hid !== id),
                    }));
                    setDmActionMenu(null);
                    if (dmReplyTo?.id === id) setDmReplyTo(null);
                  }}
                >
                  {t.chatDeleteRemoveFromChat}
                </button>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--muted"
                  onClick={() => setDmActionMenu((prev) => (prev ? { ...prev, step: 'menu' } : null))}
                >
                  {t.chatDeleteBack}
                </button>
              </>
            ) : (
              <>
                <div id="picker-dm-actions-title" className="picker-tg-action-sheet-title">
                  {t.chatActionTitle}
                </div>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn"
                  onClick={() => {
                    const msg = dmActionMenu.message;
                    setDmReplyTo({
                      id: msg.id,
                      snippet: dmSnippet(msg, t),
                      type: msg.type || 'text',
                      out: msg.out,
                      senderNick: dmReplyAuthorNick(msg, pickerChatNick, peerName),
                    });
                    setDmActionMenu(null);
                  }}
                >
                  {t.chatReply}
                </button>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn"
                  onClick={async () => {
                    const msg = dmActionMenu.message;
                    try {
                      await navigator.clipboard.writeText(dmCopyableText(msg, t));
                      setDmToast(t.chatCopyOk);
                      setTimeout(() => setDmToast(''), 2000);
                    } catch {
                      setDmToast(t.chatCopyFail);
                      setTimeout(() => setDmToast(''), 2500);
                    }
                    setDmActionMenu(null);
                  }}
                >
                  {t.chatCopyAction}
                </button>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--danger"
                  onClick={() => setDmActionMenu((prev) => (prev ? { ...prev, step: 'delete' } : null))}
                >
                  {t.chatDelete}
                </button>
                <button
                  type="button"
                  className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--muted"
                  onClick={() => setDmActionMenu(null)}
                >
                  {t.chatCancel}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <PickerChatCompose
        t={t}
        chatInput={dmChatInput}
        setChatInput={setDmChatInput}
        onSendText={sendDmText}
        onAddMessage={(msg) => {
          appendDmMessage(msg);
          scrollDmToBottom();
        }}
        scrollToBottom={scrollDmToBottom}
        replyTo={dmReplyTo}
        onClearReply={() => setDmReplyTo(null)}
        onSkladPresence={activePeer?.id === 'myshop' ? onSkladPresence : null}
      />
    </div>
    {renderStoryPortal()}
    {renderStoryRecorder()}
    </>
  );

  if (activePeer && !isDesktop) {
    return renderDmThread();
  }


  if (!activePeer || isDesktop) {
    const tabs = [
      { id: 'all', label: t.dmListTabAll },
      { id: 'personal', label: t.dmListTabPersonal },
      { id: 'group', label: t.dmListTabGroups, count: groupPeersCount },
      { id: 'new', label: t.dmListTabNew, count: dmUnreadCount },
    ];
    const dockActiveMode = dmSearchFocused
      ? 'search'
      : dmListTab === 'settings'
        ? 'settings'
        : dmListTab === 'personal'
          ? 'contacts'
          : dmListTab === 'calls'
            ? 'calls'
            : 'chats';

    return (
      <>
      <section
        className={`picker-lichka picker-lichka--flex-mount picker-lichka--tg-list${isDesktop ? ' picker-lichka--tg-desktop' : ''}${
          isDesktop && activePeer ? ' picker-lichka--tg-desktop-thread-open' : ''
        }`}
        aria-label={listRegionAria}
      >
        {isDesktop ? (
          <nav className="picker-lichka-tg-desktop-rail" aria-label={t.dmListDockDecorAria}>
            {railTopPlusAction && typeof railTopPlusAction.onClick === 'function' ? (
              <button
                type="button"
                className="picker-lichka-tg-rail-item picker-lichka-tg-rail-plus"
                onClick={() => railTopPlusAction.onClick()}
                title={railTopPlusAction.title || ''}
                aria-label={railTopPlusAction.ariaLabel || railTopPlusAction.title || 'Yangi guruh'}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
            {typeof onExitChat === 'function' ? null : (
              <button
                type="button"
                className="picker-lichka-tg-rail-item"
                onClick={() => onOpenSidePanel?.()}
                aria-label={t.ariaSideOpen || 'Menyu'}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className={`picker-lichka-tg-rail-item ${dmListTab === 'all' && dmListTab !== 'settings' ? 'picker-lichka-tg-rail-item--on' : ''}`}
              onClick={() => {
                setDmSearchFocused(false);
                setDmListSearch('');
                setDmListTab('all');
              }}
              title={t.dmListTabAll}
              aria-label={t.dmListTabAll}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`picker-lichka-tg-rail-item ${dmListTab === 'personal' ? 'picker-lichka-tg-rail-item--on' : ''}`}
              onClick={() => {
                setDmSearchFocused(false);
                setDmListSearch('');
                setDmListTab('personal');
              }}
              title={t.dmListTabPersonal}
              aria-label={t.dmListTabPersonal}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </button>
            <button
              type="button"
              className={`picker-lichka-tg-rail-item ${dmListTab === 'group' ? 'picker-lichka-tg-rail-item--on' : ''}`}
              onClick={() => {
                setDmSearchFocused(false);
                setDmListSearch('');
                setDmListTab('group');
              }}
              title={t.dmListTabGroups}
              aria-label={t.dmListTabGroups}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`picker-lichka-tg-rail-item ${dmListTab === 'calls' ? 'picker-lichka-tg-rail-item--on' : ''}`}
              onClick={() => {
                setDmSearchFocused(false);
                setDmListSearch('');
                setDmListTab('calls');
              }}
              title={t.dmBottomCalls}
              aria-label={t.dmBottomCalls}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={`picker-lichka-tg-rail-item ${dmListTab === 'settings' ? 'picker-lichka-tg-rail-item--on' : ''}`}
              onClick={() => {
                setDmSearchFocused(false);
                setDmListSearch('');
                setDmSettingsPage('root');
                setDmListTab('settings');
              }}
              title={t.dmBottomSettings}
              aria-label={t.dmBottomSettings}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {isDesktop && typeof onExitChat === 'function' ? (
              <button
                type="button"
                className="picker-lichka-tg-rail-item picker-lichka-tg-rail-exit"
                onClick={() => onExitChat()}
                title={t.sellerRailExitChat}
                aria-label={t.sellerRailExitChat}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
          </nav>
        ) : null}
        <div className={isDesktop ? 'picker-lichka-tg-desktop-mid' : 'picker-lichka-tg-mid-mobile'}>
        <div className="picker-lichka-tg-body-split">
          <div className="picker-lichka-tg-head-block">
          {!hideListTopBar ? (
            <header className="picker-lichka-tg-top">
              <button
                type="button"
                className="picker-lichka-tg-top-link"
                onClick={() => {
                  if (dmListTab === 'settings') {
                    if (dmSettingsPage !== 'root') {
                      setDmSettingsPage('root');
                      return;
                    }
                    setDmSearchFocused(false);
                    setDmListSearch('');
                    setDmListTab('all');
                    return;
                  }
                  dmListSearchRef.current?.focus();
                }}
              >
                {dmListTab === 'settings' ? t.lichkaBack : t.dmListEdit}
              </button>
              <h1 className="picker-lichka-tg-top-title">{dmListCenterTitle}</h1>
              <div className="picker-lichka-tg-top-actions" aria-hidden="true">
                <span className="picker-lichka-tg-top-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v8M8 12h8" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="picker-lichka-tg-top-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M8 16l4-4 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </header>
          ) : null}

          <>
          <div className="picker-lichka-stories" role="list">
            <div className="picker-lichka-stories-row">
              <div className="picker-lichka-stories-track" role="presentation">
              <button
                type="button"
                className="picker-lichka-story"
                onClick={() => setStoryRecorderOpen(true)}
                aria-label={t.dmListStoriesAddAria}
              >
                <span className="picker-lichka-story-ring picker-lichka-story-ring--add" aria-hidden>
                  <span className="picker-lichka-story-avatar picker-lichka-story-avatar--you picker-lichka-story-avatar--plus-only">
                    +
                  </span>
                </span>
                <span className="picker-lichka-story-label">{t.dmListStoriesAddLabel}</span>
              </button>
              <button
                type="button"
                className="picker-lichka-story"
                onClick={() => {
                  if (myStoryHasRing) {
                    setActiveStoryPeer({ id: 'self_story', displayName: pickerChatNick });
                  } else {
                    setDmListTab('all');
                  }
                }}
              >
                <span
                  className={`picker-lichka-story-ring ${myStoryHasRing ? 'picker-lichka-story-ring--live' : 'picker-lichka-story-ring--add'}`}
                  aria-hidden
                >
                  {myStoryHasRing && myStoryMediaUrl ? (
                    <video
                      src={resolveStaffChatMediaUrl(myStoryMediaUrl)}
                      muted
                      playsInline
                      loop
                      autoPlay
                      className="picker-lichka-story-avatar picker-lichka-story-avatar--photo picker-lichka-story-avatar--story-thumb"
                    />
                  ) : resolvedSelfAvatar ? (
                    <img
                      src={resolvedSelfAvatar}
                      alt=""
                      className="picker-lichka-story-avatar picker-lichka-story-avatar--photo"
                    />
                  ) : (
                    <span className="picker-lichka-story-avatar">{dmInitials(pickerChatNick)}</span>
                  )}
                </span>
                <span className="picker-lichka-story-label">{t.dmListStoriesMine}</span>
              </button>
              {storyPeersForRow.map((p) => {
                const key = p.id === 'myshop' ? 'myshop' : String(p.id);
                const peerStoryUrl = storyUrlForPeer(p, staffStoriesByUserId);
                const hasRing = Boolean(peerStoryUrl || dmPeerPreview[key]?.snippet);
                return (
                  <button
                    key={String(p.id)}
                    type="button"
                    className="picker-lichka-story"
                    onClick={() => {
                      if (peerStoryUrl) {
                        setActiveStoryPeer({ ...p, storyMediaUrl: peerStoryUrl });
                      } else if (hasRing) {
                        setActiveStoryPeer(p);
                      } else {
                        setActivePeer(p);
                      }
                    }}
                  >
                    <span
                      className={`picker-lichka-story-ring ${hasRing ? 'picker-lichka-story-ring--live' : ''}`}
                      aria-hidden
                    >
                      {peerStoryUrl ? (
                        <video
                          src={resolveStaffChatMediaUrl(peerStoryUrl)}
                          muted
                          playsInline
                          loop
                          autoPlay
                          className={`picker-lichka-story-avatar picker-lichka-story-avatar--story-thumb ${p.id === 'myshop' ? 'picker-lichka-story-avatar--brand' : ''}`}
                        />
                      ) : (
                        <span
                          className={`picker-lichka-story-avatar ${p.id === 'myshop' ? 'picker-lichka-story-avatar--brand' : ''}`}
                        >
                          {dmInitials(p.displayName)}
                        </span>
                      )}
                    </span>
                    <span className="picker-lichka-story-label">{p.displayName}</span>
                  </button>
                );
              })}
              </div>
            </div>
          </div>

          <label className="picker-lichka-search">
            <span className="picker-lichka-search-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" strokeLinecap="round" />
              </svg>
            </span>
            <input
              ref={dmListSearchRef}
              type="search"
              className="picker-lichka-search-input"
              placeholder={t.dmListSearchPlaceholder}
              value={dmListSearch}
              onChange={(e) => setDmListSearch(e.target.value)}
              onFocus={() => setDmSearchFocused(true)}
              onBlur={() => setDmSearchFocused(false)}
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          </>

          {dmListTab !== 'settings' ? (
            <>
              {listSubtitleOverride || listTitleOverride ? (
                <p className="picker-lichka-tg-hint">{listSubtitle}</p>
              ) : null}

              <div className="picker-lichka-chips" role="tablist" aria-label={t.dmListTabsAria}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={dmListTab === tab.id}
                    className={`picker-lichka-chip ${dmListTab === tab.id ? 'picker-lichka-chip--on' : ''}`}
                    onClick={() => setDmListTab(tab.id)}
                  >
                    <span className="picker-lichka-chip-text">{tab.label}</span>
                    {tab.count != null && tab.count > 0 ? (
                      <span className={`picker-lichka-chip-badge ${tab.id === 'new' ? 'picker-lichka-chip-badge--accent' : ''}`}>
                        {tab.count > 99 ? '99+' : tab.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          </div>

        <div className="picker-lichka-tg-list-scroll">
          {dmListTab === 'settings' ? (
            <>
              {dmSettingsPage === 'root' ? (
                <>
                  <p className="picker-lichka-settings-hint">{dmSettingsSubtitle}</p>
                  <ul className="picker-lichka-settings-list">
                    {dmSettingsItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="picker-lichka-settings-row"
                          onClick={() => setDmSettingsPage(item.id)}
                        >
                          <span className="picker-lichka-settings-row-main">
                            <span className="picker-lichka-settings-row-title">{item.title}</span>
                            <span className="picker-lichka-settings-row-subtitle">{item.subtitle}</span>
                          </span>
                          <span className="picker-lichka-settings-row-chevron" aria-hidden>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <section className="picker-lichka-settings-page" aria-label={dmListCenterTitle}>
                  {dmSettingsPage === 'profile' ? (
                    <>
                      <p className="picker-lichka-settings-page-hint">{t.dmSettingsProfileSubtitle || ''}</p>
                      <div className="picker-lichka-profile-card">
                        <div className="picker-lichka-profile-avatar-wrap">
                          {profileForm.avatar_url ? (
                            <img src={profileForm.avatar_url} alt="" className="picker-lichka-profile-avatar-img" />
                          ) : (
                            <span className="picker-lichka-profile-avatar-fallback" aria-hidden>
                              {dmInitials(`${profileForm.first_name || ''} ${profileForm.last_name || ''}` || pickerChatNick)}
                            </span>
                          )}
                        </div>
                        <div className="picker-lichka-profile-avatar-actions">
                          <button
                            type="button"
                            className="picker-btn picker-btn-secondary"
                            onClick={() => avatarGalleryRef.current?.click()}
                          >
                            Galeriya
                          </button>
                          <button
                            type="button"
                            className="picker-btn picker-btn-secondary"
                            onClick={() => avatarCameraRef.current?.click()}
                          >
                            Kamera
                          </button>
                          <input
                            ref={avatarGalleryRef}
                            type="file"
                            accept="image/*"
                            className="picker-lichka-file-hidden"
                            onChange={(e) => onPickProfileImage(e.target.files?.[0])}
                          />
                          <input
                            ref={avatarCameraRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="picker-lichka-file-hidden"
                            onChange={(e) => onPickProfileImage(e.target.files?.[0])}
                          />
                        </div>
                        <label className="picker-lichka-settings-field">
                          <span>{t.profileName || 'Ism'}</span>
                          <input
                            type="text"
                            value={profileForm.first_name}
                            onChange={(e) =>
                              setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))
                            }
                            placeholder={t.profileName || 'Ism'}
                          />
                        </label>
                        <label className="picker-lichka-settings-field">
                          <span>Familiya</span>
                          <input
                            type="text"
                            value={profileForm.last_name}
                            onChange={(e) =>
                              setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))
                            }
                            placeholder="Familiya"
                          />
                        </label>
                        <label className="picker-lichka-settings-field">
                          <span>{t.profilePhone || 'Telefon'}</span>
                          <input
                            type="tel"
                            value={profileForm.phone}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                            placeholder="+998..."
                          />
                        </label>
                        {profileError ? <p className="picker-lichka-settings-error">{profileError}</p> : null}
                        {profileOk ? <p className="picker-lichka-settings-ok">{profileOk}</p> : null}
                        <button
                          type="button"
                          className="picker-btn picker-btn-primary picker-btn-block"
                          disabled={profileSaving || profileLoading}
                          onClick={() => void saveProfileSettings()}
                        >
                          {profileSaving ? `${t.profileSaving || 'Saqlanmoqda'}...` : t.profileSave || 'Saqlash'}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {dmSettingsPage === 'notifications' ? (
                    <>
                      <p className="picker-lichka-settings-page-hint">{t.dmSettingsNotificationsSubtitle || ''}</p>
                      <button
                        type="button"
                        className="picker-btn picker-btn-secondary picker-btn-block"
                        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                      >
                        {notificationsEnabled ? t.notifOn || 'Yoniq' : t.notifOff || "O'chirilgan"}
                      </button>
                      <div className="picker-lichka-ringtones">
                        {notifToneOptions.map((tone) => (
                          <div key={tone.id} className="picker-lichka-ringtone-row">
                            <button
                              type="button"
                              className={`picker-lichka-ringtone-main ${
                                notifTone === tone.id ? 'picker-lichka-ringtone-main--active' : ''
                              }`}
                              onClick={() => setNotifTone(tone.id)}
                            >
                              {tone.label}
                            </button>
                            <button
                              type="button"
                              className="picker-btn picker-btn-secondary picker-lichka-ringtone-play"
                              onClick={() => playNotifTonePreview(tone.id)}
                            >
                              ▶
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {dmSettingsPage === 'privacy' ? (
                    <>
                      <p className="picker-lichka-settings-page-hint">{t.dmSettingsPrivacySubtitle || ''}</p>
                      <div className="picker-lichka-settings-kv">
                        <div className="picker-lichka-settings-kv-row">
                          <span>{t.dmSettingsPrivacyTitle || 'Maxfiylik'}</span>
                          <strong>{t.chatSent || 'Yuborildi'}</strong>
                        </div>
                        <div className="picker-lichka-settings-kv-row">
                          <span>{t.courierNavBlocked || 'Bloklangan'}</span>
                          <strong>0</strong>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {dmSettingsPage === 'appearance' ? (
                    <>
                      <p className="picker-lichka-settings-page-hint">{t.dmSettingsAppearanceSubtitle || ''}</p>
                      <button
                        type="button"
                        className="picker-btn picker-btn-secondary picker-btn-block"
                        onClick={toggleTheme}
                      >
                        {theme === 'dark' ? t.themeMoon || 'Tun' : t.themeSun || 'Kun'}
                      </button>
                    </>
                  ) : null}

                  {dmSettingsPage === 'language' ? (
                    <>
                      <p className="picker-lichka-settings-page-hint">{t.dmSettingsLanguageSubtitle || ''}</p>
                      <div className="picker-lichka-settings-lang">
                        <button
                          type="button"
                          className={`picker-btn picker-btn-secondary ${locale === 'uz' ? 'picker-lichka-settings-lang-btn--active' : ''}`}
                          onClick={() => setLocale('uz')}
                        >
                          {t.langUz || "O'zbek"}
                        </button>
                        <button
                          type="button"
                          className={`picker-btn picker-btn-secondary ${locale === 'ru' ? 'picker-lichka-settings-lang-btn--active' : ''}`}
                          onClick={() => setLocale('ru')}
                        >
                          {t.langRu || 'Русский'}
                        </button>
                        <button
                          type="button"
                          className={`picker-btn picker-btn-secondary ${locale === 'en' ? 'picker-lichka-settings-lang-btn--active' : ''}`}
                          onClick={() => setLocale('en')}
                        >
                          {t.langEn || 'English'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </section>
              )}
            </>
          ) : dmListTab === 'calls' ? (
            <>
              {dmCallLogsLoading ? <p className="picker-lichka-loading">{t.loading}</p> : null}
              {!dmCallLogsLoading && dmCallLogs.length === 0 ? (
                <p className="picker-lichka-empty-thread picker-lichka-call-log-empty">{t.dmCallHistoryEmpty}</p>
              ) : !dmCallLogsLoading && filteredDmCallLogs.length === 0 ? (
                <p className="picker-lichka-empty-thread picker-lichka-call-log-empty">{t.dmCallLogSearchEmpty}</p>
              ) : (
                <ul className="picker-lichka-tg-chatlist picker-lichka-call-log-list" aria-label={t.dmCallHistoryTitle}>
                  {filteredDmCallLogs.map((row) => (
                    <li key={String(row.id)}>
                      <button
                        type="button"
                        className="picker-lichka-tg-row picker-lichka-call-row"
                        onClick={() => activatePeerFromCallLog(row)}
                      >
                        <span className="picker-lichka-tg-row-avatar picker-lichka-call-row-dir" aria-hidden>
                          {row.direction === 'out' ? '↗' : '↙'}
                        </span>
                        <span className="picker-lichka-tg-row-body">
                          <span className="picker-lichka-tg-row-top">
                            <span className="picker-lichka-tg-row-name">{row.counterpart_label || '—'}</span>
                            <span className="picker-lichka-tg-row-time">{formatDmCallTime(row.created_at)}</span>
                          </span>
                          <span className="picker-lichka-tg-row-bottom">
                            <span className="picker-lichka-tg-row-snippet">
                              {row.direction === 'out' ? t.dmCallDirOut : t.dmCallDirIn}
                              {' · '}
                              {row.call_mode === 'video' ? t.dmVideoCallShort : t.dmVoiceCallShort}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              {renderPublishedStoryStrip()}

              {peersLoading ? <p className="picker-lichka-loading">{t.loading}</p> : null}

              <ul className="picker-lichka-tg-chatlist">
                {filteredDmPeers.map((p) => {
                  const key = p.id === 'myshop' ? 'myshop' : String(p.id);
                  const prev = dmPeerPreview[key] || {};
                  return (
                    <li key={String(p.id)}>
                      <button type="button" className="picker-lichka-tg-row" onClick={() => setActivePeer(p)}>
                        <span
                          className={`picker-lichka-tg-row-avatar ${p.id === 'myshop' ? 'picker-lichka-tg-row-avatar--brand' : ''}`}
                          aria-hidden
                        >
                          {dmInitials(p.displayName)}
                        </span>
                        <span className="picker-lichka-tg-row-body">
                          <span className="picker-lichka-tg-row-top">
                            <span className="picker-lichka-tg-row-name">{p.displayName}</span>
                            {prev.time ? <span className="picker-lichka-tg-row-time">{prev.time}</span> : null}
                          </span>
                          <span className="picker-lichka-tg-row-bottom">
                            <span className="picker-lichka-tg-row-snippet">
                              {p.roleLabel ? `${p.roleLabel} · ` : ''}
                              {prev.snippet || t.lichkaDirect}
                            </span>
                            {prev.unreadDot ? (
                              <span className="picker-lichka-tg-row-unread" aria-label={t.dmListUnreadBadge}>
                                1
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        </div>
        </div>

        {isDesktop ? (
          <div className="picker-lichka-tg-desktop-right">
            {activePeer ? (
              renderDmThread()
            ) : (
              <div className="picker-lichka-tg-desktop-empty">
                <p className="picker-lichka-tg-desktop-empty-title">{t.dmDesktopPickHint}</p>
              </div>
            )}
          </div>
        ) : null}

        {!isDesktop ? (
          <div className="picker-lichka-tg-dock-wrap">
          <nav className="picker-lichka-tg-dock" aria-label={t.dmListDockDecorAria}>
            <div className="picker-lichka-tg-dock-pill">
              <button
                type="button"
                className={`picker-lichka-tg-dock-item ${dockActiveMode === 'contacts' ? 'picker-lichka-tg-dock-item--active' : ''}`}
                aria-pressed={dockActiveMode === 'contacts'}
                onClick={() => {
                  setDmSearchFocused(false);
                  setDmListSearch('');
                  setDmListTab('personal');
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
                </svg>
                <span>{t.dmBottomContacts}</span>
              </button>
              <button
                type="button"
                className={`picker-lichka-tg-dock-item ${dockActiveMode === 'calls' ? 'picker-lichka-tg-dock-item--active' : ''}`}
                aria-pressed={dockActiveMode === 'calls'}
                onClick={() => {
                  setDmSearchFocused(false);
                  setDmListSearch('');
                  setDmListTab('calls');
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path
                    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{t.dmBottomCalls}</span>
              </button>
              <button
                type="button"
                className={`picker-lichka-tg-dock-item ${dockActiveMode === 'chats' ? 'picker-lichka-tg-dock-item--active' : ''}`}
                aria-pressed={dockActiveMode === 'chats'}
                onClick={() => {
                  setDmSearchFocused(false);
                  setDmListSearch('');
                  setDmListTab('all');
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" strokeLinejoin="round" />
                </svg>
                <span>{t.dmBottomChats}</span>
                {dmUnreadCount > 0 ? (
                  <span className="picker-lichka-tg-dock-badge">{dmUnreadCount > 99 ? '99+' : dmUnreadCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={`picker-lichka-tg-dock-item ${dockActiveMode === 'settings' ? 'picker-lichka-tg-dock-item--active' : ''}`}
                aria-pressed={dockActiveMode === 'settings'}
                onClick={() => {
                  setDmSearchFocused(false);
                  setDmListSearch('');
                  setDmSettingsPage('root');
                  setDmListTab('settings');
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="3" />
                  <path
                    d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{t.dmBottomSettings}</span>
              </button>
            </div>
            <div className="picker-lichka-tg-dock-fabs">
              <button
                type="button"
                className={`picker-lichka-tg-dock-search-btn ${
                  dockActiveMode === 'search' ? 'picker-lichka-tg-dock-search-btn--active' : ''
                }`}
                aria-label={t.dmListSearchFabAria}
                aria-pressed={dockActiveMode === 'search'}
                onClick={() => dmListSearchRef.current?.focus()}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" strokeLinecap="round" />
                </svg>
              </button>
              {onOpenSidePanel ? (
                <button
                  type="button"
                  className="picker-lichka-tg-dock-search-btn"
                  aria-label={t.ariaSideOpen || 'Menyu'}
                  onClick={() => onOpenSidePanel()}
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              ) : null}
            </div>
          </nav>
        </div>
        ) : null}
      </section>
      {renderStoryPortal()}
      {renderStoryRecorder()}
      </>
    );
  }

}
