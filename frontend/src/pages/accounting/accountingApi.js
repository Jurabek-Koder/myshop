export async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson(request, path, options) {
  const res = await request(path, options);
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(data?.error || 'So‘rov bajarilmadi.');
  }
  return data;
}

export function getOverview(request) {
  return requestJson(request, '/accounting/portal/dashboard/overview');
}

export function getEmployees(request, params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  return requestJson(request, `/accounting/portal/employees${query.toString() ? `?${query}` : ''}`);
}

export function getPayrollCycles(request, params = {}) {
  const query = new URLSearchParams();
  if (params.month) query.set('month', params.month);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.employee_id) query.set('employee_id', params.employee_id);
  return requestJson(request, `/accounting/portal/payroll/cycles${query.toString() ? `?${query}` : ''}`);
}

export function getPayrollCalendar(request, params = {}) {
  const query = new URLSearchParams();
  if (params.month) query.set('month', params.month);
  return requestJson(request, `/accounting/portal/payroll/calendar${query.toString() ? `?${query}` : ''}`);
}

export function getTransactions(request, params = {}) {
  const query = new URLSearchParams();
  if (params.direction && params.direction !== 'all') query.set('direction', params.direction);
  if (params.search) query.set('search', params.search);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.source) query.set('source', params.source);
  return requestJson(request, `/accounting/portal/transactions${query.toString() ? `?${query}` : ''}`);
}

export function getCategories(request) {
  return requestJson(request, '/accounting/portal/categories');
}

export function getReportsSummary(request, params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return requestJson(request, `/accounting/portal/reports/summary${query.toString() ? `?${query}` : ''}`);
}

export function getActivities(request, params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit);
  return requestJson(request, `/accounting/portal/activities${query.toString() ? `?${query}` : ''}`);
}

export function createTransaction(request, payload) {
  return requestJson(request, '/accounting/portal/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createPayrollPayment(request, cycleId, payload) {
  return requestJson(request, `/accounting/portal/payroll/cycles/${cycleId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
