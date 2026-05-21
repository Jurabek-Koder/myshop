import React from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { useAccountingEmployeesQuery } from '../../lib/accounting/api.js';
import { useAccountingStore } from '../../lib/accounting/store.js';
import { formatMoney } from '../../lib/accounting/format.js';
import {
  Button,
  EmptyState,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../../components/accounting/AccountingPrimitives.jsx';

const inputClass =
  'w-full rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface)] px-4 py-2.5 text-sm text-[var(--ac-foreground)] outline-none transition focus:border-blue-400/40';

export default function AccountingEmployeesPage() {
  const employeeFilters = useAccountingStore((state) => state.employeeFilters);
  const setEmployeeFilters = useAccountingStore((state) => state.setEmployeeFilters);
  const openEmployeeDialog = useAccountingStore((state) => state.openEmployeeDialog);
  const query = useAccountingEmployeesQuery(employeeFilters);

  const employees = query.data?.employees || [];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Xodimlar"
        title="Mas’ul xodimlar"
        description="Ish haqi kartalari, oylik miqdori va kelgusi to‘lov sanalarini bir markazdan tahrirlang."
        actions={[
          <Button key="create" variant="primary" onClick={() => openEmployeeDialog(null)}>
            <Plus className="h-4 w-4" />
            Yangi xodim
          </Button>,
        ]}
      />

      <SurfaceCard className="grid gap-3 md:grid-cols-3">
        <label className="space-y-2 md:col-span-2">
          <span className="flex items-center gap-2 text-sm text-[var(--ac-muted)]">
            <Search className="h-4 w-4" />
            Qidiruv
          </span>
          <input
            className={inputClass}
            value={employeeFilters.search}
            onChange={(event) => setEmployeeFilters({ search: event.target.value })}
            placeholder="F.I.Sh., lavozim yoki telefon"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-[var(--ac-muted)]">Holat</span>
          <select className={inputClass} value={employeeFilters.status} onChange={(event) => setEmployeeFilters({ status: event.target.value })}>
            <option value="">Barchasi</option>
            <option value="active">Faol</option>
            <option value="inactive">Nofaol</option>
          </select>
        </label>
      </SurfaceCard>

      {query.isError ? (
        <EmptyState
          title="Xodimlar ro‘yxati yuklanmadi"
          description={query.error?.message || 'Server bilan bog‘lanib bo‘lmadi.'}
          action={<Button variant="primary" onClick={() => query.refetch()}>Qayta urinish</Button>}
        />
      ) : employees.length === 0 ? (
        <EmptyState
          title="Xodimlar topilmadi"
          description="Hali payroll kartalari yaratilmagan. Yangi xodim qo‘shib tizimni ishga tushiring."
          action={<Button variant="primary" onClick={() => openEmployeeDialog(null)}>Xodim qo‘shish</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => (
            <SurfaceCard key={employee.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ac-foreground)]">{employee.full_name}</h2>
                  <p className="text-sm text-[var(--ac-muted)]">{employee.role_title}</p>
                </div>
                <StatusBadge status={employee.status}>{employee.status_label}</StatusBadge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-3">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Oylik</span>
                  <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(employee.monthly_salary)}</strong>
                </div>
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-3">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Qolgan balans</span>
                  <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{formatMoney(employee.remaining_balance)}</strong>
                </div>
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-3">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Keyingi to‘lov</span>
                  <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">{employee.next_payment_date || '-'}</strong>
                </div>
                <div className="rounded-2xl border border-[var(--ac-border)] bg-[var(--ac-surface-muted)] p-3">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--ac-subtle)]">Oxirgi to‘lov</span>
                  <strong className="mt-1 block text-sm text-[var(--ac-foreground)]">
                    {employee.last_payment_at ? employee.last_payment_at.slice(0, 10) : '-'}
                  </strong>
                </div>
              </div>

              <div className="space-y-2 text-sm text-[var(--ac-muted)]">
                {employee.phone ? <p>Telefon: {employee.phone}</p> : null}
                {employee.notes ? <p>Izoh: {employee.notes}</p> : null}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--ac-subtle)]">{employee.next_payment_label}</span>
                <Button variant="secondary" size="sm" onClick={() => openEmployeeDialog(employee)}>
                  <Pencil className="h-4 w-4" />
                  Tahrirlash
                </Button>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}
    </div>
  );
}
