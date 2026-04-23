import React from 'react';

/**
 * Bildirishnomalar paneli sarlavhasi: «Xabarlar» + iPhone kapsula (tovushli / tovushsiz).
 * `.picker-bell-dropdown` ichida birinchi bolalar sifatida qo‘ying.
 */
export function StaffNotifModalHeader({ t, notificationsEnabled, setNotificationsEnabled }) {
  return (
    <div
      className="picker-bell-dropdown-head picker-bell-dropdown-head--with-sound"
      aria-label={t.bellTitle}
    >
      <span className="picker-bell-dropdown-head-title">{t.staffTopbarNotifCaption}</span>
      <button
        type="button"
        className={`picker-ios-sound-toggle ${notificationsEnabled ? 'picker-ios-sound-toggle--on' : ''}`}
        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
        role="switch"
        aria-checked={notificationsEnabled}
        aria-label={t.staffNotifSoundAria}
      >
        <span className="picker-ios-sound-thumb" />
      </button>
    </div>
  );
}

/**
 * Mobil topbar: faqat qo‘ng‘iroqcha. Matn va ovoz tugmasi — ochilgan modal boshida (`StaffNotifModalHeader`).
 */
export default function StaffTopbarBellCluster({
  t,
  /** Tovush o‘chiq bo‘lsa qo‘ng‘iroqcha kulrang / 🔕 */
  notificationsEnabled = true,
  notificationsOpen,
  setNotificationsOpen,
  unreadCount = 0,
  onBellOpenChange = null,
  children,
}) {
  const muted = !notificationsEnabled;
  const uc = Number(unreadCount) || 0;

  return (
    <div className="picker-bell-wrap">
      <button
        type="button"
        className={`picker-bell-btn ${muted ? 'picker-bell-btn--muted' : ''}`}
        onClick={() =>
          setNotificationsOpen((o) => {
            const next = !o;
            try {
              onBellOpenChange?.(next);
            } catch (_) {}
            return next;
          })
        }
        aria-label={muted ? t.bellAriaOff : t.bellAriaOn}
        aria-expanded={notificationsOpen}
      >
        <span className="picker-bell-icon" aria-hidden>
          {muted ? '🔕' : '🔔'}
        </span>
        {uc > 0 ? (
          <span className={`picker-bell-badge ${muted ? 'picker-bell-badge--muted' : ''}`}>
            {uc > 99 ? '99+' : uc}
          </span>
        ) : null}
      </button>
      {children}
    </div>
  );
}
