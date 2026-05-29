import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { insertFinanceLog } from '../services/financeLogService.js';
import {
  cashboxIdParam,
  cashboxMovementValidation,
  expenseCreateValidation,
  expenseIdParam,
  expensePatchValidation,
  financeLogsQuery,
} from '../middleware/accountingValidators.js';
import courierBalancesRoutes from './accounting/courierBalancesRoutes.js';
import payrollsRoutes from './accounting/payrollsRoutes.js';
import reportsRoutes from './accounting/reportsRoutes.js';
import payrollManagementRoutes from './accounting/payrollManagementRoutes.js';
import superuserAuditRoutes from './accounting/superuserAuditRoutes.js';
import productsReportRoutes from './accounting/productsReportRoutes.js';
import payrollArchiveRoutes from './accounting/payrollArchiveRoutes.js';
import incomeRoutes from './accounting/incomeRoutes.js';
import { getPayrollSummary } from '../services/payrollCycleService.js';

const router = Router();
router.use(authRequired, requireRole('accounting'));

const EXPENSE_CATEGORIES = new Set(['reklama', 'oylik', 'dostavka', 'soliq', 'boshqa']);

const REVENUE_STATUSES = `lower(trim(status)) IN ('delivered', 'completed')`;

/** Dashboard: savdo, xarajat, kassa, seller balans (mavjud jadvallardan). */
router.get('/dashboard', (req, res) => {
  try {
    const today = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS s, COUNT(*) AS c
         FROM orders WHERE ${REVENUE_STATUSES}
           AND date(created_at) = date('now')`,
      )
      .get();
    const week = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS s, COUNT(*) AS c
         FROM orders WHERE ${REVENUE_STATUSES}
           AND date(created_at) >= date('now', '-6 days')`,
      )
      .get();
    const month = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS s, COUNT(*) AS c
         FROM orders WHERE ${REVENUE_STATUSES}
           AND date(created_at) >= date('now', 'start of month')`,
      )
      .get();
    const expensesMonth = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM accounting_expenses
         WHERE deleted_at IS NULL AND date(created_at) >= date('now', 'start of month')`,
      )
      .get();
    const sellerPayables = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS s
         FROM sellers WHERE lower(trim(COALESCE(status,''))) = 'active'`,
      )
      .get();
    const cashTotal = db
      .prepare(`SELECT COALESCE(SUM(balance), 0) AS s FROM accounting_cashboxes WHERE active = 1`)
      .get();
    const bankRow = db
      .prepare(`SELECT balance FROM accounting_cashboxes WHERE lower(trim(code)) = 'bank' AND active = 1`)
      .get();

    const incomeMonth = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM accounting_income
         WHERE deleted_at IS NULL AND date(income_date) >= date('now', 'start of month')`,
      )
      .get();

    const now = new Date();
    const payrollSummary = getPayrollSummary(now.getFullYear(), now.getMonth() + 1);

    const grossMonth = Number(month?.s) || 0;
    const expM = Number(expensesMonth?.s) || 0;
    const incomeM = Number(incomeMonth?.s) || 0;
    const totalRevenue = grossMonth + incomeM;
    const payrollTotal =
      (payrollSummary.amounts?.paid || 0) +
      (payrollSummary.amounts?.pending || 0) +
      (payrollSummary.amounts?.overdue || 0);
    const netApprox = totalRevenue - expM - (payrollSummary.amounts?.paid || 0);

    const trendRows = db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) AS ym,
                COALESCE(SUM(total_amount), 0) AS revenue
         FROM orders
         WHERE ${REVENUE_STATUSES}
           AND date(created_at) >= date('now', '-5 months', 'start of month')
         GROUP BY ym
         ORDER BY ym ASC`,
      )
      .all();

    const expenseTrend = db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) AS ym, COALESCE(SUM(amount), 0) AS total
         FROM accounting_expenses
         WHERE deleted_at IS NULL AND date(created_at) >= date('now', '-5 months', 'start of month')
         GROUP BY ym ORDER BY ym ASC`,
      )
      .all();

    const payrollStatusPie = [
      { name: 'paid', value: payrollSummary.counts?.paid || 0, amount: payrollSummary.amounts?.paid || 0 },
      { name: 'pending', value: payrollSummary.counts?.pending || 0, amount: payrollSummary.amounts?.pending || 0 },
      { name: 'overdue', value: payrollSummary.counts?.overdue || 0, amount: payrollSummary.amounts?.overdue || 0 },
    ];

    res.json({
      today_sales: Number(today?.s) || 0,
      today_orders: Number(today?.c) || 0,
      week_sales: Number(week?.s) || 0,
      week_orders: Number(week?.c) || 0,
      month_sales: grossMonth,
      month_orders: Number(month?.c) || 0,
      month_income_logged: incomeM,
      total_revenue: totalRevenue,
      month_expenses: expM,
      month_payroll_total: payrollTotal,
      month_payroll_paid: payrollSummary.amounts?.paid || 0,
      payroll_summary: payrollSummary,
      net_profit_approx: netApprox,
      seller_payables: Number(sellerPayables?.s) || 0,
      cashboxes_total: Number(cashTotal?.s) || 0,
      bank_balance: Number(bankRow?.balance) || 0,
      revenue_trend: trendRows,
      expense_trend: expenseTrend,
      payroll_status_pie: payrollStatusPie,
    });
  } catch (e) {
    console.error('accounting erp dashboard', e);
    res.status(500).json({ error: 'Dashboard yuklanmadi.' });
  }
});

