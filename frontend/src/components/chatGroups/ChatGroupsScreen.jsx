import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import ChatGroupMembersPanel from './ChatGroupMembersPanel.jsx';
import ChatGroupCreateModal from './ChatGroupCreateModal.jsx';
import './ChatGroups.css';

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(String(iso).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Rol-asosidagi guruh chatlari: superuser/ombor admin bir nechta guruhni ko'radi
 * (ro'yxat + tanlangan guruh yozishmalari), oddiy xodim faqat o'zining bitta
 * guruhiga to'g'ridan-to'g'ri kiradi. Guruh admini (superuser/ombor admin/
 * guruh ichida admin qilib tayinlangan) a'zolarni boshqarishi mumkin.
 */
export default function ChatGroupsScreen({ onExit, onMessageUser }) {
  const { request, user } = useAuth();
  const { startGroupCall } = useCall();
  const isSuperuser = String(user?.role || '').toLowerCase() === 'superuser' || Number(user?.role_id) === 1;

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await request('/chat-groups');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Guruhlar yuklanmadi.');
        setGroups([]);
        return;
      }
      setGroups(Array.isArray(d.groups) ? d.groups : []);
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setGroupsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Oddiy xodim uchun (bitta guruhi bo'lsa) — to'g'ridan-to'g'ri o'sha guruhga kiramiz.
  useEffect(() => {
    if (!groupsLoading && groups.length === 1 && activeGroupId == null) {
      setActiveGroupId(groups[0].id);
    }
  }, [groupsLoading, groups, activeGroupId]);

  const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId) || null, [groups, activeGroupId]);
  const canManage = activeGroup?.my_member_role === 'admin';

  const loadMessages = useCallback(
    async (groupId, silent = false) => {
      if (!groupId) return;
      if (!silent) setMessagesLoading(true);
      try {
        const res = await request(`/chat-groups/${groupId}/messages`);
        const d = await res.json().catch(() => ({}));
        if (res.ok) setMessages(Array.isArray(d.messages) ? d.messages : []);
      } catch {
        /* jim - poll davom etadi */
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!activeGroupId) {
      setMessages([]);
      return undefined;
    }
    loadMessages(activeGroupId, false);
    pollRef.current = setInterval(() => loadMessages(activeGroupId, true), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeGroupId, loadMessages]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const sendMessage = useCallback(
    async (e) => {
      e?.preventDefault?.();
      const body = text.trim();
      if (!body || !activeGroupId || sending) return;
      setSending(true);
      const cid = `cg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Optimistik ko'rsatish — javob kutmasdan darhol ekranga chiqaramiz.
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${cid}`,
          client_message_id: cid,
          sender_user_id: user?.id,
          sender_full_name: user?.full_name || user?.login || 'Men',
          message_type: 'text',
          body,
          created_at: new Date().toISOString(),
          _pending: true,
        },
      ]);
      setText('');
      try {
        const res = await request(`/chat-groups/${activeGroupId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ clientMessageId: cid, text: body, messageType: 'text' }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d?.error || 'Yuborilmadi.');
        }
      } catch {
        setError('Tarmoq xatosi.');
      } finally {
        setSending(false);
        loadMessages(activeGroupId, true);
      }
    },
    [text, activeGroupId, sending, request, user, loadMessages],
  );

  const showGroupList = groups.length > 1 || isSuperuser;

  return (
    <main className="chat-groups-main">
      {createOpen ? (
        <ChatGroupCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            loadGroups();
          }}
        />
      ) : null}

      <div className={`chat-groups-layout${activeGroupId != null ? ' chat-groups-layout--thread-open' : ''}`}>
        {(showGroupList || !activeGroupId) && (
          <aside className="chat-groups-rail">
            <header className="chat-groups-rail-head">
              {onExit ? (
                <button type="button" className="chat-groups-rail-back" onClick={onExit} aria-label="Orqaga">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
              <h1 className="chat-groups-rail-title">Guruhlar</h1>
              {isSuperuser ? (
                <button
                  type="button"
                  className="chat-groups-rail-add"
                  onClick={() => setCreateOpen(true)}
                  title="Yangi guruh"
                  aria-label="Yangi guruh yaratish"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </header>
            {error ? <p className="chat-groups-error">{error}</p> : null}
            {groupsLoading ? (
              <p className="chat-groups-hint">Yuklanmoqda...</p>
            ) : groups.length === 0 ? (
              <p className="chat-groups-hint">Hozircha guruh yo‘q.</p>
            ) : (
              <ul className="chat-groups-list">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={`chat-groups-list-item${g.id === activeGroupId ? ' chat-groups-list-item--active' : ''}`}
                      onClick={() => setActiveGroupId(g.id)}
                    >
                      <span className="chat-groups-list-avatar" aria-hidden>
                        {(g.title || '?').trim().slice(0, 1).toUpperCase()}
                      </span>
                      <span className="chat-groups-list-meta">
                        <span className="chat-groups-list-title">{g.title}</span>
                        {g.my_member_role === 'admin' ? (
                          <span className="chat-groups-list-badge">admin</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {activeGroupId ? (
          <section className="chat-groups-thread">
            <header className="chat-groups-thread-head">
              {showGroupList ? (
                <button
                  type="button"
                  className="chat-groups-thread-back"
                  onClick={() => setActiveGroupId(null)}
                  aria-label="Ro'yxatga qaytish"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : onExit ? (
                <button type="button" className="chat-groups-thread-back" onClick={onExit} aria-label="Orqaga">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
              <h2 className="chat-groups-thread-title">{activeGroup?.title || 'Guruh'}</h2>
              <button
                type="button"
                className="chat-groups-thread-members-btn"
                onClick={() => startGroupCall(activeGroup, 'voice')}
                title="Ovozli qo'ng'iroq"
                aria-label="Guruhga ovozli qo'ng'iroq"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
              </button>
              <button
                type="button"
                className="chat-groups-thread-members-btn"
                onClick={() => startGroupCall(activeGroup, 'video')}
                title="Video qo'ng'iroq"
                aria-label="Guruhga video qo'ng'iroq"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
                  <path d="M23 7l-7 5 7 5V7z" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {canManage ? (
                <button
                  type="button"
                  className="chat-groups-thread-members-btn"
                  onClick={() => setMembersOpen(true)}
                  title="A'zolar"
                  aria-label="A'zolarni boshqarish"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path
                      d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M15 7a4 4 0 11-8 0 4 4 0 018 0zM23 20v-1a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
            </header>

            <div className="chat-groups-messages">
              {messagesLoading ? (
                <p className="chat-groups-hint">Yuklanmoqda...</p>
              ) : messages.length === 0 ? (
                <p className="chat-groups-hint">Hali xabar yo‘q. Birinchi bo‘lib yozing!</p>
              ) : (
                messages.map((m) => {
                  const mine = Number(m.sender_user_id) === Number(user?.id);
                  if (m.message_type === 'call_log') {
                    let payload = {};
                    try {
                      payload = m.payload_json ? JSON.parse(m.payload_json) : {};
                    } catch {
                      payload = {};
                    }
                    const missed = ['missed_offline', 'no_answer', 'declined', 'cancelled'].includes(payload.status);
                    const icon = payload.mode === 'video' ? '📹' : '📞';
                    const dur = payload.durationSeconds || 0;
                    const durText = dur ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '';
                    const statusText =
                      {
                        ended: durText ? `Suhbat davomiyligi ${durText}` : 'Tugadi',
                        missed_offline: 'Ba’zilar oflayn edi',
                        no_answer: 'Javob berilmadi',
                      }[payload.status] || '';
                    return (
                      <div key={m.id} className="chat-groups-call-log-row">
                        <div className={`chat-groups-call-log${missed ? ' chat-groups-call-log--missed' : ''}`}>
                          <span
                            className={`chat-groups-call-log-icon ${missed ? 'chat-groups-call-log-icon--missed' : 'chat-groups-call-log-icon--ok'}`}
                          >
                            {icon}
                          </span>
                          <span className="chat-groups-call-log-text">
                            <span className={`chat-groups-call-log-title${missed ? ' chat-groups-call-log-title--missed' : ''}`}>
                              {m.sender_full_name || m.sender_login} guruh qo‘ng‘iroq boshladi
                            </span>
                            <span className="chat-groups-call-log-sub">
                              {statusText} · {formatTime(m.created_at)}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className={`chat-groups-msg${mine ? ' chat-groups-msg--mine' : ''}${m._pending ? ' chat-groups-msg--pending' : ''}`}
                    >
                      {!mine ? <div className="chat-groups-msg-sender">{m.sender_full_name || m.sender_login}</div> : null}
                      <div className="chat-groups-msg-bubble">
                        <span className="chat-groups-msg-text">{m.body}</span>
                        <span className="chat-groups-msg-time">{formatTime(m.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={listEndRef} />
            </div>

            <form className="chat-groups-composer" onSubmit={sendMessage}>
              <input
                className="chat-groups-composer-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Xabar yozing..."
                maxLength={4000}
              />
              <button type="submit" className="chat-groups-composer-send" disabled={!text.trim() || sending}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </section>
        ) : !showGroupList ? (
          <section className="chat-groups-thread chat-groups-thread--empty">
            <p className="chat-groups-hint">{groupsLoading ? 'Yuklanmoqda...' : 'Guruh topilmadi.'}</p>
          </section>
        ) : (
          <section className="chat-groups-thread chat-groups-thread--empty">
            <p className="chat-groups-hint">Chapdan guruhni tanlang.</p>
          </section>
        )}
      </div>

      {membersOpen && activeGroup ? (
        <ChatGroupMembersPanel
          group={activeGroup}
          onClose={() => setMembersOpen(false)}
          onMessageUser={
            onMessageUser
              ? (peer) => {
                  setMembersOpen(false);
                  onMessageUser(peer);
                }
              : undefined
          }
          currentUserId={user?.id}
        />
      ) : null}
    </main>
  );
}
