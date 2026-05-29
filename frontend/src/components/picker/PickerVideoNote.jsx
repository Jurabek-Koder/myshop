import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Dumaloq video xabar: kichik aylana; faqat ijro paytida kattalashadi.
 * Pauza yoki tugaganda kichrayadi; tugaganda boshiga qaytadi.
 */
export default function PickerVideoNote({ src, out, sentTitle, playAria }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const resumeIntentRef = useRef(false);

  useEffect(() => {
    setPlaying(false);
  }, [src]);

  const primeFirstFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || playing) return;
    const run = () => {
      try {
        v.pause();
        v.currentTime = Math.min(0.08, (v.duration || 1) * 0.02 || 0.08);
      } catch (_) {}
    };
    if (v.readyState >= 2) run();
    else v.addEventListener('loadeddata', run, { once: true });
  }, [playing]);

  useEffect(() => {
    primeFirstFrame();
  }, [src, primeFirstFrame]);

  const handleOpen = (e) => {
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
      v.play().catch(() => {
        try {
          v.muted = true;
        } catch (_) {}
        v.play().catch(() => {});
      });
    });
  };

  return (
    <div className={`picker-tg-video-note-shell ${playing ? 'picker-tg-video-note-shell--playing' : ''}`}>
      <video
        ref={videoRef}
        src={src}
        className="picker-tg-msg-video picker-tg-msg-video--note"
        playsInline
        preload="auto"
        muted={!playing}
        controls={false}
        onClick={(e) => {
          if (!playing) return;
          e.stopPropagation();
          const v = e.currentTarget;
          if (v.paused) void v.play();
          else v.pause();
        }}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          try {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          } catch (_) {}
        }}
      />
      {!playing && (
        <>
          <div className="picker-tg-video-note-scrim" aria-hidden />
          <button
            type="button"
            className="picker-tg-video-note-open"
            onClick={handleOpen}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={playAria}
          >
            <svg className="picker-tg-video-note-arrow" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
              <path
                fill="currentColor"
                d="M12 17.2L4.6 9.8l1.4-1.4 6 6 6-6 1.4 1.4L12 17.2z"
              />
            </svg>
          </button>
        </>
      )}
      {out && (
        <span className="picker-tg-video-note-checks" aria-hidden title={sentTitle}>
          <svg width="19" height="11" viewBox="0 0 19 11" fill="none" className="picker-tg-check-svg">
            <path d="M1 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 5.5l2.5 2.5L18 1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}
