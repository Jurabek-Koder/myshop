import React from 'react';
import TopbarNotificationBell from './TopbarNotificationBell.jsx';
import NotificationInboxPanel from './NotificationInboxPanel.jsx';

/**
 * Qo‘ng‘iroqcha + markaziy shaffof xabarlar paneli (buxgalteriya uslubi, butun loyiha).
 */
export default function NotificationBellCluster({
  title = 'Bildirishnomalar',
  ariaLabel = null,
  notificationsOpen,
  setNotificationsOpen,
  unreadCount = 0,
  notifications = [],
  onMarkRead,
  onBellOpenChange,
  formatDate,
  renderActions,
  onDismiss,
  busyId = null,
  muted = false,
  bellWrapClassName = 'ms-bell-wrap',
  bellButtonClassName = 'ms-bell-btn',
  dotClassName = 'ms-bell-dot',
  emptyMessage,
}) {
  function handleToggle() {
    setNotificationsOpen((prev) => {
      const next = !prev;
      try {
        onBellOpenChange?.(next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <>
      <TopbarNotificationBell
        open={notificationsOpen}
        onToggle={handleToggle}
        unreadCount={unreadCount}
        title={title}
        ariaLabel={ariaLabel}
        muted={muted}
        wrapClassName={bellWrapClassName}
        buttonClassName={bellButtonClassName}
        dotClassName={dotClassName}
      />
      <NotificationInboxPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onMarkRead={onMarkRead}
        renderActions={renderActions}
        onDismiss={onDismiss}
        formatDate={formatDate}
        title={title}
        busyId={busyId}
        emptyMessage={emptyMessage}
      />
    </>
  );
}
