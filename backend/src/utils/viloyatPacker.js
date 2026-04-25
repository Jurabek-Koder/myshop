/**
 * Frontend `uzViloyatlarPacker` bilan mos (buyurtma manzili / kuryer hududi matni).
 */

export const PACKER_UZ_VILOYATLAR = [
  {
    id: 'andijon',
    patterns: ['andijon viloyati', 'andijon vil.', 'andijon', 'андижон', 'андижан'],
  },
  {
    id: 'buxoro',
    patterns: ['buxoro viloyati', 'buxoro vil.', 'buxoro', 'бухоро', 'бухара'],
  },
  {
    id: 'fargona',
    patterns: ["farg'ona viloyati", 'fargona viloyati', "farg'ona vil.", 'fargona vil.', "farg'ona", 'fargona', 'фарғона', 'фергана'],
  },
  {
    id: 'jizzax',
    patterns: ['jizzax viloyati', 'jizzax vil.', 'jizzax', 'жиззах', 'джизак'],
  },
  {
    id: 'xorazm',
    patterns: ['xorazm viloyati', 'xorazm vil.', 'xorazm', 'xiva', 'ургенч', 'хоразм'],
  },
  {
    id: 'namangan',
    patterns: ['namangan viloyati', 'namangan vil.', 'namangan', 'наманган'],
  },
  {
    id: 'navoiy',
    patterns: ['navoiy viloyati', 'navoiy vil.', 'navoiy', 'navoi', 'навои'],
  },
  {
    id: 'qashqadaryo',
    patterns: ['qashqadaryo viloyati', 'qashqadaryo vil.', 'qashqadaryo', 'qarshi', 'кашкадарья', 'карши'],
  },
  {
    id: 'samarqand',
    patterns: ['samarqand viloyati', 'samarqand vil.', 'samarqand', 'samarkand', 'самарканд'],
  },
  {
    id: 'sirdaryo',
    patterns: ['sirdaryo viloyati', 'sirdaryo vil.', 'sirdaryo', 'guliston', 'сырдарья'],
  },
  {
    id: 'surxondaryo',
    patterns: ['surxondaryo viloyati', 'surxondaryo vil.', 'surxondaryo', 'termiz', 'сурхондарё', 'термез'],
  },
  {
    id: 'toshkent_v',
    patterns: ['toshkent viloyati', 'toshkent vil.', 'yangiyo‘l', 'yangiyol', 'oqqo‘rg‘on', 'bekobod'],
  },
  {
    id: 'toshkent_sh',
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
    patterns: ['qoraqalpog', 'qoraqalpogiston', 'qaraqalpaq', 'qaraqalpaqstan', 'nukus', 'karakalpak', 'нукус'],
  },
];

export function orderMatchesViloyatEntry(shippingAddress, entry) {
  if (!entry) return true;
  const s = String(shippingAddress || '').toLowerCase();
  if (!s) return false;
  if (typeof entry.match === 'function') return entry.match(s);
  const pats = entry.patterns || [];
  return pats.some((p) => s.includes(String(p).toLowerCase()));
}

export function getViloyatEntryById(viloyatId) {
  if (!viloyatId) return null;
  return PACKER_UZ_VILOYATLAR.find((e) => e.id === String(viloyatId).trim()) || null;
}

/** Toshkent shahri — kuryer uchun tuman tanlovi (admin rol formasi) */
export const TOSHKENT_SH_TUMANS = [
  { id: 'chilonzor', label: 'Chilonzor', pattern: 'chilonzor' },
  { id: 'yunusobod', label: 'Yunusobod', pattern: 'yunusobod' },
  { id: 'mirzo_ulugbek', label: 'Mirzo Ulugʻbek', pattern: 'mirzo ulug' },
  { id: 'sergeli', label: 'Sergeli', pattern: 'sergeli' },
  { id: 'olmazor', label: 'Olmazor', pattern: 'olmazor' },
  { id: 'uchtepa', label: 'Uchtepa', pattern: 'uchtepa' },
  { id: 'bektemir', label: 'Bektemir', pattern: 'bektemir' },
  { id: 'mirobod', label: 'Mirobod', pattern: 'mirobod' },
  { id: 'shayxontohur', label: 'Shayxontohur', pattern: 'shayxontohur' },
  { id: 'yangihayot', label: 'Yangihayot', pattern: 'yangihayot' },
];

/**
 * Kuryer `staff_members.region_service_text` — expeditor filtri `orderMatchesViloyatEntry` bilan mos.
 */
export function buildCourierRegionServiceText(viloyatId, tumanIds) {
  const vid = String(viloyatId || '').trim();
  if (!vid) return '';
  const entry = getViloyatEntryById(vid);
  if (!entry) return '';
  if (vid !== 'toshkent_sh') {
    const p = entry.patterns && entry.patterns[0];
    return p ? String(p) : '';
  }
  const base = 'Toshkent shahri';
  const ids = Array.isArray(tumanIds) ? tumanIds.map((x) => String(x).trim()).filter(Boolean) : [];
  if (ids.length === 0) return base;
  const labels = ids.map((id) => {
    const t = TOSHKENT_SH_TUMANS.find((x) => x.id === id);
    return t ? t.label : id;
  });
  return `${base} · ${labels.join(' · ')}`;
}

export function matchesViloyatFilter(text, viloyatId) {
  const entry = getViloyatEntryById(viloyatId);
  if (!entry) return true;
  return orderMatchesViloyatEntry(text, entry);
}

/** Manzil matnidan birinchi mos viloyat `id` (filtrlar bilan bir xil tartib). Mos kelmasa `other`. */
export function classifyShippingAddressViloyatId(shippingAddress) {
  const s = String(shippingAddress || '');
  for (const entry of PACKER_UZ_VILOYATLAR) {
    if (orderMatchesViloyatEntry(s, entry)) return entry.id;
  }
  return 'other';
}
