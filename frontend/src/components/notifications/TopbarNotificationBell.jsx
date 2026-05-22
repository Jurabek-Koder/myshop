import React from 'react';
import './TopbarNotificationBell.css';

/**
 * Loyiha bo‘ylab bir xil qo‘ng‘iroqcha (Font Awesome + qizil badge).
 */
export default function TopbarNotificationBell({
  open = false,
  onToggle,
  unreadCount = 0,
  title = 'Bildirishnomalar',
  ariaLabel = null,
  muted = false,
  wrapClassName = 'ms-bell-wrap',
  buttonClassName = 'ms-bell-btn',
  dotClassName = 'ms-bell-dot',
}) {
  const uc = Number(unreadCount) || 0;

  return (
    <div className={wrapClassName}>
      <button
        type="button"
        className={`${buttonClassName}${muted ? ' is-muted' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        title={title}
        aria-label={ariaLabel || title}
      >
        <i className={`fas ${muted ? 'fa-bell-slash' : 'fa-bell'}`} aria-hidden />
        {uc > 0 ? <span className={dotClassName}>{uc > 99 ? '99+' : uc}</span> : null}
      </button>
    </div>
  );
}
