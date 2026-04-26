import crypto from 'crypto';
import { db } from '../../db/database.js';
import { VapiClient } from '@vapi-ai/server-sdk';
import Bull from 'bull';
import { resolveDeliveryRoute, extractCityAndDistrict } from './delivery-router.logic.js';

let queue = null;
let workerAttached = false;

function readEncryptionKey() {
  const raw = String(process.env.MYSHOP_AI_TRANSCRIPTS_AES_KEY || '').trim();
  if (!raw) return null;

  // Accept either hex (32 bytes => 64 hex chars) or base64.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // ignore
  }
  return null;
}

function requireEncryptionKey() {
  const key = readEncryptionKey();
  if (!key) {
    throw new Error('MYSHOP_AI_TRANSCRIPTS_AES_KEY (32 bytes, hex or base64) not set');
  }
  return key;
}

function encryptText(plainText) {
  const key = requireEncryptionKey();
  const iv = crypto.randomBytes(12); // GCM standard recommendation
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]).toString('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  return { ciphertext, iv: iv.toString('base64'), auth_tag: authTag };
}

function decryptText({ ciphertext, iv, auth_tag }) {
  const key = requireEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(auth_tag, 'base64'));
  return decipher.update(String(ciphertext), 'base64', 'utf8') + decipher.final('utf8');
}

export function encryptTranscriptText(plainText) {
  return encryptText(plainText);
}

function hashPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function buildSystemPrompt() {
  const operatorName = String(process.env.MYSHOP_AI_OPERATOR_NAME || '').trim();
  const nameLine = operatorName
    ? `Kerak bo‘lsa o‘zingizni "${operatorName}" deb qisqa tanishtirasiz. `
    : '';
  return `Sen haqiqiy inson bo‘lgan call-markaz operatorisiz — MyShop. Sen jonli telefon qo‘ng‘irog‘idasan. ${nameLine}Sun’iy intellekt emassan. "AI", "robot", "avtomatik tizim" dema.

========================
TIL
========================
- Faqat o‘zbek tilida gapir, lotin harflarda yoz (masalan "qo'ng'iroq", "buyurtma").
- Og‘zaki, kundalik suhbat uslubi — rasmiy emas, skript emas.
- Har bir javob: 5–12 so‘z atrofida, qisqa jumlalar. Uzun nutq yo‘q.
- Bir vaqtda bir qadam — "step by step".

========================
OVOZ USLUBI
========================
- O‘zini xotirjam, ishonchli, do‘stona tut.
- Jumlalar orasida logik tanaffus (kerak bo‘lsa "ha", "yaxshi", "tushundim").
- Skriptday o‘qilgan ohang bo‘lmasin.

========================
ASOSIY ISH
========================
- Buyurtmani tasdiqlash.
- Yetkazib berishni tushunarli aytish (uyga yoki markaz).
- Sodda savollarga qisqa javob.
- Oxirida aniq qaror: tasdiq / bekor / aniqlanmagan.

========================
QO‘NG‘IROQ OQIMI (MUHIM)
========================

1. BOSHLASH (tabiiy)
"Assalomu alaykum, MyShopdan qo'ng'iroq qilyapman. Siz buyurtma bergandingiz."
Keyin jimgina kut — mijoz gapirishi mumkin.

2. NiyatNI TASDIQLASH
"Buyurtmani tasdiqlaysizmi?"
Javobini kut.

3. AGAR MIJOZ ROZI BO‘LSA
"Rahmat. Ikki xil variant bor."
"Uyga yetkazib beramiz yoki markazdan olib ketasiz."
"Qaysi biri sizga qulay?"

4. AGAR MIJOZ RAD ETSA
"Tushundim, unda bekor qilaman."
Suhbatni yakunla.

5. AGAR SAVOL SORALSA — qisqa javob, keyin qaytadan yo‘naltirish
Yetkazish: "Odatda bir ikki kun ichida yetkaziladi."
Narx: "Narxi o'zgarmaydi, buyurtmadagi kabi."
Olib ketish: "Yaqin markazdan olib ketishingiz mumkin."
Keyin: "Shunda tasdiqlaymizmi?"

6. AGAR IKKILANSA
"Uyga yetkazish qulayroq bo'ladi, xohlasangiz tez olib boramiz."
Yana so‘ra: "Qaysi biri mos?"

7. AGAR TUSHUNMASANG / SHOVQIN
"Kechirasiz, yana bir bor aytsangiz."

8. AGAR JIMJITLIK
"Eshityapsizmi?"

========================
QAROR QOIDALARI
========================
- Aniq HA → tasdiqlangan.
- Aniq YO‘Q → bekor.
- Noaniq → yana bir marta so‘ra (maksimum ikki marta).
- Hali noaniq → "keyinroq qayta bog'lanamiz" yoki operatorga uzatishni taklif qil (qisqa).

========================
QAT’IY
========================
- Uzun abzas yozma.
- Bir xil jumlani ikki marta ketma-ket takrorlama.
- O‘zini yordamchi deb ko‘rsatma — oddiy operatordek bo‘l.
- Ortiqcha tushuntirish bermay, suhbatni o‘zing boshqar.
- Oxirida har doim qaror yoki keyingi qadam bo‘lsin.

========================
TTS / O'QISH
========================
- Gapirish uchun yozgan matn ovozga aylanadi — raqamlarni har doim O‘ZBEKCHA SO‘Z bilan yoz (buyurtma raqami, vaqt, summa, telefon).
- Raqam qatorini "4747" kabi qoldirma.

Buyurtma tafsilotlari (mahsulot, manzil) keyingi xabarda beriladi — ulardan foydalan, lekin suhbatni yuqoridagi oqim bo‘yicha boshqar.

========================
XAVFSIZLIK
========================
- Bank karta, SMS-kod, parol so‘rama.
- Shubha bo‘lsa — qisqa yo‘naltir: "Operatorimiz sizga qo'ng'iroq qiladi."`;
}

