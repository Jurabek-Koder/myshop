import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Menu,
  Moon,
  ReceiptText,
  SunMedium,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import StaffTopbarBellCluster, { StaffNotifModalHeader } from '../../components/staff/StaffTopbarBellCluster';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu';
import { formatDateTimeUz } from '../../utils/uzbekistanTime.js';
import { useAccountingEmployeesQuery, useAccountingLookupsQuery, useAccountingMutations } from '../../lib/accounting/api.js';
import { useAccountingStore } from '../../lib/accounting/store.js';
import { Button } from '../../components/accounting/AccountingPrimitives.jsx';
import { EmployeeDialog, PaymentDialog, TransactionDialog } from '../../components/accounting/AccountingDialogs.jsx';
import '../../styles/accounting.tailwind.css';
import '../picker/PickerDashboard.css';
import '../warehouseAdmin/WarehouseAdminDashboard.css';
import './AccountingSaaS.css';

const PRIMARY_NAV = [
  { path: '/accounting', label: 'Boshqaruv paneli', icon: LayoutDashboard, end: true },
  { path: '/accounting/payroll', label: 'Ish haqi', icon: Wallet },
  { path: '/accounting/transactions', label: 'Kirim-chiqim', icon: ReceiptText },
  { path: '/accounting/reports', label: 'Hisobotlar', icon: BarChart3 },
  { path: '/accounting/employees', label: 'Xodimlar', icon: Users },
  { path: '/accounting/activity', label: 'Faollik', icon: Activity },
];

const LEGACY_NAV = [
  { path: '/accounting/packer', label: 'Packer moliyasi' },
  { path: '/accounting/picker', label: 'Picker moliyasi' },
  { path: '/accounting/courier', label: 'Kuryer moliyasi' },
  { path: '/accounting/operator', label: 'Operator moliyasi' },
  { path: '/accounting/seller', label: 'Seller moliyasi' },
];

function isNavActive(pathname, navPath, endOnly = false) {
  const current = String(pathname || '/').replace(/\/+$/, '') || '/';
  const target = String(navPath || '/').replace(/\/+$/, '') || '/';
  if (endOnly || target === '/accounting') return current === '/accounting';
  return current === target || current.startsWith(`${target}/`);
}

