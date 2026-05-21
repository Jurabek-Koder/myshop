import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bell,
  CalendarClock,
  CreditCard,
  Landmark,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  ReceiptText,
  SunMedium,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  useAccountingNotifications,
  useApproveWithdrawal,
  useCreatePayrollPayment,
  useCreateTransaction,
  useFinancialTransactions,
  useMarkNotificationRead,
  useMarkWithdrawalPaid,
  usePayrollEmployees,
} from '../../lib/accountingApi.js';
import { formatDateTime, formatMoney, initials } from './accountingFormatters.js';
import { useAccountingUiStore } from '../../stores/accountingUiStore.js';
import './AccountingDashboard.css';

export const ACCOUNTING_NAV_ITEMS = [
  {
    path: '/accounting',
    label: 'Boshqaruv paneli',
    description: 'Analitika va real-time KPI',
    icon: LayoutDashboard,
    end: true,
  },
  {
    path: '/accounting/payroll',
    label: 'Ish haqi boshqaruvi',
    description: 'Avans, oylik va xodimlar',
    icon: Wallet,
  },
  {
    path: '/accounting/transactions',
    label: 'Daromad va xarajatlar',
    description: 'Moliyaviy oqimlar va filtrlash',
    icon: Landmark,
  },
  {
    path: '/accounting/reports',
    label: 'Hisobotlar',
    description: 'Export va rentabellik tahlili',
    icon: ReceiptText,
  },
  {
    path: '/accounting/calendar',
    label: 'Payroll kalendari',
    description: "Muddatlar va kechikkan to'lovlar",
    icon: CalendarClock,
  },
  {
    path: '/accounting/activity',
    label: 'Faollik jurnali',
    description: "Oxirgi o'zgarishlar va audit",
    icon: Activity,
  },
];

const NOTIFICATION_ACTIONS = {
  withdrawal: 'Tasdiqlash',
  withdrawal_payout: "Pul o'tkazildi",
};

function getPageMeta(pathname) {
  const matched = ACCOUNTING_NAV_ITEMS.find((item) => {
    if (item.end) return pathname === item.path;
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  });
  return matched || ACCOUNTING_NAV_ITEMS[0];
}

