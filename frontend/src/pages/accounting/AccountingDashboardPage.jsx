import React from 'react';
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
  AlertTriangle,
  CircleDollarSign,
  FileSpreadsheet,
  HandCoins,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useAccountingDashboardQuery, useAccountingMutations, useAccountingApi } from '../../lib/accounting/api.js';
import { useAccountingStore } from '../../lib/accounting/store.js';
import { formatCompactMoney, formatDateTime, formatMoney } from '../../lib/accounting/format.js';
import {
  Button,
  EmptyState,
  SectionHeader,
  SkeletonCards,
  StatCard,
  StatusBadge,
  SurfaceCard,
} from '../../components/accounting/AccountingPrimitives.jsx';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-strong)] p-3 text-xs shadow-[var(--ac-shadow)]">
      <div className="mb-2 font-semibold text-[var(--ac-foreground)]">{label}</div>
      <div className="space-y-1 text-[var(--ac-muted)]">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <span>{item.name}</span>
            <strong className="text-[var(--ac-foreground)]">{formatMoney(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AccountingDashboardPage() {
  const dashboardQuery = useAccountingDashboardQuery();
  const { runAutomation } = useAccountingMutations();
  const { downloadFile } = useAccountingApi();
  const openTransactionDialog = useAccountingStore((state) => state.openTransactionDialog);
  const openPaymentDialog = useAccountingStore((state) => state.openPaymentDialog);

  const data = dashboardQuery.data;

  async function handleExport() {
    await downloadFile('/reports/export?format=xlsx', 'myshop-accounting-report.xlsx');
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Moliyaviy tahlil"
        title="Boshqaruv paneli"
        description="MyShop uchun real-time accounting, payroll va faoliyat oqimlarini bir joyda boshqaring."
        actions={[
          <Button key="expense" variant="secondary" onClick={() => openTransactionDialog({ direction: 'expense' })}>
            Yangi xarajat qo‘shish
          </Button>,
          <Button key="advance" variant="secondary" onClick={() => openPaymentDialog({ cycle_type: 'advance' })}>
            Avans berish
          </Button>,
          <Button key="salary" variant="primary" onClick={() => openPaymentDialog({ cycle_type: 'salary' })}>
            Oylik to‘lash
          </Button>,
        ]}
      />

      {dashboardQuery.isLoading ? (
        <SkeletonCards />
      ) : dashboardQuery.isError ? (
        <EmptyState
          title="Dashboard yuklanmadi"
          description={dashboardQuery.error?.message || 'Serverdan ma’lumot olib bo‘lmadi.'}
          action={
            <Button variant="primary" onClick={() => dashboardQuery.refetch()}>
              Qayta yuklash
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              title="Umumiy tushum"
              value={formatMoney(data?.kpis?.total_revenue)}
              delta="Buyurtmalar + qo‘lda kiritilgan tushumlar"
            />
            <StatCard
              icon={Wallet}
              title="Umumiy xarajatlar"
              value={formatMoney(data?.kpis?.total_expenses)}
              delta={`Payroll ulushi: ${data?.insights?.payroll_ratio || 0}%`}
              tone="warning"
            />
            <StatCard
              icon={TrendingUp}
              title="Sof foyda"
              value={formatMoney(data?.kpis?.net_profit)}
              delta="Joriy oy bo‘yicha hisob-kitob"
              tone="success"
            />
            <StatCard
              icon={HandCoins}
              title="Oyliklar uchun jami xarajat"
              value={formatMoney(data?.kpis?.payroll_total)}
              delta={`${data?.insights?.pending_payrolls || 0} ta kutilayotgan to‘lov`}
              tone="danger"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.65fr,1fr]">
            <SurfaceCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Moliyaviy trendlar</h2>
                  <p className="text-sm text-[var(--ac-muted)]">Tushum, xarajat va foyda dinamikasi</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => dashboardQuery.refetch()}>
                  Yangilash
                </Button>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.charts?.monthly_series || []}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--ac-subtle)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--ac-subtle)', fontSize: 12 }} width={64} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revenueFill)" name="Tushum" />
                    <Area type="monotone" dataKey="profit" stroke="#16a34a" fill="url(#profitFill)" name="Foyda" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Xarajatlar tarkibi</h2>
                <p className="text-sm text-[var(--ac-muted)]">Kategoriya bo‘yicha ulushlar</p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.charts?.expense_distribution || []}
                      dataKey="total"
                      nameKey="label"
                      innerRadius={72}
                      outerRadius={106}
                      paddingAngle={4}
                    >
                      {(data?.charts?.expense_distribution || []).map((entry) => (
                        <Cell key={entry.label} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {(data?.charts?.expense_distribution || []).slice(0, 5).map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-[var(--ac-foreground)]">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--ac-foreground)]">{formatMoney(item.total)}</span>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.9fr,0.9fr]">
            <SurfaceCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Payroll tahlili</h2>
                  <p className="text-sm text-[var(--ac-muted)]">Kutilayotgan va kechikkan sikllar</p>
                </div>
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { label: 'Faol xodimlar', value: data?.insights?.active_employees || 0, fill: '#2563eb' },
                      { label: 'Kutilmoqda', value: data?.insights?.pending_payrolls || 0, fill: '#f59e0b' },
                      { label: 'Kechikkan', value: data?.insights?.overdue_payrolls || 0, fill: '#ef4444' },
                    ]}
                  >
                    <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--ac-subtle)', fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--ac-subtle)', fontSize: 12 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[14, 14, 4, 4]}>
                      {[
                        '#2563eb',
                        '#f59e0b',
                        '#ef4444',
                      ].map((color, index) => (
                        <Cell key={color + index} fill={color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Tezkor amallar</h2>
                <p className="text-sm text-[var(--ac-muted)]">Bir bosishda asosiy ish jarayonlari</p>
              </div>
              <div className="grid gap-3">
                <Button variant="secondary" className="justify-start" onClick={() => openTransactionDialog({ direction: 'expense' })}>
                  <Wallet className="h-4 w-4" />
                  Yangi xarajat qo‘shish
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => openPaymentDialog({ cycle_type: 'salary' })}>
                  <CircleDollarSign className="h-4 w-4" />
                  Oylik to‘lash
                </Button>
                <Button variant="secondary" className="justify-start" onClick={() => openPaymentDialog({ cycle_type: 'advance' })}>
                  <HandCoins className="h-4 w-4" />
                  Avans berish
                </Button>
                <Button variant="secondary" className="justify-start" onClick={handleExport}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Hisobot chiqarish
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => runAutomation.mutate()}
                  disabled={runAutomation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${runAutomation.isPending ? 'animate-spin' : ''}`} />
                  Payroll avtomatini ishga tushirish
                </Button>
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Jonli ko‘rsatkichlar</h2>
                <p className="text-sm text-[var(--ac-muted)]">Tizim holati va ustuvor nuqtalar</p>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--ac-muted)]">Kechikkan sikllar</span>
                    <StatusBadge status={(data?.insights?.overdue_payrolls || 0) > 0 ? 'overdue' : 'paid'}>
                      {(data?.insights?.overdue_payrolls || 0) > 0 ? `${data?.insights?.overdue_payrolls} ta` : 'Yo‘q'}
                    </StatusBadge>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--ac-muted)]">Faol xodimlar</span>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ac-foreground)]">
                      <Users className="h-4 w-4 text-blue-500" />
                      {data?.insights?.active_employees || 0} ta
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--ac-muted)]">Oxirgi yangilanish</span>
                    <span className="text-xs font-medium text-[var(--ac-foreground)]">{formatDateTime(data?.live_snapshot_at)}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(249,115,22,0.1))] p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--ac-foreground)]">Nazorat nuqtasi</p>
                      <p className="mt-1 text-xs text-[var(--ac-muted)]">
                        Payroll kechikishlari bor bo‘lsa, avval sikllarni yopib, keyin hisobotni eksport qiling.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
            <SurfaceCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Faollik oqimi</h2>
                  <p className="text-sm text-[var(--ac-muted)]">Oxirgi tranzaksiyalar va oylik to‘lovlari</p>
                </div>
              </div>
              <div className="space-y-3">
                {(data?.recent_activity || []).length === 0 ? (
                  <p className="text-sm text-[var(--ac-muted)]">Hali faoliyat yozuvlari yo‘q.</p>
                ) : (
                  data.recent_activity.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-3 rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-medium text-[var(--ac-foreground)]">{item.title}</p>
                        <p className="text-xs text-[var(--ac-muted)]">
                          {item.description} • {formatDateTime(item.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.receipt_id ? <StatusBadge status="paid">Kvitansiya mavjud</StatusBadge> : null}
                        <span
                          className={`text-sm font-semibold ${
                            item.direction === 'income' ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {item.direction === 'income' ? '+' : '-'}
                          {formatCompactMoney(item.amount)}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Keyingi to‘lovlar</h2>
                <p className="text-sm text-[var(--ac-muted)]">Xodim kartalaridagi yaqin sikllar</p>
              </div>
              <div className="space-y-3">
                {(data?.employees || []).map((employee) => (
                  <div
                    key={employee.id}
                    className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--ac-foreground)]">{employee.full_name}</p>
                        <p className="text-xs text-[var(--ac-muted)]">{employee.role_title}</p>
                      </div>
                      <StatusBadge status={employee.status}>{employee.status_label}</StatusBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--ac-muted)]">
                      <div>
                        <span className="block text-[11px] uppercase tracking-wide">Keyingi sana</span>
                        <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{employee.next_payment_date || '-'}</strong>
                      </div>
                      <div>
                        <span className="block text-[11px] uppercase tracking-wide">Qolgan balans</span>
                        <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(employee.remaining_balance)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>
        </>
      )}
    </div>
  );
}
