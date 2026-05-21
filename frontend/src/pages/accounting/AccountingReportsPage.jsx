import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState, GlassCard, PrimaryButton, SectionTitle, SecondaryButton } from './AccountingUi.jsx';
import { useAccountingApi } from './AccountingApi.js';
import { formatMoney } from './accountingFormat.js';

const REPORT_RANGES = [
  { value: 30, label: '30 kun' },
  { value: 60, label: '60 kun' },
  { value: 90, label: '90 kun' },
];

const CHART_COLORS = ['#22d3ee', '#f59e0b', '#fb7185', '#818cf8', '#34d399', '#94a3b8'];

function toCsv(report) {
  const rows = [['Kategoriya', 'Summa']];
  (report.expense_breakdown || []).forEach((row) => rows.push([row.category, row.total]));
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
}

function triggerDownload(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AccountingReportsPage({ analyticsMode = false }) {
  const api = useAccountingApi();
  const [rangeDays, setRangeDays] = useState(30);
  const reportQuery = useQuery({
    queryKey: ['accounting-report-summary', rangeDays],
    queryFn: () => api.getReportSummary(rangeDays),
  });

  const report = reportQuery.data || { totals: {}, expense_breakdown: [] };
  const expenseData = report.expense_breakdown || [];
  const ratioLabel = `${Math.round((report.totals?.expense_ratio || 0) * 100)}%`;
  const title = analyticsMode ? 'Moliyaviy tahlil' : 'Hisobotlar';
  const subtitle = analyticsMode
    ? 'Xarajat ulushi, sof foyda va kategoriya kesimida chuqur analitika.'
    : 'Excel/PDF eksportga tayyor, biznes qarorlar uchun umumiy moliyaviy ko‘rinish.';

  const exportPayload = useMemo(
    () => ({
      period: `${rangeDays} kun`,
      totals: report.totals,
      expense_breakdown: report.expense_breakdown,
      generated_at: new Date().toISOString(),
    }),
    [rangeDays, report],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <SectionTitle
        title={title}
        subtitle={subtitle}
        rightSlot={
          <div className="flex items-center gap-2">
            <SecondaryButton type="button" onClick={() => reportQuery.refetch()}>
              Yangilash
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() =>
                triggerDownload(
                  `hisobot-${rangeDays}-kun.json`,
                  JSON.stringify(exportPayload, null, 2),
                  'application/json',
                )
              }
            >
              <Download size={16} />
              JSON
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <GlassCard>
          <p className="text-sm text-slate-300">Daromad</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{formatMoney(report.totals?.income || 0)}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-sm text-slate-300">Xarajat</p>
          <p className="mt-2 text-2xl font-bold text-rose-300">{formatMoney(report.totals?.expense || 0)}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-sm text-slate-300">Sof foyda</p>
          <p className="mt-2 text-2xl font-bold text-sky-300">{formatMoney(report.totals?.profit || 0)}</p>
          <p className="mt-1 text-xs text-slate-400">Xarajat ulushi: {ratioLabel}</p>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-200">Oraliq bo‘yicha hisobot</p>
          <div className="flex gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
            {REPORT_RANGES.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => setRangeDays(range.value)}
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  rangeDays === range.value ? 'bg-indigo-500 text-white' : 'text-slate-300'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        {expenseData.length ? (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseData} dataKey="total" nameKey="category" innerRadius={70} outerRadius={105}>
                    {expenseData.map((row, index) => (
                      <Cell key={row.category} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {expenseData.map((row, index) => (
                <div
                  key={row.category}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                >
                  <span className="inline-flex items-center gap-2 text-slate-100">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    {row.category}
                  </span>
                  <span className="font-semibold text-white">{formatMoney(row.total)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="Hisobot ma’lumotlari yo‘q" description="Tanlangan periodda xarajat kategoriyalari topilmadi." />
        )}
      </GlassCard>

      <GlassCard>
        <SectionTitle
          title="Eksport"
          subtitle="Excel/CSV formatida hisobotni tez yuklab olish."
          rightSlot={
            <PrimaryButton
              type="button"
              onClick={() => triggerDownload(`hisobot-${rangeDays}-kun.csv`, toCsv(report), 'text/csv;charset=utf-8;')}
            >
              <FileSpreadsheet size={16} />
              CSV yuklash
            </PrimaryButton>
          }
        />
        <p className="text-sm text-slate-300">
          Eksport fayllari ichida umumiy daromad/xarajat, sof foyda, kategoriya bo‘yicha breakdown va period metadata mavjud.
        </p>
      </GlassCard>
    </div>
  );
}
