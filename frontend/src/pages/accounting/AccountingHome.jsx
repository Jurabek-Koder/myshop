import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Download,
  Plus,
  ReceiptText,
  Send,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AccountingDashboard.css';

const moneyFmt = new Intl.NumberFormat('uz-UZ');

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0 so‘m';
  return `${moneyFmt.format(Math.round(n))} so‘m`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'is-paid';
  if (s === 'overdue') return 'is-overdue';
  return 'is-pending';
}

function DashboardSkeleton() {
  return (
    <div className="accounting-modern-page">
      <div className="accounting-skeleton hero" />
      <div className="accounting-kpi-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="accounting-skeleton card" key={i} />
        ))}
      </div>
      <div className="accounting-grid-2">
        <div className="accounting-skeleton panel" />
        <div className="accounting-skeleton panel" />
      </div>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="accounting-empty-state">
      <ReceiptText size={30} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function KpiCard({ icon: Icon, title, value, helper, tone, trend }) {
  return (
    <motion.article className={`accounting-kpi-card tone-${tone}`} whileHover={{ y: -4, scale: 1.01 }}>
      <div className="accounting-kpi-icon">
        <Icon size={22} />
      </div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
      {trend && (
        <span className="accounting-kpi-trend">
          <ArrowUpRight size={15} />
          {trend}
        </span>
      )}
    </motion.article>
  );
}

export { formatMoney, formatDate, statusClass, EmptyState };

