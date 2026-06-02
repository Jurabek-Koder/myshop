/** @param {string[]|undefined} allowedPages */
export function canAccessPath(allowedPages, pathname) {
  if (!allowedPages || allowedPages.length === 0) return false;
  if (allowedPages.includes('*')) return true;
  if (allowedPages.includes(pathname)) return true;
  return allowedPages.some((p) => {
    if (p === '/') return pathname === '/';
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}
