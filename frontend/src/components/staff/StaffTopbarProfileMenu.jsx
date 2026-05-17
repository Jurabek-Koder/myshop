import React, { useEffect } from 'react';
import './StaffTopbarProfileMenu.css';

export function staffProfileInitials(name) {
  const s = String(name || '?').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  if (s.length <= 2) return s.toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

const DEFAULT_LABELS = {
  home: 'Bosh sahifa',
  profile: 'Profil',
  settings: 'Sozlamalar',
  logout: 'Chiqish',
  ariaMenu: 'Hisob menyusi',
  ariaTrigger: 'Hisob menyusini ochish yoki yopish',
};

/**
 * Topbar: ism ustiga bosilganda «shisha» pastki menyu (seller / picker / operator / ombor).
 */
export default function StaffTopbarProfileMenu({
  name,
  avatarUrl,
  open,
  onOpenChange,
  onHome,
  onProfile,
  onSettings,
  onLogout,
  labels: labelsProp,
  triggerClassName = '',
  hideChevron = false,
}) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const initials = staffProfileInitials(name);
  const showAvatar = Boolean(avatarUrl && String(avatarUrl).trim());

  return (
    <div className="staff-profile-popover-wrap">
      <button
        type="button"
        className={`staff-profile-popover-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={labels.ariaTrigger}
        onClick={() => onOpenChange(!open)}
      >
        {showAvatar ? (
          <img src={avatarUrl} alt="" className="staff-profile-popover-avatar-img" />
        ) : (
          <span className="staff-profile-popover-initials" aria-hidden>
            {initials}
          </span>
        )}
        <span className="staff-profile-popover-name">{name}</span>
        {!hideChevron ? <i className="fas fa-chevron-down staff-profile-popover-chevron" aria-hidden /> : null}
      </button>
      {open ? (
        <>
          <div className="staff-profile-popover-backdrop" aria-hidden onClick={() => onOpenChange(false)} />
          <div className="staff-profile-popover-menu" role="menu" aria-label={labels.ariaMenu}>
            <button
              type="button"
              role="menuitem"
              className="staff-profile-popover-item"
              onClick={() => {
                onHome?.();
                onOpenChange(false);
              }}
            >
              <i className="fas fa-home" aria-hidden />
              <span>{labels.home}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="staff-profile-popover-item"
              onClick={() => {
                onProfile?.();
                onOpenChange(false);
              }}
            >
              <i className="fas fa-user" aria-hidden />
              <span>{labels.profile}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="staff-profile-popover-item"
              onClick={() => {
                onSettings?.();
                onOpenChange(false);
              }}
            >
              <i className="fas fa-cog" aria-hidden />
              <span>{labels.settings}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="staff-profile-popover-item staff-profile-popover-item--danger"
              onClick={() => {
                onLogout?.();
                onOpenChange(false);
              }}
            >
              <i className="fas fa-sign-out-alt" aria-hidden />
              <span>{labels.logout}</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
