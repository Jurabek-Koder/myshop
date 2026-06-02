import React from 'react';
import TopbarNotificationBell from '../notifications/TopbarNotificationBell.jsx';

/**
 * @deprecated `NotificationBellCluster` yoki `TopbarNotificationBell` ishlating.
 * Eski API saqlanadi (emoji o‘rniga fa-bell).
 */
export function StaffNotifModalHeader() {
  return null;
}

export default function StaffTopbarBellCluster({
  t,
  notificationsEnabled = true,
  notificationsOpen,
  setNotificationsOpen,
  unreadCount = 0,
  onBellOpenChange = null,
  children,
}) {
  return (
    <>
      <TopbarNotificationBell
        open={notificationsOpen}
        onToggle={() =>
          setNotificationsOpen((o) => {
            const next = !o;
            try {
              onBellOpenChange?.(next);
            } catch (_) {}
            return next;
          })
        }
        unreadCount={unreadCount}
        title={t?.bellTitle || 'Bildirishnomalar'}
        ariaLabel={notificationsEnabled ? t?.bellAriaOn : t?.bellAriaOff}
        muted={!notificationsEnabled}
        buttonClassName="ms-bell-btn ms-bell-btn--staff"
      />
      {children}
    </>
  );
}
