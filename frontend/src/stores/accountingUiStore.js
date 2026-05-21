import { create } from 'zustand';

export const useAccountingUiStore = create((set) => ({
  dashboardRangeDays: 180,
  reportsRangeDays: 90,
  transactionModal: {
    open: false,
    defaults: { direction: 'expense', source_type: 'shop_expense', category_slug: 'shop_expense' },
  },
  paymentModal: {
    open: false,
    defaults: { phase: 'salary' },
  },
  setDashboardRangeDays: (dashboardRangeDays) => set({ dashboardRangeDays }),
  setReportsRangeDays: (reportsRangeDays) => set({ reportsRangeDays }),
  openTransactionModal: (defaults = {}) =>
    set({
      transactionModal: {
        open: true,
        defaults: {
          direction: defaults.direction || 'expense',
          source_type: defaults.source_type || (defaults.direction === 'income' ? 'manual_income' : 'shop_expense'),
          category_slug:
            defaults.category_slug || (defaults.direction === 'income' ? 'manual_income' : 'shop_expense'),
          ...defaults,
        },
      },
    }),
  closeTransactionModal: () =>
    set({
      transactionModal: {
        open: false,
        defaults: { direction: 'expense', source_type: 'shop_expense', category_slug: 'shop_expense' },
      },
    }),
  openPaymentModal: (defaults = {}) =>
    set({
      paymentModal: {
        open: true,
        defaults: {
          phase: defaults.phase || 'salary',
          ...defaults,
        },
      },
    }),
  closePaymentModal: () =>
    set({
      paymentModal: {
        open: false,
        defaults: { phase: 'salary' },
      },
    }),
}));
