import { security } from '../config/security.js';
import { insertProjectAuditEntry, scrubBodyForAudit } from '../lib/projectAuditLog.js';

const SKIP_PREFIXES = [
  '/api/uploads/',
  '/assets/',
];

const RELAXED_PREFIXES = [
  '/api/webhooks/twilio',
  '/api/operator/ai-call/webhook',
  '/api/staff-chat/media',
  '/api/admin/portal/ad-slides/upload',
  '/api/admin/portal/ad-slides/upload-video',
];

const FREE_TEXT_PREFIXES = [
  '/api/orders',
  '/api/leads',
  '/api/operator',
  '/api/seller',
  '/api/admin/portal',
  '/api/admin/chat',
  '/api/picker/chat',
  '/api/picker/dm',
  '/api/courier/chat',
  '/api/courier/dm',
  '/api/packer',
  '/api/expeditor',
  '/api/accounting',
];

const BAD_BOTS = [
  /sqlmap/i,
  /nikto/i,
  /masscan/i,
  /zgrab/i,
  /dirbuster/i,
  /gobuster/i,
  /wfuzz/i,
  /hydra/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /havij/i,
];

const ALWAYS_BLOCK_PATTERNS = [
  { name: 'path_traversal', rx: /\.\.[/\\]|%2e%2e(?:%2f|%5c)|\/etc\/(?:passwd|shadow)|\\windows\\system32|cmd\.exe/i },
  { name: 'rce', rx: /\b(?:xp_cmdshell|shell_exec|passthru|proc_open|popen|base64_decode|gzinflate)\s*\(/i },
  { name: 'rce', rx: /(?:^|[;&|])\s*(?:curl|wget|nc|bash|sh|powershell|cmd)\s+(?:-|\w|https?:)/i },
  { name: 'xss_script', rx: /<\s*script[\s\S]*?>|javascript\s*:|data\s*:\s*text\/html/i },
];

const STRICT_PATTERNS = [
  { name: 'sqli_union', rx: /\bunion\b[\s\S]{0,80}\bselect\b/i },
  { name: 'sqli_sleep', rx: /\b(?:sleep|benchmark)\s*\(\s*\d+/i },
  { name: 'sqli_file', rx: /\binto\s+(?:out|dump)file\b|\bload_file\s*\(/i },
  { name: 'sqli_drop', rx: /\b(?:drop|truncate)\s+table\b/i },
  { name: 'xss_handler', rx: /<\s*(?:iframe|object|embed|svg|img)\b[\s\S]{0,120}\bon\w+\s*=/i },
  { name: 'xss_dom', rx: /\bdocument\.(?:cookie|write|location)\b|\beval\s*\(/i },
];

const ipStore = new Map();

function getMode() {
  const mode = String(security.shield?.mode || 'staged').toLowerCase();
  return mode === 'monitor' || mode === 'strict' ? mode : 'staged';
}

function isEnabled() {
  return Boolean(security.shield?.enabled);
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').trim();
  const raw =
    String(req.headers['cf-connecting-ip'] || '').trim() ||
    String(req.headers['x-real-ip'] || '').trim() ||
    (xf ? xf.split(',')[0].trim() : '') ||
    String(req.ip || req.socket?.remoteAddress || '').trim() ||
    'unknown';
  return raw.replace(/^::ffff:/, '');
}

function cleanPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0] || '/';
}

function startsWithAny(value, prefixes) {
  return prefixes.some((p) => value.startsWith(p));
}

function truncate(value, max = 1800) {
  const s = String(value || '');
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function bodyText(req) {
  if (!req.body || typeof req.body !== 'object' || Buffer.isBuffer(req.body)) return '';
  try {
    return JSON.stringify(scrubBodyForAudit(req.body));
  } catch {
    return '';
  }
}

function inspectText(req, includeBody) {
  const parts = [
    req.method || '',
    req.originalUrl || req.url || '',
    JSON.stringify(req.query || {}),
    JSON.stringify(req.params || {}),
    String(req.headers['content-type'] || ''),
    String(req.headers['user-agent'] || ''),
  ];
  if (includeBody) parts.push(bodyText(req));
  return truncate(parts.join(' '), 6000);
}

function rateResult(ip, mode) {
  const now = Date.now();
  const windowMs = Number(security.shield?.windowMs) || 60_000;
  const warnAt = Math.max(1, Number(security.shield?.warnPerMinute) || 90);
  const stagedBlock = Math.max(warnAt, Number(security.shield?.blockPerMinute) || 240);
  const strictBlock = Math.max(warnAt, Number(security.shield?.strictBlockPerMinute) || 150);
  const blockAt = mode === 'strict' ? strictBlock : stagedBlock;

  let rec = ipStore.get(ip);
  if (!rec) {
    rec = { hits: [], warnedAt: 0 };
    ipStore.set(ip, rec);
  }
  rec.hits = rec.hits.filter((t) => now - t < windowMs);
  rec.hits.push(now);

  const count = rec.hits.length;
  if (count >= blockAt) return { action: 'block', reason: `rate_limit_${count}_per_min` };
  if (count >= warnAt && now - rec.warnedAt > windowMs) {
    rec.warnedAt = now;
    return { action: 'log', reason: `rate_warn_${count}_per_min` };
  }
  return null;
}

function recordShieldEvent(req, { ip, action, reason, mode }) {
  const payload = {
    ip,
    mode,
    action,
    reason,
    ua: truncate(req.headers['user-agent'] || '', 300),
  };
  try {
    insertProjectAuditEntry({
      source: 'shield',
      actorUserId: req.user?.id || null,
      actorLabel: req.user?.login || req.user?.email || '',
      actorRole: req.user?.role || '',
      method: String(req.method || '').slice(0, 16),
      path: truncate(req.originalUrl || req.url || '', 1200),
      statusCode: action === 'block' ? 403 : null,
      summaryOriginal: `[shield:${action}] ${reason}`,
      payloadOriginal: payload,
    });
  } catch (e) {
    console.warn('[shield] audit:', e?.message || e);
  }
}

function decide(req) {
  const path = cleanPath(req);
  if (startsWithAny(path, SKIP_PREFIXES)) return null;

  const mode = getMode();
  const ip = clientIp(req);
  const relaxed = startsWithAny(path, RELAXED_PREFIXES);
  const freeText = startsWithAny(path, FREE_TEXT_PREFIXES);
  const ua = String(req.headers['user-agent'] || '');

  const rate = rateResult(ip, mode);
  if (rate) return { ...rate, ip, mode };

  if (!ua.trim() && !relaxed) return { action: mode === 'monitor' ? 'log' : 'block', reason: 'empty_user_agent', ip, mode };

  for (const rx of BAD_BOTS) {
    if (rx.test(ua)) return { action: mode === 'monitor' ? 'log' : 'block', reason: 'bad_bot_user_agent', ip, mode };
  }

  const text = inspectText(req, !relaxed);
  for (const pattern of ALWAYS_BLOCK_PATTERNS) {
    if (pattern.rx.test(text)) {
      return { action: mode === 'monitor' ? 'log' : 'block', reason: pattern.name, ip, mode };
    }
  }

  for (const pattern of STRICT_PATTERNS) {
    if (!pattern.rx.test(text)) continue;
    if (mode === 'strict') return { action: 'block', reason: pattern.name, ip, mode };
    if (!freeText && !relaxed) return { action: 'block', reason: pattern.name, ip, mode };
    return { action: 'log', reason: pattern.name, ip, mode };
  }

  return null;
}

export function shieldMiddleware(req, res, next) {
  if (!isEnabled()) return next();

  try {
    const result = decide(req);
    if (!result) return next();

    recordShieldEvent(req, result);
    if (result.action === 'block') {
      return res.status(403).json({
        error: 'Shubhali so‘rov bloklandi.',
        code: 'MYSHOP_SHIELD_BLOCKED',
      });
    }
  } catch (e) {
    console.warn('[shield]', e?.message || e);
  }
  return next();
}

setInterval(() => {
  const now = Date.now();
  const windowMs = Number(security.shield?.windowMs) || 60_000;
  for (const [ip, rec] of ipStore) {
    rec.hits = rec.hits.filter((t) => now - t < windowMs);
    if (!rec.hits.length) ipStore.delete(ip);
  }
}, 5 * 60 * 1000).unref?.();
