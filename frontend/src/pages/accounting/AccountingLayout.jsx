import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import StaffTopbarBellCluster, { StaffNotifModalHeader } from '../../components/staff/StaffTopbarBellCluster';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu';
import { formatDateTimeUz } from '../../utils/uzbekistanTime.js';
import '../picker/PickerDashboard.css';
import '../warehouseAdmin/WarehouseAdminDashboard.css';
import './AccountingDashboard.css';

function formatBellDate(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

/** Yon panel: ichki buxgalteriya sahifalari (rollik panellar emas). */
const ACCOUNTING_SIDE_NAV = [
  { path: '/accounting', label: 'Boshqaruv paneli', icon: '🏠', end: true },
  { path: '/accounting/payroll', label: 'Ish haqi boshqaruvi', icon: '💳' },
  { path: '/accounting/transactions', label: 'Xarajat va tushumlar', icon: '📒' },
  { path: '/accounting/reports', label: 'Moliyaviy hisobotlar', icon: '📈' },
  { path: '/accounting/receipts', label: 'Cheklar', icon: '🧾' },
  { path: '/accounting/packer', label: 'Packer balanslari', icon: '📦' },
  { path: '/accounting/picker', label: 'Picker balanslari', icon: '🛒' },
  { path: '/accounting/courier', label: 'Kuryer balanslari', icon: '🛵' },
  { path: '/accounting/operator', label: 'Operator balanslari', icon: '💬' },
  { path: '/accounting/seller', label: 'Seller balanslari', icon: '🏪' },
];

function isAccountingSideNavActive(pathname, navPath, endOnly) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  const n = String(navPath || '').replace(/\/+$/, '') || '/';
  if (endOnly || n === '/accounting') return p === '/accounting';
  return p === n || p.startsWith(`${n}/`);
}

