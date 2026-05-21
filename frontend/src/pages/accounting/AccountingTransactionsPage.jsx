import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Filter, Search } from 'lucide-react';
import { useAccountingTransactionsQuery } from '../../lib/accounting/api.js';
import { useAccountingStore } from '../../lib/accounting/store.js';
import { formatDateTime, formatMoney } from '../../lib/accounting/format.js';
import {
  Button,
  EmptyState,
  GlassTable,
  SectionHeader,
  SurfaceCard,
} from '../../components/accounting/AccountingPrimitives.jsx';

const inputClass =
  'w-full rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-2.5 text-sm text-[var(--ac-foreground)] outline-none transition focus:border-blue-400/40';

export default function AccountingTransactionsPage() {
  const transactionFilters = useAccountingStore((state) => state.transactionFilters);
  const setTransactionFilters = useAccountingStore((state) => state.setTransactionFilters);
  const openTransactionDialog = useAccountingStore((state) => state.openTransactionDialog);
  const query = useAccountingTransactionsQuery({ ...transactionFilters, include_system_sales: '1', limit: '120' });

  const transactions = query.data?.transactions || [];
  const incomeTotal = transactions.filter((item) => item.direction === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = transactions.filter((item) => item.direction === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Kirim-chiqim nazorati"
        title="Kirim-chiqimlar"
        description="Mahsulot savdosi, qo‘lda kiritilgan tushumlar va xarajatlarni filtrlash, qidirish va eksportga tayyor holatda boshqaring."
        actions={[
          <Button key="income" variant="secondary" onClick={() => openTransactionDialog({ direction: 'income' })}>
            Yangi tushum
          </Button>,
          <Button key="expense" variant="primary" onClick={() => openTransactionDialog({ direction: 'expense' })}>
            Yangi xarajat
          </Button>,
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <SurfaceCard className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
            <p className="text-sm text-[var(--ac-muted)]">Filtrlangan tushum</p>
            <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-emerald-500">
              <ArrowUpRight className="h-5 w-5" />
              {formatMoney(incomeTotal)}
            </div>
          </div>
          <div className="rounded-[24px] border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-4">
            <p className="text-sm text-[var(--ac-muted)]">Filtrlangan xarajat</p>
            <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-rose-500">
              <ArrowDownLeft className="h-5 w-5" />
              {formatMoney(expenseTotal)}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 xl:col-span-2">
            <span className="flex items-center gap-2 text-sm text-[var(--ac-muted)]">
              <Search className="h-4 w-4" />
              Qidiruv
            </span>
            <input
              className={inputClass}
              value={transactionFilters.search}
              onChange={(event) => setTransactionFilters({ search: event.target.value })}
              placeholder="Sarlavha, xodim, kategoriya..."
            />
          </label>
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm text-[var(--ac-muted)]">
              <Filter className="h-4 w-4" />
              Yo‘nalish
            </span>
            <select
              className={inputClass}
              value={transactionFilters.direction}
              onChange={(event) => setTransactionFilters({ direction: event.target.value })}
            >
              <option value="">Barchasi</option>
              <option value="income">Tushum</option>
              <option value="expense">Xarajat</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 md:col-span-2 xl:col-span-1">
            <label className="space-y-2">
              <span className="text-sm text-[var(--ac-muted)]">Dan</span>
              <input
                className={inputClass}
                type="date"
                value={transactionFilters.from}
                onChange={(event) => setTransactionFilters({ from: event.target.value })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-[var(--ac-muted)]">Gacha</span>
              <input
                className={inputClass}
                type="date"
                value={transactionFilters.to}
                onChange={(event) => setTransactionFilters({ to: event.target.value })}
              />
            </label>
          </div>
        </SurfaceCard>
      </div>

      {query.isError ? (
        <EmptyState
          title="Tranzaksiyalar yuklanmadi"
          description={query.error?.message || 'So‘rov bajarilmadi.'}
          action={<Button variant="primary" onClick={() => query.refetch()}>Qayta urinish</Button>}
        />
      ) : (
        <GlassTable>
          <div className="flex items-center justify-between border-b border-[var(--ac-border)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">Tranzaksiya jurnali</h2>
              <p className="text-sm text-[var(--ac-muted)]">Qidiruv va kategoriya filtrlari bilan</p>
            </div>
          </div>
          {transactions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Tranzaksiyalar topilmadi"
                description="Tanlangan filtrlar bo‘yicha yozuv mavjud emas. Yangi kirim yoki chiqim qo‘shib ko‘ring."
              />
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ac-border)] text-xs uppercase tracking-[0.2em] text-[var(--ac-subtle)]">
                  <th className="px-5 py-3">Yo‘nalish</th>
                  <th className="px-5 py-3">Nomi</th>
                  <th className="px-5 py-3">Kategoriya</th>
                  <th className="px-5 py-3">Summa</th>
                  <th className="px-5 py-3">Sana</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--ac-border)]/70 last:border-b-0">
                    <td className="px-5 py-4">
                      <div
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          row.direction === 'income'
                            ? 'bg-emerald-500/12 text-emerald-500'
                            : 'bg-rose-500/12 text-rose-500'
                        }`}
                      >
                        {row.direction === 'income' ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                        {row.direction === 'income' ? 'Tushum' : 'Xarajat'}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[var(--ac-foreground)]">
                      <div>
                        <div className="font-medium">{row.title}</div>
                        <div className="text-xs text-[var(--ac-muted)]">{row.notes || 'Izoh yo‘q'}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${row.category_color}1f`, color: row.category_color }}>
                        {row.category_label}
                      </span>
                    </td>
                    <td className={`px-5 py-4 font-semibold ${row.direction === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {row.direction === 'income' ? '+' : '-'}
                      {formatMoney(row.amount)}
                    </td>
                    <td className="px-5 py-4 text-[var(--ac-muted)]">{formatDateTime(row.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassTable>
      )}
    </div>
  );
}
