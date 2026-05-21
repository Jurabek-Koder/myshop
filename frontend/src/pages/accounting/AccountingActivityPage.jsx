import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { createAccountingApi } from './v2/accountingApi.js';
import { formatDateTime, formatMoney } from './v2/accountingUtils.js';

function renderMeta(log) {
  if (!log.metadata) return '';
  if (log.metadata.amount != null) {
    return `${formatMoney(log.metadata.amount)} • ID: ${log.entity_id || '-'}`;
  }
  return `ID: ${log.entity_id || '-'}`;
}

export default function AccountingActivityPage() {
  const { request } = useAuth();
  const api = useMemo(() => createAccountingApi(request), [request]);

  const activityQuery = useQuery({
    queryKey: ['accounting-activity'],
    queryFn: () => api.getActivity(200),
  });

  const logs = activityQuery.data?.logs || [];

  return (
    <section className="acc-page">
      <div className="acc-page-heading">
        <div>
          <h1>Faollik jurnali</h1>
          <p>Payroll, tranzaksiya va hisobot harakatlarining audit logi.</p>
        </div>
      </div>

      <article className="acc-panel">
        <ul className="acc-activity-full-list">
          {activityQuery.isLoading && <li className="acc-muted">Jurnal yozuvlari yuklanmoqda…</li>}
          {activityQuery.error && <li className="acc-error">{activityQuery.error.message}</li>}
          {!activityQuery.isLoading && logs.length === 0 && <li className="acc-muted">Hozircha jurnal bo‘sh.</li>}
          {logs.map((log) => (
            <li key={log.id}>
              <div>
                <strong>{log.action_type}</strong>
                <p>
                  {log.actor_name} • {log.entity_type}
                </p>
              </div>
              <div className="acc-activity-meta">
                <span>{renderMeta(log)}</span>
                <time>{formatDateTime(log.created_at)}</time>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

