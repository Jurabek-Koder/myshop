import 'dotenv/config';

/** Yozuvlar va serverdagi `new Date()` uchun standart vaqt zonasi (O‘zbekiston). */
if (!process.env.TZ) {
  process.env.TZ = 'Asia/Tashkent';
}
import express from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { adSlidesUploadPath, getSqlitePath, getUploadsRoot } from './config/dataPaths.js';
import net from 'net';
import {
  helmetMiddleware,
  corsMiddleware,
  globalRateLimiter,
  sanitizeMiddleware,
  shieldMiddleware,
  bodyParserConfig,
} from './middleware/security.js';
import { isRenderSubdomainCorsTrustActive } from './config/renderCorsTrust.js';
import { mutationAuditMiddleware } from './middleware/mutationAudit.js';
import { db, initDatabase } from './db/database.js';
import { backfillStaffRoleProfiles } from './lib/roleProfileId.js';
import { scheduleSupabaseMirrorSync } from './db/supabaseMirrorSync.js';
import { logAiOperatorEnvStatus } from './modules/operator/call-operator.service.js';
import { maybeAutoCreateAdvanceRunForToday } from './services/payrollAdvanceService.js';
import payrollAdvanceWorkerRoutes from './routes/payrollAdvanceWorker.js';
import {
  parseHomeBenefitsJson,
  mergeHomeBenefitsForPublic,
  HOME_BENEFITS_DEFAULT,
} from './config/homeBenefitsDefaults.js';
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import rolesRoutes from './routes/roles.js';
import portalRoutes from './routes/portal.js';
import accountingPortalRoutes from './routes/accountingPortal.js';
import accountingErpRoutes from './routes/accountingErp.js';
import sellerRoutes from './routes/seller.js';
import courierRoutes from './routes/courier.js';
import operatorRoutes from './routes/operator.js';
import warehouseAdminRoutes from './routes/warehouseAdmin.js';
import pickerRoutes from './routes/picker.js';
import packerRoutes from './routes/packer.js';
import expeditorRoutes from './routes/expeditor.js';
import archivedOrdersRoutes from './routes/archivedOrders.js';
import operatorAiCallWebhookRoutes from './routes/operatorAiCallWebhook.js';
import twilioWebhookRoutes from './routes/twilioWebhook.js';
import leadsRoutes from './routes/leads.js';
import staffChatMediaRoutes from './routes/staffChatMedia.js';
import { security } from './config/security.js';

const app = express();
/** Render/nginx orqali HTTPS — Twilio webhook signature URL uchun */
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || '1') || 1);
const PREFERRED_PORT = Number(process.env.PORT) || 3000;

/** Dev: band bo‘lsa keyingi bo‘sh port (faqat NODE_ENV !== 'production') */
function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(false);
      else reject(err);
    });
    s.once('listening', () => {
      s.close(() => resolve(true));
    });
    s.listen(port);
  });
}

async function resolveListenPort() {
  const want = PREFERRED_PORT;
  if (process.env.NODE_ENV === 'production') return want;
  for (let p = want; p < want + 24; p++) {
    try {
      if (await isPortAvailable(p)) {
        if (p !== want) {
          console.warn(
            `[MyShop] Port ${want} band — API ${p} da ishga tushmoqda. ` +
              `Frontend: vite.config.js da proxy target http://127.0.0.1:${p} qiling yoki ${want} ni bo‘shating.`,
          );
        }
        return p;
      }
    } catch (e) {
      console.error('[MyShop] Port tekshiruvi:', e);
      return want;
    }
  }
  console.error(`[MyShop] ${want}…${want + 23} oralig‘ida bo‘sh port topilmadi.`);
  return want;
}

const PORT = await resolveListenPort();

initDatabase();
try {
  backfillStaffRoleProfiles();
} catch (e) {
  console.warn('[MyShop] backfillStaffRoleProfiles:', e?.message || e);
}
scheduleSupabaseMirrorSync(db);

function schedulePayrollAdvanceAutoRun() {
  const tick = () => {
    try {
      const r = maybeAutoCreateAdvanceRunForToday();
      if (r?.run && r.created) {
        console.log(
          `[MyShop] Oylik avans superuserga yuborildi: ${r.run.cycle_year}-${r.run.cycle_month}, ${r.items_added} xodim`,
        );
      }
    } catch (e) {
      console.warn('[MyShop] avans auto-run:', e?.message || e);
    }
  };
  tick();
  setInterval(tick, 6 * 60 * 60 * 1000);
}
schedulePayrollAdvanceAutoRun();