router.get('/expenses', (req, res) => {
  try {
    const { from, to, category } = req.query;
    let sql = `SELECT id, title, amount, category, comment, created_at, created_by, updated_at
                FROM accounting_expenses WHERE deleted_at IS NULL`;
    const params = [];
    if (from) {
      sql += ` AND date(created_at) >= date(?)`;
      params.push(String(from));
    }
    if (to) {
      sql += ` AND date(created_at) <= date(?)`;
      params.push(String(to));
    }
    if (category && EXPENSE_CATEGORIES.has(String(category).trim().toLowerCase())) {
      sql += ` AND lower(trim(category)) = ?`;
      params.push(String(category).trim().toLowerCase());
    }
    sql += ` ORDER BY datetime(created_at) DESC, id DESC LIMIT 500`;
    const rows = db.prepare(sql).all(...params);
    res.json({ expenses: rows });
  } catch (e) {
    console.error('accounting erp expenses list', e);
    res.status(500).json({ error: 'Xarajatlar yuklanmadi.' });
  }
});

router.post('/expenses', expenseCreateValidation, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const amount = Number(req.body?.amount);
  const category = String(req.body?.category || '').trim().toLowerCase();
  const comment = String(req.body?.comment || '').trim() || null;
  try {
    const runIns = db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO accounting_expenses (title, amount, category, comment, created_by)
           VALUES (?,?,?,?,?)`,
        )
        .run(title, amount, category, comment, req.user.id);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'create',
        entityType: 'accounting_expense',
        entityId: r.lastInsertRowid,
        payload: { title, amount, category },
      });
    });
    runIns();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('accounting erp expense create', e);
    res.status(500).json({ error: 'Saqlanmadi.' });
  }
});

router.patch('/expenses/:id', expenseIdParam, expensePatchValidation, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto‘g‘ri ID.' });
  const title = req.body?.title != null ? String(req.body.title).trim() : null;
  const amount = req.body?.amount != null ? Number(req.body.amount) : null;
  const category = req.body?.category != null ? String(req.body.category).trim().toLowerCase() : null;
  const comment = req.body?.comment != null ? String(req.body.comment).trim() : undefined;

  try {
    const row = db.prepare(`SELECT * FROM accounting_expenses WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    if (category != null && !EXPENSE_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Noto‘g‘ri category.' });
    }
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
      return res.status(400).json({ error: 'amount musbat bo‘lishi kerak.' });
    }

    const run = db.transaction(() => {
      const fields = [];
      const vals = [];
      if (title != null) {
        fields.push('title = ?');
        vals.push(title);
      }
      if (amount != null) {
        fields.push('amount = ?');
        vals.push(amount);
      }
      if (category != null) {
        fields.push('category = ?');
        vals.push(category);
      }
      if (comment !== undefined) {
        fields.push('comment = ?');
        vals.push(comment || null);
      }
      if (fields.length === 0) {
        throw new Error('NO_FIELDS');
      }
      fields.push(`updated_at = datetime('now')`);
      fields.push('updated_by = ?');
      vals.push(req.user.id);
      vals.push(id);
      db.prepare(`UPDATE accounting_expenses SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'update',
        entityType: 'accounting_expense',
        entityId: id,
        payload: req.body || {},
      });
    });
    try {
      run();
    } catch (e) {
      if (e?.message === 'NO_FIELDS') return res.status(400).json({ error: 'Yangilanadigan maydon yo‘q.' });
      throw e;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('accounting erp expense patch', e);
    res.status(500).json({ error: 'Yangilanmadi.' });
  }
});

router.delete('/expenses/:id', expenseIdParam, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto‘g‘ri ID.' });
  try {
    const row = db.prepare(`SELECT * FROM accounting_expenses WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    const tx = db.transaction(() => {
      db.prepare(`UPDATE accounting_expenses SET deleted_at = datetime('now'), updated_by = ? WHERE id = ?`).run(
        req.user.id,
        id,
      );
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'delete',
        entityType: 'accounting_expense',
        entityId: id,
        payload: { was: row },
      });
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    console.error('accounting erp expense delete', e);
    res.status(500).json({ error: 'O‘chirilmadi.' });
  }
});

router.get('/cashboxes', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, code, label, balance, sort_order, active FROM accounting_cashboxes ORDER BY sort_order ASC, id ASC`,
      )
      .all();
    res.json({ cashboxes: rows });
  } catch (e) {
    console.error('accounting erp cashboxes', e);
    res.status(500).json({ error: 'Kassalar yuklanmadi.' });
  }
});

/** Kassaga kirim/chiqim — balans avtomatik yangilanadi. */
router.post('/cashboxes/:id/movements', cashboxIdParam, cashboxMovementValidation, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto‘g‘ri kassa ID.' });
  const amount = Number(req.body?.amount);
  const direction = String(req.body?.direction || '').trim().toLowerCase();
  const comment = String(req.body?.comment || '').trim() || null;
  const refType = req.body?.ref_type != null ? String(req.body.ref_type).trim() : null;
  const refId = req.body?.ref_id != null ? Number.parseInt(String(req.body.ref_id), 10) : null;

  try {
    const run = db.transaction(() => {
      const box = db.prepare(`SELECT * FROM accounting_cashboxes WHERE id = ? AND active = 1`).get(id);
      if (!box) {
        throw new Error('NOT_FOUND');
      }
      const delta = direction === 'in' ? amount : -amount;
      const next = Number(box.balance) + delta;
      if (next < 0) {
        throw new Error('NEGATIVE');
      }
      db.prepare(`UPDATE accounting_cashboxes SET balance = ? WHERE id = ?`).run(next, id);
      const m = db
        .prepare(
          `INSERT INTO accounting_cashbox_movements (cashbox_id, amount, direction, ref_type, ref_id, comment, created_by)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(id, amount, direction, refType, Number.isFinite(refId) ? refId : null, comment, req.user.id);
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'balance_change',
        entityType: 'accounting_cashbox',
        entityId: id,
        payload: {
          movement_id: m.lastInsertRowid,
          direction,
          amount,
          balance_before: box.balance,
          balance_after: next,
        },
      });
    });
    run();
    return res.status(201).json({ ok: true });
  } catch (e) {
    if (e?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Kassa topilmadi.' });
    if (e?.message === 'NEGATIVE') return res.status(400).json({ error: 'Balans manfiy bo‘lishi mumkin emas.' });
    console.error('accounting erp cashbox movement', e);
    return res.status(500).json({ error: 'Operatsiya bajarilmadi.' });
  }
});

