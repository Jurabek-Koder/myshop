import React, { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BarChart3, FileText, HandCoins, LayoutDashboard, Moon, Sun, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { cn } from './cn.js';
import './accounting.tailwind.css';
import './AccountingDashboard.css';

const NAV_ITEMS = [
  { path: '/accounting', label: 'Boshqaruv paneli', icon: LayoutDashboard, end: true },
  { path: '/accounting/payroll', label: 'Ish haqi boshqaruvi', icon: HandCoins },
  { path: '/accounting/transactions', label: 'Daromad va xarajatlar', icon: Wallet },
  { path: '/accounting/reports', label: 'Hisobotlar', icon: FileText },
  { path: '/accounting/analytics', label: 'Moliyaviy tahlil', icon: BarChart3 },
];

function navIsActive(pathname, path, end = false) {
  if (end) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function AccountingLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [queryClient] = useState(() => new QueryClient());
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const displayName = useMemo(() => {
    const who = String(user?.full_name || user?.login || '').trim();
    return who || 'Buxgalter';
  }, [user]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="accounting-shell min-h-dvh pb-20 md:pb-0">
        <div className="mx-auto flex min-h-dvh max-w-[1600px]">
          <aside
            className={cn(
              'accounting-sidebar fixed inset-y-0 left-0 z-40 w-72 border-r border-white/10 bg-slate-950/80 p-4 backdrop-blur-xl transition-transform md:static md:translate-x-0',
              menuOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <div className="mb-6 rounded-2xl border border-indigo-300/20 bg-indigo-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">myshop finance</p>
              <h1 className="mt-2 text-lg font-semibold text-white">Buxgalteriya SaaS panel</h1>
              <p className="mt-1 text-sm text-indigo-100/90">{displayName}</p>
            </div>

            <nav className="space-y-1.5" aria-label="Buxgalteriya navigatsiyasi">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = navIsActive(location.pathname, item.path, item.end);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
                      active
                        ? 'border-indigo-300/30 bg-indigo-500/20 text-white'
                        : 'border-transparent text-slate-300 hover:border-white/15 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
              >
                <span>{theme === 'dark' ? 'Qorong‘i rejim' : 'Yorug‘ rejim'}</span>
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="w-full rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 hover:bg-rose-500/20"
              >
                Chiqish
              </button>
            </div>
          </aside>

          {menuOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-30 bg-black/50 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-label="Menyuni yopish"
            />
          ) : null}

          <div className="flex min-h-dvh flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur-xl md:px-6">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="rounded-xl border border-white/20 px-3 py-1.5 text-sm text-slate-200 md:hidden"
                >
                  Bo‘limlar
                </button>
                <div>
                  <p className="text-sm text-slate-400">Moliyaviy boshqaruv markazi</p>
                  <p className="text-base font-semibold text-white">Assalomu alaykum, {displayName}</p>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="hidden rounded-xl border border-white/20 p-2 text-slate-200 hover:bg-white/10 md:inline-flex"
                  aria-label="Mavzuni almashtirish"
                >
                  {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
              </div>
            </header>

            <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
              <Outlet />
            </main>
          </div>
        </div>

        <nav className="accounting-mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/90 px-2 py-2 backdrop-blur-xl md:hidden">
          <div className="grid grid-cols-4 gap-2">
            {NAV_ITEMS.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = navIsActive(location.pathname, item.path, item.end);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px]',
                    active ? 'bg-indigo-500/20 text-white' : 'text-slate-400',
                  )}
                >
                  <Icon size={16} />
                  <span className="truncate">{item.label.split(' ')[0]}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </QueryClientProvider>
  );
}