function readEnvFloat(key, fallback) {
  const v = parseFloat(String(process.env[key] ?? ''));
  return Number.isFinite(v) ? v : fallback;
}

/** Vapi: tabiiroq TTS — default OpenAI; ixtiyoriy ElevenLabs (sizning ovoz kutubxonangizdagi voiceId). */
function buildAssistantVoice() {
  const provider = String(process.env.MYSHOP_VAPI_VOICE_PROVIDER || 'openai').trim().toLowerCase();

  if (provider === '11labs' || provider === 'elevenlabs') {
    const voiceId = String(process.env.MYSHOP_VAPI_ELEVENLABS_VOICE_ID || '').trim();
    if (!voiceId) {
      throw new Error(
        'ElevenLabs uchun MYSHOP_VAPI_ELEVENLABS_VOICE_ID (Vapi / 11labs voice id) kerak.',
      );
    }
    const model = String(process.env.MYSHOP_VAPI_ELEVENLABS_MODEL || 'eleven_multilingual_v2').trim();
    const eleven = {
      provider: '11labs',
      voiceId,
      model,
      stability: readEnvFloat('MYSHOP_VAPI_ELEVEN_STABILITY', 0.52),
      similarityBoost: readEnvFloat('MYSHOP_VAPI_ELEVEN_SIMILARITY', 0.82),
      speed: readEnvFloat('MYSHOP_VAPI_VOICE_SPEED', 0.98),
      style: readEnvFloat('MYSHOP_VAPI_ELEVEN_STYLE', 0.28),
    };
    const elLang = String(process.env.MYSHOP_VAPI_ELEVEN_LANGUAGE || '').trim();
    if (elLang) eleven.language = elLang;
    return eleven;
  }

  const voiceId = String(process.env.MYSHOP_VAPI_OPENAI_VOICE_ID || 'marin').trim() || 'marin';
  const defaultInstructions =
    'Native Uzbek (Latin-style) phone operator in Uzbekistan. Clear casual spoken Uzbek, not formal, not robotic. ' +
    'Warm human cadence, short phrases, slight natural pauses. No American accent. Sound like a real person on a mobile line.';
  const instructions = String(process.env.MYSHOP_VAPI_VOICE_INSTRUCTIONS || '').trim() || defaultInstructions;

  return {
    provider: 'openai',
    voiceId,
    model: String(process.env.MYSHOP_VAPI_OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim(),
    speed: readEnvFloat('MYSHOP_VAPI_VOICE_SPEED', 0.94),
    instructions,
  };
}

function buildAssistantTranscriber() {
  const mode = String(process.env.MYSHOP_VAPI_TRANSCRIBER || 'deepgram').trim().toLowerCase();
  if (mode === 'off' || mode === 'none' || mode === 'default') return undefined;

  const model = String(process.env.MYSHOP_VAPI_DEEPGRAM_MODEL || 'nova-2-phonecall').trim();
  return {
    provider: 'deepgram',
    model,
    language: 'multi',
    endpointing: readEnvFloat('MYSHOP_VAPI_DEEPGRAM_ENDPOINTING', 300),
    keywords: [
      'MyShop',
      'My Shop',
      'buyurtma',
      'zakaz',
      'заказ',
      'курьер',
      'kuryer',
      'Toshkent',
      'Ташкент',
      'Chilonzor',
      'Чиланзар',
    ],
  };
}

function buildAiContext(orderRow, items, deliveryRoute) {
  const city = deliveryRoute?.city || null;
  const district = deliveryRoute?.district || null;

  const productNames = items
    .slice(0, 12)
    .map((it) => String(it.name_uz || it.name || '').trim())
    .filter(Boolean);

  return {
    orderId: orderRow.id,
    customerName: orderRow.customer_full_name || '',
    products: productNames,
    address: String(orderRow.shipping_address || '').trim(),
    city,
    district,
    deliveryMode: deliveryRoute?.mode,
    deliveryModeSummary: deliveryRoute?.summary,
  };
}

function formatAiUserContext(ctx) {
  return [
    'Quyidagi buyurtma bo‘yicha qo‘ng‘iroq qilyapsiz. Manzil va mahsulotlarni tasdiqlashda ishlating (gapirishda hamma raqamlarni o‘zbekcha so‘z bilan ayting).',
    `Mijoz nomi: ${ctx.customerName || '—'}`,
    `Buyurtma raqami (ichki id): ${ctx.orderId} — gapirganda o‘zbekcha so‘z bilan yozing, masalan "qirq yetti"`,
    `Mahsulotlar: ${ctx.products.length ? ctx.products.join(', ') : '—'}`,
    `Manzil: ${ctx.address || '—'}`,
    `Shahar/tuman: ${ctx.city || '—'} / ${ctx.district || '—'}`,
    `Tizim bo‘yicha yetkazish: ${ctx.deliveryModeSummary || '—'} (mijozga oddiy so‘z bilan: uyga yoki markazdan olib ketish variantlarini taklif qiling).`,
  ].join('\n');
}

async function getOrderForAi(orderId) {
  const id = parseInt(String(orderId), 10);
  if (!Number.isFinite(id) || id < 1) throw new Error('orderId noto\'g\'ri');

  const order = db
    .prepare(
      `
    SELECT o.*, u.full_name AS customer_full_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.id = ?
  `,
    )
    .get(id);

  if (!order) throw new Error('Buyurtma topilmadi');

  const items = db
    .prepare(
      `
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `,
    )
    .all(id);

  return { order, items };
}

function getVapiClient() {
  const token = String(process.env.MYSHOP_VAPI_TOKEN || '').trim();
  if (!token) return null;
  return new VapiClient({ token });
}

function getVapiWebhookUrlRequired() {
  const url = String(process.env.MYSHOP_VAPI_WEBHOOK_URL || '').trim();
  if (!url) {
    throw new Error('MYSHOP_VAPI_WEBHOOK_URL yo\'q (Vapi server webhook uchun).');
  }
  return url;
}

function getAppSecretRequired() {
  const secret = String(process.env.MYSHOP_APP_SECRET_KEY || '').trim();
  if (!secret) throw new Error('MYSHOP_APP_SECRET_KEY yo\'q.');
  return secret;
}

function readPhoneNumberId() {
  return String(process.env.MYSHOP_VAPI_PHONE_NUMBER_ID || '').trim();
}

function buildAssistantForOrder({ order, items }) {
  const address = String(order.shipping_address || '').trim();
  const loc = extractCityAndDistrict(address);
  const deliveryRoute = resolveDeliveryRoute(loc);
  const ctx = buildAiContext(
    { ...order, id: order.id, city: loc.city, district: loc.district, shipping_address: address },
    items,
    { ...loc, ...deliveryRoute },
  );

  // Phone privacy: do not send raw phone to AI model
  const phoneHash = hashPhone(order.contact_phone);
  const userContext = [
    formatAiUserContext(ctx),
    `Customer phone hash (for reference only): ${phoneHash || '—'}`,
  ].join('\n');

  const openAiModel = {
    provider: 'openai',
    model: String(process.env.MYSHOP_VAPI_OPENAI_MODEL || 'gpt-4o-mini'),
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContext },
    ],
  };

  const voice = buildAssistantVoice();
  const transcriber = buildAssistantTranscriber();

  const firstMessage = String(
    process.env.MYSHOP_VAPI_FIRST_MESSAGE ||
      "Assalomu alaykum, MyShopdan qo'ng'iroq qilyapman. Siz buyurtma bergandingiz.",
  ).trim();
  const firstModeRaw = String(process.env.MYSHOP_VAPI_FIRST_MESSAGE_MODE || 'assistant-speaks-first').trim();
  const firstMessageMode =
    firstModeRaw === 'assistant-waits-for-user' ? 'assistant-waits-for-user' : 'assistant-speaks-first';

  return {
    name: `MyShop_order_${order.id}`,
    firstMessageMode,
    ...(firstMessageMode === 'assistant-speaks-first' && firstMessage ? { firstMessage } : {}),
    backgroundSound: 'off',
    voice,
    transcriber,
    // Vapi server webhook orqali transcriptlar sizning backendga keladi.
    // (Eslatma: bu URL HTTPS bo‘lishi shart.)
    server: {
      url: getVapiWebhookUrlRequired(),
      timeoutSeconds: 20,
      headers: {
        'X-App-Secret-Key': getAppSecretRequired(),
      },
    },
    model: openAiModel,
  };
}

