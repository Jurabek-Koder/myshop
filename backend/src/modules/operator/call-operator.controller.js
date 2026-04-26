import { db } from '../../db/database.js';
import { decryptTranscriptRow, encryptTranscriptText } from './call-operator.service.js';
import { isTestSamplesEnabled, testWavForSampleId } from './ai-recording-samples.js';
import { SEED_CONVERSATION_VAPI_ID, SEED_DIALOGUE_LINES } from './operator-seed-dialogue.js';

function getOpenAiKeyForTestDialogTts() {
  return (
    String(process.env.MYSHOP_TEST_DIALOG_OPENAI_KEY || '').trim() ||
    String(process.env.MYSHOP_SKLAD_BOT_OPENAI_KEY || '').trim() ||
    String(process.env.OPENAI_API_KEY || '').trim()
  );
}

function parseRecordingPayloadFromDecryptedText(text) {
  if (!text || !String(text).trim().startsWith('{')) return { recordingUrl: null, recordingInternalSample: null };
  try {
    const j = JSON.parse(text);
    if (!j || j.kind !== 'recording') return { recordingUrl: null, recordingInternalSample: null };
    let recordingUrl = typeof j.recordingUrl === 'string' ? String(j.recordingUrl).trim() || null : null;
    if (recordingUrl && !/^https:\/\//i.test(recordingUrl)) recordingUrl = null;
    const rawSample = j.internalSample;
    const recordingInternalSample =
      Number.isFinite(Number(rawSample)) && Number(rawSample) >= 1 && Number(rawSample) <= 2
        ? Number(rawSample)
        : null;
    return { recordingUrl, recordingInternalSample };
  } catch {
    return { recordingUrl: null, recordingInternalSample: null };
  }
}

function parseOrderIdFromExternalId(externalId) {
  const raw = String(externalId || '');
  const m = raw.match(/(\d+)/);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return Number.isFinite(id) && id >= 1 ? id : null;
}

function parseOrderIdFromCallName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  // name: order_123_ai_call
  const m = raw.match(/\border_(\d+)\b/i);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return Number.isFinite(id) && id >= 1 ? id : null;
}

