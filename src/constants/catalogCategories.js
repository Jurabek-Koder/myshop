/**
 * Do‘kon katalogi bo‘limlari — bosh sahifa, mahsulotlar filtirlari, header dropdown bilan bir xil.
 * `?category=` qiymati mahsulot `category` maydoni bilan mos kelishi kerak.
 */
import { AUDIENCE_CATEGORIES } from './audienceCategories.js';

export const CATALOG_NAV_CATEGORIES = [
  'Elektronika',
  'Maishiy texnika',
  'Kiyim',
  'Poyabzallar',
  'Aksessuarlar',
  'Goʻzallik va parvarish',
  'Salomatlik',
  'Uy-roʻzgʻor buyumlari',
  'Qurilish va taʼmirlash',
  'Avtotovarlar',
  'Bolalar tovarlari',
  'Xobbi va ijod',
  'Sport va hordiq',
  'Oziq-ovqat mahsulotlari',
  'Maishiy kimyoviy moddalar',
  'Kanselyariya tovarlari',
  'Hayvonlar uchun tovarlar',
  'Kitoblar',
];

/** Avvalo mijoz guruhi, keyin katalog bo‘limlari */
export const ALL_NAV_CATEGORIES = [...AUDIENCE_CATEGORIES, ...CATALOG_NAV_CATEGORIES];
