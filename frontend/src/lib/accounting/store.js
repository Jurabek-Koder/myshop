import { create } from 'zustand';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return {
    from: toInput(start),
    to: toInput(end),
  };
}

export const useAccountingStore = create((set) => ({
  dialogs: {
    transaction: false,
    payment: false,
    employee: false,
  },
  transactionPreset: { direction: 'expense' },
  paymentPreset: { cycle_type: 'advance' },
  employeeDraft: null,
  reportRange: currentMonthRange(),
  transactionFilters: {
    direction: '',
    search: '',
    ...currentMonthRange(),
  },
  employeeFilters: {
    search: '',
    status: '',
  },
  setDialog(dialogKey, open) {
    set((state) => ({
      dialogs: {
        ...state.dialogs,
        [dialogKey]: Boolean(open),
      },
    }));
  },
  openTransactionDialog(preset = { direction: 'expense' }) {
    set((state) => ({
      dialogs: { ...state.dialogs, transaction: true },
      transactionPreset: preset,
    }));
  },
  openPaymentDialog(preset = { cycle_type: 'advance' }) {
    set((state) => ({
      dialogs: { ...state.dialogs, payment: true },
      paymentPreset: preset,
    }));
  },
  openEmployeeDialog(draft = null) {
    set((state) => ({
      dialogs: { ...state.dialogs, employee: true },
      employeeDraft: draft,
    }));
  },
  setReportRange(patch) {
    set((state) => ({
      reportRange: { ...state.reportRange, ...patch },
    }));
  },
  setTransactionFilters(patch) {
    set((state) => ({
      transactionFilters: { ...state.transactionFilters, ...patch },
    }));
  },
  setEmployeeFilters(patch) {
    set((state) => ({
      employeeFilters: { ...state.employeeFilters, ...patch },
    }));
  },
}));
