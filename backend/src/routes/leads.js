import { Router } from 'express';
import { db } from '../db/database.js';
import rateLimit from 'express-rate-limit';
import { security } from '../config/security.js';
import { insertProjectAuditEntry } from '../lib/projectAuditLog.js';
import { EVENT_TYPES } from '../events/eventTypes.js';
import { publishEnterpriseEvent } from '../events/publishEvent.js';

const router = Router();
const createLimiter = rateLimit({
  ...security.strictRateLimit,
  keyGenerator: (req) => req.ip || 'unknown',
});

router.post('/', createLimiter, (req, res) => {
  const product_id = parseInt(req.body?.product_id, 10);
  const contact_phone = String(req.body?.contact_phone || '').trim() || null;
  const contact_email = String(req.body?.contact_email || '').trim() || null;
  const full_name = String(req.body?.full_name || '').trim() || null;

  if (!product_id || product_id < 1) return res.status(400).json({ error: 'Mahsulot ID kerak.' });
  if (!contact_phone && !contact_email) return res.status(400).json({ error: 'Telefon yoki elektron pochta kiriting.' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi.' });

  const result = db.prepare(`
    INSERT INTO product_leads (product_id, contact_phone, contact_email, full_name, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(product_id, contact_phone, contact_email, full_name);

  const lead = db.prepare('SELECT * FROM product_leads WHERE id = ?').get(result.lastInsertRowid);
  publishEnterpriseEvent({
    eventType: EVENT_TYPES.LEAD_CREATED,
    module: 'crm',
    entityType: 'lead',
    entityId: lead?.id,
    ipAddress: req.ip,
    newValue: lead,
    metadata: { source: 'public_lead' },
  });
  try {
    insertProjectAuditEntry({
      source: 'public_lead',
      actorUserId: null,
      actorLabel: 'guest',
      actorRole: '',
      method: 'POST',
      path: '/api/leads',
      statusCode: 201,
      summaryOriginal: `LEAD id=${lead.id} product_id=${product_id}`,
      payloadOriginal: {
        product_id,
        phone_tail: contact_phone ? String(contact_phone).slice(-4) : null,
        has_email: Boolean(contact_email),
      },
    });
  } catch (e) {
    console.warn('[leads] audit', e);
  }
  res.status(201).json({ lead, message: 'So\'rovingiz qabul qilindi. Operator tez orada siz bilan bog\'lanadi.' });
});

export default router;
