import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarRange, Download, FileOutput, Printer, ReceiptText, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  exportRowsToCsv,
  fetchAccountingJson,
  formatCompactUz,
  formatCurrencyUz,
} from './accountingUtils.js';

function ReportTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="accounting-chart-tooltip">
      <p className="text-sm font-semibold text-slate-950 dark:text-white">{label}</p>
      <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span>{entry.name}</span>
            <strong className="text-slate-900 dark:text-white">{formatCurrencyUz(entry.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AccountingReportsPage() {
  const { request } = useAuth();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    return { from: firstDay, to: today };
  });

  const reportsQuery = useQuery({
    queryKey: ['accounting-reports', period.from, period.to],
    queryFn: () =>
      fetchAccountingJson(
        request,
        `/accounting/portal/reports/summary?from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`,
      ),
  });

  const summary = reportsQuery.data?.summary;
  const payrollByEmployee = reportsQuery.data?.payroll_by_employee || [];
  const expenseByCategory = reportsQuery.data?.expense_by_category || [];
  const incomeByCategory = reportsQuery.data?.income_by_category || [];

  const csvRows = useMemo(
    () =>
      expenseByCategory.map((item) => ({
        type: 'xarajat',
        label: item.label,
        total: item.total,
      }))
      .concat(
        incomeByCategory.map((item) => ({
          type: 'tushum',
          label: item.label,
          total: item.total,
        })),
      ),
    [expenseByCategory, incomeByCategory],
  );

  return (
    <div className="space-y-5">
      <section className="accounting-glass-card p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Moliyaviy hisobotlar
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
              Date range kesimida premium analitika
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Xarajat toifalari, qo‘shimcha tushum va payroll bo‘yicha xodim kesimlarini ko‘rib, CSV yoki PDF ko‘rinishida
              eksport qiling.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  `myshop-hisobot-${period.from}-${period.to}.csv`,
                  [
                    { label: 'Turi', value: 'type' },
                    { label: 'Nomi', value: 'label' },
                    { label: 'Jami summa', value: (row) => row.total },
                  ],
                  csvRows,
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              <FileOutput className="h-4 w-4" />
              Excel uchun CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              <Printer className="h-4 w-4" />
              PDF uchun chop etish
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Boshlanish sanasi
            <input
              type="date"
              value={period.from}
              onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Tugash sanasi
            <input
              type="date"
              value={period.to}
              onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
            />
          </label>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center gap-3">
              <CalendarRange className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Tanlangan davr
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                  {period.from} — {period.to}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Mahsulot savdosi', value: formatCurrencyUz(summary?.product_revenue), icon: ReceiptText },
          { label: 'Qo‘shimcha tushum', value: formatCurrencyUz(summary?.extra_income), icon: Download },
          { label: 'Jami xarajatlar', value: formatCurrencyUz(summary?.total_expenses), icon: FileOutput },
          { label: 'Sof foyda', value: formatCurrencyUz(summary?.net_profit), icon: TrendingUp },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="accounting-glass-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
                  <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{item.value}</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr,1fr]">
        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Xarajatlar bo‘yicha kesim</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Kategoriya kesimidagi jami chiqimlar.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  `myshop-xarajatlar-${period.from}-${period.to}.csv`,
                  [
                    { label: 'Kategoriya', value: 'label' },
                    { label: 'Jami summa', value: (row) => row.total },
                  ],
                  expenseByCategory,
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>

          <div className="mt-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseByCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(value) => formatCompactUz(value)} tickLine={false} axisLine={false} />
                <Tooltip content={<ReportTooltip />} />
                <Bar dataKey="total" name="Jami xarajat" fill="#f97316" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Xodimlar payroll kesimi</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Tanlangan davrda kimga qancha ish haqi to‘langan.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  `myshop-payroll-${period.from}-${period.to}.csv`,
                  [
                    { label: 'Xodim', value: 'label' },
                    { label: 'Jami summa', value: (row) => row.total },
                  ],
                  payrollByEmployee,
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {payrollByEmployee.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Tanlangan davr uchun payroll yozuvlari topilmadi.
              </div>
            ) : (
              payrollByEmployee.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-white">{item.label}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Payroll expense breakdown</p>
                  </div>
                  <strong className="text-slate-950 dark:text-white">{formatCurrencyUz(item.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr,1fr]">
        <div className="accounting-glass-card p-5 md:p-6">
          <h2 className="accounting-section-title text-slate-950 dark:text-white">Tushum kategoriyalari</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Qo‘shimcha tushumlar va service income bo‘yicha breakdown.
          </p>
          <div className="mt-5 space-y-3">
            {incomeByCategory.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Tushum kategoriyalari topilmadi.
              </div>
            ) : (
              incomeByCategory.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-white">{item.label}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Income category</p>
                  </div>
                  <strong className="text-emerald-600 dark:text-emerald-300">{formatCurrencyUz(item.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="accounting-glass-card p-5 md:p-6">
          <h2 className="accounting-section-title text-slate-950 dark:text-white">Eksport va audit tayyorligi</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Excel uchun CSV, PDF chop etish va auditga tayyor summary.
          </p>
          <div className="mt-5 grid gap-3">
            {[
              { label: 'CSV eksport', value: 'Excel bilan mos', hint: 'UTF-8 BOM bilan eksport qilinadi' },
              { label: 'PDF chop etish', value: 'Brauzer print', hint: 'Rahbariyat uchun toza hisobot ko‘rinishi' },
              { label: 'Payroll kesimi', value: `${payrollByEmployee.length} xodim`, hint: 'To‘langan ish haqi yozuvlari' },
              { label: 'Moliyaviy balans', value: formatCurrencyUz(summary?.net_profit), hint: 'Sotuv va xarajatlar farqi' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[1.4rem] border border-slate-200 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70"
              >
                <p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-lg font-bold text-slate-950 dark:text-white">{item.value}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
