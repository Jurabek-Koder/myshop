import React from 'react';

/**
 * Operator / ombor admin / kuryer uchun bir xil yon panel (hamburger menyu).
 */
export default function StaffSidePanel({
  open,
  panelClassName = '',
  brandIcon,
  brandTitle = 'MyShop',
  brandSubtitle,
  userName,
  userRole,
  navItems,
  navAriaLabel,
  onLogout,
  onToggleTheme,
  isDark,
  themeSunLabel = 'Kun rejimi',
  themeMoonLabel = 'Tun rejimi',
  logoutLabel = 'Chiqish',
  onOverlayClick,
}) {
  const showRole =
    userRole &&
    userName &&
    String(userRole).trim().toLowerCase() !== String(userName).trim().toLowerCase();

  return (
    <>
      <aside
        className={`picker-side-panel staff-side-panel-ref staff-side-panel--compact ${panelClassName} ${open ? 'open' : ''}`.trim()}
        aria-hidden={!open}
      >
        <div className="picker-side-panel-inner">
          <div className="staff-side-panel-head">
            <div className="staff-side-panel-brand">
              <span className="staff-side-panel-logo-icon" aria-hidden>
                {brandIcon}
              </span>
              <div className="staff-side-panel-logo-text">
                <span>{brandTitle}</span>
                {brandSubtitle ? <small>{brandSubtitle}</small> : null}
              </div>
            </div>
          </div>
          {(userName || showRole) && (
            <p className="courier-side-intro staff-side-intro">
              {userName ? <strong>{userName}</strong> : null}
              {showRole ? (
                <>
                  {userName ? ' ' : null}
                  <span className="courier-side-meta">{userRole}</span>
                </>
              ) : null}
            </p>
          )}
          <nav className="picker-side-panel-nav" aria-label={navAriaLabel}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`picker-side-panel-item${item.active ? ' picker-side-panel-item-active' : ''}`}
                onClick={item.onClick}
                aria-current={item.active ? 'page' : undefined}
              >
                <span
                  className={`picker-side-panel-item-icon${item.iconClassName ? ` ${item.iconClassName}` : ''}`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="picker-side-panel-item-label">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="picker-side-panel-footer">
            <button type="button" className="picker-side-panel-logout" onClick={onLogout}>
              {logoutLabel}
            </button>
            <button
              type="button"
              className={`picker-side-panel-theme-row${isDark ? ' picker-side-panel-theme-row--moon' : ''}`}
              onClick={onToggleTheme}
              aria-label={isDark ? themeMoonLabel : themeSunLabel}
            >
              <span className="staff-side-theme-icon" aria-hidden>
                {isDark ? '🌙' : '☀️'}
              </span>
            </button>
          </div>
        </div>
      </aside>
      <div
        className={`picker-side-panel-overlay ${open ? 'show' : ''}`}
        aria-hidden={!open}
        onClick={onOverlayClick}
      />
    </>
  );
}
