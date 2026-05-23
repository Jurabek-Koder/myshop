import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext.jsx';

const AccountingAppContext = createContext(null);

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || `Xatolik (${res.status})`);
  return data;
}

export function AccountingAppProvider({ children }) {
  const { request } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [payrollSummary, setPayrollSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);

  const api = useCallback(
    async (path, options = {}) => {
      const res = await request(`/accounting${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
      return readJson(res);
    },
    [request],
  );

  const run = useCallback(
    async (fn, { silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError('');
      try {
        return await fn();
      } catch (e) {
        setError(e?.message || 'Xatolik');
        throw e;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  const refreshDashboard = useCallback(
    () =>
      run(async () => {
        const d = await api('/dashboard');
        setDashboard(d);
        if (d.payroll_summary) setPayrollSummary(d.payroll_summary);
      }, { silent: true }),
    [api, run],
  );

  const refreshPayroll = useCallback(
    async (year, month) => {
      const y = year || new Date().getFullYear();
      const m = month || new Date().getMonth() + 1;
      await run(async () => {
        const [emp, cyc, sum, roles] = await Promise.all([
          api('/payroll-management/employees'),
          api(`/payroll-management/cycles?year=${y}&month=${m}`),
          api(`/payroll-management/cycles/summary?year=${y}&month=${m}`),
          api('/payroll-management/role-defaults'),
        ]);
        setEmployees(emp.employees || []);
        setCycles(cyc.cycles || []);
        setPayrollSummary(sum.summary || null);
        setRoleDefaults(roles.role_defaults || []);
      }, { silent: true });
    },
    [api, run],
  );

  const refreshFinance = useCallback(
    () =>
      run(async () => {
        const [ex, inc] = await Promise.all([api('/expenses'), api('/income')]);
        setExpenses(ex.expenses || []);
        setIncome(inc.income || []);
      }, { silent: true }),
    [api, run],
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const y = new Date().getFullYear();
      const m = new Date().getMonth() + 1;
      await Promise.all([refreshDashboard(), refreshPayroll(y, m), refreshFinance()]);
    } catch (e) {
      setError(e?.message || 'Yuklanmadi');
    } finally {
      setLoading(false);
    }
  }, [refreshDashboard, refreshPayroll, refreshFinance]);

  const syncAllRoles = useCallback(
    () =>
      run(async () => {
        await api('/payroll-management/employees/sync-all', { method: 'POST', body: '{}' });
        const y = new Date().getFullYear();
        const m = new Date().getMonth() + 1;
        await refreshPayroll(y, m);
      }),
    [api, run, refreshPayroll],
  );

  const syncSuperusers = syncAllRoles;

  const saveRoleDefault = useCallback(
    (body) =>
      run(async () => {
        await api('/payroll-management/role-defaults', { method: 'PUT', body: JSON.stringify(body) });
        const y = new Date().getFullYear();
        const m = new Date().getMonth() + 1;
        await refreshPayroll(y, m);
      }),
    [api, run, refreshPayroll],
  );

  const saveEmployee = useCallback(
    (body) =>
      run(async () => {
        await api('/payroll-management/employees', { method: 'POST', body: JSON.stringify(body) });
        const y = new Date().getFullYear();
        const m = new Date().getMonth() + 1;
        await refreshPayroll(y, m);
      }),
    [api, run, refreshPayroll],
  );

  const generateCycles = useCallback(
    (year, month) =>
      run(async () => {
        const result = await api('/payroll-management/cycles/generate', {
          method: 'POST',
          body: JSON.stringify({ year, month }),
        });
        await refreshPayroll(year, month);
        await refreshDashboard();
        return result;
      }),
    [api, run, refreshPayroll, refreshDashboard],
  );

  const markCyclePaid = useCallback(
    (id, payload) =>
      run(async () => {
        const d = await api(`/payroll-management/cycles/${id}/mark-paid`, {
          method: 'POST',
          body: JSON.stringify(payload || {}),
        });
        const y = new Date().getFullYear();
        const m = new Date().getMonth() + 1;
        await refreshPayroll(y, m);
        await refreshDashboard();
        return d.cycle;
      }),
    [api, run, refreshPayroll, refreshDashboard],
  );

  const fetchReceipt = useCallback((id) => api(`/payroll-management/cycles/${id}/receipt`), [api]);

  const createExpense = useCallback(
    (body) =>
      run(async () => {
        await api('/expenses', { method: 'POST', body: JSON.stringify(body) });
        await refreshFinance();
        await refreshDashboard();
      }),
    [api, run, refreshFinance, refreshDashboard],
  );

  const deleteExpense = useCallback(
    (id) =>
      run(async () => {
        await api(`/expenses/${id}`, { method: 'DELETE' });
        await refreshFinance();
        await refreshDashboard();
      }),
    [api, run, refreshFinance, refreshDashboard],
  );

  const createIncome = useCallback(
    (body) =>
      run(async () => {
        await api('/income', { method: 'POST', body: JSON.stringify(body) });
        await refreshFinance();
        await refreshDashboard();
      }),
    [api, run, refreshFinance, refreshDashboard],
  );

  const deleteIncome = useCallback(
    (id) =>
      run(async () => {
        await api(`/income/${id}`, { method: 'DELETE' });
        await refreshFinance();
        await refreshDashboard();
      }),
    [api, run, refreshFinance, refreshDashboard],
  );

  const value = useMemo(
    () => ({
      loading,
      error,
      setError,
      dashboard,
      employees,
      roleDefaults,
      cycles,
      payrollSummary,
      expenses,
      income,
      refreshAll,
      refreshDashboard,
      refreshPayroll,
      refreshFinance,
      syncAllRoles,
      syncSuperusers,
      saveRoleDefault,
      saveEmployee,
      generateCycles,
      markCyclePaid,
      fetchReceipt,
      createExpense,
      deleteExpense,
      createIncome,
      deleteIncome,
    }),
    [
      loading,
      error,
      dashboard,
      employees,
      roleDefaults,
      cycles,
      payrollSummary,
      expenses,
      income,
      refreshAll,
      refreshDashboard,
      refreshPayroll,
      refreshFinance,
      syncAllRoles,
      syncSuperusers,
      saveRoleDefault,
      saveEmployee,
      generateCycles,
      markCyclePaid,
      fetchReceipt,
      createExpense,
      deleteExpense,
      createIncome,
      deleteIncome,
    ],
  );

  return <AccountingAppContext.Provider value={value}>{children}</AccountingAppContext.Provider>;
}

export function useAccountingApp() {
  const v = useContext(AccountingAppContext);
  if (!v) throw new Error('useAccountingApp: provider kerak');
  return v;
}
