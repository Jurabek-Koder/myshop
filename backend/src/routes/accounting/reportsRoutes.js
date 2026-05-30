import { Router } from 'express';
import { db } from '../../db/database.js';
import { insertFinanceLog } from '../../services/financeLogService.js';
import { reportGenerateBody, reportIdParam } from '../../middleware/accountingValidators.js';

const router = Router();

const REVENUE_STATUSES = `lower(trim(status)) IN ('delivered', 'completed')`;

function buildSnapshot(periodStart, periodEnd) {
  const orders = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS revenue
       FROM orders
       WHERE ${REVENUE_STATUSES}
         AND date(created_at) >= date(?)
         AND date(created_at) <= date(?)`,
    )
    .get(periodStart, periodEnd);

  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM accounting_expenses
       WHERE deleted_at IS NULL
         AND date(created_at) >= date(?)
         AND date(created_at) <= date(?)`,
    )
    .get(periodStart, periodEnd);

  const payrollPaid = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payrolls
       WHERE deleted_at IS NULL
         AND status = 'paid'
         AND date(COALESCE(paid_at, created_at)) >= date(?)
         AND date(COALESCE(paid_at, created_at)) <= date(?)`,
    )
    .get(periodStart, periodEnd);

  const courierRow = db.prepare(`SELECT COALESCE(SUM(balance), 0) AS total FROM courier_balances`).get();
  const cashRow = db.prepare(`SELECT COALESCE(SUM(balance), 0) AS total FROM accounting_cashboxes WHERE active = 1`).get();
  const sellerPayables = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS total
       FROM sellers WHERE lower(trim(COALESCE(status, ''))) = 'active'`,
    )
    .get();

  const netApprox = Number(orders?.revenue) - Number(expenses?.total) - Number(payrollPaid?.total);

  return {
    period_start: periodStart,
    period_end: periodEnd,
    generated_at: new Date().toISOString(),
    orders: { count: Number(orders?.count) || 0, revenue_uzs: Number(orders?.revenue) || 0 },
    expenses_uzs: Number(expenses?.total) || 0,
    payroll_paid: { count: Number(payrollPaid?.count) || 0, total_uzs: Number(payrollPaid?.total) || 0 },
    courier_balances_total_uzs: Number(courierRow?.total) || 0,
    cashboxes_total_uzs: Number(cashRow?.total) || 0,
    seller_payables_uzs: Number(sellerPayables?.total) || 0,
    net_profit_approx_uzs: netApprox,
  };
}

router.get('/reports', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const rows = db
      .prepare(
        `SELECT id, report_type, title, period_start, period_end, created_at, created_by
         FROM financial_reports
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`,
      )
      .all(limit);
    res.json({ reports: rows });
  } catch (e) {
    console.error('financial reports list', e);
    res.status(500).json({ error: 'Hisobotlar yuklanmadi.' });
  }
});

router.get('/reports/:id', reportIdParam, (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const row = db.prepare(`SELECT * FROM financial_reports WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'Topilmadi.' });
    let snapshot = {};
    try {
      snapshot = JSON.parse(String(row.snapshot_json || '{}'));
    } catch {
      snapshot = {};
    }
    res.json({ report: { ...row, snapshot } });
  } catch (e) {
    console.error('financial report get', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

router.post('/reports/generate', reportGenerateBody, (req, res) => {
  const ps = String(req.body.period_start);
  const pe = String(req.body.period_end);
  if (ps > pe) return res.status(400).json({ error: 'Davr boshlanishi tugashidan katta.' });

  try {
    const snapshot = buildSnapshot(ps, pe);
    const run = db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO financial_reports (report_type, title, period_start, period_end, snapshot_json, created_by)
           VALUES (?,?,?,?,?,?)`,
        )
        .run(
          String(req.body.report_type).trim(),
          String(req.body.title).trim(),
          ps,
          pe,
          JSON.stringify(snapshot),
          req.user.id,
        );
      insertFinanceLog(db, {
        actorUserId: req.user.id,
        action: 'create',
        entityType: 'financial_report',
        entityId: r.lastInsertRowid,
        payload: { report_type: req.body.report_type, period_start: ps, period_end: pe },
      });
    });
    run();
    res.status(201).json({ ok: true, snapshot });
  } catch (e) {
    console.error('financial report generate', e);
    res.status(500).json({ error: 'Hisobot yaratilmadi.' });
  }
});

export default router;
