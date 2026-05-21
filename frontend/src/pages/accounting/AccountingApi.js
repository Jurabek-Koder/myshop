import { useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Server xatosi');
  }
  return data;
}

export function useAccountingApi() {
  const { request } = useAuth();

  const getDashboard = useCallback(
    async (rangeDays = 30) => parseResponse(await request(`/accounting/portal/dashboard?range_days=${rangeDays}`)),
    [request],
  );

  const getPayrollEmployees = useCallback(
    async () => parseResponse(await request('/accounting/portal/payroll/employees')),
    [request],
  );

  const getPayrollCalendar = useCallback(
    async () => parseResponse(await request('/accounting/portal/payroll/calendar?days=45')),
    [request],
  );

  const createPayrollPayment = useCallback(
    async (payload) =>
      parseResponse(
        await request('/accounting/portal/payroll/payments', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ),
    [request],
  );

  const getTransactions = useCallback(
    async (params = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value != null && String(value).trim() !== '') query.set(key, String(value));
      });
      const suffix = query.toString();
      const url = `/accounting/portal/transactions${suffix ? `?${suffix}` : ''}`;
      return parseResponse(await request(url));
    },
    [request],
  );

  const createTransaction = useCallback(
    async (payload) =>
      parseResponse(
        await request('/accounting/portal/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ),
    [request],
  );

  const getReportSummary = useCallback(
    async (rangeDays = 30) =>
      parseResponse(await request(`/accounting/portal/reports/summary?range_days=${rangeDays}`)),
    [request],
  );

  const getCategories = useCallback(
    async () => parseResponse(await request('/accounting/portal/meta/categories')),
    [request],
  );

  return {
    getDashboard,
    getPayrollEmployees,
    getPayrollCalendar,
    createPayrollPayment,
    getTransactions,
    createTransaction,
    getReportSummary,
    getCategories,
  };
}
