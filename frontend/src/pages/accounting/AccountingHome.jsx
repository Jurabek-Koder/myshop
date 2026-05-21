import React from 'react';
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
import { Activity, Download, Landmark, Wallet } from 'lucide-react';
import { useAccountingOverview, useAccountingExport } from '../../lib/accountingApi.js';
import { downloadBlob, formatDateTime, formatMoney } from './accountingFormatters.js';
import { useAccountingUiStore } from '../../stores/accountingUiStore.js';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'];

function chartTooltipFormatter(value) {
  return formatMoney(value);
}

function QuickActionButton({ icon: Icon, title, onClick }) {
  return (
    <button type="button" className="accounting-quick-action" onClick={onClick}>
      <span className="accounting-quick-action__icon">
        <Icon size={18} />
      </span>
      <span>{title}</span>
    </button>
  );
}

export default function AccountingHome() {
  const { dashboardRangeDays, setDashboardRangeDays, openTransactionModal, openPaymentModal } = useAccountingUiStore();
  const overviewQuery = useAccountingOverview(dashboardRangeDays);
  const exportMutation = useAccountingExport();
  const data = overviewQuery.data;

  async function handleExport() {
    const blob = await exportMutation.mutateAsync({ type: 'transactions', rangeDays: dashboardRangeDays });
    downloadBlob(blob, `myshop-moliya-${dashboardRangeDays}-kun.csv`);
  }

  return (
    <div className="accounting-page-grid">
      <section className="accounting-hero-card">
        <div>
          <div className="accounting-kicker">Moliyaviy boshqaruv</div>
          <h2>Premium SaaS bugalteriya paneli</h2>
          <p>
            Daromad, xarajat, payroll va hisobotlar bitta ish maydonida. MyShop uchun avans va oylik sikllari
            avtomatik nazorat qilinadi.
          </p>
        </div>
        <div className="accounting-hero-card__actions">
          <label className="accounting-range-picker">
            <span>Davr</span>
            <select value={dashboardRangeDays} onChange={(event) => setDashboardRangeDays(Number(event.target.value))}>
              <option value={30}>30 kun</option>
              <option value={90}>90 kun</option>
              <option value={180}>180 kun</option>
              <option value={365}>365 kun</option>
            </select>
          </label>
          <button type="button" className="accounting-secondary-button" onClick={handleExport} disabled={exportMutation.isPending}>
            <Download size={16} />
            {exportMutation.isPending ? 'Yuklanmoqda...' : 'CSV eksport'}
          </button>
        </div>
      </section>

      <section className="accounting-kpi-grid">
        {(data?.kpis || []).map((item) => (
          <article key={item.key} className={`accounting-kpi-card tone-${item.accent}`}>
            <small>{item.title}</small>
            <strong>{formatMoney(item.value)}</strong>
            <span>Yangilangan: {formatDateTime(data?.updated_at)}</span>
          </article>
        ))}
      </section>

      <section className="accounting-card">
        <div className="accounting-section-head">
          <div>
            <h3>Tezkor amallar</h3>
            <p>Kunlik accounting workflow uchun qisqa yo'llar</p>
          </div>
        </div>
        <div className="accounting-quick-actions">
          <QuickActionButton icon={Landmark} title="Yangi xarajat qo'shish" onClick={() => openTransactionModal({ direction: 'expense' })} />
          <QuickActionButton icon={Wallet} title="Oylik to'lash" onClick={() => openPaymentModal({ phase: 'salary' })} />
          <QuickActionButton icon={Wallet} title="Avans berish" onClick={() => openPaymentModal({ phase: 'advance' })} />
          <QuickActionButton icon={Download} title="Hisobot chiqarish" onClick={handleExport} />
        </div>
      </section>

      <section className="accounting-card accounting-card--wide">
        <div className="accounting-section-head">
          <div>
            <h3>Moliyaviy trendlar</h3>
            <p>Oylik daromad, xarajat va sof foyda dinamikasi</p>
          </div>
        </div>
        <div className="accounting-chart-wrap">
          {overviewQuery.isLoading ? (
            <div className="accounting-empty-inline">Yuklanmoqda...</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data?.charts?.monthly || []}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" tickFormatter={(value) => `${Math.round(value / 1000000)} mln`} />
                <Tooltip formatter={chartTooltipFormatter} />
                <Area type="monotone" dataKey="revenue" name="Tushum" stroke="#22c55e" fill="rgba(34,197,94,0.14)" />
                <Area type="monotone" dataKey="expense" name="Xarajat" stroke="#ef4444" fill="rgba(239,68,68,0.12)" />
                <Area type="monotone" dataKey="profit" name="Sof foyda" stroke="#3b82f6" fill="url(#profitGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="accounting-card">
        <div className="accounting-section-head">
          <div>
            <h3>Xarajat nisbatlari</h3>
            <p>Kategoriya bo'yicha expense ratio</p>
          </div>
        </div>
        <div className="accounting-chart-wrap accounting-chart-wrap--compact">
          {data?.charts?.expense_ratios?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.charts.expense_ratios} dataKey="amount" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={2}>
                  {data.charts.expense_ratios.map((item, index) => (
                    <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={chartTooltipFormatter} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="accounting-empty-inline">Hozircha xarajat yozuvlari mavjud emas.</div>
          )}
        </div>
        <div className="accounting-legend-list">
          {(data?.charts?.expense_ratios || []).map((item, index) => (
            <div key={item.name} className="accounting-legend-item">
              <span className="accounting-legend-swatch" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
              <div>
                <strong>{item.name}</strong>
                <small>{item.ratio}%</small>
              </div>
              <span>{formatMoney(item.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="accounting-card">
        <div className="accounting-section-head">
          <div>
            <h3>Payroll analitikasi</h3>
            <p>Current cycle holati va remaining balance</p>
          </div>
        </div>
        <div className="accounting-mini-stats">
          <div>
            <small>Kutilayotgan</small>
            <strong>{data?.payroll_overview?.pending_count || 0}</strong>
          </div>
          <div>
            <small>Kechikkan</small>
            <strong>{data?.payroll_overview?.overdue_count || 0}</strong>
          </div>
          <div>
            <small>To'langan</small>
            <strong>{data?.payroll_overview?.paid_count || 0}</strong>
          </div>
          <div>
            <small>Jami balans</small>
            <strong>{formatMoney(data?.payroll_overview?.total_remaining_balance || 0)}</strong>
          </div>
        </div>
        <div className="accounting-chart-wrap accounting-chart-wrap--compact">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[
                { key: 'Kutilmoqda', value: data?.payroll_overview?.pending_count || 0 },
                { key: 'Kechikkan', value: data?.payroll_overview?.overdue_count || 0 },
                { key: "To'landi", value: data?.payroll_overview?.paid_count || 0 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis dataKey="key" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Bar dataKey="value" fill="#8b5cf6" radius={[12, 12, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="accounting-card accounting-card--wide">
        <div className="accounting-section-head">
          <div>
            <h3>Faollik oqimi</h3>
            <p>Oxirgi tranzaksiyalar, payroll yozuvlari va audit loglar</p>
          </div>
          <Activity size={18} />
        </div>
        <div className="accounting-feed-list">
          {(data?.activity || []).length ? (
            data.activity.map((item) => (
              <article key={item.id} className="accounting-feed-item">
                <div className="accounting-feed-item__icon">
                  <Activity size={16} />
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <small>{formatDateTime(item.created_at)}</small>
                </div>
                {item.amount != null ? <span>{formatMoney(item.amount)}</span> : null}
              </article>
            ))
          ) : (
            <div className="accounting-empty-inline">Faollik yozuvlari hali shakllanmagan.</div>
          )}
        </div>
      </section>
    </div>
  );
}
