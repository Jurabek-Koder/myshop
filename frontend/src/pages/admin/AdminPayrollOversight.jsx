import React, { useCallback, useEffect, useState } from 'react';
import { formatUzs } from '../accounting-panel/utils/formatUzs.js';

function roleSourceLabel(source) {
  return source === 'work' ? 'Ish roli (sklad)' : 'Tizim roli';
}

function normalizeRoleKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isProtectedPayrollRole(roleKey, roleLabel) {
  const key = normalizeRoleKey(roleKey || roleLabel);
  return key === 'accounting' || key === 'buxgalter';
}

function canEditRoleDefault(row) {
  return !isProtectedPayrollRole(row.role_key, row.role_label);
}

function canEditEmployee(row) {
  if (row.employee_type === 'work_role') {
    return !isProtectedPayrollRole(row.work_role_name, row.role_label);
  }
  return !isProtectedPayrollRole(row.system_role, row.role_label);
}

const emptyForm = {
  monthly_salary_uzs: '',
  advance_percent: '0.1',
  advance_due_day: '15',
  balance_due_day: '0',
};

function PayrollEditModal({ title, subtitle, form, setForm, saving, error, onClose, onSubmit }) {
  return (
    <div className="modal-overlay-neo admin-payroll-modal-overlay" onClick={onClose} role="presentation">
      <form
        className="modal-panel admin-payroll-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-payroll-modal-title"
      >
        <div className="modal-header-neo">
          <div>
            <h4 id="admin-payroll-modal-title">{title}</h4>
            {subtitle ? <p className="muted admin-payroll-modal-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
            <i className="fas fa-times" aria-hidden />
          </button>
        </div>

        {error ? (
          <div className="admin-alert" role="alert">
            {error}
          </div>
        ) : null}

        <div className="admin-payroll-modal-body">
          <label className="admin-payroll-field">
            <span>Oylik maosh (so‘m)</span>
            <input
              className="neo-input"
              type="number"
              min={0}
              step={1000}
              required
              value={form.monthly_salary_uzs}
              onChange={(e) => setForm((f) => ({ ...f, monthly_salary_uzs: e.target.value }))}
            />
          </label>
          <label className="admin-payroll-field">
            <span>Avans foizi (0.1 = 10%)</span>
            <input
              className="neo-input"
              type="number"
              min={0.1}
              max={0.9}
              step={0.05}
              required
              value={form.advance_percent}
              onChange={(e) => setForm((f) => ({ ...f, advance_percent: e.target.value }))}
            />
          </label>
          <div className="admin-payroll-field-row">
            <label className="admin-payroll-field">
              <span>Avans kuni</span>
              <input
                className="neo-input"
                type="number"
                min={1}
                max={28}
                value={form.advance_due_day}
                onChange={(e) => setForm((f) => ({ ...f, advance_due_day: e.target.value }))}
              />
            </label>
            <label className="admin-payroll-field">
              <span>Oylik kuni</span>
              <input
                className="neo-input"
                type="number"
                min={0}
                max={28}
                value={form.balance_due_day}
                onChange={(e) => setForm((f) => ({ ...f, balance_due_day: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="admin-payroll-modal-footer">
          <button type="button" className="btn-neo" onClick={onClose} disabled={saving}>
            Bekor qilish
          </button>
          <button type="submit" className="btn-neo btn-neo-primary" disabled={saving}>
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPayrollOversight({ request }) {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [roleDefaults, setRoleDefaults] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [editRoleDefault, setEditRoleDefault] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [form, setForm] = useState(emptyForm);

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

  function openRoleEdit(row) {
    setSaveError('');
    setEditRoleDefault(row);
    setForm({
      monthly_salary_uzs: row.monthly_salary_uzs ?? '',
      advance_percent: row.advance_percent ?? '0.1',
      advance_due_day: String(row.advance_due_day ?? 15),
      balance_due_day: String(row.balance_due_day ?? 0),
    });
  }

  function openEmployeeEdit(row) {
    setSaveError('');
    setEditEmployee(row);
    setForm({
      monthly_salary_uzs: row.monthly_salary_uzs ?? '',
      advance_percent: row.advance_percent ?? '0.1',
      advance_due_day: String(row.advance_due_day ?? 15),
      balance_due_day: String(row.balance_due_day ?? 0),
    });
  }

  async function handleSyncRoles() {
    setSyncing(true);
    try {
      const res = await request('/admin/payroll-oversight/employees/sync-all', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || 'Sinxronlash bajarilmadi.');
        return;
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function submitRoleDefault(e) {
    e.preventDefault();
    if (!editRoleDefault) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await request('/admin/payroll-oversight/role-defaults', {
        method: 'PUT',
        body: JSON.stringify({
          role_source: editRoleDefault.role_source,
          role_key: editRoleDefault.role_key,
          role_label: editRoleDefault.role_label,
          monthly_salary_uzs: Number(form.monthly_salary_uzs),
          advance_percent: Number(form.advance_percent),
          advance_due_day: Number(form.advance_due_day),
          balance_due_day: Number(form.balance_due_day),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || 'Saqlanmadi.');
        return;
      }
      setEditRoleDefault(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function submitEmployee(e) {
    e.preventDefault();
    if (!editEmployee) return;
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        monthly_salary_uzs: Number(form.monthly_salary_uzs),
        advance_percent: Number(form.advance_percent),
        advance_due_day: Number(form.advance_due_day),
        balance_due_day: Number(form.balance_due_day),
        active: true,
      };
      if (editEmployee.employee_type === 'work_role') {
        body.work_role_id = editEmployee.work_role_id;
      } else {
        body.user_id = editEmployee.user_id;
      }
      const res = await request('/admin/payroll-oversight/employees', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || 'Saqlanmadi.');
        return;
      }
      setEditEmployee(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-payroll-oversight" aria-labelledby="admin-payroll-oversight-title">
      <div className="admin-payroll-oversight__head">
        <div>
          <h5 id="admin-payroll-oversight-title" style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 600 }}>
            <i className="fas fa-coins" aria-hidden /> Ish haqi — maosh tayinlash
          </h5>
          <p className="muted admin-payroll-oversight__hint" style={{ margin: 0, fontSize: '0.88rem' }}>
            Ishchi rollar uchun oylik maosh va avans foizini belgilang. Buxgalter oyligini faqat buxgalter o‘zi belgilaydi.
          </p>
        </div>
        <div className="admin-payroll-oversight__actions">
          <button
            type="button"
            className="btn-neo"
            onClick={() => void handleSyncRoles()}
            disabled={syncing || loading}
          >
            <i className={`fas fa-users-cog ${syncing ? 'fa-spin' : ''}`} aria-hidden />
            {syncing ? 'Sinxron…' : 'Rollarni sinxronlash'}
          </button>
          <button type="button" className="btn-neo btn-neo-primary" onClick={() => void load()} disabled={loading}>
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} aria-hidden />
            {loading ? 'Yangilanmoqda…' : 'Yangilash'}
          </button>
        </div>
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

      <h6 className="admin-payroll-oversight__subhead">Rol bo‘yicha standart maosh</h6>
      <p className="ap-table-scroll-hint" aria-hidden="true">
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
              <th className="is-action">Amal</th>
            </tr>
          </thead>
          <tbody>
            {roleDefaults.map((rd) => (
              <tr key={`${rd.role_source}-${rd.role_key}`}>
                <td className="muted">{roleSourceLabel(rd.role_source)}</td>
                <td>{rd.role_label || rd.role_key}</td>
                <td className="is-num">{formatUzs(rd.monthly_salary_uzs)}</td>
                <td className="is-center">{Math.round(Number(rd.advance_percent) * 100)}%</td>
                <td className="is-action">
                  {canEditRoleDefault(rd) ? (
                    <button type="button" className="btn-neo btn-neo-primary admin-payroll-oversight__edit-btn" onClick={() => openRoleEdit(rd)}>
                      Maosh belgilash
                    </button>
                  ) : (
                    <span className="muted admin-payroll-oversight__locked">Buxgalter</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!roleDefaults.length && !loading ? (
          <p className="muted admin-payroll-oversight__empty">
            Rol standartlari hali yo‘q — «Rollarni sinxronlash» tugmasini bosing.
          </p>
        ) : null}
      </div>

      <h6 className="admin-payroll-oversight__subhead">Xodimlar bo‘yicha tayinlangan maosh</h6>
      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="admin-payroll-oversight__table-wrap">
        <table className="admin-payroll-oversight__table admin-payroll-oversight__table--employees">
          <thead>
            <tr>
              <th>Ism</th>
              <th>Rol</th>
              <th>Manba</th>
              <th className="is-num">Oylik</th>
              <th className="is-center">Avans %</th>
              <th className="is-action">Amal</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.full_name}</td>
                <td className="muted">{e.role_label}</td>
                <td>{e.employee_type === 'work_role' ? 'Ish roli' : 'Tizim'}</td>
                <td className="is-num">{formatUzs(e.monthly_salary_uzs)}</td>
                <td className="is-center">{Math.round(Number(e.advance_percent) * 100)}%</td>
                <td className="is-action">
                  {canEditEmployee(e) ? (
                    <button type="button" className="btn-neo admin-payroll-oversight__edit-btn" onClick={() => openEmployeeEdit(e)}>
                      Tahrirlash
                    </button>
                  ) : (
                    <span className="muted admin-payroll-oversight__locked">Buxgalter</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!employees.length && !loading ? (
          <p className="muted admin-payroll-oversight__empty">Xodimlar ro‘yxati bo‘sh — avval rollarni sinxronlang.</p>
        ) : null}
      </div>

      {editRoleDefault ? (
        <PayrollEditModal
          title={`${editRoleDefault.role_label} — standart maosh`}
          subtitle={roleSourceLabel(editRoleDefault.role_source)}
          form={form}
          setForm={setForm}
          saving={saving}
          error={saveError}
          onClose={() => setEditRoleDefault(null)}
          onSubmit={submitRoleDefault}
        />
      ) : null}

      {editEmployee ? (
        <PayrollEditModal
          title={editEmployee.full_name}
          subtitle={`${editEmployee.role_label} · ${editEmployee.employee_type === 'work_role' ? 'Ish roli' : 'Tizim roli'}`}
          form={form}
          setForm={setForm}
          saving={saving}
          error={saveError}
          onClose={() => setEditEmployee(null)}
          onSubmit={submitEmployee}
        />
      ) : null}
    </section>
  );
}