if (process.env.NODE_ENV === 'production') {
  const persisted = !!(process.env.MYSHOP_DATA_DIR && String(process.env.MYSHOP_DATA_DIR).trim());
  const onRender = String(process.env.RENDER || '').trim().toLowerCase() === 'true';

  /** Render-da sukut diski ephemeral — ma’lumotlar qalqib ketmasligi uchun doimiy disk majburiy. */
  const allowEphemeralExplicit =
    String(process.env.MYSHOP_ALLOW_EPHEMERAL_DISK || '').trim() === '1' ||
    String(process.env.MYSHOP_ALLOW_EPHEMERAL_DISK || '').trim().toLowerCase() === 'true';

  if (onRender && !persisted) {
    if (allowEphemeralExplicit) {
      console.warn(
        '[MyShop] [RISK] MYSHOP_ALLOW_EPHEMERAL_DISK o‘rniga ishlayapmiz — ma’lumotlar Render ephemeral diskida, ' +
          'uyqu/deploy/restart bilan yo‘qolishi mumkin. Doimilik uchun Persistent Disk va MYSHOP_DATA_DIR bering.',
      );
    } else {
      console.error(
        '[MyShop] Render requires MYSHOP_DATA_DIR (persistent disk mount). SQLite must not live on ephemeral storage. ' +
          'Dashboard: Web Service → Disks → add disk, mount e.g. /var/data/myshop, then Env MYSHOP_DATA_DIR=/var/data/myshop. ' +
          'Free plan often has no disk; upgrade or set MYSHOP_ALLOW_EPHEMERAL_DISK=1 only for demos (risk). See render.yaml.',
      );
      process.exit(1);
    }
  }

  if (!persisted && !onRender) {
    console.warn(
      '[MyShop] [WARN] MYSHOP_DATA_DIR o‘rnatilmagan — agar VM/container diski hammaga qadar doimiy bo‘lmasa, SQLite yo‘qolishi mumkin. ' +
        'Ishonch uchun MYSHOP_DATA_DIR bering.',
    );
  } else if (persisted) {
    console.log('[MyShop] Doimiy saqlash:', getSqlitePath(), '| uploads:', getUploadsRoot());
  }
}

const adSlidesPublicDir = adSlidesUploadPath();
fs.mkdirSync(adSlidesPublicDir, { recursive: true });
app.use('/api/uploads/ad-slides', express.static(adSlidesPublicDir, { maxAge: '7d' }));

app.use(helmetMiddleware);
app.use(corsMiddleware);

