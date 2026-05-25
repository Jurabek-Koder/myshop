import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, getUserAllowedPages } from '../db/database.js';

const PROVIDERS = new Set(['google', 'facebook', 'instagram', 'telegram']);

export function oauthPublicBaseUrl() {
  const raw =
    process.env.OAUTH_PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.FRONTEND_URL ||
    '';
  return String(raw).replace(/\/$/, '');
}

export function getOAuthPublicConfig() {
  return {
    googleClientId: String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
    facebookAppId: String(process.env.FACEBOOK_APP_ID || process.env.VITE_FACEBOOK_APP_ID || '').trim(),
    telegramBotUsername: String(process.env.TELEGRAM_BOT_USERNAME || process.env.VITE_TELEGRAM_BOT_USERNAME || '').trim(),
    telegramBotId: String(process.env.TELEGRAM_BOT_ID || '').trim(),
    instagramConfigured: Boolean(
      String(process.env.INSTAGRAM_APP_ID || '').trim() &&
        String(process.env.INSTAGRAM_APP_SECRET || '').trim(),
    ),
  };
}

function randomPasswordHash() {
  const salt = bcrypt.genSaltSync(12);
  return bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), salt);
}

function syntheticEmail(provider, providerUserId) {
  const safe = String(providerUserId || 'user').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${provider}_${safe}@oauth.myshop.local`;
}

function resolveRoleForNewUser(emailNorm) {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const isFirstUser = userCount.c === 0;
  const superEmails = new Set(
    String(process.env.MYSHOP_SUPERUSER_EMAILS || 'joraaxmedov620@gmail.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  const role = isFirstUser || superEmails.has(emailNorm) ? 'superuser' : 'customer';
  const roleRow = db.prepare('SELECT id FROM roles WHERE lower(name) = lower(?)').get(role);
  return { role, roleId: roleRow?.id ?? (role === 'superuser' ? 1 : 2) };
}

function uniqueLogin(seed, excludeUserId = null) {
  const base = String(seed || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 36) || 'user';
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing =
      excludeUserId == null
        ? db.prepare('SELECT id FROM users WHERE lower(login) = lower(?)').get(candidate)
        : db.prepare('SELECT id FROM users WHERE lower(login) = lower(?) AND id != ?').get(candidate, excludeUserId);
    if (!existing) return candidate;
    const suffixText = String(suffix++);
    candidate = `${base.slice(0, Math.max(3, 40 - suffixText.length))}${suffixText}`;
  }
}

/**
 * OAuth profilidan foydalanuvchi topish yoki yaratish.
 * @returns {{ user: object, created: boolean }}
 */
export function findOrCreateOAuthUser(provider, providerUserId, profile, clientMeta = {}) {
  if (!PROVIDERS.has(provider)) {
    throw new Error('Noto‘g‘ri OAuth provayder');
  }
  const pid = String(providerUserId || '').trim();
  if (!pid) throw new Error('Provayder ID yo‘q');

  const existingLink = db
    .prepare('SELECT user_id FROM user_oauth_accounts WHERE provider = ? AND provider_user_id = ?')
    .get(provider, pid);

  if (existingLink?.user_id) {
    const user = db
      .prepare(
        'SELECT id, email, login, full_name, role, role_id, seller_id, phone, status FROM users WHERE id = ?',
      )
      .get(existingLink.user_id);
    if (!user) throw new Error('Foydalanuvchi topilmadi');
    if (String(user.status || '').toLowerCase() === 'blocked') {
      throw new Error('Akkount bloklangan');
    }
    user.allowed_pages = getUserAllowedPages(user);
    return { user, created: false };
  }

  const emailRaw = String(profile?.email || '').trim().toLowerCase();
  const email = emailRaw || syntheticEmail(provider, pid);
  const fullName =
    String(profile?.full_name || profile?.name || profile?.username || 'Foydalanuvchi').trim() ||
    'Foydalanuvchi';

  let user = emailRaw ? db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(emailRaw) : null;

  const tx = db.transaction(() => {
    if (user) {
      if (String(user.status || '').toLowerCase() === 'blocked') {
        throw new Error('Akkount bloklangan');
      }
      db.prepare(
        `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, profile_json)
         VALUES (?, ?, ?, ?)`,
      ).run(user.id, provider, pid, JSON.stringify(profile || {}));
      return { userId: user.id, created: false };
    }

    const { role, roleId } = resolveRoleForNewUser(email);
    const login = uniqueLogin(email.split('@')[0] || pid);
    const password_hash = randomPasswordHash();
    const result = db
      .prepare(
        `INSERT INTO users (
          email, login, password_hash, full_name, role, role_id, status,
          registered_ip, registered_user_agent, registered_device, registered_location
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      )
      .run(
        email,
        login,
        password_hash,
        fullName,
        role,
        roleId,
        clientMeta.ip || null,
        clientMeta.userAgent || null,
        clientMeta.device || null,
        clientMeta.location || null,
      );

    const userId = result.lastInsertRowid;
    db.prepare(
      `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, profile_json)
       VALUES (?, ?, ?, ?)`,
    ).run(userId, provider, pid, JSON.stringify(profile || {}));

    db.prepare(
      `INSERT INTO user_device_events (user_id, event_type, ip, user_agent, device, location)
       VALUES (?, 'register', ?, ?, ?, ?)`,
    ).run(
      userId,
      clientMeta.ip || null,
      clientMeta.userAgent || null,
      clientMeta.device || null,
      clientMeta.location || null,
    );

    return { userId, created: true };
  });

  const { userId, created } = tx();
  user = db
    .prepare('SELECT id, email, login, full_name, role, role_id, seller_id, phone, status FROM users WHERE id = ?')
    .get(userId);
  user.allowed_pages = getUserAllowedPages(user);
  return { user, created };
}

