import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button.jsx';
import { getReportsSummary } from './accountingApi.js';
import { EmptyState, PageHeader, SectionCard, StatusPill } from './AccountingSuiteParts.jsx';
import { downloadFile, formatCurrency, toDateInputValue } from './accountingUtils.js';
import { useAccountingStore } from './accountingStore.js';

const PIE_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f97316', '#ef4444', '#14b8a6'];

export default function AccountingReportsPage() {
  const { request } = useAuth();
  const reportRange = useAccountingStore((state) => state.reportRange);
  const setReportRange = useAccountingStore((state) => state.setReportRange);

  const reportsQuery = useQuery({
    queryKey: ['accounting', 'reports', reportRange],
    queryFn: () => getReportsSummary(request, reportRange),
  });

  const reports = reportsQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financial reports"
        title="Moliyaviy hisobotlar"
        description="Date range analytics, expense ratio, payroll ratio va kategoriyalar bo‘yicha breakdown."
        actions={
          <Button variant="secondary" onClick={() => downloadFile('/api/accounting/portal/reports/export.csv')}>
            <Download className="h-4 w-4" />
            Excel/PDF uchun eksport
          </Button>
        }
      />

      <SectionCard title="Davr tanlash" description="Hisobot uchun boshlanish va tugash sanasi">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Boshlanish sanasi
            <input
              type="date"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={reportRange.from}
              onChange={(event) => setReportRange({ from: event.target.value })}
              placeholder={toDateInputValue()}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Tugash sanasi
            <input
              type="date"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={reportRange.to}
              onChange={(event) => setReportRange({ to: event.target.value })}
              placeholder={toDateInputValue()}
            />
          </label>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SectionCard title="Umumiy tushum" description="Davr bo‘yicha">
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(reports?.summary?.total_revenue)}</div>
        </SectionCard>
        <SectionCard title="Umumiy xarajat" description="Davr bo‘yicha">
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(reports?.summary?.total_expenses)}</div>
        </SectionCard>
        <SectionCard title="Sof foyda" description="Davr bo‘yicha">
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(reports?.summary?.net_profit)}</div>
        </SectionCard>
        <SectionCard title="Payroll ratio" description="Xarajatlardagi ulush">
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{reports?.summary?.payroll_ratio || 0}%</div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Expense breakdown" description="Kategoriya bo‘yicha xarajatlar">
          {reports?.expense_breakdown?.length ? (
            <div className="h-80 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reports.expense_breakdown}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="category_name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis hide />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="total" fill="#f97316" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Expense breakdown yo‘q" description="Davr bo‘yicha xarajatlar topilmadi." />
          )}
        </SectionCard>

        <SectionCard title="Income breakdown" description="Kategoriya bo‘yicha tushumlar">
          {reports?.income_breakdown?.length ? (
            <div className="h-80 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reports.income_breakdown} dataKey="total" nameKey="category_name" innerRadius={70} outerRadius={110} paddingAngle={4}>
                    {reports.income_breakdown.map((entry, index) => (
                      <Cell key={entry.category_name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Income breakdown yo‘q" description="Davr bo‘yicha tushumlar topilmadi." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Payroll status summary" description="Sikllar bo‘yicha holatlar">
        {reports?.payroll_status?.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {reports.payroll_status.map((item) => (
              <div
                key={item.status}
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950 dark:text-white">{item.status_label}</p>
                  <StatusPill status={item.status} label={`${item.total} ta`} />
                </div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Qolgan summa</p>
                <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{formatCurrency(item.remaining_total)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Payroll status yo‘q" description="Tanlangan davr uchun payroll statuslar topilmadi." />
        )}
      </SectionCard>
    </div>
  );
}
