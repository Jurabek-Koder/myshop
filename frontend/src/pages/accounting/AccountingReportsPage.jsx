import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createAccountingApi } from './v2/accountingApi.js';
import { useAccountingStore } from './v2/accountingStore.js';
import { formatCompactMoney, formatMoney } from './v2/accountingUtils.js';

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="acc-chart-tooltip">
      <p className="acc-chart-tooltip-title">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatCompactMoney(item.value)} so‘m
        </p>
      ))}
    </div>
  );
}

export default function AccountingReportsPage() {
  const { request } = useAuth();
  const api = useMemo(() => createAccountingApi(request), [request]);
  const reportsRange = useAccountingStore((s) => s.reportsRange);
  const setReportsRange = useAccountingStore((s) => s.setReportsRange);

  const reportQuery = useQuery({
    queryKey: ['accounting-reports-summary', reportsRange],
    queryFn: () => api.getReportsSummary(reportsRange),
  });

  const totals = reportQuery.data?.totals;
  const categoryBreakdown = reportQuery.data?.category_breakdown || [];
  const monthlyBalance = reportQuery.data?.monthly_balance || [];
  const csvUrl = api.exportTransactionsCsv(reportsRange);

  return (
    <section className="acc-page">
      <div className="acc-page-heading">
        <div>
          <h1>Moliyaviy hisobotlar</h1>
          <p>Sana oralig‘i bo‘yicha daromad, xarajat, payroll va sof foyda tahlili.</p>
        </div>
        <div className="acc-actions-inline">
          <a href={csvUrl} className="acc-btn acc-btn-secondary">
            <Download size={16} />
            CSV yuklab olish
          </a>
          <button type="button" className="acc-btn acc-btn-primary" onClick={() => window.print()}>
            PDF chiqarish
          </button>
        </div>
      </div>

      <div className="acc-filters">
        <input type="date" value={reportsRange.from} onChange={(e) => setReportsRange({ from: e.target.value })} />
        <input type="date" value={reportsRange.to} onChange={(e) => setReportsRange({ to: e.target.value })} />
      </div>

      <div className="acc-grid-kpi">
        <article className="acc-kpi-card">
          <span>Umumiy tushum</span>
          <strong>{formatMoney(totals?.total_income)}</strong>
        </article>
        <article className="acc-kpi-card">
          <span>Umumiy xarajat</span>
          <strong>{formatMoney(totals?.total_expense)}</strong>
        </article>
        <article className="acc-kpi-card">
          <span>Sof foyda</span>
          <strong>{formatMoney(totals?.net_profit)}</strong>
        </article>
        <article className="acc-kpi-card">
          <span>Xarajat ulushi</span>
          <strong>{Number(totals?.expense_ratio || 0).toFixed(1)}%</strong>
        </article>
      </div>

      <div className="acc-grid-2">
        <article className="acc-panel">
          <header className="acc-panel-head">
            <h3>Oylik balans dinamikasi</h3>
          </header>
          <div className="acc-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyBalance}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.16)" />
                <XAxis dataKey="month_key" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip content={<TooltipContent />} />
                <Bar dataKey="income_total" name="Tushum" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense_total" name="Xarajat" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="acc-panel">
          <header className="acc-panel-head">
            <h3>Kategoriya kesimida</h3>
          </header>
          <ul className="acc-breakdown-list">
            {categoryBreakdown.map((item, idx) => (
              <li key={`${item.transaction_type}-${item.source_type}-${idx}`}>
                <span>{item.category_name}</span>
                <strong>{formatMoney(item.total)}</strong>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {reportQuery.error && <p className="acc-error">{reportQuery.error.message}</p>}
    </section>
  );
}

