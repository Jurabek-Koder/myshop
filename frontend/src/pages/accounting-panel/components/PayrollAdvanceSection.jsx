import React, { useCallback, useEffect, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs } from '../utils/formatUzs.js';

export default function PayrollAdvanceSection({ year, month }) {
  const { api, run: runAction, loading } = useAccountingApp();
  const [runData, setRunData] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const d = await api(`/payroll-management/advances/runs?year=${year}&month=${month}`);
    const runs = d.runs || [];
    const current = runs.find((r) => r.cycle_year === year && r.cycle_month === month) || runs[0];
    if (!current) {
      setRunData(null);
      return;
    }
    const full = await api(`/payroll-management/advances/runs/${current.id}`);
    setRunData(full);
  }, [api, year, month]);

  useEffect(() => {
    load().catch(() => setRunData(null));
  }, [load]);

  async function action(fn, key) {
    setBusy(key);
    try {
      await runAction(fn);
      await load();
    } finally {
      setBusy('');
    }
  }

  const advanceRun = runData?.run;
  const items = runData?.items || [];

  return (
    <section className="ap-panel">
      <h3>{uz.payroll.advanceWorkflow}</h3>
      <p className="ap-sub">{uz.payroll.advanceWorkflowHint}</p>
      <div className="ap-scroll-x ap-actions" style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          className="ap-btn"
          disabled={!!busy || loading}
          onClick={() =>
            action(() => api('/payroll-management/advances/runs/create', { method: 'POST', body: JSON.stringify({ year, month }) }), 'create')
          }
        >
          {busy === 'create' ? uz.loading : uz.payroll.advanceSendSuperuser}
        </button>
        {advanceRun?.status === 'superuser_approved' ? (
          <button
            type="button"
            className="ap-btn ap-btn--primary"
            disabled={!!busy}
            onClick={() => action(() => api(`/payroll-management/advances/runs/${advanceRun.id}/assign`, { method: 'POST', body: '{}' }), 'assign')}
          >
            {uz.payroll.advanceAssignRoles}
          </button>
        ) : null}
        {advanceRun?.id ? (
          <button
            type="button"
            className="ap-btn ap-btn--success"
            disabled={!!busy}
            onClick={() =>
              action(
                () => api(`/payroll-management/advances/runs/${advanceRun.id}/distribute-confirmed`, { method: 'POST', body: '{}' }),
                'dist',
              )
            }
          >
            {uz.payroll.advanceDistributeConfirmed}
          </button>
        ) : null}
      </div>

      {advanceRun ? (
        <p className="ap-sub" style={{ marginTop: '0.75rem' }}>
          {advanceRun.status_label} · {advanceRun.item_count} xodim · {formatUzs(advanceRun.total_amount_uzs)}
        </p>
      ) : (
        <p className="ap-empty" style={{ marginTop: '0.75rem' }}>
          {uz.noData} — 15-kunda avtomatik yuboriladi yoki yuqoridagi tugma.
        </p>
      )}

      {items.length ? (
        <>
          <p className="ap-table-scroll-hint" aria-hidden="true">
            ← Jadvalni yonga suring →
          </p>
          <div className="ap-table-wrap" style={{ marginTop: '0.35rem' }}>
            <table className="ap-table ap-table--wide">
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Xodim</th>
                  <th>{uz.payroll.columnRole}</th>
                  <th className="ap-num">Avans</th>
                  <th>Holat</th>
                  <th className="ap-col-action">Amal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.employee_display_name}</td>
                    <td className="ap-sub">{it.role_label}</td>
                    <td className="ap-num">{formatUzs(it.amount_uzs)}</td>
                    <td>{it.status_label}</td>
                    <td className="ap-col-action">
                      {it.status === 'worker_confirmed' ? (
                        <button
                          type="button"
                          className="ap-btn ap-btn--sm ap-btn--success"
                          disabled={!!busy}
                          onClick={() =>
                            action(
                              () => api(`/payroll-management/advances/items/${it.id}/distribute`, { method: 'POST', body: '{}' }),
                              `d-${it.id}`,
                            )
                          }
                        >
                          {uz.payroll.advanceDistributeOne}
                        </button>
                      ) : null}
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : null}
    </section>
  );
}
