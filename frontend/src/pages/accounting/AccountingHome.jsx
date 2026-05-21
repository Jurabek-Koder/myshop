import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  Download,
  FileText,
  Landmark,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Send,
  Sparkles,
  Sun,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AccountingDashboard.css';

const money = new Intl.NumberFormat('uz-UZ');

function formatMoney(value) {
  return `${money.format(Math.round(Number(value) || 0))} so‘m`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'So‘rov bajarilmadi.');
  return data;
}

function KpiCard({ title, value, delta, icon: Icon, tone }) {
  const positive = Number(delta) >= 0;
  return (
    <motion.article className={`acc-kpi-card acc-kpi-card--${tone}`} whileHover={{ y: -4, scale: 1.01 }}>
      <div className="acc-kpi-icon"><Icon size={20} /></div>
      <div>
        <p>{title}</p>
        <strong>{formatMoney(value)}</strong>
        <span className={positive ? 'acc-delta-positive' : 'acc-delta-negative'}>
          {positive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
          {Math.abs(Number(delta) || 0).toFixed(1)}%
        </span>
      </div>
    </motion.article>
  );
}

function StatusBadge({ status }) {
  const label = status === 'paid' ? 'To‘landi' : status === 'overdue' ? 'Kechikkan' : 'Kutilmoqda';
  return <span className={`acc-status acc-status--${status || 'pending'}`}>{label}</span>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="acc-modal-backdrop" onMouseDown={onClose}>
      <motion.div className="acc-modal" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="acc-modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>Yopish</button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export default function AccountingHome() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');

  const overviewQuery = useQuery({
    queryKey: ['accounting-modern-overview'],
    queryFn: async () => readJson(await request('/accounting/portal/modern/overview')),
    refetchInterval: 30000,
  });
  const payrollQuery = useQuery({
    queryKey: ['accounting-modern-payroll'],
    queryFn: async () => readJson(await request('/accounting/portal/modern/payroll')),
  });
  const categoriesQuery = useQuery({
    queryKey: ['accounting-modern-categories'],
    queryFn: async () => readJson(await request('/accounting/portal/modern/categories')),
  });
  const transactionsQuery = useQuery({
    queryKey: ['accounting-modern-transactions', search],
    queryFn: async () => readJson(await request(`/accounting/portal/modern/transactions?search=${encodeURIComponent(search)}`)),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounting-modern-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-modern-payroll'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-modern-transactions'] }),
    ]);
  };

  const transactionMutation = useMutation({
    mutationFn: async (payload) => readJson(await request('/accounting/portal/modern/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })),
    onSuccess: async () => {
      setModal(null);
      await invalidate();
    },
  });

  const salaryMutation = useMutation({
    mutationFn: async (payload) => readJson(await request('/accounting/portal/modern/payroll/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })),
    onSuccess: async (data) => {
      setModal(null);
      await invalidate();
      if (data.receipt_id) window.open(`/api/accounting/portal/modern/receipts/${data.receipt_id}/pdf`, '_blank', 'noopener,noreferrer');
    },
  });

  const employeeMutation = useMutation({
    mutationFn: async ({ id, ...payload }) => readJson(await request(`/accounting/portal/modern/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })),
    onSuccess: invalidate,
  });

  const reminderMutation = useMutation({
    mutationFn: async () => readJson(await request('/accounting/portal/modern/payroll/reminders', { method: 'POST', body: JSON.stringify({}) })),
    onSuccess: invalidate,
  });

  const overview = overviewQuery.data || {};
  const payroll = payrollQuery.data || {};
  const transactions = transactionsQuery.data?.transactions || [];
  const employees = payroll.employees || [];
  const categories = categoriesQuery.data || { expense: [], income: [] };

  const quickStats = overview.payroll_summary || {};
  const selectedEmployee = employees[0] || null;
  const filteredEmployees = useMemo(() => employees.slice(0, 6), [employees]);

  return (
    <div className="acc-saas-shell">
      <section className="acc-hero">
        <div>
          <span className="acc-eyebrow"><Sparkles size={16} /> Real-time buxgalteriya</span>
          <h1>Boshqaruv paneli</h1>
          <p>MyShop uchun daromad, xarajat, ish haqi, 15 kunlik avans sikllari va kvitansiyalar bir joyda.</p>
        </div>
        <div className="acc-hero-actions">
          <button type="button" onClick={() => setModal({ type: 'transaction', flow: 'expense' })}><Plus size={17} /> Yangi xarajat qo‘shish</button>
          <button type="button" onClick={() => setModal({ type: 'salary', employee: selectedEmployee })}><WalletCards size={17} /> Oylik to‘lash</button>
          <button type="button" onClick={() => reminderMutation.mutate()}><BellRing size={17} /> Eslatma yuborish</button>
        </div>
      </section>

      <section className="acc-kpi-grid">
        <KpiCard title="Umumiy tushum" value={overview.kpis?.total_revenue} delta={overview.kpis?.revenue_delta} icon={Landmark} tone="blue" />
        <KpiCard title="Umumiy xarajatlar" value={overview.kpis?.total_expenses} delta={overview.kpis?.expense_delta} icon={ArrowDownRight} tone="rose" />
        <KpiCard title="Sof foyda" value={overview.kpis?.net_profit} delta={overview.kpis?.profit_delta} icon={ArrowUpRight} tone="emerald" />
        <KpiCard title="Oyliklar uchun jami xarajat" value={overview.kpis?.payroll_cost} delta={0} icon={WalletCards} tone="violet" />
      </section>

      <section className="acc-dashboard-grid">
        <article className="acc-panel acc-panel-wide">
          <div className="acc-panel-head">
            <div>
              <h2>Moliyaviy tahlil</h2>
              <p>Oylik tushum, xarajat, payroll va sof foyda trendi</p>
            </div>
            <span className="acc-live"><Activity size={14} /> Jonli statistika</span>
          </div>
          <div className="acc-chart">
            <ResponsiveContainer width="100%" height={310}>
              <AreaChart data={overview.trends || []}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.22)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000000)} mln`} stroke="#94a3b8" />
                <Tooltip formatter={(v) => formatMoney(v)} labelFormatter={(v) => `${v} oyi`} />
                <Area type="monotone" dataKey="tushum" name="Tushum" stroke="#2563eb" fill="url(#revenue)" strokeWidth={3} />
                <Area type="monotone" dataKey="foyda" name="Sof foyda" stroke="#10b981" fill="url(#profit)" strokeWidth={3} />
                <Bar dataKey="xarajat" name="Xarajat" fill="#fb7185" radius={[6, 6, 0, 0]} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="acc-panel">
          <div className="acc-panel-head">
            <div>
              <h2>Xarajat ulushi</h2>
              <p>Kategoriya bo‘yicha nisbat</p>
            </div>
          </div>
          <div className="acc-donut">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={overview.expense_breakdown || []} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={4}>
                  {(overview.expense_breakdown || []).map((entry) => <Cell key={entry.name} fill={entry.color || '#64748b'} />)}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="acc-ratio-list">
            {(overview.expense_breakdown || []).slice(0, 4).map((item) => (
              <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>
            ))}
          </div>
        </article>
      </section>

      <section className="acc-dashboard-grid">
        <article className="acc-panel acc-panel-wide">
          <div className="acc-panel-head">
            <div>
              <h2>Ish haqi boshqaruvi</h2>
              <p>15 kunlik avans va oy oxiri oylik sikllari</p>
            </div>
            <div className="acc-payroll-mini">
              <span>To‘landi: {quickStats.paid_cycles || 0}</span>
              <span>Kutilmoqda: {quickStats.pending_cycles || 0}</span>
              <span>Kechikkan: {quickStats.overdue_cycles || 0}</span>
            </div>
          </div>
          <div className="acc-employee-grid">
            {filteredEmployees.map((employee) => (
              <motion.div className="acc-employee-card" key={employee.id} whileHover={{ y: -3 }}>
                <div className="acc-employee-top">
                  <div className="acc-avatar">{String(employee.full_name || 'X').slice(0, 1)}</div>
                  <StatusBadge status={employee.status} />
                </div>
                <h3>{employee.full_name}</h3>
                <p>Oylik ish haqi: <b>{formatMoney(employee.monthly_salary)}</b></p>
                <div className="acc-employee-meta">
                  <span>Oxirgi to‘lov: {employee.last_payment_at ? formatDate(employee.last_payment_at) : '—'}</span>
                  <span>Keyingi sana: {formatDate(employee.next_payment_date)}</span>
                  <span>Qolgan balans: {formatMoney(employee.remaining_balance)}</span>
                </div>
                <div className="acc-employee-actions">
                  <button type="button" onClick={() => setModal({ type: 'salary', employee })}>To‘lov</button>
                  <button type="button" onClick={() => setModal({ type: 'employee', employee })}>Sozlash</button>
                </div>
              </motion.div>
            ))}
            {!filteredEmployees.length && <div className="acc-empty">Superuser xodimlar topilmadi.</div>}
          </div>
        </article>

        <article className="acc-panel">
          <div className="acc-panel-head">
            <div>
              <h2>Payroll kalendar</h2>
              <p>Yaqin to‘lov muddatlari</p>
            </div>
          </div>
          <div className="acc-calendar-list">
            {(overview.upcoming_payroll || []).map((item) => (
              <div key={item.id} className="acc-calendar-item">
                <CalendarClock size={18} />
                <div>
                  <b>{item.full_name}</b>
                  <span>{item.cycle_label} · {formatDate(item.due_date)}</span>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="acc-dashboard-grid">
        <article className="acc-panel acc-panel-wide">
          <div className="acc-panel-head">
            <div>
              <h2>Xarajat va daromadlar</h2>
              <p>Kunlik logging, qidiruv, kategoriya va export</p>
            </div>
            <div className="acc-table-actions">
              <label><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish" /></label>
              <button type="button" onClick={() => setModal({ type: 'transaction', flow: 'income' })}><Plus size={16} /> Daromad</button>
              <button type="button" onClick={() => exportCsv(transactions)}><Download size={16} /> Excel CSV</button>
            </div>
          </div>
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead><tr><th>Nomi</th><th>Kategoriya</th><th>Turi</th><th>Summa</th><th>Sana</th><th>Receipt</th></tr></thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.category_name || '—'}</td>
                    <td>{t.type === 'income' ? 'Daromad' : 'Xarajat'}</td>
                    <td className={t.type === 'income' ? 'acc-green' : 'acc-red'}>{formatMoney(t.amount)}</td>
                    <td>{formatDate(t.transaction_date)}</td>
                    <td>{t.receipt_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!transactions.length && <div className="acc-empty">Hozircha tranzaksiya yo‘q.</div>}
          </div>
        </article>

        <article className="acc-panel">
          <div className="acc-panel-head">
            <div>
              <h2>Faollik lentasi</h2>
              <p>Oxirgi to‘lov va operatsiyalar</p>
            </div>
          </div>
          <div className="acc-activity-feed">
            {(overview.activity || []).map((item) => (
              <div key={item.id} className="acc-activity-item">
                <span><ReceiptText size={16} /></span>
                <div><b>{item.title}</b><small>{item.subtitle} · {formatDate(item.occurred_at)}</small></div>
                <em>{formatMoney(item.amount)}</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <nav className="acc-bottom-nav">
        <button type="button"><Sun size={18} /> Panel</button>
        <button type="button" onClick={() => setModal({ type: 'salary', employee: selectedEmployee })}><WalletCards size={18} /> Oylik</button>
        <button type="button" onClick={() => setModal({ type: 'transaction', flow: 'expense' })}><Plus size={20} /> Xarajat</button>
        <button type="button"><Moon size={18} /> Hisobot</button>
      </nav>

      {modal?.type === 'transaction' && (
        <TransactionModal
          flow={modal.flow}
          categories={modal.flow === 'income' ? categories.income : categories.expense}
          busy={transactionMutation.isPending}
          error={transactionMutation.error?.message}
          onClose={() => setModal(null)}
          onSubmit={(payload) => transactionMutation.mutate(payload)}
        />
      )}
      {modal?.type === 'salary' && modal.employee && (
        <SalaryModal
          employee={modal.employee}
          busy={salaryMutation.isPending}
          error={salaryMutation.error?.message}
          onClose={() => setModal(null)}
          onSubmit={(payload) => salaryMutation.mutate(payload)}
        />
      )}
      {modal?.type === 'employee' && modal.employee && (
        <EmployeeModal
          employee={modal.employee}
          busy={employeeMutation.isPending}
          error={employeeMutation.error?.message}
          onClose={() => setModal(null)}
          onSubmit={(payload) => employeeMutation.mutate(payload)}
        />
      )}
    </div>
  );
}

function TransactionModal({ flow, categories, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ type: flow, title: '', amount: '', category_slug: categories?.[0]?.slug || '', note: '', transaction_date: new Date().toISOString().slice(0, 10) });
  return (
    <Modal title={flow === 'income' ? 'Yangi daromad qo‘shish' : 'Yangi xarajat qo‘shish'} onClose={onClose}>
      <form className="acc-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }); }}>
        <label>Nomi<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label>Summa<input required type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        <label>Kategoriya<select value={form.category_slug} onChange={(e) => setForm({ ...form, category_slug: e.target.value })}>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
        <label>Sana<input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} /></label>
        <label>Izoh<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        {error && <p className="acc-form-error">{error}</p>}
        <button disabled={busy} type="submit"><FileText size={17} /> {busy ? 'Saqlanmoqda...' : 'Saqlash'}</button>
      </form>
    </Modal>
  );
}

function SalaryModal({ employee, busy, error, onClose, onSubmit }) {
  const openCycles = (employee.cycles || []).filter((c) => c.status !== 'paid');
  const first = openCycles[0] || employee.cycles?.[0];
  const [form, setForm] = useState({ payroll_cycle_id: first?.id || '', amount: first?.remaining_amount || '', payment_method: 'cash', note: '' });
  return (
    <Modal title={`${employee.full_name} — ish haqi to‘lovi`} onClose={onClose}>
      <form className="acc-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ employee_id: employee.id, ...form, amount: Number(form.amount) }); }}>
        <label>Sikl<select value={form.payroll_cycle_id} onChange={(e) => {
          const cycle = (employee.cycles || []).find((c) => String(c.id) === e.target.value);
          setForm({ ...form, payroll_cycle_id: e.target.value, amount: cycle?.remaining_amount || '' });
        }}>{(employee.cycles || []).map((c) => <option key={c.id} value={c.id}>{c.cycle_label} · {formatDate(c.due_date)} · {c.status_label}</option>)}</select></label>
        <label>Summa<input required type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        <label>To‘lov usuli<select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Naqd</option><option value="card">Karta</option><option value="bank">Bank</option></select></label>
        <label>Izoh<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        {error && <p className="acc-form-error">{error}</p>}
        <button disabled={busy || !form.payroll_cycle_id} type="submit"><Send size={17} /> {busy ? 'To‘lanmoqda...' : 'To‘lash va receipt yaratish'}</button>
      </form>
    </Modal>
  );
}

function EmployeeModal({ employee, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ monthly_salary: employee.monthly_salary || '', telegram_chat_id: employee.telegram_chat_id || '' });
  return (
    <Modal title={`${employee.full_name} — maosh sozlamasi`} onClose={onClose}>
      <form className="acc-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ id: employee.id, monthly_salary: Number(form.monthly_salary), telegram_chat_id: form.telegram_chat_id }); }}>
        <label>Oylik ish haqi<input required type="number" min="0" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></label>
        <label>Telegram chat ID<input value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} placeholder="Masalan: 123456789" /></label>
        {error && <p className="acc-form-error">{error}</p>}
        <button disabled={busy} type="submit"><WalletCards size={17} /> {busy ? 'Saqlanmoqda...' : 'Saqlash'}</button>
      </form>
    </Modal>
  );
}

function exportCsv(rows) {
  const header = ['Nomi', 'Kategoriya', 'Turi', 'Summa', 'Sana', 'Izoh'];
  const body = rows.map((r) => [r.title, r.category_name || '', r.type === 'income' ? 'Daromad' : 'Xarajat', r.amount, r.transaction_date, r.note || '']);
  const csv = [header, ...body].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'myshop-buxgalteriya.csv';
  a.click();
  URL.revokeObjectURL(url);
}
