import React from 'react';
import { STAFF_TOPBAR_T_UZ } from '../../constants/staffTopbarUz.js';
import NotificationBellCluster from './NotificationBellCluster.jsx';

/** Ishchi panellari: buxgalteriya bilan bir xil qo‘ng‘iroqcha va xabar paneli. */
export default function StaffNotificationBell({
  t = STAFF_TOPBAR_T_UZ,
  notificationsEnabled = true,
  notificationsOpen,
  setNotificationsOpen,
  unreadCount = 0,
  notifications = [],
  onMarkRead,
  onBellOpenChange,
  formatDateTime,
  renderActions,
  onDismiss,
  busyId = null,
}) {
  const muted = !notificationsEnabled;

  return (
    <NotificationBellCluster
      title={t.bellTitle || 'Bildirishnomalar'}
      ariaLabel={muted ? t.bellAriaOff : t.bellAriaOn}
      notificationsOpen={notificationsOpen}
      setNotificationsOpen={setNotificationsOpen}
      unreadCount={unreadCount}
      notifications={notifications}
      onMarkRead={onMarkRead}
      onBellOpenChange={onBellOpenChange}
      formatDate={formatDateTime}
      renderActions={renderActions}
      onDismiss={onDismiss}
      busyId={busyId}
      muted={muted}
      bellButtonClassName="ms-bell-btn ms-bell-btn--staff"
    />
  );
}
