import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { applyWithdrawalMarkPaid, applyWithdrawalReview } from '../lib/withdrawalRequestActions.js';
import {
  buildExportFile,
  buildReceiptPdf,
  createEmployee,
  createFinancialTransaction,
  createPayrollPayment,
  ensureAccountingRuntime,
  getAccountingOverview,
  getActivityFeed,
  getFinancialTransactions,
  getPayrollCalendar,
  getPayrollEmployees,
  getPayrollPayments,
  getReportsSummary,
  updateEmployee,
} from '../lib/accountingEngine.js';

const router = Router();

function canUseAccountingPanel(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'accounting' || role === 'superuser' || Number(user?.role_id) === 1;
}

function accountingGuard(req, res, next) {
  if (canUseAccountingPanel(req.user)) return next();
  return res.status(403).json({ error: "Buxgalteriya moduliga kirish uchun ruxsat yo'q." });
}

router.use(authRequired, accountingGuard);
router.use(async (_req, _res, next) => {
  try {
    await ensureAccountingRuntime();
    next();
  } catch (error) {
    console.error('[accounting/erp/runtime]', error);
    next(error);
  }
});

router.get('/overview', (req, res) => {
  try {
    const rangeDays = Number.parseInt(String(req.query.range_days || '180'), 10) || 180;
    res.json(getAccountingOverview({ rangeDays }));
  } catch (error) {
    console.error('[accounting/erp/overview]', error);
    res.status(500).json({ error: 'Boshqaruv paneli ma`lumotlari yuklanmadi.' });
  }
});

router.get('/payroll/employees', (req, res) => {
  try {
    const search = String(req.query.q || '').trim();
    const status = String(req.query.status || 'all').trim().toLowerCase();
    res.json(getPayrollEmployees({ search, status }));
  } catch (error) {
    console.error('[accounting/erp/payroll/employees]', error);
    res.status(500).json({ error: 'Xodimlar ro`yxati yuklanmadi.' });
  }
});

router.post('/payroll/employees', (req, res) => {
  try {
    const result = createEmployee(req.body || {}, req.user.id);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    console.error('[accounting/erp/payroll/employees POST]', error);
    return res.status(500).json({ error: 'Xodim yaratilmadi.' });
  }
});

router.patch('/payroll/employees/:id', (req, res) => {
  try {
    const employeeId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(employeeId) || employeeId < 1) {
      return res.status(400).json({ error: "Noto'g'ri xodim ID." });
    }
    const result = updateEmployee(employeeId, req.body || {}, req.user.id);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    console.error('[accounting/erp/payroll/employees PATCH]', error);
    return res.status(500).json({ error: 'Xodim yangilanmadi.' });
  }
});

router.get('/payroll/payments', (req, res) => {
  try {
    const employeeId = Number.parseInt(String(req.query.employee_id || ''), 10);
    const limit = Number.parseInt(String(req.query.limit || '60'), 10) || 60;
    const monthKey = String(req.query.month_key || '').trim();
    const phase = String(req.query.phase || '').trim().toLowerCase();
    res.json(
      getPayrollPayments({
        employeeId: Number.isInteger(employeeId) ? employeeId : undefined,
        monthKey,
        phase,
        limit,
      }),
    );
  } catch (error) {
    console.error('[accounting/erp/payroll/payments GET]', error);
    res.status(500).json({ error: "To'lovlar tarixi yuklanmadi." });
  }
});

router.post('/payroll/payments', async (req, res) => {
  try {
    const result = await createPayrollPayment(req.body || {}, req.user.id);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    console.error('[accounting/erp/payroll/payments POST]', error);
    return res.status(500).json({ error: "To'lov yozuvi yaratilmadi." });
  }
});

router.get('/payroll/calendar', async (req, res) => {
  try {
    const monthKey = String(req.query.month_key || '').trim();
    await ensureAccountingRuntime(monthKey ? [monthKey] : []);
    res.json(getPayrollCalendar({ monthKey }));
  } catch (error) {
    console.error('[accounting/erp/payroll/calendar]', error);
    res.status(500).json({ error: 'Payroll kalendari yuklanmadi.' });
  }
});