function findOrderIdByVapiCallId(vapiCallId) {
  const id = String(vapiCallId || '').trim();
  if (!id) return null;
  const row = db.prepare(
    `SELECT order_id FROM ai_call_transcripts WHERE vapi_call_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(id);
  const oid = row?.order_id;
  return Number.isFinite(oid) && oid >= 1 ? oid : null;
}

function normalizeEventType(body) {
  // Vapi sends transcript messages as "transcript" type plus role/transcriptType.
  const type = String(body?.type || body?.message?.type || body?.event?.type || '').trim();
  const role = String(body?.role || body?.message?.role || body?.data?.role || '').trim();
  const transcriptType = String(body?.transcriptType || body?.message?.transcriptType || body?.data?.transcriptType || '').trim();

  const base = type || 'event';
  if (role || transcriptType) return `${base}:${role || 'unknown'}:${transcriptType || 'unknown'}`;
  return base;
}

function extractTranscriptText(body) {
  // Most likely: body.transcript
  const t = body?.transcript ?? body?.message?.transcript ?? body?.data?.transcript;
  const transcript = typeof t === 'string' ? t : t == null ? '' : String(t);
  return transcript.trim();
}

function extractMessagesSnapshot(body) {
  const m = body?.message ?? body?.data ?? body;
  const msgs =
    m?.messagesOpenAIFormatted ??
    m?.artifact?.messagesOpenAIFormatted ??
    body?.messagesOpenAIFormatted ??
    body?.artifact?.messagesOpenAIFormatted;
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  return msgs.slice(-120);
}

function extractRecordingUrl(body) {
  const b = body ?? {};
  const call = b?.call ?? b?.message?.call ?? b?.data?.call ?? {};
  const url =
    call?.recordingUrl ??
    call?.recording_url ??
    call?.recording?.url ??
    call?.artifact?.recordingUrl ??
    b?.recordingUrl ??
    b?.recording_url ??
    b?.artifact?.recordingUrl ??
    b?.artifact?.recording_url ??
    null;
  const out = String(url || '').trim();
  if (!out) return null;
  if (!/^https:\/\//i.test(out)) return null;
  return out;
}

const MAX_WEBHOOK_JSON_CHARS = 48000;

/**
 * Har bir webhook hodisasini DB'ga yozish: avvalo matn transcript, bo‘lmasa suhbat xabarlari yoki hodisa JSON.
 */
function buildEncryptedPayloadPlainText(body) {
  const line = extractTranscriptText(body);
  if (line) return line;

  const snapshot = extractMessagesSnapshot(body);
  if (snapshot) {
    return JSON.stringify({ v: 1, kind: 'messages', items: snapshot });
  }

  try {
    const raw = JSON.stringify(body ?? {});
    if (raw.length <= MAX_WEBHOOK_JSON_CHARS) return raw;
    return `${raw.slice(0, MAX_WEBHOOK_JSON_CHARS)}\n…[truncated ${raw.length - MAX_WEBHOOK_JSON_CHARS} chars]`;
  } catch {
    return JSON.stringify({ v: 1, kind: 'event', eventType: normalizeEventType(body) });
  }
}

export async function handleAiCallWebhook(req, res) {
  try {
    const body = req.body || {};
    // Vapi server messages include customer & call
    const externalId = body?.customer?.externalId ?? body?.message?.customer?.externalId ?? body?.data?.customer?.externalId;
    const vapiCallId =
      body?.call?.id ??
      body?.message?.call?.id ??
      body?.call_id ??
      body?.data?.call?.id ??
      null;

    const callName =
      body?.call?.name ??
      body?.message?.call?.name ??
      body?.data?.call?.name ??
      body?.callName ??
      null;

    let orderId =
      parseOrderIdFromExternalId(externalId) ||
      parseOrderIdFromCallName(callName) ||
      findOrderIdByVapiCallId(vapiCallId);

    if (!orderId && !vapiCallId) return res.status(400).json({ error: 'order_id yoki call id topilmadi' });

    const transcript = extractTranscriptText(body);
    const recordingUrl = extractRecordingUrl(body);

    const ins = db.prepare(
      `INSERT INTO ai_call_transcripts (order_id, vapi_call_id, event_type, ciphertext, iv, auth_tag)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    // 1) Transcript event (if present)
    if (transcript) {
      const eventType = normalizeEventType(body);
      const enc = encryptTranscriptText(transcript);
      ins.run(orderId ?? null, vapiCallId, eventType, enc.ciphertext, enc.iv, enc.auth_tag);
    }

    // 2) Recording URL event (if present)
    if (recordingUrl) {
      const payload = JSON.stringify({ v: 1, kind: 'recording', recordingUrl });
      const enc = encryptTranscriptText(payload);
      ins.run(orderId ?? null, vapiCallId, 'recording', enc.ciphertext, enc.iv, enc.auth_tag);
    }

    // 3) Fallback: store messages snapshot / full JSON when transcript is empty and no recording url
    if (!transcript && !recordingUrl) {
      const eventType = normalizeEventType(body);
      const plain = buildEncryptedPayloadPlainText(body);
      if (!plain || !String(plain).trim()) return res.status(200).json({ ok: true, skipped: true });
      const enc = encryptTranscriptText(plain);
      ins.run(orderId ?? null, vapiCallId, eventType, enc.ciphertext, enc.iv, enc.auth_tag);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('AI call webhook error', e);
    return res.status(500).json({ error: 'Webhookni qayta ishlashda xatolik.' });
  }
}

export async function handleAiCallsList(req, res) {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? '200'), 10) || 200));
  const sinceOrderId = req.query.since_order_id ? parseInt(String(req.query.since_order_id), 10) : null;
  const transcriptDetail = String(req.query.transcript_detail || '') === '1';
  const maxFullChars = 12000;

  let sql = `
    SELECT
      t.id,
      t.order_id,
      t.vapi_call_id,
      t.event_type,
      t.ciphertext,
      t.iv,
      t.auth_tag,
      t.created_at,
      o.shipping_address,
      u.full_name AS customer_full_name
    FROM ai_call_transcripts t
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN users u ON u.id = o.user_id
  `;

  const params = [];
  if (sinceOrderId && Number.isFinite(sinceOrderId)) {
    sql += ' WHERE t.order_id >= ?';
    params.push(sinceOrderId);
  } else {
    sql += ' WHERE 1=1';
  }

  sql += ' ORDER BY t.id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  const out = rows.map((r) => {
    const text = decryptTranscriptRow(r);
    const { recordingUrl, recordingInternalSample } = parseRecordingPayloadFromDecryptedText(text);
    const base = {
      id: r.id,
      orderId: r.order_id,
      vapiCallId: r.vapi_call_id,
      eventType: r.event_type,
      createdAt: r.created_at,
      transcriptPreview: text ? text.slice(0, 220) : null,
      recordingUrl,
      recordingInternalSample,
    };
    if (transcriptDetail && text) {
      base.transcriptText = text.length > maxFullChars ? `${text.slice(0, maxFullChars)}…` : text;
    }
    return base;
  });

  return res.json({ calls: out });
}

