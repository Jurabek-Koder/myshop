import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import AccountingPackerPage from './AccountingPackerPage.jsx';
import AccountingWorkRoleFinancePage from './AccountingWorkRoleFinancePage.jsx';
import AccountingPayrollPage from './AccountingPayrollPage.jsx';
import AccountingTransactionsPage from './AccountingTransactionsPage.jsx';
import AccountingReportsPage from './AccountingReportsPage.jsx';

const FINANCE_KINDS = new Set(['picker', 'courier', 'operator', 'seller']);

const SECTION_TITLES = {
  picker: 'Picker',
  courier: 'Kuryer',
  operator: 'Operator',
  seller: 'Seller',
};

/** Buxgalteriya ichidagi bo‘lim sahifalari (rollik panellar emas). */
export default function AccountingStub() {
  const { section } = useParams();
  const key = String(section || '')
    .toLowerCase()
    .trim();

  if (key === 'payroll') return <AccountingPayrollPage />;
  if (key === 'transactions') return <AccountingTransactionsPage />;
  if (key === 'reports') return <AccountingReportsPage />;
  if (key === 'analytics') return <AccountingReportsPage analyticsMode />;

  if (key === 'packer') return <AccountingPackerPage />;

  if (key === 'stats') {
    return (
      <div className="accounting-surface-page">
        <div className="accounting-surface-card accounting-stats-empty-card" aria-label="Sayt statistikasi">
          <div className="accounting-surface-card-accent" aria-hidden />
          <div className="accounting-surface-card-inner accounting-stats-empty-inner" />
        </div>
      </div>
    );
  }

  if (FINANCE_KINDS.has(key)) {
    const title = SECTION_TITLES[key] || key;
    return <AccountingWorkRoleFinancePage kind={key} title={title} />;
  }

  return <Navigate to="/accounting" replace />;
}
