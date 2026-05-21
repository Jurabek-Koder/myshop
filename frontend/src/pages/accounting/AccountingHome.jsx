import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownCircle, ArrowUpCircle, CircleDollarSign, HandCoins, PlusCircle } from 'lucide-react';
import { useAccountingApi } from './AccountingApi.js';
import { ActionModal, GlassCard, PrimaryButton, SecondaryButton, SectionTitle } from './AccountingUi.jsx';
import { formatDateTime, formatMoney, statusMeta } from './accountingFormat.js';

const QUICK_ACTIONS = [
  { key: 'expense', label: 'Yangi xarajat qo‘shish', icon: PlusCircle },
  { key: 'salary', label: 'Oylik to‘lash', icon: CircleDollarSign },
  { key: 'advance', label: 'Avans berish', icon: HandCoins },
];

function metricCards(kpis = {}) {
  return [
    { key: 'income', title: 'Umumiy tushum', value: kpis.total_income || 0, tone: 'text-sky-300', icon: ArrowUpCircle },
    { key: 'expense', title: 'Umumiy xarajatlar', value: kpis.total_expense || 0, tone: 'text-rose-300', icon: ArrowDownCircle },
    { key: 'profit', title: 'Sof foyda', value: kpis.net_profit || 0, tone: 'text-emerald-300', icon: CircleDollarSign },
    {
      key: 'payroll',
      title: 'Oyliklar uchun jami xarajat',
      value: kpis.total_payroll_expense || 0,
      tone: 'text-indigo-200',
      icon: HandCoins,
    },
  ];
}