/** Kutilayotgan zakazlar — telefon raqami bor; AI qo‘ng‘iroq boshlash uchun. */
export function handleAiPendingOrdersForAiCall(req, res) {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10) || 100));
  const rows = db
    .prepare(
      `
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at,
           u.full_name AS customer_full_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE lower(trim(o.status)) = 'pending'
      AND o.contact_phone IS NOT NULL AND trim(o.contact_phone) != ''
    ORDER BY o.id DESC
    LIMIT ?
  `,
    )
    .all(limit);
  return res.json({ orders: rows });
}

/**
 * Mijozlar bilan bo‘lgan suhbatlar feed'i (superuser ko‘radi):
 * - AI call webhook yozuvlari (shifrlangan; preview decrypt qilinadi)
 * - Kuryer call loglari (mijozga qo‘ng‘iroq izohi)
 * - Lead notes (operator eslatmasi)
 * - staff_chat_archive chat_room='customer' (agar ishlatilsa)
 */
export function handleCustomerConversationsFeed(req, res) {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? '200'), 10) || 200));
  const orderId = req.query.order_id ? parseInt(String(req.query.order_id), 10) : null;
  const phone = String(req.query.phone || '').trim();

  const events = [];

  // 1) AI call transcripts/events
  {
    const params = [];
    let where = ' WHERE 1=1';
    if (orderId && Number.isFinite(orderId)) {
      where += ' AND t.order_id = ?';
      params.push(orderId);
    }
    if (phone) {
      where += ' AND o.contact_phone LIKE ?';
      params.push(`%${phone}%`);
    }
    const rows = db
      .prepare(
        `
        SELECT t.id, t.order_id, t.vapi_call_id, t.event_type, t.ciphertext, t.iv, t.auth_tag, t.created_at,
               o.contact_phone, u.full_name AS customer_full_name
        FROM ai_call_transcripts t
        LEFT JOIN orders o ON o.id = t.order_id
        LEFT JOIN users u ON u.id = o.user_id
        ${where}
        ORDER BY t.id DESC
        LIMIT ?
      `,
      )
      .all(...params, Math.min(limit, 200));

    for (const r of rows) {
      const text = decryptTranscriptRow(r);
      const { recordingUrl, recordingInternalSample } = parseRecordingPayloadFromDecryptedText(text);
      let preview = text ? String(text).slice(0, 260) : null;
      if (recordingInternalSample === 1) preview = '[Test audio: 440 Hz — namuna]';
      else if (recordingInternalSample === 2) preview = '[Test audio: 880 Hz — namuna]';
      else if (recordingUrl) preview = '[Qo‘ng‘iroq audio yozuvi — player bilan eshiting]';

      events.push({
        source: 'ai_call',
        source_id: r.id,
        order_id: r.order_id ?? null,
        phone: r.contact_phone ?? null,
        customer_full_name: r.customer_full_name ?? null,
        event_type: r.event_type ?? null,
        created_at: r.created_at,
        preview,
        recording_url: recordingUrl,
        recording_internal_sample: recordingInternalSample,
      });
    }
  }

  // 2) Courier call logs (customer)
  {
    const params = [];
    let where = " WHERE lower(trim(l.channel)) = 'customer'";
    if (orderId && Number.isFinite(orderId)) {
      where += ' AND l.order_id = ?';
      params.push(orderId);
    }
    if (phone) {
      where += ' AND o.contact_phone LIKE ?';
      params.push(`%${phone}%`);
    }
    const rows = db
      .prepare(
        `
        SELECT l.id, l.order_id, l.note, l.created_at,
               o.contact_phone, u.full_name AS customer_full_name
        FROM courier_call_logs l
        JOIN orders o ON o.id = l.order_id
        LEFT JOIN users u ON u.id = o.user_id
        ${where}
        ORDER BY l.id DESC
        LIMIT ?
      `,
      )
      .all(...params, Math.min(limit, 200));

    for (const r of rows) {
      events.push({
        source: 'courier_call_log',
        source_id: r.id,
        order_id: r.order_id,
        phone: r.contact_phone ?? null,
        customer_full_name: r.customer_full_name ?? null,
        event_type: 'courier_call',
        created_at: r.created_at,
        preview: r.note ? String(r.note).slice(0, 260) : null,
      });
    }
  }

  // 3) Product leads (notes)
  {
    const params = [];
    let where = ' WHERE 1=1';
    if (orderId && Number.isFinite(orderId)) {
      where += ' AND l.order_id = ?';
      params.push(orderId);
    }
    if (phone) {
      where += ' AND l.contact_phone LIKE ?';
      params.push(`%${phone}%`);
    }
    const rows = db
      .prepare(
        `
        SELECT l.id, l.order_id, l.contact_phone, l.full_name, l.notes, l.created_at
        FROM product_leads l
        ${where}
          AND l.notes IS NOT NULL AND trim(l.notes) != ''
        ORDER BY l.id DESC
        LIMIT ?
      `,
      )
      .all(...params, Math.min(limit, 200));

    for (const r of rows) {
      events.push({
        source: 'lead_note',
        source_id: r.id,
        order_id: r.order_id ?? null,
        phone: r.contact_phone ?? null,
        customer_full_name: r.full_name ?? null,
        event_type: 'lead_note',
        created_at: r.created_at,
        preview: r.notes ? String(r.notes).slice(0, 260) : null,
      });
    }
  }

  // 4) Staff chat archive (customer room)
  {
    const params = [];
    let where = " WHERE a.chat_room = 'customer'";
    if (phone) {
      where += ' AND a.body LIKE ?';
      params.push(`%${phone}%`);
    }
    const rows = db
      .prepare(
        `
        SELECT a.id, a.sender_user_id, a.sender_label, a.is_from_staff, a.message_type, a.body, a.created_at
        FROM staff_chat_archive a
        ${where}
        ORDER BY a.id DESC
        LIMIT ?
      `,
      )
      .all(...params, Math.min(limit, 120));

    for (const r of rows) {
      events.push({
        source: 'staff_chat_customer',
        source_id: r.id,
        order_id: null,
        phone: null,
        customer_full_name: null,
        event_type: `${r.is_from_staff ? 'staff' : 'customer'}:${r.message_type || 'text'}`,
        created_at: r.created_at,
        preview: r.body ? String(r.body).slice(0, 260) : null,
      });
    }
  }

  events.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || (b.source_id - a.source_id));
  return res.json({ events: events.slice(0, limit) });
}

