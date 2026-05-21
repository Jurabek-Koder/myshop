import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, Plus, X, TrendingUp, TrendingDown, Filter,
  Search, Trash2, Calendar, Download
} from 'lucide-react';
import { useAccountingApi, useAccountingMutation } from './useAccountingApi';

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
}

function TransactionModal({ onClose, onSaved, expenseCategories, incomeCategories }) {
  const { mutate, loading, error } = useAccountingMutation();
  const [form, setForm] = useState({
    type: 'expense',
    category_id: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const categories = form.type === 'expense' ? expenseCategories : incomeCategories;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await mutate('/transactions', 'POST', {
        ...form,
        category_id: form.category_id ? parseInt(form.category_id) : null,
      });
      onSaved();
    } catch (e) { /* handled */ }
  };

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Yangi tranzaksiya</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => { setField('type', 'expense'); setField('category_id', ''); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                form.type === 'expense'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <TrendingDown className="w-4 h-4 inline mr-1" />Xarajat
            </button>
            <button
              type="button"
              onClick={() => { setField('type', 'income'); setField('category_id', ''); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                form.type === 'income'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline mr-1" />Daromad
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kategoriya</label>
            <select
              value={form.category_id}
              onChange={(e) => setField('category_id', e.target.value)}
              className="input-field"
            >
              <option value="">Tanlang...</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Summa *</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setField('amount', e.target.value)}
              className="input-field"
              required
              placeholder="500000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Izoh</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              className="input-field"
              placeholder="Tranzaksiya tavsifi..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sana</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField('date', e.target.value)}
              className="input-field"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">{error}</p>
          )}

          <button type="submit" disabled={loading} className={`w-full ${form.type === 'expense' ? 'btn-danger' : 'btn-success'}`}>
            {loading ? '...' : 'Saqlash'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function TransactionsPage() {
  const [showModal, setShowModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (dateFrom) params.set('start_date', dateFrom);
    if (dateTo) params.set('end_date', dateTo);
    return params.toString() ? `?${params.toString()}` : '';
  }, [typeFilter, dateFrom, dateTo]);

  const { data, loading, refetch } = useAccountingApi(`/transactions${queryParams}`);
  const { data: expCats } = useAccountingApi('/categories/expense');
  const { data: incCats } = useAccountingApi('/categories/income');
  const { mutate } = useAccountingMutation();

  const transactions = (data?.transactions || []).filter(tx =>
    !searchTerm || tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.category_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const handleDelete = async (id) => {
    if (!confirm('Bu tranzaksiyani o\'chirmoqchimisiz?')) return;
    try {
      await mutate(`/transactions/${id}`, 'DELETE');
      refetch();
    } catch (e) { /* handled */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20 lg:pb-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Daromad va xarajatlar</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Barcha moliyaviy operatsiyalar</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Yangi tranzaksiya</span>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Daromad</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">{formatMoney(totalIncome)} so'm</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Xarajat</span>
          </div>
          <p className="text-xl font-bold text-red-600">{formatMoney(totalExpense)} so'm</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpDown className="w-4 h-4 text-primary-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Sof foyda</span>
          </div>
          <p className={`text-xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatMoney(totalIncome - totalExpense)} so'm
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="">Barchasi</option>
              <option value="income">Daromad</option>
              <option value="expense">Xarajat</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field w-auto"
              placeholder="Dan"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field w-auto"
              placeholder="Gacha"
            />
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <ArrowUpDown className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Tranzaksiyalar topilmadi</p>
            <button onClick={() => setShowModal(true)} className="btn-primary mt-4 text-sm">
              Birinchi tranzaksiyani qo'shing
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Turi</th>
                    <th>Kategoriya</th>
                    <th>Tavsif</th>
                    <th>Summa</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="text-gray-500 whitespace-nowrap">{tx.date}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                          tx.type === 'income'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                        }`}>
                          {tx.type === 'income' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {tx.type === 'income' ? 'Daromad' : 'Xarajat'}
                        </span>
                      </td>
                      <td className="text-gray-600 dark:text-gray-300">{tx.category_name || '-'}</td>
                      <td className="text-gray-900 dark:text-white max-w-[200px] truncate">{tx.description || '-'}</td>
                      <td className={`font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)} so'm
                      </td>
                      <td>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2 p-4">
              {transactions.map((tx) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      tx.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-red-100 dark:bg-red-500/20'
                    }`}>
                      {tx.type === 'income' ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[150px]">
                        {tx.description || tx.category_name || '-'}
                      </p>
                      <p className="text-xs text-gray-500">{tx.date}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                  </span>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <TransactionModal
            onClose={() => setShowModal(false)}
            onSaved={() => { setShowModal(false); refetch(); }}
            expenseCategories={expCats?.categories || []}
            incomeCategories={incCats?.categories || []}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
