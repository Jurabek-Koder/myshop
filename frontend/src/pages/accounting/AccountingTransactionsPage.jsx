import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Search } from 'lucide-react';
import { ActionModal, EmptyState, GlassCard, PrimaryButton, SectionTitle, SecondaryButton } from './AccountingUi.jsx';
import { useAccountingApi } from './AccountingApi.js';
import { formatDate, formatMoney } from './accountingFormat.js';

export default function AccountingTransactionsPage() {
  const api = useAccountingApi();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ q: '', type: '', category_key: '', from: '', to: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    transaction_type: 'expense',
    category_key: '',
    source_type: '',
    amount: '',
    note: '',
  });

  const categoriesQuery = useQuery({
    queryKey: ['accounting-categories'],
    queryFn: api.getCategories,
  });

  const transactionsQuery = useQuery({
    queryKey: ['accounting-transactions', filters],
    queryFn: () => api.getTransactions(filters),
  });

  const createMutation = useMutation({
    mutationFn: api.createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] });
      setFormOpen(false);
      setForm((prev) => ({ ...prev, amount: '', note: '' }));
    },
  });

  const categories = useMemo(() => {
    if (form.transaction_type === 'income') return categoriesQuery.data?.income_categories || [];
    return categoriesQuery.data?.expense_categories || [];
  }, [categoriesQuery.data, form.transaction_type]);

  const submit = (event) => {
    event.preventDefault();
    createMutation.mutate({
      ...form,
      source_type: form.source_type || form.category_key,
      amount: Number(form.amount),
    });
  };

  const transactions = transactionsQuery.data?.transactions || [];

  return (
    <div className="space-y-4 md:space-y-6">
      <SectionTitle
        title="Daromad va xarajatlar"
        subtitle="Kunlik log, kategoriyalar, izohlar, filter va qidiruv bilan professional accounting tracker."
        rightSlot={<PrimaryButton onClick={() => setFormOpen(true)}>Yangi tranzaksiya</PrimaryButton>}
      />

      <GlassCard>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs text-slate-300">
            Qidiruv
            <div className="flex items-center rounded-xl border border-white/15 bg-white/5 px-2">
              <Search size={14} className="text-slate-400" />
              <input
                value={filters.q}
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Izoh yoki manba"
                className="w-full bg-transparent px-2 py-2 text-sm text-slate-100 outline-none"
              />
            </div>
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            Turi
            <select
              value={filters.type}
              onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-sm text-slate-100"
            >
              <option value="">Barchasi</option>
              <option value="income">Daromad</option>
              <option value="expense">Xarajat</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            Boshlanish sana
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            Tugash sana
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="flex items-end gap-2">
            <SecondaryButton onClick={() => transactionsQuery.refetch()} className="w-full">
              <Filter size={14} />
              Filtrlash
            </SecondaryButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title="Tranzaksiyalar jadvali" subtitle="Responsive ko‘rinishda daromad/xarajat yozuvlari." />
        {transactions.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300">
                  <th className="px-2 py-2">Sana</th>
                  <th className="px-2 py-2">Kategoriya</th>
                  <th className="px-2 py-2">Manba</th>
                  <th className="px-2 py-2">Izoh</th>
                  <th className="px-2 py-2 text-right">Summa</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-t border-white/10 text-slate-100">
                    <td className="px-2 py-2">{formatDate(transaction.transaction_date)}</td>
                    <td className="px-2 py-2">{transaction.category_label}</td>
                    <td className="px-2 py-2">
                      {transaction.transaction_type === 'income' ? 'Daromad' : 'Xarajat'} · {transaction.source_type}
                    </td>
                    <td className="px-2 py-2">{transaction.note || '—'}</td>
                    <td
                      className={`px-2 py-2 text-right font-semibold ${
                        transaction.transaction_type === 'income' ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {transaction.transaction_type === 'income' ? '+' : '-'}
                      {formatMoney(transaction.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Tranzaksiyalar topilmadi" description="Filterlarni o‘zgartirib qayta urinib ko‘ring." />
        )}
      </GlassCard>

      <ActionModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Yangi moliyaviy yozuv"
        description="Daromad yoki xarajatni kundalik jurnalga qo‘shing."
      >
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-200">
              Tranzaksiya turi
              <select
                value={form.transaction_type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, transaction_type: event.target.value, category_key: '' }))
                }
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              >
                <option value="expense">Xarajat</option>
                <option value="income">Daromad</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-200">
              Kategoriya
              <select
                value={form.category_key}
                onChange={(event) => setForm((prev) => ({ ...prev, category_key: event.target.value }))}
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
                required
              >
                <option value="">Tanlang</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name_key}>
                    {category.label_uz}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1 text-sm text-slate-200">
            Summa
            <input
              type="number"
              min="0"
              step="1000"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              required
            />
          </label>
          <label className="space-y-1 text-sm text-slate-200">
            Izoh
            <textarea
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              className="h-24 w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
            />
          </label>
          {createMutation.error ? <p className="text-sm text-rose-300">{createMutation.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setFormOpen(false)}>
              Bekor qilish
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </PrimaryButton>
          </div>
        </form>
      </ActionModal>
    </div>
  );
}
