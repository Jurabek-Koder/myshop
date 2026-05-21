import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createAccountingApi } from './v2/accountingApi.js';
import { formatDateTime, formatMoney } from './v2/accountingUtils.js';

export default function AccountingReceiptsPage() {
  const { request } = useAuth();
  const api = useMemo(() => createAccountingApi(request), [request]);
  const [search, setSearch] = useState('');

  const receiptsQuery = useQuery({
    queryKey: ['accounting-receipts', search],
    queryFn: () => api.getReceipts(search),
  });

  const receipts = receiptsQuery.data?.receipts || [];

  return (
    <section className="acc-page">
      <div className="acc-page-heading">
        <div>
          <h1>Cheklar va kvitansiyalar</h1>
          <p>Ish haqi to‘lovlari bo‘yicha PDF cheklar arxivi.</p>
        </div>
      </div>

      <div className="acc-toolbar">
        <label className="acc-search">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chek raqami yoki xodim ismi" />
        </label>
      </div>

      <article className="acc-panel">
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th>Chek raqami</th>
                <th>Xodim</th>
                <th>To‘lov sanasi</th>
                <th>Summa</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {receiptsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="acc-muted">
                    Cheklar yuklanmoqda…
                  </td>
                </tr>
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="acc-muted">
                    Cheklar topilmadi.
                  </td>
                </tr>
              ) : (
                receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>{receipt.receipt_number}</td>
                    <td>{receipt.employee_name}</td>
                    <td>{formatDateTime(receipt.payment_date || receipt.issued_at)}</td>
                    <td>{formatMoney(receipt.payment_amount)}</td>
                    <td>
                      <a className="acc-btn-link" href={api.receiptPdfUrl(receipt.id)} target="_blank" rel="noreferrer">
                        PDF yuklash
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {receiptsQuery.error && <p className="acc-error">{receiptsQuery.error.message}</p>}
        </div>
      </article>
    </section>
  );
}

