import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CalendarClock,
  CalendarDays,
  Download,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useAccountingClient,
  useAccountingExport,
  useActivityFeed,
  useCreateEmployee,
  useFinancialTransactions,
  usePayrollCalendar,
  usePayrollEmployees,
  usePayrollPayments,
  useReportsSummary,
  useUpdateEmployee,
} from '../../lib/accountingApi.js';
import {
  cyclePhaseLabel,
  downloadBlob,
  formatDate,
  formatDateTime,
  formatMoney,
  initials,
  paymentMethodLabel,
  statusBadgeTone,
} from './accountingFormatters.js';
import { useAccountingUiStore } from '../../stores/accountingUiStore.js';

function SectionCard({ title, subtitle, action, children, wide = false }) {
  return (
    <section className={`accounting-card${wide ? ' accounting-card--wide' : ''}`}>
      <div className="accounting-section-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status, label }) {
  return <span className={`accounting-status-badge tone-${statusBadgeTone(status)}`}>{label}</span>;
}

function EmployeeEditorModal({ employee, onClose }) {
  const createEmployeeMutation = useCreateEmployee();
  const updateEmployeeMutation = useUpdateEmployee();
  const [form, setForm] = useState({
    full_name: employee?.full_name || '',
    monthly_salary: employee?.monthly_salary || '',
    advance_percent: employee?.advance_percent || 50,
    phone: employee?.phone || '',
    telegram_chat_id: employee?.telegram_chat_id || '',
    notes: employee?.notes || '',
    status: employee?.active === false ? 'inactive' : 'active',
  });

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      monthly_salary: Number(form.monthly_salary),
      advance_percent: Number(form.advance_percent),
    };
    if (employee?.id) {
      await updateEmployeeMutation.mutateAsync({ employeeId: employee.id, payload });
    } else {
      await createEmployeeMutation.mutateAsync(payload);
    }
    onClose();
  }

  const pending = createEmployeeMutation.isPending || updateEmployeeMutation.isPending;
  const error = createEmployeeMutation.error?.message || updateEmployeeMutation.error?.message || '';

  return (
    <AnimatePresence>
      <motion.div className="accounting-modal-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <button type="button" className="accounting-modal-backdrop" onClick={onClose} aria-label="Yopish" />
        <motion.div
          className="accounting-modal-card"
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
        >
          <div className="accounting-modal-head">
            <div>
              <h3>{employee?.id ? 'Xodim kartasini tahrirlash' : 'Yangi payroll xodimi'}</h3>
              <p>Superuser yoki accounting foydalanuvchilarni payroll tizimiga biriktiring.</p>
            </div>
          </div>
          <form className="accounting-form-grid" onSubmit={handleSubmit}>
            <label className="accounting-form-grid--wide">
              <span>To`liq ism</span>
              <input
                value={form.full_name}
                onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                required
              />
            </label>
            <label>
              <span>Oylik maoshi</span>
              <input
                type="number"
                min="0"
                value={form.monthly_salary}
                onChange={(event) => setForm((prev) => ({ ...prev, monthly_salary: event.target.value }))}
                required
              />
            </label>
            <label>
              <span>Avans foizi</span>
              <input
                type="number"
                min="1"
                max="99"
                value={form.advance_percent}
                onChange={(event) => setForm((prev) => ({ ...prev, advance_percent: event.target.value }))}
              />
            </label>
            <label>
              <span>Telefon</span>
              <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </label>
            <label>
              <span>Telegram chat ID</span>
              <input
                value={form.telegram_chat_id}
                onChange={(event) => setForm((prev) => ({ ...prev, telegram_chat_id: event.target.value }))}
              />
            </label>
            <label className="accounting-form-grid--wide">
              <span>Izoh</span>
              <textarea rows={3} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <label>
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="active">Faol</option>
                <option value="inactive">Nofaol</option>
              </select>
            </label>
            {error ? <div className="accounting-form-error">{error}</div> : null}
            <div className="accounting-modal-actions">
              <button type="button" className="accounting-secondary-button" onClick={onClose}>
                Bekor qilish
              </button>
              <button type="submit" className="accounting-primary-button" disabled={pending}>
                {pending ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function PayrollSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editingEmployee, setEditingEmployee] = useState(null);
  const { openPaymentModal } = useAccountingUiStore();
  const employeesQuery = usePayrollEmployees({ q: search, status });
  const paymentsQuery = usePayrollPayments({ limit: 8 });
  const accountingClient = useAccountingClient();

  async function handleReceiptDownload(paymentId) {
    const blob = await accountingClient.getBlob(`/payroll/payments/${paymentId}/receipt.pdf`);
    downloadBlob(blob, `myshop-ish-haqi-${paymentId}.pdf`);
  }

  return (
    <div className="accounting-page-grid">
      <SectionCard
        title="Xodimlar payroll kartalari"
        subtitle="15 kunlik avans va oy oxiridagi ish haqi sikllari avtomatik kuzatiladi."
        action={
          <div className="accounting-inline-actions">
            <button type="button" className="accounting-secondary-button" onClick={() => employeesQuery.refetch()}>
              <RefreshCcw size={16} />
              Yangilash
            </button>
            <button type="button" className="accounting-primary-button" onClick={() => setEditingEmployee({})}>
              <Plus size={16} />
              Yangi xodim
            </button>
          </div>
        }
        wide
      >
        <div className="accounting-toolbar">
          <label className="accounting-toolbar__search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Xodim qidirish" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Barcha statuslar</option>
            <option value="pending">Kutilmoqda</option>
            <option value="overdue">Kechikkan</option>
            <option value="paid">To`langan</option>
          </select>
        </div>

        <div className="accounting-mini-stats">
          <div>
            <small>Xodimlar</small>
            <strong>{employeesQuery.data?.summary?.total_employees || 0}</strong>
          </div>
          <div>
            <small>Kutilayotgan</small>
            <strong>{employeesQuery.data?.summary?.pending_count || 0}</strong>
          </div>
          <div>
            <small>Kechikkan</small>
            <strong>{employeesQuery.data?.summary?.overdue_count || 0}</strong>
          </div>
          <div>
            <small>Jami oylik fondi</small>
            <strong>{formatMoney(employeesQuery.data?.summary?.total_monthly_salary || 0)}</strong>
          </div>
        </div>

        <div className="accounting-employee-grid">
          {(employeesQuery.data?.employees || []).map((employee) => (
            <article key={employee.id} className="accounting-employee-card">
              <div className="accounting-employee-card__head">
                <div className="accounting-profile-card">
                  <div className="accounting-profile-card__avatar">{initials(employee.full_name)}</div>
                  <div>
                    <strong>{employee.full_name}</strong>
                    <small>{employee.employee_code}</small>
                  </div>
                </div>
                <StatusBadge status={employee.status} label={employee.status_label} />
              </div>

              <div className="accounting-employee-card__stats">
                <div>
                  <small>Oylik maoshi</small>
                  <strong>{formatMoney(employee.monthly_salary)}</strong>
                </div>
                <div>
                  <small>So`nggi to`lov</small>
                  <strong>{formatDate(employee.last_payment_at)}</strong>
                </div>
                <div>
                  <small>Keyingi muddat</small>
                  <strong>{formatDate(employee.next_payment_date)}</strong>
                </div>
                <div>
                  <small>Qolgan balans</small>
                  <strong>{formatMoney(employee.remaining_balance)}</strong>
                </div>
              </div>

              <div className="accounting-cycle-strip">
                <div>
                  <small>Avans</small>
                  <strong>{formatMoney(employee.cycles?.advance?.remaining_amount || 0)}</strong>
                </div>
                <div>
                  <small>Oy oxiri</small>
                  <strong>{formatMoney(employee.cycles?.salary?.remaining_amount || 0)}</strong>
                </div>
              </div>

              <div className="accounting-card-actions">
                <button type="button" className="accounting-secondary-button" onClick={() => setEditingEmployee(employee)}>
                  <PencilLine size={16} />
                  Tahrirlash
                </button>
                <button
                  type="button"
                  className="accounting-primary-button"
                  onClick={() => openPaymentModal({ employee_id: employee.id, phase: employee.status === 'pending' ? 'advance' : 'salary' })}
                >
                  <Wallet size={16} />
                  To`lov yozish
                </button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="So`nggi ish haqi yozuvlari" subtitle="Chek bilan birga payroll tarixini ko`rish">
        <div className="accounting-table-wrap">
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Xodim</th>
                <th>Bosqich</th>
                <th>Summa</th>
                <th>Usul</th>
                <th>Sana</th>
                <th>Chek</th>
              </tr>
            </thead>
            <tbody>
              {(paymentsQuery.data?.payments || []).map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.full_name}</td>
                  <td>{payment.phase_label}</td>
                  <td>{formatMoney(payment.amount)}</td>
                  <td>{paymentMethodLabel(payment.payment_method)}</td>
                  <td>{formatDateTime(payment.paid_at)}</td>
                  <td>
                    <button type="button" className="accounting-mini-button" onClick={() => handleReceiptDownload(payment.id)}>
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {editingEmployee ? <EmployeeEditorModal employee={editingEmployee.id ? editingEmployee : null} onClose={() => setEditingEmployee(null)} /> : null}
    </div>
  );
}

export function TransactionsSection() {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [categorySlug, setCategorySlug] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { openTransactionModal } = useAccountingUiStore();
  const transactionQuery = useFinancialTransactions({
    q: search,
    direction,
    category_slug: categorySlug,
    from_date: fromDate,
    to_date: toDate,
    limit: 150,
  });

  const categories = useMemo(() => {
    const income = transactionQuery.data?.categories?.income || [];
    const expense = transactionQuery.data?.categories?.expense || [];
    return [...income, ...expense];
  }, [transactionQuery.data]);

  return (
    <div className="accounting-page-grid">
      <SectionCard
        title="Daromad va xarajatlar"
        subtitle="Kunlik logging, filtrlash va qidiruv orqali umumiy accounting oqimi"
        action={
          <button type="button" className="accounting-primary-button" onClick={() => openTransactionModal({ direction: 'expense' })}>
            <Plus size={16} />
            Yozuv qo`shish
          </button>
        }
        wide
      >
        <div className="accounting-toolbar accounting-toolbar--wrap">
          <label className="accounting-toolbar__search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Qidiruv" />
          </label>
          <select value={direction} onChange={(event) => setDirection(event.target.value)}>
            <option value="all">Barcha yo`nalishlar</option>
            <option value="income">Daromad</option>
            <option value="expense">Xarajat</option>
          </select>
          <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
            <option value="all">Barcha kategoriyalar</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label}
              </option>
            ))}
          </select>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>

        <div className="accounting-mini-stats">
          <div>
            <small>Daromad</small>
            <strong>{formatMoney(transactionQuery.data?.summary?.total_income || 0)}</strong>
          </div>
          <div>
            <small>Xarajat</small>
            <strong>{formatMoney(transactionQuery.data?.summary?.total_expense || 0)}</strong>
          </div>
          <div>
            <small>Sof foyda</small>
            <strong>{formatMoney(transactionQuery.data?.summary?.net_profit || 0)}</strong>
          </div>
          <div>
            <small>Payroll cost</small>
            <strong>{formatMoney(transactionQuery.data?.summary?.payroll_expense || 0)}</strong>
          </div>
        </div>

        <div className="accounting-table-wrap">
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Sarlavha</th>
                <th>Kategoriya</th>
                <th>Yo`nalish</th>
                <th>Tomon</th>
                <th>Summa</th>
              </tr>
            </thead>
            <tbody>
              {(transactionQuery.data?.transactions || []).map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.occurred_at)}</td>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="accounting-table__muted">{item.note || '—'}</div>
                  </td>
                  <td>{item.category_name}</td>
                  <td>{item.direction === 'income' ? 'Daromad' : 'Xarajat'}</td>
                  <td>{item.counterparty || '—'}</td>
                  <td>{formatMoney(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

export function ReportsSection() {
  const { reportsRangeDays, setReportsRangeDays } = useAccountingUiStore();
  const reportsQuery = useReportsSummary(reportsRangeDays);
  const exportMutation = useAccountingExport();
  const reportData = reportsQuery.data;

  async function handleExport(type) {
    const blob = await exportMutation.mutateAsync({ type, rangeDays: reportsRangeDays });
    downloadBlob(blob, `myshop-${type}-${reportsRangeDays}-kun.csv`);
  }

  return (
    <div className="accounting-page-grid">
      <SectionCard
        title="Moliyaviy hisobotlar"
        subtitle="Net profit, expense ratio va payroll costs bo`yicha chuqur tahlil"
        action={
          <div className="accounting-inline-actions">
            <label className="accounting-range-picker">
              <span>Davr</span>
              <select value={reportsRangeDays} onChange={(event) => setReportsRangeDays(Number(event.target.value))}>
                <option value={30}>30 kun</option>
                <option value={90}>90 kun</option>
                <option value={180}>180 kun</option>
                <option value={365}>365 kun</option>
              </select>
            </label>
            <button type="button" className="accounting-secondary-button" onClick={() => handleExport('transactions')}>
              <Download size={16} />
              Tranzaksiya CSV
            </button>
            <button type="button" className="accounting-primary-button" onClick={() => handleExport('payroll')}>
              <Download size={16} />
              Payroll CSV
            </button>
          </div>
        }
        wide
      >
        <div className="accounting-mini-stats">
          <div>
            <small>Sof foyda</small>
            <strong>{formatMoney(reportData?.summary?.net_profit || 0)}</strong>
          </div>
          <div>
            <small>Payroll cost</small>
            <strong>{formatMoney(reportData?.summary?.payroll_expense || 0)}</strong>
          </div>
          <div>
            <small>Kechikkan payroll</small>
            <strong>{reportData?.payroll?.overdue_count || 0}</strong>
          </div>
          <div>
            <small>Expense categories</small>
            <strong>{reportData?.top_expenses?.length || 0}</strong>
          </div>
        </div>

        <div className="accounting-dual-grid">
          <div className="accounting-chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={reportData?.month_balance || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" tickFormatter={(value) => `${Math.round(value / 1000000)} mln`} />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Line type="monotone" dataKey="profit" name="Sof foyda" stroke="#3b82f6" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="expense" name="Xarajat" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="accounting-legend-list">
            {(reportData?.top_expenses || []).map((item, index) => (
              <div key={item.name} className="accounting-legend-item">
                <span className="accounting-legend-swatch" style={{ background: ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'][index % 5] }} />
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.ratio}%</small>
                </div>
                <span>{formatMoney(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function CalendarSection() {
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7));
  const calendarQuery = usePayrollCalendar({ month_key: monthKey });
  const groupedEvents = useMemo(() => {
    const groups = new Map();
    for (const item of calendarQuery.data?.events || []) {
      const key = item.due_date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()];
  }, [calendarQuery.data]);

  return (
    <div className="accounting-page-grid">
      <SectionCard
        title="Payroll kalendari"
        subtitle="Avans va oylik ish haqi muddatlari bo`yicha to`liq ko`rinish"
        action={
          <label className="accounting-range-picker">
            <span>Oy</span>
            <input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} />
          </label>
        }
        wide
      >
        <div className="accounting-mini-stats">
          <div>
            <small>Kutilmoqda</small>
            <strong>{calendarQuery.data?.summary?.upcoming_count || 0}</strong>
          </div>
          <div>
            <small>Kechikkan</small>
            <strong>{calendarQuery.data?.summary?.overdue_count || 0}</strong>
          </div>
          <div>
            <small>To`langan</small>
            <strong>{calendarQuery.data?.summary?.paid_count || 0}</strong>
          </div>
        </div>

        <div className="accounting-calendar-grid">
          {groupedEvents.map(([date, items]) => (
            <article key={date} className="accounting-calendar-day">
              <div className="accounting-calendar-day__head">
                <CalendarDays size={16} />
                <div>
                  <strong>{formatDate(date)}</strong>
                  <small>{items.length} ta to`lov</small>
                </div>
              </div>
              <div className="accounting-calendar-day__list">
                {items.map((item) => (
                  <div key={item.id} className="accounting-calendar-event">
                    <div>
                      <strong>{item.employee_name}</strong>
                      <p>{cyclePhaseLabel(item.cycle_type)}</p>
                    </div>
                    <div className="accounting-calendar-event__meta">
                      <StatusBadge status={item.status} label={item.status_label} />
                      <span>{formatMoney(item.remaining_amount || item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function ActivitySection() {
  const activityQuery = useActivityFeed(40);

  return (
    <div className="accounting-page-grid">
      <SectionCard title="Faollik jurnali" subtitle="Audit, payroll va tranzaksiya oqimi" action={<Activity size={18} />} wide>
        <div className="accounting-feed-list">
          {(activityQuery.data?.activities || []).map((item) => (
            <article key={item.id} className="accounting-feed-item">
              <div className="accounting-feed-item__icon">
                <Activity size={16} />
              </div>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <small>{formatDateTime(item.created_at)}</small>
              </div>
              {item.amount != null ? <span>{formatMoney(item.amount)}</span> : null}
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function ReportsMiniHighlights() {
  const reportQuery = useReportsSummary(90);
  const data = reportQuery.data;

  return (
    <SectionCard title="Qisqa hisobot" subtitle="Oxirgi 90 kunlik high-level ko`rsatkichlar">
      <div className="accounting-mini-stats">
        <div>
          <small>Umumiy tushum</small>
          <strong>{formatMoney(data?.summary?.total_income || 0)}</strong>
        </div>
        <div>
          <small>Xarajat</small>
          <strong>{formatMoney(data?.summary?.total_expense || 0)}</strong>
        </div>
        <div>
          <small>Rentabellik</small>
          <strong>{data?.summary?.total_income ? `${Math.round((data.summary.net_profit / data.summary.total_income) * 100)}%` : '0%'}</strong>
        </div>
      </div>
      <div className="accounting-chart-wrap accounting-chart-wrap--compact">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data?.top_income_channels || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
            <XAxis dataKey="name" stroke="var(--text-muted)" />
            <YAxis stroke="var(--text-muted)" tickFormatter={(value) => `${Math.round(value / 1000000)} mln`} />
            <Tooltip formatter={(value) => formatMoney(value)} />
            <Bar dataKey="amount" radius={[12, 12, 4, 4]}>
              {(data?.top_income_channels || []).map((item, index) => (
                <Cell key={item.name} fill={['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#14b8a6'][index % 5]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
