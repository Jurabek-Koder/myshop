/** Target (targitchi) komissiyasi — mahsulotdagi operator_share_* maydonlari. */
export function affiliateCommissionInfo(product) {
  const price = Number(product?.sale_price ?? product?.price) || 0;
  const percentRaw = Number(product?.operator_share_percent);
  const amountRaw = Number(product?.operator_share_amount);

  let percent =
    Number.isFinite(percentRaw) && percentRaw >= 0 ? Math.round(percentRaw * 10) / 10 : null;

  let amount = null;
  if (Number.isFinite(amountRaw) && amountRaw > 0) {
    amount = Math.round(amountRaw);
  }

  if (product?.sale_price != null && percent != null && price > 0) {
    amount = Math.round((price * percent) / 100);
  } else if (amount == null && percent != null && price > 0) {
    amount = Math.round((price * percent) / 100);
  }

  if (percent == null && amount != null && price > 0) {
    percent = Math.round((amount / price) * 1000) / 10;
  }

  if (percent == null && amount == null && price > 0) {
    percent = 12;
    amount = Math.round((price * percent) / 100);
  }

  if (amount == null) amount = 0;
  if (percent == null) percent = 0;

  return { amount, percent };
}

export function formatAffiliatePercent(percent) {
  const n = Number(percent) || 0;
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) {
    return `${Math.round(n)}%`;
  }
  return `${n.toFixed(1).replace(/\.0$/, '')}%`;
}
