import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const MAX_STORY_MS = 60_000;
const MAX_STORY_SEC = Math.floor(MAX_STORY_MS / 1000);

/**
 * Hikoya: kamera → yozish → foydalanuvchi istagan vaqtda to‘xtatadi (maks. MAX_STORY_MS).
 */
export default function PickerStoryRecorder({ open, onClose, onComplete, t }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const maxTimerRef = useRef(null);
  const tickRef = useRef(null);
  const discardRef = useRef(false);

  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  /** `environment` — orqa, `user` — old (selfi) */
  const [facingMode, setFacingMode] = useState('environment');

  const stopStreams = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      discardRef.current = false;
      setPhase('idle');
      setError('');
      setElapsedSec(0);
      setFacingMode('environment');
      clearTimers();
      stopStreams();
      chunksRef.current = [];
      if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
        try {
          mediaRecRef.current.stop();
        } catch (_) {}
      }
      mediaRecRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      setPhase('request');
      setError('');
      try {
        stopStreams();
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 720 },
              height: { ideal: 1280 },
            },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: { facingMode: { ideal: facingMode } },
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          }
        }
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play?.().catch(() => {});
        }
        if (!cancelled) setPhase('preview');
      } catch (e) {
        if (!cancelled) {
          setError(String(e?.message || e || 'camera'));
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStreams();
    };
  }, [open, facingMode, clearTimers, stopStreams]);

  const finishWithBlob = useCallback(
    (blob) => {
      clearTimers();
      stopStreams();
      mediaRecRef.current = null;
      chunksRef.current = [];
      setPhase('idle');
      if (discardRef.current) {
        discardRef.current = false;
        onClose();
        return;
      }
      if (blob && blob.size > 0) onComplete?.(blob);
      onClose();
    },
    [clearTimers, stopStreams, onComplete, onClose]
  );

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    discardRef.current = false;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    const mr = mime ? new MediaRecorder(streamRef.current, { mimeType: mime }) : new MediaRecorder(streamRef.current);
    mediaRecRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/webm' });
      finishWithBlob(blob);
    };
    mr.start(100);
    setPhase('recording');
    setElapsedSec(0);
    const t0 = Date.now();
    tickRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 250);
    maxTimerRef.current = setTimeout(() => {
      if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
        try {
          mediaRecRef.current.stop();
        } catch (_) {}
      }
    }, MAX_STORY_MS);
  }, [finishWithBlob]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecRef.current;
    if (mr && mr.state === 'recording') {
      try {
        mr.stop();
      } catch (_) {
        finishWithBlob(new Blob([], { type: 'video/webm' }));
      }
    }
  }, [finishWithBlob]);

  const cancelAll = useCallback(() => {
    discardRef.current = true;
    clearTimers();
    const mr = mediaRecRef.current;
    if (mr && mr.state === 'recording') {
      try {
        mr.stop();
      } catch (_) {
        stopStreams();
        mediaRecRef.current = null;
        chunksRef.current = [];
        setPhase('idle');
        discardRef.current = false;
        onClose();
      }
    } else {
      stopStreams();
      mediaRecRef.current = null;
      chunksRef.current = [];
      setPhase('idle');
      discardRef.current = false;
      onClose();
    }
  }, [clearTimers, stopStreams, onClose]);

  if (!open) return null;

  const remaining = Math.max(0, 60 - elapsedSec);

  return createPortal(
    <div className="picker-story-recorder-overlay" role="presentation" onClick={cancelAll}>
      <div
        className="picker-story-recorder-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.storyRecorderTitle}
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'error' ? (
          <p className="picker-story-recorder-error" role="alert">
            {t.storyRecorderErr}: {error}
          </p>
        ) : (
          <div className="picker-story-recorder-stack">
            <video ref={videoRef} className="picker-story-recorder-video" playsInline muted autoPlay controls={false} />
            <div className="picker-story-recorder-chrome">
              <div className="picker-story-recorder-chrome-top">
                <button
                  type="button"
                  className="picker-story-recorder-flip"
                  disabled={phase === 'recording' || phase === 'request'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
                  }}
                  aria-label={t.storyRecorderFlipCamera || 'Switch camera'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                <button type="button" className="picker-story-recorder-close" onClick={cancelAll} aria-label={t.storyRecorderClose}>
                  ×
                </button>
              </div>
              <div className="picker-story-recorder-chrome-bottom">
                {phase === 'request' ? <p className="picker-story-recorder-hint">{t.storyRecorderCameraOpen}</p> : null}
                {phase === 'preview' ? (
                  <div className="picker-story-recorder-actions">
                    <button type="button" className="picker-story-recorder-primary" onClick={startRecording}>
                      {t.storyRecorderStart}
                    </button>
                  </div>
                ) : null}
                {phase === 'recording' ? (
                  <div className="picker-story-recorder-recording">
                    <button
                      type="button"
                      className="picker-story-recorder-place picker-story-recorder-place--recording"
                      onClick={stopRecording}
                      aria-label={`${t.storyRecorderPlace || t.storyRecorderStop} · ${remaining}s`}
                    >
                      <span className="picker-story-recorder-place-seconds-row">
                        <span className="picker-story-recorder-place-num" aria-live="polite">
                          {remaining}
                        </span>
                        <span className="picker-story-recorder-place-sunit" aria-hidden>
                          s
                        </span>
                      </span>
                      <span className="picker-story-recorder-place-caption">{t.storyRecorderPlace || t.storyRecorderStop}</span>
                    </button>
                  </div>
                ) : null}
                <p className="picker-story-recorder-maxhint">
                  {(t.storyRecorderMaxHint || '').replace(/\{max\}/g, String(MAX_STORY_SEC))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
