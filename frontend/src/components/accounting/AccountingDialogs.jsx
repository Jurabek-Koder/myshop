import React, { useEffect, useMemo, useState } from 'react';
import { AppDialog, Button } from './AccountingPrimitives.jsx';

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--ac-muted)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--ac-subtle)]">{hint}</span> : null}
    </label>
  );
}

function baseInputClass() {
  return 'w-full rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-3 text-sm text-[var(--ac-foreground)] outline-none transition focus:border-blue-400/40 focus:bg-[var(--ac-surface-strong)]';
}

export function TransactionDialog({ open, onOpenChange, lookups, preset, mutation }) {
  const [form, setForm] = useState({
    direction: 'expense',
    title: '',
    amount: '',
    category_code: '',
    notes: '',
    occurred_at: '',
    source_type: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      direction: preset?.direction || 'expense',
      title: '',
      amount: '',
      category_code: '',
      notes: '',
      occurred_at: '',
      source_type: '',
    });
    setError('');
  }, [open, preset]);

  const categories = useMemo(
    () =>
      form.direction === 'expense'
        ? lookups?.expense_categories || []
        : lookups?.income_categories || [],
    [form.direction, lookups],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync({
        direction: form.direction,
        title: form.title,
        amount: Number(form.amount),
        category_code: form.category_code,
        notes: form.notes,
        occurred_at: form.occurred_at || undefined,
        source_type:
          form.source_type || (form.direction === 'expense' ? 'manual_expense' : 'manual_income'),
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError.message || 'Saqlashda xatolik yuz berdi.');
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.direction === 'expense' ? 'Yangi xarajat' : 'Yangi tushum'}
      description="Kunlik kirim-chiqimlarni kategoriya bo‘yicha qayd eting."
      footer={[
        <Button key="cancel" type="button" onClick={() => onOpenChange(false)}>
          Bekor qilish
        </Button>,
        <Button
          key="submit"
          type="submit"
          form="accounting-transaction-form"
          variant="primary"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
        </Button>,
      ]}
    >
      <form id="accounting-transaction-form" className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Yo‘nalish">
          <select
            className={baseInputClass()}
            value={form.direction}
            onChange={(event) => setForm((prev) => ({ ...prev, direction: event.target.value, category_code: '' }))}
          >
            <option value="expense">Xarajat</option>
            <option value="income">Tushum</option>
          </select>
        </Field>
        <Field label="Kategoriya">
          <select
            className={baseInputClass()}
            value={form.category_code}
            onChange={(event) => setForm((prev) => ({ ...prev, category_code: event.target.value }))}
          >
            <option value="">Tanlang</option>
            {categories.map((category) => (
              <option key={category.id} value={category.code}>
                {category.label_uz}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sarlavha">
          <input
            className={baseInputClass()}
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Masalan, elektr to‘lovi"
          />
        </Field>
        <Field label="Summa">
          <input
            className={baseInputClass()}
            type="number"
            min="0"
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder="0"
          />
        </Field>
        <Field label="Sana">
          <input
            className={baseInputClass()}
            type="datetime-local"
            value={form.occurred_at}
            onChange={(event) => setForm((prev) => ({ ...prev, occurred_at: event.target.value }))}
          />
        </Field>
        <Field label="Manba turi">
          <input
            className={baseInputClass()}
            value={form.source_type}
            onChange={(event) => setForm((prev) => ({ ...prev, source_type: event.target.value }))}
            placeholder={form.direction === 'expense' ? 'manual_expense' : 'manual_income'}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Izoh">
            <textarea
              className={`${baseInputClass()} min-h-28 resize-y`}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Qo‘shimcha ma’lumot"
            />
          </Field>
        </div>
        {error ? <p className="md:col-span-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </AppDialog>
  );
}

export function PaymentDialog({ open, onOpenChange, employees, preset, mutation }) {
  const [form, setForm] = useState({
    employee_id: '',
    cycle_type: 'advance',
    amount: '',
    payment_method: 'cash',
    payment_note: '',
    paid_at: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      employee_id: preset?.employee_id ? String(preset.employee_id) : '',
      cycle_type: preset?.cycle_type || 'advance',
      amount: '',
      payment_method: 'cash',
      payment_note: '',
      paid_at: '',
    });
    setError('');
  }, [open, preset]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync({
        employee_id: Number(form.employee_id),
        cycle_type: form.cycle_type,
        amount: form.amount ? Number(form.amount) : undefined,
        payment_method: form.payment_method,
        payment_note: form.payment_note,
        paid_at: form.paid_at || undefined,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError.message || 'To‘lovni saqlab bo‘lmadi.');
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.cycle_type === 'advance' ? 'Avans berish' : 'Oylik to‘lash'}
      description="15 kunlik sikl bo‘yicha xodimga to‘lov yozuvini yarating."
      footer={[
        <Button key="cancel" type="button" onClick={() => onOpenChange(false)}>
          Bekor qilish
        </Button>,
        <Button key="submit" type="submit" form="accounting-payment-form" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Yozilmoqda...' : 'To‘lovni yozish'}
        </Button>,
      ]}
    >
      <form id="accounting-payment-form" className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Xodim">
          <select
            className={baseInputClass()}
            value={form.employee_id}
            onChange={(event) => setForm((prev) => ({ ...prev, employee_id: event.target.value }))}
          >
            <option value="">Tanlang</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} — {employee.role_title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To‘lov turi">
          <select
            className={baseInputClass()}
            value={form.cycle_type}
            onChange={(event) => setForm((prev) => ({ ...prev, cycle_type: event.target.value }))}
          >
            <option value="advance">Avans</option>
            <option value="salary">Oylik ish haqi</option>
          </select>
        </Field>
        <Field label="Summa" hint="Bo‘sh qoldirilsa, qolgan balans to‘liq yopiladi.">
          <input
            className={baseInputClass()}
            type="number"
            min="0"
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder="Masalan, 2500000"
          />
        </Field>
        <Field label="To‘lov usuli">
          <select
            className={baseInputClass()}
            value={form.payment_method}
            onChange={(event) => setForm((prev) => ({ ...prev, payment_method: event.target.value }))}
          >
            <option value="cash">Naqd</option>
            <option value="card">Karta</option>
            <option value="bank_transfer">Bank o‘tkazmasi</option>
          </select>
        </Field>
        <Field label="To‘lov sanasi">
          <input
            className={baseInputClass()}
            type="datetime-local"
            value={form.paid_at}
            onChange={(event) => setForm((prev) => ({ ...prev, paid_at: event.target.value }))}
          />
        </Field>
        <Field label="Izoh">
          <input
            className={baseInputClass()}
            value={form.payment_note}
            onChange={(event) => setForm((prev) => ({ ...prev, payment_note: event.target.value }))}
            placeholder="Qisqa izoh"
          />
        </Field>
        {error ? <p className="md:col-span-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </AppDialog>
  );
}

export function EmployeeDialog({ open, onOpenChange, draft, onSubmit, busy = false }) {
  const [form, setForm] = useState({
    full_name: '',
    role_title: 'Xodim',
    phone: '',
    telegram_chat_id: '',
    monthly_salary: '',
    advance_percent: '50',
    status: 'active',
    hire_date: '',
    notes: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      full_name: draft?.full_name || '',
      role_title: draft?.role_title || 'Xodim',
      phone: draft?.phone || '',
      telegram_chat_id: draft?.telegram_chat_id || '',
      monthly_salary: draft?.monthly_salary ? String(draft.monthly_salary) : '',
      advance_percent: draft?.advance_percent ? String(draft.advance_percent) : '50',
      status: draft?.employment_status || draft?.status || 'active',
      hire_date: draft?.hire_date || '',
      notes: draft?.notes || '',
    });
    setError('');
  }, [open, draft]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit({
        full_name: form.full_name,
        role_title: form.role_title,
        phone: form.phone,
        telegram_chat_id: form.telegram_chat_id,
        monthly_salary: Number(form.monthly_salary),
        advance_percent: Number(form.advance_percent),
        status: form.status,
        hire_date: form.hire_date || undefined,
        notes: form.notes,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError.message || 'Saqlashda xatolik yuz berdi.');
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={draft?.id ? 'Xodim kartasini tahrirlash' : 'Yangi xodim qo‘shish'}
      description="Ish haqi avtomatizatsiyasi uchun xodim profilini to‘ldiring."
      footer={[
        <Button key="cancel" type="button" onClick={() => onOpenChange(false)}>
          Bekor qilish
        </Button>,
        <Button key="submit" type="submit" form="accounting-employee-form" variant="primary" disabled={busy}>
          {busy ? 'Saqlanmoqda...' : 'Saqlash'}
        </Button>,
      ]}
    >
      <form id="accounting-employee-form" className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="F.I.Sh.">
          <input
            className={baseInputClass()}
            value={form.full_name}
            onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
          />
        </Field>
        <Field label="Lavozim">
          <input
            className={baseInputClass()}
            value={form.role_title}
            onChange={(event) => setForm((prev) => ({ ...prev, role_title: event.target.value }))}
          />
        </Field>
        <Field label="Telefon">
          <input
            className={baseInputClass()}
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
        </Field>
        <Field label="Telegram chat ID">
          <input
            className={baseInputClass()}
            value={form.telegram_chat_id}
            onChange={(event) => setForm((prev) => ({ ...prev, telegram_chat_id: event.target.value }))}
            placeholder="Masalan, 123456789"
          />
        </Field>
        <Field label="Oylik maoshi">
          <input
            className={baseInputClass()}
            type="number"
            min="0"
            value={form.monthly_salary}
            onChange={(event) => setForm((prev) => ({ ...prev, monthly_salary: event.target.value }))}
          />
        </Field>
        <Field label="Avans foizi">
          <input
            className={baseInputClass()}
            type="number"
            min="0"
            max="100"
            value={form.advance_percent}
            onChange={(event) => setForm((prev) => ({ ...prev, advance_percent: event.target.value }))}
          />
        </Field>
        <Field label="Ishga kirgan sana">
          <input
            className={baseInputClass()}
            type="date"
            value={form.hire_date}
            onChange={(event) => setForm((prev) => ({ ...prev, hire_date: event.target.value }))}
          />
        </Field>
        <Field label="Holat">
          <select
            className={baseInputClass()}
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="active">Faol</option>
            <option value="inactive">Nofaol</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Izoh">
            <textarea
              className={`${baseInputClass()} min-h-24 resize-y`}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Field>
        </div>
        {error ? <p className="md:col-span-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </AppDialog>
  );
}