router.get('/payroll/payments/:id/receipt.pdf', async (req, res) => {
  try {
    const paymentId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: "Noto'g'ri to'lov ID." });
    }
    const pdf = await buildReceiptPdf(paymentId);
    if (!pdf) return res.status(404).json({ error: 'Chek topilmadi.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="myshop-receipt-${paymentId}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error('[accounting/erp/receipt/pdf]', error);
    return res.status(500).json({ error: 'PDF cheki yaratilmadi.' });
  }
});

router.get('/transactions', (req, res) => {
  try {
    res.json(
      getFinancialTransactions({
        search: String(req.query.q || '').trim(),
        direction: String(req.query.direction || 'all').trim().toLowerCase(),
        category_slug: String(req.query.category_slug || 'all').trim().toLowerCase(),
        from_date: String(req.query.from_date || '').trim(),
        to_date: String(req.query.to_date || '').trim(),
        limit: Number.parseInt(String(req.query.limit || '100'), 10) || 100,
      }),
    );
  } catch (error) {
    console.error('[accounting/erp/transactions GET]', error);
    res.status(500).json({ error: 'Moliyaviy tranzaksiyalar yuklanmadi.' });
  }
});

router.post('/transactions', (req, res) => {
  try {
    const result = createFinancialTransaction(req.body || {}, req.user.id);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    console.error('[accounting/erp/transactions POST]', error);
    return res.status(500).json({ error: 'Moliyaviy yozuv yaratilmadi.' });
  }
});

router.get('/reports/summary', (req, res) => {
  try {
    const rangeDays = Number.parseInt(String(req.query.range_days || '90'), 10) || 90;
    res.json(getReportsSummary({ rangeDays }));
  } catch (error) {
    console.error('[accounting/erp/reports/summary]', error);
    res.status(500).json({ error: 'Hisobot ma`lumotlari yuklanmadi.' });
  }
});

router.get('/reports/export', (req, res) => {
  try {
    const type = String(req.query.type || 'transactions').trim().toLowerCase();
    const rangeDays = Number.parseInt(String(req.query.range_days || '90'), 10) || 90;
    const file = buildExportFile({ type, rangeDays });
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  } catch (error) {
    console.error('[accounting/erp/reports/export]', error);
    res.status(500).json({ error: 'Export fayli tayyorlanmadi.' });
  }
});

router.get('/activity', (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '40'), 10) || 40;
    res.json(getActivityFeed({ limit }));
  } catch (error) {
    console.error('[accounting/erp/activity]', error);
    res.status(500).json({ error: 'Faollik jurnali yuklanmadi.' });
  }
});

router.get('/notifications', (req, res) => {
  try {
    const notifications = db
      .prepare(
        `
        SELECT id, title, body, created_at, read_at, link_type, link_id
        FROM user_notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `,
      )
      .all(req.user.id);
    res.json({ notifications });
  } catch (error) {
    console.error('[accounting/erp/notifications]', error);
    res.status(500).json({ error: 'Bildirishnomalar yuklanmadi.' });
  }
});

router.patch('/notifications/:id/read', (req, res) => {
  try {
    const notificationId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(notificationId) || notificationId < 1) {
      return res.status(400).json({ error: "Noto'g'ri bildirishnoma ID." });
    }
    db.prepare(`UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
      notificationId,
      req.user.id,
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[accounting/erp/notifications read]', error);
    return res.status(500).json({ error: 'Bildirishnoma holati yangilanmadi.' });
  }
});

router.patch('/withdrawal-requests/:id', (req, res) => {
  const withdrawalId = Number.parseInt(String(req.params.id || ''), 10);
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim();
  const result = applyWithdrawalReview({
    reviewerUserId: req.user.id,
    withdrawalId,
    status,
    note,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  return res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id/mark-paid', (req, res) => {
  const withdrawalId = Number.parseInt(String(req.params.id || ''), 10);
  const result = applyWithdrawalMarkPaid({ payerUserId: req.user.id, withdrawalId });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  return res.json({ ok: true });
});

export default router;
