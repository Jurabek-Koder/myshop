import { create } from 'zustand';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const useAccountingStore = create((set) => ({
  transactionFilter: {
    type: '',
    source: '',
    search: '',
    from: '',
    to: '',
  },
  reportsRange: {
    from: '',
    to: todayIso(),
  },
  payrollSearch: '',
  setPayrollSearch: (value) => set({ payrollSearch: value }),
  setTransactionFilter: (patch) =>
    set((state) => ({
      transactionFilter: {
        ...state.transactionFilter,
        ...patch,
      },
    })),
  resetTransactionFilter: () =>
    set({
      transactionFilter: { type: '', source: '', search: '', from: '', to: '' },
    }),
  setReportsRange: (patch) =>
    set((state) => ({
      reportsRange: {
        ...state.reportsRange,
        ...patch,
      },
    })),
}));