router.get('/finance-logs', financeLogsQuery, (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    let sql = `SELECT a.id, a.actor_user_id, u.login AS actor_login, a.action, a.entity_type, a.entity_id, a.payload_json, a.created_at
         FROM finance_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE 1=1`;
    const params = [];
    if (req.query.entity_type) {
      sql += ` AND lower(trim(a.entity_type)) = lower(trim(?))`;
      params.push(String(req.query.entity_type).trim());
    }
    sql += ` ORDER BY datetime(a.created_at) DESC, a.id DESC LIMIT ?`;
    params.push(limit);
    const rows = db.prepare(sql).all(...params);
    res.json({ logs: rows });
  } catch (e) {
    console.error('accounting erp finance logs', e);
    res.status(500).json({ error: 'Audit yuklanmadi.' });
  }
});

router.use('/income', incomeRoutes);
router.use('/payroll-management', payrollManagementRoutes);
router.use('/superuser-audit', superuserAuditRoutes);
router.use('/products-report', productsReportRoutes);
router.use('/payroll-archive', payrollArchiveRoutes);
router.use(courierBalancesRoutes);
router.use(payrollsRoutes);
router.use(reportsRoutes);

router.get('/notifications', (req, res) => {
  const list = db
    .prepare(
      `SELECT id, title, body, created_at, read_at, link_type, link_id
       FROM user_notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 50`,
    )
    .all(req.user.id);
  res.json({ notifications: list });
});

