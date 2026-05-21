import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  BanknoteArrowDown,
  CalendarClock,
  Download,
  Landmark,
  MoveUpRight,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAccountingJson,
  formatCompactUz,
  formatCurrencyUz,
  formatDateUz,
  getPayrollStatusLabel,
} from './accountingUtils.js';
import './AccountingDashboard.css';

const RANGE_OPTIONS = [
  { value: 7, label: '7 kun' },
  { value: 30, label: '30 kun' },
  { value: 90, label: '90 kun' },
];

const PIE_COLORS = ['#2563eb', '#8b5cf6', '#22c55e', '#f97316', '#ec4899', '#64748b', '#06b6d4'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="accounting-chart-tooltip">
      <p className="text-sm font-semibold text-slate-950 dark:text-white">{formatDateUz(label)}</p>
      <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}</span>
            </span>
            <strong className="text-slate-900 dark:text-white">{formatCurrencyUz(entry.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="accounting-glass-card animate-pulse p-5">
            <div className="h-4 w-28 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 h-8 w-40 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr,1fr]">
        <div className="accounting-glass-card h-[360px] animate-pulse bg-slate-100/70 dark:bg-slate-900/70" />
        <div className="accounting-glass-card h-[360px] animate-pulse bg-slate-100/70 dark:bg-slate-900/70" />
      </div>
    </div>
  );
}

