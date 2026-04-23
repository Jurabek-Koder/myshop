/**
 * MyShop sklad jamoa chati: avtomatik yordamchi (FAQ + ixtiyoriy OpenAI).
 * Muhit: MYSHOP_SKLAD_BOT_OPENAI_KEY — bo‘lmasa faqat FAQ / savol uslubi.
 * O‘chirish: MYSHOP_SKLAD_BOT_DISABLED=1
 */

const BOT_LABEL = String(process.env.MYSHOP_SKLAD_BOT_NAME || 'MyShop bot').trim().slice(0, 200) || 'MyShop bot';
const GAP_MS = Math.max(500, parseInt(String(process.env.MYSHOP_SKLAD_BOT_MIN_GAP_MS || '2000'), 10) || 2000);
const OPENAI_MODEL = String(process.env.MYSHOP_SKLAD_BOT_OPENAI_MODEL || 'gpt-4o-mini').trim();
const ALWAYS_REPLY = ['1', 'true', 'yes'].includes(String(process.env.MYSHOP_SKLAD_BOT_ALWAYS_REPLY || '').toLowerCase());

let lastBotReplyAt = 0;
let botRunLock = false;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldTriggerSkladBot({ chatRoom, messageType, text, clientMessageId, payloadRaw }) {
  if (['1', 'true', 'yes'].includes(String(process.env.MYSHOP_SKLAD_BOT_DISABLED || '').toLowerCase())) {
    return false;
  }
  const cr = String(chatRoom || '').trim();
  if (cr !== 'sklad' && cr !== 'operators') return false;
  const cid = String(clientMessageId || '').trim();
  if (cid.startsWith('bot-')) return false;

  let payload = {};
  if (payloadRaw != null && typeof payloadRaw === 'object') {
    payload = payloadRaw;
  }
  if (payload.fromBot === true || payload.skipBot === true) return false;

  const typ = String(messageType || 'text').toLowerCase();
  if (typ !== 'text' && typ !== '') return false;

  const t = String(text || '').trim();
  if (t.length < 2) return false;
  return true;
}

function looksLikeQuestionOrChat(s) {
  const t = norm(s);
  if (!t) return false;
  if (ALWAYS_REPLY) return true;
  if (/\?\s*$/.test(t)) return true;
  if (/^(qanday|nima|qayerda|necha|nimaga|kim|qachon|почему|как|что|где|what|how|where|why|help|yordam)\b/i.test(t)) {
    return true;
  }
  if (/^(salom|assalom|hello|hi\b|privet|здравствуй)/i.test(t)) return true;
  return false;
}