function formatBellDate(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

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

  const dialogs = useAccountingStore((state) => state.dialogs);
  const setDialog = useAccountingStore((state) => state.setDialog);
  const transactionPreset = useAccountingStore((state) => state.transactionPreset);
  const paymentPreset = useAccountingStore((state) => state.paymentPreset);
  const employeeDraft = useAccountingStore((state) => state.employeeDraft);

  const mutations = useAccountingMutations();
  const lookupsQuery = useAccountingLookupsQuery();
  const employeesQuery = useAccountingEmployeesQuery({ search: '', status: '' });

  const who = String(user?.full_name || user?.login || '').trim();
  const displayName = who || 'Buxgalter';
  const isDark = theme === 'dark';

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bellBusyId, setBellBusyId] = useState(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/accounting/portal/notifications');
      const data = res.ok ? await res.json() : { notifications: [] };
      setNotifications(data.notifications || []);
    } catch {
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
    [loadNotifications, request],
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
    [loadNotifications, request],
  );

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const employees = useMemo(() => employeesQuery.data?.employees || [], [employeesQuery.data]);

  async function handleEmployeeSubmit(payload) {
    if (employeeDraft?.id) {
      await mutations.updateEmployee.mutateAsync({ id: employeeDraft.id, payload });
      return;
    }
    await mutations.createEmployee.mutateAsync(payload);
  }

  return (
    <div className="accounting-saas-app accounting-grid-bg accounting-mobile-nav-safe">
      <div className="relative mx-auto min-h-screen max-w-[1680px] px-3 pb-8 pt-3 sm:px-4 lg:px-6">
        <header className="sticky top-0 z-40 mb-4 rounded-[28px] border border-[var(--ac-border)] bg-[var(--ac-surface)]/90 px-4 py-3 shadow-[var(--ac-shadow)] backdrop-blur-2xl sm:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ac-border)] bg-white/10 text-[var(--ac-foreground)] lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Menyu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ac-subtle)]">MyShop moliyaviy markazi</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-lg font-semibold text-[var(--ac-foreground)] md:text-xl">Buxgalteriya va payroll boshqaruvi</h1>
                <span className="text-xs text-[var(--ac-muted)]">{formatDateTimeUz(new Date().toISOString(), { empty: '-' })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ac-border)] bg-white/10 text-[var(--ac-foreground)]"
                onClick={toggleTheme}
                aria-label="Tema"
              >
                {isDark ? <Moon className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
              </button>
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
                    <div className="picker-bell-backdrop" onClick={() => setNotificationsOpen(false)} aria-hidden="true" />
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
                          {notifications.map((item) => (
                            <li key={item.id} className={item.read_at ? '' : 'unread'}>
                              <div className="accounting-bell-item">
                                <div className="accounting-bell-item-title">{item.title}</div>
                                <div className="accounting-bell-item-body">{item.body}</div>
                                <div className="accounting-bell-item-date">{formatBellDate(item.created_at)}</div>
                                {item.link_type === 'withdrawal' && item.link_id ? (
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm accounting-bell-action"
                                    disabled={bellBusyId === item.id}
                                    onClick={() => {
                                      handleApproveWithdrawal(item);
                                      setNotificationsOpen(false);
                                    }}
                                  >
                                    {bellBusyId === item.id ? '...' : 'Tasdiqlash'}
                                  </button>
                                ) : null}
                                {item.link_type === 'withdrawal_payout' && item.link_id ? (
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm accounting-bell-action"
                                    disabled={bellBusyId === item.id}
                                    onClick={() => {
                                      handleMarkPaid(item);
                                      setNotificationsOpen(false);
                                    }}
                                  >
                                    {bellBusyId === item.id ? '...' : 'Pul berildi'}
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </StaffTopbarBellCluster>
              <div className="hidden sm:block">
                <StaffTopbarProfileMenu
                  name={displayName}
                  avatarUrl={user?.avatar_url || undefined}
                  open={profileMenuOpen}
                  onOpenChange={(next) => {
                    setProfileMenuOpen(next);
                    if (next) setNotificationsOpen(false);
                  }}
                  labels={{
                    home: 'Bosh sahifa',
                    profile: 'Profil',
                    settings: 'Sozlamalar',
                    logout: 'Chiqish',
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

        <div className="grid gap-4 lg:grid-cols-[280px,minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-[104px] rounded-[32px] border border-[var(--ac-border)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow)] backdrop-blur-2xl">
              <div className="rounded-[24px] border border-[var(--ac-border)] bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(79,70,229,0.08))] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ac-subtle)]">Premium boshqaruv maydoni</p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--ac-foreground)]">{displayName}</h2>
                <p className="mt-1 text-sm text-[var(--ac-muted)]">Buxgalteriya operatori • xavfsiz ko‘p-rolli kirish</p>
              </div>

              <nav className="mt-4 space-y-2">
                {PRIMARY_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(location.pathname, item.path, item.end);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
                        active
                          ? 'accounting-side-nav-active border-[var(--ac-border)] text-[var(--ac-foreground)]'
                          : 'border-transparent text-[var(--ac-muted)] hover:border-[var(--ac-border)] hover:bg-[var(--ac-surface-muted)]'
                      }`}
                      onClick={() => navigate(item.path)}
                    >
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--ac-border)] bg-white/10">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-6 border-t border-[var(--ac-border)] pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ac-subtle)]">Ish rollari bo‘yicha avvalgi hisobotlar</p>
                <div className="space-y-2">
                  {LEGACY_NAV.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        isNavActive(location.pathname, item.path)
                          ? 'accounting-side-nav-active border-[var(--ac-border)] text-[var(--ac-foreground)]'
                          : 'border-transparent text-[var(--ac-muted)] hover:border-[var(--ac-border)] hover:bg-[var(--ac-surface-muted)]'
                      }`}
                      onClick={() => navigate(item.path)}
                    >
                      <span>{item.label}</span>
                      <span className="text-[var(--ac-subtle)]">→</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Button variant="secondary" onClick={() => navigate('/profile')}>Profil</Button>
                <Button variant="ghost" onClick={() => { logout(); navigate('/'); }}>Chiqish</Button>
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            <div className="rounded-[32px] border border-[var(--ac-border)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow)] backdrop-blur-2xl sm:p-5 xl:p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <div className={`fixed inset-0 z-50 lg:hidden ${mobileNavOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[86vw] max-w-[360px] border-r border-[var(--ac-border)] bg-[var(--ac-surface-strong)] p-4 shadow-[var(--ac-shadow)] transition ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ac-subtle)]">MyShop</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--ac-foreground)]">Buxgalteriya menyusi</h2>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--ac-border)] bg-white/10 text-[var(--ac-foreground)]"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="mt-5 space-y-2">
            {[...PRIMARY_NAV, ...LEGACY_NAV].map((item) => {
              const Icon = item.icon;
              const active = isNavActive(location.pathname, item.path, item.end);
              return (
                <button
                  key={item.path}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
                    active
                      ? 'accounting-side-nav-active border-[var(--ac-border)] text-[var(--ac-foreground)]'
                      : 'border-transparent text-[var(--ac-muted)] hover:border-[var(--ac-border)] hover:bg-[var(--ac-surface-muted)]'
                  }`}
                  onClick={() => {
                    navigate(item.path);
                    setMobileNavOpen(false);
                  }}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : <span className="h-4 w-4">•</span>}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 rounded-[28px] border border-[var(--ac-border)] bg-[var(--ac-surface)]/92 p-2 shadow-[var(--ac-shadow)] backdrop-blur-2xl lg:hidden">
        <div className="grid grid-cols-5 gap-2">
          {PRIMARY_NAV.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = isNavActive(location.pathname, item.path, item.end);
            return (
              <button
                key={item.path}
                type="button"
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition ${
                  active ? 'accounting-side-nav-active text-[var(--ac-foreground)]' : 'text-[var(--ac-muted)]'
                }`}
                onClick={() => navigate(item.path)}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <TransactionDialog
        open={dialogs.transaction}
        onOpenChange={(open) => setDialog('transaction', open)}
        lookups={lookupsQuery.data}
        preset={transactionPreset}
        mutation={mutations.createTransaction}
      />
      <PaymentDialog
        open={dialogs.payment}
        onOpenChange={(open) => setDialog('payment', open)}
        employees={employees}
        preset={paymentPreset}
        mutation={mutations.createPayment}
      />
      <EmployeeDialog
        open={dialogs.employee}
        onOpenChange={(open) => setDialog('employee', open)}
        draft={employeeDraft}
        onSubmit={handleEmployeeSubmit}
        busy={mutations.createEmployee.isPending || mutations.updateEmployee.isPending}
      />
    </div>
  );
}
