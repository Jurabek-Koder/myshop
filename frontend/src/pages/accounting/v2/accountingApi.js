async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'So‘rov bajarilmadi.');
  }
  return data;
}

export function createAccountingApi(request) {
  return {
    getDashboard: async (rangeDays = 90) => {
      const res = await request(`/accounting/portal/v2/dashboard?range_days=${encodeURIComponent(String(rangeDays))}`);
      return parseJsonResponse(res);
    },
    getPayrollEmployees: async (search = '') => {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await request(`/accounting/portal/v2/payroll/employees${q}`);
      return parseJsonResponse(res);
    },
    getPayrollCycles: async ({ year, month, employeeId }) => {
      const params = new URLSearchParams();
      if (year) params.set('year', String(year));
      if (month) params.set('month', String(month));
      if (employeeId) params.set('employee_id', String(employeeId));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await request(`/accounting/portal/v2/payroll/cycles${suffix}`);
      return parseJsonResponse(res);
    },
    createPayrollPayment: async (payload) => {
      const res = await request('/accounting/portal/v2/payroll/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return parseJsonResponse(res);
    },
    getTransactions: async (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.type) params.set('type', filters.type);
      if (filters.source) params.set('source', filters.source);
      if (filters.search) params.set('search', filters.search);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await request(`/accounting/portal/v2/transactions${query}`);
      return parseJsonResponse(res);
    },
    createTransaction: async (payload) => {
      const res = await request('/accounting/portal/v2/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return parseJsonResponse(res);
    },
    getReportsSummary: async (range = {}) => {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await request(`/accounting/portal/v2/reports/summary${suffix}`);
      return parseJsonResponse(res);
    },
    getActivity: async (limit = 150) => {
      const res = await request(`/accounting/portal/v2/activity?limit=${encodeURIComponent(String(limit))}`);
      return parseJsonResponse(res);
    },
    getReceipts: async (search = '') => {
      const suffix = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await request(`/accounting/portal/v2/receipts${suffix}`);
      return parseJsonResponse(res);
    },
    exportTransactionsCsv: (range = {}) => {
      const params = new URLSearchParams({ format: 'csv' });
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      return `/api/accounting/portal/v2/reports/export?${params.toString()}`;
    },
    receiptPdfUrl: (receiptId) => `/api/accounting/portal/v2/receipts/${receiptId}/pdf`,
  };
}

