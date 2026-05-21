import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

function toSearchParams(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === '' || value === 'all') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!response.ok) {
    throw new Error(data?.error || 'So`rov bajarilmadi.');
  }
  return data;
}

export function useAccountingClient() {
  const { request } = useAuth();

  return useMemo(
    () => ({
      async get(path, params) {
        const response = await request(`/accounting/erp${path}${toSearchParams(params)}`);
        return parseJsonResponse(response);
      },
      async post(path, body) {
        const response = await request(`/accounting/erp${path}`, {
          method: 'POST',
          body: JSON.stringify(body || {}),
        });
        return parseJsonResponse(response);
      },
      async patch(path, body) {
        const response = await request(`/accounting/erp${path}`, {
          method: 'PATCH',
          body: JSON.stringify(body || {}),
        });
        return parseJsonResponse(response);
      },
      async getBlob(path, params) {
        const response = await request(`/accounting/erp${path}${toSearchParams(params)}`);
        if (!response.ok) {
          const text = await response.text();
          let data = {};
          try {
            data = JSON.parse(text);
          } catch {
            data = {};
          }
          throw new Error(data?.error || 'Fayl yuklanmadi.');
        }
        return response.blob();
      },
    }),
    [request],
  );
}

export function useAccountingOverview(rangeDays) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'overview', rangeDays],
    queryFn: () => client.get('/overview', { range_days: rangeDays }),
    staleTime: 30_000,
  });
}

export function usePayrollEmployees(filters) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'payroll', 'employees', filters],
    queryFn: () => client.get('/payroll/employees', filters),
    staleTime: 20_000,
  });
}

export function usePayrollPayments(filters) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'payroll', 'payments', filters],
    queryFn: () => client.get('/payroll/payments', filters),
    staleTime: 20_000,
  });
}

export function usePayrollCalendar(filters) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'payroll', 'calendar', filters],
    queryFn: () => client.get('/payroll/calendar', filters),
    staleTime: 20_000,
  });
}

export function useFinancialTransactions(filters) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'transactions', filters],
    queryFn: () => client.get('/transactions', filters),
    staleTime: 20_000,
  });
}

export function useReportsSummary(rangeDays) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'reports', rangeDays],
    queryFn: () => client.get('/reports/summary', { range_days: rangeDays }),
    staleTime: 20_000,
  });
}

export function useActivityFeed(limit = 40) {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'activity', limit],
    queryFn: () => client.get('/activity', { limit }),
    staleTime: 15_000,
  });
}

export function useAccountingNotifications() {
  const client = useAccountingClient();
  return useQuery({
    queryKey: ['accounting', 'notifications'],
    queryFn: () => client.get('/notifications'),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

function invalidateAccounting(queryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['accounting', 'overview'] }),
    queryClient.invalidateQueries({ queryKey: ['accounting', 'payroll'] }),
    queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }),
    queryClient.invalidateQueries({ queryKey: ['accounting', 'activity'] }),
    queryClient.invalidateQueries({ queryKey: ['accounting', 'notifications'] }),
  ]);
}

export function useCreateTransaction() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => client.post('/transactions', payload),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useCreatePayrollPayment() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => client.post('/payroll/payments', payload),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useUpdateEmployee() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, payload }) => client.patch(`/payroll/employees/${employeeId}`, payload),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useCreateEmployee() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => client.post('/payroll/employees', payload),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useMarkNotificationRead() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId) => client.patch(`/notifications/${notificationId}/read`, {}),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useApproveWithdrawal() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ withdrawalId, status, note }) =>
      client.patch(`/withdrawal-requests/${withdrawalId}`, { status, note }),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useMarkWithdrawalPaid() {
  const client = useAccountingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (withdrawalId) => client.patch(`/withdrawal-requests/${withdrawalId}/mark-paid`, {}),
    onSuccess: () => invalidateAccounting(queryClient),
  });
}

export function useAccountingExport() {
  const client = useAccountingClient();
  return useMutation({
    mutationFn: ({ type, rangeDays }) => client.getBlob('/reports/export', { type, range_days: rangeDays }),
  });
}
