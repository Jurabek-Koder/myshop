import React, { useCallback, useEffect, useState } from 'react';
import { formatUzs } from '../accounting-panel/utils/formatUzs.js';

function roleSourceLabel(source) {
  return source === 'work' ? 'Ish roli (sklad)' : 'Tizim roli';
}

export default function AdminPayrollOversight({ request }) {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [roleDefaults, setRoleDefaults] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, empRes, sumRes] = await Promise.all([
        request('/admin/payroll-oversight/role-defaults'),
        request('/admin/payroll-oversight/employees'),
        request(`/admin/payroll-oversight/summary?year=${year}&month=${month}`),
      ]);
      const [rolesData, empData, sumData] = await Promise.all([
        rolesRes.json().catch(() => ({})),
        empRes.json().catch(() => ({})),
        sumRes.json().catch(() => ({})),
      ]);
      if (rolesRes.ok) setRoleDefaults(rolesData.role_defaults || []);
      if (empRes.ok) setEmployees(empData.employees || []);
      if (sumRes.ok) setSummary(sumData.summary || null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [request, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="admin-payroll-oversight" aria-labelledby="admin-payroll-oversight-title">
      <div className="admin-payroll-oversight__head">
        <div>
          <h5 id="admin-payroll-oversight-title" style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 600 }}>
            <i className="fas fa-eye" aria-hidden /> Buxgalter ish haqi — kuzatuv
          </h5>
          <p className="muted admin-payroll-oversight__hint" style={{ margin: 0, fontSize: '0.88rem' }}>
            Faqat ko‘rish rejimi. Oylik maosh va avansni faqat buxgalter belgilaydi; superuser taqiqlangan.
          </p>
        </div>
        <button
          type="button"
          className="btn-neo btn-neo-primary"
          onClick={() => void load()}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' }}
        >
          <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} aria-hidden />
          {loading ? 'Yangilanmoqda…' : 'Yangilash'}
        </button>
      </div>

      {summary ? (
        <div className="admin-payroll-oversight__kpi">
          <div className="mini-stat-card mini-stat-card-simple">
            <span>Kutilmoqda</span>
            <strong>{summary.counts?.pending || 0}</strong>
            <em>{formatUzs(summary.amounts?.pending)}</em>
          </div>
          <div className="mini-stat-card mini-stat-card-simple">
            <span>To‘langan</span>
            <strong>{summary.counts?.paid || 0}</strong>
            <em>{formatUzs(summary.amounts?.paid)}</em>
          </div>
          <div className="mini-stat-card mini-stat-card-simple">
            <span>Kechikkan</span>
            <strong>{summary.counts?.overdue || 0}</strong>
            <em>{formatUzs(summary.amounts?.overdue)}</em>
          </div>
        </div>
      ) : null}

      <p className="ap-table-scroll-hint" aria-hidden="true" style={{ marginTop: '0.75rem' }}>
        ← Jadvalni yonga suring →
      </p>
      <div className="admin-payroll-oversight__table-wrap">
        <table className="admin-payroll-oversight__table">
          <thead>
            <tr>
              <th>Manba</th>
              <th>Rol</th>
              <th className="is-num">Oylik maosh</th>
              <th className="is-center">Avans %</th>
            </tr>
          </thead>
          <tbody>
            {roleDefaults.map((rd) => (
              <tr key={`${rd.role_source}-${rd.role_key}`}>
                <td className="muted">{roleSourceLabel(rd.role_source)}</td>
                <td>{rd.role_label || rd.role_key}</td>
                <td className="is-num">{formatUzs(rd.monthly_salary_uzs)}</td>
                <td className="is-center">{Math.round(Number(rd.advance_percent) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!roleDefaults.length && !loading ? <p className="muted admin-payroll-oversight__empty">Rol standartlari hali yo‘q.</p> : null}
      </div>

      <h6 className="admin-payroll-oversight__subhead">Xodimlar bo‘yicha tayinlangan maosh</h6>
      <div className="admin-payroll-oversight__table-wrap">
        <table className="admin-payroll-oversight__table">
          <thead>
            <tr>
              <th>Ism</th>
              <th>Rol</th>
              <th className="is-num">Oylik</th>
              <th className="is-center">Avans %</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.full_name}</td>
                <td className="muted">{e.role_label}</td>
                <td className="is-num">{formatUzs(e.monthly_salary_uzs)}</td>
                <td className="is-center">{Math.round(Number(e.advance_percent) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!employees.length && !loading ? <p className="muted admin-payroll-oversight__empty">Xodimlar ro‘yxati bo‘sh.</p> : null}
      </div>
    </section>
  );
}