/** GET — brauzer <audio> uchun ichki test WAV (faqat 1 yoki 2). */
export function handleAiSampleRecording(req, res) {
  const id = parseInt(String(req.params.id ?? ''), 10);
  const buf = testWavForSampleId(id);
  if (!buf) return res.status(404).json({ error: 'Namuna topilmadi (faqat 1 yoki 2).' });
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(buf);
}

export function handleAiTestSamplesFlag(req, res) {
  return res.json({ enabled: isTestSamplesEnabled() });
}

/**
 * POST — 2 ta test «qo‘ng‘iroq yozuvi» qatorini DB ga yozadi (shifrlangan).
 * Faqat MYSHOP_AI_TEST_SAMPLES=1 bo‘lsa (prod’da tasodifiy chiqmasin).
 */
export function handleSeedTestAiRecordings(req, res) {
  if (!isTestSamplesEnabled()) {
    return res.status(403).json({
      error:
        'Test namunalari o‘chirilgan. `.env` da MYSHOP_AI_TEST_SAMPLES=1 qo‘yib backendni qayta ishga tushiring.',
    });
  }
  try {
    encryptTranscriptText('ping');
  } catch {
    return res.status(500).json({ error: 'MYSHOP_AI_TRANSCRIPTS_AES_KEY sozilmagan.' });
  }

  const samples = [
    { vapi_call_id: 'myshop-test-audio-1', internalSample: 1, label: 'Test: 440 Hz (1.2 s)' },
    { vapi_call_id: 'myshop-test-audio-2', internalSample: 2, label: 'Test: 880 Hz (1.2 s)' },
  ];

  const tx = db.transaction(() => {
    const del = db.prepare('DELETE FROM ai_call_transcripts WHERE vapi_call_id = ?');
    const ins = db.prepare(
      `INSERT INTO ai_call_transcripts (order_id, vapi_call_id, event_type, ciphertext, iv, auth_tag)
       VALUES (NULL, ?, 'recording', ?, ?, ?)`,
    );
    for (const s of samples) {
      del.run(s.vapi_call_id);
      const payload = JSON.stringify({
        v: 1,
        kind: 'recording',
        internalSample: s.internalSample,
        label: s.label,
      });
      const enc = encryptTranscriptText(payload);
      ins.run(s.vapi_call_id, enc.ciphertext, enc.iv, enc.auth_tag);
    }
  });
  tx();

  return res.json({ ok: true, inserted: samples.length, vapi_call_ids: samples.map((s) => s.vapi_call_id) });
}

/**
 * POST — AI operator va mijoz o‘rtasidagi namuna suhbat (matn, har xil webhook qatorlari kabi).
 * MYSHOP_AI_TEST_SAMPLES=1 bo‘lganda ishlaydi.
 */
