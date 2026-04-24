import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PICKER_I18N } from '../../i18n/pickerI18n';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { PICKER_EMOJI_LIST } from './pickerEmojiList.js';

const HOLD_MS = 220;
const SWIPE_LOCK_PX = 52;
/* Video: foydalanuvchi qachon tugatishni xohlasa; yuqori chegara — brauzer/xotira */
const MAX_VIDEO_MS = 600_000;
const MAX_AUDIO_MS = 120_000;

function nowTimeLabel() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatRec(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Qo'shimcha menyusi — zamonaviy chiziq ikonlar (Telegram uslubi) */
function AttachIconGallery() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function AttachIconCamera() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function AttachIconVideo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <path d="M10 9l5 3-5 3V9z" />
    </svg>
  );
}
function AttachIconFile() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export default function PickerChatCompose({
  t: tProp,
  chatInput,
  setChatInput,
  onSendText,
  onAddMessage,
  scrollToBottom,
  replyTo = null,
  onClearReply = () => {},
  onSkladPresence = null,
}) {
  const t = tProp || PICKER_I18N.uz;
  /** Telefon: emoji ochilganda yozish qatori oqimda yuqoriga siljiydi; desktop: fixed panel */
  const isComposeMobileLayout = useMediaQuery('(max-width: 1023px)');
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const photoCaptureRef = useRef(null);
  const videoPickRef = useRef(null);
  const inputRef = useRef(null);
  /** Input blur bo‘lganda ham emoji qo‘yish — oxirgi tanlangan pozitsiya */
  const savedSelectionRef = useRef({ start: 0, end: 0 });

  const [captureMode, setCaptureMode] = useState('voice');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const holdTimerRef = useRef(null);
  const pressStartRef = useRef(0);
  const movedRef = useRef(false);
  const startYRef = useRef(0);
  const recKindRef = useRef(null); // 'audio' | 'video'
  const recSecondsRef = useRef(0);
  const stopInProgressRef = useRef(false);
  const endingRef = useRef(false);

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordLocked, setRecordLocked] = useState(false);
  const lockedRef = useRef(false);
  const recordStartedRef = useRef(false);

  const [recSeconds, setRecSeconds] = useState(0);
  const recIntervalRef = useRef(null);
  const maxDurTimerRef = useRef(null);

  const [pendingMedia, setPendingMedia] = useState(null);
  const skipNextModeToggleRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const stopStreams = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopRecInterval = () => {
    if (recIntervalRef.current) {
      clearInterval(recIntervalRef.current);
      recIntervalRef.current = null;
    }
    if (maxDurTimerRef.current) {
      clearTimeout(maxDurTimerRef.current);
      maxDurTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearHoldTimer();
      stopRecInterval();
      try {
        mediaRecRef.current?.stop?.();
      } catch (_) {}
      stopStreams();
      if (pendingMedia?.url) URL.revokeObjectURL(pendingMedia.url);
    },
    []
  );

  useEffect(() => {
    if (typeof onSkladPresence !== 'function') return undefined;
    if (isRecording) {
      onSkladPresence(captureMode === 'camera' ? 'recording_video' : 'recording_audio');
      return undefined;
    }
    if (pendingMedia) {
      onSkladPresence('preview_media');
      return undefined;
    }
    if (attachMenuOpen) {
      onSkladPresence('choosing_attachment');
      return undefined;
    }
    if (emojiPickerOpen) {
      onSkladPresence('choosing_emoji');
      return undefined;
    }
    const t = setTimeout(() => {
      onSkladPresence(chatInput.trim() ? 'typing' : 'idle');
    }, 420);
    return () => clearTimeout(t);
  }, [onSkladPresence, isRecording, captureMode, pendingMedia, attachMenuOpen, emojiPickerOpen, chatInput]);

  useEffect(
    () => () => {
      if (typeof onSkladPresence === 'function') onSkladPresence('idle');
    },
    [onSkladPresence]
  );

  const startRecTicker = () => {
    stopRecInterval();
    recSecondsRef.current = 0;
    setRecSeconds(0);
    const t0 = Date.now();
    recIntervalRef.current = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      recSecondsRef.current = s;
      setRecSeconds(s);
    }, 200);
  };

  const finalizeBlob = useCallback(
    (blob, kind, autoSend) => {
      if (!blob || blob.size < 10) return;
      const url = URL.createObjectURL(blob);
      const dur = Math.max(1, Math.round(recSecondsRef.current));
      if (autoSend) {
        onAddMessage({
          id: `${kind}-${Date.now()}`,
          type: kind,
          out: true,
          time: nowTimeLabel(),
          mediaUrl: url,
          ...(kind === 'audio' ? { durationSec: dur } : {}),
          ...(kind === 'video' ? { videoNote: true } : {}),
        });
        scrollToBottom?.();
      } else {
        setPendingMedia({
          blob,
          url,
          kind,
          ...(kind === 'audio' ? { durationSec: dur } : {}),
          videoNote: kind === 'video',
        });
      }
    },
    [onAddMessage, scrollToBottom]
  );

  const stopMediaRecorder = useCallback(
    (autoSend) => {
      if (stopInProgressRef.current) return Promise.resolve();
      const mr = mediaRecRef.current;
      if (!mr || mr.state === 'inactive') {
        stopInProgressRef.current = false;
        endingRef.current = false;
        return Promise.resolve();
      }
      stopInProgressRef.current = true;
      return new Promise((resolve) => {
        const kind = recKindRef.current === 'video' ? 'video' : 'audio';
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') });
          chunksRef.current = [];
          mediaRecRef.current = null;
          stopStreams();
          finalizeBlob(blob, kind, autoSend);
          stopInProgressRef.current = false;
          resolve();
        };
        try {
          mr.stop();
        } catch {
          stopInProgressRef.current = false;
          resolve();
        }
      });
    },
    [finalizeBlob, stopStreams]
  );

  const beginAudioRecord = async () => {
    try {
      stopStreams();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRecRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.start(100);
      recKindRef.current = 'audio';
      recordStartedRef.current = true;
      setIsRecording(true);
      lockedRef.current = false;
      setRecordLocked(false);
      startRecTicker();
      maxDurTimerRef.current = setTimeout(() => {
        if (mediaRecRef.current?.state === 'recording') {
          const send = !lockedRef.current;
          stopMediaRecorder(send).then(() => {
            setIsRecording(false);
            stopRecInterval();
            setRecSeconds(0);
            recordStartedRef.current = false;
          });
        }
      }, MAX_AUDIO_MS);
    } catch (e) {
      console.warn(e);
      setIsRecording(false);
      recordStartedRef.current = false;
    }
  };

  const beginVideoRecord = async () => {
    try {
      stopStreams();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
      });
      streamRef.current = stream;
      const v = document.getElementById('picker-tg-video-preview');
      if (v) {
        v.srcObject = stream;
        v.play?.().catch(() => {});
      }
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.start(100);
      recKindRef.current = 'video';
      recordStartedRef.current = true;
      setIsRecording(true);
      lockedRef.current = false;
      setRecordLocked(false);
      startRecTicker();
      maxDurTimerRef.current = setTimeout(() => {
        if (mediaRecRef.current?.state === 'recording') {
          const send = !lockedRef.current;
          stopMediaRecorder(send).then(() => {
            setIsRecording(false);
            stopRecInterval();
            setRecSeconds(0);
            recordStartedRef.current = false;
            const el = document.getElementById('picker-tg-video-preview');
            if (el) el.srcObject = null;
            if (send) setCaptureMode('voice');
          });
        }
      }, MAX_VIDEO_MS);
    } catch (e) {
      console.warn(e);
      setIsRecording(false);
      recordStartedRef.current = false;
    }
  };

  const finishRecording = useCallback(
    (forceSend) => {
      clearHoldTimer();
      if (!recordStartedRef.current || endingRef.current) return Promise.resolve();
      endingRef.current = true;

      stopRecInterval();
      if (maxDurTimerRef.current) {
        clearTimeout(maxDurTimerRef.current);
        maxDurTimerRef.current = null;
      }

      const autoSend = forceSend ? true : !lockedRef.current;
      const wasVideo = recKindRef.current === 'video';

      return stopMediaRecorder(autoSend).then(() => {
        setIsRecording(false);
        setRecSeconds(0);
        recordStartedRef.current = false;
        lockedRef.current = false;
        setRecordLocked(false);
        endingRef.current = false;
        const el = document.getElementById('picker-tg-video-preview');
        if (el) el.srcObject = null;
        if (autoSend && wasVideo) setCaptureMode('voice');
      });
    },
    [stopMediaRecorder]
  );

  const endCapture = useCallback(() => {
    void finishRecording(false);
  }, [finishRecording]);

  const onCapturePointerDown = (e) => {
    if (chatInput.trim()) return;
    e.preventDefault();
    /* Video: yozish boshlangach ikkinchi bosish = yuborish */
    if (recordStartedRef.current && recKindRef.current === 'video') {
      skipNextModeToggleRef.current = true;
      void finishRecording(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    movedRef.current = false;
    lockedRef.current = false;
    setRecordLocked(false);
    recordStartedRef.current = false;
    pressStartRef.current = Date.now();
    startYRef.current = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (captureMode === 'voice') beginAudioRecord();
      else beginVideoRecord();
    }, HOLD_MS);
  };

  const onCapturePointerMove = (e) => {
    const y = e.clientY ?? e.touches?.[0]?.clientY;
    if (y == null) return;
    if (Math.abs(y - startYRef.current) > 12) movedRef.current = true;
    if (!recordStartedRef.current) return;
    if (recKindRef.current === 'video') return;
    if (startYRef.current - y > SWIPE_LOCK_PX) {
      if (!lockedRef.current) {
        lockedRef.current = true;
        setRecordLocked(true);
      }
    }
  };

  const onCapturePointerUp = (e) => {
    try {
      if (e?.currentTarget?.releasePointerCapture) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    clearHoldTimer();
    const elapsed = Date.now() - pressStartRef.current;

    if (recordStartedRef.current && recKindRef.current === 'video') {
      return;
    }

    if (!recordStartedRef.current) {
      if (skipNextModeToggleRef.current) {
        skipNextModeToggleRef.current = false;
        return;
      }
      if (elapsed < HOLD_MS + 80 && !movedRef.current) {
        setCaptureMode((m) => (m === 'voice' ? 'camera' : 'voice'));
      }
      return;
    }

    endCapture();
  };

  const cancelPending = () => {
    if (pendingMedia?.url) URL.revokeObjectURL(pendingMedia.url);
    setPendingMedia(null);
  };

  const sendPending = async () => {
    if (!pendingMedia) return;
    const pm = pendingMedia;
    try {
      await Promise.resolve(
        onAddMessage({
          id: `${pm.kind}-${Date.now()}`,
          type: pm.kind,
          out: true,
          time: nowTimeLabel(),
          mediaUrl: pm.url,
          ...(pm.kind === 'audio' && pm.durationSec != null ? { durationSec: pm.durationSec } : {}),
          ...(pm.kind === 'video' && pm.videoNote ? { videoNote: true } : {}),
        })
      );
      setPendingMedia(null);
      if (pm.kind === 'video' && pm.videoNote) setCaptureMode('voice');
      scrollToBottom?.();
    } catch {
      /* yuklash xatosi — oldindan ko‘rishda qoladi */
    }
  };

  const onFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of [...files]) {
      const url = URL.createObjectURL(file);
      let type = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';
      try {
        await Promise.resolve(
          onAddMessage({
            id: `f-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type,
            out: true,
            time: nowTimeLabel(),
            mediaUrl: url,
            fileName: file.name,
          })
        );
      } catch {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }
    }
    e.target.value = '';
    scrollToBottom?.();
  };

  const hasText = chatInput.trim().length > 0;
  const showPlaneSend = hasText;

  const syncSelectionFromInput = useCallback(() => {
    const el = inputRef.current;
    if (!el || typeof el.selectionStart !== 'number') return;
    savedSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
  }, []);

  const insertEmojiAtCursor = useCallback(
    (emoji) => {
      const cur = chatInput;
      let { start, end } = savedSelectionRef.current;
      start = Math.min(Math.max(0, start), cur.length);
      end = Math.min(Math.max(start, end), cur.length);
      const before = cur.slice(0, start);
      const after = cur.slice(end);
      const next = before + emoji + after;
      setChatInput(next);
      const pos = start + emoji.length;
      savedSelectionRef.current = { start: pos, end: pos };
      requestAnimationFrame(() => {
        const inp = inputRef.current;
        if (!inp) return;
        inp.focus();
        try {
          inp.setSelectionRange(pos, pos);
        } catch (_) {}
      });
    },
    [chatInput, setChatInput]
  );

  useEffect(() => {
    if (!emojiPickerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setEmojiPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emojiPickerOpen]);

  const emojiPickerGrid = (
    <div className="picker-tg-emoji-picker-grid" role="listbox">
      {PICKER_EMOJI_LIST.map((ch, idx) => (
        <button
          key={`e-${idx}`}
          type="button"
          role="option"
          className="picker-tg-emoji-cell"
          title={ch}
          onClick={() => {
            insertEmojiAtCursor(ch);
          }}
        >
          {ch}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={`picker-tg-compose-wrap${captureMode === 'camera' ? ' picker-tg-compose-wrap--camera' : ''}${
        emojiPickerOpen && isComposeMobileLayout ? ' picker-tg-compose-wrap--emoji-open' : ''
      }`}
    >
      {attachMenuOpen && (
        <>
          <div
            className="picker-tg-attach-backdrop"
            aria-hidden
            onClick={() => setAttachMenuOpen(false)}
          />
          <div className="picker-tg-attach-sheet" role="menu" aria-label={t.composePlusMenuAria}>
            <button
              type="button"
              role="menuitem"
              className="picker-tg-attach-item"
              onClick={() => {
                galleryInputRef.current?.click();
                setAttachMenuOpen(false);
              }}
            >
              <span className="picker-tg-attach-item-icon" aria-hidden>
                <AttachIconGallery />
              </span>
              <span>{t.composePlusGallery}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="picker-tg-attach-item"
              onClick={() => {
                photoCaptureRef.current?.click();
                setAttachMenuOpen(false);
              }}
            >
              <span className="picker-tg-attach-item-icon" aria-hidden>
                <AttachIconCamera />
              </span>
              <span>{t.composePlusPhoto}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="picker-tg-attach-item"
              onClick={() => {
                videoPickRef.current?.click();
                setAttachMenuOpen(false);
              }}
            >
              <span className="picker-tg-attach-item-icon" aria-hidden>
                <AttachIconVideo />
              </span>
              <span>{t.composePlusVideo}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="picker-tg-attach-item"
              onClick={() => {
                fileInputRef.current?.click();
                setAttachMenuOpen(false);
              }}
            >
              <span className="picker-tg-attach-item-icon" aria-hidden>
                <AttachIconFile />
              </span>
              <span>{t.composePlusFile}</span>
            </button>
          </div>
        </>
      )}
      {replyTo && (
        <div className="picker-tg-reply-compose-bar">
          <div className="picker-tg-reply-compose-text">
            <span className="picker-tg-reply-compose-label">{t.composeReply}</span>
            <span className="picker-tg-reply-compose-snippet">{replyTo.snippet}</span>
          </div>
          <button type="button" className="picker-tg-reply-compose-close" onClick={onClearReply} aria-label={t.composeReplyCloseAria}>
            ×
          </button>
        </div>
      )}

      {captureMode === 'camera' && (
        <div className={`picker-tg-video-box--note ${isRecording ? 'picker-tg-video-box--on' : ''}`}>
          <div className="picker-tg-video-round-inner">
            <video id="picker-tg-video-preview" className="picker-tg-video-el picker-tg-video-el--note" playsInline muted />
            {!isRecording && (
              <p className="picker-tg-video-hint picker-tg-video-hint--note">{t.composeVideoHint}</p>
            )}
          </div>
        </div>
      )}

      {isRecording && (
        <div
          className={`picker-tg-rec-bar ${recordLocked ? 'picker-tg-rec-bar--locked' : ''} ${captureMode === 'camera' ? 'picker-tg-rec-bar--video' : ''}`}
        >
          <span className="picker-tg-rec-dot" />
          {captureMode !== 'camera' && (
            <span className="picker-tg-rec-time">{formatRec(recSeconds)}</span>
          )}
          <span className="picker-tg-rec-hint">
            {captureMode === 'camera'
              ? t.composeVideoPlaneHint
              : recordLocked
                ? t.composeRecLock
                : t.composeRecSwipe}
          </span>
        </div>
      )}

      {pendingMedia && (
        <div className="picker-tg-pending">
          {pendingMedia.kind === 'audio' && <audio controls src={pendingMedia.url} className="picker-tg-pending-audio" />}
          {pendingMedia.kind === 'video' && (
            <div className={pendingMedia.videoNote ? 'picker-tg-pending-video-round' : ''}>
              <video
                controls
                src={pendingMedia.url}
                className={`picker-tg-pending-video${pendingMedia.videoNote ? ' picker-tg-pending-video--note' : ''}`}
                playsInline
              />
            </div>
          )}
          <div className="picker-tg-pending-actions">
            <button type="button" className="picker-tg-pending-trash" onClick={cancelPending} aria-label={t.composeCancelAria}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2m-1 13V9H9v10M12 9v10" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" className="picker-tg-pending-send" onClick={sendPending} aria-label={t.composeSendAria}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {emojiPickerOpen && isComposeMobileLayout && (
        <>
          <div
            className="picker-tg-emoji-backdrop"
            aria-hidden
            onClick={() => setEmojiPickerOpen(false)}
          />
          <div
            className="picker-tg-emoji-picker picker-tg-emoji-picker--inline"
            role="dialog"
            aria-modal="true"
            aria-label={t.composeEmojiPickerAria}
          >
            {emojiPickerGrid}
          </div>
        </>
      )}

      {emojiPickerOpen && !isComposeMobileLayout && (
        <>
          <div
            className="picker-tg-attach-backdrop"
            aria-hidden
            onClick={() => setEmojiPickerOpen(false)}
          />
          <div
            className="picker-tg-emoji-picker picker-tg-emoji-picker--floating"
            role="dialog"
            aria-modal="true"
            aria-label={t.composeEmojiPickerAria}
          >
            {emojiPickerGrid}
          </div>
        </>
      )}

      <div className="picker-tg-compose">
        <input
          ref={fileInputRef}
          type="file"
          className="picker-tg-file-input"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip"
          onChange={onFiles}
        />
        <input
          ref={galleryInputRef}
          type="file"
          className="picker-tg-file-input"
          multiple
          accept="image/*,video/*"
          onChange={onFiles}
        />
        <input
          ref={photoCaptureRef}
          type="file"
          className="picker-tg-file-input"
          accept="image/*"
          capture="environment"
          onChange={onFiles}
        />
        <input
          ref={videoPickRef}
          type="file"
          className="picker-tg-file-input"
          accept="video/*"
          onChange={onFiles}
        />

        <button
          type="button"
          className="picker-tg-compose-btn picker-tg-plus-btn"
          aria-label={t.composeMediaAria}
          aria-expanded={attachMenuOpen}
          onClick={() => {
            setEmojiPickerOpen(false);
            setAttachMenuOpen((o) => !o);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button
          type="button"
          className="picker-tg-compose-btn picker-tg-emoji-btn"
          aria-label={t.composeEmojiAria}
          aria-expanded={emojiPickerOpen}
          aria-haspopup="dialog"
          onPointerDown={() => {
            const el = inputRef.current;
            if (el && typeof el.selectionStart === 'number') {
              savedSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
            }
          }}
          onClick={() => {
            setAttachMenuOpen(false);
            setEmojiPickerOpen((o) => !o);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.2 1.5 4 1.5 4-1.5 4-1.5" />
            <path d="M9 9h.01M15 9h.01" />
          </svg>
        </button>

        <div className="picker-tg-input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="picker-tg-input"
            placeholder={t.composePlaceholder}
            value={chatInput}
            onChange={(e) => {
              setChatInput(e.target.value);
              savedSelectionRef.current = {
                start: e.target.selectionStart ?? e.target.value.length,
                end: e.target.selectionEnd ?? e.target.value.length,
              };
            }}
            onSelect={syncSelectionFromInput}
            onKeyUp={syncSelectionFromInput}
            onClick={syncSelectionFromInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasText) onSendText();
            }}
            aria-label={t.composeInputAria}
          />
        </div>

        {showPlaneSend ? (
          <button type="button" className="picker-tg-compose-btn picker-tg-send" aria-label={t.composeSendPlaneAria} onClick={onSendText}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={`picker-tg-compose-btn picker-tg-capture-btn ${
              isRecording && captureMode === 'voice' ? 'picker-tg-capture-btn--rec' : ''
            } ${captureMode === 'camera' && !isRecording ? 'picker-tg-capture-btn--cam' : ''} ${
              isRecording && captureMode === 'camera' ? 'picker-tg-capture-btn--plane' : ''
            }`}
            aria-label={
              isRecording && captureMode === 'camera'
                ? t.composeVideoSendPlaneAria
                : captureMode === 'voice'
                  ? t.composeCaptureVoiceAria
                  : t.composeCaptureCamAria
            }
            onPointerDown={onCapturePointerDown}
            onPointerMove={onCapturePointerMove}
            onPointerUp={onCapturePointerUp}
            onPointerCancel={onCapturePointerUp}
          >
            {captureMode === 'voice' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
              </svg>
            ) : isRecording ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
