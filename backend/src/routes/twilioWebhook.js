import { Router } from 'express';
import { db } from '../db/database.js';
import {
  readTwilioStoredObject,
  validateTwilioWebhookRequest,
} from '../lib/twilioIntegration.js';
import { insertProjectAuditEntry } from '../lib/projectAuditLog.js';

const router = Router();

/**
 * Twilio Programmable SMS — kiruvchi xabarlar.
 * Twilio Console → Phone Numbers → Messaging webhook: POST https://<API>/api/webhooks/twilio/sms
 */
router.post('/sms', (req, res) => {
  try {
    const stored = readTwilioStoredObject();
    if (!validateTwilioWebhookRequest(req, stored)) {
      return res.status(403).type('text/plain').send('Forbidden');
    }

    const sid = String(req.body?.MessageSid || '').trim() || null;
    const from = String(req.body?.From || '').trim() || null;
    const to = String(req.body?.To || '').trim() || null;
    const text = String(req.body?.Body || '').trim() || '';

    if (!from && !to) {
      return res.status(400).type('text/plain').send('Missing From/To');
    }

    const runResult = db
      .prepare(
        `INSERT OR IGNORE INTO twilio_sms_messages (direction, from_phone, to_phone, body, twilio_message_sid, status)
       VALUES ('inbound', ?, ?, ?, ?, ?)`,
      )
      .run(from, to, text || '(bo‘sh)', sid, String(req.body?.SmsStatus || 'received').trim() || 'received');

    if (runResult.changes > 0) {
      try {
        insertProjectAuditEntry({
          source: 'twilio_webhook',
          actorUserId: null,
          actorLabel: 'Twilio',
          actorRole: 'system',
          method: 'POST',
          path: '/api/webhooks/twilio/sms',
          statusCode: 200,
          summaryOriginal: `SMS inbound sid=${sid || '—'} from=${from || '—'}`,
          payloadOriginal: { preview: (text || '').slice(0, 400) },
        });
      } catch (e) {
        console.warn('[twilio] audit', e);
      }
    }

    res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (e) {
    console.error('Twilio SMS webhook', e);
    res.status(500).type('text/plain').send('Error');
  }
});

export default router;
