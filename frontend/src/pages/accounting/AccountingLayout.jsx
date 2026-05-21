import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  BookText,
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  Menu,
  MoonStar,
  ReceiptText,
  SunMedium,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/cn.js';
import { Button } from '../../components/ui/button.jsx';
import { readJson } from './accountingApi.js';
import { formatDateTime, getGreetingHourLabel } from './accountingUtils.js';

const ACCOUNTING_NAV = [
  { path: '/accounting', label: 'Boshqaruv paneli', icon: LayoutDashboard },
  { path: '/accounting/payroll', label: 'Ish haqi', icon: CreditCard },
  { path: '/accounting/people', label: 'Mas’ul xodimlar', icon: UsersRound },
  { path: '/accounting/transactions', label: 'Kirim-chiqim', icon: ReceiptText },
  { path: '/accounting/reports', label: 'Hisobotlar', icon: BookText },
  { path: '/accounting/calendar', label: 'Payroll kalendari', icon: CalendarRange },
  { path: '/accounting/activities', label: 'Faollik jurnali', icon: Activity },
];

function isActivePath(currentPath, targetPath) {
  if (targetPath === '/accounting') return currentPath === '/accounting';
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export default function AccountingLayout() {
  const { user, logout, request } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const displayName = String(user?.full_name || user?.login || 'Buxgalter').trim();
  const greeting = getGreetingHourLabel();

  const notificationsQuery = useQuery({
    queryKey: ['accounting', 'notifications'],
    queryFn: async () => {
      const res = await request('/accounting/portal/notifications');
      const data = await readJson(res);
      return Array.isArray(data.notifications) ? data.notifications : [];
    },
  });

  const notifications = notificationsQuery.data || [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const isDark = theme === 'dark';

  const mobileNav = useMemo(() => ACCOUNTING_NAV.slice(0, 5), []);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_22%),radial-gradient(circle_at_top_left,rgba(99,102,241,0.14),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_46%,#f8fafc_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.15),transparent_22%),radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_42%,#020617_100%)] dark:text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1640px] flex-col lg:flex-row">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-[290px] max-w-[82vw] border-r border-white/40 bg-white/70 p-5 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.45)] backdrop-blur-2xl transition-transform duration-300 dark:border-white/10 dark:bg-slate-950/74 lg:static lg:translate-x-0 lg:shadow-none',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <div className="flex h-full flex-col">
            <div className="rounded-[28px] border border-white/45 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.8)]">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200/80">MyShop Accounting</div>
              <h2 className="mt-3 text-2xl font-semibold">Premium moliyaviy boshqaruv</h2>
              <p className="mt-2 text-sm text-slate-300">
                Payroll, daromad va xarajatlarni yagona boshqaruv markazidan nazorat qiling.
              </p>
            </div>

            <nav className="mt-6 flex-1 space-y-2">
              {ACCOUNTING_NAV.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(location.pathname, item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      navigate(item.path);
                      setMobileOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left text-sm font-medium transition',
                      active
                        ? 'bg-slate-950 text-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.85)] dark:bg-white dark:text-slate-950'
                        : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
                    )}
                  >
                    <span className={cn('rounded-2xl p-2', active ? 'bg-white/15 dark:bg-slate-950/10' : 'bg-slate-100 dark:bg-white/5')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="rounded-[24px] border border-white/40 bg-white/80 p-4 text-sm text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-white">{displayName}</div>
              <div className="mt-1">{user?.role === 'accounting' ? 'Buxgalteriya roli' : 'Moliyaviy foydalanuvchi'}</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                  {isDark ? 'Yorug‘ rejim' : 'Tungi rejim'}
                </button>
                <Button variant="ghost" onClick={() => { logout(); navigate('/'); }}>
                  Chiqish
                </Button>
              </div>
            </div>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            aria-label="Yon panelni yopish"
            className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <div className="relative flex min-h-[100dvh] flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/40 bg-white/55 px-4 py-4 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100 lg:hidden"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">{greeting}</p>
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white sm:text-2xl">{displayName}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden rounded-2xl border border-white/45 bg-white/70 px-4 py-2 text-right text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 sm:block">
                  <div className="font-medium text-slate-900 dark:text-white">Realtime sync</div>
                  <div>{new Date().toLocaleDateString('uz-UZ')}</div>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100"
                    onClick={() => setNotificationsOpen((current) => !current)}
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 ? (
                      <span className="absolute right-2 top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                        {unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {notificationsOpen ? (
                    <div className="absolute right-0 mt-3 w-[min(90vw,360px)] rounded-[28px] border border-white/55 bg-white/92 p-4 shadow-[0_30px_120px_-40px_rgba(15,23,42,0.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/92">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">Bildirishnomalar</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Payroll va moliyaviy ogohlantirishlar</p>
                        </div>
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 dark:text-slate-400"
                          onClick={() => notificationsQuery.refetch()}
                        >
                          Yangilash
                        </button>
                      </div>
                      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                        {notifications.length === 0 ? (
                          <p className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                            Hozircha yangi bildirishnoma yo‘q.
                          </p>
                        ) : (
                          notifications.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                'rounded-[22px] border p-4 text-sm',
                                item.read_at
                                  ? 'border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/5'
                                  : 'border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10',
                              )}
                            >
                              <div className="font-semibold text-slate-900 dark:text-white">{item.title}</div>
                              <p className="mt-1 text-slate-600 dark:text-slate-300">{item.body}</p>
                              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(item.created_at)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-8">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-[28px] border border-white/55 bg-white/80 p-2 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/80 lg:hidden">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(location.pathname, item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-3xl px-2 py-2 text-[11px] font-medium transition',
                active
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
