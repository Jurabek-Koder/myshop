import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import './NotificationInboxPanel.css';

/**
 * Bildirishnomalar — navbat bilan bitta xabar, ekran markazida to‘liq panel.
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array} props.notifications
 * @param {(id: number) => void|Promise<void>} [props.onMarkRead]
 * @param {(n: object) => React.ReactNode|null} [props.renderActions] — «Tasdiqlash» va boshqalar
 * @param {(n: object) => void|Promise<void>} [props.onDismiss] — e’tiborsiz (default: mark read)
 * @param {(iso: string) => string} [props.formatDate]
 * @param {string} [props.title]
 * @param {number|string|null} [props.busyId]
 * @param {string} [props.emptyMessage]
 */
export default function NotificationInboxPanel({
  open,
  onClose,
  notifications = [],
  onMarkRead,
  renderActions,
  onDismiss,
  formatDate = (iso) => (iso ? String(iso).slice(0, 16) : ''),
  title = 'Bildirishnomalar',
  busyId = null,
  emptyMessage = 'Xabar yo‘q',
}) {
  const list = useMemo(() => (Array.isArray(notifications) ? notifications : []), [notifications]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const firstUnread = list.findIndex((n) => !n.read_at);
    setIndex(firstUnread >= 0 ? firstUnread : 0);
  }, [open, list]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(list.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, list.length]);

  if (!open) return null;

  const current = list[index];
  const total = list.length;
  const positionLabel = total ? `${index + 1} / ${total}` : '0 / 0';

  async function handleDismiss() {
    if (!current) return;
    if (onDismiss) await onDismiss(current);
    else if (onMarkRead && !current.read_at) await onMarkRead(current.id);
    if (index < list.length - 1) setIndex((i) => i + 1);
    else onClose();
  }

  function goPrev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setIndex((i) => Math.min(list.length - 1, i + 1));
  }

  const navCtx = { goNext, onClose };
  const cardActions = current && renderActions ? renderActions(current, navCtx) : null;
  const hasCardActions = cardActions != null && cardActions !== false;

  const content = (
    <>
      <div className="notif-inbox-backdrop" role="presentation" onClick={onClose} />
      <div
        className="notif-inbox-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-inbox-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="notif-inbox-head">
          <div>
            <h2 id="notif-inbox-title">{title}</h2>
            <span className="notif-inbox-counter">{positionLabel}</span>
          </div>
          <button type="button" className="notif-inbox-close" onClick={onClose} aria-label="Yopish">
            ×
          </button>
        </header>

        <div className="notif-inbox-body">
          {total === 0 ? (
            <p className="notif-inbox-empty">{emptyMessage}</p>
          ) : (
            <article
              className={`notif-inbox-card${current?.read_at ? '' : ' is-unread'}${hasCardActions ? ' has-actions' : ''}`}
            >
              <h3 className="notif-inbox-card-title">{current?.title}</h3>
              {current?.body ? <p className="notif-inbox-card-body">{current.body}</p> : null}
              <time className="notif-inbox-card-date">{formatDate(current?.created_at)}</time>
              {hasCardActions ? <div className="notif-inbox-card-actions">{cardActions}</div> : null}
            </article>
          )}
        </div>

        {total > 0 ? (
          <footer className="notif-inbox-foot">
            {hasCardActions ? (
              <div className="notif-inbox-foot-primary">
                <button type="button" className="notif-inbox-btn notif-inbox-btn--ghost" disabled={busyId === current?.id} onClick={() => void handleDismiss()}>
                  E’tiborsiz qoldirish
                </button>
              </div>
            ) : (
              <div className="notif-inbox-foot-primary">
                <button type="button" className="notif-inbox-btn notif-inbox-btn--ghost" disabled={busyId === current?.id} onClick={() => void handleDismiss()}>
                  O‘qildi — keyingisi
                </button>
              </div>
            )}
            <div className="notif-inbox-nav">
              <button type="button" className="notif-inbox-btn" disabled={index <= 0} onClick={goPrev}>
                ← Oldingi
              </button>
              <button type="button" className="notif-inbox-btn" disabled={index >= total - 1} onClick={goNext}>
                Keyingisi →
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </>
  );

  return createPortal(content, document.body);
}
