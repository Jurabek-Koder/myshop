export function toPercent(value) {
  const v = Number.parseFloat(value);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  return Math.min(v, 100);
}

/** Seller panelidagi operator ulushi = buxgalteriyada admin ulushi */
export function toShares(price, operatorPercent, sitePercent) {
  const p = Number(price) || 0;
  const op = toPercent(operatorPercent);
  const sf = toPercent(sitePercent);
  const operatorAmount = Math.round((p * op) / 100);
  const siteAmount = Math.round((p * sf) / 100);
  const sellerNet = p - operatorAmount - siteAmount;
  return {
    operatorPercent: op,
    sitePercent: sf,
    operatorAmount,
    siteAmount,
    sellerNet,
  };
}

export function isOnPromotion(product) {
  const discount = Number(product?.discount_percent) || 0;
  if (discount <= 0) return false;
  const endsAt = product?.promotion_ends_at;
  if (!endsAt) return true;
  const end = new Date(String(endsAt).replace(' ', 'T'));
  return !Number.isNaN(end.getTime()) && end > new Date();
}

export function effectiveSellingPrice(product) {
  const listed = Number(product?.price) || 0;
  if (!isOnPromotion(product)) return listed;
  const discount = Number(product?.discount_percent) || 0;
  return Math.round(listed * (1 - discount / 100));
}

export function promotionInfo(product) {
  const discount = Math.round(Number(product?.discount_percent) || 0);
  const endsAt = product?.promotion_ends_at ? String(product.promotion_ends_at).slice(0, 10) : null;
  if (discount <= 0) {
    return { active: false, discount_percent: 0, label: '—', ends_at: null };
  }
  if (isOnPromotion(product)) {
    return {
      active: true,
      discount_percent: discount,
      label: `−${discount}%`,
      ends_at: endsAt,
      ends_label: endsAt ? `${endsAt} gacha` : 'Cheksiz',
    };
  }
  return {
    active: false,
    discount_percent: discount,
    label: 'Tugagan',
    ends_at: endsAt,
    ends_label: endsAt ? `${endsAt} da tugagan` : 'Tugagan',
  };
}

export function isProductArchived(product) {
  if (String(product?.warehouse_deleted_at || '').trim()) {
    return { archived: true, reason: 'deleted', reason_label: 'O‘chirilgan' };
  }
  if (String(product?.warehouse_delisted_at || '').trim()) {
    return { archived: true, reason: 'delisted', reason_label: 'Sotuvdan olingan' };
  }
  const off = String(product?.off_sale_variant || '').trim().toLowerCase();
  if (off) {
    return {
      archived: true,
      reason: off,
      reason_label: off === 'brak' ? 'Brak / sotuv to‘xtagan' : 'Sotuv to‘xtagan',
    };
  }
  const st = String(product?.status || '').trim().toLowerCase();
  if (st && !['active', 'scheduled'].includes(st)) {
    return { archived: true, reason: st, reason_label: `Holat: ${st}` };
  }
  return { archived: false, reason: null, reason_label: null };
}

export function accumulateSoldShares(soldLines, operatorPercent, sitePercent) {
  let units = 0;
  let gross = 0;
  let admin = 0;
  let site = 0;
  let seller = 0;
  for (const line of soldLines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unitPrice = Number(line.price_at_order) || 0;
    if (!qty) continue;
    const share = toShares(unitPrice, operatorPercent, sitePercent);
    units += qty;
    gross += unitPrice * qty;
    admin += share.operatorAmount * qty;
    site += share.siteAmount * qty;
    seller += share.sellerNet * qty;
  }
  return {
    units_sold: units,
    gross_sold_uzs: Math.round(gross),
    total_admin_uzs: Math.round(admin),
    total_site_uzs: Math.round(site),
    total_seller_uzs: Math.round(seller),
  };
}

export function buildProductReportRow(product, { soldLines = [], saleDays = 0 } = {}) {
  const listedPrice = Number(product.price) || 0;
  const sellingPrice = effectiveSellingPrice(product);
  const op = product.operator_share_percent;
  const sf = product.site_fee_percent;
  const promo = promotionInfo(product);
  const archive = isProductArchived(product);

  const listedShare = toShares(listedPrice, op, sf);
  const sellingShare = toShares(sellingPrice, op, sf);

  const unitLoss =
    listedPrice > sellingPrice ? listedPrice - sellingPrice : Math.max(0, listedShare.sellerNet - sellingShare.sellerNet);

  const sold = accumulateSoldShares(soldLines, op, sf);
  const trackingActive = sold.units_sold > 0 && saleDays > 1;

  return {
    id: product.id,
    name: product.name_uz || product.name_ru || `#${product.id}`,
    image_url: product.image_url || null,
    listed_price_uzs: listedPrice,
    selling_price_uzs: sellingPrice,
    unit_remainder_uzs: listedShare.sellerNet,
    unit_loss_uzs: unitLoss,
    has_loss: unitLoss > 0,
    admin_share_percent: sellingShare.operatorPercent,
    admin_share_uzs: sellingShare.operatorAmount,
    site_fee_percent: sellingShare.sitePercent,
    site_fee_uzs: sellingShare.siteAmount,
    seller_share_uzs: sellingShare.sellerNet,
    promotion: promo,
    promotion_active: promo.active,
    promotion_label: promo.label,
    promotion_ends_at: promo.ends_at,
    promotion_ends_label: promo.ends_label,
    units_sold: sold.units_sold,
    sale_days: saleDays,
    tracking_active: trackingActive,
    gross_sold_uzs: sold.gross_sold_uzs,
    total_admin_uzs: sold.total_admin_uzs,
    total_site_uzs: sold.total_site_uzs,
    total_seller_uzs: sold.total_seller_uzs,
    is_archived: archive.archived,
    archive_reason: archive.reason,
    archive_reason_label: archive.reason_label,
    seller_id: product.seller_id ?? null,
    seller_name: product.seller_name || null,
    status: product.status || null,
    currency: product.currency || 'UZS',
  };
}
