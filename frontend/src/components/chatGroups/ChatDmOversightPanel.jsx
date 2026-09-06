import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(String(iso).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * FAQAT SUPERUSER: xodimlar orasidagi barcha shaxsiy ("Lichka") yozishmalarni
 * kuzatish (faqat o'qish uchun — superuser birov nomidan yozolmaydi).
 * Ombor admini bu panelga umuman kira olmaydi (backend /admin/dm-oversight/*
 * routeri faqat superuser uchun ochiq).
 */
export default function ChatDmOversightPanel() {
  const { request } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request('/admin/dm-oversight/threads');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Yuklanmadi.');
        return;
      }
      setThreads(Array.isArray(d.threads) ? d.threads : []);
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const openThread = useCallback(
    async (thread) => {
      setActiveThread(thread);
      setMessagesLoading(true);
      try {
        const res = await request(`/admin/dm-oversight/messages?threadKey=${encodeURIComponent(thread.threadKey)}`);
        const d = await res.json().catch(() => ({}));
        setMessages(res.ok && Array.isArray(d.messages) ? d.messages : []);
      } catch {
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [request],
  );

  if (activeThread) {
    const [pA, pB] = activeThread.participants;
    return (
      <div className="chat-groups-thread">
        <header className="chat-groups-thread-head">
          <button
            type="button"
            className="chat-groups-thread-back"
            onClick={() => setActiveThread(null)}
            aria-label="Ro'yxatga qaytish"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="chat-groups-thread-title">
            {pA.full_name} ↔ {pB.full_name}
          </h2>
        </header>
        <div className="chat-groups-messages">
          {messagesLoading ? (
            <p className="chat-groups-hint">Yuklanmoqda...</p>
          ) : messages.length === 0 ? (
            <p className="chat-groups-hint">Xabar yo‘q.</p>
          ) : (
            messages.map((m) => {
              const mine = Number(m.sender_user_id) === Number(pA.id);
              return (
                <div key={m.id} className={`chat-groups-msg${mine ? ' chat-groups-msg--mine' : ''}`}>
                  <div className="chat-groups-msg-sender">{m.sender_full_name || m.sender_login}</div>
                  <div className="chat-groups-msg-bubble">
                    <span className="chat-groups-msg-text">
                      {m.message_type === 'text' ? m.body : `[${m.message_type}]`}
                    </span>
                    <span className="chat-groups-msg-time">{formatTime(m.created_at)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="chat-groups-hint chat-groups-oversight-note">
          Faqat kuzatish rejimi — superuser bu yerdan xabar yubora olmaydi.
        </p>
      </div>
    );
  }

  return (
    <div className="chat-groups-rail chat-groups-rail--oversight">
      <header className="chat-groups-rail-head">
        <h1 className="chat-groups-rail-title">Shaxsiy chatlar nazorati</h1>
      </header>
      {error ? <p className="chat-groups-error">{error}</p> : null}
      {loading ? (
        <p className="chat-groups-hint">Yuklanmoqda...</p>
      ) : threads.length === 0 ? (
        <p className="chat-groups-hint">Hozircha shaxsiy yozishmalar yo‘q.</p>
      ) : (
        <ul className="chat-groups-list">
          {threads.map((t) => (
            <li key={t.threadKey}>
              <button type="button" className="chat-groups-list-item" onClick={() => openThread(t)}>
                <span className="chat-groups-list-avatar" aria-hidden>
                  💬
                </span>
                <span className="chat-groups-list-meta">
                  <span className="chat-groups-list-title">
                    {t.participants[0]?.full_name} ↔ {t.participants[1]?.full_name}
                  </span>
                  <span className="chat-groups-member-sub">{t.lastPreview}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