/** Buxgalteriya qobig‘i — topbar, yon menyu, `<Outlet />` ichida sahifa. */
export default function AccountingLayout() {
  const { user, logout, request } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    t: pickerUiT,
  } = usePickerUiSettings();

  const who = String(user?.full_name || user?.login || '').trim();
  const displayName = who || 'Buxgalter';
  const isDark = theme === 'dark';

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bellBusyId, setBellBusyId] = useState(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/accounting/portal/notifications');
      const d = res.ok ? await res.json() : { notifications: [] };
      setNotifications(d.notifications || []);
    } catch (_) {
      setNotifications([]);
    }
  }, [request]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, notificationsOpen]);

  const handleApproveWithdrawal = useCallback(
    async (notif) => {
      if (notif?.link_type !== 'withdrawal' || !notif?.link_id) return;
      setBellBusyId(notif.id);
      try {
        const res = await request(`/accounting/portal/withdrawal-requests/${notif.link_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved', note: '' }),
        });
        if (res.ok) {
          await request(`/accounting/portal/notifications/${notif.id}/read`, { method: 'PATCH' });
          await loadNotifications();
        }
      } finally {
        setBellBusyId(null);
      }
    },
    [request, loadNotifications],
  );

  const handleMarkPaid = useCallback(
    async (notif) => {
      if (notif?.link_type !== 'withdrawal_payout' || !notif?.link_id) return;
      setBellBusyId(notif.id);
      try {
        const res = await request(`/accounting/portal/withdrawal-requests/${notif.link_id}/mark-paid`, {
          method: 'PATCH',
          body: JSON.stringify({}),
        });
        if (res.ok) {
          await request(`/accounting/portal/notifications/${notif.id}/read`, { method: 'PATCH' });
          await loadNotifications();
        }
      } finally {
        setBellBusyId(null);
      }
    },
    [request, loadNotifications],
  );

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const closeSidebar = useCallback(() => setSidePanelOpen(false), []);

  return (
    <div className="picker-app picker-mobile warehouse-admin-shell accounting-panel-shell">
      <div className="picker-phone-frame">
        <header className="picker-topbar no-print warehouse-admin-topbar">
          <div className="picker-topbar-inner">
            <button
              type="button"
              className="picker-topbar-hamburger warehouse-admin-topbar-hamburger"
              onClick={() => setSidePanelOpen((v) => !v)}
              aria-label={sidePanelOpen ? pickerUiT.ariaSideClose : pickerUiT.ariaSideOpen}
              aria-expanded={sidePanelOpen}
            >
              <span className="picker-hamburger-icon" />
            </button>
            <span className="picker-topbar-logo">MyShop · Buxgalteriya</span>
            <div className="picker-topbar-right">
              <StaffTopbarBellCluster
                t={pickerUiT}
                notificationsEnabled={notificationsEnabled}
                notificationsOpen={notificationsOpen}
                setNotificationsOpen={setNotificationsOpen}
                unreadCount={unreadCount}
                onBellOpenChange={(open) => {
                  if (open) setProfileMenuOpen(false);
                }}
              >
                {notificationsOpen && (
                  <>
                    <div
                      className="picker-bell-backdrop"
                      onClick={() => setNotificationsOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="picker-bell-dropdown">
                      <StaffNotifModalHeader
                        t={pickerUiT}
                        notificationsEnabled={notificationsEnabled}
                        setNotificationsEnabled={setNotificationsEnabled}
                      />
                      {notifications.length === 0 ? (
                        <p className="picker-bell-empty">Xabar yo‘q</p>
                      ) : (
                        <ul className="accounting-bell-list picker-bell-list">
                          {notifications.map((n) => (
                            <li key={n.id} className={n.read_at ? '' : 'unread'}>
                              <div className="accounting-bell-item">
                                <div className="accounting-bell-item-title">{n.title}</div>
                                <div className="accounting-bell-item-body">{n.body}</div>
                                <div className="accounting-bell-item-date">{formatBellDate(n.created_at)}</div>
                                {n.link_type === 'withdrawal' && n.link_id && (
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm accounting-bell-action"
                                    disabled={bellBusyId === n.id}
                                    onClick={() => {
                                      handleApproveWithdrawal(n);
                                      setNotificationsOpen(false);
                                    }}
                                  >
                                    {bellBusyId === n.id ? '...' : 'Tasdiqlash'}
                                  </button>
                                )}
                                {n.link_type === 'withdrawal_payout' && n.link_id && (
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm accounting-bell-action"
                                    disabled={bellBusyId === n.id}
                                    onClick={() => {
                                      handleMarkPaid(n);
                                      setNotificationsOpen(false);
                                    }}
                                  >
                                    {bellBusyId === n.id ? '...' : 'Pul berildi'}
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </StaffTopbarBellCluster>
              <div className="picker-topbar-profile-slot">
                <StaffTopbarProfileMenu
                  name={displayName}
                  avatarUrl={user?.avatar_url || undefined}
                  open={profileMenuOpen}
                  onOpenChange={(next) => {
                    setProfileMenuOpen(next);
                    if (next) setNotificationsOpen(false);
                  }}
                  labels={{
                    home: pickerUiT.navHome,
                    profile: pickerUiT.navProfile,
                    settings: pickerUiT.navSettings,
                    logout: pickerUiT.logout,
                  }}
                  onHome={() => navigate('/accounting')}
                  onProfile={() => navigate('/profile')}
                  onSettings={() => navigate('/profile')}
                  onLogout={() => {
                    logout();
                    navigate('/');
                  }}
                />
              </div>
            </div>
          </div>
        </header>

        <aside className={`picker-side-panel ${sidePanelOpen ? 'open' : ''}`} aria-hidden={!sidePanelOpen}>
          <div className="picker-side-panel-inner">
            <div className="picker-side-panel-head">Bo&apos;limlar</div>
            <p className="courier-side-intro operator-side-intro">
              <strong>{displayName}</strong>
              <span className="courier-side-meta">Buxgalteriya</span>
            </p>
            <nav className="picker-side-panel-nav" aria-label="Buxgalteriya bo‘limlari">
              {ACCOUNTING_SIDE_NAV.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className={`picker-side-panel-item${
                    isAccountingSideNavActive(location.pathname, item.path, item.end)
                      ? ' picker-side-panel-item-active'
                      : ''
                  }`}
                  onClick={() => {
                    navigate(item.path);
                    closeSidebar();
                  }}
                >
                  <span className="picker-side-panel-item-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="picker-side-panel-footer">
              <div className="picker-side-panel-theme-row">
                <span className="picker-side-panel-theme-label">
                  <span
                    className={`picker-side-panel-theme-icon${isDark ? ' picker-side-panel-theme-icon--moon' : ''}`}
                    aria-hidden
                  >
                    {isDark ? '🌙' : '☀️'}
                  </span>
                  <span className="picker-side-panel-theme-text">
                    {isDark ? pickerUiT.themeMoonLabel : pickerUiT.themeSunLabel}
                  </span>
                </span>
                <button
                  type="button"
                  className={`picker-ios-theme-toggle ${isDark ? 'picker-ios-theme-toggle-dark' : ''}`}
                  onClick={toggleTheme}
                  role="switch"
                  aria-checked={isDark}
                  aria-label="Mavzu"
                >
                  <span className="picker-ios-theme-thumb" />
                </button>
              </div>
              <button
                type="button"
                className="picker-side-panel-logout"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Chiqish
              </button>
            </div>
          </div>
        </aside>
        <div
          className={`picker-side-panel-overlay ${sidePanelOpen ? 'show' : ''}`}
          aria-hidden={!sidePanelOpen}
          onClick={closeSidebar}
        />

        <main className="picker-main warehouse-admin-main accounting-main">
          <div className="warehouse-admin-page accounting-page">
            <Outlet />
          </div>
        </main>

        <nav className="accounting-bottom-nav no-print" aria-label="Buxgalteriya tezkor navigatsiya">
          {ACCOUNTING_SIDE_NAV.slice(0, 5).map((item) => (
            <button
              key={item.path}
              type="button"
              className={`accounting-bottom-nav-item${
                isAccountingSideNavActive(location.pathname, item.path, item.end) ? ' accounting-bottom-nav-item-active' : ''
              }`}
              onClick={() => navigate(item.path)}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
