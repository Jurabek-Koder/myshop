import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeDollarSign, PhoneCall, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getEmployees } from './accountingApi.js';
import { EmptyState, PageHeader, SectionCard, StatusPill } from './AccountingSuiteParts.jsx';
import { formatCurrency, formatDate } from './accountingUtils.js';
import { useAccountingStore } from './accountingStore.js';

export default function AccountingPeoplePage() {
  const { request } = useAuth();
  const employeeSearch = useAccountingStore((state) => state.employeeSearch);
  const setEmployeeSearch = useAccountingStore((state) => state.setEmployeeSearch);

  const employeesQuery = useQuery({
    queryKey: ['accounting', 'people', employeeSearch],
    queryFn: () => getEmployees(request, { search: employeeSearch }),
  });

  const employees = employeesQuery.data?.employees || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Employee directory"
        title="Mas’ul xodimlar"
        description="Superuser payroll qamrovidagi xodimlar ro‘yxati, joriy balans, so‘nggi to‘lov va keyingi muddatlar."
      />

      <SectionCard title="Qidiruv" description="Xodim ismi yoki lavozimi bo‘yicha filtr">
        <input
          type="text"
          placeholder="Masalan, bosh hisobchi"
          className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
          value={employeeSearch}
          onChange={(event) => setEmployeeSearch(event.target.value)}
        />
      </SectionCard>

      {employees.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {employees.map((employee) => (
            <SectionCard
              key={employee.id}
              title={employee.full_name}
              description={employee.position_title}
              action={<StatusPill status={employee.status} label={employee.status_label} />}
            >
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <BadgeDollarSign className="h-4 w-4" />
                      Oylik stavka
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">{formatCurrency(employee.monthly_salary)}</div>
                  </div>
                  <div className="rounded-[20px] border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <ShieldCheck className="h-4 w-4" />
                      Qolgan balans
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">{formatCurrency(employee.remaining_balance)}</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Oxirgi to‘lov</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                      {employee.last_payment ? formatDate(employee.last_payment.paid_at) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Keyingi muddat</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                      {employee.next_payment ? formatDate(employee.next_payment.due_date) : '—'}
                    </p>
                  </div>
                </div>

                <div className="rounded-[20px] border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <PhoneCall className="h-4 w-4" />
                    Aloqa
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{employee.phone || 'Telefon biriktirilmagan'}</div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      ) : (
        <EmptyState title="Xodimlar topilmadi" description="Qidiruv so‘zini o‘zgartiring yoki payroll ma’lumotlarini tekshiring." />
      )}
    </div>
  );
}
