import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'myshop-read-message-ids';

/** Sayt xabarlari: qulayliklar, aksiyalar, yangi mahsulotlar (keyinroq API bilan almashtirish mumkin) */
const SITE_MESSAGES = [
  {
    id: 'conv-1',
    kind: 'convenience',
    title: 'Tezkor buyurtma va kuzatish',
    body: 'Buyurtmangiz holatini «Buyurtmalarim» bo‘limidan real vaqtga yaqin kuzatishingiz mumkin.',
  },
  {
    id: 'promo-1',
    kind: 'promo',
    title: 'Aksiya: 500 000 so‘mdan ortiq bepul yetkazib berish',
    body: 'Shu oy ichida belgilangan summadan oshgan har bir buyurtmada yetkazib berish narxi qoplanadi.',
  },
  {
    id: 'new-1',
    kind: 'new_product',
    title: 'Yangi mahsulotlar katalogga qo‘shildi',
    body: '«Mahsulotlar» bo‘limida yangi toifadagi mahsulotlarni ko‘rib chiqing.',
  },
  {
    id: 'conv-2',
    kind: 'convenience',
    title: 'Xavfsiz to‘lov',
    body: 'To‘lovlar shifrlangan kanal orqali qabul qilinadi; ma’lumotlaringiz himoyalangan.',
  },
  {
    id: 'promo-2',
    kind: 'promo',
    title: 'Aksiyali mahsulotlar',
    body: '«Aksiya» sahifasida chegirmali narxlar bilan tanishing.',
  },
];

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
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const narrowLayout = useNarrowNavLayout();

  const unreadCount = useMemo(
    () => SITE_MESSAGES.filter((m) => !readIds.includes(m.id)).length,
    [readIds]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
  }, [readIds]);

  const markRead = useCallback((id) => {
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
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

  const listMarkup = (
    <ul className="site-messages-list">
      {SITE_MESSAGES.map((msg) => {
        const isUnread = !readIds.includes(msg.id);
        return (
          <li key={msg.id}>
            <button
              type="button"
              className={`site-messages-item${isUnread ? ' site-messages-item--unread' : ''}`}
              onClick={() => markRead(msg.id)}
            >
              <span className="site-messages-kind">{KIND_LABELS[msg.kind]}</span>
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
          <span className="site-messages-count" aria-label={`O‘qilmagan xabarlar: ${unreadCount}`}>
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
