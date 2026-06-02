import React, { useCallback, useEffect, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';

function parsePayload(json) {
  try {
    return JSON.parse(String(json || '{}'));
  } catch {
    return {};
  }
}

function logSummary(row) {
  const p = parsePayload(row.payload_json);
  if (row.entity_type === 'payroll_role_default') {
    return `${p.role_key || 'rol'}: ${formatUzs(p.monthly_salary_uzs)} · avans ${Math.round(Number(p.advance_percent || 0) * 100)}%`;
  }
  if (row.entity_type === 'payroll_employee') {
    return `${p.role || 'xodim'}: ${formatUzs(p.monthly_salary_uzs)}`;
  }
  if (row.entity_type === 'financial_report') {
    return p.report_type || p.title || 'Hisobot';
  }
  return row.entity_type || '—';
}

export default function SuperuserAuditSection() {
  const { api } = useAccountingApp();
  const [logs, setLogs] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logData, apprData, repData] = await Promise.all([
        api('/superuser-audit/logs?limit=60'),
        api('/superuser-audit/advance-approvals?limit=30'),
        api('/superuser-audit/reports?limit=20'),
      ]);
      setLogs(logData.logs || []);
      setApprovals(apprData.approvals || []);
      setReports(repData.reports || []);
    } catch {
      setLogs([]);
      setApprovals([]);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="ap-panel">
      <div className="ap-panel-head-row">
        <div>
          <h3 style={{ margin: 0 }}>{uz.payroll.superuserAuditTitle}</h3>
          <p className="ap-sub" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            {uz.payroll.superuserAuditHint}
          </p>
        </div>
        <button type="button" className="ap-btn" onClick={() => void load()} disabled={loading}>
          {loading ? uz.loading : uz.refresh}
        </button>
      </div>

      <h4 className="ap-subhead">{uz.payroll.superuserAdvanceApprovals}</h4>
      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="ap-table-wrap">
        <table className="ap-table ap-table--wide">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Oy</th>
              <th>Holat</th>
              <th>Superuser</th>
              <th>Tasdiq vaqti</th>
              <th className="ap-num">Jami</th>
              <th className="ap-center">Xodimlar</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.cycle_month}-oy {a.cycle_year}
                </td>
                <td className="ap-sub">{a.status}</td>
                <td>{a.approver_name || a.approver_login || '—'}</td>
                <td>{a.superuser_approved_at ? formatDateUz(a.superuser_approved_at) : '—'}</td>
                <td className="ap-num">{formatUzs(a.total_amount_uzs)}</td>
                <td className="ap-center">{a.item_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!approvals.length && !loading ? <p className="ap-empty">{uz.noData}</p> : null}
      </div>

      <h4 className="ap-subhead">{uz.payroll.superuserReports}</h4>
      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="ap-table-wrap">
        <table className="ap-table ap-table--wide">
          <thead>
            <tr>
              <th>Sarlavha</th>
              <th>Turi</th>
              <th>Davr</th>
              <th>Yaratilgan</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td className="ap-sub">{r.report_type}</td>
                <td>
                  {r.period_start} — {r.period_end}
                </td>
                <td className="ap-sub">{formatDateUz(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reports.length && !loading ? <p className="ap-empty">{uz.noData}</p> : null}
      </div>

      <h4 className="ap-subhead">{uz.payroll.superuserActivityLog}</h4>
      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="ap-table-wrap">
        <table className="ap-table ap-table--wide">
          <thead>
            <tr>
              <th>Vaqt</th>
              <th>Superuser</th>
              <th>Amal</th>
              <th>Obekt</th>
              <th>Tafsilot</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((row) => (
              <tr key={row.id}>
                <td className="ap-sub">{formatDateUz(row.created_at)}</td>
                <td>{row.actor_name || row.actor_login}</td>
                <td>{row.action}</td>
                <td className="ap-sub">{row.entity_type}</td>
                <td>{logSummary(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.length && !loading ? <p className="ap-empty">{uz.noData}</p> : null}
      </div>
    </section>
  );
}
