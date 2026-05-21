import React, { useMemo, useState } from 'react';
import { CalendarClock, Download, HandCoins, Landmark, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAccountingApi, useAccountingPayrollQuery } from '../../lib/accounting/api.js';
import { useAccountingStore } from '../../lib/accounting/store.js';
import { cycleLabel, formatDate, formatDateTime, formatMoney, monthKeyLabel, paymentMethodLabel } from '../../lib/accounting/format.js';
import {
  Button,
  EmptyState,
  GlassTable,
  SectionHeader,
  SkeletonCards,
  StatCard,
  StatusBadge,
  SurfaceCard,
} from '../../components/accounting/AccountingPrimitives.jsx';

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function AccountingPayrollPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const payrollQuery = useAccountingPayrollQuery(monthKey);
  const openPaymentDialog = useAccountingStore((state) => state.openPaymentDialog);
  const { downloadFile } = useAccountingApi();

  const data = payrollQuery.data;

  const summaryCards = useMemo(
    () => [
      { title: 'Faol xodimlar', value: data?.summary?.active_employees || 0, icon: Landmark, tone: 'primary' },
      { title: 'Kutilayotgan balans', value: formatMoney(data?.summary?.outstanding_balance), icon: Wallet, tone: 'warning' },
      { title: 'Oy ichida to‘langan', value: formatMoney(data?.summary?.paid_this_month), icon: HandCoins, tone: 'success' },
      { title: 'Kechikkan sikllar', value: data?.summary?.overdue || 0, icon: CalendarClock, tone: 'danger' },
    ],
    [data],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Ish haqi"
        title="Ish haqi boshqaruvi"
        description="15 kunlik avans va oy oxiridagi yakuniy oylik sikllarini kuzating, to‘lov tarixini boshqaring."
        actions={[
          <input
            key="month"
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-2.5 text-sm text-[var(--ac-foreground)]"
          />,
          <Button key="advance" variant="secondary" onClick={() => openPaymentDialog({ cycle_type: 'advance' })}>
            Avans berish
          </Button>,
          <Button key="salary" variant="primary" onClick={() => openPaymentDialog({ cycle_type: 'salary' })}>
            Oylik to‘lash
          </Button>,
        ]}
      />

      {payrollQuery.isLoading ? (
        <SkeletonCards />
      ) : payrollQuery.isError ? (
        <EmptyState
          title="Ish haqi sahifasi yuklanmadi"
          description={payrollQuery.error?.message || 'Serverdan ma’lumot olib bo‘lmadi.'}
          action={<Button variant="primary" onClick={() => payrollQuery.refetch()}>Qayta urinish</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <StatCard key={item.title} icon={item.icon} title={item.title} value={item.value} tone={item.tone} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
            <SurfaceCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">{monthKeyLabel(data?.month_key)}</h2>
                  <p className="text-sm text-[var(--ac-muted)]">Ish haqi kalendari va due date boshqaruvi</p>
                </div>
              </div>
              <div className="space-y-3">
                {(data?.calendar || []).length === 0 ? (
                  <p className="text-sm text-[var(--ac-muted)]">Tanlangan oy uchun sikllar topilmadi.</p>
                ) : (
                  data.calendar.map((cycle) => (
                    <motion.div
                      key={cycle.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-[var(--ac-foreground)]">{cycle.full_name}</p>
                          <p className="text-sm text-[var(--ac-muted)]">
                            {cycle.role_title} • {cycle.cycle_label}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={cycle.status}>{cycle.status_label}</StatusBadge>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openPaymentDialog({ employee_id: cycle.employee_id, cycle_type: cycle.cycle_type })}
                          >
                            To‘lash
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-3 py-2">
                          <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Muddat</span>
                          <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatDate(cycle.due_date)}</strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-3 py-2">
                          <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Jami summa</span>
                          <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(cycle.gross_amount)}</strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-3 py-2">
                          <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Qolgan</span>
                          <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(cycle.remaining_amount)}</strong>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Xodim kartalari</h2>
                <p className="text-sm text-[var(--ac-muted)]">Qolgan balans va keyingi to‘lov muddati</p>
              </div>
              <div className="space-y-3">
                {(data?.employees || []).map((employee) => (
                  <div key={employee.id} className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--ac-foreground)]">{employee.full_name}</p>
                        <p className="text-xs text-[var(--ac-muted)]">{employee.role_title}</p>
                      </div>
                      <StatusBadge status={employee.status}>{employee.status_label}</StatusBadge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--ac-muted)]">
                      <div>
                        <span className="block uppercase tracking-wide text-[11px]">Oylik</span>
                        <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(employee.monthly_salary)}</strong>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide text-[11px]">Qolgan balans</span>
                        <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(employee.remaining_balance)}</strong>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide text-[11px]">Oxirgi to‘lov</span>
                        <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">
                          {employee.last_payment_at ? formatDate(employee.last_payment_at, { withYear: false }) : '-'}
                        </strong>
                      </div>
                      <div>
                        <span className="block uppercase tracking-wide text-[11px]">Keyingi sana</span>
                        <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{employee.next_payment_date || '-'}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>

          <GlassTable>
            <div className="flex items-center justify-between border-b border-[var(--ac-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">To‘lovlar tarixi</h2>
                <p className="text-sm text-[var(--ac-muted)]">Kvitansiya va payment method bilan</p>
              </div>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ac-border)] text-xs uppercase tracking-[0.2em] text-[var(--ac-subtle)]">
                  <th className="px-5 py-3">Xodim</th>
                  <th className="px-5 py-3">Turi</th>
                  <th className="px-5 py-3">Summa</th>
                  <th className="px-5 py-3">Usul</th>
                  <th className="px-5 py-3">Sana</th>
                  <th className="px-5 py-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody>
                {(data?.payment_history || []).map((payment) => (
                  <tr key={payment.id} className="border-b border-[var(--ac-border)]/70 text-[var(--ac-foreground)] last:border-b-0">
                    <td className="px-5 py-4">
                      <div>
                        <div className="font-medium">{payment.full_name}</div>
                        <div className="text-xs text-[var(--ac-muted)]">{payment.role_title}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4">{cycleLabel(payment.payment_kind)}</td>
                    <td className="px-5 py-4 font-semibold">{formatMoney(payment.amount)}</td>
                    <td className="px-5 py-4">{paymentMethodLabel(payment.payment_method)}</td>
                    <td className="px-5 py-4">{formatDateTime(payment.paid_at)}</td>
                    <td className="px-5 py-4 text-right">
                      {payment.receipt_id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadFile(`/receipts/${payment.receipt_id}/pdf`, `receipt-${payment.receipt_id}.pdf`)}
                        >
                          <Download className="h-4 w-4" />
                          PDF
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--ac-subtle)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassTable>
        </>
      )}
    </div>
  );
}
