import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

/** Buxgalteriya ichidagi bo‘lim sahifalari (rollik panellar emas). */
export default function AccountingStub() {
  const { section } = useParams();
  const key = String(section || '')
    .toLowerCase()
    .trim();
  if (['packer', 'picker', 'courier', 'operator', 'seller', 'stats'].includes(key)) {
    return <Navigate to="/accounting/reports" replace />;
  }
  return <Navigate to="/accounting" replace />;
}
