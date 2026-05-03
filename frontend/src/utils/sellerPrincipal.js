/**
 * Seller panel va /seller yoʻli: akkaunt seller roli bilan yoki do‘kon (seller_id) bog‘langan.
 * App.jsx dagi SellerRoute bilan bir xil qoida — boshqa fayllar bilan chalkashmasin.
 */
export function isSellerPrincipal(user) {
  if (!user || typeof user !== 'object') return false;
  const role = String(user.role ?? '').trim().toLowerCase();
  if (role === 'seller') return true;
  const sid = user.seller_id;
  return sid != null && Number(sid) > 0;
}