export default function AccountingHome() {
  const [rangeDays, setRangeDays] = useState(30);
  const { request } = useAuth();
  const navigate = useNavigate();

  const dashboardQuery = useQuery({
    queryKey: ['accounting-dashboard', rangeDays],
    queryFn: () => fetchAccountingJson(request, `/accounting/portal/dashboard?days=${rangeDays}`),
  });

  const payrollOverviewQuery = useQuery({
    queryKey: ['accounting-payroll-overview-card'],
    queryFn: () => fetchAccountingJson(request, '/accounting/portal/payroll/overview'),
    staleTime: 20_000,
  });

  const kpis = dashboardQuery.data?.kpis;
  const stats = dashboardQuery.data?.stats;
  const trendSeries = Array.isArray(dashboardQuery.data?.charts?.trend) ? dashboardQuery.data.charts.trend : [];
  const expenseCategories = Array.isArray(dashboardQuery.data?.charts?.expense_categories)
    ? dashboardQuery.data.charts.expense_categories
    : [];
  const activity = Array.isArray(dashboardQuery.data?.activity) ? dashboardQuery.data.activity : [];
  const payrollEmployees = Array.isArray(payrollOverviewQuery.data?.employees) ? payrollOverviewQuery.data.employees : [];

  const topEmployees = useMemo(() => payrollEmployees.slice(0, 4), [payrollEmployees]);

  const quickActions = [
    {
      label: 'Yangi xarajat qo‘shish',
      description: 'Kommunal, transport yoki boshqa xarajatlarni kiritish',
      icon: BanknoteArrowDown,
      action: () => navigate('/accounting/transactions'),
    },
    {
      label: 'Oylik to‘lash',
      description: 'Oy yakuni to‘lovlarini payroll moduli orqali bajarish',
      icon: WalletCards,
      action: () => navigate('/accounting/payroll'),
    },
    {
      label: 'Avans berish',
      description: '15 kunlik sikl uchun xodimga avans yozuvi ochish',
      icon: CalendarClock,
      action: () => navigate('/accounting/payroll'),
    },
    {
      label: 'Hisobot chiqarish',
      description: 'CSV yoki PDF ko‘rinishida moliyaviy kesimni tayyorlash',
      icon: Download,
      action: () => navigate('/accounting/reports'),
    },
  ];

  const summaryCards = [
    {
      label: 'Umumiy tushum',
      value: formatCurrencyUz(kpis?.total_revenue),
      tone: 'from-blue-600 to-cyan-500',
      meta: `${formatCompactUz(kpis?.total_revenue)} / ${rangeDays} kun`,
      icon: Landmark,
    },
    {
      label: 'Umumiy xarajatlar',
      value: formatCurrencyUz(kpis?.total_expenses),
      tone: 'from-rose-500 to-orange-400',
      meta: 'Kirim-chiqim jurnalidan',
      icon: BanknoteArrowDown,
    },
    {
      label: 'Sof foyda',
      value: formatCurrencyUz(kpis?.net_profit),
      tone: 'from-emerald-500 to-teal-400',
      meta: 'Savdo + qo‘shimcha tushum - xarajatlar',
      icon: MoveUpRight,
    },
    {
      label: 'Oyliklar uchun jami xarajat',
      value: formatCurrencyUz(kpis?.payroll_expense),
      tone: 'from-violet-500 to-indigo-500',
      meta: `${stats?.overdue_cycles || 0} ta kechikkan sikl`,
      icon: ShieldCheck,
    },
  ];

  if (dashboardQuery.isLoading && !dashboardQuery.data) {
    return <DashboardSkeleton />;
  }

  if (dashboardQuery.isError) {
    return (
      <div className="accounting-glass-card p-6">
        <h2 className="text-xl font-bold text-slate-950 dark:text-white">Boshqaruv paneli yuklanmadi</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {dashboardQuery.error?.message || 'Serverdan ma’lumot olib bo‘lmadi.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="accounting-glass-card overflow-hidden px-5 py-6 md:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              Moliyaviy tahlil markazi
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-4xl">
              MyShop uchun premium buxgalteriya boshqaruvi
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 md:text-base">
              Tushum, xarajat, payroll, kechikkan ish haqi va operatsion oqimlarni bitta zamonaviy SaaS panelida
              kuzating. Barcha foydalanuvchi matnlari o‘zbekcha, arxitektura esa enterprise darajada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/70">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRangeDays(option.value)}
                  className={[
                    'rounded-2xl px-4 py-2 text-sm font-semibold transition',
                    rangeDays === option.value
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate('/accounting/reports')}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-white dark:text-slate-950"
            >
              <ReceiptText className="h-4 w-4" />
              Moliyaviy hisobot
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.article
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="accounting-glass-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
                  <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                    {item.value}
                  </h3>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${item.tone} text-white`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">{item.meta}</p>
            </motion.article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.5fr,1fr]">
        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Tushum va foyda dinamikasi</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Savdo tushumi, qo‘shimcha daromad va sof foyda trendi.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
              {dashboardQuery.data?.range_days || rangeDays} kunlik kesim
            </div>
          </div>

          <div className="mt-5 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendSeries}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => formatCompactUz(value)} tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Tushum" stroke="#2563eb" fill="url(#revenueGradient)" strokeWidth={2.3} />
                <Area type="monotone" dataKey="profit" name="Sof foyda" stroke="#10b981" fill="url(#profitGradient)" strokeWidth={2.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Xarajatlar tarkibi</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Xarajat toifalari bo‘yicha taqsimot.
              </p>
            </div>
            <Activity className="mt-1 h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,220px]">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    dataKey="total"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={96}
                    paddingAngle={3}
                  >
                    {expenseCategories.map((entry, index) => (
                      <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {expenseCategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Hozircha xarajat kategoriyalari bo‘yicha yozuv yetarli emas.
                </div>
              ) : (
                expenseCategories.map((entry, index) => (
                  <div
                    key={entry.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      {entry.label}
                    </span>
                    <strong className="text-slate-950 dark:text-white">{formatCompactUz(entry.total)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr,0.95fr]">
        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Tezkor amallar</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Kunlik accounting operatsiyalarini tez ishga tushiring.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="group rounded-[1.4rem] border border-slate-200 bg-white/70 p-4 text-left transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/10 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-blue-600 dark:bg-white dark:text-slate-950">
                      <Icon className="h-5 w-5" />
                    </div>
                    <MoveUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-500" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-950 dark:text-white">{item.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Payroll snapshot</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Xodimlar bo‘yicha keyingi to‘lov holati.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/accounting/payroll')}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300"
            >
              Batafsil
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {topEmployees.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Xodimlar payroll ma’lumotlari hali tayyor emas.
              </div>
            ) : (
              topEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-950 dark:text-white">{employee.full_name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {employee.job_title || employee.department || 'Xodim'}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-950 px-3 py-1 text-xs font-semibold text-white dark:border-slate-700 dark:bg-white dark:text-slate-950">
                      {getPayrollStatusLabel(employee.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Oylik</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                        {formatCurrencyUz(employee.monthly_salary)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Keyingi sana</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                        {employee.next_payment?.due_date ? formatDateUz(employee.next_payment.due_date) : 'To‘lov yopilgan'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.3fr,1fr]">
        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Oxirgi faoliyatlar</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                So‘nggi tranzaksiyalar, ish haqi to‘lovlari va tizimdagi harakatlar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/accounting/activity')}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300"
            >
              Jurnalni ochish
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Hozircha oxirgi faoliyatlar topilmadi.
              </div>
            ) : (
              activity.slice(0, 8).map((item) => (
                <div
                  key={`${item.entry_type}-${item.id}`}
                  className="flex flex-col gap-3 rounded-[1.4rem] border border-slate-200 bg-white/70 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {item.entry_type === 'salary_payment' ? 'Ish haqi' : 'Tranzaksiya'} · {item.source_type}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">{formatCurrencyUz(item.amount)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateUz(item.created_at)}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                      {item.direction === 'income' ? 'Kirim' : 'Chiqim'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Real-time statistika</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Joriy payroll va hisobot holati.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {[
              { label: 'Faol xodimlar', value: stats?.employee_count || 0, icon: ShieldCheck },
              { label: 'Kechikkan sikllar', value: stats?.overdue_cycles || 0, icon: CalendarClock },
              { label: 'Kutilayotgan sikllar', value: stats?.pending_cycles || 0, icon: WalletCards },
              { label: 'Yaqin 5 kun ichida', value: stats?.due_soon_cycles || 0, icon: Landmark },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="flex items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{stat.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Accounting automation</p>
                    </div>
                  </div>
                  <strong className="text-2xl font-black text-slate-950 dark:text-white">{stat.value}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
