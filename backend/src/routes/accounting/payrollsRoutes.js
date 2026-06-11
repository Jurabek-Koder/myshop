import { Router } from 'express';
import { db } from '../../db/database.js';
import { insertFinanceLog } from '../../services/financeLogService.js';
import {
  payrollCreateBody,
  payrollIdParam,
  payrollListQuery,
  payrollPatchBody,
} from '../../middleware/accountingValidators.js';

const router = Router();
const ALLOW_STATUS = new Set(['draft', 'approved', 'paid']);

function periodOrderOk(start, end) {
  return String(start) <= String(end);
}

router.get('/payrolls', payrollListQuery, (req, res) => {
  try {
    let sql = `SELECT id, employee_name, role_label, amount, period_start, period_end, status, comment,
                      created_at, created_by, updated_at, paid_at, paid_by
               FROM payrolls WHERE deleted_at IS NULL`;
    const params = [];
    if (req.query.from) {
      sql += ` AND date(period_end) >= date(?)`;
      params.push(String(req.query.from));
    }
    if (req.query.to) {
      sql += ` AND date(period_start) <= date(?)`;
      params.push(String(req.query.to));
    }
    if (req.query.status && ALLOW_STATUS.has(String(req.query.status))) {
      sql += ` AND status = ?`;
      params.push(String(req.query.status));
    }
    sql += ` ORDER BY datetime(created_at) DESC, id DESC LIMIT 500`;
    const rows = db.prepare(sql).all(...params);
    res.json({ payrolls: rows });
  } catch (e) {
    console.error('payrolls list', e);
    res.status(500).json({ error: 'Payroll yuklanmadi.' });
  }
});

router.post('/payrolls', payrollCreateBody, (req, res) => {
  const ps = String(req.body.period_start);
  const pe = String(req.body.period_end);
  if (!periodOrderOk(ps, pe)) {
    return res.status(400).json({ error: 'period_start period_end dan katta bo‘lishi mumkin emas.' });
  }
  const status = req.body.status != null ? String(req.body.status) : 'draft';
  if (!ALLOW_STATUS.has(status)) return res.status(400).json({ error: 'Noto‘g‘ri status.' });

  try {
    const run = db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO payrolls (employee_name, role_label, amount, period_start, period_end, status, comment, created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          String(req.body.employee_name).trim(),
          String(req.body.role_label || '').trim(),
          Number(req.body.amount),
          ps,
          pe,
          status,
          req.body.comment != null ? String(req.body.comment).trim() || null : null,
          req.user.id,
        );
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'create',
        entityType: 'payroll',
        entityId: r.lastInsertRowid,
        payload: { employee_name: req.body.employee_name, amount: req.body.amount, period_start: ps, period_end: pe, status },
      });
    });
    run();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('payroll create', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

router.patch('/payrolls/:id', payrollIdParam, payrollPatchBody, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    const row = db.prepare(`SELECT * FROM payrolls WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    if (String(row.status) === 'paid') {
      return res.status(400).json({ error: 'To‘langan payroll tahrirlanmaydi.' });
    }

    const ps = req.body.period_start != null ? String(req.body.period_start) : row.period_start;
    const pe = req.body.period_end != null ? String(req.body.period_end) : row.period_end;
    if (!periodOrderOk(ps, pe)) {
      return res.status(400).json({ error: 'Davr sanalari noto‘g‘ri.' });
    }

    const run = db.transaction(() => {
      const fields = [];
      const vals = [];
      if (req.body.employee_name != null) {
        fields.push('employee_name = ?');
        vals.push(String(req.body.employee_name).trim());
      }
      if (req.body.role_label != null) {
        fields.push('role_label = ?');
        vals.push(String(req.body.role_label).trim());
      }
      if (req.body.amount != null) {
        fields.push('amount = ?');
        vals.push(Number(req.body.amount));
      }
      if (req.body.period_start != null) {
        fields.push('period_start = ?');
        vals.push(String(req.body.period_start).trim());
      }
      if (req.body.period_end != null) {
        fields.push('period_end = ?');
        vals.push(String(req.body.period_end).trim());
      }
      if (req.body.status != null) {
        const st = String(req.body.status);
        if (!ALLOW_STATUS.has(st)) throw new Error('BAD_STATUS');
        if (st === 'paid') throw new Error('USE_MARK_PAID');
        fields.push('status = ?');
        vals.push(st);
      }
      if (req.body.comment !== undefined) {
        fields.push('comment = ?');
        vals.push(req.body.comment != null ? String(req.body.comment).trim() || null : null);
      }
      if (fields.length === 0) throw new Error('NO_FIELDS');
      fields.push(`updated_at = datetime('now')`);
      fields.push('updated_by = ?');
      vals.push(req.user.id);
      vals.push(id);
      db.prepare(`UPDATE payrolls SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'update',
        entityType: 'payroll',
        entityId: id,
        payload: req.body || {},
      });
    });
    try {
      run();
    } catch (e) {
      if (e?.message === 'NO_FIELDS') return res.status(400).json({ error: 'Yangilanadigan maydon yo‘q.' });
      if (e?.message === 'BAD_STATUS') return res.status(400).json({ error: 'Noto‘g‘ri status.' });
      if (e?.message === 'USE_MARK_PAID') {
        return res.status(400).json({ error: 'To‘langan holat uchun /payrolls/:id/mark-paid dan foydalaning.' });
      }
      throw e;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('payroll patch', e);
    res.status(500).json({ error: 'Yangilanmadi.' });
  }
});

router.post('/payrolls/:id/mark-paid', payrollIdParam, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    const row = db.prepare(`SELECT * FROM payrolls WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    if (String(row.status) === 'paid') return res.status(400).json({ error: 'Allaqachon to‘langan.' });

    const run = db.transaction(() => {
      db.prepare(
        `UPDATE payrolls SET status = 'paid', paid_at = datetime('now'), paid_by = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?`,
      ).run(req.user.id, req.user.id, id);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'update',
        entityType: 'payroll',
        entityId: id,
        payload: { action: 'mark_paid', amount: row.amount },
      });
    });
    run();
    res.json({ ok: true });
  } catch (e) {
    console.error('payroll mark-paid', e);
    res.status(500).json({ error: 'Bajarilmadi.' });
  }
});

router.delete('/payrolls/:id', payrollIdParam, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    const row = db.prepare(`SELECT * FROM payrolls WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    const run = db.transaction(() => {
      db.prepare(`UPDATE payrolls SET deleted_at = datetime('now'), updated_by = ? WHERE id = ?`).run(req.user.id, id);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'delete',
        entityType: 'payroll',
        entityId: id,
        payload: { was: { employee_name: row.employee_name, amount: row.amount, status: row.status } },
      });
    });
    run();
    res.json({ ok: true });
  } catch (e) {
    console.error('payroll delete', e);
    res.status(500).json({ error: 'O‘chirilmadi.' });
  }
});

export default router;