export async function verifyGoogleAccessToken(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw new Error('Google token yo‘q');
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.sub) throw new Error('Google profil olinmadi');
  return {
    providerUserId: String(data.sub),
    email: String(data.email || '').trim().toLowerCase(),
    full_name: String(data.name || '').trim(),
    picture: data.picture || null,
  };
}

export async function verifyGoogleAuthToken(body) {
  if (body?.id_token && String(body.id_token).includes('.')) {
    return verifyGoogleIdToken(body.id_token);
  }
  if (body?.access_token) {
    return verifyGoogleAccessToken(body.access_token);
  }
  throw new Error('Google token yo‘q');
}

export async function verifyGoogleIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw new Error('Google token yo‘q');
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || 'Google token noto‘g‘ri');

  const clientId = String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (clientId && data.aud !== clientId) {
    throw new Error('Google client ID mos kelmadi');
  }

  return {
    providerUserId: String(data.sub || ''),
    email: String(data.email || '').trim().toLowerCase(),
    full_name: String(data.name || data.given_name || '').trim(),
    picture: data.picture || null,
  };
}

export async function verifyFacebookAccessToken(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw new Error('Facebook token yo‘q');
  const appId = String(process.env.FACEBOOK_APP_ID || '').trim();
  const appSecret = String(process.env.FACEBOOK_APP_SECRET || '').trim();
  if (appId && appSecret) {
    const dbg = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
    );
    const dbgData = await dbg.json().catch(() => ({}));
    if (!dbgData?.data?.is_valid) throw new Error('Facebook token yaroqsiz');
  }

  const res = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(token)}`,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) throw new Error(data?.error?.message || 'Facebook profil olinmadi');

  return {
    providerUserId: String(data.id),
    email: String(data.email || '').trim().toLowerCase(),
    full_name: String(data.name || '').trim(),
    picture: data.picture?.data?.url || null,
  };
}

export async function exchangeInstagramCode(code, redirectUri) {
  const appId = String(process.env.INSTAGRAM_APP_ID || '').trim();
  const appSecret = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
  if (!appId || !appSecret) throw new Error('Instagram OAuth sozlanmagan');

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code: String(code || '').trim(),
  });

  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.user_id) {
    throw new Error(data?.error_message || 'Instagram token olinmadi');
  }

  const userRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(data.access_token)}`,
  );
  const userData = await userRes.json().catch(() => ({}));

  return {
    providerUserId: String(data.user_id || userData?.id || ''),
    email: '',
    full_name: String(userData?.username || 'Instagram foydalanuvchi').trim(),
    username: userData?.username || null,
  };
}

export function buildInstagramAuthorizeUrl(redirectUri) {
  const appId = String(process.env.INSTAGRAM_APP_ID || '').trim();
  if (!appId) throw new Error('Instagram OAuth sozlanmagan');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'user_profile',
    response_type: 'code',
  });
  return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
}

export function verifyTelegramAuth(payload) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!botToken) throw new Error('Telegram bot sozlanmagan');

  const data = { ...payload };
  const hash = String(data.hash || '');
  delete data.hash;
  if (!hash) throw new Error('Telegram hash yo‘q');

  const authDate = Number(data.auth_date || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    throw new Error('Telegram sessiyasi eskirgan');
  }

  const checkString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (hmac !== hash) throw new Error('Telegram imzosi noto‘g‘ri');

  const id = String(data.id || '');
  if (!id) throw new Error('Telegram ID yo‘q');

  const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();

  return {
    providerUserId: id,
    email: '',
    full_name: fullName || data.username || 'Telegram foydalanuvchi',
    username: data.username || null,
    photo_url: data.photo_url || null,
  };
}
