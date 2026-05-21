import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  ChartSpline,
  CircleDollarSign,
  CreditCard,
  LogOut,
  Menu,
  MoonStar,
  Receipt,
  SunMedium,
  WalletCards,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchAccountingJson, formatDateTimeUz } from './accountingUtils.js';
import './AccountingDashboard.css';

const NAV_ITEMS = [
  { path: '/accounting', label: 'Boshqaruv paneli', shortLabel: 'Panel', icon: ChartSpline },
  { path: '/accounting/payroll', label: 'Ish haqi', shortLabel: 'Payroll', icon: WalletCards },
  { path: '/accounting/transactions', label: 'Tranzaksiyalar', shortLabel: 'Kirim/chiqim', icon: CircleDollarSign },
  { path: '/accounting/reports', label: 'Hisobotlar', shortLabel: 'Hisobot', icon: Receipt },
  { path: '/accounting/activity', label: 'Faoliyat', shortLabel: 'Faoliyat', icon: CreditCard },
];

function isNavItemActive(pathname, targetPath) {
  const current = String(pathname || '').replace(/\/+$/, '') || '/';
  const target = String(targetPath || '').replace(/\/+$/, '') || '/';
  return current === target || current.startsWith(`${target}/`);
}

function getPageMeta(pathname) {
  const direct = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.path));
  if (direct) return direct;
  if (/\/accounting\/(packer|picker|courier|operator|seller)/.test(pathname)) {
    return { label: 'Operatsion balanslar', shortLabel: 'Balanslar', icon: WalletCards };
  }
  if (/\/accounting\/stats/.test(pathname)) {
    return { label: 'Moliyaviy hisobotlar', shortLabel: 'Hisobot', icon: Receipt };
  }
  return NAV_ITEMS[0];
}

function ShellSidebar({ pathname, navigate, onNavigate }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="space-y-6">
        <div className="accounting-glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-blue-500/20 dark:bg-white dark:text-slate-950">
              <span className="text-lg font-black">M</span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                Premium SaaS
              </p>
              <h1 className="accounting-gradient-text text-lg font-black">MyShop Finance</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Tushum, xarajat, ish haqi va hisobotlarni yagona boshqaruv panelida yuriting.
          </p>
        </div>

        <nav className="space-y-2" aria-label="Buxgalteriya bo‘limlari">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  navigate(item.path);
                  onNavigate?.();
                }}
                className={[
                  'accounting-side-nav-link flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left',
                  active
                    ? 'accounting-side-nav-link-active border-blue-400/30 bg-gradient-to-r from-blue-600 to-violet-600 text-white'
                    : 'border-white/0 bg-white/55 text-slate-700 hover:border-slate-200 hover:bg-white dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-2xl',
                    active ? 'bg-white/15' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  ].join(' ')}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold">{item.label}</div>
                  <div className={active ? 'text-xs text-white/70' : 'text-xs text-slate-500 dark:text-slate-400'}>
                    {item.shortLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="accounting-glass-card mt-6 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          15 kunlik sikl
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
          Avans va oy yakuni to‘lovlari bir joyda kuzatiladi.
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Kechikkan sikllar avtomatik aniqlanadi, kvitansiya va Telegram xabarnomasi tayyorlanadi.
        </p>
      </div>
    </div>
  );
}

