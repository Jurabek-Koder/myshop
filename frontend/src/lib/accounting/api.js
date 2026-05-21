import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { downloadBlobFromResponse } from './format.js';

async function parseApiResponse(response) {
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
    throw new Error(data?.error || `So‘rov bajarilmadi (${response.status}).`);
  }
  return data;
}

export function useAccountingApi() {
  const { request } = useAuth();

  const requestJson = useCallback(
    async (path, options = {}) => {
      const response = await request(`/accounting/portal${path}`, options);
      return parseApiResponse(response);
    },
    [request],
  );

  const downloadFile = useCallback(
    async (path, fallbackName) => {
      const response = await request(`/accounting/portal${path}`, {
        method: 'GET',
      });
      if (!response.ok) {
        const errorData = await parseApiResponse(response).catch((error) => {
          throw error;
        });
        return errorData;
      }
      await downloadBlobFromResponse(response, fallbackName);
      return true;
    },
    [request],
  );

  return { requestJson, downloadFile };
}

export function useAccountingDashboardQuery() {
  const { requestJson } = useAccountingApi();
  return useQuery({
    queryKey: ['accounting', 'dashboard'],
    queryFn: () => requestJson('/dashboard'),
    refetchInterval: 30000,
  });
}

export function useAccountingLookupsQuery() {
  const { requestJson } = useAccountingApi();
  return useQuery({
    queryKey: ['accounting', 'lookups'],
    queryFn: () => requestJson('/lookups'),
    staleTime: 1000 * 60 * 10,
  });
}

export function useAccountingEmployeesQuery(filters) {
  const { requestJson } = useAccountingApi();
  const params = useMemo(() => new URLSearchParams(filters || {}).toString(), [filters]);
  return useQuery({
    queryKey: ['accounting', 'employees', params],
    queryFn: () => requestJson(`/employees${params ? `?${params}` : ''}`),
    refetchInterval: 45000,
  });
}

export function useAccountingPayrollQuery(monthKey) {
  const { requestJson } = useAccountingApi();
  const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : '';
  return useQuery({
    queryKey: ['accounting', 'payroll', monthKey || 'current'],
    queryFn: () => requestJson(`/payroll/overview${query}`),
    refetchInterval: 30000,
  });
}

export function useAccountingTransactionsQuery(filters) {
  const { requestJson } = useAccountingApi();
  const params = useMemo(() => new URLSearchParams(filters || {}).toString(), [filters]);
  return useQuery({
    queryKey: ['accounting', 'transactions', params],
    queryFn: () => requestJson(`/transactions${params ? `?${params}` : ''}`),
  });
}

export function useAccountingReportsQuery(range) {
  const { requestJson } = useAccountingApi();
  const params = useMemo(() => new URLSearchParams(range || {}).toString(), [range]);
  return useQuery({
    queryKey: ['accounting', 'reports', params],
    queryFn: () => requestJson(`/reports/summary${params ? `?${params}` : ''}`),
  });
}

export function useAccountingActivityQuery(limit = 40) {
  const { requestJson } = useAccountingApi();
  return useQuery({
    queryKey: ['accounting', 'activity', limit],
    queryFn: () => requestJson(`/activity?limit=${limit}`),
    refetchInterval: 45000,
  });
}

export function useAccountingMutations() {
  const { requestJson } = useAccountingApi();
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounting', 'dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting', 'employees'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting', 'payroll'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting', 'transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting', 'activity'] }),
    ]);
  }, [queryClient]);

  const createTransaction = useMutation({
    mutationFn: (payload) =>
      requestJson('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidateAll,
  });

  const createPayment = useMutation({
    mutationFn: (payload) =>
      requestJson('/payroll/pay', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidateAll,
  });

  const createEmployee = useMutation({
    mutationFn: (payload) =>
      requestJson('/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidateAll,
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, payload }) =>
      requestJson(`/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidateAll,
  });

  const runAutomation = useMutation({
    mutationFn: () =>
      requestJson('/payroll/automation/run', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: invalidateAll,
  });

  return {
    createTransaction,
    createPayment,
    createEmployee,
    updateEmployee,
    runAutomation,
  };
}