function faqReply(low) {
  const rules = [
    { re: /(salom|assalom|hayrli|hello|hi\b|privet|здравствуй)/, uz: 'Salom! Men MyShop sklad yordamchisiman. Savolingizni yozing — qisqa javob beraman yoki operatorga yo‘naltiraman.' },
    { re: /(yordam|help|что ты|kim san)/, uz: 'Yordam: «buyurtma», «balans», «sayt», «lavozim» haqida so‘rashingiz mumkin. Murakkab masalalar uchun operator javob beradi.' },
    { re: /(buyurtma|zakaz|order)/, uz: 'Buyurtmalar «Buyurtmalar» bo‘limida. Yangi buyurtmani yig‘ish va tarixni shu yerda ko‘rasiz.' },
    { re: /(balans|pul yech|withdraw|hisob)/, uz: 'Balans va pul yechish «Bosh sahifa»dagi balans kartasida. So‘rov superuserga boradi.' },
    { re: /(sayt|saytda|yangilan|versiya|o'zgar|изменен)/, uz: 'Sayt va admin paneldagi o‘zgariklar haqida e’lonlar shu chat orqali beriladi. Texnik tafsilotlar uchun superuser bilan bog‘laning.' },
    { re: /(profil|login|parol|password)/, uz: 'Profil ma’lumotlari «Profil» bo‘limida tahrirlanadi. Muammo bo‘lsa operatorga yozing.' },
    { re: /(lichka|shaxsiy xabar)/, uz: 'Boshqa xodimlar bilan yozishmalar «Lichka» bo‘limida — ro‘yxatdan tanlang.' },
    { re: /(print|chek|pechat)/, uz: 'Mahsulot cheki «Print» yorlig‘ida qidiruv orqali chiqariladi.' },
    { re: /(rahmat|thanks|спасибо)/, uz: 'Marhamat! Yana savol bo‘lsa yozing.' },
  ];
  for (const { re, uz } of rules) {
    if (re.test(low)) return uz;
  }
  return null;
}

function defaultFallback() {
  return 'Savolingiz qabul qilindi. Operator tez orada javob beradi. Tezkor ma’lumot uchun «yordam» deb yozing.';
}

async function openaiReply(userText) {
  const key = String(process.env.MYSHOP_SKLAD_BOT_OPENAI_KEY || '').trim();
  if (!key) return null;

  const system = `Sen MyShop sklad ichki chatidagi avtomatik yordamchisan. 
Javoblar qisqa (maksimum 4-5 gap), o‘zbek yoki foydalanuvchi tilida.
Faqat sklad, buyurtma, profil, sayt, jamoa chat haqida yordam ber.
Noma’lum yoki nozik masalalarda: operatorga murojaat qilishni taklif qil.
Hech qachon parol yoki maxfiy ma’lumot so‘rama.`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 400,
        temperature: 0.35,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText.slice(0, 2500) },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('sklad bot OpenAI HTTP', res.status, err.slice(0, 200));
      return null;
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    return typeof out === 'string' ? out.trim() : null;
  } catch (e) {
    clearTimeout(t);
    console.warn('sklad bot OpenAI', e.message || e);
    return null;
  }
}

export async function generateSkladBotReply(userText) {
  const low = norm(userText);
  const faq = faqReply(low);
  if (faq) return faq;

  const ai = await openaiReply(userText);
  if (ai) return ai;

  if (looksLikeQuestionOrChat(userText)) return defaultFallback();
  return null;
}

function insertBotMessage(dbConn, text, chatRoom = 'sklad') {
  const room = String(chatRoom || 'sklad').trim();
  const safeRoom = room === 'operators' ? 'operators' : 'sklad';
  const cid = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const trimmed = String(text).trim().slice(0, 4000);
  if (!trimmed) return;
  const payload = JSON.stringify({
    fromBot: true,
    type: 'text',
    text: trimmed,
    senderNick: BOT_LABEL,
  });
  dbConn
    .prepare(
      `INSERT INTO staff_chat_archive (client_message_id, chat_room, sender_user_id, sender_label, is_from_staff, message_type, body, payload_json)
       VALUES (?, ?, NULL, ?, 0, 'text', ?, ?)`
    )
    .run(cid, safeRoom, BOT_LABEL, trimmed, payload);
}

/**
 * Inson xabari muvaffaqiyatli yozilgandan keyin chaqiring (async, javobni kutmaydi).
 */
export function scheduleSkladBotAfterHumanMessage(dbConn, opts) {
  if (!shouldTriggerSkladBot(opts)) return;
  const userText = String(opts.text || '').trim();
  if (!userText) return;

  setImmediate(() => {
    void (async () => {
      if (botRunLock) return;
      const now = Date.now();
      if (now - lastBotReplyAt < GAP_MS) return;
      botRunLock = true;
      try {
        const reply = await generateSkladBotReply(userText);
        if (!reply) return;
        lastBotReplyAt = Date.now();
        insertBotMessage(dbConn, reply, opts.chatRoom);
      } catch (e) {
        console.warn('sklad bot run', e);
      } finally {
        botRunLock = false;
      }
    })();
  });
}

export { BOT_LABEL };
