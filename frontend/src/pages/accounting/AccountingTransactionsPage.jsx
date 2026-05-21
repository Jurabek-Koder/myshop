import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Filter, Plus, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, formatDate, formatMoney } from './AccountingHome.jsx';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const blankForm = {
  type: 'expense',
  title: '',
  category_code: '',
  amount: '',
  transaction_date: today(),
  note: '',
};

export default function AccountingTransactionsPage() {
  const { request } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({});
  const [categories, setCategories] = useState({ income_categories: [], expense_categories: [] });
  const [filters, setFilters] = useState({ type: '', q: '' });
  const [form, setForm] = useState(blankForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCategories = useCallback(async () => {
    const res = await request('/accounting/portal/categories');
    const data = res.ok ? await res.json() : {};
    if (res.ok) setCategories(data);
  }, [request]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filters.type) qs.set('type', filters.type);
      if (filters.q) qs.set('q', filters.q);
      const res = await request(`/accounting/portal/transactions?${qs.toString()}`);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Operatsiyalar yuklanmadi.');
        return;
      }
      setTransactions(data.transactions || []);
      setSummary(data.summary || {});
    } catch (e) {
      setError(e?.message || 'Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request, filters]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const activeCategories = useMemo(
    () => (form.type === 'income' ? categories.income_categories || [] : categories.expense_categories || []),
    [form.type, categories],
  );

  useEffect(() => {
    setForm((v) => {
      const list = v.type === 'income' ? categories.income_categories || [] : categories.expense_categories || [];
      if (v.category_code && list.some((c) => c.code === v.category_code)) return v;
      return { ...v, category_code: list[0]?.code || '' };
    });
  }, [categories, form.type]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await request('/accounting/portal/transactions', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) || 0 }),
      });
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Operatsiya saqlanmadi.');
        return;
      }
      setModalOpen(false);
      setForm(blankForm);
      await loadTransactions();
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
          <span className="accounting-eyebrow">Ledger</span>
          <h1>Xarajat va tushumlar</h1>
          <p>Mahsulot savdolari, qo‘lda kiritilgan tushumlar va biznes xarajatlarini kategoriyalar bo‘yicha yuriting.</p>
          {error && <div className="accounting-alert">{error}</div>}
        </div>
        <button type="button" className="accounting-btn primary" onClick={() => setModalOpen(true)}>
          <Plus size={17} /> Operatsiya qo‘shish
        </button>
      </section>

      <section className="accounting-kpi-grid three">
        <div className="accounting-kpi-card tone-emerald">
          <div className="accounting-kpi-icon"><ArrowUpCircle size={22} /></div>
          <div><p>Tushum</p><strong>{formatMoney(summary.income)}</strong><span>Tanlangan filtr bo‘yicha</span></div>
        </div>
        <div className="accounting-kpi-card tone-rose">
          <div className="accounting-kpi-icon"><ArrowDownCircle size={22} /></div>
          <div><p>Xarajat</p><strong>{formatMoney(summary.expenses)}</strong><span>Kategoriyalangan xarajatlar</span></div>
        </div>
        <div className="accounting-kpi-card tone-blue">
          <div className="accounting-kpi-icon"><Filter size={22} /></div>
          <div><p>Balans</p><strong>{formatMoney(summary.net)}</strong><span>{summary.count || 0} ta operatsiya</span></div>
        </div>
      </section>

      <div className="accounting-toolbar">
        <label className="accounting-search">
          <Search size={17} />
          <input value={filters.q} onChange={(e) => setFilters((v) => ({ ...v, q: e.target.value }))} placeholder="Nomi yoki izoh bo‘yicha qidirish" />
        </label>
        <select value={filters.type} onChange={(e) => setFilters((v) => ({ ...v, type: e.target.value }))}>
          <option value="">Barchasi</option>
          <option value="income">Tushum</option>
          <option value="expense">Xarajat</option>
        </select>
      </div>

      <section className="accounting-panel">
        <div className="accounting-table-wrap">
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Nomi</th>
                <th>Turi</th>
                <th>Kategoriya</th>
                <th>Summa</th>
                <th>Sana</th>
                <th>Chek</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6">Yuklanmoqda...</td></tr>
              ) : transactions.length ? (
                transactions.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.title}</strong><span>{row.note || ''}</span></td>
                    <td>{row.type === 'income' ? 'Tushum' : 'Xarajat'}</td>
                    <td>{row.category_name || 'Boshqa'}</td>
                    <td className={row.type === 'income' ? 'amount-positive' : 'amount-negative'}>{formatMoney(row.amount)}</td>
                    <td>{formatDate(row.transaction_date)}</td>
                    <td>{row.receipt_no || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6"><EmptyState title="Operatsiya yo‘q" text="Yangi tushum yoki xarajat qo‘shing." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="accounting-modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <form className="accounting-modal" onSubmit={save} onClick={(e) => e.stopPropagation()}>
            <div className="accounting-modal-head">
              <h2>Yangi operatsiya</h2>
              <button type="button" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <label>
              Turi
              <select value={form.type} onChange={(e) => setForm((v) => ({ ...v, type: e.target.value, category_code: '' }))}>
                <option value="expense">Xarajat</option>
                <option value="income">Tushum</option>
              </select>
            </label>
            <label>Nomi<input required value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></label>
            <label>
              Kategoriya
              <select value={form.category_code} onChange={(e) => setForm((v) => ({ ...v, category_code: e.target.value }))}>
                {activeCategories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <label>Summa<input required type="number" min="1" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} /></label>
            <label>Sana<input type="date" value={form.transaction_date} onChange={(e) => setForm((v) => ({ ...v, transaction_date: e.target.value }))} /></label>
            <label>Izoh<textarea value={form.note} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} /></label>
            <button className="accounting-btn primary" type="submit" disabled={busy}>
              <Plus size={17} /> Saqlash
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
