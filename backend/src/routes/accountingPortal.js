import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { applyWithdrawalMarkPaid, applyWithdrawalReview } from '../lib/withdrawalRequestActions.js';

const router = Router();
router.use(authRequired, requireRole('accounting'));

router.get('/notifications', (req, res) => {
  const list = db
    .prepare(
      `
    SELECT id, title, body, created_at, read_at, link_type, link_id
    FROM user_notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `,
    )
    .all(req.user.id);
  res.json({ notifications: list });
});

router.patch('/notifications/:id/read', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);
  res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim();
  const result = applyWithdrawalReview({
    reviewerUserId: req.user.id,
    withdrawalId: id,
    status,
    note,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id/mark-paid', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = applyWithdrawalMarkPaid({ payerUserId: req.user.id, withdrawalId: id });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
