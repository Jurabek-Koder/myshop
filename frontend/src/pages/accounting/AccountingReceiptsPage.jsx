import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, formatDate, formatMoney } from './AccountingHome.jsx';

function kindLabel(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'advance') return 'Avans';
  if (k === 'salary') return 'Oylik ish haqi';
  if (k === 'income') return 'Tushum';
  if (k === 'expense') return 'Xarajat';
  return 'Chek';
}

export default function AccountingReceiptsPage() {
  const { request } = useAuth();
  const [receipts, setReceipts] = useState([]);
  const [filters, setFilters] = useState({ kind: '', q: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filters.kind) qs.set('kind', filters.kind);
      if (filters.q) qs.set('q', filters.q);
      const res = await request(`/accounting/portal/receipts?${qs.toString()}`);
      const data = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(data.error || 'Cheklar yuklanmadi.');
        return;
      }
      setReceipts(data.receipts || []);
    } catch (e) {
      setError(e?.message || 'Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPdf = async (id) => {
    try {
      const res = await request(`/accounting/portal/receipts/${id}/pdf`, { headers: { Accept: 'application/pdf' } });
      if (!res.ok) {
        setError('PDF yuklab olinmadi.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(e?.message || 'PDF yuklab olinmadi.');
    }
  };

  return (
    <div className="accounting-modern-page">
      <section className="accounting-hero compact">
        <div>
          <span className="accounting-eyebrow">Receipts</span>
          <h1>Cheklar</h1>
          <p>Ish haqi, avans, tushum va xarajat cheklarining PDF arxivini boshqaring.</p>
          {error && <div className="accounting-alert">{error}</div>}
        </div>
      </section>

      <div className="accounting-toolbar">
        <label className="accounting-search">
          <Search size={17} />
          <input value={filters.q} onChange={(e) => setFilters((v) => ({ ...v, q: e.target.value }))} placeholder="Chek raqami yoki xodim bo‘yicha qidirish" />
        </label>
        <select value={filters.kind} onChange={(e) => setFilters((v) => ({ ...v, kind: e.target.value }))}>
          <option value="">Barcha cheklar</option>
          <option value="salary">Oylik ish haqi</option>
          <option value="advance">Avans</option>
          <option value="income">Tushum</option>
          <option value="expense">Xarajat</option>
        </select>
      </div>

      <section className="accounting-receipt-grid">
        {loading ? (
          [1, 2, 3, 4].map((i) => <div key={i} className="accounting-skeleton receipt-card" />)
        ) : receipts.length ? (
          receipts.map((receipt) => {
            const payload = receipt.payload || {};
            const amount = payload.amount || receipt.salary_amount || receipt.transaction_amount || 0;
            return (
              <article key={receipt.id} className="accounting-receipt-card">
                <div className="accounting-receipt-icon"><FileText size={22} /></div>
                <div>
                  <span>{kindLabel(receipt.kind)}</span>
                  <h2>{receipt.receipt_no}</h2>
                  <p>{receipt.employee_name || receipt.transaction_title || payload.title || 'MyShop operatsiyasi'}</p>
                </div>
                <strong>{formatMoney(amount)}</strong>
                <small>{formatDate(receipt.created_at)}</small>
                <button type="button" onClick={() => openPdf(receipt.id)}>
                  <Download size={16} /> PDF yuklab olish
                </button>
              </article>
            );
          })
        ) : (
          <EmptyState title="Chek topilmadi" text="To‘lov yoki moliyaviy operatsiya yaratilganda chek avtomatik chiqadi." />
        )}
      </section>
    </div>
  );
}
