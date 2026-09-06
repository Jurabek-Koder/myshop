export const TARGET_VIEW_KEYS = [
  'cabinet',
  'market',
  'surveys',
  'sold',
  'cancelled',
  'take_later',
  'atkaz',
  'archive',
  'links',
  'stats',
  'contest',
  'payment',
  'referral',
  'favorites',
  'mychat',
  'guruh',
  'profile',
  'settings',
  'guide',
];

export const TARGET_ORDER_VIEW_KEYS = ['sold', 'cancelled', 'take_later', 'atkaz', 'archive'];

export const TARGET_ORDER_VIEWS = {
  sold: {
    icon: 'fa-check-circle',
    label: 'Sotildi',
    subtitle: 'Muvaffaqiyatli yetkazilgan buyurtmalar — faqat sizning oqimlaringiz bo‘yicha.',
    empty: 'Hozircha sotilgan buyurtmalar yo‘q.',
  },
  cancelled: {
    icon: 'fa-times-circle',
    label: 'Bekor qilindi',
    subtitle: 'Bekor qilingan buyurtmalar — siz yoqqan mahsulotlar bo‘yicha.',
    empty: 'Hozircha bekor qilingan buyurtmalar yo‘q.',
  },
  take_later: {
    icon: 'fa-clock',
    label: 'Keyin oladi',
    subtitle: 'Mijoz keyinroq olishi belgilangan buyurtmalar.',
    empty: 'Hozircha «keyin oladi» buyurtmalari yo‘q.',
  },
  atkaz: {
    icon: 'fa-undo',
    label: 'Atkaz',
    subtitle: 'Yetkazib berilmagan yoki qaytarilgan buyurtmalar.',
    empty: 'Hozircha atkaz buyurtmalar yo‘q.',
  },
  archive: {
    icon: 'fa-archive',
    label: 'Arxiv',
    subtitle: 'Arxivlangan buyurtmalar tarixi.',
    empty: 'Arxivda buyurtmalar yo‘q.',
  },
};

export const DEFAULT_TARGET_VIEW = 'market';

export function normalizeTargetView(value) {
  if (!value) return DEFAULT_TARGET_VIEW;
  return TARGET_VIEW_KEYS.includes(value) ? value : DEFAULT_TARGET_VIEW;
}

export const TARGET_MENU_ITEMS = [
  { key: 'cabinet', icon: 'fa-user', label: 'Mening kabinetim' },
  { key: 'market', icon: 'fa-shopping-cart', label: 'Market' },
  { key: 'surveys', icon: 'fa-clipboard-list', label: "So'rovnomalar" },
  { key: 'sold', icon: 'fa-check-circle', label: 'Sotildi' },
  { key: 'cancelled', icon: 'fa-times-circle', label: 'Bekor qilindi' },
  { key: 'take_later', icon: 'fa-clock', label: 'Keyin oladi' },
  { key: 'atkaz', icon: 'fa-undo', label: 'Atkaz' },
  { key: 'archive', icon: 'fa-archive', label: 'Arxiv' },
  { key: 'links', icon: 'fa-link', label: 'Havolalar' },
  { key: 'stats', icon: 'fa-chart-bar', label: 'Statistika' },
  { key: 'contest', icon: 'fa-trophy', label: 'Konkurs' },
  { key: 'payment', icon: 'fa-wallet', label: "To'lov" },
  { key: 'referral', icon: 'fa-users', label: 'Referal' },
  { key: 'mychat', icon: 'fa-comments', label: 'MyChat' },
  { key: 'guruh', icon: 'fa-people-group', label: 'Targetologlar guruhi' },
  { key: 'guide', icon: 'fa-book', label: "Qo'llanma" },
  { key: 'settings', icon: 'fa-cog', label: 'Sozlamalar' },
];

/** Mobil pastki tab — tez navigatsiya */
export const TARGET_MOBILE_TAB_ITEMS = [
  { key: 'cabinet', icon: 'fa-user', label: 'Kabinet' },
  { key: 'market', icon: 'fa-shopping-cart', label: 'Market' },
  { key: 'surveys', icon: 'fa-clipboard-list', label: "So'rovlar" },
  { key: 'stats', icon: 'fa-chart-bar', label: 'Statistika' },
  { key: '__more', icon: 'fa-ellipsis-h', label: 'Boshqa' },
];

/** Mobil «Boshqa» varaqasi */
export const TARGET_MORE_MENU_ITEMS = [
  { key: 'links', icon: 'fa-link', label: 'Havolalar' },
  { key: 'sold', icon: 'fa-check-circle', label: 'Sotildi' },
  { key: 'cancelled', icon: 'fa-times-circle', label: 'Bekor qilindi' },
  { key: 'take_later', icon: 'fa-clock', label: 'Keyin oladi' },
  { key: 'atkaz', icon: 'fa-undo', label: 'Atkaz' },
  { key: 'archive', icon: 'fa-archive', label: 'Arxiv' },
  { key: 'contest', icon: 'fa-trophy', label: 'Konkurs' },
  { key: 'payment', icon: 'fa-wallet', label: "To'lov" },
  { key: 'referral', icon: 'fa-users', label: 'Referal' },
  { key: 'mychat', icon: 'fa-comments', label: 'MyChat' },
  { key: 'guruh', icon: 'fa-people-group', label: 'Targetologlar guruhi' },
  { key: 'favorites', icon: 'fa-heart', label: 'Saralanganlar' },
  { key: 'guide', icon: 'fa-book', label: "Qo'llanma" },
  { key: 'settings', icon: 'fa-cog', label: 'Sozlamalar' },
];

export const TARGET_VIEW_LABELS = {
  ...Object.fromEntries(TARGET_MENU_ITEMS.map((item) => [item.key, item.label])),
  favorites: 'Saralanganlar',
  mychat: 'MyChat',
  sold: 'Sotildi',
  cancelled: 'Bekor qilindi',
  take_later: 'Keyin oladi',
  atkaz: 'Atkaz',
  archive: 'Arxiv',
  profile: 'Profil ma\'lumotlari',
  guide: "Qo'llanma",
};
export const CABINET_QUICK_TILES = [
  { key: 'market', icon: 'fa-shopping-cart', label: 'Market', desc: "Mahsulotlarni ko'rish" },
  { key: 'links', icon: 'fa-link', label: 'Havolalar', desc: 'Oqimlarni boshqarish' },
  { key: 'surveys', icon: 'fa-clipboard-list', label: "So'rovnomalar", desc: "Buyurtmalarni ko'rish" },
  { key: 'stats', icon: 'fa-chart-bar', label: 'Statistika', desc: 'Hisobotlar va tahlil' },
  { key: 'payment', icon: 'fa-wallet', label: "To'lov", desc: 'Pul yechish' },
  { key: 'contest', icon: 'fa-trophy', label: 'Konkurs', desc: 'Ishtirok etish' },
  { key: 'favorites', icon: 'fa-heart', label: 'Saralanganlar', desc: 'Yoqtirgan mahsulotlar' },
  { key: 'profile', icon: 'fa-user', label: 'Profil', desc: 'Shaxsiy ma\'lumotlar' },
  { key: 'settings', icon: 'fa-cog', label: 'Sozlamalar', desc: 'Ilova sozlamalari' },
  { action: 'logout', icon: 'fa-sign-out-alt', label: 'Chiqish', desc: 'Tizimdan chiqish' },
];
