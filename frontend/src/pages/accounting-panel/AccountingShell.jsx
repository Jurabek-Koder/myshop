import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import NotificationBellCluster from '../../components/notifications/NotificationBellCluster.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu.jsx';
import StaffSidePanel from '../../components/staff/StaffSidePanel.jsx';
import { AccountingAppProvider, useAccountingApp } from './context/AccountingAppContext.jsx';
import { ACCOUNTING_NAV_ITEMS, navIsActive } from './accountingNav.js';
import { uz } from './i18n/uz.js';
import { formatDateUz } from './utils/formatUzs.js';
import '../../components/staff/StaffTopbarProfileMenu.css';
import './KpiCardTheme.css';

const NAV = ACCOUNTING_NAV_ITEMS;
function ShellLayout() {
  const { refreshAll, loading } = useAccountingApp();
  const { request, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const darkMode = theme === 'dark';

  /** KPI / mini-stat bloklar — panel root dan meros; toggle bilan darhol yangilanadi */
  const panelBlockTheme = useMemo(
    () =>
      darkMode
        ? {
            '--ap-kpi-surface': 'linear-gradient(145deg, rgba(17, 24, 39, 0.95), rgba(15, 23, 42, 0.7))',
            '--ap-kpi-border': '#1e293b',
            '--ap-kpi-shadow': '0 20px 50px -24px rgba(0, 0, 0, 0.65)',
            '--ap-kpi-muted': '#94a3b8',
          }
        : {
            '--ap-kpi-surface': '#ffffff',
            '--ap-kpi-border': '#e2e8f0',
            '--ap-kpi-shadow': '0 16px 40px -20px rgba(15, 23, 42, 0.12)',
            '--ap-kpi-muted': '#64748b',
          },
    [darkMode],
  );

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 769px)').matches;
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const displayName = user?.full_name || user?.login || uz.shell.roleLabel;
  const accountingRoleLabel = uz.shell.roleLabel;
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

  const accountingNavItems = useMemo(
    () =>
      NAV.map((item) => ({
        id: item.to,
        label: item.label,
        icon: item.icon,
        active: navIsActive(item, location.pathname),
        onClick: () => {
          navigate(item.to);
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
            setSidebarOpen(false);
          }
        },
      })),
    [location.pathname, navigate],
  );

  return (
    <div
      data-apanel
      data-theme={theme}
      className={`ap-app picker-mobile accounting-panel-shell${sidebarOpen ? ' is-sidebar-open' : ''}${darkMode ? '' : ' ap-theme-light'}`}
      style={panelBlockTheme}
    >
      <header className="ap-topbar">
        <div className="ap-topbar-start">
          <button
            type="button"
            className="ap-btn ap-btn--ghost ap-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
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
        <StaffSidePanel
          open={sidebarOpen}
          panelClassName="accounting-side-panel"
          brandIcon="🧮"
          brandTitle="MyShop"
          brandSubtitle="BUXGALTER PANELI"
          userName={displayName}
          userRole={accountingRoleLabel}
          navItems={accountingNavItems}
          navAriaLabel="Buxgalteriya bo‘limlari"
          onLogout={handleLogout}
          onToggleTheme={toggleTheme}
          isDark={darkMode}
          themeSunLabel={uz.shell.themeDay}
          themeMoonLabel={uz.shell.themeNight}
          logoutLabel={uz.shell.logout}
          onOverlayClick={() => setSidebarOpen(false)}
        />

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