router.patch('/notifications/:id/read', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Noto'g'ri ID." });
  db.prepare(
    `UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`,
  ).run(id, req.user.id);
  res.json({ ok: true });
});

router.get('/couriers', (req, res) => {
  const list = db.prepare(`
    SELECT u.id, u.full_name, u.login, u.email, u.created_at, u.staff_member_id,
           s.phone, s.orders_handled, s.rating, s.status as staff_status, s.region_id,
           COALESCE(NULLIF(trim(s.region_service_text), ''), r.name) as region_name
    FROM users u
    LEFT JOIN staff_members s ON s.id = u.staff_member_id AND s.staff_type = 'courier'
    LEFT JOIN regions r ON r.id = s.region_id
    WHERE LOWER(u.role) = 'courier'
    ORDER BY u.id
  `).all();
  res.json({ couriers: list });
});

router.get('/couriers/:id/moliya', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });

  const user = db.prepare('SELECT id, login, role FROM users WHERE id = ?').get(id);
  if (!user || (user.role || '').toLowerCase() !== 'courier') return res.status(404).json({ error: 'Kuryer topilmadi.' });

  const stats = db.prepare(`
    SELECT 
      status,
      COUNT(id) as count,
      SUM(total_amount) as total_amount,
      SUM(25000) as total_courier_fee,
      SUM(COALESCE(courier_unsold_return, 0)) as total_unsold_return
    FROM orders
    WHERE courier_id = ? 
      AND (
        status IN ('assigned', 'picked_up', 'on_the_way')
        OR date(datetime(COALESCE(status_updated_at, created_at), '+5 hours')) = date(datetime('now', '+5 hours'))
      )
    GROUP BY status, courier_unsold_return
  `).all(id);

  const wr = db.prepare('SELECT id, total_amount FROM work_roles WHERE login = ? AND portal_role = ?').get(user.login, 'courier');
  let withdrawals = [];
  if (wr) {
    withdrawals = db.prepare(`
      SELECT id, amount, status, payout_method, created_at, updated_at
      FROM withdrawal_requests
      WHERE work_role_id = ?
      ORDER BY created_at DESC
    `).all(wr.id);
  }

  res.json({
    balance: wr ? wr.total_amount : 0,
    stats: stats || [],
    withdrawals: withdrawals || []
  });
});

router.get('/staff/:role', (req, res) => {
  const roleName = String(req.params.role || '').toLowerCase();
  
  const list = db.prepare(`
    SELECT u.id, u.full_name, u.login, u.email, u.created_at, u.staff_member_id, u.role,
           s.phone, s.orders_handled, s.rating, s.status as staff_status, s.region_id,
           COALESCE(NULLIF(trim(s.region_service_text), ''), r.name) as region_name,
           COALESCE(w.total_amount, 0) as balance
    FROM users u
    LEFT JOIN staff_members s ON s.id = u.staff_member_id 
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN work_roles w ON w.login = u.login AND w.portal_role = u.role
    WHERE LOWER(u.role) = ?
    ORDER BY u.id
  `).all(roleName);
  res.json({ staff: list });
});

router.get('/staff/:role/:id/moliya', (req, res) => {
  const roleName = String(req.params.role || '').toLowerCase();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: "Noto'g'ri ID." });

  const user = db.prepare('SELECT id, login, role FROM users WHERE id = ?').get(id);
  if (!user || (user.role || '').toLowerCase() !== roleName) return res.status(404).json({ error: 'Xodim topilmadi.' });

  const wr = db.prepare('SELECT id, total_amount FROM work_roles WHERE login = ? AND portal_role = ?').get(user.login, roleName);
  let withdrawals = [];
  if (wr) {
    withdrawals = db.prepare(`
      SELECT id, amount, status, payout_method, created_at, updated_at
      FROM withdrawal_requests
      WHERE work_role_id = ?
      ORDER BY created_at DESC
    `).all(wr.id);
  }

  res.json({
    balance: wr ? wr.total_amount : 0,
    stats: [],
    withdrawals: withdrawals || []
  });
});

export default router;
