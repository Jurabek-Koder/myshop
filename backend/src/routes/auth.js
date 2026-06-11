import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, getUserAllowedPages } from '../db/database.js';
import { buildCourierRegionServiceText } from '../utils/viloyatPacker.js';
import { authRateLimiter } from '../middleware/security.js';
import { authRequired } from '../middleware/auth.js';
import { registerValidation, loginValidation } from '../middleware/validate.js';
import { security } from '../config/security.js';
import { insertProjectAuditEntry } from '../lib/projectAuditLog.js';
import { enrichUserWithRoleProfile } from '../lib/roleProfileId.js';
import {
  isUserLoginAllowed,
  LOGIN_ACCESS_DENIED_MESSAGE,
} from '../lib/portalAccess.js';
import {
  buildInstagramAuthorizeUrl,
  exchangeInstagramCode,
  findOrCreateOAuthUser,
  getOAuthPublicConfig,
  oauthPublicBaseUrl,
  verifyFacebookAccessToken,
  verifyGoogleAuthToken,
  verifyTelegramAuth,
} from '../lib/socialAuth.js';

const router = Router();

/**
 * Alohida frontend + alohida API: refresh cookie uchun SameSite=None kerak (aks holda brauzer
 * uni cross-site `/api/auth/refresh` ga yubormaydi).
 * Qo‘lda: MYSHOP_REFRESH_COOKIE_SAMESITE=lax|strict|none yoki MYSHOP_CROSS_SITE_COOKIES=1
 */
