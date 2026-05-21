import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getActivities } from './accountingApi.js';
import { EmptyState, PageHeader, SectionCard } from './AccountingSuiteParts.jsx';
import { formatDateTime } from './accountingUtils.js';

export default function AccountingActivitiesPage() {
  const { request } = useAuth();

  const activitiesQuery = useQuery({
    queryKey: ['accounting', 'activities'],
    queryFn: () => getActivities(request, { limit: 120 }),
  });

  const items = activitiesQuery.data?.items || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Faollik jurnali"
        description="Accounting modulidagi barcha muhim yozuvlar, payroll to‘lovlari va transaction amallari audit log ko‘rinishida."
      />

      <SectionCard title="Audit yozuvlari" description="Oxirgi moliyaviy amallar va tizim eventlari">
        {items.length ? (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-950 dark:text-white">{item.summary || item.action}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {item.actor_name || 'Tizim'} · {item.entity_type} #{item.entity_id || '—'}
                    </p>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{formatDateTime(item.created_at)}</div>
                </div>
                {item.payload ? (
                  <pre className="mt-4 overflow-x-auto rounded-[18px] border border-slate-100 bg-white/80 p-4 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-300">
                    {JSON.stringify(item.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Audit yozuvlari topilmadi" description="Yangi accounting amallari shu yerda qayd qilinadi." />
        )}
      </SectionCard>
    </div>
  );
}
