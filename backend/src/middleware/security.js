import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { security } from '../config/security.js';
import { isRenderSubdomainCorsTrustActive } from '../config/renderCorsTrust.js';
import { shieldMiddleware } from './shield.js';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Google/Facebook OAuth SDK'lari va Vapi kabi tashqi widget'lar ko'pincha
      // o'zining <script> teglarini kiritadi — shu sabab https: keng qoldirilgan,
      // lekin object-src, base-uri, frame-ancestors qattiq cheklangan (eng
      // keng tarqalgan hujum turlaridan: clickjacking, base-tag in'ektsiya).
      scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https:'],
      // Backend/Socket.IO/mobil (Capacitor) — turli manzillarga ulanishi kerak.
      connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
      mediaSrc: ["'self'", 'blob:', 'data:', 'https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * Alohida static site + alohida API (Render): CORS_ORIGINS qo‘yilmasa, brauzer Origin
 * frontend *.onrender.com bo‘ladi, ro‘yxatda esa ko‘pincha faqat API (RENDER_EXTERNAL_URL) turadi —
 * preflightda Allow-Origin chiqmaydi. Shuning uchun prod+Render va aniq CORS env bo‘lmaganda
 * https://*.onrender.com ni qo‘shimcha ruxsat beramiz. O‘chirish: MYSHOP_CORS_TRUST_ONRENDER=0
 * yoki CORS_ORIGINS / FRONTEND_URL berib aniq ro‘yxat ishlating.
 */
function buildCorsOriginOption() {
  const base = security.cors.origins;

  if (!isRenderSubdomainCorsTrustActive()) return base;

  return function corsOrigin(origin, callback) {
    if (!origin) return callback(null, true);
    if (base === true) return callback(null, true);
    if (Array.isArray(base) && base.includes(origin)) return callback(null, true);
    try {
      const u = new URL(origin);
      if (u.protocol === 'https:' && u.hostname.toLowerCase().endsWith('.onrender.com')) {
        return callback(null, true);
      }
    } catch {
      /* ignore */
    }
    return callback(new Error('CORS ruxsatsiz'), false);
  };
}

export const corsMiddleware = cors({
  origin: buildCorsOriginOption(),
  credentials: security.cors.credentials,
  methods: security.cors.methods,
  allowedHeaders: security.cors.allowedHeaders,
});

export const globalRateLimiter = rateLimit(security.rateLimit);

export const authRateLimiter = rateLimit(security.authRateLimit);

export const sanitizeMiddleware = mongoSanitize();

export { shieldMiddleware };

export const bodyParserConfig = {
  limit: security.bodyLimit,
};
