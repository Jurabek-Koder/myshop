import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, PlusCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createAccountingApi } from './v2/accountingApi.js';
import { useAccountingStore } from './v2/accountingStore.js';
import { expenseSources, formatDateTime, formatMoney, incomeSources } from './v2/accountingUtils.js';

function TransactionModal({ onClose, onSubmit, loading }) {
  const [transactionType, setTransactionType] = useState('expense');
  const [sourceType, setSourceType] = useState('shop_expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const sourceOptions = transactionType === 'income' ? incomeSources : expenseSources;

  return (
    <div className="acc-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="acc-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Yangi tranzaksiya</h3>
        <label className="acc-field">
          <span>Turi</span>
          <select
            value={transactionType}
            onChange={(e) => {
              const next = e.target.value;
              setTransactionType(next);
              setSourceType(next === 'income' ? 'product_sale' : 'shop_expense');
            }}
          >
            <option value="income">Tushum</option>
            <option value="expense">Xarajat</option>
          </select>
        </label>
        <label className="acc-field">
          <span>Kategoriya</span>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            {sourceOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="acc-field">
          <span>Summa</span>
          <input type="number" min="0" step="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="acc-field">
          <span>Izoh</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
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
                transaction_type: transactionType,
                source_type: sourceType,
                amount,
                note,
              })
            }
          >
            {loading ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountingTransactionsPage() {
  const queryClient = useQueryClient();
  const { request } = useAuth();
  const api = useMemo(() => createAccountingApi(request), [request]);

  const transactionFilter = useAccountingStore((s) => s.transactionFilter);
  const setTransactionFilter = useAccountingStore((s) => s.setTransactionFilter);
  const [modalOpen, setModalOpen] = useState(false);

  const txQuery = useQuery({
    queryKey: ['accounting-transactions', transactionFilter],
    queryFn: () => api.getTransactions(transactionFilter),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.createTransaction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-reports-summary'] });
      setModalOpen(false);
    },
  });

  const transactions = txQuery.data?.transactions || [];
  const csvUrl = api.exportTransactionsCsv({
    from: transactionFilter.from,
    to: transactionFilter.to,
  });

  return (
    <section className="acc-page">
      <div className="acc-page-heading">
        <div>
          <h1>Tushum va xarajatlar</h1>
          <p>Kundalik moliyaviy operatsiyalarni yuritish, filtrlash va eksport qilish.</p>
        </div>
        <div className="acc-actions-inline">
          <a className="acc-btn acc-btn-secondary" href={csvUrl}>
            <Download size={16} />
            CSV eksport
          </a>
          <button type="button" className="acc-btn acc-btn-primary" onClick={() => setModalOpen(true)}>
            <PlusCircle size={16} />
            Tranzaksiya qo‘shish
          </button>
        </div>
      </div>

      <div className="acc-filters">
        <select value={transactionFilter.type} onChange={(e) => setTransactionFilter({ type: e.target.value })}>
          <option value="">Barcha turlar</option>
          <option value="income">Tushum</option>
          <option value="expense">Xarajat</option>
        </select>
        <select value={transactionFilter.source} onChange={(e) => setTransactionFilter({ source: e.target.value })}>
          <option value="">Barcha kategoriyalar</option>
          {[...incomeSources, ...expenseSources].map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Izoh bo‘yicha qidiruv"
          value={transactionFilter.search}
          onChange={(e) => setTransactionFilter({ search: e.target.value })}
        />
        <input type="date" value={transactionFilter.from} onChange={(e) => setTransactionFilter({ from: e.target.value })} />
        <input type="date" value={transactionFilter.to} onChange={(e) => setTransactionFilter({ to: e.target.value })} />
      </div>

      <article className="acc-panel">
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Turi</th>
                <th>Manba</th>
                <th>Izoh</th>
                <th>Summa</th>
              </tr>
            </thead>
            <tbody>
              {txQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="acc-muted">
                    Tranzaksiyalar yuklanmoqda…
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="acc-muted">
                    Tranzaksiyalar topilmadi.
                  </td>
                </tr>
              ) : (
                transactions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.transaction_date)}</td>
                    <td>{row.transaction_type === 'income' ? 'Tushum' : 'Xarajat'}</td>
                    <td>{row.income_category_name || row.expense_category_name || row.source_type}</td>
                    <td>{row.note || '—'}</td>
                    <td className={row.transaction_type === 'income' ? 'acc-amount-pos' : 'acc-amount-neg'}>
                      {formatMoney(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {txQuery.error && <p className="acc-error">{txQuery.error.message}</p>}
        </div>
      </article>

      {modalOpen && (
        <TransactionModal
          loading={createMutation.isPending}
          onClose={() => setModalOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      )}
    </section>
  );
}

