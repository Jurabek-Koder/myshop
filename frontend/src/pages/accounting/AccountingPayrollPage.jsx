import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Download, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button.jsx';
import { PageHeader, SectionCard, StatusPill, EmptyState } from './AccountingSuiteParts.jsx';
import AccountingQuickActionsDialog from './AccountingQuickActionsDialog.jsx';
import { getCategories, getEmployees, getPayrollCycles, createPayrollPayment } from './accountingApi.js';
import { downloadFile, formatCurrency, formatDate, toMonthInputValue } from './accountingUtils.js';
import { useAccountingStore } from './accountingStore.js';

export default function AccountingPayrollPage() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [month, setMonth] = useState(toMonthInputValue());
  const employeeSearch = useAccountingStore((state) => state.employeeSearch);
  const setEmployeeSearch = useAccountingStore((state) => state.setEmployeeSearch);
  const payrollStatus = useAccountingStore((state) => state.payrollStatus);
  const setPayrollStatus = useAccountingStore((state) => state.setPayrollStatus);

  const employeesQuery = useQuery({
    queryKey: ['accounting', 'employees', employeeSearch],
    queryFn: () => getEmployees(request, { search: employeeSearch }),
  });

  const categoriesQuery = useQuery({
    queryKey: ['accounting', 'categories'],
    queryFn: () => getCategories(request),
  });

  const cyclesQuery = useQuery({
    queryKey: ['accounting', 'payroll', month, payrollStatus],
    queryFn: () => getPayrollCycles(request, { month, status: payrollStatus }),
  });

  const payrollMutation = useMutation({
    mutationFn: ({ cycleId, payload }) => createPayrollPayment(request, cycleId, payload),
    onSuccess: async (data) => {
      setDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting', 'payroll'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'employees'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
      ]);
      if (data?.receiptId) downloadFile(`/api/accounting/portal/receipts/${data.receiptId}/pdf`);
    },
  });

  const cycles = cyclesQuery.data?.cycles || [];
  const openCycles = useMemo(
    () => cycles.filter((cycle) => Number(cycle.remaining_amount) > 0.009),
    [cycles],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payroll management"
        title="Ish haqi boshqaruvi"
        description="15 kunlik avans va oy oxiridagi oylik sikllarini kuzating, qisman to‘lovlarni boshqaring va receipt yarating."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Avans berish
            </Button>
            <Button onClick={() => setDialogOpen(true)}>Oylik to‘lash</Button>
          </>
        }
      />

      <SectionCard title="Payroll filtrlari" description="Oy, status va xodim bo‘yicha saralash">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Oy
            <input
              type="month"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Holat
            <select
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={payrollStatus}
              onChange={(event) => setPayrollStatus(event.target.value)}
            >
              <option value="all">Barchasi</option>
              <option value="pending">Kutilmoqda</option>
              <option value="overdue">Kechikkan</option>
              <option value="paid">To‘landi</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Xodim qidirish
            <input
              type="text"
              placeholder="F.I.Sh. yoki lavozim"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
            />
          </label>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Mas’ul xodimlar kartalari" description="Oylik, keyingi sana va qolgan balans">
          {employeesQuery.data?.employees?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {employeesQuery.data.employees.map((employee) => (
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
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Keyingi sana</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                        {employee.next_payment ? formatDate(employee.next_payment.due_date) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Xodim topilmadi" description="Qidiruvni tozalang yoki yangi payroll ma’lumotlarini kiriting." />
          )}
        </SectionCard>

        <SectionCard title="Payroll xulosasi" description="Joriy oy bo‘yicha holat">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <div className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-sky-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Jami sikllar</p>
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">{cycles.length}</p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Ochiq sikllar</p>
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">{openCycles.length}</p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Jami ajratilgan summa</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(cyclesQuery.data?.summary?.total_amount)}</p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm text-slate-500 dark:text-slate-400">Qolgan balans</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(cyclesQuery.data?.summary?.remaining_amount)}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Payroll sikllari"
        description="Qisman to‘lov, overdue tracking va receipt eksport bilan"
        action={
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            <Download className="h-4 w-4" />
            To‘lov qilish
          </Button>
        }
      >
        {cycles.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <th className="pb-3 pr-4 font-medium">Xodim</th>
                  <th className="pb-3 pr-4 font-medium">Sikl</th>
                  <th className="pb-3 pr-4 font-medium">Muddat</th>
                  <th className="pb-3 pr-4 font-medium">Jami</th>
                  <th className="pb-3 pr-4 font-medium">To‘langan</th>
                  <th className="pb-3 pr-4 font-medium">Qolgan</th>
                  <th className="pb-3 pr-4 font-medium">Holat</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.id} className="border-b border-slate-100/80 last:border-b-0 dark:border-white/5">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-slate-950 dark:text-white">{cycle.full_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{cycle.position_title}</div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{cycle.cycle_type_label}</td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{formatDate(cycle.due_date)}</td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{formatCurrency(cycle.gross_amount)}</td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{formatCurrency(cycle.paid_amount)}</td>
                    <td className="py-4 pr-4 font-semibold text-slate-950 dark:text-white">{formatCurrency(cycle.remaining_amount)}</td>
                    <td className="py-4 pr-4">
                      <StatusPill status={cycle.status} label={cycle.status_label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Payroll sikllari topilmadi" description="Tanlangan filter bo‘yicha hech qanday sikl yo‘q." />
        )}
      </SectionCard>

      <AccountingQuickActionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categoriesQuery.data}
        cycles={openCycles}
        onCreateTransaction={() => {}}
        onCreatePayment={(cycleId, payload) => payrollMutation.mutate({ cycleId, payload })}
        busy={payrollMutation.isPending}
        initialMode="payroll"
      />
    </div>
  );
}
