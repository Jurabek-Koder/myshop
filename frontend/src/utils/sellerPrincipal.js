export function isTargetPrincipal(user) {
  if (!user || typeof user !== 'object') return false;
  return String(user.role ?? '').trim().toLowerCase() === 'target';
}

/**
 * Seller panel va /seller yoʻli: akkaunt seller roli bilan yoki do‘kon (seller_id) bog‘langan.
 * Target roli alohida — /target paneli.
 */
export function isSellerPrincipal(user) {
  if (!user || typeof user !== 'object') return false;
  if (isTargetPrincipal(user)) return false;
  const role = String(user.role ?? '').trim().toLowerCase();
  if (role === 'seller') return true;
  const sid = user.seller_id;
  return sid != null && Number(sid) > 0;
}