export default function AccountingHome() {
  const { request } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request('/accounting/portal/dashboard');
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Boshqaruv paneli yuklanmadi.');
        return;
      }
      setDashboard(data);
    } catch (e) {
      setError(e?.message || 'Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const kpis = dashboard?.kpis || {};
  const monthly = Array.isArray(dashboard?.charts?.monthly) ? dashboard.charts.monthly : [];
  const expenseCategories = Array.isArray(dashboard?.charts?.expense_categories) ? dashboard.charts.expense_categories : [];
  const payrollStatus = dashboard?.charts?.payroll_status || {};
  const payrollStatusData = useMemo(
    () =>
      Object.entries(payrollStatus).map(([key, value]) => ({
        key,
        name: value.label,
        value: Number(value.count) || 0,
        amount: Number(value.amount) || 0,
      })),
    [payrollStatus],
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="accounting-modern-page">
      <motion.section
        className="accounting-hero"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div>
          <span className="accounting-eyebrow">MyShop Finance OS</span>
          <h1>Boshqaruv paneli</h1>
          <p>
            Tushum, xarajat, sof foyda va 15 kunlik ish haqi sikllarini bitta premium buxgalteriya markazida
            nazorat qiling.
          </p>
          {error && <div className="accounting-alert">{error}</div>}
        </div>
        <div className="accounting-hero-actions">
          <button type="button" className="accounting-btn ghost" onClick={loadDashboard}>
            <Activity size={17} /> Yangilash
          </button>
          <button type="button" className="accounting-btn primary" onClick={() => navigate('/accounting/transactions')}>
            <Plus size={17} /> Yangi xarajat qo‘shish
          </button>
        </div>
      </motion.section>

      <section className="accounting-kpi-grid" aria-label="Asosiy ko‘rsatkichlar">
        <KpiCard
          icon={CircleDollarSign}
          title="Umumiy tushum"
          value={formatMoney(kpis.total_revenue)}
          helper={`${formatMoney(kpis.sales_income)} savdolardan`}
          tone="blue"
          trend={`${kpis.orders_count || 0} buyurtma`}
        />
        <KpiCard
          icon={TrendingDown}
          title="Umumiy xarajatlar"
          value={formatMoney(kpis.total_expenses)}
          helper={`Xarajat ulushi: ${kpis.expense_ratio || 0}%`}
          tone="rose"
        />
        <KpiCard
          icon={TrendingUp}
          title="Sof foyda"
          value={formatMoney(kpis.net_profit)}
          helper="Tushumdan xarajatlar ayirildi"
          tone="emerald"
        />
        <KpiCard
          icon={WalletCards}
          title="Oyliklar uchun jami xarajat"
          value={formatMoney(kpis.payroll_cost)}
          helper="Joriy oyda to‘langan ish haqi"
          tone="violet"
        />
      </section>

      <section className="accounting-quick-actions" aria-label="Tezkor amallar">
        {[
          { label: 'Yangi xarajat qo‘shish', icon: Plus, path: '/accounting/transactions' },
          { label: 'Oylik to‘lash', icon: WalletCards, path: '/accounting/payroll' },
          { label: 'Avans berish', icon: Send, path: '/accounting/payroll' },
          { label: 'Hisobot chiqarish', icon: Download, path: '/accounting/reports' },
        ].map((action) => (
          <button key={action.label} type="button" onClick={() => navigate(action.path)}>
            <action.icon size={18} />
            <span>{action.label}</span>
          </button>
        ))}
      </section>

      <div className="accounting-grid-2">
        <section className="accounting-panel accounting-chart-panel">
          <div className="accounting-panel-head">
            <div>
              <span>Moliyaviy tahlil</span>
              <h2>Oylik trendlar</h2>
            </div>
          </div>
          <div className="accounting-chart">
            {monthly.length ? (
              <ResponsiveContainer width="100%" height={310}>
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
                  <XAxis dataKey="short_month" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000000)}m`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => formatMoney(v)} labelStyle={{ color: '#0f172a' }} />
                  <Area type="monotone" dataKey="revenue" name="Tushum" stroke="#2563eb" fill="url(#revenueFill)" strokeWidth={3} />
                  <Area type="monotone" dataKey="profit" name="Sof foyda" stroke="#10b981" fill="url(#profitFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Grafik uchun ma’lumot yo‘q" text="Tushum yoki xarajat kiritilgach trendlar ko‘rinadi." />
            )}
          </div>
        </section>

        <section className="accounting-panel">
          <div className="accounting-panel-head">
            <div>
              <span>Ish haqi holati</span>
              <h2>15 kunlik sikllar</h2>
            </div>
            <button type="button" className="accounting-icon-btn" onClick={() => navigate('/accounting/payroll')}>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="accounting-chart compact">
            {payrollStatusData.some((x) => x.value > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={payrollStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4}>
                    {payrollStatusData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry.key === 'paid' ? '#10b981' : entry.key === 'overdue' ? '#ef4444' : '#f59e0b'}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, _name, props) => [`${value} ta`, props.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Sikl yo‘q" text="Xodimlarga oylik belgilansa sikllar avtomatik ochiladi." />
            )}
          </div>
          <div className="accounting-status-row">
            {payrollStatusData.map((item) => (
              <span key={item.key} className={`accounting-status-chip ${statusClass(item.key)}`}>
                {item.name}: {item.value}
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="accounting-grid-2">
        <section className="accounting-panel">
          <div className="accounting-panel-head">
            <div>
              <span>Xarajat tahlili</span>
              <h2>Kategoriyalar</h2>
            </div>
          </div>
          <div className="accounting-chart compact">
            {expenseCategories.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={expenseCategories}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.22)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000000)}m`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Bar dataKey="amount" name="Xarajat" radius={[12, 12, 0, 0]}>
                    {expenseCategories.map((entry) => (
                      <Cell key={entry.name} fill={entry.color || '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Xarajat kiritilmagan" text="Yangi xarajatlar kategoriyalar kesimida ko‘rinadi." />
            )}
          </div>
        </section>

        <section className="accounting-panel">
          <div className="accounting-panel-head">
            <div>
              <span>Real vaqt statistikasi</span>
              <h2>Yaqin to‘lovlar</h2>
            </div>
            <CalendarClock size={20} />
          </div>
          <div className="accounting-cycle-list">
            {(dashboard?.next_cycles || []).length ? (
              dashboard.next_cycles.map((cycle) => (
                <article key={cycle.id} className="accounting-cycle-item">
                  <div>
                    <strong>{cycle.full_name}</strong>
                    <span>
                      {cycle.phase_label} · {formatDate(cycle.due_date)}
                    </span>
                  </div>
                  <div>
                    <b>{formatMoney(cycle.remaining_amount)}</b>
                    <span className={`accounting-status-chip ${statusClass(cycle.status)}`}>{cycle.status_label}</span>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Kutilayotgan to‘lov yo‘q" text="Barcha oylik sikllari nazorat ostida." />
            )}
          </div>
        </section>
      </div>

      <section className="accounting-panel">
        <div className="accounting-panel-head">
          <div>
            <span>Faollik lentasi</span>
            <h2>Oxirgi operatsiyalar</h2>
          </div>
        </div>
        <div className="accounting-activity-list">
          {(dashboard?.activity || []).length ? (
            dashboard.activity.map((item) => (
              <article key={item.id} className="accounting-activity-item">
                <span className={`accounting-activity-dot ${item.kind}`} />
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.subtitle} · {formatDate(item.occurred_at)}
                  </span>
                </div>
                <b>{formatMoney(item.amount)}</b>
              </article>
            ))
          ) : (
            <EmptyState title="Faollik hali yo‘q" text="To‘lov va moliyaviy operatsiyalar shu yerda chiqadi." />
          )}
        </div>
      </section>
    </div>
  );
}
