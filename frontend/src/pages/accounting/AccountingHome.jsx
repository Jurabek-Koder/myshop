import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRightLeft, FileDown, HandCoins, PlusCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createAccountingApi } from './v2/accountingApi.js';
import { formatCompactMoney, formatDateTime, formatMoney, statusClass } from './v2/accountingUtils.js';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="acc-chart-tooltip">
      <p className="acc-chart-tooltip-title">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color || '#fff' }}>
          {item.name}: {formatCompactMoney(item.value)} so‘m
        </p>
      ))}
    </div>
  );
}

export default function AccountingHome() {
  const navigate = useNavigate();
  const { request } = useAuth();
  const api = useMemo(() => createAccountingApi(request), [request]);
  const dashboardQuery = useQuery({
    queryKey: ['accounting-dashboard', 90],
    queryFn: () => api.getDashboard(90),
    staleTime: 30_000,
  });

  const data = dashboardQuery.data;
  const monthly = data?.charts?.monthly_trends || [];
  const payrollAnalytics = data?.charts?.payroll_analytics || [];
  const profitGrowth = data?.charts?.profit_growth || [];
  const statuses = data?.payroll_statuses || [];
  const activity = data?.activity_feed || [];

  return (
    <section className="acc-page">
      <div className="acc-page-heading">
        <div>
          <h1>Boshqaruv paneli</h1>
          <p>Moliyaviy ko‘rsatkichlar, ish haqi holati va oxirgi operatsiyalar.</p>
        </div>
        <div className="acc-actions-inline">
          <button type="button" className="acc-btn acc-btn-secondary" onClick={() => navigate('/accounting/transactions')}>
            <ArrowRightLeft size={16} />
            Tranzaksiyalar
          </button>
          <button type="button" className="acc-btn acc-btn-primary" onClick={() => navigate('/accounting/reports')}>
            <FileDown size={16} />
            Hisobotlar
          </button>
        </div>
      </div>

      <div className="acc-grid-kpi">
        <motion.article className="acc-kpi-card" whileHover={{ y: -2 }}>
          <span>Umumiy tushum</span>
          <strong>{formatMoney(data?.kpis?.total_income)}</strong>
        </motion.article>
        <motion.article className="acc-kpi-card" whileHover={{ y: -2 }}>
          <span>Umumiy xarajatlar</span>
          <strong>{formatMoney(data?.kpis?.total_expense)}</strong>
        </motion.article>
        <motion.article className="acc-kpi-card" whileHover={{ y: -2 }}>
          <span>Sof foyda</span>
          <strong>{formatMoney(data?.kpis?.net_profit)}</strong>
        </motion.article>
        <motion.article className="acc-kpi-card" whileHover={{ y: -2 }}>
          <span>Oyliklar uchun jami xarajat</span>
          <strong>{formatMoney(data?.kpis?.payroll_cost)}</strong>
        </motion.article>
      </div>

      <div className="acc-grid-2">
        <article className="acc-panel">
          <header className="acc-panel-head">
            <h3>Moliyaviy trend</h3>
          </header>
          <div className="acc-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthly}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.16)" />
                <XAxis dataKey="month_key" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="income_total"
                  name="Tushum"
                  stroke="#60a5fa"
                  fill="url(#incomeGradient)"
                />
                <Area type="monotone" dataKey="expense_total" name="Xarajat" stroke="#f97316" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="acc-panel">
          <header className="acc-panel-head">
            <h3>Quick actions</h3>
          </header>
          <div className="acc-quick-actions">
            <button type="button" className="acc-quick-btn" onClick={() => navigate('/accounting/transactions')}>
              <PlusCircle size={16} />
              Yangi xarajat qo‘shish
            </button>
            <button type="button" className="acc-quick-btn" onClick={() => navigate('/accounting/payroll')}>
              <HandCoins size={16} />
              Oylik to‘lash
            </button>
            <button type="button" className="acc-quick-btn" onClick={() => navigate('/accounting/payroll')}>
              <HandCoins size={16} />
              Avans berish
            </button>
            <button type="button" className="acc-quick-btn" onClick={() => navigate('/accounting/reports')}>
              <FileDown size={16} />
              Hisobot chiqarish
            </button>
          </div>
          <div className="acc-status-list">
            {statuses.map((item) => (
              <div key={item.status} className="acc-status-item">
                <span className={`acc-status-dot ${statusClass(item.status)}`} />
                <span>{item.status_label_uz}</span>
                <strong>{item.count_total}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="acc-grid-2">
        <article className="acc-panel">
          <header className="acc-panel-head">
            <h3>Payroll analytics</h3>
          </header>
          <div className="acc-chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={payrollAnalytics}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.16)" />
                <XAxis dataKey="month_key" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Ish haqi xarajati" fill="#a78bfa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="acc-panel">
          <header className="acc-panel-head">
            <h3>Foyda o‘sish grafigi</h3>
          </header>
          <div className="acc-chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={profitGrowth}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.16)" />
                <XAxis dataKey="month_key" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="value" name="Sof foyda" stroke="#22c55e" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <article className="acc-panel">
        <header className="acc-panel-head">
          <h3>Faollik lentasi</h3>
        </header>
        <div className="acc-activity-list">
          {dashboardQuery.isLoading && <p className="acc-muted">Yuklanmoqda…</p>}
          {dashboardQuery.error && <p className="acc-error">{dashboardQuery.error.message}</p>}
          {!dashboardQuery.isLoading && activity.length === 0 && (
            <p className="acc-muted">Hozircha faollik yozuvlari mavjud emas.</p>
          )}
          {activity.map((item) => (
            <div key={item.id} className="acc-activity-item">
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              <div className="acc-activity-meta">
                <span>{formatMoney(item.amount)}</span>
                <time>{formatDateTime(item.occurred_at)}</time>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
