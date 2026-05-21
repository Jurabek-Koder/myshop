import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  ActivitySection,
  CalendarSection,
  PayrollSection,
  ReportsMiniHighlights,
  ReportsSection,
  TransactionsSection,
} from './AccountingSections.jsx';

const LEGACY_TO_SECTION = {
  packer: 'payroll',
  picker: 'payroll',
  courier: 'payroll',
  operator: 'payroll',
  seller: 'transactions',
  stats: 'reports',
};

export default function AccountingStub() {
  const { section } = useParams();
  const raw = String(section || '').trim().toLowerCase();
  const key = LEGACY_TO_SECTION[raw] || raw;

  if (key === 'payroll') return <PayrollSection />;
  if (key === 'transactions') return <TransactionsSection />;
  if (key === 'reports') return <ReportsSection />;
  if (key === 'calendar') return <CalendarSection />;
  if (key === 'activity') return <ActivitySection />;
  if (key === 'summary') return <ReportsMiniHighlights />;

  return <Navigate to="/accounting" replace />;
}
