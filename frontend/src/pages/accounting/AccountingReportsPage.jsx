import React from 'react';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { useAccountingApi, useAccountingMutations, useAccountingReportsQuery } from '../../lib/accounting/api.js';
import { useAccountingStore } from '../../lib/accounting/store.js';
import { formatMoney } from '../../lib/accounting/format.js';
import {
  Button,
  EmptyState,
  SectionHeader,
  StatCard,
  SurfaceCard,
} from '../../components/accounting/AccountingPrimitives.jsx';

const inputClass =
  'w-full rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-2.5 text-sm text-[var(--ac-foreground)] outline-none transition focus:border-blue-400/40';

export default function AccountingReportsPage() {
  const reportRange = useAccountingStore((state) => state.reportRange);
  const setReportRange = useAccountingStore((state) => state.setReportRange);
  const reportQuery = useAccountingReportsQuery(reportRange);
  const { runAutomation } = useAccountingMutations();
  const { downloadFile } = useAccountingApi();

  async function handleExport(format) {
    const params = new URLSearchParams({ ...reportRange, format });
    await downloadFile(`/reports/export?${params.toString()}`, `myshop-accounting-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  }

  const report = reportQuery.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Hisobotlar"
        title="Moliyaviy hisobotlar"
        description="Tanlangan davr bo‘yicha sof foyda, payroll xarajatlari va kategoriya kesimlarini eksport qiling."
        actions={[
          <Button key="excel" variant="secondary" onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>,
          <Button key="pdf" variant="secondary" onClick={() => handleExport('pdf')}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>,
          <Button key="refresh" variant="primary" onClick={() => runAutomation.mutate()} disabled={runAutomation.isPending}>
            <RefreshCw className={`h-4 w-4 ${runAutomation.isPending ? 'animate-spin' : ''}`} />
            Avtomatni yangilash
          </Button>,
        ]}
      />

      <SurfaceCard className="grid gap-3 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm text-[var(--ac-muted)]">Boshlanish sanasi</span>
          <input className={inputClass} type="date" value={reportRange.from} onChange={(event) => setReportRange({ from: event.target.value })} />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-[var(--ac-muted)]">Tugash sanasi</span>
          <input className={inputClass} type="date" value={reportRange.to} onChange={(event) => setReportRange({ to: event.target.value })} />
        </label>
        <div className="flex items-end">
          <Button variant="secondary" onClick={() => reportQuery.refetch()}>
            <Download className="h-4 w-4" />
            Hisobotni yangilash
          </Button>
        </div>
      </SurfaceCard>

      {reportQuery.isError ? (
        <EmptyState
          title="Hisobot yuklanmadi"
          description={reportQuery.error?.message || 'Serverdan ma’lumot olishda xatolik yuz berdi.'}
          action={<Button variant="primary" onClick={() => reportQuery.refetch()}>Qayta urinish</Button>}
        />
      ) : reportQuery.isLoading ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Umumiy tushum" value={formatMoney(report?.summary?.total_revenue)} />
            <StatCard title="Umumiy xarajatlar" value={formatMoney(report?.summary?.total_expenses)} tone="warning" />
            <StatCard title="Sof foyda" value={formatMoney(report?.summary?.net_profit)} tone="success" />
            <StatCard title="Ish haqi xarajatlari" value={formatMoney(report?.summary?.payroll_costs)} tone="danger" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Xarajatlar tarkibi</h2>
                <p className="text-sm text-[var(--ac-muted)]">Davr bo‘yicha xarajat ulushi va kategoriya ulushlari</p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(report?.expense_breakdown || []).map((item, index) => ({
                        ...item,
                        color: ['#2563eb', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][index % 5],
                      }))}
                      dataKey="total"
                      nameKey="label"
                      innerRadius={70}
                      outerRadius={104}
                      paddingAngle={4}
                    >
                      {(report?.expense_breakdown || []).map((item, index) => (
                        <Cell
                          key={item.label}
                          fill={['#2563eb', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][index % 5]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {(report?.expense_breakdown || []).map((item, index) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: ['#2563eb', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][index % 5] }}
                      />
                      <span className="text-sm text-[var(--ac-foreground)]">{item.label}</span>
                    </div>
                    <strong className="text-sm text-[var(--ac-foreground)]">{formatMoney(item.total)}</strong>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Ish haqi ko‘rsatkichlari</h2>
                <p className="text-sm text-[var(--ac-muted)]">Xodimlar, tarix va pending holatlar</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <p className="text-sm text-[var(--ac-muted)]">Faol xodimlar</p>
                  <strong className="mt-2 block text-2xl text-[var(--ac-foreground)]">{report?.payroll?.summary?.active_employees || 0}</strong>
                </div>
                <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <p className="text-sm text-[var(--ac-muted)]">Kutilayotgan sikllar</p>
                  <strong className="mt-2 block text-2xl text-[var(--ac-foreground)]">{report?.payroll?.summary?.pending || 0}</strong>
                </div>
                <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <p className="text-sm text-[var(--ac-muted)]">Kechikkan sikllar</p>
                  <strong className="mt-2 block text-2xl text-[var(--ac-foreground)]">{report?.payroll?.summary?.overdue || 0}</strong>
                </div>
                <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                  <p className="text-sm text-[var(--ac-muted)]">Qolgan balans</p>
                  <strong className="mt-2 block text-2xl text-[var(--ac-foreground)]">{formatMoney(report?.payroll?.summary?.outstanding_balance)}</strong>
                </div>
              </div>
              <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                <p className="text-sm text-[var(--ac-muted)]">Xarajat ulushi</p>
                <strong className="mt-2 block text-3xl text-[var(--ac-foreground)]">{report?.summary?.expense_ratio || 0}%</strong>
                <p className="mt-2 text-xs text-[var(--ac-subtle)]">
                  Jami xarajatlarning tushumga nisbati. Pastroq ko‘rsatkich yuqoriroq marjani anglatadi.
                </p>
              </div>
            </SurfaceCard>
          </div>
        </>
      )}
    </div>
  );
}
