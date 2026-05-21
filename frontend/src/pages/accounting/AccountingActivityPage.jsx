import React from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { useAccountingActivityQuery } from '../../lib/accounting/api.js';
import { formatDateTime } from '../../lib/accounting/format.js';
import {
  Button,
  EmptyState,
  GlassTable,
  SectionHeader,
  SurfaceCard,
} from '../../components/accounting/AccountingPrimitives.jsx';

export default function AccountingActivityPage() {
  const query = useAccountingActivityQuery(60);
  const rows = query.data?.activity || [];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Audit jurnali"
        title="Faollik jurnali"
        description="Buxgalteriya modulida yaratilgan payroll, tranzaksiya va avtomatizatsiya amallari bu yerda qayd etiladi."
        actions={[
          <Button key="refresh" variant="secondary" onClick={() => query.refetch()}>
            Yangilash
          </Button>,
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
        <SurfaceCard className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-500">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Audit holati</h2>
              <p className="text-sm text-[var(--ac-muted)]">Moduldagi o‘zgarishlar real-time jurnalga yoziladi.</p>
            </div>
          </div>
          <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
            <p className="text-sm text-[var(--ac-muted)]">Jami yozuvlar</p>
            <strong className="mt-2 block text-3xl text-[var(--ac-foreground)]">{rows.length}</strong>
          </div>
          <div className="space-y-3">
            {rows.slice(0, 4).map((row) => (
              <div key={row.id} className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--ac-foreground)]">
                  <Activity className="h-4 w-4 text-blue-500" />
                  {row.action}
                </div>
                <p className="mt-2 text-xs text-[var(--ac-muted)]">{row.message}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

        {query.isError ? (
          <EmptyState
            title="Faollik jurnali yuklanmadi"
            description={query.error?.message || 'Serverdan audit yozuvlarini olib bo‘lmadi.'}
            action={<Button variant="primary" onClick={() => query.refetch()}>Qayta urinish</Button>}
          />
        ) : (
          <GlassTable>
            <div className="flex items-center justify-between border-b border-[var(--ac-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Audit tasmasi</h2>
                <p className="text-sm text-[var(--ac-muted)]">Amal, obyekt, aktor va vaqt bo‘yicha</p>
              </div>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ac-border)] text-xs uppercase tracking-[0.2em] text-[var(--ac-subtle)]">
                  <th className="px-5 py-3">Amal</th>
                  <th className="px-5 py-3">Obyekt</th>
                  <th className="px-5 py-3">Izoh</th>
                  <th className="px-5 py-3">Aktor</th>
                  <th className="px-5 py-3">Vaqt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--ac-border)]/70 last:border-b-0">
                    <td className="px-5 py-4 font-medium text-[var(--ac-foreground)]">{row.action}</td>
                    <td className="px-5 py-4 text-[var(--ac-muted)]">
                      {row.entity_type}
                      {row.entity_id ? ` #${row.entity_id}` : ''}
                    </td>
                    <td className="px-5 py-4 text-[var(--ac-foreground)]">{row.message}</td>
                    <td className="px-5 py-4 text-[var(--ac-muted)]">{row.actor_name}</td>
                    <td className="px-5 py-4 text-[var(--ac-muted)]">{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassTable>
        )}
      </div>
    </div>
  );
}