export default function AccountingHome() {
  const api = useAccountingApi();
  const queryClient = useQueryClient();
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    transaction_type: 'expense',
    source_type: 'shop_expense',
    category_key: 'shop_expense',
    amount: '',
    note: '',
  });
  const [payrollForm, setPayrollForm] = useState({
    employee_id: '',
    payment_type: 'advance',
    amount: '',
    note: '',
  });

  const dashboardQuery = useQuery({
    queryKey: ['accounting-dashboard'],
    queryFn: () => api.getDashboard(30),
  });
  const employeesQuery = useQuery({
    queryKey: ['accounting-payroll-employees'],
    queryFn: api.getPayrollEmployees,
  });
  const categoriesQuery = useQuery({
    queryKey: ['accounting-categories'],
    queryFn: api.getCategories,
  });

  const createTransactionMutation = useMutation({
    mutationFn: api.createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-transactions'] });
      setTransactionOpen(false);
      setTransactionForm((prev) => ({ ...prev, amount: '', note: '' }));
    },
  });

  const createPayrollMutation = useMutation({
    mutationFn: api.createPayrollPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-employees'] });
      setPayrollOpen(false);
      setPayrollForm((prev) => ({ ...prev, amount: '', note: '' }));
    },
  });

  const dashboard = dashboardQuery.data || {};
  const cards = metricCards(dashboard.kpis);
  const activities = Array.isArray(dashboard.activity_feed) ? dashboard.activity_feed : [];
  const trend = Array.isArray(dashboard.monthly_trends) ? dashboard.monthly_trends : [];

  const selectedCategories = useMemo(() => {
    if (transactionForm.transaction_type === 'income') return categoriesQuery.data?.income_categories || [];
    return categoriesQuery.data?.expense_categories || [];
  }, [categoriesQuery.data, transactionForm.transaction_type]);

  const submitTransaction = (event) => {
    event.preventDefault();
    createTransactionMutation.mutate({
      ...transactionForm,
      amount: Number(transactionForm.amount),
      source_type: String(transactionForm.source_type || '').trim().toLowerCase(),
    });
  };

  const submitPayroll = (event) => {
    event.preventDefault();
    createPayrollMutation.mutate({
      ...payrollForm,
      employee_id: Number(payrollForm.employee_id),
      amount: payrollForm.amount ? Number(payrollForm.amount) : undefined,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <SectionTitle
        title="Boshqaruv paneli"
        subtitle="Real vaqtda daromad, xarajat, ish haqi va moliyaviy faoliyat nazorati."
        rightSlot={
          <SecondaryButton type="button" onClick={() => dashboardQuery.refetch()}>
            Yangilash
          </SecondaryButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GlassCard>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-300">{card.title}</p>
                    <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{formatMoney(card.value)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200">
                    <Icon size={18} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <GlassCard>
          <SectionTitle title="Moliyaviy o‘sish grafigi" subtitle="Daromad, xarajat va foyda trendi (oylar kesimida)." />
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="income-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expense-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="month_key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => `${Math.round(value / 1_000_000)}M`} />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Area type="monotone" dataKey="income" stroke="#22d3ee" fill="url(#income-gradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#fb7185" fill="url(#expense-gradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Tezkor amallar" subtitle="Bir klik bilan asosiy buxgalteriya vazifalari." />
          <div className="space-y-2.5">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              const onClick =
                action.key === 'expense' ? () => setTransactionOpen(true) : () => setPayrollOpen(true);
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={onClick}
                  className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-white/10"
                >
                  <span>{action.label}</span>
                  <Icon size={16} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['accounting-report-summary'] })}
              className="flex w-full items-center justify-between rounded-xl border border-indigo-300/20 bg-indigo-500/10 px-3 py-2.5 text-left text-sm text-indigo-100 hover:bg-indigo-500/20"
            >
              <span>Hisobot chiqarish</span>
              <PlusCircle size={16} />
            </button>
          </div>

          <div className="mt-5 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-medium text-white">Real-time ish haqi statusi</p>
            <p className="text-xs text-slate-300">To‘landi: {dashboard.payroll_status?.paid || 0}</p>
            <p className="text-xs text-slate-300">Kutilmoqda: {dashboard.payroll_status?.pending || 0}</p>
            <p className="text-xs text-rose-300">Kechikkan: {dashboard.payroll_status?.overdue || 0}</p>
            <p className="text-xs text-amber-300">3 kun ichida muddat: {dashboard.due_soon_count || 0}</p>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <SectionTitle title="So‘nggi faoliyatlar" subtitle="Tranzaksiyalar, ish haqi to‘lovlari va tizim harakati." />
        <div className="space-y-2">
          {activities.length ? (
            activities.map((item) => {
              const isIncome = item.direction === 'income';
              const meta = statusMeta(item.status);
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-xs text-slate-300">{item.note || 'Izoh kiritilmagan'}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isIncome ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {isIncome ? '+' : '-'}
                      {formatMoney(item.amount)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(item.happened_at)}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs ${meta.className}`}>{meta.label}</span>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-white/20 px-3 py-4 text-center text-sm text-slate-300">
              Hozircha faoliyatlar mavjud emas.
            </p>
          )}
        </div>
      </GlassCard>

      <ActionModal
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        title="Yangi tranzaksiya qo‘shish"
        description="Daromad yoki xarajat yozuvini kiriting."
      >
        <form className="space-y-3" onSubmit={submitTransaction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-200">
              Turi
              <select
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
                value={transactionForm.transaction_type}
                onChange={(event) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    transaction_type: event.target.value,
                    category_key: '',
                  }))
                }
              >
                <option value="expense">Xarajat</option>
                <option value="income">Daromad</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-200">
              Kategoriya
              <select
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
                value={transactionForm.category_key}
                onChange={(event) =>
                  setTransactionForm((prev) => ({ ...prev, category_key: event.target.value, source_type: event.target.value }))
                }
                required
              >
                <option value="">Tanlang</option>
                {selectedCategories.map((category) => (
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
              value={transactionForm.amount}
              onChange={(event) => setTransactionForm((prev) => ({ ...prev, amount: event.target.value }))}
              className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              required
            />
          </label>
          <label className="space-y-1 text-sm text-slate-200">
            Izoh
            <textarea
              value={transactionForm.note}
              onChange={(event) => setTransactionForm((prev) => ({ ...prev, note: event.target.value }))}
              className="h-24 w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
            />
          </label>
          {createTransactionMutation.error ? (
            <p className="text-sm text-rose-300">{createTransactionMutation.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setTransactionOpen(false)}>
              Bekor qilish
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={createTransactionMutation.isPending}>
              {createTransactionMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </PrimaryButton>
          </div>
        </form>
      </ActionModal>

      <ActionModal
        open={payrollOpen}
        onOpenChange={setPayrollOpen}
        title="Ish haqi to‘lovi"
        description="Avans yoki oylik to‘lovini amalga oshiring."
      >
        <form className="space-y-3" onSubmit={submitPayroll}>
          <label className="space-y-1 text-sm text-slate-200">
            Xodim
            <select
              className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              value={payrollForm.employee_id}
              onChange={(event) => setPayrollForm((prev) => ({ ...prev, employee_id: event.target.value }))}
              required
            >
              <option value="">Tanlang</option>
              {(employeesQuery.data?.employees || []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} - {formatMoney(employee.monthly_salary)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-200">
              To‘lov turi
              <select
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
                value={payrollForm.payment_type}
                onChange={(event) => setPayrollForm((prev) => ({ ...prev, payment_type: event.target.value }))}
              >
                <option value="advance">Avans</option>
                <option value="salary">Oylik ish haqi</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-200">
              Summa (ixtiyoriy)
              <input
                type="number"
                min="0"
                step="1000"
                value={payrollForm.amount}
                onChange={(event) => setPayrollForm((prev) => ({ ...prev, amount: event.target.value }))}
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm text-slate-200">
            Izoh
            <textarea
              value={payrollForm.note}
              onChange={(event) => setPayrollForm((prev) => ({ ...prev, note: event.target.value }))}
              className="h-24 w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
            />
          </label>
          {createPayrollMutation.error ? (
            <p className="text-sm text-rose-300">{createPayrollMutation.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setPayrollOpen(false)}>
              Bekor qilish
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={createPayrollMutation.isPending}>
              {createPayrollMutation.isPending ? 'To‘lanmoqda...' : 'To‘lash'}
            </PrimaryButton>
          </div>
        </form>
      </ActionModal>
    </div>
  );
}