function shouldUseCrossSiteRefreshCookie() {
  const sam = String(process.env.MYSHOP_REFRESH_COOKIE_SAMESITE || '')
    .trim()
    .toLowerCase();
  if (process.env.NODE_ENV !== 'production') return false;
  if (sam === 'lax' || sam === 'strict') return false;
  if (sam === 'none') return true;
  if (String(process.env.MYSHOP_CROSS_SITE_COOKIES || '').trim() === '1') return true;

  const fromList = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const fromFrontend = process.env.FRONTEND_URL
    ? [String(process.env.FRONTEND_URL).replace(/\/$/, '').trim()].filter(Boolean)
    : [];
  const fe = [...new Set([...fromList, ...fromFrontend])];
  if (!fe.length) return false;

  const api = process.env.RENDER_EXTERNAL_URL
    ? String(process.env.RENDER_EXTERNAL_URL).replace(/\/$/, '').trim()
    : '';
  if (!api) {
    return fe.some((f) => /^https:\/\//i.test(f));
  }
  try {
    const apiO = new URL(api).origin;
    return fe.some((f) => {
      try {
        return new URL(f).origin !== apiO;
      } catch {
        return false;
      }
    });
  } catch {
    return true;
  }
}

/** HttpOnly cookie — brauzer yopilsa ham (Lax) qayta kirish; faqat remember_device=true da */
const REFRESH_COOKIE = 'myshop_refresh';
const REFRESH_COOKIE_MS = 7 * 24 * 60 * 60 * 1000;

function refreshCookieOpts() {
  const cross = shouldUseCrossSiteRefreshCookie();
  return {
    path: '/',
    sameSite: cross ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

function readRefreshFromCookie(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const prefix = `${REFRESH_COOKIE}=`;
  for (const part of raw.split(';')) {
    const p = part.trim();
    if (!p.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(p.slice(prefix.length).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function applyRefreshCookie(res, refreshToken, rememberDevice) {
  const o = refreshCookieOpts();
  if (!rememberDevice || !refreshToken) {
    res.clearCookie(REFRESH_COOKIE, o);
    return;
  }
  res.cookie(REFRESH_COOKIE, refreshToken, { ...o, httpOnly: true, maxAge: REFRESH_COOKIE_MS });
}

/**
 * MYSHOP_SUPERUSER_EMAILS — vergul bilan ajratilgan (masalan: a@b.c,c@d.e).
 * Bo‘sh qator — faqat birinchi ro‘yxatdan o‘tgan foydalanuvchi superuser; ixtiyoriy email yo‘q.
 * O‘rnatilmasa — loyiha egasi: joraaxmedov620@gmail.com ham doim superuser sifatida ro‘yxatdan o‘tadi.
 */
function buildSuperuserEmailSet() {
  const raw = process.env.MYSHOP_SUPERUSER_EMAILS;
  if (raw === '') return new Set();
  const src =
    raw != null && String(raw).trim() !== ''
      ? String(raw).trim()
      : 'joraaxmedov620@gmail.com';
  return new Set(src.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}
const SUPERUSER_EMAILS = buildSuperuserEmailSet();

function isDesignatedSuperuserEmail(emailLower) {
  return SUPERUSER_EMAILS.has(String(emailLower || '').trim().toLowerCase());
}

function ensureSuperuserRoleInDbIfNeeded(userRow) {
  if (!userRow?.id) return userRow;
  const em = String(userRow.email || '').trim().toLowerCase();
  if (!isDesignatedSuperuserEmail(em)) return userRow;
  if (String(userRow.role || '').toLowerCase() === 'superuser') {
    return userRow;
  }
  const suRow = db.prepare('SELECT id FROM roles WHERE lower(name) = lower(?)').get('superuser');
  const rid = suRow?.id ?? 1;
  db.prepare('UPDATE users SET role = ?, role_id = ? WHERE id = ?').run('superuser', rid, userRow.id);
  return db
    .prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, status FROM users WHERE id = ?')
    .get(userRow.id);
}

function generateTokens(userId) {
  const access = jwt.sign(
    { sub: String(userId), type: 'access' },
    security.jwt.accessSecret,
    { expiresIn: security.jwt.accessExpiry, issuer: security.jwt.issuer, audience: security.jwt.audience }
  );
  const refresh = jwt.sign(
    { sub: String(userId), type: 'refresh' },
    security.jwt.refreshSecret,
    { expiresIn: security.jwt.refreshExpiry, issuer: security.jwt.issuer, audience: security.jwt.audience }
  );
  return { access, refresh };
}

/** bcrypt.compare ba'zan yaroqsiz hash yoki tur noto‘g‘ri bo‘lsa xato beradi — 500 bo‘lmasin */
async function safeBcryptCompare(plain, hash) {
  const h = hash == null ? '' : String(hash);
  if (!h) return false;
  try {
    return await bcrypt.compare(String(plain || ''), h);
  } catch (e) {
    console.error('[auth] bcrypt.compare xato:', e?.message || e);
    return false;
  }
}

async function verifyUserPassword(plain, userRow) {
  const input = String(plain || '');
  if (!userRow) return false;
  if (userRow.password_hash && (await safeBcryptCompare(input, userRow.password_hash))) return true;

  // Eski yoki import qilingan userlarda parol plain holda qolgan bo'lishi mumkin.
  const plainStored = String(userRow.password_plain || '');
  if (plainStored && plainStored === input) return true;

  // Ba'zi eski insertlarda `password_hash` ustuniga plain parol yozilgan.
  const hashStored = String(userRow.password_hash || '');
  if (hashStored && !hashStored.startsWith('$2') && hashStored === input) return true;

  return false;
}

function normalizeRoleName(value) {
  return String(value || '').trim().toLowerCase();
}

function isSellerRole(value) {
  return normalizeRoleName(value) === 'seller';
}

function isCourierRole(value) {
  const raw = String(value || '');
  if (/курьер/i.test(raw)) return true;
  const n = normalizeRoleName(value);
  return n === 'courier' || n === 'kuryer' || (n && n.includes('kuryer'));
}

function isOperatorRole(value) {
  const raw = String(value || '').trim();
  const n = normalizeRoleName(value);
  const nCyrillic = raw.toLowerCase();
  return n === 'operator'
    || (n && n.includes('operator'))
    || nCyrillic === 'оператор'
    || (nCyrillic && nCyrillic.includes('оператор'));
}

function isPickerRole(value) {
  const raw = String(value || '');
  if (/пикер|сборщик|сбор/i.test(raw)) return true;
  const n = normalizeRoleName(value);
  return n === 'picker' || (n && n.includes('picker'));
}

function isPackerRole(value) {
  const raw = String(value || '');
  if (/пакер|упаков/i.test(raw)) return true;
  const n = normalizeRoleName(value);
  return n === 'packer' || (n && n.includes('packer'));
}

function isExpeditorRole(value) {
  const raw = String(value || '');
  if (/экспед|експед/i.test(raw)) return true;
  const n = normalizeRoleName(value);
  if (!n) return false;
  if (n === 'expeditor' || n === 'ekspeditor' || n === 'ekspidetor' || n === 'ekspiditor') return true;
  return (
    n.includes('expeditor')
    || n.includes('ekspeditor')
    || n.includes('eksped')
    || n.includes('ekspidet')
    || n.includes('ekspidit')
  );
}

const PORTAL_ROLE_KEYS = new Set([
  'seller',
  'courier',
  'operator',
  'picker',
  'packer',
  'expeditor',
  'order_receiver',
  'warehouse_admin',
  'accounting',
]);

/** Kirish: qaysi panel (users jadvali roli) — avvalo work_roles.portal_role, keyin nom/vazifa matni */
function inferPortalRoleKeyFromWorkRole(workRole) {
  const rawName = String(workRole?.role_name || '');
  const task = String(workRole?.task || '');
  const desc = String(workRole?.description || '');
  const blob = `${rawName} ${task} ${desc}`.toLowerCase();
  const blobAny = `${rawName} ${task} ${desc}`;

  if (isSellerRole(rawName)) return 'seller';
  if (/sotuvchi|sotuv|seller|селлер|do'kon|do`kon|dokon/i.test(blobAny)) return 'seller';

  /** Vazifada «yetkazib» bo‘lishi mumkin — ekspeditor nomi oldin tekshirilsin */
  if (
    isExpeditorRole(rawName)
    || isExpeditorRole(blob)
    || /ekspeditor|expeditor|ekspidetor|ekspiditor|экспедитор|eksped/i.test(blobAny)
  ) {
    return 'expeditor';
  }

  if (
    normalizeRoleName(rawName) === 'order_receiver'
    || /order_receiver|buyurtma\s*qabul\s*qiluvchi|zakaz\s*qabul\s*qiluvchi|qabul\s*qiluvchi\s*panel/i.test(blobAny)
  ) {
    return 'order_receiver';
  }

  if (isCourierRole(rawName) || /yetkazuv|yetkazib|dostav|достав|kuryer|курьер|yetkazib berish/i.test(blobAny)) {
    return 'courier';
  }

  /** Ombor/Buxgalter — operator regexidagi «buyurtma.*qabul» dan oldin bo‘lishi kerak */
  if (
    normalizeRoleName(rawName) === 'warehouse_admin'
    || /warehouse_admin\b|ombor\s*admin\s*paneli|omborsho\b|warehouse\s*management/i.test(blobAny)
    || /ombor\s*admin|sklad\s*admin|warehouse\s*admin|склад|omborchi\s*admin/i.test(blobAny)
    || (/(^|\s)ombor(\s|$)/i.test(blob) && /admin|admini|boshqaruv/i.test(blob))
  ) {
    return 'warehouse_admin';
  }
  if (
    normalizeRoleName(rawName) === 'accounting'
    || /buxgalter|бухгалтер|accounting|hisobchi|moliya\s*rol/i.test(blobAny)
  ) {
    return 'accounting';
  }

  if (
    isOperatorRole(rawName)
    || /operator|оператор|call.center|zakaz[^\n]{0,30}qabul|buyurtma[^\n]{0,56}qabul|mijoz\s+bilan/i.test(blobAny)
  ) {
    return 'operator';
  }

  if (isPickerRole(rawName) || /yiguv|yig'uv|yigʻuv|picker|yig.ish|mahsulot.*yig/i.test(blob)) {
    return 'picker';
  }

  if (isPackerRole(rawName) || /qadoqlov|packer|упаков|qadoqlash/i.test(blobAny)) {
    return 'packer';
  }

  return null;
}

function resolvePortalRoleKeyForLogin(workRole) {
  const explicit = String(workRole?.portal_role || '').trim().toLowerCase();
  if (PORTAL_ROLE_KEYS.has(explicit)) return explicit;
  const inferred = inferPortalRoleKeyFromWorkRole(workRole);
  if (inferred) return inferred;
  /** Avto aniqlanmagan rollar ham tizimga kira olsin — standart ishchi paneli */
  return 'operator';
}

function normalizeLogin(value, fallback = 'user') {
  let out = String(value || '').trim().toLowerCase();
  if (out.includes('@')) out = out.split('@')[0];
  out = out
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!out) {
    out = String(fallback || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  if (!out) out = 'user';
  if (out.length > 40) out = out.slice(0, 40);
  if (out.length < 3) out = `${out}001`.slice(0, 3);
  return out;
}

function clientIpFromReq(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').trim();
  if (xf) return xf.split(',')[0].trim();
  const xr = String(req.headers['x-real-ip'] || '').trim();
  if (xr) return xr;
  return String(req.ip || '').trim() || null;
}

function detectOs(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'Unknown OS';
  if (s.includes('android')) return 'Android';
  if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) return 'iOS';
  if (s.includes('windows')) return 'Windows';
  if (s.includes('mac os') || s.includes('macintosh')) return 'macOS';
  if (s.includes('linux')) return 'Linux';
  return 'Unknown OS';
}

function detectBrowser(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'Unknown Browser';
  if (s.includes('edg/')) return 'Edge';
  if (s.includes('opr/') || s.includes('opera')) return 'Opera';
  if (s.includes('chrome/')) return 'Chrome';
  if (s.includes('safari/') && !s.includes('chrome/')) return 'Safari';
  if (s.includes('firefox/')) return 'Firefox';
  return 'Unknown Browser';
}

function detectDeviceType(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'Unknown device';
  if (s.includes('ipad') || s.includes('tablet')) return 'Tablet';
  if (s.includes('mobi') || s.includes('android') || s.includes('iphone')) return 'Mobile';
  return 'Desktop';
}

function clientLocationFromReq(req) {
  const country = String(
    req.headers['cf-ipcountry'] ||
      req.headers['x-vercel-ip-country'] ||
      req.headers['x-country-code'] ||
      req.headers['x-appengine-country'] ||
      ''
  ).trim();
  const region = String(req.headers['x-vercel-ip-country-region'] || req.headers['x-region-code'] || '').trim();
  const city = String(req.headers['x-vercel-ip-city'] || req.headers['x-city'] || '').trim();
  const parts = [country, region, city].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function clientMetaFromReq(req) {
  const ua = String(req.headers['user-agent'] || '').trim().slice(0, 600);
  return {
    ip: clientIpFromReq(req),
    userAgent: ua || null,
    device: `${detectDeviceType(ua)} • ${detectOs(ua)} • ${detectBrowser(ua)}`,
    location: clientLocationFromReq(req),
  };
}

function uniqueLogin(seed, excludeUserId = null) {
  const base = normalizeLogin(seed, 'user');
  let candidate = base;
  let suffix = 1;

  while (true) {
    const existing = excludeUserId == null
      ? db.prepare('SELECT id FROM users WHERE lower(login) = lower(?)').get(candidate)
      : db.prepare('SELECT id FROM users WHERE lower(login) = lower(?) AND id != ?').get(candidate, excludeUserId);

    if (!existing) return candidate;

    const suffixText = String(suffix++);
    const maxBaseLen = Math.max(3, 40 - suffixText.length);
    candidate = `${base.slice(0, maxBaseLen)}${suffixText}`;
  }
}

function resolveSellerEmail(workRole) {
  const rawEmail = String(workRole?.email || '').trim().toLowerCase();
  if (rawEmail) return rawEmail;

  const rawLogin = String(workRole?.login || '').trim().toLowerCase();
  if (!rawLogin) return '';
  if (rawLogin.includes('@')) return rawLogin;
  return `${rawLogin}@seller.local`;
}

function findWorkRole(identifier) {
  const key = String(identifier || '').trim();
  if (!key) return null;

  return db.prepare(`
    SELECT *
    FROM work_roles
    WHERE deleted_at IS NULL
      AND lower(trim(ifnull(status, ''))) != 'blocked'
      AND (
        lower(trim(ifnull(login, ''))) = lower(?)
        OR lower(trim(ifnull(email, ''))) = lower(?)
        OR trim(ifnull(phone, '')) = ?
      )
    ORDER BY created_at DESC
    LIMIT 1
  `).get(key, key, key);
}

const findSellerWorkRole = findWorkRole;

function syncSellerUserFromWorkRole(workRole) {
  const email = resolveSellerEmail(workRole);
  if (!email) return null;

  const tx = db.transaction(() => {
    let seller = db.prepare('SELECT * FROM sellers WHERE lower(email) = lower(?)').get(email);
    const sellerName = String(workRole?.role_name || 'Seller').trim() || 'Seller';
    const sellerPhone = String(workRole?.phone || '').trim() || null;
    const sellerStatus = String(workRole?.status || '').trim() === 'blocked' ? 'blocked' : 'active';

    if (!seller) {
      const sellerResult = db.prepare(
        'INSERT INTO sellers (name, contact_phone, email, region_id, balance, status, user_id) VALUES (?, ?, ?, ?, ?, ?, NULL)'
      ).run(sellerName, sellerPhone, email, null, 0, sellerStatus);
      seller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(sellerResult.lastInsertRowid);
    }

    const workPassword = String(workRole?.password || 'Seller123!');
    const passwordHash = bcrypt.hashSync(workPassword, 12);
    const loginSeed = String(workRole?.login || email).trim();

    let user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id FROM users WHERE lower(email) = lower(?)').get(email);
    if (!user) {
      const loginValue = uniqueLogin(loginSeed || email);
      const userResult = db.prepare(
        'INSERT INTO users (email, login, password_hash, full_name, role, role_id, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(email, loginValue, passwordHash, seller.name || sellerName, 'seller', 2, seller.id);
      user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id FROM users WHERE id = ?').get(userResult.lastInsertRowid);
    } else {
      const loginValue = user.login
        ? normalizeLogin(user.login, loginSeed || email)
        : uniqueLogin(loginSeed || email, user.id);
      db.prepare(
        'UPDATE users SET login = ?, full_name = ?, role = ?, role_id = ?, seller_id = ?, password_hash = ? WHERE id = ?'
      ).run(loginValue, seller.name || sellerName, 'seller', 2, seller.id, passwordHash, user.id);
      user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id FROM users WHERE id = ?').get(user.id);
    }

    db.prepare('UPDATE sellers SET user_id = ?, name = ?, contact_phone = ?, status = ? WHERE id = ?').run(
      user.id,
      seller.name || sellerName,
      sellerPhone || seller.contact_phone || null,
      sellerStatus,
      seller.id
    );

    return user;
  });

  return tx();
}

function workRoleCourierTumanIds(workRole) {
  try {
    const raw = workRole?.courier_tuman_ids_json;
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

function syncCourierUserFromWorkRole(workRole) {
  const courierRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('courier')?.id || 3;
  const loginVal = String(workRole?.login || '').trim().toLowerCase();
  if (!loginVal) return null;

  const email = `${loginVal}@courier.myshop.local`;
  const workPassword = String(workRole?.password || '');
  const passwordHash = bcrypt.hashSync(workPassword || 'Courier123!', 12);
  const fullName = String(workRole?.role_name || workRole?.login || 'Kuryer').trim();
  const phone = String(workRole?.phone || '').trim() || null;
  const areaText = buildCourierRegionServiceText(
    String(workRole?.courier_viloyat_id || '').trim(),
    workRoleCourierTumanIds(workRole),
  );

  const tx = db.transaction(() => {
    let user = db.prepare('SELECT id, staff_member_id FROM users WHERE lower(login) = lower(?) OR lower(email) = lower(?)').get(loginVal, email);
    let staffMember = user?.staff_member_id ? db.prepare('SELECT id FROM staff_members WHERE id = ?').get(user.staff_member_id) : null;

    if (!staffMember) {
      const staffRes = db.prepare(`
        INSERT INTO staff_members (staff_type, full_name, phone, status, region_service_text) VALUES ('courier', ?, ?, 'active', ?)
      `).run(fullName, phone, areaText || null);
      staffMember = { id: staffRes.lastInsertRowid };
    }

    if (!user) {
      const userRes = db.prepare(`
        INSERT INTO users (email, login, password_hash, full_name, role, role_id, staff_member_id)
        VALUES (?, ?, ?, ?, 'courier', ?, ?)
      `).run(email, loginVal, passwordHash, fullName, courierRoleId, staffMember.id);
      user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?').get(userRes.lastInsertRowid);
    } else {
      db.prepare('UPDATE users SET password_hash = ?, full_name = ?, role = ?, role_id = ?, staff_member_id = ? WHERE id = ?')
        .run(passwordHash, fullName, 'courier', courierRoleId, staffMember.id, user.id);
      user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?').get(user.id);
    }

    db.prepare('UPDATE staff_members SET user_id = ?, full_name = ?, phone = ?, region_service_text = ? WHERE id = ?')
      .run(user.id, fullName, phone, areaText || null, staffMember.id);

    return user;
  });

  return tx();
}

function syncStaffUserFromWorkRole(workRole, staffType, roleKey, defaultRoleId = 5, options = {}) {
  const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleKey)?.id || defaultRoleId;
  const loginVal = String(workRole?.login || '').trim().toLowerCase();
  if (!loginVal) return null;

  const email =
    workRole?.email && String(workRole.email).includes('@')
      ? String(workRole.email).trim().toLowerCase()
      : `${loginVal}@${roleKey}.myshop.local`;
  const workPassword = String(workRole?.password || '');
  const defaultPwd = String(options.defaultPassword || '12345');
  const passwordHash = bcrypt.hashSync(workPassword || defaultPwd, 12);
  const fullName = String(workRole?.role_name || workRole?.login || roleKey).trim();
  const phone = String(workRole?.phone || '').trim() || null;
  const preservePasswordHash = Boolean(options.preservePasswordHash);

  const tx = db.transaction(() => {
    let user = db
      .prepare('SELECT id, staff_member_id, password_hash FROM users WHERE lower(login) = lower(?) OR lower(email) = lower(?)')
      .get(loginVal, email);

    let staff = null;
    if (user?.id) {
      staff = db
        .prepare(
          `SELECT id FROM staff_members WHERE user_id = ? AND lower(trim(staff_type)) = lower(?) LIMIT 1`,
        )
        .get(user.id, staffType);
    }
    if (!staff) {
      const found = findStaffRowForPickerPackerPortal(staffType, workRole);
      if (found?.id) staff = { id: found.id };
    }
    if (!staff) {
      const staffRes = db
        .prepare(`INSERT INTO staff_members (staff_type, full_name, phone, status) VALUES (?, ?, ?, 'active')`)
        .run(staffType, fullName, phone);
      staff = { id: staffRes.lastInsertRowid };
    }

    if (!user) {
      const userRes = db
        .prepare(
          `INSERT INTO users (email, login, password_hash, full_name, role, role_id, staff_member_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(email, loginVal, passwordHash, fullName, roleKey, roleId, staff.id);
      user = db
        .prepare(
          'SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?',
        )
        .get(userRes.lastInsertRowid);
    } else {
      const nextHash = preservePasswordHash && user.password_hash ? user.password_hash : passwordHash;
      db.prepare(
        'UPDATE users SET full_name = ?, role = ?, role_id = ?, staff_member_id = ?, password_hash = ? WHERE id = ?',
      ).run(fullName, roleKey, roleId, staff.id, nextHash, user.id);
      user = db
        .prepare(
          'SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?',
        )
        .get(user.id);
    }

    db.prepare('UPDATE staff_members SET user_id = ?, full_name = ?, phone = COALESCE(?, phone) WHERE id = ?').run(
      user.id,
      fullName,
      phone,
      staff.id,
    );

    return user;
  });

  return tx();
}

function syncOperatorUserFromWorkRole(workRole) {
  return syncStaffUserFromWorkRole(workRole, 'operator', 'operator', 4, { defaultPassword: 'Operator123!' });
}

function phoneDigitsLocal(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Picker/packer: `staff_members` va `users` bog‘lanishi shart (picker packerga topshiradi, packer `packer_id` bo‘yicha ko‘radi).
 * Avvalo telefon bo‘yicha mavjud `staff_members` qatorini qidiramiz (superuser admin orqali qo‘shgan).
 */
function findStaffRowForPickerPackerPortal(roleKey, workRole) {
  const phone = String(workRole?.phone || '').trim();
  if (phone) {
    const exact = db
      .prepare(`SELECT id, user_id FROM staff_members WHERE staff_type = ? AND trim(ifnull(phone,'')) = ? LIMIT 1`)
      .get(roleKey, phone);
    if (exact) return exact;
  }
  const pd = phoneDigitsLocal(phone);
  if (pd.length >= 9) {
    const rows = db.prepare(`SELECT id, user_id, phone FROM staff_members WHERE staff_type = ?`).all(roleKey);
    for (const r of rows) {
      if (phoneDigitsLocal(r.phone) === pd) return { id: r.id, user_id: r.user_id };
    }
  }
  return null;
}

function syncPickerPackerStaffFromWorkRole(workRole, roleKey, defaultRoleId = 5, options = {}) {
  if (roleKey !== 'picker' && roleKey !== 'packer') return null;
  const preservePasswordHash = Boolean(options.preservePasswordHash);
  const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleKey)?.id || defaultRoleId;
  const loginVal = String(workRole?.login || '').trim().toLowerCase();
  if (!loginVal) return null;

  const email = (workRole?.email && String(workRole.email).includes('@'))
    ? String(workRole.email).trim().toLowerCase()
    : `${loginVal}@${roleKey}.myshop.local`;
  const workPassword = String(workRole?.password || '');
  const passwordHash = bcrypt.hashSync(workPassword || '12345', 12);
  const fullName = String(workRole?.role_name || workRole?.login || roleKey).trim();
  const phone = String(workRole?.phone || '').trim() || null;

  const tx = db.transaction(() => {
    let user = db
      .prepare('SELECT id, staff_member_id, password_hash FROM users WHERE lower(login) = lower(?) OR lower(email) = lower(?)')
      .get(loginVal, email);

    let staff = null;
    if (user?.staff_member_id) {
      const row = db.prepare('SELECT id, user_id FROM staff_members WHERE id = ? AND staff_type = ?').get(user.staff_member_id, roleKey);
      if (row) staff = row;
    }
    if (!staff) {
      staff = findStaffRowForPickerPackerPortal(roleKey, workRole);
    }
    if (staff && staff.user_id != null && Number(staff.user_id) > 0 && Number(user?.id) > 0 && Number(staff.user_id) !== Number(user.id)) {
      staff = null;
    }
    if (!staff) {
      const ins = db
        .prepare(`INSERT INTO staff_members (staff_type, full_name, phone, status) VALUES (?, ?, ?, 'active')`)
        .run(roleKey, fullName, phone);
      staff = { id: ins.lastInsertRowid, user_id: null };
    }

    if (!user) {
      const userRes = db.prepare(`
        INSERT INTO users (email, login, password_hash, full_name, role, role_id, staff_member_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(email, loginVal, passwordHash, fullName, roleKey, roleId, staff.id);
      user = db
        .prepare(
          'SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?',
        )
        .get(userRes.lastInsertRowid);
    } else if (preservePasswordHash) {
      db.prepare('UPDATE users SET full_name = ?, role = ?, role_id = ?, staff_member_id = ? WHERE id = ?').run(
        fullName,
        roleKey,
        roleId,
        staff.id,
        user.id,
      );
      user = db
        .prepare(
          'SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?',
        )
        .get(user.id);
    } else {
      db.prepare('UPDATE users SET password_hash = ?, full_name = ?, role = ?, role_id = ?, staff_member_id = ? WHERE id = ?').run(
        passwordHash,
        fullName,
        roleKey,
        roleId,
        staff.id,
        user.id,
      );
      user = db
        .prepare(
          'SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?',
        )
        .get(user.id);
    }

    db.prepare('UPDATE staff_members SET user_id = ?, full_name = ?, phone = COALESCE(?, phone) WHERE id = ?').run(
      user.id,
      fullName,
      phone,
      staff.id,
    );

    return user;
  });
  return tx();
}

function syncWorkRoleUser(workRole, roleKey, defaultRoleId = 5) {
  const roleId = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleKey)?.id || defaultRoleId;
  const loginVal = String(workRole?.login || '').trim().toLowerCase();
  if (!loginVal) return null;

  const email = (workRole?.email && String(workRole.email).includes('@'))
    ? String(workRole.email).trim().toLowerCase()
    : `${loginVal}@${roleKey}.myshop.local`;
  const workPassword = String(workRole?.password || '');
  const passwordHash = bcrypt.hashSync(workPassword || '12345', 12);
  const fullName = String(workRole?.role_name || workRole?.login || roleKey).trim();

  const tx = db.transaction(() => {
    let user = db.prepare('SELECT id FROM users WHERE lower(login) = lower(?) OR lower(email) = lower(?)').get(loginVal, email);
    if (!user) {
      const userRes = db.prepare(`
        INSERT INTO users (email, login, password_hash, full_name, role, role_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(email, loginVal, passwordHash, fullName, roleKey, roleId);
      user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?').get(userRes.lastInsertRowid);
    } else {
      db.prepare('UPDATE users SET password_hash = ?, full_name = ?, role = ?, role_id = ? WHERE id = ?')
        .run(passwordHash, fullName, roleKey, roleId, user.id);
      user = db.prepare('SELECT id, email, login, password_hash, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?').get(user.id);
    }
    return user;
  });
  return tx();
}

router.post('/register', authRateLimiter, registerValidation, async (req, res) => {
  const { email, password, full_name } = req.body;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan.' });
  }

  const emailNorm = String(email || '').trim().toLowerCase();
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const isFirstUser = userCount.c === 0;
  const role = isFirstUser || isDesignatedSuperuserEmail(emailNorm) ? 'superuser' : 'customer';
  const roleRow = db.prepare('SELECT id FROM roles WHERE lower(name) = lower(?)').get(role);
  const roleId = roleRow?.id ?? (role === 'superuser' ? 1 : 2);
  const salt = await bcrypt.genSalt(12);
  const password_hash = await bcrypt.hash(password, salt);
  const login = uniqueLogin(email);
  const cm = clientMetaFromReq(req);

  const result = db
    .prepare(`
      INSERT INTO users (
        email, login, password_hash, password_plain, full_name, role, role_id, status,
        registered_ip, registered_user_agent, registered_device, registered_location
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `)
    .run(email, login, password_hash, password, full_name, role, roleId, cm.ip, cm.userAgent, cm.device, cm.location);

  const userId = result.lastInsertRowid;
  db.prepare(`
    INSERT INTO user_device_events (user_id, event_type, ip, user_agent, device, location)
    VALUES (?, 'register', ?, ?, ?, ?)
  `).run(userId, cm.ip, cm.userAgent, cm.device, cm.location);
  const tokens = generateTokens(userId);
  const user = db.prepare('SELECT id, email, login, full_name, role, role_id, seller_id, phone FROM users WHERE id = ?').get(userId);
  user.allowed_pages = getUserAllowedPages(user);
  try {
    insertProjectAuditEntry({
      source: 'auth',
      actorUserId: userId,
      actorLabel: String(full_name || email || login || '').slice(0, 200),
      actorRole: role,
      method: 'POST',
      path: '/api/auth/register',
      statusCode: 201,
      summaryOriginal: `REGISTER user_id=${userId} role=${role}`,
      payloadOriginal: { email: emailNorm, login },
    });
  } catch (e) {
    console.warn('[auth] audit register', e);
  }
  applyRefreshCookie(res, tokens.refresh, Boolean(req.body?.remember_device));
  res.status(201).json({ user, ...tokens });
});

router.post('/login', authRateLimiter, loginValidation, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || req.body?.login || req.body?.email || '').trim();
    const password = String(req.body?.password || '').trim();

    let user = db.prepare(`
    SELECT id, email, login, password_hash, password_plain, full_name, role, role_id, seller_id, status
    FROM users
    WHERE lower(trim(email)) = lower(?)
       OR lower(trim(IFNULL(login, ''))) = lower(?)
       OR trim(IFNULL(phone, '')) = ?
    LIMIT 1
  `).get(identifier, identifier, identifier);

    let match = false;
    if (user && !isUserLoginAllowed(user)) {
      user = null;
      match = false;
    } else if (user) {
      match = await verifyUserPassword(password, user);
    }

    if (!user || !match) {
      const workRole = findWorkRole(identifier) || (identifier.includes('@') ? findWorkRole(identifier.split('@')[0].trim()) : null);
      if (workRole) {
        const storedPwd = String(workRole.password || '').trim();
        const inputPwd = String(password || '').trim();
        const pwdMatch = storedPwd === inputPwd;
        if (pwdMatch) {
          const portalKey = resolvePortalRoleKeyForLogin(workRole);
          if (portalKey === 'seller') {
            user = syncSellerUserFromWorkRole(workRole);
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'courier') {
            user = syncCourierUserFromWorkRole(workRole);
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'operator') {
            user = syncOperatorUserFromWorkRole(workRole);
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'picker') {
            user = syncPickerPackerStaffFromWorkRole(workRole, 'picker');
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'packer') {
            user = syncPickerPackerStaffFromWorkRole(workRole, 'packer');
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'expeditor') {
            user = syncStaffUserFromWorkRole(workRole, 'expeditor', 'expeditor');
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'order_receiver') {
            user = syncStaffUserFromWorkRole(workRole, 'order_receiver', 'order_receiver');
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'warehouse_admin') {
            user = syncStaffUserFromWorkRole(workRole, 'warehouse_admin', 'warehouse_admin');
            if (user) match = await verifyUserPassword(password, user);
          } else if (portalKey === 'accounting') {
            user = syncWorkRoleUser(workRole, 'accounting');
            if (user) match = await verifyUserPassword(password, user);
          }
        }
      }
    }

    /**
     * Admin `work_roles.portal_role` ni o‘zgartirsa, `users.role` eski qolmasin — bcrypt bilan kirgan ham yangilansin.
     * Superuser / role_id=1 / belgilangan superuser email uchun ish ROliga sync qilinmasin: bir xil foydalanuvchi uchun
     * `syncWorkRoleUser` `password_hash`ni qayta yozadi va superuser paroli «noto‘g‘ri» bo‘lib qoladi.
     */
    if (user && match) {
      const emailLower = String(user.email || '').trim().toLowerCase();
      const skipWorkRolePortalSync =
        String(user.role || '').toLowerCase() === 'superuser'
        || Number(user.role_id) === 1
        || isDesignatedSuperuserEmail(emailLower);

      if (!skipWorkRolePortalSync) {
        const workRoleRe =
          findWorkRole(identifier) || (identifier.includes('@') ? findWorkRole(identifier.split('@')[0].trim()) : null);
        if (workRoleRe) {
          const portalKey = resolvePortalRoleKeyForLogin(workRoleRe);
          const currentRole = String(user.role || '').toLowerCase();
          if (portalKey !== currentRole) {
            let synced = null;
            if (portalKey === 'seller') synced = syncSellerUserFromWorkRole(workRoleRe);
            else if (portalKey === 'courier') synced = syncCourierUserFromWorkRole(workRoleRe);
            else if (portalKey === 'operator') synced = syncOperatorUserFromWorkRole(workRoleRe);
            else if (portalKey === 'picker') synced = syncPickerPackerStaffFromWorkRole(workRoleRe, 'picker');
            else if (portalKey === 'packer') synced = syncPickerPackerStaffFromWorkRole(workRoleRe, 'packer');
            else if (portalKey === 'expeditor') synced = syncStaffUserFromWorkRole(workRoleRe, 'expeditor', 'expeditor');
            else if (portalKey === 'order_receiver') synced = syncStaffUserFromWorkRole(workRoleRe, 'order_receiver', 'order_receiver');
            else if (portalKey === 'warehouse_admin') synced = syncStaffUserFromWorkRole(workRoleRe, 'warehouse_admin', 'warehouse_admin');
            else if (portalKey === 'accounting') synced = syncWorkRoleUser(workRoleRe, 'accounting');

            if (synced && Number(synced.id) === Number(user.id)) {
              user = db
                .prepare(
                  `SELECT id, email, login, password_hash, password_plain, full_name, role, role_id, seller_id, staff_member_id FROM users WHERE id = ?`,
                )
                .get(user.id);
              if (user) match = await verifyUserPassword(password, user);
              else match = false;
            }
          }
        }
      }
      user = ensureSuperuserRoleInDbIfNeeded(user) || user;
    }

    if (!user || !match || !isUserLoginAllowed(user)) {
      return res.status(401).json({ error: LOGIN_ACCESS_DENIED_MESSAGE });
    }

    /** `users` bcrypt bilan kirildi; `staff_members` hali bog‘lanmagan bo‘lsa, parolni qayta yozmaymiz */
    const rlPost = String(user.role || '').toLowerCase();
    if (rlPost === 'picker' || rlPost === 'packer') {
      const wrPost =
        findWorkRole(identifier) || (identifier.includes('@') ? findWorkRole(identifier.split('@')[0].trim()) : null);
      if (wrPost && resolvePortalRoleKeyForLogin(wrPost) === rlPost) {
        syncPickerPackerStaffFromWorkRole(wrPost, rlPost, 5, { preservePasswordHash: true });
      }
    }

    const cm = clientMetaFromReq(req);
    try {
      db.prepare(`
      UPDATE users
      SET
        last_login_at = datetime('now'),
        last_login_ip = ?,
        last_login_user_agent = ?,
        last_login_device = ?,
        last_login_location = ?
      WHERE id = ?
    `).run(cm.ip, cm.userAgent, cm.device, cm.location, user.id);
    } catch (e) {
      console.error('[auth] login UPDATE users last_login:', e?.message || e);
    }
    try {
      db.prepare(`
      INSERT INTO user_device_events (user_id, event_type, ip, user_agent, device, location)
      VALUES (?, 'login', ?, ?, ?, ?)
    `).run(user.id, cm.ip, cm.userAgent, cm.device, cm.location);
    } catch (e) {
      console.error('[auth] login INSERT user_device_events:', e?.message || e);
    }

    const tokens = generateTokens(user.id);
    const responseUser = db
      .prepare('SELECT id, email, login, full_name, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?')
      .get(user.id);
    if (!responseUser) {
      console.error('[auth] login: foydalanuvchi id=', user.id, 'SELECT dan keyin topilmadi');
      return res.status(500).json({ error: 'Foydalanuvchi ma\'lumoti topilmadi. Administratorga murojaat qiling.' });
    }
    try {
      responseUser.allowed_pages = getUserAllowedPages(responseUser);
    } catch (e) {
      console.error('[auth] login getUserAllowedPages:', e?.stack || e);
      responseUser.allowed_pages = ['/profile'];
    }
    try {
      insertProjectAuditEntry({
        source: 'auth',
        actorUserId: user.id,
        actorLabel: String(responseUser.full_name || responseUser.login || responseUser.email || '').slice(0, 200),
        actorRole: String(responseUser.role || ''),
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 200,
        summaryOriginal: `LOGIN user_id=${user.id}`,
        payloadOriginal: { ip: cm.ip || null, device: cm.device || null },
      });
    } catch (e) {
      console.warn('[auth] audit login', e);
    }
    try {
      applyRefreshCookie(res, tokens.refresh, Boolean(req.body?.remember_device));
    } catch (e) {
      console.error('[auth] applyRefreshCookie:', e?.stack || e);
    }
    return res.json({ user: enrichUserWithRoleProfile(responseUser), ...tokens });
  } catch (err) {
    console.error('[auth] /login xato:', err?.stack || err);
    const dev = process.env.NODE_ENV !== 'production';
    return res.status(500).json({
      error: 'Server xatosi. Keyinroq urinib ko\'ring yoki administratorga murojaat qiling.',
      ...(dev && err?.message ? { detail: String(err.message) } : {}),
    });
  }
});

router.post('/refresh', authRateLimiter, (req, res) => {
  const refreshToken =
    (req.body && String(req.body.refresh_token || '').trim()) || readRefreshFromCookie(req) || null;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token kerak.' });
  try {
    const payload = jwt.verify(refreshToken, security.jwt.refreshSecret, {
      issuer: security.jwt.issuer,
      audience: security.jwt.audience,
    });
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Token turi noto\'g\'ri.' });
    const user = db.prepare('SELECT id, status, role, role_id FROM users WHERE id = ?').get(payload.sub);
    if (!user || !isUserLoginAllowed(user)) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOpts());
      return res.status(401).json({ error: LOGIN_ACCESS_DENIED_MESSAGE });
    }
    const tokens = generateTokens(payload.sub);
    if (readRefreshFromCookie(req)) {
      applyRefreshCookie(res, tokens.refresh, true);
    }
    res.json(tokens);
  } catch (_) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOpts());
    return res.status(401).json({ error: 'Refresh token yaroqsiz.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOpts());
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  const user = enrichUserWithRoleProfile({ ...req.user, allowed_pages: getUserAllowedPages(req.user) });
  res.json({ user });
});

/** Joriy foydalanuvchi: ism, email, login, telefon; ixtiyoriy yangi parol. Rol o‘zgarmaydi. */
router.patch('/me', authRequired, async (req, res) => {
  const userId = req.user.id;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!current) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });

  const body = req.body || {};
  const fullName =
    body.full_name !== undefined && body.full_name !== null
      ? String(body.full_name).trim()
      : String(current.full_name || '').trim();
  const email =
    body.email !== undefined && body.email !== null
      ? String(body.email).trim().toLowerCase()
      : String(current.email || '').trim().toLowerCase();
  const login =
    body.login !== undefined && body.login !== null
      ? String(body.login).trim().toLowerCase()
      : String(current.login || '').trim().toLowerCase();
  const phone =
    body.phone !== undefined && body.phone !== null
      ? String(body.phone).trim()
      : String(current.phone || '').trim();

  const pwdRaw = body.password !== undefined && body.password !== null ? String(body.password) : '';
  const password = pwdRaw.trim();

  if (!fullName) return res.status(400).json({ error: "Ism bo'sh bo'lmasin." });
  if (!email) return res.status(400).json({ error: 'Email kiriting.' });
  if (!login) return res.status(400).json({ error: 'Login kiriting.' });

  const emailTaken = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, userId);
  if (emailTaken) return res.status(409).json({ error: 'Bu email allaqachon band.' });

  const loginTaken = db
    .prepare("SELECT id FROM users WHERE lower(IFNULL(login, '')) = lower(?) AND id != ?")
    .get(login, userId);
  if (loginTaken) return res.status(409).json({ error: 'Bu login allaqachon band.' });

  if (password && password.length < 6) {
    return res.status(400).json({ error: "Parol kamida 6 belgi bo'lishi kerak." });
  }

  let passwordHash = current.password_hash;
  let passwordPlain = current.password_plain ?? null;
  if (password) {
    const oldPlain = String(current.password_plain || '').trim();
    if (oldPlain && oldPlain !== password) {
      db.prepare('INSERT INTO user_password_history (user_id, password_plain, note) VALUES (?, ?, ?)').run(
        userId,
        oldPlain,
        "Self-service o'zgartirishdan oldingi parol",
      );
    }
    passwordHash = await bcrypt.hash(password, 12);
    passwordPlain = password;
  }

  try {
    db.prepare('UPDATE users SET full_name = ?, email = ?, login = ?, phone = ?, password_hash = ?, password_plain = ? WHERE id = ?').run(
      fullName,
      email,
      login,
      phone || null,
      passwordHash,
      passwordPlain,
      userId
    );
  } catch (e) {
    return res.status(500).json({ error: 'Saqlashda xatolik.' });
  }

  const updated = db
    .prepare(
      'SELECT id, email, login, full_name, role, role_id, seller_id, staff_member_id, phone FROM users WHERE id = ?'
    )
    .get(userId);
  updated.allowed_pages = getUserAllowedPages(updated);
  res.json({ user: enrichUserWithRoleProfile(updated) });
});

function findUserByIdentifier(identifier) {
  const key = String(identifier || '').trim();
  if (!key) return null;
  return db
    .prepare(
      `
    SELECT id, email, login, phone, status
    FROM users
    WHERE lower(trim(email)) = lower(?)
       OR lower(trim(IFNULL(login, ''))) = lower(?)
       OR trim(IFNULL(phone, '')) = ?
    LIMIT 1
  `,
    )
    .get(key, key, key);
}

router.post('/forgot-password', authRateLimiter, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Email, login yoki telefon kiriting.' });
    }

    const user = findUserByIdentifier(identifier);
    if (!user || String(user.status || '').toLowerCase() === 'blocked') {
      return res.json({
        ok: true,
        message: 'Agar akkaunt topilsa, tiklash kodi yuborildi.',
      });
    }

    const token = String(crypto.randomInt(100000, 999999));
    const tokenHash = bcrypt.hashSync(token, 10);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    db.prepare(
      `
      INSERT INTO password_reset_tokens (user_id, identifier, token_hash, expires_at)
      VALUES (?, ?, ?, datetime('now', '+15 minutes'))
    `,
    ).run(user.id, identifier, tokenHash);

    return res.json({
      ok: true,
      message: 'Tiklash kodi yaratildi. 15 daqiqa ichida kiriting.',
      reset_token: token,
      expires_in: 900,
    });
  } catch (e) {
    return res.status(500).json({ error: 'So\'rov bajarilmadi. Keyinroq urinib ko\'ring.' });
  }
});

router.post('/reset-password', authRateLimiter, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!identifier || !token || !password) {
      return res.status(400).json({ error: 'Barcha maydonlarni to\'ldiring.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lishi kerak.' });
    }

    const user = findUserByIdentifier(identifier);
    if (!user || String(user.status || '').toLowerCase() === 'blocked') {
      return res.status(400).json({ error: 'Kod yoki ma\'lumot noto\'g\'ri.' });
    }

    const row = db
      .prepare(
        `
      SELECT id, token_hash FROM password_reset_tokens
      WHERE user_id = ? AND datetime(expires_at) > datetime('now')
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get(user.id);

    if (!row || !bcrypt.compareSync(token, row.token_hash)) {
      return res.status(400).json({ error: 'Kod noto\'g\'ri yoki muddati tugagan.' });
    }

    const oldPlain = db.prepare('SELECT password_plain FROM users WHERE id = ?').get(user.id);
    const prevPlain = String(oldPlain?.password_plain || '').trim();
    if (prevPlain && prevPlain !== password) {
      db.prepare('INSERT INTO user_password_history (user_id, password_plain, note) VALUES (?, ?, ?)').run(
        user.id,
        prevPlain,
        'Parol tiklashdan oldingi parol',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?').run(
      passwordHash,
      password,
      user.id,
    );
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

    return res.json({ ok: true, message: 'Parol yangilandi. Endi yangi parol bilan kiring.' });
  } catch (e) {
    return res.status(500).json({ error: 'Parol yangilab bo\'lmadi.' });
  }
});

router.get('/oauth/config', (_req, res) => {
  res.json(getOAuthPublicConfig());
});

async function finishOAuthSession(req, res, provider, profile) {
  const cm = clientMetaFromReq(req);
  const { user, created } = findOrCreateOAuthUser(provider, profile.providerUserId, profile, cm);
  const tokens = generateTokens(user.id);
  applyRefreshCookie(res, tokens.refresh, Boolean(req.body?.remember_device));
  try {
    insertProjectAuditEntry({
      source: 'auth',
      actorUserId: user.id,
      actorLabel: String(user.full_name || user.email || user.login || '').slice(0, 200),
      actorRole: user.role,
      method: 'POST',
      path: `/api/auth/oauth/${provider}`,
      statusCode: created ? 201 : 200,
      summaryOriginal: `OAUTH_${provider.toUpperCase()} user_id=${user.id}`,
      payloadOriginal: { provider, created },
    });
  } catch (e) {
    console.warn('[auth] oauth audit', e);
  }
  return { user, ...tokens, created };
}

router.post('/oauth/google', authRateLimiter, async (req, res) => {
  try {
    const profile = await verifyGoogleAuthToken(req.body || {});
    const payload = await finishOAuthSession(req, res, 'google', profile);
    res.status(payload.created ? 201 : 200).json(payload);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Google orqali kirish amalga oshmadi' });
  }
});

router.post('/oauth/facebook', authRateLimiter, async (req, res) => {
  try {
    const profile = await verifyFacebookAccessToken(req.body?.access_token);
    const payload = await finishOAuthSession(req, res, 'facebook', profile);
    res.status(payload.created ? 201 : 200).json(payload);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Facebook orqali kirish amalga oshmadi' });
  }
});

router.post('/oauth/telegram', authRateLimiter, async (req, res) => {
  try {
    const profile = verifyTelegramAuth(req.body || {});
    const payload = await finishOAuthSession(req, res, 'telegram', profile);
    res.status(payload.created ? 201 : 200).json(payload);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Telegram orqali kirish amalga oshmadi' });
  }
});

router.get('/oauth/instagram/start', (req, res) => {
  try {
    const base = oauthPublicBaseUrl();
    if (!base) return res.status(503).json({ error: 'OAUTH_PUBLIC_BASE_URL sozlanmagan' });
    const redirectUri = `${base}/api/auth/oauth/instagram/callback`;
    const returnTo = String(req.query.returnTo || '/register').trim() || '/register';
    const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
    const url = `${buildInstagramAuthorizeUrl(redirectUri)}&state=${encodeURIComponent(state)}`;
    res.redirect(url);
  } catch (e) {
    res.status(503).json({ error: e.message || 'Instagram OAuth sozlanmagan' });
  }
});

router.get('/oauth/instagram/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) throw new Error('Instagram kodi yo‘q');
    const base = oauthPublicBaseUrl();
    const redirectUri = `${base}/api/auth/oauth/instagram/callback`;
    const profile = await exchangeInstagramCode(code, redirectUri);
    await finishOAuthSession(req, res, 'instagram', profile);

    let returnTo = '/register';
    try {
      const stateRaw = String(req.query.state || '');
      if (stateRaw) {
        const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
        if (parsed?.returnTo) returnTo = String(parsed.returnTo);
      }
    } catch {
      /* ignore */
    }

    const fe = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const target = fe ? `${fe}${returnTo.startsWith('/') ? returnTo : `/${returnTo}`}?oauth=1` : `${returnTo}?oauth=1`;
    res.redirect(target);
  } catch (e) {
    const fe = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const errMsg = encodeURIComponent(e.message || 'Instagram xato');
    res.redirect(fe ? `${fe}/register?oauth_error=${errMsg}` : `/register?oauth_error=${errMsg}`);
  }
});

export default router;
