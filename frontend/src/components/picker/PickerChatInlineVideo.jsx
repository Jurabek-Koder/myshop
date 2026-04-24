import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Oddiy video xabar: kichik; faqat ijro vaqtida kattalashadi. Tugaganda kichrayadi va boshiga qaytadi.
 */
export default function PickerChatInlineVideo({ src, playAria }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const resumeIntentRef = useRef(false);

  useEffect(() => {
    setPlaying(false);
  }, [src]);

  const startPlay = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      const v = videoRef.current;
      if (!v) return;
      const atEnd = v.duration && v.currentTime >= v.duration - 0.15;
      const mid = v.currentTime > 0.15;
      resumeIntentRef.current = mid && !atEnd;
      setPlaying(true);
      requestAnimationFrame(() => {
        if (!resumeIntentRef.current) {
          try {
            v.currentTime = 0;
          } catch (_) {}
        }
        resumeIntentRef.current = false;
        try {
          v.muted = false;
        } catch (_) {}
        void v.play().catch(() => {
          try {
            v.muted = true;
          } catch (_) {}
          void v.play().catch(() => {});
        });
      });
    },
    []
  );

  return (
    <div className={`picker-tg-inline-video-wrap${playing ? ' picker-tg-inline-video-wrap--playing' : ''}`}>
      <video
        ref={videoRef}
        src={src}
        className="picker-tg-msg-video picker-tg-msg-video--inline"
        playsInline
        preload="metadata"
        controls={playing}
        muted={!playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          try {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          } catch (_) {}
        }}
        onClick={(e) => {
          if (!playing) return;
          e.stopPropagation();
        }}
      />
      {!playing && (
        <button
          type="button"
          className="picker-tg-inline-video-open"
          onClick={startPlay}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={playAria}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.45)" />
            <path fill="#fff" d="M10 8v8l6-4-6-4z" />
          </svg>
        </button>
      )}
    </div>
  );
}
