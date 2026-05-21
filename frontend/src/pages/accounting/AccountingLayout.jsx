import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChartNoAxesCombined, Coins, HandCoins, ReceiptText, ScrollText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './AccountingDashboard.css';

const ACCOUNTING_SIDE_NAV = [
  { path: '/accounting', label: 'Boshqaruv paneli', icon: ChartNoAxesCombined, end: true },
  { path: '/accounting/payroll', label: 'Ish haqi', icon: HandCoins },
  { path: '/accounting/transactions', label: 'Tushum/xarajat', icon: Coins },
  { path: '/accounting/reports', label: 'Hisobotlar', icon: ReceiptText },
  { path: '/accounting/receipts', label: 'Cheklar', icon: ScrollText },
  { path: '/accounting/activity', label: 'Faollik', icon: Activity },
];

export default function AccountingLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const displayName = String(user?.full_name || user?.login || '').trim() || 'Buxgalter';
  const isDark = theme === 'dark';

  const currentLabel = useMemo(() => {
    const found = ACCOUNTING_SIDE_NAV.find((n) =>
      n.end ? location.pathname === n.path : location.pathname.startsWith(n.path),
    );
    return found?.label || 'Boshqaruv paneli';
  }, [location.pathname]);

  return (
    <div className="acc-shell">
      <aside className="acc-sidebar">
        <div className="acc-logo">
          <span>myshop</span>
          <small>Buxgalteriya SaaS</small>
        </div>
        <nav className="acc-sidebar-nav" aria-label="Buxgalteriya navigatsiyasi">
          {ACCOUNTING_SIDE_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `acc-nav-item${isActive ? ' active' : ''}`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="acc-sidebar-footer">
          <button type="button" className="acc-theme-toggle" onClick={toggleTheme}>
            {isDark ? '🌙 Tungi rejim' : '☀️ Yorug‘ rejim'}
          </button>
          <button
            type="button"
            className="acc-logout"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            Chiqish
          </button>
        </div>
      </aside>

      <div className="acc-main-shell">
        <header className="acc-topbar">
          <div>
            <p className="acc-topbar-title">{currentLabel}</p>
            <h2>{displayName}</h2>
          </div>
          <button type="button" className="acc-mobile-toggle" onClick={() => setMobileNavOpen((v) => !v)}>
            Bo‘limlar
          </button>
        </header>
        <main className="acc-main">
          <Outlet />
        </main>
      </div>

      <nav className={`acc-bottom-nav ${mobileNavOpen ? 'open' : ''}`} aria-label="Mobil navigatsiya">
        {ACCOUNTING_SIDE_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `acc-bottom-item${isActive ? ' active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
