import { Router } from 'express';
import { query } from 'express-validator';
import { db } from '../../db/database.js';
import { handleValidation } from '../../middleware/validate.js';

const router = Router();

/** Buxgalter — superuser hisobot va tasdiqlash faoliyatini kuzatadi */
router.get('/logs', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '80'), 10) || 80));
    const rows = db
      .prepare(
        `SELECT f.id, f.actor_user_id, f.action, f.entity_type, f.entity_id, f.payload_json, f.created_at,
                u.login AS actor_login, u.full_name AS actor_name, COALESCE(u.role, 'superuser') AS actor_role
         FROM finance_logs f
         JOIN users u ON u.id = f.actor_user_id
         WHERE lower(trim(COALESCE(u.role, ''))) = 'superuser' OR u.role_id = 1
         ORDER BY datetime(f.created_at) DESC, f.id DESC
         LIMIT ?`,
      )
      .all(limit);
    res.json({ logs: rows });
  } catch (e) {
    console.error('accounting superuser audit logs', e);
    res.status(500).json({ error: 'Jurnal yuklanmadi.' });
  }
});

router.get('/advance-approvals', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '40'), 10) || 40));
    const rows = db
      .prepare(
        `SELECT r.id, r.cycle_year, r.cycle_month, r.status, r.total_amount_uzs, r.item_count,
                r.superuser_approved_at, r.superuser_approved_by,
                u.login AS approver_login, u.full_name AS approver_name
         FROM payroll_advance_runs r
         LEFT JOIN users u ON u.id = r.superuser_approved_by
         WHERE r.superuser_approved_at IS NOT NULL
         ORDER BY datetime(r.superuser_approved_at) DESC, r.id DESC
         LIMIT ?`,
      )
      .all(limit);
    res.json({ approvals: rows });
  } catch (e) {
    console.error('accounting superuser advance approvals', e);
    res.status(500).json({ error: 'Avans tasdiqlari yuklanmadi.' });
  }
});

router.get(
  '/reports',
  [query('limit').optional().isInt({ min: 1, max: 100 }), handleValidation],
  (_req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(_req.query.limit || '40'), 10) || 40));
      const rows = db
        .prepare(
          `SELECT fr.id, fr.report_type, fr.title, fr.period_start, fr.period_end, fr.created_at,
                  u.login AS creator_login, u.full_name AS creator_name, COALESCE(u.role, '') AS creator_role
           FROM financial_reports fr
           LEFT JOIN users u ON u.id = fr.created_by
           WHERE lower(trim(COALESCE(u.role, ''))) = 'superuser' OR u.role_id = 1
           ORDER BY datetime(fr.created_at) DESC, fr.id DESC
           LIMIT ?`,
        )
        .all(limit);
      res.json({ reports: rows });
    } catch (e) {
      console.error('accounting superuser reports', e);
      res.status(500).json({ error: 'Hisobotlar yuklanmadi.' });
    }
  },
);

export default router;