function ensureQueue() {
  if (queue) return queue;
  // Bull requires Redis. For dev/test where Redis isn't running, we still allow server boot,
  // but queue jobs won't run.
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  try {
    queue = new Bull('ai_call_operator', {
      redis: { host: redisHost, port: redisPort },
    });
  } catch (e) {
    // Queue is optional for app usage; fail loudly on actual enqueue/start.
    queue = null;
  }
  return queue;
}

function ensureWorker() {
  if (workerAttached) return;
  const q = ensureQueue();
  if (!q) return;

  workerAttached = true;
  q.process(1, async (job) => {
    const { orderId, operatorId } = job.data || {};
    await startAiCallForOrderNow({ orderId, operatorId });
    return { ok: true };
  });

  q.on('failed', (job, err) => {
    console.error('ai-call job failed', { jobId: job?.id, orderId: job?.data?.orderId, err: err?.message });
  });
}

export async function startAiCallForOrderNow({ orderId, operatorId } = {}) {
  const id = parseInt(String(orderId), 10);
  if (!Number.isFinite(id) || id < 1) throw new Error('orderId noto\'g\'ri');

  const vapi = getVapiClient();
  if (!vapi) throw new Error('MYSHOP_VAPI_TOKEN yo\'q');

  const phoneNumberId = readPhoneNumberId();
  if (!phoneNumberId) throw new Error('MYSHOP_VAPI_PHONE_NUMBER_ID yo\'q');

  const { order, items } = await getOrderForAi(id);
  const assistant = buildAssistantForOrder({ order, items });

  const customerNumber = String(order.contact_phone || '').trim();
  if (!customerNumber) throw new Error('Buyurtmada kontakt_phone yo\'q');

  // Customer.externalId lets webhook map events back to order_id.
  const call = await vapi.calls.create({
    phoneNumberId,
    customer: {
      number: customerNumber,
      externalId: String(id),
      name: order.customer_full_name || undefined,
    },
    assistant,
    name: `order_${id}_ai_call`,
  });

  // Optionally store a call-start marker in transcripts table as well.
  // (No plaintext transcript here, but we still create an encrypted record with a minimal marker.)
  const vapiCallId = call?.id || call?.call?.id || null;
  if (vapiCallId) {
    const marker = JSON.stringify({ event: 'call_started', operatorId: operatorId ?? null });
    const enc = encryptText(marker);
    db
      .prepare(
        `INSERT INTO ai_call_transcripts (order_id, vapi_call_id, event_type, ciphertext, iv, auth_tag)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, vapiCallId, 'call_started', enc.ciphertext, enc.iv, enc.auth_tag);
  }

  return { call };
}

export function enqueueAiCallForPendingOrder({ orderId, operatorId } = {}) {
  const q = ensureQueue();
  if (!q) throw new Error('Bull queue yoqilmagan (Redis yo‘q yoki konfiguratsiya noto‘g‘ri).');
  ensureWorker();
  const payload = {
    orderId,
    operatorId: operatorId ?? null,
  };
  return q.add(payload, { attempts: 3, backoff: { type: 'fixed', delay: 5000 } });
}

export function decryptTranscriptRow(row) {
  if (!row?.ciphertext || !row?.iv || !row?.auth_tag) return null;
  return decryptText({ ciphertext: row.ciphertext, iv: row.iv, auth_tag: row.auth_tag });
}

