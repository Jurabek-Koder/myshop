const UZ_COUNT_WORDS = {
  1: 'bitta',
  2: 'ikkita',
  3: 'uchta',
  4: 'to‘rtta',
  5: 'beshta',
  6: 'oltita',
  7: 'yettita',
  8: 'sakkizta',
  9: 'to‘qqizta',
  10: 'o‘nta',
};

export function scannedProductCountFromOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const qtyTotal = items.reduce((sum, item) => {
    const qty = Number(item?.quantity);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);
  return qtyTotal > 0 ? qtyTotal : items.length;
}

export function speakScannedProductCount(order) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const count = scannedProductCountFromOrder(order);
  if (!Number.isFinite(count) || count <= 0) return;

  const rounded = Math.round(count);
  const label = UZ_COUNT_WORDS[rounded] || `${rounded} ta`;
  const utterance = new SpeechSynthesisUtterance(`${label} mahsulot`);
  utterance.lang = 'uz-UZ';
  utterance.rate = 0.95;
  utterance.volume = 1;

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    /* Browser speech support is optional. */
  }
}