function NotificationActionButton({ item, approveMutation, markPaidMutation, markReadMutation }) {
  const pending = approveMutation.isPending || markPaidMutation.isPending || markReadMutation.isPending;

  if (item.link_type === 'withdrawal' && item.link_id) {
    return (
      <button
        type="button"
        className="accounting-mini-button accounting-mini-button--primary"
        disabled={pending}
        onClick={() => approveMutation.mutate({ withdrawalId: item.link_id, status: 'approved', note: '' })}
      >
        {NOTIFICATION_ACTIONS.withdrawal}
      </button>
    );
  }

  if (item.link_type === 'withdrawal_payout' && item.link_id) {
    return (
      <button
        type="button"
        className="accounting-mini-button accounting-mini-button--primary"
        disabled={pending}
        onClick={() => markPaidMutation.mutate(item.link_id)}
      >
        {NOTIFICATION_ACTIONS.withdrawal_payout}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="accounting-mini-button"
      disabled={pending}
      onClick={() => markReadMutation.mutate(item.id)}
    >
      O'qildi
    </button>
  );
}

function TransactionModal() {
  const { transactionModal, closeTransactionModal } = useAccountingUiStore();
  const { data: transactionData } = useFinancialTransactions({ limit: 12 });
  const mutation = useCreateTransaction();
  const [form, setForm] = useState({
    direction: 'expense',
    category_slug: 'shop_expense',
    source_type: 'shop_expense',
    title: '',
    amount: '',
    payment_method: 'bank',
    occurred_at: new Date().toISOString().slice(0, 10),
    counterparty: '',
    note: '',
  });

  const categories = transactionData?.categories || { income: [], expense: [] };
  const directionCategories = form.direction === 'income' ? categories.income : categories.expense;

  useEffect(() => {
    if (!transactionModal.open) return;
    const defaults = transactionModal.defaults || {};
    setForm({
      direction: defaults.direction || 'expense',
      category_slug: defaults.category_slug || (defaults.direction === 'income' ? 'manual_income' : 'shop_expense'),
      source_type: defaults.source_type || (defaults.direction === 'income' ? 'manual_income' : 'shop_expense'),
      title: '',
      amount: '',
      payment_method: 'bank',
      occurred_at: new Date().toISOString().slice(0, 10),
      counterparty: '',
      note: '',
    });
  }, [transactionModal]);

  async function handleSubmit(event) {
    event.preventDefault();
    await mutation.mutateAsync({
      ...form,
      amount: Number(form.amount),
      source_type:
        form.source_type ||
        (form.direction === 'income'
          ? form.category_slug || 'manual_income'
          : form.category_slug || 'shop_expense'),
      occurred_at: `${form.occurred_at} 10:00:00`,
    });
    closeTransactionModal();
  }

  return (
    <AnimatePresence>
      {transactionModal.open ? (
        <motion.div className="accounting-modal-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" className="accounting-modal-backdrop" onClick={closeTransactionModal} aria-label="Yopish" />
          <motion.div
            className="accounting-modal-card"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
          >
            <div className="accounting-modal-head">
              <div>
                <h3>Yangi moliyaviy yozuv</h3>
                <p>Daromad yoki xarajat yozuvini qo'shing.</p>
              </div>
              <button type="button" className="accounting-icon-button" onClick={closeTransactionModal} aria-label="Yopish">
                <X size={18} />
              </button>
            </div>
            <form className="accounting-form-grid" onSubmit={handleSubmit}>
              <label>
                <span>Yo'nalish</span>
                <select
                  value={form.direction}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      direction: event.target.value,
                      category_slug: event.target.value === 'income' ? 'manual_income' : 'shop_expense',
                      source_type: event.target.value === 'income' ? 'manual_income' : 'shop_expense',
                    }))
                  }
                >
                  <option value="expense">Xarajat</option>
                  <option value="income">Daromad</option>
                </select>
              </label>
              <label>
                <span>Kategoriya</span>
                <select
                  value={form.category_slug}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      category_slug: event.target.value,
                      source_type: event.target.value,
                    }))
                  }
                >
                  {directionCategories.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="accounting-form-grid--wide">
                <span>Sarlavha</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Masalan, studio ijarasi"
                  required
                />
              </label>
              <label>
                <span>Summa</span>
                <input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="0"
                  required
                />
              </label>
              <label>
                <span>Sana</span>
                <input
                  type="date"
                  value={form.occurred_at}
                  onChange={(event) => setForm((prev) => ({ ...prev, occurred_at: event.target.value }))}
                />
              </label>
              <label>
                <span>To'lov usuli</span>
                <select
                  value={form.payment_method}
                  onChange={(event) => setForm((prev) => ({ ...prev, payment_method: event.target.value }))}
                >
                  <option value="bank">Bank</option>
                  <option value="transfer">O'tkazma</option>
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                </select>
              </label>
              <label>
                <span>Tomon</span>
                <input
                  value={form.counterparty}
                  onChange={(event) => setForm((prev) => ({ ...prev, counterparty: event.target.value }))}
                  placeholder="Yetkazib beruvchi yoki mijoz"
                />
              </label>
              <label className="accounting-form-grid--wide">
                <span>Izoh</span>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Qo'shimcha ma'lumot"
                />
              </label>
              {mutation.error ? <div className="accounting-form-error">{mutation.error.message}</div> : null}
              <div className="accounting-modal-actions">
                <button type="button" className="accounting-secondary-button" onClick={closeTransactionModal}>
                  Bekor qilish
                </button>
                <button type="submit" className="accounting-primary-button" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PaymentModal() {
  const { paymentModal, closePaymentModal } = useAccountingUiStore();
  const { data: employeesData } = usePayrollEmployees({});
  const mutation = useCreatePayrollPayment();
  const [form, setForm] = useState({
    employee_id: '',
    phase: 'salary',
    amount: '',
    payment_method: 'bank',
    month_key: new Date().toISOString().slice(0, 7),
    note: '',
  });

  useEffect(() => {
    if (!paymentModal.open) return;
    setForm({
      employee_id: paymentModal.defaults?.employee_id ? String(paymentModal.defaults.employee_id) : '',
      phase: paymentModal.defaults?.phase || 'salary',
      amount: '',
      payment_method: 'bank',
      month_key: new Date().toISOString().slice(0, 7),
      note: '',
    });
  }, [paymentModal]);

  async function handleSubmit(event) {
    event.preventDefault();
    await mutation.mutateAsync({
      ...form,
      employee_id: Number(form.employee_id),
      amount: Number(form.amount),
    });
    closePaymentModal();
  }

  return (
    <AnimatePresence>
      {paymentModal.open ? (
        <motion.div className="accounting-modal-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" className="accounting-modal-backdrop" onClick={closePaymentModal} aria-label="Yopish" />
          <motion.div
            className="accounting-modal-card"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
          >
            <div className="accounting-modal-head">
              <div>
                <h3>Ish haqi to'lovi</h3>
                <p>Avans yoki oylik ish haqi yozuvini kiriting.</p>
              </div>
              <button type="button" className="accounting-icon-button" onClick={closePaymentModal} aria-label="Yopish">
                <X size={18} />
              </button>
            </div>
            <form className="accounting-form-grid" onSubmit={handleSubmit}>
              <label className="accounting-form-grid--wide">
                <span>Xodim</span>
                <select
                  value={form.employee_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, employee_id: event.target.value }))}
                  required
                >
                  <option value="">Xodimni tanlang</option>
                  {(employeesData?.employees || []).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name} - {formatMoney(employee.monthly_salary)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Bosqich</span>
                <select value={form.phase} onChange={(event) => setForm((prev) => ({ ...prev, phase: event.target.value }))}>
                  <option value="advance">Avans</option>
                  <option value="salary">Oylik ish haqi</option>
                </select>
              </label>
              <label>
                <span>Oy</span>
                <input
                  type="month"
                  value={form.month_key}
                  onChange={(event) => setForm((prev) => ({ ...prev, month_key: event.target.value }))}
                />
              </label>
              <label>
                <span>Summa</span>
                <input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>To'lov usuli</span>
                <select
                  value={form.payment_method}
                  onChange={(event) => setForm((prev) => ({ ...prev, payment_method: event.target.value }))}
                >
                  <option value="bank">Bank</option>
                  <option value="transfer">O'tkazma</option>
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                </select>
              </label>
              <label className="accounting-form-grid--wide">
                <span>Izoh</span>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Izoh yoki to'lov maqsadi"
                />
              </label>
              {mutation.error ? <div className="accounting-form-error">{mutation.error.message}</div> : null}
              <div className="accounting-modal-actions">
                <button type="button" className="accounting-secondary-button" onClick={closePaymentModal}>
                  Bekor qilish
                </button>
                <button type="submit" className="accounting-primary-button" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Yozilmoqda...' : "To'lovni yozish"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function AccountingLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const currentPage = useMemo(() => getPageMeta(location.pathname), [location.pathname]);
  const notificationsQuery = useAccountingNotifications();
  const unreadCount = (notificationsQuery.data?.notifications || []).filter((item) => !item.read_at).length;
  const approveMutation = useApproveWithdrawal();
  const markPaidMutation = useMarkWithdrawalPaid();
  const markReadMutation = useMarkNotificationRead();
  const { openTransactionModal, openPaymentModal } = useAccountingUiStore();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const displayName = String(user?.full_name || user?.login || 'Buxgalter').trim();
  const userRole = String(user?.role || '').trim().toLowerCase();
  const isDark = theme === 'dark';

  return (
    <div className="accounting-shell">
      <div className="accounting-shell__backdrop" aria-hidden />
      <AnimatePresence>
        {sidebarOpen ? (
          <motion.button
            type="button"
            className="accounting-shell__overlay"
            onClick={() => setSidebarOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Yon menyuni yopish"
          />
        ) : null}
      </AnimatePresence>

      <aside className={`accounting-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="accounting-brand">
          <div className="accounting-brand__badge">MS</div>
          <div>
            <span>MyShop Finance OS</span>
            <small>Premium accounting workspace</small>
          </div>
        </div>

        <div className="accounting-profile-card">
          <div className="accounting-profile-card__avatar">{initials(displayName)}</div>
          <div>
            <strong>{displayName}</strong>
            <small>{userRole === 'superuser' ? 'Superuser / moliya nazorati' : 'Buxgalteriya operatori'}</small>
          </div>
        </div>

        <nav className="accounting-nav" aria-label="Buxgalteriya bo'limlari">
          {ACCOUNTING_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `accounting-nav__item${isActive ? ' is-active' : ''}`}
              >
                <span className="accounting-nav__icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className="accounting-sidebar__footer">
          <button type="button" className="accounting-sidebar__ghost" onClick={toggleTheme}>
            {isDark ? <SunMedium size={16} /> : <Moon size={16} />}
            <span>{isDark ? "Yorug' mavzu" : 'Tungi mavzu'}</span>
          </button>
          <button
            type="button"
            className="accounting-sidebar__ghost"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            <X size={16} />
            <span>Chiqish</span>
          </button>
        </div>
      </aside>

      <div className="accounting-app">
        <header className="accounting-topbar">
          <div className="accounting-topbar__left">
            <button type="button" className="accounting-icon-button accounting-mobile-only" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div>
              <div className="accounting-kicker">MyShop bugalteriya platformasi</div>
              <h1>{currentPage.label}</h1>
              <p>{currentPage.description}</p>
            </div>
          </div>

          <div className="accounting-topbar__actions">
            <button
              type="button"
              className="accounting-secondary-button accounting-topbar__quick"
              onClick={() => openTransactionModal({ direction: 'expense' })}
            >
              <Plus size={16} />
              Xarajat
            </button>
            <button
              type="button"
              className="accounting-primary-button accounting-topbar__quick"
              onClick={() => openPaymentModal({ phase: 'salary' })}
            >
              <CreditCard size={16} />
              Ish haqi
            </button>
            <div className="accounting-notification-wrap">
              <button type="button" className="accounting-icon-button" onClick={() => setNotificationsOpen((prev) => !prev)}>
                <Bell size={18} />
                {unreadCount ? <span className="accounting-badge">{unreadCount}</span> : null}
              </button>
              <AnimatePresence>
                {notificationsOpen ? (
                  <motion.div
                    className="accounting-notification-panel"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                  >
                    <div className="accounting-notification-panel__head">
                      <div>
                        <strong>Bildirishnomalar</strong>
                        <small>Withdrawal oqimi va tizim eslatmalari</small>
                      </div>
                      <button type="button" className="accounting-icon-button" onClick={() => setNotificationsOpen(false)}>
                        <X size={16} />
                      </button>
                    </div>
                    <div className="accounting-notification-list">
                      {(notificationsQuery.data?.notifications || []).length ? (
                        notificationsQuery.data.notifications.map((item) => (
                          <div key={item.id} className={`accounting-notification-item${item.read_at ? '' : ' is-unread'}`}>
                            <div>
                              <strong>{item.title}</strong>
                              <p>{item.body}</p>
                              <small>{formatDateTime(item.created_at)}</small>
                            </div>
                            <NotificationActionButton
                              item={item}
                              approveMutation={approveMutation}
                              markPaidMutation={markPaidMutation}
                              markReadMutation={markReadMutation}
                            />
                          </div>
                        ))
                      ) : (
                        <div className="accounting-empty-inline">Yangi bildirishnoma yo'q.</div>
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="accounting-main">
          <Outlet />
        </main>

        <nav className="accounting-bottom-nav" aria-label="Mobil bo'limlar">
          {ACCOUNTING_NAV_ITEMS.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <NavLink key={item.path} to={item.path} end={item.end} className={`accounting-bottom-nav__item${isActive ? ' is-active' : ''}`}>
                <Icon size={18} />
                <span>{item.label.split(' ')[0]}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <TransactionModal />
      <PaymentModal />
    </div>
  );
}
