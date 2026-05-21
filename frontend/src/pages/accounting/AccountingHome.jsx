import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ArrowRightLeft, Coins, CreditCard, Landmark, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button.jsx';
import { EmptyState, MetricCard, PageHeader, SectionCard, StatusPill } from './AccountingSuiteParts.jsx';
import AccountingQuickActionsDialog from './AccountingQuickActionsDialog.jsx';
import {
  createPayrollPayment,
  createTransaction,
  getCategories,
  getOverview,
  getPayrollCycles,
} from './accountingApi.js';
import { downloadFile, formatCurrency, formatDate, formatDateTime, toMonthInputValue } from './accountingUtils.js';

export default function AccountingHome() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickMode, setQuickMode] = useState('expense');
  const [flash, setFlash] = useState('');

  const overviewQuery = useQuery({
    queryKey: ['accounting', 'overview'],
    queryFn: () => getOverview(request),
  });

  const categoriesQuery = useQuery({
    queryKey: ['accounting', 'categories'],
    queryFn: () => getCategories(request),
  });

  const cyclesQuery = useQuery({
    queryKey: ['accounting', 'quick-payroll', toMonthInputValue()],
    queryFn: () => getPayrollCycles(request, { month: toMonthInputValue() }),
  });

  const transactionMutation = useMutation({
    mutationFn: (payload) => createTransaction(request, payload),
    onSuccess: async () => {
      setFlash('Tranzaksiya muvaffaqiyatli saqlandi.');
      setQuickDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }),
      ]);
    },
  });

  const payrollMutation = useMutation({
    mutationFn: ({ cycleId, payload }) => createPayrollPayment(request, cycleId, payload),
    onSuccess: async (data) => {
      setFlash('Payroll to‘lovi saqlandi va receipt yaratildi.');
      setQuickDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'quick-payroll'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'payroll'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
      ]);
      if (data?.receiptId) {
        downloadFile(`/api/accounting/portal/receipts/${data.receiptId}/pdf`);
      }
    },
  });

  const openCycles = useMemo(
    () => (cyclesQuery.data?.cycles || []).filter((cycle) => Number(cycle.remaining_amount) > 0.009),
    [cyclesQuery.data?.cycles],
  );

  const overview = overviewQuery.data;
  const chartRows = overview?.charts?.monthly || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Moliyaviy tahlil"
        title="Boshqaruv paneli"
        description="MyShop uchun real-time tushum, xarajat, payroll va sof foyda ko‘rsatkichlarini premium boshqaruv markazida kuzating."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setQuickMode('expense');
                setQuickDialogOpen(true);
              }}
            >
              Yangi xarajat qo‘shish
            </Button>
            <Button
              onClick={() => {
                setQuickMode('payroll');
                setQuickDialogOpen(true);
              }}
            >
              Oylik to‘lash
            </Button>
            <Button
              variant="secondary"
              onClick={() => downloadFile('/api/accounting/portal/reports/export.csv')}
            >
              Hisobot chiqarish
            </Button>
          </>
        }
      />

      {flash ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {flash}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Landmark}
          label="Umumiy tushum"
          value={formatCurrency(overview?.kpis?.total_revenue)}
          hint="Mahsulot savdosi va qo‘shimcha tushumlar"
          accent="sky"
        />
        <MetricCard
          icon={ArrowRightLeft}
          label="Umumiy xarajatlar"
          value={formatCurrency(overview?.kpis?.total_expenses)}
          hint="Kunlik operatsion va payroll xarajatlari"
          accent="amber"
        />
        <MetricCard
          icon={Sparkles}
          label="Sof foyda"
          value={formatCurrency(overview?.kpis?.net_profit)}
          hint="Davr bo‘yicha sof moliyaviy natija"
          accent="emerald"
        />
        <MetricCard
          icon={CreditCard}
          label="Oyliklar uchun jami xarajat"
          value={formatCurrency(overview?.kpis?.payroll_expense)}
          hint="Payroll expense tracking"
          accent="violet"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <SectionCard
          title="Moliyaviy trendlar"
          description="Oylik revenue, expense va profit dinamikasi"
        >
          {chartRows.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="h-72 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#revenueFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="h-72 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="payroll" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <EmptyState title="Grafik uchun ma’lumot yo‘q" description="Ma’lumotlar kelgach trendlar shu yerda ko‘rinadi." />
          )}
        </SectionCard>

        <SectionCard
          title="Tezkor amallar"
          description="Kunlik accounting workflow uchun qisqa yo‘llar"
        >
          <div className="grid gap-3">
            {[
              { title: 'Yangi xarajat qo‘shish', subtitle: 'Do‘kon, utility yoki transport xarajatlari', mode: 'expense' },
              { title: 'Qo‘shimcha tushum kiritish', subtitle: 'Manual income yoki service income', mode: 'income' },
              { title: 'Avans berish', subtitle: '15 kunlik advance sikliga to‘lov', mode: 'payroll' },
              { title: 'Hisobot chiqarish', subtitle: 'CSV formatida eksport qilish', mode: 'report' },
            ].map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => {
                  if (action.mode === 'report') {
                    downloadFile('/api/accounting/portal/reports/export.csv');
                    return;
                  }
                  setQuickMode(action.mode);
                  setQuickDialogOpen(true);
                }}
                className="group flex items-center justify-between rounded-[24px] border border-white/55 bg-white/80 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-40px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-slate-950/55"
              >
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{action.title}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{action.subtitle}</p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 transition group-hover:bg-slate-950 group-hover:text-white dark:bg-white/10 dark:text-slate-200 dark:group-hover:bg-white dark:group-hover:text-slate-950">
                  <Coins className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Payroll holati"
          description="To‘lov muddati yaqin yoki kechikkan sikllar"
        >
          {overview?.due_cycles?.length ? (
            <div className="space-y-3">
              {overview.due_cycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="flex flex-col gap-3 rounded-[24px] border border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">{cycle.full_name}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {cycle.cycle_type_label} · Muddat: {formatDate(cycle.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(cycle.remaining_amount)}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Qolgan balans</div>
                    </div>
                    <StatusPill status={cycle.status} label={cycle.status_label} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Faol sikllar topilmadi" description="Hozircha barcha payroll sikllari yopilgan yoki ma’lumot kiritilmagan." />
          )}
        </SectionCard>

        <SectionCard
          title="Real-time statistikalar"
          description="Bugungi pul oqimi va aktiv xodimlar"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Bugungi tushum</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(overview?.real_time?.today_revenue)}</h3>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Bugungi xarajat</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(overview?.real_time?.today_expenses)}</h3>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Aktiv xodimlar</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{overview?.real_time?.active_employees || 0}</h3>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">To‘lov navbatlari</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{overview?.real_time?.due_payments || 0}</h3>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Faollik lentasi" description="Oxirgi tranzaksiyalar, payroll va expense yozuvlari">
          {overview?.activity_feed?.length ? (
            <div className="space-y-3">
              {overview.activity_feed.map((item) => (
                <div
                  key={`${item.id}-${item.transaction_date}`}
                  className="flex items-start justify-between gap-3 rounded-[22px] border border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950 dark:text-white">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {item.category_name || item.label} · {formatDateTime(item.transaction_date)}
                    </p>
                    {item.note ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.note}</p> : null}
                  </div>
                  <div className={`shrink-0 text-sm font-semibold ${item.direction === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {item.direction === 'income' ? '+' : '-'}
                    {formatCurrency(item.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Faollik topilmadi" description="Yangi tranzaksiya yoki payroll yozuvlari shu yerda chiqadi." />
          )}
        </SectionCard>

        <SectionCard title="Mas’ul xodimlar" description="Keyingi to‘lov sanasi va qolgan balans">
          {overview?.employees?.length ? (
            <div className="space-y-4">
              {overview.employees.map((employee) => (
                <div
                  key={employee.id}
                  className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">{employee.full_name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{employee.position_title}</p>
                    </div>
                    <StatusPill status={employee.status} label={employee.status_label} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Oylik</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(employee.monthly_salary)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Qolgan balans</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(employee.remaining_balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Oxirgi to‘lov</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                        {employee.last_payment ? formatDate(employee.last_payment.paid_at) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Keyingi to‘lov</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                        {employee.next_payment ? formatDate(employee.next_payment.due_date) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Xodimlar mavjud emas" description="Payroll bo‘limida xodimlar paydo bo‘ladi." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Profit growth va payroll analytics" description="Oylar kesimida xarajat va payroll ulushi">
        {chartRows.length ? (
          <div className="h-80 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="expenses" fill="#f97316" radius={[8, 8, 0, 0]} />
                <Bar dataKey="payroll" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="Analytics tayyor emas" description="Grafiklar uchun ma’lumotlar yig‘ilmoqda." />
        )}
      </SectionCard>

      <AccountingQuickActionsDialog
        open={quickDialogOpen}
        onOpenChange={setQuickDialogOpen}
        categories={categoriesQuery.data}
        cycles={openCycles}
        onCreateTransaction={(payload) => transactionMutation.mutate(payload)}
        onCreatePayment={(cycleId, payload) => payrollMutation.mutate({ cycleId, payload })}
        busy={transactionMutation.isPending || payrollMutation.isPending}
        initialMode={quickMode}
      />
    </div>
  );
}
