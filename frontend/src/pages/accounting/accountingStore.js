import { create } from 'zustand';

export const useAccountingStore = create((set) => ({
  transactionFilters: {
    direction: 'all',
    search: '',
  },
  reportRange: {
    from: '',
    to: '',
  },
  employeeSearch: '',
  payrollStatus: 'all',
  setTransactionFilters: (partial) =>
    set((state) => ({
      transactionFilters: { ...state.transactionFilters, ...partial },
    })),
  setReportRange: (partial) =>
    set((state) => ({
      reportRange: { ...state.reportRange, ...partial },
    })),
  setEmployeeSearch: (employeeSearch) => set({ employeeSearch }),
  setPayrollStatus: (payrollStatus) => set({ payrollStatus }),
}));
