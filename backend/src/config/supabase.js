/**
 * Supabase — bulutda mahsulot va rollarning aks-nusxasi (mirror).
 * Faqat SERVERDA: SERVICE_ROLE kalitni hech qayerga (frontend/env public) bermang.
 *
 * Env:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Dashboard → Settings → API)
 *
 * Sukut (kalit mavjud bo‘lsa): aks-havola yoqilgan; o‘chirish:
 *   SUPABASE_MIRROR_SYNC_ENABLED=0
 *
 * Oraliq (ms): SUPABASE_SYNC_INTERVAL_MS (sukut: 120000)
 */
import { createClient } from '@supabase/supabase-js';

let _cached = null;

export function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || '').trim();
}

export function getSupabaseServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

/** Kalit mavjud hamda sukut bo‘yicha mirror sync yoqilgan (MIRROR_SYNC_ENABLED=0 emas). */
export function isSupabaseMirrorSyncEnabled() {
  const explicitOff =
    String(process.env.SUPABASE_MIRROR_SYNC_ENABLED || '').trim().toLowerCase() === '0' ||
    String(process.env.SUPABASE_MIRROR_SYNC_ENABLED || '').trim().toLowerCase() === 'false';
  if (explicitOff) return false;
  return !!(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/**
 * SERVICE_ROLE bilan Supabase mijoz — faqat server / CLI.
 * Mirror avto-sync o‘chirilgan bo‘lsa ham mavjud bo‘lishi mumkin (masalan bir martalik tugma).
 */
export function getSupabaseServiceClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;
  if (_cached?.url === url && _cached?.key === key) return _cached.client;
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  _cached = { url, key, client };
  return client;
}
