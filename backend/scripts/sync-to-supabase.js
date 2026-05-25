/**
 * Lokaldagi SQLite bazani Supabase aks-jadvlarga yozadi (bir martalik push).
 *
 * Ishdan oldin: supabase/migrations/... sql ni Supabase loyihangizda bajaring va
 * .env da SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY kiriting.
 */
import 'dotenv/config';
import { initDatabase, db } from '../src/db/database.js';
import { pushMirrorToSupabase } from '../src/db/supabaseMirrorSync.js';

initDatabase();

try {
  const ok = await pushMirrorToSupabase(db);
  if (!ok) {
    console.error(
      '[sync-to-supabase] SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY mavjud emas (yoki .env yuklanmagan).',
    );
    process.exit(1);
  }
  console.log('[sync-to-supabase] Yakunlandi.');
  process.exit(0);
} catch (e) {
  console.error('[sync-to-supabase]', e.message || e);
  process.exit(1);
}