/** Bosh sahifa bannerlari — corsMiddleware dan keyin (alohida static frontend domenlarida CORS ishlaydi) */
app.get('/api/ad-slides', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, sort_order, title, subtitle, link_url, image_url, image_url_mobile, video_url
         FROM ad_slides WHERE active = 1 ORDER BY sort_order ASC, id ASC`,
      )
      .all();
    res.json({ slides: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ slides: [] });
  }
});

const FOOTER_STRIP_PUBLIC_DEFAULT_TEXT = "Bepul yetkazib berish — 500 000 so'mdan ortiq buyurtmalarda";
const FOOTER_STRIP_PUBLIC_DEFAULT_PHONE = '+998 71 123 45 67';

app.get('/api/footer-strip', (_req, res) => {
  try {
    const textRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('footer_strip_text_live');
    const phoneRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('footer_strip_phone_live');
    const promo_text = String(textRow?.value ?? '').trim() || FOOTER_STRIP_PUBLIC_DEFAULT_TEXT;
    const phone = String(phoneRow?.value ?? '').trim() || FOOTER_STRIP_PUBLIC_DEFAULT_PHONE;
    res.json({ promo_text, phone });
  } catch (e) {
    console.error(e);
    res.json({
      promo_text: FOOTER_STRIP_PUBLIC_DEFAULT_TEXT,
      phone: FOOTER_STRIP_PUBLIC_DEFAULT_PHONE,
    });
  }
});

app.get('/api/home-benefits', (_req, res) => {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('home_benefits_live');
    const parsed = parseHomeBenefitsJson(String(row?.value ?? ''));
    res.json(mergeHomeBenefitsForPublic(parsed || HOME_BENEFITS_DEFAULT));
  } catch (e) {
    console.error(e);
    res.json(mergeHomeBenefitsForPublic(null));
  }
});

app.use(globalRateLimiter);
app.use(express.json(bodyParserConfig));
app.use(express.urlencoded({ ...bodyParserConfig, extended: true }));
app.use(cookieParser());
/* Twilio kiruvchi SMS — sanitize dan oldin (imzo uchun body o‘zgarmasin) */
app.use('/api/webhooks/twilio', twilioWebhookRoutes);
app.use(shieldMiddleware);
app.use(sanitizeMiddleware);
app.use(mutationAuditMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/roles', rolesRoutes);
app.use('/api/admin/portal', portalRoutes);
app.use('/api/accounting/portal', accountingPortalRoutes);
app.use('/api/accounting', accountingErpRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/courier', courierRoutes);
// Vapi webhooks (authRequired emas) — operator middleware'dan oldin ulansin.
app.use('/api/operator', operatorAiCallWebhookRoutes);
app.use('/api/operator', operatorRoutes);
app.use('/api/warehouse-admin', warehouseAdminRoutes);
app.use('/api/picker', pickerRoutes);
app.use('/api/packer', packerRoutes);
app.use('/api/expeditor', expeditorRoutes);
app.use('/api/archived-orders', archivedOrdersRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/staff-chat', staffChatMediaRoutes);
app.use('/api/staff/payroll-advances', payrollAdvanceWorkerRoutes);

app.get('/api/health', (_req, res) => {
  const dataDirPersisted = !!(process.env.MYSHOP_DATA_DIR && String(process.env.MYSHOP_DATA_DIR).trim());
  const onRender = String(process.env.RENDER || '').trim().toLowerCase() === 'true';
  const ephemeralOptInRender =
    onRender &&
    !dataDirPersisted &&
    (String(process.env.MYSHOP_ALLOW_EPHEMERAL_DISK || '').trim() === '1' ||
      String(process.env.MYSHOP_ALLOW_EPHEMERAL_DISK || '').trim().toLowerCase() === 'true');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dataDirPersisted,
    ephemeralOptInRender,
  });
});

/**
 * Production: bitta domen (PaaS test deploy, Nginxsiz) — `frontend/dist` shu processdan beriladi.
 * `backend/` dan ishga tushganda sukut: `../frontend/dist`
 * yoki .env: FRONTEND_DIST=/to‘liq/yo‘l/frontend/dist
 */
if (process.env.NODE_ENV === 'production' && String(process.env.MYSHOP_SERVE_SPA || '1') !== '0') {
  const fromEnv = process.env.FRONTEND_DIST && String(process.env.FRONTEND_DIST).trim();
  const relativeDefault = path.join(process.cwd(), '..', 'frontend', 'dist');
  const frontendDist = fromEnv
    ? path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(process.cwd(), fromEnv)
    : path.resolve(relativeDefault);
  const indexHtml = path.join(frontendDist, 'index.html');

  /** index.html ni keshlamaslik — aks holda mobil «refresh» eski hashed chunk havolalari bilan qoladi (404 → React xato). */
  function spaStaticCacheHeaders(res, filePath) {
    const rel = path.relative(frontendDist, filePath).replace(/\\/g, '/');
    if (rel === 'index.html') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (rel.startsWith('assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(frontendDist, { index: false, setHeaders: spaStaticCacheHeaders }));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(indexHtml, (err) => {
        if (err) next(err);
      });
    });
    console.log('[MyShop] SPA: static', path.relative(process.cwd(), frontendDist) || frontendDist);
  } else {
    console.warn(
      '[MyShop] Production, lekin `frontend/dist` topilmadi — faqat /api. Build: `cd frontend && npm run build`',
    );
  }
}

app.use((err, req, res, next) => {
  if (err.message === 'CORS ruxsatsiz') return res.status(403).json({ error: 'Ruxsat berilmagan.' });
  console.error(err);
  res.status(500).json({ error: 'Server xatosi.' });
});

const server = app.listen(PORT, () => {
  console.log('API http://localhost:' + PORT + ' da ishlayapti');
  if (process.env.NODE_ENV !== 'production') return;
  if (isRenderSubdomainCorsTrustActive()) {
    console.log(
      '[MyShop] CORS: https://*.onrender.com origins allowed (no CORS_ORIGINS). ' +
        'For stricter API set CORS_ORIGINS or MYSHOP_CORS_TRUST_ONRENDER=0.',
    );
  }
  const o = security.cors.origins;
  const n =
    o === true ? 'har qanday origin (dev uslubi)' : Array.isArray(o) ? `${o.length} ta origin` : String(o);
  console.log('[MyShop] CORS ruxsatlari:', n);

  const onRender = String(process.env.RENDER || '').trim().toLowerCase() === 'true';
  const isLocalhostOnly =
    Array.isArray(o) && o.every((x) => /localhost|127\.0\.0\.1/i.test(String(x)));
  const hasFrontendEnv = Boolean(String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '').trim());
  if (onRender && isLocalhostOnly && !hasFrontendEnv) {
    console.warn(
      '[MyShop] CORS: set CORS_ORIGINS or FRONTEND_URL to your static site HTTPS URL. ' +
        'Default list is localhost only; split frontend login will fail.',
    );
  }

  logAiOperatorEnvStatus();
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      '[MyShop] Port ' +
        PORT +
        " band (EADDRINUSE). Boshqa dastur barcha sinovlarni egallagan bo'lishi mumkin. " +
        '`.env` da `PORT=` bering yoki `netstat -ano | findstr :' +
        PORT +
        '` → `taskkill /PID <pid> /F`.',
    );
  } else {
    console.error('[MyShop] Server xatosi:', err);
  }
  process.exit(1);
});

