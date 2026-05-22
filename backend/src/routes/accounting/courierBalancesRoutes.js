import { Router } from 'express';
import { db } from '../../db/database.js';
import { insertFinanceLog } from '../../services/financeLogService.js';
import { courierAdjustBody, courierStaffIdParam } from '../../middleware/accountingValidators.js';

const router = Router();

const REVENUE_STATUSES = `lower(trim(status)) IN ('delivered', 'completed')`;

function ensureCourierBalanceRows(tx) {
  const couriers = tx
    .prepare(
      `SELECT sm.id, COALESCE(sm.balance, 0) AS b
       FROM staff_members sm
       WHERE lower(trim(COALESCE(sm.staff_type, ''))) = 'courier'`,
    )
    .all();
  const ins = tx.prepare(`INSERT OR IGNORE INTO courier_balances (courier_staff_id, balance) VALUES (?, ?)`);
  for (const c of couriers) {
    ins.run(c.id, Number(c.b) || 0);
  }
}

/** Kuryerlar moliya balansi + `staff_members.balance` bilan sinxron. */
router.get('/courier-balances', (req, res) => {
  try {
    db.transaction(() => {
      ensureCourierBalanceRows(db);
    })();
    const rows = db
      .prepare(
        `SELECT cb.id, cb.courier_staff_id, cb.balance, cb.note, cb.updated_at, cb.updated_by,
                sm.full_name AS courier_name, sm.phone,
                sm.balance AS staff_member_balance,
                (SELECT COUNT(*) FROM orders o WHERE o.courier_id = sm.id AND ${REVENUE_STATUSES}) AS delivered_orders
         FROM courier_balances cb
         JOIN staff_members sm ON sm.id = cb.courier_staff_id
         WHERE lower(trim(COALESCE(sm.staff_type, ''))) = 'courier'
         ORDER BY sm.full_name COLLATE NOCASE ASC`,
      )
      .all();
    res.json({ courier_balances: rows });
  } catch (e) {
    console.error('courier-balances list', e);
    res.status(500).json({ error: 'Kuryer balanslari yuklanmadi.' });
  }
});

router.post('/courier-balances/:staffId/adjustment', courierStaffIdParam, courierAdjustBody, (req, res) => {
  const staffId = Number.parseInt(req.params.staffId, 10);
  const amount = Number(req.body.amount);
  const typ = String(req.body.type).toLowerCase();
  const comment = req.body.comment != null ? String(req.body.comment).trim() : '';

  try {
    const staff = db.prepare(`SELECT id, staff_type FROM staff_members WHERE id = ?`).get(staffId);
    if (!staff || String(staff.staff_type || '').toLowerCase().trim() !== 'courier') {
      return res.status(404).json({ error: 'Kuryer (staff) topilmadi.' });
    }

    const run = db.transaction(() => {
      ensureCourierBalanceRows(db);
      let cb = db.prepare(`SELECT * FROM courier_balances WHERE courier_staff_id = ?`).get(staffId);
      if (!cb) {
        db.prepare(`INSERT INTO courier_balances (courier_staff_id, balance) VALUES (?, 0)`).run(staffId);
        cb = db.prepare(`SELECT * FROM courier_balances WHERE courier_staff_id = ?`).get(staffId);
      }
      const delta = typ === 'credit' ? amount : -amount;
      const next = Number(cb.balance) + delta;
      if (next < 0) throw new Error('NEG');

      const staffRow = db.prepare(`SELECT COALESCE(balance, 0) AS b FROM staff_members WHERE id = ?`).get(staffId);
      const nextStaff = Number(staffRow?.b) + delta;
      if (nextStaff < 0) throw new Error('NEG');

      db.prepare(
        `UPDATE courier_balances SET balance = ?, updated_at = datetime('now'), updated_by = ? WHERE courier_staff_id = ?`,
      ).run(next, req.user.id, staffId);
      db.prepare(`UPDATE staff_members SET balance = ? WHERE id = ?`).run(nextStaff, staffId);

      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'balance_change',
        entityType: 'courier_balance',
        entityId: staffId,
        payload: {
          adjustment_type: typ,
          amount,
          courier_balance_before: cb.balance,
          courier_balance_after: next,
          staff_member_balance_after: nextStaff,
          comment: comment || null,
        },
      });
    });
    try {
      run();
    } catch (e) {
      if (e?.message === 'NEG') return res.status(400).json({ error: 'Balans manfiy bo‘lishi mumkin emas.' });
      throw e;
    }
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('courier-balances adjustment', e);
    return res.status(500).json({ error: 'Operatsiya bajarilmadi.' });
  }
});

export default router;
