import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import NotificationBellCluster from '../../components/notifications/NotificationBellCluster.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu.jsx';
import { AccountingAppProvider, useAccountingApp } from './context/AccountingAppContext.jsx';
import { uz } from './i18n/uz.js';
import { formatDateUz } from './utils/formatUzs.js';
import '../../components/staff/StaffTopbarProfileMenu.css';

const NAV = [
  { to: '/accounting', end: true, label: uz.nav.dashboard, icon: 'fa-chart-line' },
  { to: '/accounting/ish-haqi', label: uz.nav.payroll, icon: 'fa-wallet' },
  { to: '/accounting/moliya', label: uz.nav.finance, icon: 'fa-coins' },
  { to: '/accounting/tahlil', label: uz.nav.analytics, icon: 'fa-chart-pie' },
];

function ShellLayout() {
  const { refreshAll, loading } = useAccountingApp();
  const { request, user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const darkMode = theme === 'dark';

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 769px)').matches;
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const displayName = user?.full_name || user?.login || 'Buxgalter';
  const avatarUrl =
    user?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0ea5e9&color=fff&size=128`;

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/accounting/notifications');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setNotifications(data.notifications || []);
    } catch {
      setNotifications([]);
    }
  }, [request]);

  useEffect(() => {
    refreshAll();
    loadNotifications();
  }, [refreshAll, loadNotifications]);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setNotificationsOpen(false);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function markNotificationRead(id) {
    try {
      await request(`/accounting/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
    } catch {
      /* ignore */
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleRefresh() {
    await Promise.all([refreshAll(), loadNotifications()]);
  }

  return (
    <div
      data-apanel
      className={`ap-app${sidebarOpen ? ' is-sidebar-open' : ''}${darkMode ? '' : ' ap-theme-light'}`}
    >
      <header className="ap-topbar">
        <div className="ap-topbar-start">
          <button
            type="button"
            className="ap-btn ap-btn--ghost ap-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="ap-sidebar"
            aria-label={sidebarOpen ? uz.closeMenu : uz.openMenu}
          >
            <span className="ap-menu-icon" aria-hidden />
          </button>
          <div className="ap-topbar-brand">
            <p className="ap-kicker">{uz.appKicker}</p>
            <h1 className="ap-topbar-title">{uz.appTitle}</h1>
          </div>
        </div>

        <div className="ap-topbar-end ap-topbar-tools">
          <button type="button" className="ap-btn ap-btn--ghost ap-icon-btn" onClick={() => void handleRefresh()} disabled={loading} title={uz.refresh}>
            <i className="fas fa-sync-alt" aria-hidden />
          </button>

          <NotificationBellCluster
            title={uz.shell.notifications}
            notificationsOpen={notificationsOpen}
            setNotificationsOpen={setNotificationsOpen}
            unreadCount={unreadCount}
            notifications={notifications}
            onMarkRead={markNotificationRead}
            formatDate={formatDateUz}
            bellWrapClassName="ap-bell-wrap"
            bellButtonClassName="ap-btn ap-btn--ghost ap-icon-btn ap-bell-btn"
            dotClassName="ap-bell-dot"
            onBellOpenChange={(open) => {
              if (open) {
                setProfileMenuOpen(false);
                void loadNotifications();
              }
            }}
            onDismiss={async (n) => {
              if (!n.read_at) await markNotificationRead(n.id);
            }}
            renderActions={(n, { onClose }) => {
              if (n.link_type === 'payroll_advance') {
                return (
                  <button
                    type="button"
                    className="notif-inbox-btn notif-inbox-btn--primary"
                    onClick={() => {
                      onClose();
                      navigate('/accounting/ish-haqi');
                    }}
                  >
                    {uz.shell.openPayroll}
                  </button>
                );
              }
              return null;
            }}
          />

          <StaffTopbarProfileMenu
            name={displayName}
            avatarUrl={avatarUrl}
            open={profileMenuOpen}
            onOpenChange={(next) => {
              setNotificationsOpen(false);
              setProfileMenuOpen(next);
            }}
            onHome={() => navigate('/')}
            onProfile={() => navigate('/profile')}
            onSettings={() => navigate('/profile')}
            onLogout={handleLogout}
            labels={{
              home: uz.shell.home,
              profile: uz.shell.profile,
              settings: uz.shell.settings,
              logout: uz.shell.logout,
            }}
            triggerClassName="ap-profile-trigger"
          />
        </div>
      </header>

      <div className="ap-layout">
        <button
          type="button"
          className="ap-sidebar-backdrop"
          aria-label={uz.closeMenu}
          onClick={() => setSidebarOpen(false)}
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside id="ap-sidebar" className={`ap-sidebar${sidebarOpen ? ' is-open' : ''}`}>
          <div className="ap-sidebar-head">
            <div className="ap-sidebar-logo">
              <span className="ap-sidebar-logo-icon" aria-hidden>
                <i className="fas fa-calculator" />
              </span>
              <span className="ap-sidebar-logo-text">MyShop</span>
            </div>
            <button type="button" className="ap-btn ap-btn--ghost ap-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label={uz.closeMenu}>
              <i className="fas fa-times" aria-hidden />
            </button>
          </div>

          <nav className="ap-sidebar-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `ap-sidebar-link${isActive ? ' is-active' : ''}`}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
                    setSidebarOpen(false);
                  }
                }}
              >
                <i className={`fas ${item.icon}`} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ap-sidebar-footer">
            <div className="ap-sidebar-footer-row">
              <img className="ap-sidebar-footer-avatar" src={avatarUrl} alt="" />
              <div className="ap-sidebar-footer-main">
                <div className="ap-sidebar-footer-name-row">
                  <span className="ap-sidebar-user-name">{displayName}</span>
                  <label
                    className="ap-theme-switch"
                    title={darkMode ? uz.shell.themeDay : uz.shell.themeNight}
                    aria-label={darkMode ? uz.shell.themeDay : uz.shell.themeNight}
                  >
                    <i className="fas fa-sun" aria-hidden />
                    <input type="checkbox" checked={darkMode} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />
                    <span className="ap-theme-slider" />
                    <i className="fas fa-moon" aria-hidden />
                  </label>
                </div>
                <div className="ap-sidebar-user-role">{uz.shell.roleLabel}</div>
              </div>
            </div>
            <button type="button" className="ap-btn ap-btn--ghost ap-sidebar-logout" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" aria-hidden />
              {uz.shell.logout}
            </button>
          </div>
        </aside>

        <main className="ap-main-scroll">
          <div className="ap-main-inner">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
  );
}

export default function AccountingShell() {
  return (
    <AccountingAppProvider>
      <ShellLayout />
    </AccountingAppProvider>
  );
}
