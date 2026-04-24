/**
 * O‘zbekiston: 12 viloyat + Qoraqalpog‘iston Respublikasi.
 * Toshkent shahri alohida (poytaxt manzillari ko‘pincha «Toshkent, …»).
 * Manzil matnida qatorlarni qidiradi (pochta / yetkazish manzili).
 */
export const PACKER_UZ_VILOYATLAR = [
  {
    id: 'andijon',
    name: 'Andijon viloyati',
    patterns: ['andijon viloyati', 'andijon vil.', 'andijon', 'андижон', 'андижан'],
  },
  {
    id: 'buxoro',
    name: 'Buxoro viloyati',
    patterns: ['buxoro viloyati', 'buxoro vil.', 'buxoro', 'бухоро', 'бухара'],
  },
  {
    id: 'fargona',
    name: 'Farg‘ona viloyati',
    patterns: ["farg'ona viloyati", 'fargona viloyati', "farg'ona vil.", 'fargona vil.', "farg'ona", 'fargona', 'фарғона', 'фергана'],
  },
  {
    id: 'jizzax',
    name: 'Jizzax viloyati',
    patterns: ['jizzax viloyati', 'jizzax vil.', 'jizzax', 'жиззах', 'джизак'],
  },
  {
    id: 'xorazm',
    name: 'Xorazm viloyati',
    patterns: ['xorazm viloyati', 'xorazm vil.', 'xorazm', 'xiva', 'ургенч', 'хоразм'],
  },
  {
    id: 'namangan',
    name: 'Namangan viloyati',
    patterns: ['namangan viloyati', 'namangan vil.', 'namangan', 'наманган'],
  },
  {
    id: 'navoiy',
    name: 'Navoiy viloyati',
    patterns: ['navoiy viloyati', 'navoiy vil.', 'navoiy', 'navoi', 'навои'],
  },
  {
    id: 'qashqadaryo',
    name: 'Qashqadaryo viloyati',
    patterns: ['qashqadaryo viloyati', 'qashqadaryo vil.', 'qashqadaryo', 'qarshi', 'кашкадарья', 'карши'],
  },
  {
    id: 'samarqand',
    name: 'Samarqand viloyati',
    patterns: ['samarqand viloyati', 'samarqand vil.', 'samarqand', 'samarkand', 'самарканд'],
  },
  {
    id: 'sirdaryo',
    name: 'Sirdaryo viloyati',
    patterns: ['sirdaryo viloyati', 'sirdaryo vil.', 'sirdaryo', 'guliston', 'сырдарья'],
  },
  {
    id: 'surxondaryo',
    name: 'Surxondaryo viloyati',
    patterns: ['surxondaryo viloyati', 'surxondaryo vil.', 'surxondaryo', 'termiz', 'сурхондарё', 'термез'],
  },
  {
    id: 'toshkent_v',
    name: 'Toshkent viloyati',
    patterns: ['toshkent viloyati', 'toshkent vil.', 'yangiyo‘l', 'yangiyol', 'oqqo‘rg‘on', 'bekobod'],
  },
  {
    id: 'toshkent_sh',
    name: 'Toshkent shahri',
    patterns: ['toshkent shahri', 'toshkent sh.', 'chilonzor', 'yunusobod', 'mirzo ulugʻbek', 'mirzo ulugbek', 'sergeli', 'olmazor', 'uchtepa'],
    match: (s) => {
      if (s.includes('toshkent viloyati') || s.includes('toshkent vil.')) return false;
      if (
        [
          'toshkent shahri',
          'toshkent sh.',
          'chilonzor',
          'yunusobod',
          'sergeli',
          'olmazor',
          'uchtepa',
          'bektemir',
          'mirobod',
          'shayxontohur',
          'yangihayot',
        ].some((p) => s.includes(p))
      ) {
        return true;
      }
      if (s.includes('toshkent')) return true;
      return false;
    },
  },
  {
    id: 'qoraqalpoq',
    name: "Qoraqalpog'iston Respublikasi",
    patterns: ['qoraqalpog', 'qoraqalpogiston', 'qaraqalpaq', 'qaraqalpaqstan', 'nukus', 'karakalpak', 'нукус'],
  },
];

/** Toshkent shahri — kuryer roli (admin) uchun tumanlar; bir nechtasini tanlash mumkin */
export const TOSHKENT_SH_TUMANS = [
  { id: 'chilonzor', label: 'Chilonzor' },
  { id: 'yunusobod', label: 'Yunusobod' },
  { id: 'mirzo_ulugbek', label: 'Mirzo Ulugʻbek' },
  { id: 'sergeli', label: 'Sergeli' },
  { id: 'olmazor', label: 'Olmazor' },
  { id: 'uchtepa', label: 'Uchtepa' },
  { id: 'bektemir', label: 'Bektemir' },
  { id: 'mirobod', label: 'Mirobod' },
  { id: 'shayxontohur', label: 'Shayxontohur' },
  { id: 'yangihayot', label: 'Yangihayot' },
];

export function orderMatchesViloyatEntry(shippingAddress, entry) {
  if (!entry) return true;
  const s = String(shippingAddress || '').toLowerCase();
  if (!s) return false;
  if (typeof entry.match === 'function') return entry.match(s);
  const pats = entry.patterns || [];
  return pats.some((p) => s.includes(String(p).toLowerCase()));
}
