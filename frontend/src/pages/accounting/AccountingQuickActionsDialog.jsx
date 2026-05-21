import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog.jsx';
import { Button } from '../../components/ui/button.jsx';
import { formatCurrency, toDateInputValue } from './accountingUtils.js';

const DEFAULT_TRANSACTION = {
  direction: 'expense',
  title: '',
  amount: '',
  note: '',
  transaction_date: toDateInputValue(),
  category_id: '',
  source: 'manual_expense',
};

const DEFAULT_PAYMENT = {
  cycleId: '',
  amount: '',
  payment_method: 'bank',
  note: '',
  paid_at: toDateInputValue(),
};

export default function AccountingQuickActionsDialog({
  open,
  onOpenChange,
  categories,
  cycles,
  onCreateTransaction,
  onCreatePayment,
  busy,
  initialMode = 'expense',
}) {
  const [mode, setMode] = useState(initialMode);
  const [transactionForm, setTransactionForm] = useState(DEFAULT_TRANSACTION);
  const [paymentForm, setPaymentForm] = useState(DEFAULT_PAYMENT);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setTransactionForm(DEFAULT_TRANSACTION);
    setPaymentForm((prev) => ({
      ...DEFAULT_PAYMENT,
      cycleId: cycles?.[0]?.id ? String(cycles[0].id) : '',
    }));
  }, [open, cycles, initialMode]);

  const currentCategories = useMemo(
    () => (transactionForm.direction === 'income' ? categories?.income_categories || [] : categories?.expense_categories || []),
    [categories, transactionForm.direction],
  );

  const activeCycle = useMemo(
    () => cycles?.find((cycle) => String(cycle.id) === String(paymentForm.cycleId)) || null,
    [cycles, paymentForm.cycleId],
  );

  const sourceByDirection = {
    income: 'manual_income',
    expense: 'manual_expense',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tezkor amallar</DialogTitle>
          <DialogDescription>
            Xarajat yoki tushum kiriting, payroll sikliga to‘lov qiling va receipt generatsiyasini boshlang.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-slate-100/80 p-2 dark:border-white/10 dark:bg-white/5">
          {[
            ['expense', 'Yangi xarajat qo‘shish'],
            ['income', 'Qo‘shimcha tushum qo‘shish'],
            ['payroll', 'Oylik yoki avans to‘lash'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                mode === value
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode !== 'payroll' ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onCreateTransaction({
                ...transactionForm,
                source: sourceByDirection[transactionForm.direction],
                category_id: transactionForm.category_id ? Number(transactionForm.category_id) : null,
                amount: Number(transactionForm.amount),
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Yo‘nalish
                <select
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none ring-0 dark:border-white/10 dark:bg-slate-950/60"
                  value={transactionForm.direction}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      direction: event.target.value,
                      category_id: '',
                    }))
                  }
                >
                  <option value="expense">Xarajat</option>
                  <option value="income">Tushum</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Sana
                <input
                  type="date"
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                  value={transactionForm.transaction_date}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, transaction_date: event.target.value }))}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Sarlavha
              <input
                type="text"
                placeholder="Masalan, Ofis internet to‘lovi"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                value={transactionForm.title}
                onChange={(event) => setTransactionForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Summa
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="0"
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                  value={transactionForm.amount}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Kategoriya
                <select
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                  value={transactionForm.category_id}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, category_id: event.target.value }))}
                >
                  <option value="">Kategoriya tanlang</option>
                  {currentCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name_uz}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Izoh
              <textarea
                rows={3}
                placeholder="Qo‘shimcha eslatma"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                value={transactionForm.note}
                onChange={(event) => setTransactionForm((current) => ({ ...current, note: event.target.value }))}
              />
            </label>

            <div className="flex justify-end">
              <Button disabled={busy} type="submit">
                {busy ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!paymentForm.cycleId) return;
              onCreatePayment(paymentForm.cycleId, {
                amount: paymentForm.amount ? Number(paymentForm.amount) : undefined,
                payment_method: paymentForm.payment_method,
                note: paymentForm.note,
                paid_at: paymentForm.paid_at,
              });
            }}
          >
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Payroll sikli
              <select
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                value={paymentForm.cycleId}
                onChange={(event) => setPaymentForm((current) => ({ ...current, cycleId: event.target.value }))}
              >
                <option value="">Siklni tanlang</option>
                {cycles?.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.full_name} — {cycle.cycle_type_label} — {formatCurrency(cycle.remaining_amount)}
                  </option>
                ))}
              </select>
            </label>

            {activeCycle ? (
              <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 p-4 text-sm dark:border-sky-500/20 dark:bg-sky-500/10">
                <p className="font-semibold text-slate-900 dark:text-white">{activeCycle.full_name}</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {activeCycle.cycle_type_label} · Muddat: {String(activeCycle.due_date || '').slice(0, 10)} · Qolgan summa:{' '}
                  {formatCurrency(activeCycle.remaining_amount)}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Summa
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder={activeCycle ? String(activeCycle.remaining_amount) : '0'}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                  value={paymentForm.amount}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                To‘lov usuli
                <select
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                  value={paymentForm.payment_method}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, payment_method: event.target.value }))}
                >
                  <option value="bank">Bank o‘tkazmasi</option>
                  <option value="card">Karta</option>
                  <option value="cash">Naqd</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              To‘lov sanasi
              <input
                type="date"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                value={paymentForm.paid_at}
                onChange={(event) => setPaymentForm((current) => ({ ...current, paid_at: event.target.value }))}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Izoh
              <textarea
                rows={3}
                placeholder="Masalan, avans to‘landi"
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 outline-none dark:border-white/10 dark:bg-slate-950/60"
                value={paymentForm.note}
                onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))}
              />
            </label>

            <div className="flex justify-end">
              <Button disabled={busy || !paymentForm.cycleId} type="submit">
                {busy ? 'Jo‘natilmoqda...' : 'To‘lovni yakunlash'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
