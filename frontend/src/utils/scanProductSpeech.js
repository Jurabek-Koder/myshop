/** Skaner — chekdagi mahsulot sonini ovozli aytish (ekspeditor / qabul). */

const UZ_COUNT_SPEAK = {
  1: 'bitta',
  2: 'ikki',
  3: 'uch',
  4: 'to‘rt',
  5: 'besh',
  6: 'olti',
  7: 'yetti',
  8: 'sakkiz',
  9: 'to‘qqiz',
  10: 'o‘n',
};

export function scannedProductCountFromOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const qtyTotal = items.reduce((sum, item) => {
    const qty = Number(item?.quantity);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);
  return qtyTotal > 0 ? qtyTotal : items.length;
}

function pickSpeechVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => String(v.lang || '').toLowerCase() === 'uz-uz') ||
    voices.find((v) => String(v.lang || '').toLowerCase().startsWith('uz')) ||
    voices.find((v) => String(v.lang || '').toLowerCase().startsWith('ru')) ||
    voices.find((v) => v.default) ||
    voices[0]
  );
}

/** Brauzer ovozini birinchi fokus/klikda tayyorlash (blokdan qochish). */
export function warmUpScanSpeech() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.getVoices();
    const probe = new SpeechSynthesisUtterance('');
    probe.volume = 0;
    probe.rate = 10;
    window.speechSynthesis.speak(probe);
    window.speechSynthesis.cancel();
  } catch {
    /* ixtiyoriy */
  }
}

function speakCountLabel(label) {
  const synth = window.speechSynthesis;
  synth.cancel();

  const run = () => {
    const utterance = new SpeechSynthesisUtterance(label);
    const voice = pickSpeechVoice();
    utterance.lang = voice?.lang || 'ru-RU';
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    synth.speak(utterance);
  };

  if (synth.getVoices().length === 0) {
    const onVoices = () => {
      synth.removeEventListener('voiceschanged', onVoices);
      run();
    };
    synth.addEventListener('voiceschanged', onVoices);
    synth.getVoices();
    window.setTimeout(run, 120);
    return;
  }

  run();
}

/** Muvaffaqiyatli skaner — «ikki», «uch», «bitta» … */
export function speakScannedProductCount(order) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const count = scannedProductCountFromOrder(order);
  if (!Number.isFinite(count) || count <= 0) return;

  const rounded = Math.min(99, Math.max(1, Math.round(count)));
  const label = UZ_COUNT_SPEAK[rounded] || `${rounded} ta`;

  try {
    speakCountLabel(label);
  } catch {
    /* brauzer qo‘llab-quvvatlamasa — jim */
  }
}
