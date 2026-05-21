import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getPayrollCalendar } from './accountingApi.js';
import { EmptyState, PageHeader, SectionCard, StatusPill } from './AccountingSuiteParts.jsx';
import { formatCurrency, formatDate, toMonthInputValue } from './accountingUtils.js';

export default function AccountingCalendarPage() {
  const { request } = useAuth();
  const [month, setMonth] = useState(toMonthInputValue());

  const calendarQuery = useQuery({
    queryKey: ['accounting', 'calendar', month],
    queryFn: () => getPayrollCalendar(request, { month }),
  });

  const groupedItems = useMemo(() => {
    const map = new Map();
    for (const item of calendarQuery.data?.items || []) {
      const key = item.date_key || String(item.due_date || '').slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries());
  }, [calendarQuery.data?.items]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payroll calendar"
        title="Payroll kalendari"
        description="15 kunlik avans va oy yakunidagi oylik to‘lovlarini sana bo‘yicha ko‘ring."
      />

      <SectionCard title="Kalendardagi oy" description="Kerakli davrni tanlang">
        <input
          type="month"
          className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </SectionCard>

      {groupedItems.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {groupedItems.map(([dateKey, items]) => (
            <SectionCard key={dateKey} title={formatDate(dateKey)} description={`${items.length} ta payroll vazifa`}>
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[22px] border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">{item.full_name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.position_title}</p>
                      </div>
                      <StatusPill status={item.status} label={item.status_label} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sikl</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{item.cycle_type_label}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Qolgan summa</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(item.remaining_amount)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      ) : (
        <EmptyState title="Kalendarda ma’lumot yo‘q" description="Tanlangan oy uchun payroll sikllari topilmadi." />
      )}
    </div>
  );
}
