import { isSellerPrincipal } from './sellerPrincipal.js';

function isSuperuser(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'superuser' || user?.role_id === 1;
}

function isSeller(user) {
  return isSellerPrincipal(user);
}

function roleCheck(roleName) {
  return (user) => String(user?.role || '').toLowerCase() === roleName;
}

const isCourier = roleCheck('courier');
const isOperator = roleCheck('operator');
const isPicker = roleCheck('picker');
const isPacker = roleCheck('packer');
const isExpeditor = roleCheck('expeditor');
const isOrderReceiver = roleCheck('order_receiver');
const isWarehouseAdmin = roleCheck('warehouse_admin');
const isAccounting = roleCheck('accounting');

function canAccessPath(allowedPages, pathname) {
  if (!allowedPages || allowedPages.length === 0) return false;
  if (allowedPages.includes('*')) return true;
  if (allowedPages.includes(pathname)) return true;
  return allowedPages.some((p) => {
    if (p === '/') return pathname === '/';
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}

export function roleDefaultPath(user) {
  if (isSuperuser(user)) return '/admin';
  if (isSeller(user)) return '/seller';
  if (isCourier(user)) return '/courier';
  if (isOperator(user)) return '/operator';
  if (isPicker(user)) return '/picker';
  if (isPacker(user)) return '/packer';
  if (isExpeditor(user)) return '/expeditor';
  if (isOrderReceiver(user)) return '/qabul';
  if (isWarehouseAdmin(user)) return '/warehouse-admin';
  if (isAccounting(user)) return '/accounting';
  return '/';
}

export function resolveReturnTarget(rawFrom, user) {
  if (!rawFrom || typeof rawFrom !== 'string') return '';

  try {
    const parsed = new URL(rawFrom, window.location.origin);
    const pathname = parsed.pathname || '/';
    const fullTarget = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (pathname === '/login' || pathname === '/register') return '';

    if (pathname.startsWith('/admin')) return isSuperuser(user) ? fullTarget : '';
    if (pathname.startsWith('/seller')) return isSeller(user) ? fullTarget : '';
    if (pathname.startsWith('/courier')) return isCourier(user) ? fullTarget : '';
    if (pathname.startsWith('/operator')) return isOperator(user) ? fullTarget : '';
    if (pathname.startsWith('/picker')) return isPicker(user) ? fullTarget : '';
    if (pathname.startsWith('/packer')) return isPacker(user) ? fullTarget : '';
    if (pathname.startsWith('/expeditor')) return isExpeditor(user) ? fullTarget : '';
    if (pathname.startsWith('/qabul')) return isOrderReceiver(user) ? fullTarget : '';
    if (pathname.startsWith('/warehouse-admin')) return isWarehouseAdmin(user) ? fullTarget : '';
    if (pathname.startsWith('/accounting')) return isAccounting(user) ? fullTarget : '';

    const allowed = user?.allowed_pages || (isSuperuser(user) ? ['*'] : []);
    if (
      canAccessPath(allowed, pathname) ||
      pathname === '/' ||
      pathname.startsWith('/products') ||
      pathname === '/cart' ||
      pathname === '/profile'
    ) {
      return fullTarget;
    }

    return '';
  } catch {
    return '';
  }
}

export const REMEMBERED_LOGIN_KEY = 'myshop_remembered_login';

export function getRememberedLogin() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(REMEMBERED_LOGIN_KEY) || '' : '';
  } catch {
    return '';
  }
}
