/**
 * DR: Bulutdagi MyShop aksini mahalliy SQLite ga tiklaydi.
 *
 * ShART: mahalliy `order_items` va `product_leads` bo‘sh bo‘lishi kerak —
 * aks holda mahsulotlarni DELETE qilish FK xatolik beradi.
 */
import 'dotenv/config';
import { initDatabase, db } from '../src/db/database.js';
import { pullMirrorFromSupabase } from '../src/db/supabaseMirrorSync.js';

initDatabase();

try {
  const r = await pullMirrorFromSupabase(db);
  console.log('[pull-from-supabase] Natija:', r);
  process.exit(0);
} catch (e) {
  console.error('[pull-from-supabase]', e.message || e);
  process.exit(1);
}
