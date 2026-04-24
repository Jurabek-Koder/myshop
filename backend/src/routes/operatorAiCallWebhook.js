import { Router } from 'express';
import { strictAppSecretRequired } from '../middleware/appSecret.js';
import { handleAiCallWebhook } from '../modules/operator/call-operator.controller.js';

const router = Router();

// Vapi server webhooks (JWT shart emas) — faqat X-App-Secret-Key orqali himoyalanadi.
router.post('/ai-call/webhook', strictAppSecretRequired, handleAiCallWebhook);

export default router;

