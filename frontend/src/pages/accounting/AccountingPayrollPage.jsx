import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Download,
  Landmark,
  MessageSquareShare,
  PencilLine,
  ReceiptText,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  downloadReceiptPdf,
  fetchAccountingJson,
  formatCurrencyUz,
  formatDateTimeUz,
  formatDateUz,
  getPayrollStatusLabel,
  getPayrollStatusTone,
} from './accountingUtils.js';

function PayrollModal({ open, title, subtitle, children, onClose }) {
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
            aria-label="Modalni yopish"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="accounting-dialog-content accounting-glass-card"
          >
            <div className="p-5 md:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-950 dark:text-white">{title}</h3>
                  {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Yopish"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {children}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function SummaryCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="accounting-glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</h3>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function AccountingPayrollPage() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    cycle_type: 'advance',
    amount: '',
    payment_method: 'cash',
    note: '',
    reference_number: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    full_name: '',
    department: '',
    job_title: '',
    phone: '',
    monthly_salary: '',
    advance_ratio: '0.5',
    payroll_enabled: true,
    telegram_chat_id: '',
    notes: '',
  });

  const overviewQuery = useQuery({
    queryKey: ['accounting-payroll-overview'],
    queryFn: () => fetchAccountingJson(request, '/accounting/portal/payroll/overview'),
  });

  useEffect(() => {
    const employees = overviewQuery.data?.employees || [];
    if (!selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [overviewQuery.data, selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => (overviewQuery.data?.employees || []).find((item) => item.id === selectedEmployeeId) || null,
    [overviewQuery.data, selectedEmployeeId],
  );

  const detailQuery = useQuery({
    queryKey: ['accounting-payroll-employee', selectedEmployeeId],
    enabled: !!selectedEmployeeId,
    queryFn: () => fetchAccountingJson(request, `/accounting/portal/payroll/employees/${selectedEmployeeId}`),
  });

  useEffect(() => {
    if (!selectedEmployee) return;
    setPaymentForm({
      cycle_type: selectedEmployee.next_payment?.cycle_type || 'advance',
      amount: selectedEmployee.next_payment?.remaining_amount ? String(selectedEmployee.next_payment.remaining_amount) : '',
      payment_method: 'cash',
      note: '',
      reference_number: '',
    });
  }, [selectedEmployee, paymentDialogOpen]);

  useEffect(() => {
    const employee = detailQuery.data?.employee;
    if (!employee) return;
    setSettingsForm({
      full_name: employee.full_name || '',
      department: employee.department || '',
      job_title: employee.job_title || '',
      phone: employee.phone || '',
      monthly_salary: employee.monthly_salary != null ? String(employee.monthly_salary) : '',
      advance_ratio: employee.advance_ratio != null ? String(employee.advance_ratio) : '0.5',
      payroll_enabled: !!employee.payroll_enabled,
      telegram_chat_id: employee.telegram_chat_id || '',
      notes: employee.notes || '',
    });
  }, [detailQuery.data, settingsDialogOpen]);

  const invalidateAccountingData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-overview-card'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-payroll-employee', selectedEmployeeId] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-activity'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-transactions'] }),
    ]);
  };

  const paymentMutation = useMutation({
    mutationFn: (payload) =>
      fetchAccountingJson(request, '/accounting/portal/payroll/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (data) => {
      setFeedback({
        kind: 'success',
        title: 'To‘lov yozuvi yaratildi',
        description: `${data.employee?.full_name || 'Xodim'} uchun to‘lov muvaffaqiyatli saqlandi.`,
        receipt: data.receipt,
      });
      setPaymentDialogOpen(false);
      await invalidateAccountingData();
    },
    onError: (error) => {
      setFeedback({
        kind: 'error',
        title: 'To‘lov amalga oshmadi',
        description: error?.message || 'Payroll to‘lovini saqlashda xato yuz berdi.',
      });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (payload) =>
      fetchAccountingJson(request, `/accounting/portal/payroll/employees/${selectedEmployeeId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setFeedback({
        kind: 'success',
        title: 'Payroll sozlamalari yangilandi',
        description: 'Xodimning maoshi, bo‘limi va Telegram sozlamalari saqlandi.',
      });
      setSettingsDialogOpen(false);
      await invalidateAccountingData();
    },
    onError: (error) => {
      setFeedback({
        kind: 'error',
        title: 'Sozlamalar saqlanmadi',
        description: error?.message || 'Payroll sozlamalarini yangilashda xato yuz berdi.',
      });
    },
  });

  const summary = overviewQuery.data?.summary;
  const employees = overviewQuery.data?.employees || [];
  const calendar = overviewQuery.data?.calendar || [];
  const recentPayments = overviewQuery.data?.recent_payments || [];
  const detail = detailQuery.data;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Users}
          label="Faol xodimlar"
          value={summary?.employee_count ?? 0}
          hint="Payroll yoqilgan barcha xodimlar"
        />
        <SummaryCard
          icon={Landmark}
          label="Oylik byudjeti"
          value={formatCurrencyUz(summary?.monthly_budget)}
          hint="Bir oy uchun rejalashtirilgan ish haqi"
        />
        <SummaryCard
          icon={CalendarDays}
          label="Avans byudjeti"
          value={formatCurrencyUz(summary?.advance_budget)}
          hint="15 kunlik avans bosqichi summasi"
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Kechikkan sikllar"
          value={summary?.overdue_count ?? 0}
          hint={`${summary?.pending_count ?? 0} ta kutilayotgan sikl mavjud`}
        />
      </section>

      {feedback ? (
        <section
          className={[
            'accounting-glass-card p-5',
            feedback.kind === 'error' ? 'border border-rose-400/30' : 'border border-emerald-400/30',
          ].join(' ')}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">{feedback.title}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{feedback.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {feedback.receipt?.id ? (
                <button
                  type="button"
                  onClick={() =>
                    void downloadReceiptPdf(
                      request,
                      feedback.receipt.id,
                      `${feedback.receipt.receipt_number || 'kvitansiya'}.pdf`,
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
                >
                  <Download className="h-4 w-4" />
                  Kvitansiya yuklash
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Yopish
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="accounting-glass-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="accounting-section-title text-slate-950 dark:text-white">Xodimlar ish haqi kartalari</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Oylik, oxirgi to‘lov, keyingi sana va qolgan balans bitta kartada.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!selectedEmployee}
                onClick={() => {
                  setSettingsDialogOpen(true);
                  setFeedback(null);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
              >
                <PencilLine className="h-4 w-4" />
                Sozlash
              </button>
              <button
                type="button"
                disabled={!selectedEmployee}
                onClick={() => {
                  setPaymentDialogOpen(true);
                  setFeedback(null);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                <CreditCard className="h-4 w-4" />
                To‘lov qilish
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {overviewQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="accounting-glass-card animate-pulse p-5">
                  <div className="h-4 w-28 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="mt-4 h-6 w-36 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="mt-3 h-3 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
                </div>
              ))
            ) : employees.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Payroll uchun xodimlar topilmadi.
              </div>
            ) : (
              employees.map((employee) => {
                const active = employee.id === selectedEmployeeId;
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(employee.id)}
                    className={[
                      'rounded-[1.5rem] border p-5 text-left transition',
                      active
                        ? 'border-blue-400/40 bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-2xl shadow-blue-500/15'
                        : 'border-slate-200 bg-white/70 hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/70',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={active ? 'font-bold text-white' : 'font-bold text-slate-950 dark:text-white'}>
                            {employee.full_name}
                          </h3>
                          {employee.is_superuser_employee ? (
                            <span className={active ? 'rounded-full bg-white/15 px-2 py-1 text-[11px] font-semibold text-white/80' : 'rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                              Superuser
                            </span>
                          ) : null}
                        </div>
                        <p className={active ? 'mt-1 text-sm text-white/75' : 'mt-1 text-sm text-slate-500 dark:text-slate-400'}>
                          {employee.job_title || employee.department || 'Xodim'}
                        </p>
                      </div>
                      <span
                        className={[
                          'rounded-full px-3 py-1 text-[11px] font-semibold ring-1',
                          active ? 'bg-white/15 text-white ring-white/20' : getPayrollStatusTone(employee.status),
                        ].join(' ')}
                      >
                        {getPayrollStatusLabel(employee.status)}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className={active ? 'text-white/65' : 'text-slate-500 dark:text-slate-400'}>Oylik</p>
                        <p className={active ? 'mt-1 font-semibold text-white' : 'mt-1 font-semibold text-slate-950 dark:text-white'}>
                          {formatCurrencyUz(employee.monthly_salary)}
                        </p>
                      </div>
                      <div>
                        <p className={active ? 'text-white/65' : 'text-slate-500 dark:text-slate-400'}>Qolgan balans</p>
                        <p className={active ? 'mt-1 font-semibold text-white' : 'mt-1 font-semibold text-slate-950 dark:text-white'}>
                          {formatCurrencyUz(employee.remaining_balance)}
                        </p>
                      </div>
                      <div>
                        <p className={active ? 'text-white/65' : 'text-slate-500 dark:text-slate-400'}>Oxirgi to‘lov</p>
                        <p className={active ? 'mt-1 font-semibold text-white' : 'mt-1 font-semibold text-slate-950 dark:text-white'}>
                          {employee.last_payment?.paid_at ? formatDateUz(employee.last_payment.paid_at) : 'Mavjud emas'}
                        </p>
                      </div>
                      <div>
                        <p className={active ? 'text-white/65' : 'text-slate-500 dark:text-slate-400'}>Keyingi sana</p>
                        <p className={active ? 'mt-1 font-semibold text-white' : 'mt-1 font-semibold text-slate-950 dark:text-white'}>
                          {employee.next_payment?.due_date ? formatDateUz(employee.next_payment.due_date) : 'Yopilgan'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="accounting-glass-card p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="accounting-section-title text-slate-950 dark:text-white">Payroll kalendari</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Avans va oy yakuni to‘lov muddatlari.
                </p>
              </div>
              <CalendarDays className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-5 space-y-3">
              {calendar.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Kalendar yozuvlari topilmadi.
                </div>
              ) : (
                calendar.slice(0, 8).map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950 dark:text-white">{row.full_name}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {row.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi'} · {formatDateUz(row.due_date)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${getPayrollStatusTone(row.status)}`}>
                        {getPayrollStatusLabel(row.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
                      {formatCurrencyUz(row.remaining_amount)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="accounting-glass-card p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="accounting-section-title text-slate-950 dark:text-white">Oxirgi to‘lovlar</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Kvitansiya bilan birga ko‘rinadi.
                </p>
              </div>
              <ReceiptText className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-5 space-y-3">
              {recentPayments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Hozircha to‘lovlar yo‘q.
                </div>
              ) : (
                recentPayments.slice(0, 8).map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950 dark:text-white">{row.full_name}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {row.payment_type === 'advance' ? 'Avans' : 'Oylik ish haqi'} · {formatDateTimeUz(row.paid_at)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${getPayrollStatusTone(row.cycle_status)}`}>
                        {getPayrollStatusLabel(row.cycle_status)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <strong className="text-slate-950 dark:text-white">{formatCurrencyUz(row.amount)}</strong>
                      {row.receipt_id ? (
                        <button
                          type="button"
                          onClick={() =>
                            void downloadReceiptPdf(request, row.receipt_id, `${row.receipt_number || `receipt-${row.id}`}.pdf`)
                          }
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="accounting-glass-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="accounting-section-title text-slate-950 dark:text-white">Tanlangan xodim tafsiloti</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sikllar, partial payment yozuvlari va kvitansiyalar tarixini ko‘ring.
            </p>
          </div>
          {selectedEmployee ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/70">
              <div className="font-semibold text-slate-950 dark:text-white">{selectedEmployee.full_name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{selectedEmployee.employee_code || 'EMP'}</div>
            </div>
          ) : null}
        </div>

        {detailQuery.isLoading ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-[1.4rem] bg-slate-100/70 dark:bg-slate-900/70" />
            <div className="h-64 animate-pulse rounded-[1.4rem] bg-slate-100/70 dark:bg-slate-900/70" />
          </div>
        ) : detailQuery.isError ? (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {detailQuery.error?.message || 'Xodim tafsiloti yuklanmadi.'}
          </div>
        ) : detail ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr,1fr]">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">Payroll sikllari</h3>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">So‘nggi 24 yozuv</span>
              </div>
              <div className="accounting-table-wrap">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-3 pr-4 font-medium">Sikl</th>
                      <th className="py-3 pr-4 font-medium">Muddat</th>
                      <th className="py-3 pr-4 font-medium">Brutto</th>
                      <th className="py-3 pr-4 font-medium">To‘langan</th>
                      <th className="py-3 pr-4 font-medium">Qolgan</th>
                      <th className="py-3 font-medium">Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.cycles.map((cycle) => (
                      <tr key={cycle.id} className="border-b border-slate-100 align-top dark:border-slate-900">
                        <td className="py-3 pr-4 font-semibold text-slate-950 dark:text-white">
                          {cycle.payroll_month}/{cycle.payroll_year} · {cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik'}
                        </td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{formatDateUz(cycle.due_date)}</td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{formatCurrencyUz(cycle.gross_amount)}</td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{formatCurrencyUz(cycle.paid_amount)}</td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{formatCurrencyUz(cycle.remaining_amount)}</td>
                        <td className="py-3">
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${getPayrollStatusTone(cycle.status)}`}>
                            {cycle.status_label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">To‘lovlar tarixi</h3>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Partial payments qo‘llanadi</span>
              </div>
              <div className="space-y-3">
                {detail.payments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Hali to‘lov yozuvi yo‘q.
                  </div>
                ) : (
                  detail.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-[1.3rem] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-slate-950 dark:text-white">
                            {payment.payment_type === 'advance' ? 'Avans' : 'Oylik ish haqi'}
                          </h4>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {formatDateTimeUz(payment.paid_at)} · {payment.payment_method}
                          </p>
                          {payment.note ? (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{payment.note}</p>
                          ) : null}
                        </div>
                        <strong className="text-slate-950 dark:text-white">{formatCurrencyUz(payment.amount)}</strong>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {payment.receipt_number ? `Kvitansiya: ${payment.receipt_number}` : 'Kvitansiya hali tayyor emas'}
                        </div>
                        {payment.receipt_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              void downloadReceiptPdf(request, payment.receipt_id, `${payment.receipt_number || `receipt-${payment.id}`}.pdf`)
                            }
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Tanlash uchun xodim kartasini bosing.
          </div>
        )}
      </section>

      <PayrollModal
        open={paymentDialogOpen && !!selectedEmployee}
        onClose={() => setPaymentDialogOpen(false)}
        title="Ish haqi to‘lash"
        subtitle={`${selectedEmployee?.full_name || 'Xodim'} uchun avans yoki oy yakuni to‘lovini yarating.`}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedEmployee) return;
            paymentMutation.mutate({
              employee_id: selectedEmployee.id,
              cycle_type: paymentForm.cycle_type,
              amount: Number(paymentForm.amount),
              payment_method: paymentForm.payment_method,
              note: paymentForm.note,
              reference_number: paymentForm.reference_number,
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              To‘lov turi
              <select
                value={paymentForm.cycle_type}
                onChange={(event) => setPaymentForm((current) => ({ ...current, cycle_type: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              >
                <option value="advance">Avans</option>
                <option value="final">Oylik ish haqi</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Summa
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                placeholder="Masalan, 2500000"
                required
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              To‘lov usuli
              <select
                value={paymentForm.payment_method}
                onChange={(event) => setPaymentForm((current) => ({ ...current, payment_method: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              >
                <option value="cash">Naqd</option>
                <option value="card">Karta</option>
                <option value="bank_transfer">Bank o‘tkazmasi</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Referens raqami
              <input
                type="text"
                value={paymentForm.reference_number}
                onChange={(event) => setPaymentForm((current) => ({ ...current, reference_number: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                placeholder="TRX-2026-..."
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Izoh
            <textarea
              value={paymentForm.note}
              onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))}
              className="min-h-28 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              placeholder="Masalan, 15 kunlik avans yoki bonus bilan..."
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setPaymentDialogOpen(false)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={paymentMutation.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              <ReceiptText className="h-4 w-4" />
              {paymentMutation.isPending ? 'Saqlanmoqda...' : 'To‘lovni saqlash'}
            </button>
          </div>
        </form>
      </PayrollModal>

      <PayrollModal
        open={settingsDialogOpen && !!selectedEmployee}
        onClose={() => setSettingsDialogOpen(false)}
        title="Payroll sozlamalari"
        subtitle="Oylik, advance ratio, Telegram chat va xodim ma’lumotlarini yangilang."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            settingsMutation.mutate({
              ...settingsForm,
              monthly_salary: Number(settingsForm.monthly_salary),
              advance_ratio: Number(settingsForm.advance_ratio),
              payroll_enabled: !!settingsForm.payroll_enabled,
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              To‘liq ism
              <input
                type="text"
                value={settingsForm.full_name}
                onChange={(event) => setSettingsForm((current) => ({ ...current, full_name: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Telefon
              <input
                type="text"
                value={settingsForm.phone}
                onChange={(event) => setSettingsForm((current) => ({ ...current, phone: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Bo‘lim
              <input
                type="text"
                value={settingsForm.department}
                onChange={(event) => setSettingsForm((current) => ({ ...current, department: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Lavozim
              <input
                type="text"
                value={settingsForm.job_title}
                onChange={(event) => setSettingsForm((current) => ({ ...current, job_title: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Oylik maoshi
              <input
                type="number"
                min="0"
                step="0.01"
                value={settingsForm.monthly_salary}
                onChange={(event) => setSettingsForm((current) => ({ ...current, monthly_salary: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Avans ulushi (0.5 = 50%)
              <input
                type="number"
                min="0.1"
                max="0.9"
                step="0.05"
                value={settingsForm.advance_ratio}
                onChange={(event) => setSettingsForm((current) => ({ ...current, advance_ratio: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
                required
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Telegram chat ID
            <div className="relative">
              <MessageSquareShare className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={settingsForm.telegram_chat_id}
                onChange={(event) => setSettingsForm((current) => ({ ...current, telegram_chat_id: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white/70 py-3 pl-11 pr-4 dark:border-slate-700 dark:bg-slate-900/70"
                placeholder="Masalan, 123456789"
              />
            </div>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            Izoh
            <textarea
              value={settingsForm.notes}
              onChange={(event) => setSettingsForm((current) => ({ ...current, notes: event.target.value }))}
              className="min-h-24 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70"
              placeholder="Xodimga oid ichki payroll qaydlari"
            />
          </label>

          <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
            <input
              type="checkbox"
              checked={settingsForm.payroll_enabled}
              onChange={(event) => setSettingsForm((current) => ({ ...current, payroll_enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Payroll avtomatizatsiyasini yoqish
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setSettingsDialogOpen(false)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={settingsMutation.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              <PencilLine className="h-4 w-4" />
              {settingsMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </PayrollModal>
    </div>
  );
}
