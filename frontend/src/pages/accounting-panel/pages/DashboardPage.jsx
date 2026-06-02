import React, { useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { useTheme } from '../../../context/ThemeContext.jsx';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs } from '../utils/formatUzs.js';

const PIE_COLORS = { paid: '#34d399', pending: '#38bdf8', overdue: '#f87171' };

export default function DashboardPage() {
  const { dashboard, loading, error, setError, refreshDashboard } = useAccountingApp();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const chartTheme = useMemo(
    () => ({
      grid: isDark ? '#1e293b' : '#e2e8f0',
      tick: isDark ? '#94a3b8' : '#64748b',
      tooltipBg: isDark ? '#0f172a' : '#ffffff',
      tooltipBorder: isDark ? '#334155' : '#e2e8f0',
      tooltipColor: isDark ? '#f1f5f9' : '#0f172a',
      legend: isDark ? '#94a3b8' : '#64748b',
    }),
    [isDark],
  );

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const trend = (dashboard?.revenue_trend || []).map((r) => ({
    month: r.ym,
    tushum: Math.round(Number(r.revenue) / 1_000_000),
  }));

  const expenseTrend = (dashboard?.expense_trend || []).map((r) => ({
    month: r.ym,
    xarajat: Math.round(Number(r.total) / 1_000_000),
  }));

  const pieData = (dashboard?.payroll_status_pie || [])
    .filter((p) => p.value > 0)
    .map((p) => ({
      name: uz.kpi[p.name] || p.name,
      value: p.value,
      amount: p.amount,
    }));

  return (
    <div className="ap-page">
      <PageHeader title={uz.nav.dashboard} subtitle="Umumiy moliyaviy ko‘rsatkichlar va ish haqi holati." />

      <ApAlert error={error} onDismiss={() => setError('')} />
      <ApSpinner show={loading && !dashboard} />

      {dashboard ? (
        <>
          <div className="ap-kpi-grid" key={theme}>
            <KpiCard title={uz.kpi.totalRevenue} value={formatUzs(dashboard.total_revenue)} hint="Savdo + qo‘shilgan daromad" />
            <KpiCard title={uz.kpi.totalExpenses} value={formatUzs(dashboard.month_expenses)} hint="Joriy oy" accent="rose" />
            <KpiCard title={uz.kpi.netProfit} value={formatUzs(dashboard.net_profit_approx)} hint="Taxminiy sof foyda" accent="emerald" />
            <KpiCard title={uz.kpi.totalPayroll} value={formatUzs(dashboard.month_payroll_total)} hint={`${uz.kpi.paid}: ${formatUzs(dashboard.month_payroll_paid)}`} accent="violet" />
          </div>

          <div className="ap-charts-grid">
            <section className="ap-panel">
              <h3>{uz.analytics.revenueTrend} (mln)</h3>
              <div className="ap-chart-box">
                {trend.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.tick, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: 12,
                          color: chartTheme.tooltipColor,
                        }}
                      />
                      <Area type="monotone" dataKey="tushum" stroke="#38bdf8" fill="url(#revGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ap-muted">{uz.noData}</p>
                )}
              </div>
            </section>

            <section className="ap-panel">
              <h3>{uz.analytics.payrollDistribution}</h3>
              <div className="ap-chart-box">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={Object.values(PIE_COLORS)[i % 3]} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.legend }} />
                      <Tooltip
                        contentStyle={{
                          background: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: 12,
                          color: chartTheme.tooltipColor,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ap-muted">Ish haqi tsikllarini «Ish haqi boshqaruvi» bo‘limida yarating.</p>
                )}
              </div>
            </section>
          </div>

          <section className="ap-panel">
            <h3>{uz.analytics.expenseTrend} (mln)</h3>
            <div className="ap-chart-box ap-chart-box--short">
              {expenseTrend.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={expenseTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis dataKey="month" tick={{ fill: chartTheme.tick, fontSize: 11 }} />
                    <YAxis tick={{ fill: chartTheme.tick, fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: chartTheme.tooltipBg,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        borderRadius: 12,
                        color: chartTheme.tooltipColor,
                      }}
                    />
                    <Area type="monotone" dataKey="xarajat" stroke="#f472b6" fill="rgba(244,114,182,0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="ap-muted">{uz.noData}</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
