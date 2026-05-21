import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, CalendarDays, CreditCard, Plus, ReceiptText, Search, Send, UserPlus, WalletCards } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, formatDate, formatMoney, statusClass } from './AccountingHome.jsx';

const blankEmployee = {
  full_name: '',
  phone: '',
  position: 'Superuser',
  monthly_salary: '',
  advance_percent: 50,
  telegram_chat_id: '',
  notes: '',
  status: 'active',
};

function paymentDefault(employee, type) {
  const cycle = type === 'advance' ? employee?.current_advance_cycle : employee?.current_salary_cycle;
  return {
    employee_id: employee?.id || '',
    payment_type: type,
    amount: cycle?.remaining_amount || cycle?.gross_amount || '',
    payment_method: 'cash',
    note: '',
  };
}

export default function AccountingPayrollPage() {
  const { request } = useAuth();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [employeeModal, setEmployeeModal] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(blankEmployee);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState(paymentDefault(null, 'salary'));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request('/accounting/portal/payroll');
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Ish haqi ma’lumotlari yuklanmadi.');
        return;
      }
      setPayload(data);
    } catch (e) {
      setError(e?.message || 'Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const employees = useMemo(() => {
    const list = Array.isArray(payload?.employees) ? payload.employees : [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => `${e.full_name} ${e.phone} ${e.position}`.toLowerCase().includes(q));
  }, [payload, query]);

  const openPayment = (employee, type) => {
    setPaymentForm(paymentDefault(employee, type));
    setPaymentModal(true);
  };

  const saveEmployee = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await request('/accounting/portal/employees', {
        method: 'POST',
        body: JSON.stringify({
          ...employeeForm,
          monthly_salary: Number(employeeForm.monthly_salary) || 0,
          advance_percent: Number(employeeForm.advance_percent) || 50,
        }),
      });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Xodim saqlanmadi.');
        return;
      }
      setEmployeeModal(false);
      setEmployeeForm(blankEmployee);
      await load();
    } catch (err) {
      setError(err?.message || 'Tarmoq xatosi.');
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await request('/accounting/portal/salary-payments', {
        method: 'POST',
        body: JSON.stringify({
          ...paymentForm,
          amount: Number(paymentForm.amount) || 0,
        }),
      });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'To‘lov saqlanmadi.');
        return;
      }
      setPaymentModal(false);
      await load();
    } catch (err) {
      setError(err?.message || 'Tarmoq xatosi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="accounting-modern-page">
      <section className="accounting-hero compact">
        <div>
          <span className="accounting-eyebrow">Payroll automation</span>
          <h1>Ish haqi boshqaruvi</h1>
          <p>Superuser xodimlar uchun avans va oy oxiri oyliklarini 15 kunlik sikllar bo‘yicha boshqaring.</p>
          {error && <div className="accounting-alert">{error}</div>}
        </div>
        <div className="accounting-hero-actions">
          <button type="button" className="accounting-btn ghost" onClick={load}>
            <CalendarDays size={17} /> Yangilash
          </button>
          <button type="button" className="accounting-btn primary" onClick={() => setEmployeeModal(true)}>
            <UserPlus size={17} /> Xodim qo‘shish
          </button>
        </div>
      </section>

      <div className="accounting-toolbar">
        <label className="accounting-search">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Xodim, telefon yoki lavozim bo‘yicha qidirish" />
        </label>
        <span className="accounting-muted">{payload?.period?.label || 'Joriy oy'}</span>
      </div>

      <section className="accounting-payroll-grid">
        {loading ? (
          [1, 2, 3].map((i) => <div key={i} className="accounting-skeleton payroll-card" />)
        ) : employees.length ? (
          employees.map((employee, idx) => (
            <motion.article
              key={employee.id}
              className="accounting-employee-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.035 }}
            >
              <div className="accounting-employee-head">
                <div className="accounting-avatar">{String(employee.full_name || '?').slice(0, 1).toUpperCase()}</div>
                <div>
                  <h2>{employee.full_name}</h2>
                  <span>{employee.position || 'Superuser'}</span>
                </div>
                <span className={`accounting-status-chip ${statusClass(employee.status)}`}>{employee.status_label}</span>
              </div>

              <div className="accounting-employee-money">
                <div>
                  <span>Oylik ish haqi</span>
                  <strong>{formatMoney(employee.monthly_salary)}</strong>
                </div>
                <div>
                  <span>Qolgan balans</span>
                  <strong>{formatMoney(employee.remaining_balance)}</strong>
                </div>
              </div>

              <div className="accounting-cycle-mini">
                {(employee.cycles || []).map((cycle) => (
                  <div key={cycle.id}>
                    <span>{cycle.phase_label}</span>
                    <b>{formatMoney(cycle.remaining_amount)}</b>
                    <small>
                      {formatDate(cycle.due_date)} · {cycle.status_label}
                    </small>
                  </div>
                ))}
              </div>

              <dl className="accounting-employee-meta">
                <div>
                  <dt>Oxirgi to‘lov</dt>
                  <dd>
                    {employee.last_payment
                      ? `${formatMoney(employee.last_payment.amount)} · ${formatDate(employee.last_payment.paid_at)}`
                      : 'Hali yo‘q'}
                  </dd>
                </div>
                <div>
                  <dt>Keyingi to‘lov sanasi</dt>
                  <dd>
                    {employee.next_payment_label} · {formatDate(employee.next_payment_date)}
                  </dd>
                </div>
              </dl>

              <div className="accounting-card-actions">
                <button type="button" onClick={() => openPayment(employee, 'advance')}>
                  <Send size={16} /> Avans berish
                </button>
                <button type="button" className="primary" onClick={() => openPayment(employee, 'salary')}>
                  <WalletCards size={16} /> Oylik to‘lash
                </button>
              </div>
            </motion.article>
          ))
        ) : (
          <EmptyState title="Xodim topilmadi" text="Superuser xodimlar avtomatik ulanadi yoki qo‘lda yangi xodim qo‘shing." />
        )}
      </section>

      <section className="accounting-panel">
        <div className="accounting-panel-head">
          <div>
            <span>To‘lov tarixi</span>
            <h2>Oxirgi ish haqi operatsiyalari</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        <div className="accounting-table-wrap">
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Xodim</th>
                <th>Turi</th>
                <th>Summa</th>
                <th>Sana</th>
                <th>Chek</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.history || []).length ? (
                payload.history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.full_name}</td>
                    <td>{row.payment_type_label}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>{formatDate(row.paid_at)}</td>
                    <td>{row.receipt_no || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">To‘lov tarixi hali yo‘q.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {employeeModal && (
        <div className="accounting-modal-backdrop" role="presentation" onClick={() => setEmployeeModal(false)}>
          <form className="accounting-modal" onSubmit={saveEmployee} onClick={(e) => e.stopPropagation()}>
            <div className="accounting-modal-head">
              <h2>Yangi xodim</h2>
              <button type="button" onClick={() => setEmployeeModal(false)}>×</button>
            </div>
            <label>F.I.Sh.<input required value={employeeForm.full_name} onChange={(e) => setEmployeeForm((v) => ({ ...v, full_name: e.target.value }))} /></label>
            <label>Telefon<input value={employeeForm.phone} onChange={(e) => setEmployeeForm((v) => ({ ...v, phone: e.target.value }))} /></label>
            <label>Lavozim<input value={employeeForm.position} onChange={(e) => setEmployeeForm((v) => ({ ...v, position: e.target.value }))} /></label>
            <label>Oylik ish haqi<input type="number" min="0" value={employeeForm.monthly_salary} onChange={(e) => setEmployeeForm((v) => ({ ...v, monthly_salary: e.target.value }))} /></label>
            <label>Avans foizi<input type="number" min="0" max="90" value={employeeForm.advance_percent} onChange={(e) => setEmployeeForm((v) => ({ ...v, advance_percent: e.target.value }))} /></label>
            <label>Telegram chat ID<input value={employeeForm.telegram_chat_id} onChange={(e) => setEmployeeForm((v) => ({ ...v, telegram_chat_id: e.target.value }))} /></label>
            <button className="accounting-btn primary" type="submit" disabled={busy}>
              <Plus size={17} /> Saqlash
            </button>
          </form>
        </div>
      )}

      {paymentModal && (
        <div className="accounting-modal-backdrop" role="presentation" onClick={() => setPaymentModal(false)}>
          <form className="accounting-modal" onSubmit={savePayment} onClick={(e) => e.stopPropagation()}>
            <div className="accounting-modal-head">
              <h2>{paymentForm.payment_type === 'advance' ? 'Avans berish' : 'Oylik to‘lash'}</h2>
              <button type="button" onClick={() => setPaymentModal(false)}>×</button>
            </div>
            <label>Summa<input required type="number" min="1" value={paymentForm.amount} onChange={(e) => setPaymentForm((v) => ({ ...v, amount: e.target.value }))} /></label>
            <label>
              To‘lov usuli
              <select value={paymentForm.payment_method} onChange={(e) => setPaymentForm((v) => ({ ...v, payment_method: e.target.value }))}>
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="bank">Bank o‘tkazmasi</option>
              </select>
            </label>
            <label>Izoh<textarea value={paymentForm.note} onChange={(e) => setPaymentForm((v) => ({ ...v, note: e.target.value }))} /></label>
            <button className="accounting-btn primary" type="submit" disabled={busy}>
              <CreditCard size={17} /> To‘lovni tasdiqlash
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
