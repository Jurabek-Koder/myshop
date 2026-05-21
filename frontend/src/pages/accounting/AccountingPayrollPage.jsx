import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, HandCoins, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createAccountingApi } from './v2/accountingApi.js';
import { useAccountingStore } from './v2/accountingStore.js';
import { formatDate, formatDateTime, formatMoney, statusClass } from './v2/accountingUtils.js';

function EmployeeCard({ employee, onPay }) {
  return (
    <article className="acc-employee-card">
      <header>
        <h4>{employee.full_name}</h4>
        <span className={`acc-status-pill ${statusClass(employee.status)}`}>{employee.status_label_uz}</span>
      </header>
      <dl>
        <div>
          <dt>Oylik ish haqi</dt>
          <dd>{formatMoney(employee.monthly_salary)}</dd>
        </div>
        <div>
          <dt>Oxirgi to‘lov</dt>
          <dd>{employee.last_payment_date ? formatDateTime(employee.last_payment_date) : 'To‘lov yo‘q'}</dd>
        </div>
        <div>
          <dt>Keyingi to‘lov</dt>
          <dd>{employee.next_payment_date ? formatDate(employee.next_payment_date) : '—'}</dd>
        </div>
        <div>
          <dt>Qolgan balans</dt>
          <dd>{formatMoney(employee.remaining_balance)}</dd>
        </div>
      </dl>
      <div className="acc-employee-actions">
        {employee.cycles?.map((cycle) => (
          <button
            key={cycle.id}
            type="button"
            className="acc-btn acc-btn-secondary"
            disabled={Number(cycle.remaining_amount) <= 0}
            onClick={() => onPay(employee, cycle)}
          >
            {cycle.cycle_type === 'advance' ? 'Avans berish' : 'Oylik to‘lash'}
          </button>
        ))}
      </div>
    </article>
  );
}

function PaymentModal({ employee, cycle, onClose, onSubmit, loading }) {
  const [amount, setAmount] = useState(String(cycle?.remaining_amount || ''));
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [note, setNote] = useState('');
  if (!employee || !cycle) return null;

  return (
    <div className="acc-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="acc-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{cycle.cycle_type === 'advance' ? 'Avans to‘lovi' : 'Oylik to‘lovi'}</h3>
        <p>{employee.full_name}</p>
        <label className="acc-field">
          <span>To‘lov summasi</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="1000" />
        </label>
        <label className="acc-field">
          <span>To‘lov usuli</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="bank">Bank</option>
            <option value="cash">Naqd</option>
            <option value="card">Karta</option>
          </select>
        </label>
        <label className="acc-field">
          <span>Izoh</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
        <div className="acc-modal-actions">
          <button type="button" className="acc-btn acc-btn-secondary" onClick={onClose}>
            Bekor qilish
          </button>
          <button
            type="button"
            className="acc-btn acc-btn-primary"
            disabled={loading}
            onClick={() =>
              onSubmit({
                employee_id: employee.id,
                payroll_cycle_id: cycle.id,
                amount,
                payment_method: paymentMethod,
                payment_type: cycle.cycle_type,
                note,
              })
            }
          >
            {loading ? 'Saqlanmoqda...' : 'To‘lash'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountingPayrollPage() {
  const queryClient = useQueryClient();
  const { request } = useAuth();
  const api = useMemo(() => createAccountingApi(request), [request]);
  const payrollSearch = useAccountingStore((s) => s.payrollSearch);
  const setPayrollSearch = useAccountingStore((s) => s.setPayrollSearch);

  const employeesQuery = useQuery({
    queryKey: ['accounting-payroll-employees', payrollSearch],
    queryFn: () => api.getPayrollEmployees(payrollSearch),
  });
  const cycleQuery = useQuery({
    queryKey: ['accounting-payroll-cycles'],
    queryFn: () => api.getPayrollCycles({}),
  });

  const [modalState, setModalState] = useState(null);
  const paymentMutation = useMutation({
    mutationFn: (payload) => api.createPayrollPayment(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-employees'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] });
      setModalState(null);
      if (result?.receipt?.id) {
        window.open(api.receiptPdfUrl(result.receipt.id), '_blank', 'noopener,noreferrer');
      }
    },
  });

  const employees = employeesQuery.data?.employees || [];
  const cycles = cycleQuery.data?.cycles || [];

  return (
    <section className="acc-page">
      <div className="acc-page-heading">
        <div>
          <h1>Ish haqi boshqaruvi</h1>
          <p>15 kunlik avans va oy oxiri to‘lov sikllarini avtomatik nazorat qilish.</p>
        </div>
      </div>

      <div className="acc-toolbar">
        <label className="acc-search">
          <Search size={16} />
          <input
            value={payrollSearch}
            onChange={(e) => setPayrollSearch(e.target.value)}
            placeholder="Xodim nomi bo‘yicha qidirish"
          />
        </label>
      </div>

      <div className="acc-grid-employees">
        {employeesQuery.isLoading && <p className="acc-muted">Xodimlar yuklanmoqda…</p>}
        {employeesQuery.error && <p className="acc-error">{employeesQuery.error.message}</p>}
        {employees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            onPay={(emp, cycle) => setModalState({ employee: emp, cycle })}
          />
        ))}
      </div>

      <article className="acc-panel">
        <header className="acc-panel-head">
          <h3>
            <CalendarClock size={17} />
            Payroll kalendari
          </h3>
        </header>
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th>Xodim</th>
                <th>Davr</th>
                <th>To‘lov turi</th>
                <th>Muddat</th>
                <th>Qolgan summa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cycleQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="acc-muted">
                    Kalendardagi ma’lumotlar yuklanmoqda…
                  </td>
                </tr>
              ) : cycles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="acc-muted">
                    Hozircha payroll sikllari mavjud emas.
                  </td>
                </tr>
              ) : (
                cycles.map((cycle) => (
                  <tr key={cycle.id}>
                    <td>{cycle.employee_name}</td>
                    <td>
                      {formatDate(cycle.period_start)} - {formatDate(cycle.period_end)}
                    </td>
                    <td>{cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi'}</td>
                    <td>{formatDate(cycle.due_date)}</td>
                    <td>{formatMoney(cycle.remaining_amount)}</td>
                    <td>
                      <span className={`acc-status-pill ${statusClass(cycle.status)}`}>{cycle.status_label_uz}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="acc-panel">
        <header className="acc-panel-head">
          <h3>
            <HandCoins size={17} />
            Ish haqi analitikasi
          </h3>
        </header>
        <p className="acc-muted">
          To‘lov qilinganidan so‘ng avtomatik chek yaratiladi, statuslar yangilanadi va Telegram xabari yuboriladi.
        </p>
      </article>

      {modalState && (
        <PaymentModal
          employee={modalState.employee}
          cycle={modalState.cycle}
          loading={paymentMutation.isPending}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => paymentMutation.mutate(payload)}
        />
      )}
    </section>
  );
}

