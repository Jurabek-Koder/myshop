import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'myshop-read-message-ids';
const _base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const API = _base ? `${_base}/api` : '/api';

const KIND_LABELS = {
  convenience: 'Qulaylik',
  promo: 'Aksiya',
  new_product: 'Yangi mahsulot',
};

function loadReadIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function useNarrowNavLayout() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 991px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 991px)');
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export default function SiteMessages() {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState(loadReadIds);
  const [messages, setMessages] = useState([]);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const narrowLayout = useNarrowNavLayout();

  // API dan xabarlarni yuklash
  useEffect(() => {
    fetch(`${API}/site-messages`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.messages?.length) {
          setMessages(data.messages);
        }
      })
      .catch(() => {
        // API ishlamasa xabar ko'rsatmaymiz
      });
  }, []);

  const unreadCount = useMemo(
    () => messages.filter((m) => !readIds.includes(String(m.id))).length,
    [readIds, messages]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
  }, [readIds]);

  const markRead = useCallback((id) => {
    setReadIds((prev) => (prev.includes(String(id)) ? prev : [...prev, String(id)]));
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const inWrap = wrapRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inWrap && !inPanel) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !narrowLayout) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, narrowLayout]);

  if (messages.length === 0) return null;

  const listMarkup = (
    <ul className="site-messages-list">
      {messages.map((msg) => {
        const isUnread = !readIds.includes(String(msg.id));
        return (
          <li key={msg.id}>
            <button
              type="button"
              className={`site-messages-item${isUnread ? ' site-messages-item--unread' : ''}`}
              onClick={() => markRead(msg.id)}
            >
              <span className="site-messages-kind">{KIND_LABELS[msg.kind] || msg.kind}</span>
              <span className="site-messages-item-title">{msg.title}</span>
              <span className="site-messages-item-body">{msg.body}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const mobileSheet = open && narrowLayout && (
    <>
      <div className="site-messages-backdrop" onClick={close} role="presentation" aria-hidden />
      <div
        className="site-messages-panel site-messages-panel--mobile-sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-messages-modal-heading"
      >
        <div className="site-messages-modal-header">
          <div className="site-messages-modal-title" id="site-messages-modal-heading">
            <i className="fas fa-envelope-open-text" aria-hidden />
            <span>Xabarlar</span>
          </div>
          <button type="button" className="site-messages-modal-close" aria-label="Yopish" onClick={close}>
            <i className="fas fa-times" aria-hidden />
          </button>
        </div>
        <div className="site-messages-panel-inner">{listMarkup}</div>
      </div>
    </>
  );

  return (
    <div className="site-messages-wrap" ref={wrapRef}>
      <button
        type="button"
        className="site-messages-trigger site-messages-trigger--nav"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-bell site-messages-trigger-icon" aria-hidden />
        <span className="site-messages-trigger-label">Xabarlar</span>
        {unreadCount > 0 ? (
          <span className="site-messages-count" aria-label={`O'qilmagan xabarlar: ${unreadCount}`}>
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open && !narrowLayout ? (
        <div className="site-messages-panel" ref={panelRef} role="region" aria-label="Sayt xabarlari">
          <div className="site-messages-panel-inner">{listMarkup}</div>
        </div>
      ) : null}
      {mobileSheet ? createPortal(mobileSheet, document.body) : null}
    </div>
  );
}
