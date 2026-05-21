import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileBarChart, ShieldCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, formatDate, formatMoney } from './AccountingHome.jsx';

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountingReportsPage() {
  const { request } = useAuth();
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams(range);
      const res = await request(`/accounting/portal/reports?${qs.toString()}`);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Hisobot yuklanmadi.');
        return;
      }
      setReport(data);
    } catch (e) {
      setError(e?.message || 'Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const s = report?.summary || {};
    const rows = [
      ['Ko‘rsatkich', 'Qiymat'],
      ['Savdo tushumi', s.sales_income || 0],
      ['Qo‘lda kiritilgan tushum', s.manual_income || 0],
      ['Jami tushum', s.total_income || 0],
      ['Jami xarajat', s.total_expenses || 0],
      ['Ish haqi xarajati', s.payroll_cost || 0],
      ['Sof foyda', s.net_profit || 0],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `myshop-hisobot-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = report?.summary || {};
  const monthly = report?.charts?.monthly || [];

  return (
    <div className="accounting-modern-page">
      <section className="accounting-hero compact">
        <div>
          <span className="accounting-eyebrow">Financial reports</span>
          <h1>Moliyaviy hisobotlar</h1>
          <p>Sana oralig‘i bo‘yicha tushum, xarajat, payroll va audit loglarni eksport qiling.</p>
          {error && <div className="accounting-alert">{error}</div>}
        </div>
        <button type="button" className="accounting-btn primary" onClick={exportCsv}>
          <Download size={17} /> Excel/CSV eksport
        </button>
      </section>

      <div className="accounting-toolbar">
        <label>Dan<input type="date" value={range.from} onChange={(e) => setRange((v) => ({ ...v, from: e.target.value }))} /></label>
        <label>Gacha<input type="date" value={range.to} onChange={(e) => setRange((v) => ({ ...v, to: e.target.value }))} /></label>
        <button type="button" className="accounting-btn ghost" onClick={load}>
          <FileBarChart size={17} /> Hisobotni ko‘rish
        </button>
      </div>

      <section className="accounting-kpi-grid">
        {[
          ['Jami tushum', summary.total_income],
          ['Jami xarajat', summary.total_expenses],
          ['Sof foyda', summary.net_profit],
          ['Payroll xarajati', summary.payroll_cost],
        ].map(([label, value]) => (
          <div className="accounting-kpi-card tone-blue" key={label}>
            <div className="accounting-kpi-icon"><FileBarChart size={22} /></div>
            <div><p>{label}</p><strong>{formatMoney(value)}</strong><span>{range.from} — {range.to}</span></div>
          </div>
        ))}
      </section>

      <section className="accounting-panel accounting-chart-panel">
        <div className="accounting-panel-head">
          <div>
            <span>Yillik ko‘rinish</span>
            <h2>Daromad, xarajat va foyda</h2>
          </div>
        </div>
        <div className="accounting-chart">
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.22)" />
                <XAxis dataKey="short_month" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000000)}m`} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Tushum" fill="#2563eb" radius={[10, 10, 0, 0]} />
                <Bar dataKey="expenses" name="Xarajat" fill="#ef4444" radius={[10, 10, 0, 0]} />
                <Bar dataKey="profit" name="Sof foyda" fill="#10b981" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Grafik bo‘sh" text="Moliyaviy operatsiyalar kiritilgach hisobot ko‘rinadi." />
          )}
        </div>
      </section>

      <section className="accounting-panel">
        <div className="accounting-panel-head">
          <div>
            <span>Audit log</span>
            <h2>Oxirgi tizim harakatlari</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="accounting-activity-list">
          {loading ? (
            <div>Yuklanmoqda...</div>
          ) : (report?.audit_logs || []).length ? (
            report.audit_logs.map((log) => (
              <article key={log.id} className="accounting-activity-item">
                <span className="accounting-activity-dot audit" />
                <div>
                  <strong>{log.summary || log.action}</strong>
                  <span>{log.entity_type} · {formatDate(log.created_at)}</span>
                </div>
                <b>#{log.id}</b>
              </article>
            ))
          ) : (
            <EmptyState title="Audit yozuvi yo‘q" text="Saqlangan o‘zgarishlar shu yerda ko‘rinadi." />
          )}
        </div>
      </section>
    </div>
  );
}
