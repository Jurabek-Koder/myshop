import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import AccountingPayrollPage from './AccountingPayrollPage.jsx';
import AccountingTransactionsPage from './AccountingTransactionsPage.jsx';
import AccountingReportsPage from './AccountingReportsPage.jsx';
import AccountingActivityPage from './AccountingActivityPage.jsx';
import AccountingReceiptsPage from './AccountingReceiptsPage.jsx';

/** Buxgalteriya ichidagi bo‘lim sahifalari (rollik panellar emas). */
export default function AccountingStub() {
  const { section } = useParams();
  const key = String(section || '')
    .toLowerCase()
    .trim();
  if (key === 'payroll') return <AccountingPayrollPage />;
  if (key === 'transactions') return <AccountingTransactionsPage />;
  if (key === 'reports') return <AccountingReportsPage />;
  if (key === 'activity') return <AccountingActivityPage />;
  if (key === 'receipts') return <AccountingReceiptsPage />;

  return <Navigate to="/accounting" replace />;
}
