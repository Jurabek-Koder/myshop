import { uz } from './i18n/uz.js';

/** Buxgalteriya paneli — barcha bo‘limlar (sidebar va superuser moliya hub). */
export const ACCOUNTING_NAV_ITEMS = [
  { key: 'dashboard', to: '/accounting', end: true, label: uz.nav.dashboard, icon: '📊', page: 'dashboard' },
  { key: 'payroll', to: '/accounting/ish-haqi', label: uz.nav.payroll, icon: '💰', page: 'payroll' },
  { key: 'finance', to: '/accounting/moliya', label: uz.nav.finance, icon: '🪙', page: 'finance' },
  { key: 'analytics', to: '/accounting/tahlil', label: uz.nav.analytics, icon: '📈', page: 'analytics' },
  { key: 'products', to: '/accounting/mahsulotlar-hisoboti', label: uz.nav.productsReport, icon: '📦', page: 'products' },
  { key: 'courier', to: '/accounting/staff/courier', label: 'Kuryerlar', icon: '🏍️', page: 'role', role: 'courier' },
  { key: 'operator', to: '/accounting/staff/operator', label: 'Operatorlar', icon: '🎧', page: 'role', role: 'operator' },
  { key: 'packer', to: '/accounting/staff/packer', label: 'Qadoqlovchilar', icon: '📦', page: 'role', role: 'packer' },
  { key: 'picker', to: '/accounting/staff/picker', label: "Yig'uvchilar", icon: '🤲', page: 'role', role: 'picker' },
  { key: 'expeditor', to: '/accounting/staff/expeditor', label: 'Ekspeditorlar', icon: '🚚', page: 'role', role: 'expeditor' },
  { key: 'seller', to: '/accounting/staff/seller', label: 'Sotuvchilar', icon: '🏪', page: 'role', role: 'seller' },
  {
    key: 'warehouse_admin',
    to: '/accounting/staff/warehouse_admin',
    label: 'Ombor Adminlari',
    icon: '🏬',
    page: 'role',
    role: 'warehouse_admin',
  },
  { key: 'archive', to: '/accounting/oylik-maosh-arxivi', label: uz.nav.payrollArchive, icon: '🗄️', page: 'archive' },
];

export function navIsActive(item, pathname) {
  if (item.end) {
    return pathname === item.to || pathname === `${item.to}/`;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
