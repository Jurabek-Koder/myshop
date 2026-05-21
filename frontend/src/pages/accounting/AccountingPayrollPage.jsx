import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Download, Wallet } from 'lucide-react';
import { ActionModal, EmptyState, GlassCard, PrimaryButton, SectionTitle, SecondaryButton } from './AccountingUi.jsx';
import { useAccountingApi } from './AccountingApi.js';
import { formatDate, formatDateTime, formatMoney, statusMeta } from './accountingFormat.js';

export default function AccountingPayrollPage() {
  const api = useAccountingApi();
  const queryClient = useQueryClient();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    payment_type: 'advance',
    amount: '',
    note: '',
  });
  const [latestReceipt, setLatestReceipt] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['accounting-payroll-employees'],
    queryFn: api.getPayrollEmployees,
  });
  const calendarQuery = useQuery({
    queryKey: ['accounting-payroll-calendar'],
    queryFn: api.getPayrollCalendar,
  });

  const paymentMutation = useMutation({
    mutationFn: api.createPayrollPayment,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-employees'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] });
      setLatestReceipt(response?.payment?.receipt_number || '');
      setPaymentModalOpen(false);
      setForm((prev) => ({ ...prev, amount: '', note: '' }));
    },
  });

  const employees = employeesQuery.data?.employees || [];
  const calendar = calendarQuery.data?.events || [];

  const submitPayment = (event) => {
    event.preventDefault();
    paymentMutation.mutate({
      ...form,
      employee_id: Number(form.employee_id),
      amount: form.amount ? Number(form.amount) : undefined,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <SectionTitle
        title="Ish haqi boshqaruvi"
        subtitle="15 kunlik avans va oy yakuni oylik sikllari, avtomatik status va to‘lov nazorati."
        rightSlot={<PrimaryButton onClick={() => setPaymentModalOpen(true)}>Oylik to‘lash</PrimaryButton>}
      />

      {latestReceipt ? (
        <GlassCard className="border-emerald-300/25">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-emerald-200">To‘lov muvaffaqiyatli yakunlandi</p>
              <p className="text-xs text-slate-300">Kvitansiya raqami: {latestReceipt}</p>
            </div>
            <a
              href={`/api/accounting/portal/receipts/${latestReceipt}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20"
            >
              <Download size={16} />
              PDF yuklash
            </a>
          </div>
        </GlassCard>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {employees.length ? (
          employees.map((employee) => {
            const status = statusMeta(employee.status_key);
            return (
              <GlassCard key={employee.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">{employee.full_name}</h3>
                    <p className="text-xs text-slate-300">{employee.position_title}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs ${status.className}`}>{status.label}</span>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-200">
                  <p className="flex justify-between gap-2">
                    <span>Oylik:</span>
                    <strong>{formatMoney(employee.monthly_salary)}</strong>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>Oxirgi to‘lov:</span>
                    <span>{employee.last_payment_at ? formatDateTime(employee.last_payment_at) : '—'}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>Keyingi to‘lov sanasi:</span>
                    <span>{employee.next_payment_date ? formatDate(employee.next_payment_date) : '—'}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span>Qolgan balans:</span>
                    <span className="font-semibold text-amber-200">{formatMoney(employee.remaining_balance)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, employee_id: String(employee.id) }));
                    setPaymentModalOpen(true);
                  }}
                >
                  To‘lovni ochish
                </button>
              </GlassCard>
            );
          })
        ) : (
          <EmptyState
            title="Xodimlar ro‘yxati bo‘sh"
            description="Payroll bo‘limida hali faol xodimlar topilmadi."
          />
        )}
      </div>

      <GlassCard>
        <SectionTitle
          title="Ish haqi kalendari"
          subtitle="Kelgusi muddatlar, kechikkan sikllar va to‘lov navbatini kuzatish."
          rightSlot={
            <SecondaryButton type="button" onClick={() => calendarQuery.refetch()}>
              Yangilash
            </SecondaryButton>
          }
        />
        {calendar.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300">
                  <th className="px-2 py-2">Xodim</th>
                  <th className="px-2 py-2">To‘lov turi</th>
                  <th className="px-2 py-2">Muddat</th>
                  <th className="px-2 py-2">Qolgan summa</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((event) => {
                  const status = statusMeta(event.status);
                  return (
                    <tr key={event.id} className="border-t border-white/10 text-slate-100">
                      <td className="px-2 py-2">{event.employee_name}</td>
                      <td className="px-2 py-2">{event.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi'}</td>
                      <td className="px-2 py-2">{formatDate(event.due_date)}</td>
                      <td className="px-2 py-2">{formatMoney(event.remaining_amount)}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-1 text-xs ${status.className}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-300">
            <CalendarClock className="mx-auto mb-2" size={18} />
            Kalendar ma’lumotlari mavjud emas.
          </div>
        )}
      </GlassCard>

      <ActionModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        title="Ish haqi to‘lash"
        description="15 kunlik sikl bo‘yicha avans yoki oy yakuni oyligini kiriting."
      >
        <form className="space-y-3" onSubmit={submitPayment}>
          <label className="space-y-1 text-sm text-slate-200">
            Xodim
            <select
              className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              value={form.employee_id}
              onChange={(event) => setForm((prev) => ({ ...prev, employee_id: event.target.value }))}
              required
            >
              <option value="">Tanlang</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-200">
              To‘lov turi
              <select
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
                value={form.payment_type}
                onChange={(event) => setForm((prev) => ({ ...prev, payment_type: event.target.value }))}
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
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                className="w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm text-slate-200">
            Izoh
            <textarea
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              className="h-24 w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2"
            />
          </label>
          {paymentMutation.error ? <p className="text-sm text-rose-300">{paymentMutation.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setPaymentModalOpen(false)}>
              Bekor qilish
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={paymentMutation.isPending}>
              <Wallet size={16} />
              {paymentMutation.isPending ? 'To‘lanmoqda...' : 'To‘lovni tasdiqlash'}
            </PrimaryButton>
          </div>
        </form>
      </ActionModal>
    </div>
  );
}
