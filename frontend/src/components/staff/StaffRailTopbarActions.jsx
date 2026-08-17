import React from 'react';
import StaffNotificationBell from '../notifications/StaffNotificationBell.jsx';
import StaffTopbarProfileMenu from './StaffTopbarProfileMenu';
import { STAFF_TOPBAR_T_UZ } from '../../constants/staffTopbarUz.js';
import { formatDateTimeUzCompact } from '../../utils/uzbekistanTime.js';

/** Yon rels (mobil) va topbar (desktop): qo‘ng‘iroqcha + profil. */
export default function StaffRailTopbarActions({
  className = '',
  displayName,
  profilePath,
  staffNotifOpen,
  setStaffNotifOpen,
  staffNotifSoundOn,
  staffNotifUnreadCount,
  staffNotifications,
  markStaffNotificationRead,
  staffProfileOpen,
  setStaffProfileOpen,
  navigate,
  logout,
  profileTriggerClassName = '',
  profileHideChevron = false,
  showBell = true,
  showProfile = true,
}) {
  return (
    <div className={`packer-staff-topbar-actions${className ? ` ${className}` : ''}`}>
      {showBell ? (
        <StaffNotificationBell
          t={STAFF_TOPBAR_T_UZ}
          notificationsEnabled={staffNotifSoundOn}
          notificationsOpen={staffNotifOpen}
          setNotificationsOpen={setStaffNotifOpen}
          unreadCount={staffNotifUnreadCount}
          notifications={staffNotifications}
          onMarkRead={markStaffNotificationRead}
          formatDateTime={(iso) => formatDateTimeUzCompact(iso, { empty: '—' })}
          onBellOpenChange={(open) => {
            if (open) setStaffProfileOpen(false);
          }}
          onDismiss={async (n) => {
            if (!n.read_at) await markStaffNotificationRead(n.id);
          }}
        />
      ) : null}
      {showProfile ? (
        <StaffTopbarProfileMenu
          name={displayName}
          open={staffProfileOpen}
          onOpenChange={(next) => {
            setStaffProfileOpen(next);
            if (next) setStaffNotifOpen(false);
          }}
          onHome={() => navigate('/')}
          onProfile={() => navigate(profilePath)}
          onSettings={() => navigate(profilePath)}
          onLogout={() => {
            logout();
            navigate('/login');
          }}
          triggerClassName={profileTriggerClassName}
          hideChevron={profileHideChevron}
        />
      ) : null}
    </div>
  );
}
