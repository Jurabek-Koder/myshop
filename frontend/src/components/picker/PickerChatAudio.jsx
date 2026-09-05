import React, { useRef, useState, useEffect, useCallback } from 'react';

const WAVE_BARS = 32;

/**
 * Ovozli xabar: 250px fon, 240px ichki — play + ekvalayzer (progress chiziq emas).
 */
export default function PickerChatAudio({ src, playAria, pauseAria }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const syncProgress = useCallback(() => {
    const a = audioRef.current;
    if (!a?.duration) {
      setProgress(0);
      return;
    }
    setProgress(Math.min(1, a.currentTime / a.duration));
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      try {
        a.pause();
        a.currentTime = 0;
      } catch (_) {}
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', syncProgress);
    a.addEventListener('ended', onEnded);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', syncProgress);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, [src, syncProgress]);

  const toggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play().catch(() => {});
    }
  };

  const playheadIndex = Math.floor(progress * WAVE_BARS);

  return (
    <div className="picker-tg-audio-card">
      <audio ref={audioRef} src={src} preload="metadata" className="picker-tg-audio-el" />
      <div className="picker-tg-audio-inner">
        <button
          type="button"
          className="picker-tg-audio-play"
          onClick={toggle}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={playing ? pauseAria : playAria}
        >
          {playing ? (
            <svg className="picker-tg-audio-play-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg className="picker-tg-audio-play-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>
        <div
          className={`picker-tg-audio-wave${playing ? ' picker-tg-audio-wave--playing' : ''}`}
          aria-hidden
        >
          {Array.from({ length: WAVE_BARS }, (_, i) => (
            <span
              key={i}
              className={`picker-tg-audio-wave-bar${i < playheadIndex ? ' picker-tg-audio-wave-bar--past' : ''}`}
              style={{ animationDelay: `${(i * 0.035).toFixed(3)}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
