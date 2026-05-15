/** Bosh sahifa «MyShop qulayliklari» — superuser tahrirlashi mumkin (JSON bazada). */

export const HOME_BENEFITS_DEFAULT = {
  section_title: 'MyShop qulayliklari',
  items: [
    {
      title: 'Tezkor yetkazib berish xizmati',
      text: "Buyurtmangiz O'zbekistonning ko'plab hududlariga 1–3 kun ichida yetkazib beriladi.",
    },
    {
      title: "To'lov istalgan usulda",
      text: "Buyurtmani oldindan Click, Payme orqali yoki buyurtmani qo'lingizga olganingizdan keyin amalga oshiring.",
    },
    {
      title: 'Qo‘llab-quvvatlash',
      text: "Savollar bo'yicha yordam: +998 71 123 45 67. Telegram orqali ham yozishingiz mumkin.",
    },
    {
      title: "Mijozlarni rag'batlantirish tizimi",
      text: 'Doimiy mijozlar uchun aksiyalar, chegirmalar va maxsus takliflar.',
    },
  ],
};

export function cloneHomeBenefitsDefault() {
  return JSON.parse(JSON.stringify(HOME_BENEFITS_DEFAULT));
}

export function parseHomeBenefitsJson(str) {
  if (str == null || str === '') return null;
  const s = typeof str === 'string' ? str : String(str);
  try {
    const o = JSON.parse(s);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

/** Tahrir maydonlari: bo‘sh qatorlar saqlanadi; struktura 4 ta band. */
export function coerceHomeBenefitsShape(raw) {
  const base = cloneHomeBenefitsDefault();
  if (!raw || typeof raw !== 'object') return base;
  base.section_title = String(raw.section_title ?? '').slice(0, 200);
  const arr = Array.isArray(raw.items) ? raw.items : [];
  for (let i = 0; i < 4; i++) {
    if (arr[i] && typeof arr[i] === 'object') {
      base.items[i] = {
        title: String(arr[i].title ?? '').slice(0, 400),
        text: String(arr[i].text ?? '').slice(0, 1200),
      };
    }
  }
  return base;
}

/** Mijoz sahifasi: bo‘sh bandlar standart matnga qaytadi. */
export function mergeHomeBenefitsForPublic(raw) {
  const c = coerceHomeBenefitsShape(raw);
  const def = HOME_BENEFITS_DEFAULT;
  return {
    section_title: String(c.section_title || '').trim() || def.section_title,
    items: c.items.map((it, i) => ({
      title: String(it.title || '').trim() || def.items[i].title,
      text: String(it.text || '').trim() || def.items[i].text,
    })),
  };
}
