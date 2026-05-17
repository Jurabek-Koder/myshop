import twilio from 'twilio';
import { db } from '../db/database.js';

export const TWILIO_SETTINGS_KEY = 'twilio_settings';

export function readTwilioStoredObject() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(TWILIO_SETTINGS_KEY);
  if (!row?.value) return {};
  try {
    return JSON.parse(String(row.value));
  } catch {
    return {};
  }
}

export function getTwilioAuthToken(stored) {
  const fromDb = String(stored?.auth_token || '').trim();
  if (fromDb) return fromDb;
  return String(process.env.TWILIO_AUTH_TOKEN || '').trim();
}

export function normalizeTwilioPublic(stored) {
  const src = stored && typeof stored === 'object' ? stored : {};
  const sid = String(src.account_sid || '').trim().slice(0, 64);
  const fromNum = String(src.from_number || '').trim().slice(0, 32);
  const token = getTwilioAuthToken(src);
  return {
    account_sid: sid,
    from_number: fromNum,
    auth_token_configured: Boolean(token),
    signing_relaxed: Boolean(src.signing_relaxed),
    inbound_webhook_path: '/api/webhooks/twilio/sms',
    updated_at: src.updated_at || null,
  };
}

/** Twilio signature tekshiruvi uchun to‘liq URL (Twilio Console dagi webhook bilan bir xil bo‘lishi kerak). */
export function resolveTwilioInboundWebhookUrl(req) {
  const base = String(process.env.TWILIO_WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (base) return `${base}/api/webhooks/twilio/sms`;
  return `${req.protocol}://${req.get('host')}/api/webhooks/twilio/sms`;
}

export function validateTwilioWebhookRequest(req, stored) {
  const relaxed = Boolean(stored?.signing_relaxed);
  const authToken = getTwilioAuthToken(stored);
  if (relaxed) return true;
  if (!authToken) return false;
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;
  const url = resolveTwilioInboundWebhookUrl(req);
  try {
    return twilio.validateRequest(authToken, signature, url, req.body || {});
  } catch {
    return false;
  }
}

export async function twilioSendSms({ to, body, accountSid, authToken, from }) {
  const client = twilio(accountSid, authToken);
  const msg = await client.messages.create({
    to,
    from,
    body,
  });
  return msg;
}
