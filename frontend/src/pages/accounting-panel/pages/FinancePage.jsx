import React, { useEffect, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';

const EXPENSE_CATS = [
  { value: 'reklama', label: 'Reklama' },
  { value: 'oylik', label: 'Oylik / ish haqi' },
  { value: 'dostavka', label: 'Yetkazib berish' },
  { value: 'soliq', label: 'Soliq' },
  { value: 'boshqa', label: 'Boshqa' },
];

const INCOME_CATS = [
  { value: 'savdo', label: 'Qo‘shimcha savdo' },
  { value: 'xizmat', label: 'Xizmat' },
  { value: 'qaytarilgan', label: 'Qaytarilgan' },
  { value: 'boshqa', label: 'Boshqa' },
];

export default function FinancePage() {
  const { expenses, income, loading, error, setError, refreshFinance, createExpense, deleteExpense, createIncome, deleteIncome } =
    useAccountingApp();
  const [tab, setTab] = useState('expense');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', category: 'boshqa', date: '', comment: '' });

  useEffect(() => {
    refreshFinance();
  }, [refreshFinance]);

  async function submit(e) {
    e.preventDefault();
    const body = {
      title: form.title,
      amount: Number(form.amount),
      category: form.category,
      comment: form.comment || undefined,
    };
    if (tab === 'expense') {
      await createExpense(body);
    } else {
      await createIncome({ ...body, income_date: form.date });
    }
    setOpen(false);
    setForm({ title: '', amount: '', category: 'boshqa', date: new Date().toISOString().slice(0, 10), comment: '' });
  }

  return (
    <div className="ap-page">
      <PageHeader
        title={uz.finance.title}
        subtitle="Kunlik xarajat va qo‘shimcha daromadlar — sof foydaga ta’sir qiladi."
        actions={
          <button type="button" className="ap-btn ap-btn--primary" onClick={() => setOpen(true)}>
            {tab === 'expense' ? uz.finance.addExpense : uz.finance.addIncome}
          </button>
        }
      />

      <div className="ap-tabs">
        <button type="button" className={`ap-tab${tab === 'expense' ? ' ap-tab--active' : ''}`} onClick={() => setTab('expense')}>
          {uz.finance.expenses}
        </button>
        <button type="button" className={`ap-tab${tab === 'income' ? ' ap-tab--active' : ''}`} onClick={() => setTab('income')}>
          {uz.finance.income}
        </button>
      </div>

      <ApAlert error={error} onDismiss={() => setError('')} />
      <ApSpinner show={loading} />

      {tab === 'expense' ? (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Nomi</th>
                <th>Kategoriya</th>
                <th className="ap-num">Summa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateUz(String(row.created_at || '').slice(0, 10))}</td>
                  <td>{row.title}</td>
                  <td className="ap-sub">{row.category}</td>
                  <td className="ap-num">{formatUzs(row.amount)}</td>
                  <td>
                    <button type="button" className="ap-btn ap-btn--sm" onClick={() => window.confirm("O'chirasizmi?") && deleteExpense(row.id)}>
                      {uz.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Nomi</th>
                <th>Kategoriya</th>
                <th className="ap-num">Summa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {income.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateUz(row.income_date)}</td>
                  <td>{row.title}</td>
                  <td className="ap-sub">{row.category}</td>
                  <td className="ap-num ap-brand">{formatUzs(row.amount)}</td>
                  <td>
                    <button type="button" className="ap-btn ap-btn--sm" onClick={() => window.confirm("O'chirasizmi?") && deleteIncome(row.id)}>
                      {uz.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div className="ap-modal-bg">
          <form className="ap-modal" onSubmit={submit}>
            <h3>{tab === 'expense' ? uz.finance.addExpense : uz.finance.addIncome}</h3>
            <div className="ap-form-stack">
              <div className="ap-field">
                <label>Nomi</label>
                <input className="ap-input" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="ap-field">
                <label>Summa</label>
                <input className="ap-input" type="number" min={1} required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              {tab === 'income' ? (
                <div className="ap-field">
                  <label>Sana</label>
                  <input className="ap-input" type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
              ) : null}
              <div className="ap-field">
                <label>Kategoriya</label>
                <select className="ap-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {(tab === 'expense' ? EXPENSE_CATS : INCOME_CATS).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn" onClick={() => setOpen(false)}>
                {uz.cancel}
              </button>
              <button type="submit" className="ap-btn ap-btn--primary">
                {uz.save}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
