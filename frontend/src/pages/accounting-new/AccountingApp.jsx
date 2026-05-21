import React, { useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Wallet, ArrowUpDown, FileText,
  Settings, LogOut, Menu, X, Sun, Moon, Bell, ChevronDown,
  TrendingUp, Calculator, Calendar, Receipt
} from 'lucide-react';
import './accounting.css';

const NAV_ITEMS = [
  { path: '/accounting', label: 'Boshqaruv paneli', icon: LayoutDashboard, end: true },
  { path: '/accounting/payroll', label: 'Ish haqi boshqaruvi', icon: Wallet },
  { path: '/accounting/employees', label: 'Xodimlar', icon: Users },
  { path: '/accounting/transactions', label: 'Daromad va xarajatlar', icon: ArrowUpDown },
  { path: '/accounting/reports', label: 'Hisobotlar', icon: FileText },
  { path: '/accounting/calendar', label: 'To\'lov kalendari', icon: Calendar },
];

function isActive(pathname, navPath, endOnly) {
  const p = pathname.replace(/\/+$/, '') || '/accounting';
  const n = navPath.replace(/\/+$/, '');
  if (endOnly) return p === n;
  return p === n || p.startsWith(`${n}/`);
}

export default function AccountingApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isDark = theme === 'dark';
  const displayName = user?.full_name || user?.login || 'Buxgalter';

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className={`acc-app min-h-screen flex ${isDark ? 'dark' : ''}`}>
      <div className="min-h-screen flex w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">

        {/* Sidebar Overlay - Mobile */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
              onClick={closeSidebar}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside className={`
          fixed top-0 left-0 bottom-0 w-72 z-50
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-300 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
        `}>
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 dark:text-white">MyShop</h1>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Buxgalteriya</p>
              </div>
            </div>
            <button onClick={closeSidebar} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const active = isActive(location.pathname, item.path, item.end);
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); closeSidebar(); }}
                  className={`sidebar-link w-full ${active ? 'sidebar-link-active' : ''}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.label}</span>
                  {active && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 w-1 h-6 rounded-r-full bg-primary-500"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Mavzu</span>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-gray-600" />}
              </button>
            </div>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="sidebar-link w-full text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10"
            >
              <LogOut className="w-5 h-5" />
              <span>Chiqish</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:block">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {NAV_ITEMS.find(n => isActive(location.pathname, n.path, n.end))?.label || 'Boshqaruv paneli'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full" />
              </button>

              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-sm font-medium">{displayName}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                <AnimatePresence>
                  {profileOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 py-2"
                      >
                        <button
                          onClick={() => { navigate('/profile'); setProfileOpen(false); }}
                          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Profil
                        </button>
                        <button
                          onClick={() => { logout(); navigate('/'); }}
                          className="w-full px-4 py-2 text-sm text-left text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                        >
                          Chiqish
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
            <Outlet />
          </main>

          {/* Mobile Bottom Navigation */}
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 px-2 py-2">
            <div className="flex items-center justify-around">
              {NAV_ITEMS.slice(0, 5).map((item) => {
                const active = isActive(location.pathname, item.path, item.end);
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                      active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium truncate max-w-[56px]">
                      {item.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
