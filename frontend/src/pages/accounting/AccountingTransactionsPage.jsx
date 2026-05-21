import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Funnel,
  Plus,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountingJson, formatCurrencyUz, formatDateUz } from './accountingUtils.js';

function TransactionModal({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="accounting-dialog-overlay"
            onClick={onClose}
            aria-label="Yopish"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="accounting-dialog-content accounting-glass-card"
          >
            <div className="p-5 md:p-6">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default function AccountingTransactionsPage() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [categoryType, setCategoryType] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState({
    direction: 'expense',
    source_type: 'manual',
    expense_category_id: '',
    income_category_id: '',
    title: '',
    description: '',
    amount: '',
    payment_method: 'cash',
    transaction_date: new Date().toISOString().slice(0, 10),
  });

  const transactionsQuery = useQuery({
    queryKey: ['accounting-transactions', search, direction, categoryType],
    queryFn: () =>
      fetchAccountingJson(
        request,
        `/accounting/portal/transactions?search=${encodeURIComponent(search)}&direction=${encodeURIComponent(direction)}&category_type=${encodeURIComponent(categoryType)}`,
      ),
  });

  const createMutation = useMutation({
    mutationFn: (payload) =>
      fetchAccountingJson(request, '/accounting/portal/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setFeedback({
        kind: 'success',
        message: 'Tranzaksiya muvaffaqiyatli saqlandi.',
      });
      setModalOpen(false);
      setForm((current) => ({
        ...current,
        title: '',
        description: '',
        amount: '',
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting-activity'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting-reports'] }),
      ]);
    },
    onError: (error) => {
      setFeedback({
        kind: 'error',
        message: error?.message || 'Tranzaksiya saqlanmadi.',
      });
    },
  });

  const items = transactionsQuery.data?.items || [];
  const categories = transactionsQuery.data?.categories || { expense: [], income: [] };
  const directionTotals = useMemo(
    () => ({
      income: items.filter((item) => item.direction === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      expense: items.filter((item) => item.direction === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0),
    }),
    [items],
  );

  const relevantCategories = form.direction === 'income' ? categories.income : categories.expense;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="accounting-glass-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Jami yozuvlar</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{items.length}</h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="accounting-glass-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Jami kirim</p>
              <h2 className="mt-3 text-3xl font-black text-emerald-600 dark:text-emerald-300">
                {formatCurrencyUz(directionTotals.income)}
              </h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
              <ArrowUpCircle className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="accounting-glass-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Jami chiqim</p>
              <h2 className="mt-3 text-3xl font-black text-rose-600 dark:text-rose-300">
                {formatCurrencyUz(directionTotals.expense)}
              </h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-white">
              <ArrowDownCircle className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="accounting-glass-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Balans</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">
                {formatCurrencyUz(directionTotals.income - directionTotals.expense)}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setModalOpen(true);
                setFeedback(null);
              }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20"
              aria-label="Tranzaksiya qo‘shish"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {feedback ? (
        <section
          className={[
            'accounting-glass-card p-4 text-sm',
            feedback.kind === 'error' ? 'border border-rose-400/30 text-rose-200' : 'border border-emerald-400/30 text-emerald-200',
          ].join(' ')}
        >
          {feedback.message}
        </section>
      ) : null}

      <section className="accounting-glass-card p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="accounting-section-title text-slate-950 dark:text-white">Kirim va chiqimlar jurnali</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Qidiruv, kategoriya va yo‘nalish bo‘yicha filtrlash mumkin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setModalOpen(true);
              setFeedback(null);
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
          >
            <Plus className="h-4 w-4" />
            Yangi tranzaksiya
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr,0.7fr,0.7fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nomi yoki izoh bo‘yicha qidirish"
              className="w-full rounded-2xl border border-slate-200 bg-white/70 py-3 pl-11 pr-4 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white"
            />
          </label>
          <label className="relative">
            <Funnel className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white/70 py-3 pl-11 pr-4 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white"
            >
              <option value="all">Barcha yo‘nalishlar</option>
              <option value="income">Faqat kirim</option>
              <option value="expense">Faqat chiqim</option>
            </select>
          </label>
          <select
            value={categoryType}
            onChange={(event) => setCategoryType(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white"
          >
            <option value="all">Barcha kategoriyalar</option>
            <option value="expense">Faqat xarajat kategoriyalari</option>
            <option value="income">Faqat tushum kategoriyalari</option>
          </select>
        </div>

        <div className="mt-6 space-y-3">
          {transactionsQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-[1.4rem] bg-slate-100/70 dark:bg-slate-900/70" />
            ))
          ) : items.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Filtrlarga mos tranzaksiyalar topilmadi.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-slate-950 dark:text-white">{item.title}</h3>
                      <span
                        className={[
                          'rounded-full px-3 py-1 text-[11px] font-semibold ring-1',
                          item.direction === 'income'
                            ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30'
                            : 'bg-rose-500/15 text-rose-200 ring-rose-400/30',
                        ].join(' ')}
                      >
                        {item.direction === 'income' ? 'Kirim' : 'Chiqim'}
                      </span>
                      <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {item.category_label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description || 'Izoh kiritilmagan'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Sana: {formatDateUz(item.transaction_date)}</span>
                      <span>Usul: {item.payment_method || '—'}</span>
                      <span>Manba: {item.source_type || 'manual'}</span>
                      <span>Holat: {item.status || 'completed'}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <strong
                      className={item.direction === 'income' ? 'text-lg font-black text-emerald-600 dark:text-emerald-300' : 'text-lg font-black text-rose-600 dark:text-rose-300'}
                    >
                      {formatCurrencyUz(item.amount)}
                    </strong>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.created_by_name || 'Tizim foydalanuvchisi'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <TransactionModal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Yangi tranzaksiya</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Xarajat, qo‘lda tushum yoki xizmat daromadini yozing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({
              ...form,
              amount: Number(form.amount),
              expense_category_id: form.direction === 'expense' ? Number(form.expense_category_id) : null,
              income_category_id: form.direction === 'income' ? Number(form.income_category_id) : null,
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Yo‘nalish
              <select
                value={form.direction}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    direction: event.target.value,
                    expense_category_id: '',
                    income_category_id: '',
                  }))
                }
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              >
                <option value="expense">Chiqim</option>
                <option value="income">Kirim</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Manba
              <select
                value={form.source_type}
                onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              >
                {form.direction === 'expense' ? (
                  <>
                    <option value="manual">Qo‘lda xarajat</option>
                    <option value="utility">Kommunal</option>
                    <option value="transport">Transport</option>
                    <option value="shop">Do‘kon xarajati</option>
                  </>
                ) : (
                  <>
                    <option value="manual">Qo‘lda tushum</option>
                    <option value="service">Xizmat daromadi</option>
                    <option value="product_sale">Mahsulot savdosi</option>
                  </>
                )}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Kategoriya
              <select
                value={form.direction === 'income' ? form.income_category_id : form.expense_category_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expense_category_id: current.direction === 'expense' ? event.target.value : '',
                    income_category_id: current.direction === 'income' ? event.target.value : '',
                  }))
                }
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              >
                <option value="">Kategoriyani tanlang</option>
                {relevantCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label_uz}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Sana
              <input
                type="date"
                value={form.transaction_date}
                onChange={(event) => setForm((current) => ({ ...current, transaction_date: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Nomi
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                placeholder="Masalan, Ofis ijarasi"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Summa
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                placeholder="Masalan, 350000"
                required
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            To‘lov usuli
            <select
              value={form.payment_method}
              onChange={(event) => setForm((current) => ({ ...current, payment_method: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
            >
              <option value="cash">Naqd</option>
              <option value="card">Karta</option>
              <option value="bank_transfer">Bank o‘tkazmasi</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Izoh
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-28 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              placeholder="Tranzaksiya tafsilotlari..."
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </TransactionModal>
    </div>
  );
}