export default function AccountingLayout() {
  const { user, logout, request } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [busyNotificationId, setBusyNotificationId] = useState(null);

  const pageMeta = useMemo(() => getPageMeta(location.pathname), [location.pathname]);
  const displayName = String(user?.full_name || user?.login || '').trim() || 'Buxgalter';
  const isDark = theme === 'dark';

  const notificationsQuery = useQuery({
    queryKey: ['accounting-notifications'],
    queryFn: () => fetchAccountingJson(request, '/accounting/portal/notifications'),
    staleTime: 15_000,
  });

  const notifications = Array.isArray(notificationsQuery.data?.notifications) ? notificationsQuery.data.notifications : [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const closeOverlays = () => {
    setMobileSidebarOpen(false);
    setNotificationsOpen(false);
  };

  const refreshNotifications = async () => {
    await queryClient.invalidateQueries({ queryKey: ['accounting-notifications'] });
  };

  const handleNotificationAction = async (notification) => {
    if (!notification?.id) return;
    setBusyNotificationId(notification.id);
    try {
      if (notification.link_type === 'withdrawal' && notification.link_id) {
        await fetchAccountingJson(request, `/accounting/portal/withdrawal-requests/${notification.link_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved', note: '' }),
        });
      }
      if (notification.link_type === 'withdrawal_payout' && notification.link_id) {
        await fetchAccountingJson(request, `/accounting/portal/withdrawal-requests/${notification.link_id}/mark-paid`, {
          method: 'PATCH',
          body: JSON.stringify({}),
        });
      }
      await fetchAccountingJson(request, `/accounting/portal/notifications/${notification.id}/read`, { method: 'PATCH' });
      await refreshNotifications();
      setNotificationsOpen(false);
    } catch (_) {
      /* xabar matni sahifa komponentlari ichida emas */
    } finally {
      setBusyNotificationId(null);
    }
  };

  return (
    <div className="accounting-shell-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] gap-6 px-3 pb-28 pt-3 md:px-5 lg:px-6 lg:pb-8 lg:pt-6">
        <aside className="hidden w-[300px] shrink-0 lg:block">
          <div className="sticky top-6 h-[calc(100vh-3rem)] overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/50 p-4 shadow-2xl shadow-slate-200/50 backdrop-blur-2xl dark:border-slate-800/60 dark:bg-slate-950/35 dark:shadow-black/20">
            <div className="accounting-scrollbar h-full overflow-y-auto pr-1">
              <ShellSidebar pathname={location.pathname} navigate={navigate} />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="accounting-glass-card sticky top-3 z-40 px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                aria-label="Menyuni ochish"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                  MyShop buxgalteriya
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="truncate text-xl font-black text-slate-950 dark:text-white">{pageMeta.label}</h2>
                  <span className="hidden rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-700 md:inline-flex dark:text-blue-200">
                    Real-time finance
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  aria-label="Mavzuni almashtirish"
                >
                  {isDark ? <SunMedium className="h-5 w-5" /> : <MoonStar className="h-5 w-5" />}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen((value) => !value)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    aria-label="Bildirishnomalar"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 ? (
                      <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  <AnimatePresence>
                    {notificationsOpen ? (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        className="absolute right-0 top-14 z-50 w-[min(92vw,24rem)] rounded-[1.4rem] border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/95"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white">Bildirishnomalar</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Pul yechish va to‘lov jarayonlari shu yerda ko‘rinadi.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => setNotificationsOpen(false)}
                            aria-label="Yopish"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="accounting-scrollbar max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                          {notifications.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                              Hozircha yangi xabar yo‘q.
                            </div>
                          ) : (
                            notifications.map((notification) => (
                              <div
                                key={notification.id}
                                className={[
                                  'rounded-2xl border p-3',
                                  notification.read_at
                                    ? 'border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60'
                                    : 'border-blue-300/40 bg-blue-500/8 dark:border-blue-500/30 dark:bg-blue-500/10',
                                ].join(' ')}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                      {notification.title}
                                    </h4>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{notification.body}</p>
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                      {formatDateTimeUz(notification.created_at)}
                                    </p>
                                  </div>
                                  {!notification.read_at ? (
                                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                                  ) : null}
                                </div>

                                {(notification.link_type === 'withdrawal' || notification.link_type === 'withdrawal_payout') &&
                                notification.link_id ? (
                                  <button
                                    type="button"
                                    disabled={busyNotificationId === notification.id}
                                    onClick={() => void handleNotificationAction(notification)}
                                    className="mt-3 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
                                  >
                                    {busyNotificationId === notification.id
                                      ? 'Bajarilmoqda...'
                                      : notification.link_type === 'withdrawal'
                                        ? 'Tasdiqlash'
                                        : 'Pul berildi'}
                                  </button>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="hidden rounded-[1.25rem] border border-slate-200 bg-white/70 px-3 py-2 shadow-sm md:flex md:items-center md:gap-3 dark:border-slate-700 dark:bg-slate-900/70">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-black text-white">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="max-w-[12rem]">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user?.role === 'superuser' || user?.role_id === 1 ? 'Superuser' : 'Buxgalter'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate('/');
                    }}
                    className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label="Chiqish"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </header>

          <motion.main
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="min-w-0 flex-1"
          >
            <Outlet />
          </motion.main>
        </div>
      </div>

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm lg:hidden"
              onClick={closeOverlays}
              aria-label="Yon panelni yopish"
            />
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed inset-y-0 left-0 z-[60] w-[min(88vw,320px)] border-r border-slate-200 bg-white/92 p-4 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/92 lg:hidden"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    Bo‘limlar
                  </p>
                  <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">MyShop Finance</h3>
                </div>
                <button
                  type="button"
                  onClick={closeOverlays}
                  className="rounded-2xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Yopish"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="accounting-scrollbar h-[calc(100%-4rem)] overflow-y-auto pr-1">
                <ShellSidebar pathname={location.pathname} navigate={navigate} onNavigate={closeOverlays} />
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="fixed inset-x-3 bottom-3 z-40 rounded-[1.6rem] border border-slate-200/70 bg-white/78 p-2 shadow-2xl shadow-slate-300/40 backdrop-blur-2xl dark:border-slate-800/70 dark:bg-slate-950/78 dark:shadow-black/20 lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(location.pathname, item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={[
                  'flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold',
                  active
                    ? 'bg-slate-950 text-white shadow-lg shadow-blue-500/20 dark:bg-white dark:text-slate-950'
                    : 'text-slate-500 dark:text-slate-400',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