export function handleSeedTestAiConversation(req, res) {
  if (!isTestSamplesEnabled()) {
    return res.status(403).json({
      error:
        'Test o‘chirilgan. `.env` da MYSHOP_AI_TEST_SAMPLES=1 qo‘yib backendni qayta ishga tushiring.',
    });
  }
  try {
    encryptTranscriptText('ping');
  } catch {
    return res.status(500).json({ error: 'MYSHOP_AI_TRANSCRIPTS_AES_KEY sozilmagan.' });
  }

  let orderId = req.body?.order_id != null ? parseInt(String(req.body.order_id), 10) : null;
  if (!Number.isFinite(orderId) || orderId < 1) orderId = null;
  if (orderId) {
    const exists = db.prepare('SELECT 1 AS x FROM orders WHERE id = ?').get(orderId);
    if (!exists) orderId = null;
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ai_call_transcripts WHERE vapi_call_id = ?').run(SEED_CONVERSATION_VAPI_ID);
    const ins = db.prepare(
      `INSERT INTO ai_call_transcripts (order_id, vapi_call_id, event_type, ciphertext, iv, auth_tag)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const line of SEED_DIALOGUE_LINES) {
      const enc = encryptTranscriptText(line.text);
      ins.run(orderId, SEED_CONVERSATION_VAPI_ID, line.event_type, enc.ciphertext, enc.iv, enc.auth_tag);
    }
  });
  tx();

  return res.json({
    ok: true,
    inserted: SEED_DIALOGUE_LINES.length,
    vapi_call_id: SEED_CONVERSATION_VAPI_ID,
    order_id: orderId,
  });
}

/**
 * POST — TEST: har bir gap uchun OpenAI TTS (mp3) — admin panelda standart <audio controls>.
 */
export async function handleTestDialogAudioClips(req, res) {
  if (!isTestSamplesEnabled()) {
    return res.status(403).json({ error: 'MYSHOP_AI_TEST_SAMPLES=1 kerak.' });
  }
  const key = getOpenAiKeyForTestDialogTts();
  if (!key) {
    return res.status(503).json({
      error:
        'OpenAI kaliti topilmadi. MYSHOP_TEST_DIALOG_OPENAI_KEY yoki MYSHOP_SKLAD_BOT_OPENAI_KEY qo‘ying.',
    });
  }

  const model = String(process.env.MYSHOP_TEST_DIALOG_TTS_MODEL || 'gpt-4o-mini-tts').trim();
  const voiceMijoz = String(process.env.MYSHOP_TEST_DIALOG_VOICE_MIJOZ || 'marin').trim();
  const voiceOp = String(process.env.MYSHOP_TEST_DIALOG_VOICE_OPERATOR || 'sage').trim();
  const speed = Math.min(
    1.25,
    Math.max(0.25, parseFloat(String(process.env.MYSHOP_TEST_DIALOG_TTS_SPEED || '0.94')) || 0.94),
  );

  const instructMijoz =
    String(process.env.MYSHOP_TEST_DIALOG_INSTRUCT_MIJOZ || '').trim() ||
    'Clear Uzbek phone conversation. Natural native speaker, steady pace, no American or British accent. Articulate clearly.';
  const instructOp =
    String(process.env.MYSHOP_TEST_DIALOG_INSTRUCT_OPERATOR || '').trim() ||
    'Professional Uzbek call center agent. Very clear, warm, neutral local pronunciation — not robotic, no strong foreign accent. Phone line quality.';

  const clips = [];

  try {
    for (let i = 0; i < SEED_DIALOGUE_LINES.length; i++) {
      const line = SEED_DIALOGUE_LINES[i];
      const isUser = String(line.event_type || '').toLowerCase().includes('user');
      const voice = isUser ? voiceMijoz : voiceOp;
      const instructions = isUser ? instructMijoz : instructOp;

      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          voice,
          input: line.text,
          instructions,
          response_format: 'mp3',
          speed,
        }),
      });

      if (!r.ok) {
        const detail = await r.text();
        return res.status(502).json({
          error: `OpenAI audio xato (${r.status}).`,
          detail: detail.slice(0, 400),
        });
      }

      const buf = Buffer.from(await r.arrayBuffer());
      clips.push({
        index: i,
        role: isUser ? 'mijoz' : 'operator',
        text: line.text,
        format: 'mp3',
        data: buf.toString('base64'),
      });
    }
  } catch (e) {
    console.error('test dialog clips', e);
    return res.status(500).json({ error: e.message || 'TTS xatolik' });
  }

  return res.json({ clips });
}

