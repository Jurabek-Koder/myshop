import React, { useEffect, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ReceiptModal from '../components/ReceiptModal.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz, paymentTypeLabel } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';
import PayrollAdvanceSection from '../components/PayrollAdvanceSection.jsx';

function roleSourceLabel(source) {
  return source === 'work' ? uz.payroll.roleSourceWork : uz.payroll.roleSourceSystem;
}

export default function PayrollPage() {
  const {
    employees,
    roleDefaults,
    cycles,
    payrollSummary,
    loading,
    error,
    setError,
    refreshPayroll,
    syncAllRoles,
    saveRoleDefault,
    saveEmployee,
    generateCycles,
    markCyclePaid,
    fetchReceipt,
  } = useAccountingApp();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editUser, setEditUser] = useState(null);
  const [editRoleDefault, setEditRoleDefault] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [form, setForm] = useState({
    monthly_salary_uzs: '',
    advance_percent: '0.1',
    advance_due_day: '15',
    balance_due_day: '0',
  });
  const [roleForm, setRoleForm] = useState({
    monthly_salary_uzs: '',
    advance_percent: '0.1',
    advance_due_day: '15',
    balance_due_day: '0',
  });

  useEffect(() => {
    refreshPayroll(year, month);
  }, [year, month, refreshPayroll]);

  async function handleSync() {
    await syncAllRoles();
    await refreshPayroll(year, month);
  }

  const [lastGenerate, setLastGenerate] = useState(null);

  async function handleGenerate() {
    const result = await generateCycles(year, month);
    if (result?.skipped) setLastGenerate(result.skipped);
  }

  function payStatusLabel(e) {
    if (e.monthly_paid_this_month) return uz.payroll.blockedPaid;
    if (!e.can_assign_monthly && e.payroll_block_reason === 'balance_not_zero') return uz.payroll.blockedBalance;
    if (e.can_assign_monthly) return uz.payroll.canPay;
    return uz.payroll.blockedPaid;
  }

  async function submitEmployee(e) {
    e.preventDefault();
    if (!editUser) return;
    const body = {
      monthly_salary_uzs: Number(form.monthly_salary_uzs),
      advance_percent: Number(form.advance_percent),
      advance_due_day: Number(form.advance_due_day),
      balance_due_day: Number(form.balance_due_day),
      active: true,
    };
    if (editUser.employee_type === 'work_role') {
      body.work_role_id = editUser.work_role_id;
    } else {
      body.user_id = editUser.user_id;
    }
    await saveEmployee(body);
    setEditUser(null);
  }

  async function submitRoleDefault(e) {
    e.preventDefault();
    if (!editRoleDefault) return;
    await saveRoleDefault({
      role_source: editRoleDefault.role_source,
      role_key: editRoleDefault.role_key,
      role_label: editRoleDefault.role_label,
      monthly_salary_uzs: Number(roleForm.monthly_salary_uzs),
      advance_percent: Number(roleForm.advance_percent),
      advance_due_day: Number(roleForm.advance_due_day),
      balance_due_day: Number(roleForm.balance_due_day),
    });
    setEditRoleDefault(null);
  }

  async function onMarkPaid(id) {
    await markCyclePaid(id, { receipt_ref: `MSH-${id}-${Date.now().toString(36).slice(-6)}` });
    const d = await fetchReceipt(id);
    setReceipt(d.receipt);
  }

  return (
    <div className="ap-page">
      <PageHeader
        title={uz.payroll.title}
        subtitle={uz.payroll.subtitle}
        actions={
          <>
            <select className="ap-select ap-select--compact" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}-oy
                </option>
              ))}
            </select>
            <input className="ap-input ap-input--compact" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '5rem' }} />
            <button type="button" className="ap-btn" onClick={handleSync}>
              {uz.payroll.syncAllRoles}
            </button>
            <button type="button" className="ap-btn ap-btn--primary" onClick={handleGenerate}>
              {uz.payroll.generateCycles}
            </button>
          </>
        }
      />

      <ApAlert error={error} onDismiss={() => setError('')} />
      <ApSpinner show={loading && !employees.length && !roleDefaults.length} />

      {payrollSummary ? (
        <div className="ap-kpi-grid ap-kpi-grid--3">
          <div className="ap-mini-stat">
            <span>{uz.kpi.pending}</span>
            <strong>{payrollSummary.counts?.pending || 0}</strong>
            <em>{formatUzs(payrollSummary.amounts?.pending)}</em>
          </div>
          <div className="ap-mini-stat ap-mini-stat--ok">
            <span>{uz.kpi.paid}</span>
            <strong>{payrollSummary.counts?.paid || 0}</strong>
            <em>{formatUzs(payrollSummary.amounts?.paid)}</em>
          </div>
          <div className="ap-mini-stat ap-mini-stat--danger">
            <span>{uz.kpi.overdue}</span>
            <strong>{payrollSummary.counts?.overdue || 0}</strong>
            <em>{formatUzs(payrollSummary.amounts?.overdue)}</em>
          </div>
        </div>
      ) : null}

      <PayrollAdvanceSection year={year} month={month} />

      <section className="ap-panel">
        <h3>{uz.payroll.roleDefaults}</h3>
        <p className="ap-sub" style={{ marginTop: '0.5rem' }}>
          {uz.payroll.roleDefaultsHint}
        </p>
        <div className="ap-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="ap-table">
            <thead>
              <tr>
                <th>{uz.payroll.columnType}</th>
                <th>{uz.payroll.columnRole}</th>
                <th className="ap-num">Oylik maosh</th>
                <th className="ap-num">Avans %</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {roleDefaults.map((rd) => (
                <tr key={`${rd.role_source}-${rd.role_key}`}>
                  <td className="ap-sub">{roleSourceLabel(rd.role_source)}</td>
                  <td>{rd.role_label || rd.role_key}</td>
                  <td className="ap-num">{formatUzs(rd.monthly_salary_uzs)}</td>
                  <td className="ap-num">{Math.round(Number(rd.advance_percent) * 100)}%</td>
                  <td>
                    <button
                      type="button"
                      className="ap-btn ap-btn--sm"
                      onClick={() => {
                        setEditRoleDefault(rd);
                        setRoleForm({
                          monthly_salary_uzs: rd.monthly_salary_uzs,
                          advance_percent: rd.advance_percent,
                          advance_due_day: String(rd.advance_due_day),
                          balance_due_day: String(rd.balance_due_day),
                        });
                      }}
                    >
                      Tahrirlash
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!roleDefaults.length && !loading ? (
            <p className="ap-empty">{uz.noData} — «{uz.payroll.syncAllRoles}» tugmasini bosing.</p>
          ) : null}
        </div>
      </section>

      <section className="ap-panel">
        <h3>{uz.payroll.employees}</h3>
        <div className="ap-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="ap-table">
            <thead>
              <tr>
                <th>Ism</th>
                <th>Login</th>
                <th>{uz.payroll.columnRole}</th>
                <th>{uz.payroll.columnType}</th>
                <th className="ap-num">{uz.payroll.columnBalance}</th>
                <th>{uz.payroll.columnPayStatus}</th>
                <th className="ap-num">Oylik maosh</th>
                <th className="ap-num">Avans %</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>{e.full_name}</td>
                  <td className="ap-sub">{e.login}</td>
                  <td>{e.role_label}</td>
                  <td className="ap-sub">{e.employee_type === 'work_role' ? uz.payroll.roleSourceWork : uz.payroll.roleSourceSystem}</td>
                  <td className="ap-num">{formatUzs(e.account_balance_uzs)}</td>
                  <td className="ap-sub">{payStatusLabel(e)}</td>
                  <td className="ap-num">{formatUzs(e.monthly_salary_uzs)}</td>
                  <td className="ap-num">{Math.round(Number(e.advance_percent) * 100)}%</td>
                  <td>
                    <button
                      type="button"
                      className="ap-btn ap-btn--sm"
                      onClick={() => {
                        setEditUser(e);
                        setForm({
                          monthly_salary_uzs: e.monthly_salary_uzs,
                          advance_percent: e.advance_percent,
                          advance_due_day: String(e.advance_due_day),
                          balance_due_day: String(e.balance_due_day),
                        });
                      }}
                    >
                      Tahrirlash
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!employees.length && !loading ? <p className="ap-empty">{uz.noData} — rollarni sinxronlang.</p> : null}
        </div>
      </section>

      <section className="ap-panel">
        <h3>{uz.payroll.paymentSchedule}</h3>
        <div className="ap-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="ap-table">
            <thead>
              <tr>
                <th>Xodim</th>
                <th>{uz.payroll.columnRole}</th>
                <th>Turi</th>
                <th>Muddat</th>
                <th className="ap-num">Summa</th>
                <th>Holat</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td className="ap-sub">{c.role_label}</td>
                  <td className="ap-brand">{paymentTypeLabel[c.payment_type] || c.payment_type}</td>
                  <td>{formatDateUz(c.due_date)}</td>
                  <td className="ap-num">{formatUzs(c.amount_uzs)}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="ap-actions">
                    {c.status !== 'paid' ? (
                      <button
                        type="button"
                        className="ap-btn ap-btn--success ap-btn--sm"
                        onClick={() => onMarkPaid(c.id)}
                        title={c.payment_type === 'monthly_balance' ? uz.payroll.blockedBalance : ''}
                      >
                        {uz.payroll.markPaid}
                      </button>
                    ) : (
                      <button type="button" className="ap-btn ap-btn--sm" onClick={async () => setReceipt((await fetchReceipt(c.id)).receipt)}>
                        {uz.payroll.receipt}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cycles.length && !loading ? <p className="ap-empty">{uz.noData} — tsikllarni yarating.</p> : null}
        </div>
      </section>

      {editRoleDefault ? (
        <div className="ap-modal-bg">
          <form className="ap-modal" onSubmit={submitRoleDefault}>
            <h3>
              {editRoleDefault.role_label} ({roleSourceLabel(editRoleDefault.role_source)})
            </h3>
            <p className="ap-sub">Standart — yangi xodimlar uchun</p>
            <div className="ap-form-stack">
              <div className="ap-field">
                <label>{uz.payroll.monthlySalary}</label>
                <input
                  className="ap-input"
                  type="number"
                  min={0}
                  required
                  value={roleForm.monthly_salary_uzs}
                  onChange={(e) => setRoleForm((f) => ({ ...f, monthly_salary_uzs: e.target.value }))}
                />
              </div>
              <div className="ap-field">
                <label>{uz.payroll.advancePercent}</label>
                <input
                  className="ap-input"
                  type="number"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  required
                  value={roleForm.advance_percent}
                  onChange={(e) => setRoleForm((f) => ({ ...f, advance_percent: e.target.value }))}
                />
              </div>
              <div className="ap-field">
                <label>{uz.payroll.advanceDay}</label>
                <input
                  className="ap-input"
                  type="number"
                  min={1}
                  max={28}
                  value={roleForm.advance_due_day}
                  onChange={(e) => setRoleForm((f) => ({ ...f, advance_due_day: e.target.value }))}
                />
              </div>
              <div className="ap-field">
                <label>{uz.payroll.balanceDay}</label>
                <input
                  className="ap-input"
                  type="number"
                  min={0}
                  max={28}
                  value={roleForm.balance_due_day}
                  onChange={(e) => setRoleForm((f) => ({ ...f, balance_due_day: e.target.value }))}
                />
              </div>
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn" onClick={() => setEditRoleDefault(null)}>
                {uz.cancel}
              </button>
              <button type="submit" className="ap-btn ap-btn--primary">
                {uz.save}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editUser ? (
        <div className="ap-modal-bg">
          <form className="ap-modal" onSubmit={submitEmployee}>
            <h3>{editUser.full_name}</h3>
            <p className="ap-sub">
              {editUser.role_label} · {editUser.employee_type === 'work_role' ? uz.payroll.roleSourceWork : uz.payroll.roleSourceSystem}
            </p>
            <div className="ap-form-stack">
              <div className="ap-field">
                <label>{uz.payroll.monthlySalary}</label>
                <input className="ap-input" type="number" min={0} required value={form.monthly_salary_uzs} onChange={(e) => setForm((f) => ({ ...f, monthly_salary_uzs: e.target.value }))} />
              </div>
              <div className="ap-field">
                <label>{uz.payroll.advancePercent}</label>
                <input className="ap-input" type="number" min={0.1} max={0.9} step={0.05} required value={form.advance_percent} onChange={(e) => setForm((f) => ({ ...f, advance_percent: e.target.value }))} />
              </div>
              <div className="ap-field">
                <label>{uz.payroll.advanceDay}</label>
                <input className="ap-input" type="number" min={1} max={28} value={form.advance_due_day} onChange={(e) => setForm((f) => ({ ...f, advance_due_day: e.target.value }))} />
              </div>
              <div className="ap-field">
                <label>{uz.payroll.balanceDay}</label>
                <input className="ap-input" type="number" min={0} max={28} value={form.balance_due_day} onChange={(e) => setForm((f) => ({ ...f, balance_due_day: e.target.value }))} />
              </div>
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn" onClick={() => setEditUser(null)}>
                {uz.cancel}
              </button>
              <button type="submit" className="ap-btn ap-btn--primary">
                {uz.save}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
