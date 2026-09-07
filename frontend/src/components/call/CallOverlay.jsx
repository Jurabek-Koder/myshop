import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../../context/CallContext';
import './CallOverlay.css';

function useElapsedSeconds(active) {
  const [sec, setSec] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (!active) {
      setSec(0);
      startRef.current = 0;
      return undefined;
    }
    startRef.current = Date.now();
    const id = window.setInterval(() => setSec(Math.round((Date.now() - startRef.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return sec;
}

function formatDuration(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function VideoTile({ stream, muted, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className="call-video-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      {label ? <span className="call-video-tile-label">{label}</span> : null}
    </div>
  );
}

/**
 * Global qo'ng'iroq UI qatlami — App ildizida BIR MARTA mount qilinadi,
 * shuning uchun foydalanuvchi qaysi sahifada bo'lishidan qat'iy nazar
 * kiruvchi qo'ng'iroqni ko'radi (Telegram/WhatsApp kabi).
 */
export default function CallOverlay() {
  const { callState, localStream, remoteStreams, toast, answerDmCall, declineDmCall, joinGroupCall, declineGroupCall, endCall } =
    useCall();
  const isActive = callState.status === 'dm-active' || callState.status === 'group-active';
  const elapsed = useElapsedSeconds(isActive);

  if (callState.status === 'idle') {
    return toast ? <div className="call-toast">{toast}</div> : null;
  }

  const isVideo = callState.mode === 'video';

  if (callState.status === 'dm-incoming') {
    return (
      <div className="call-overlay call-overlay--ringing">
        <div className="call-ringing-avatar">{(callState.peer?.displayName || '?').slice(0, 1).toUpperCase()}</div>
        <h2 className="call-ringing-name">{callState.peer?.displayName}</h2>
        <p className="call-ringing-sub">{isVideo ? 'Video qo‘ng‘iroq...' : 'Ovozli qo‘ng‘iroq...'}</p>
        <div className="call-ringing-actions">
          <button type="button" className="call-btn call-btn--decline" onClick={declineDmCall} aria-label="Rad etish">
            ✕
          </button>
          <button type="button" className="call-btn call-btn--accept" onClick={answerDmCall} aria-label="Qabul qilish">
            ✓
          </button>
        </div>
      </div>
    );
  }

  if (callState.status === 'dm-outgoing') {
    return (
      <div className="call-overlay call-overlay--ringing">
        <div className="call-ringing-avatar">{(callState.peer?.displayName || '?').slice(0, 1).toUpperCase()}</div>
        <h2 className="call-ringing-name">{callState.peer?.displayName}</h2>
        <p className="call-ringing-sub">Chaqirilmoqda...</p>
        <div className="call-ringing-actions call-ringing-actions--single">
          <button type="button" className="call-btn call-btn--decline" onClick={endCall} aria-label="Bekor qilish">
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (callState.status === 'dm-active') {
    const remote = remoteStreams.get('dm');
    return (
      <div className="call-overlay call-overlay--active">
        {isVideo ? (
          <div className="call-video-grid call-video-grid--single">
            <VideoTile stream={remote} label={callState.peer?.displayName} />
            <div className="call-video-self">
              <VideoTile stream={localStream} muted label="Siz" />
            </div>
          </div>
        ) : (
          <>
            <div className="call-ringing-avatar">{(callState.peer?.displayName || '?').slice(0, 1).toUpperCase()}</div>
            <h2 className="call-ringing-name">{callState.peer?.displayName}</h2>
          </>
        )}
        <p className="call-active-timer">{formatDuration(elapsed)}</p>
        <div className="call-ringing-actions call-ringing-actions--single">
          <button type="button" className="call-btn call-btn--decline" onClick={endCall} aria-label="Tugatish">
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (callState.status === 'group-incoming') {
    return (
      <div className="call-overlay call-overlay--ringing">
        <div className="call-ringing-avatar">{(callState.group?.title || '?').slice(0, 1).toUpperCase()}</div>
        <h2 className="call-ringing-name">{callState.group?.title}</h2>
        <p className="call-ringing-sub">
          {callState.fromName} {isVideo ? 'video qo‘ng‘iroq boshladi' : 'ovozli qo‘ng‘iroq boshladi'}
        </p>
        <div className="call-ringing-actions">
          <button type="button" className="call-btn call-btn--decline" onClick={declineGroupCall} aria-label="Rad etish">
            ✕
          </button>
          <button type="button" className="call-btn call-btn--accept" onClick={joinGroupCall} aria-label="Qo‘shilish">
            ✓
          </button>
        </div>
      </div>
    );
  }

  if (callState.status === 'group-active') {
    const participants = callState.participants || new Map();
    return (
      <div className="call-overlay call-overlay--active">
        <p className="call-group-title">{callState.group?.title}</p>
        <div className="call-video-grid">
          <VideoTile stream={localStream} muted label="Siz" />
          {[...participants.entries()].map(([uid, p]) => (
            <VideoTile key={uid} stream={remoteStreams.get(uid)} label={p.name} />
          ))}
        </div>
        {callState.offline?.length ? (
          <p className="call-group-note">{callState.offline.length} kishi oflayn — ular xabar sifatida ko‘radi.</p>
        ) : null}
        <p className="call-active-timer">{formatDuration(elapsed)}</p>
        <div className="call-ringing-actions call-ringing-actions--single">
          <button type="button" className="call-btn call-btn--decline" onClick={endCall} aria-label="Chiqish">
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
