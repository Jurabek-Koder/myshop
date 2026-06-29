import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { db } from '../../db/database.js';
import { handleValidation } from '../../middleware/validate.js';
import { insertFinanceLog } from '../../services/financeLogService.js';

const router = Router();
const INCOME_CATEGORIES = new Set(['savdo', 'xizmat', 'qaytarilgan', 'boshqa']);

router.get('/', (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `SELECT id, title, amount, category, income_date, comment, created_at
               FROM accounting_income WHERE deleted_at IS NULL`;
    const params = [];
    if (from) {
      sql += ` AND date(income_date) >= date(?)`;
      params.push(String(from));
    }
    if (to) {
      sql += ` AND date(income_date) <= date(?)`;
      params.push(String(to));
    }
    sql += ` ORDER BY date(income_date) DESC, id DESC LIMIT 500`;
    res.json({ income: db.prepare(sql).all(...params) });
  } catch (e) {
    console.error('accounting income list', e);
    res.status(500).json({ error: 'Daromadlar yuklanmadi.' });
  }
});

router.post(
  '/',
  [
    body('title').trim().notEmpty().isLength({ max: 500 }),
    body('amount').isFloat({ gt: 0 }),
    body('category').optional().trim().isIn([...INCOME_CATEGORIES]),
    body('income_date').trim().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('comment').optional().trim().isLength({ max: 2000 }),
    handleValidation,
  ],
  (req, res) => {
    const title = String(req.body.title).trim();
    const amount = Number(req.body.amount);
    const category = INCOME_CATEGORIES.has(String(req.body.category || '').trim().toLowerCase())
      ? String(req.body.category).trim().toLowerCase()
      : 'boshqa';
    const incomeDate = String(req.body.income_date).trim();
    const comment = req.body.comment != null ? String(req.body.comment).trim() || null : null;
    try {
      const r = db
        .prepare(
          `INSERT INTO accounting_income (title, amount, category, income_date, comment, created_by)
           VALUES (?,?,?,?,?,?)`,
        )
        .run(title, amount, category, incomeDate, comment, req.user.id);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'create',
        entityType: 'accounting_income',
        entityId: r.lastInsertRowid,
        payload: { title, amount, category, income_date: incomeDate },
      });
      res.status(201).json({ ok: true, id: r.lastInsertRowid });
    } catch (e) {
      console.error('accounting income create', e);
      res.status(500).json({ error: 'Saqlanmadi.' });
    }
  },
);

router.delete('/:id', [param('id').isInt({ min: 1 }), handleValidation], (req, res) => {
  const id = Number(req.params.id);
  try {
    const row = db.prepare(`SELECT * FROM accounting_income WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    db.prepare(`UPDATE accounting_income SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    insertFinanceLog(db, {
      actorUserId: req.user.id,
      action: 'delete',
      entityType: 'accounting_income',
      entityId: id,
      payload: { was: row },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('accounting income delete', e);
    res.status(500).json({ error: 'O‘chirilmadi.' });
  }
});

export default router;
