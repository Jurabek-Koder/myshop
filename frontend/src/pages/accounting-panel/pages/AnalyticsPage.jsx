import React, { useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';

export default function AnalyticsPage() {
  const { dashboard, loading, error, setError, refreshDashboard } = useAccountingApp();

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const merged = useMemo(() => {
    const rev = dashboard?.revenue_trend || [];
    const exp = dashboard?.expense_trend || [];
    const map = new Map();
    for (const r of rev) {
      map.set(r.ym, { month: r.ym, tushum: Number(r.revenue) || 0, xarajat: 0 });
    }
    for (const e of exp) {
      const cur = map.get(e.ym) || { month: e.ym, tushum: 0, xarajat: 0 };
      cur.xarajat = Number(e.total) || 0;
      map.set(e.ym, cur);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [dashboard]);

  const chartData = merged.map((r) => ({
    month: r.month,
    tushum: Math.round(r.tushum / 1_000_000),
    xarajat: Math.round(r.xarajat / 1_000_000),
    foyda: Math.round((r.tushum - r.xarajat) / 1_000_000),
  }));

  return (
    <div className="ap-page">
      <PageHeader title={uz.analytics.title} subtitle="Oylik tushum, xarajat va foyda taqqoslash." />
      <ApAlert error={error} onDismiss={() => setError('')} />
      <ApSpinner show={loading && !dashboard} />

      <section className="ap-panel">
        <h3>Moliyaviy taqqoslash (mln so‘m)</h3>
        <div className="ap-chart-box ap-chart-box--tall">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tushum" fill="#38bdf8" radius={[6, 6, 0, 0]} name="Tushum" />
                <Bar dataKey="xarajat" fill="#f472b6" radius={[6, 6, 0, 0]} name="Xarajat" />
                <Bar dataKey="foyda" fill="#34d399" radius={[6, 6, 0, 0]} name="Foyda (taxminiy)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="ap-muted">{uz.noData}</p>
          )}
        </div>
      </section>
    </div>
  );
}
