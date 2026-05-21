import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, BadgeDollarSign, ClipboardList, ReceiptText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountingJson, formatDateTimeUz } from './accountingUtils.js';

function resolveActionLabel(item) {
  const action = String(item?.action || '').trim().toLowerCase();
  if (action === 'salary_payment.created') return 'Ish haqi to‘lovi yaratildi';
  if (action === 'financial_transaction.created') return 'Moliyaviy tranzaksiya yaratildi';
  if (action === 'employee.synced') return 'Payroll xodimi sinxronlandi';
  return item?.action || 'Tizim harakati';
}

function resolveActionIcon(entityType) {
  const type = String(entityType || '').trim().toLowerCase();
  if (type === 'salary_payment') return BadgeDollarSign;
  if (type === 'financial_transaction') return ReceiptText;
  if (type === 'employee') return ShieldCheck;
  return ClipboardList;
}

export default function AccountingActivityPage() {
  const { request } = useAuth();

  const activityQuery = useQuery({
    queryKey: ['accounting-activity'],
    queryFn: () => fetchAccountingJson(request, '/accounting/portal/activity?limit=60'),
  });

  const items = activityQuery.data?.items || [];
  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const type = String(item.entity_type || 'other').trim().toLowerCase();
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {},
    );
  }, [items]);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Jami audit yozuvlar', value: items.length, icon: Activity },
          { label: 'Payroll amallari', value: summary.salary_payment || 0, icon: BadgeDollarSign },
          { label: 'Tranzaksiyalar', value: summary.financial_transaction || 0, icon: ReceiptText },
          { label: 'Xodim sync yozuvlari', value: summary.employee || 0, icon: ShieldCheck },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="accounting-glass-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
                  <h2 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{card.value}</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="accounting-glass-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="accounting-section-title text-slate-950 dark:text-white">Faoliyat jurnali</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Accounting va payroll modulidagi so‘nggi audit harakatlari.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {activityQuery.isLoading ? (
            Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-[1.4rem] bg-slate-100/70 dark:bg-slate-900/70" />
            ))
          ) : items.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Hozircha audit yozuvlari mavjud emas.
            </div>
          ) : (
            items.map((item) => {
              const Icon = resolveActionIcon(item.entity_type);
              return (
                <div
                  key={item.id}
                  className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                          {resolveActionLabel(item)}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>Entity: {item.entity_type || '—'}</span>
                          <span>ID: {item.entity_id || '—'}</span>
                          <span>Muallif: {item.actor_name || 'Tizim'}</span>
                        </div>
                        {item.payload ? (
                          <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950/95 p-3 text-xs text-slate-200 dark:border-slate-700">
                            {JSON.stringify(item.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                      {formatDateTimeUz(item.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
