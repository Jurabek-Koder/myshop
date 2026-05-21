import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Search, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button.jsx';
import { createPayrollPayment, createTransaction, getCategories, getPayrollCycles, getTransactions } from './accountingApi.js';
import AccountingQuickActionsDialog from './AccountingQuickActionsDialog.jsx';
import { EmptyState, PageHeader, SectionCard, StatusPill } from './AccountingSuiteParts.jsx';
import { formatCurrency, formatDate, toMonthInputValue } from './accountingUtils.js';
import { useAccountingStore } from './accountingStore.js';

export default function AccountingTransactionsPage() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('expense');
  const transactionFilters = useAccountingStore((state) => state.transactionFilters);
  const setTransactionFilters = useAccountingStore((state) => state.setTransactionFilters);

  const transactionsQuery = useQuery({
    queryKey: ['accounting', 'transactions', transactionFilters],
    queryFn: () => getTransactions(request, transactionFilters),
  });

  const categoriesQuery = useQuery({
    queryKey: ['accounting', 'categories'],
    queryFn: () => getCategories(request),
  });

  const cyclesQuery = useQuery({
    queryKey: ['accounting', 'payroll-dialog', toMonthInputValue()],
    queryFn: () => getPayrollCycles(request, { month: toMonthInputValue() }),
  });

  const transactionMutation = useMutation({
    mutationFn: (payload) => createTransaction(request, payload),
    onSuccess: async () => {
      setDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }),
      ]);
    },
  });

  const payrollMutation = useMutation({
    mutationFn: ({ cycleId, payload }) => createPayrollPayment(request, cycleId, payload),
    onSuccess: async () => {
      setDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'payroll'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'overview'] }),
      ]);
    },
  });

  const transactions = transactionsQuery.data?.items || [];
  const openCycles = useMemo(
    () => (cyclesQuery.data?.cycles || []).filter((cycle) => Number(cycle.remaining_amount) > 0.009),
    [cyclesQuery.data?.cycles],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounting tracker"
        title="Kirim va chiqimlar"
        description="Mahsulot savdosi, manual income, payroll, utilities va boshqa expense yozuvlarini izlash, filtrlash va eksport qilish."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDialogMode('income');
                setDialogOpen(true);
              }}
            >
              Tushum qo‘shish
            </Button>
            <Button
              onClick={() => {
                setDialogMode('expense');
                setDialogOpen(true);
              }}
            >
              Xarajat qo‘shish
            </Button>
          </>
        }
      />

      <SectionCard title="Filtrlar" description="Qidiruv, yo‘nalish va vaqt bo‘yicha">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Qidiruv
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Sarlavha yoki kategoriya"
                className="w-full rounded-2xl border border-slate-200 bg-white/80 py-3 pl-10 pr-4 outline-none dark:border-white/10 dark:bg-slate-950/60"
                value={transactionFilters.search}
                onChange={(event) => setTransactionFilters({ search: event.target.value })}
              />
            </div>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Yo‘nalish
            <select
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={transactionFilters.direction}
              onChange={(event) => setTransactionFilters({ direction: event.target.value })}
            >
              <option value="all">Barchasi</option>
              <option value="income">Tushum</option>
              <option value="expense">Xarajat</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Boshlanish sanasi
            <input
              type="date"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={transactionFilters.from}
              onChange={(event) => setTransactionFilters({ from: event.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Tugash sanasi
            <input
              type="date"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
              value={transactionFilters.to}
              onChange={(event) => setTransactionFilters({ to: event.target.value })}
            />
          </label>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard title="Jami tushum" description="Saralangan davr">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-emerald-500" />
            <div className="text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(transactionsQuery.data?.summary?.total_income)}</div>
          </div>
        </SectionCard>
        <SectionCard title="Jami xarajat" description="Saralangan davr">
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-rose-500" />
            <div className="text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(transactionsQuery.data?.summary?.total_expense)}</div>
          </div>
        </SectionCard>
        <SectionCard title="Sof balans" description="Daromad minus xarajat">
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{formatCurrency(transactionsQuery.data?.summary?.net_profit)}</div>
        </SectionCard>
      </div>

      <SectionCard title="Tranzaksiyalar jadvali" description="Search, filtering va mobilga mos jadval">
        {transactions.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/80 text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <th className="pb-3 pr-4 font-medium">Sarlavha</th>
                  <th className="pb-3 pr-4 font-medium">Kategoriya</th>
                  <th className="pb-3 pr-4 font-medium">Manba</th>
                  <th className="pb-3 pr-4 font-medium">Sana</th>
                  <th className="pb-3 pr-4 font-medium">Holat</th>
                  <th className="pb-3 pr-4 font-medium">Summa</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100/80 last:border-b-0 dark:border-white/5">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-slate-950 dark:text-white">{item.title}</div>
                      {item.note ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.note}</div> : null}
                    </td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{item.category_name || '—'}</td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{item.source || '—'}</td>
                    <td className="py-4 pr-4 text-slate-600 dark:text-slate-300">{formatDate(item.transaction_date)}</td>
                    <td className="py-4 pr-4">
                      <StatusPill status={item.direction === 'income' ? 'paid' : item.status} label={item.direction === 'income' ? 'Tushum' : 'Xarajat'} />
                    </td>
                    <td className={`py-4 pr-4 font-semibold ${item.direction === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {item.direction === 'income' ? '+' : '-'}
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Tranzaksiyalar topilmadi" description="Filtrlarni o‘zgartiring yoki yangi yozuv qo‘shing." />
        )}
      </SectionCard>

      <AccountingQuickActionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categoriesQuery.data}
        cycles={openCycles}
        onCreateTransaction={(payload) => transactionMutation.mutate(payload)}
        onCreatePayment={(cycleId, payload) => payrollMutation.mutate({ cycleId, payload })}
        busy={transactionMutation.isPending || payrollMutation.isPending}
        initialMode={dialogMode}
      />
    </div>
  );
}
