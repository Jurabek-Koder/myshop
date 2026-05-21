import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { db } from '../db/database.js';
import {
  buildTransactionsCsvExport,
  createFinancialTransaction,
  getAccountingCategories,
  getDashboardOverview,
  getPayrollCalendar,
  getPayrollCycles,
  getReceiptDetail,
  getReportSummary,
  listAccountingActivities,
  listEmployeesWithPayroll,
  listFinancialTransactions,
  registerSalaryPayment,
  runAccountingAutomation,
} from '../lib/accountingService.js';
import { buildSalaryReceiptPdf } from '../lib/accountingReceiptPdf.js';

const router = Router();

router.use(authRequired, requireRole('accounting'));

router.post('/automation/run', async (_req, res) => {
  try {
    const result = await runAccountingAutomation(db);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('accounting automation', error);
    res.status(500).json({ error: 'Payroll avtomatizatsiyasini ishga tushirib bo‘lmadi.' });
  }
});

router.get('/dashboard/overview', async (req, res) => {
  try {
    await runAccountingAutomation(db, { sendTelegram: false });
    const overview = getDashboardOverview(db, req.query || {});
    res.json(overview);
  } catch (error) {
    console.error('accounting dashboard overview', error);
    res.status(500).json({ error: 'Dashboard ma’lumotlari yuklanmadi.' });
  }
});

router.get('/employees', async (req, res) => {
  try {
    await runAccountingAutomation(db, { sendTelegram: false });
    const result = listEmployeesWithPayroll(db, {
      search: req.query.search,
      limit: Number.parseInt(String(req.query.limit || '100'), 10),
    });
    res.json(result);
  } catch (error) {
    console.error('accounting employees', error);
    res.status(500).json({ error: 'Xodimlar ro‘yxati yuklanmadi.' });
  }
});

router.get('/payroll/cycles', async (req, res) => {
  try {
    await runAccountingAutomation(db, { sendTelegram: false });
    const result = getPayrollCycles(db, req.query || {});
    res.json(result);
  } catch (error) {
    console.error('accounting payroll cycles', error);
    res.status(500).json({ error: 'Payroll sikllari yuklanmadi.' });
  }
});

router.get('/payroll/calendar', async (req, res) => {
  try {
    await runAccountingAutomation(db, { sendTelegram: false });
    const result = getPayrollCalendar(db, req.query || {});
    res.json(result);
  } catch (error) {
    console.error('accounting payroll calendar', error);
    res.status(500).json({ error: 'Payroll kalendari yuklanmadi.' });
  }
});

router.post('/payroll/cycles/:id/payments', async (req, res) => {
  try {
    const result = await registerSalaryPayment(
      db,
      {
        cycleId: Number.parseInt(req.params.id, 10),
        amount: req.body?.amount,
        payment_method: req.body?.payment_method,
        note: req.body?.note,
        paid_at: req.body?.paid_at,
      },
      req.user.id,
    );
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error || 'To‘lovni saqlab bo‘lmadi.' });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('accounting payroll payment', error);
    return res.status(500).json({ error: 'Payroll to‘lovini yaratib bo‘lmadi.' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const result = listFinancialTransactions(db, req.query || {});
    res.json(result);
  } catch (error) {
    console.error('accounting transactions', error);
    res.status(500).json({ error: 'Tranzaksiyalar yuklanmadi.' });
  }
});

router.post('/transactions', async (req, res) => {
  try {
    const result = createFinancialTransaction(
      db,
      {
        direction: req.body?.direction,
        amount: req.body?.amount,
        title: req.body?.title,
        note: req.body?.note,
        source: req.body?.source,
        status: req.body?.status,
        transaction_date: req.body?.transaction_date,
        category_id: req.body?.category_id,
        linked_employee_id: req.body?.linked_employee_id,
        linked_cycle_id: req.body?.linked_cycle_id,
      },
      req.user.id,
    );
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error || 'Tranzaksiya saqlanmadi.' });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('accounting create transaction', error);
    return res.status(500).json({ error: 'Tranzaksiyani saqlab bo‘lmadi.' });
  }
});

router.get('/categories', (_req, res) => {
  try {
    res.json(getAccountingCategories(db));
  } catch (error) {
    console.error('accounting categories', error);
    res.status(500).json({ error: 'Kategoriyalar yuklanmadi.' });
  }
});

router.get('/reports/summary', async (req, res) => {
  try {
    await runAccountingAutomation(db, { sendTelegram: false });
    res.json(getReportSummary(db, req.query || {}));
  } catch (error) {
    console.error('accounting reports summary', error);
    res.status(500).json({ error: 'Hisobot ma’lumotlari yuklanmadi.' });
  }
});

router.get('/reports/export.csv', (req, res) => {
  try {
    const csv = buildTransactionsCsvExport(db, req.query || {});
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="myshop-accounting-${stamp}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('accounting export csv', error);
    res.status(500).json({ error: 'CSV eksport tayyorlanmadi.' });
  }
});

router.get('/activities', (req, res) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '80'), 10);
    res.json({ items: listAccountingActivities(db, limit) });
  } catch (error) {
    console.error('accounting activities', error);
    res.status(500).json({ error: 'Faollik jurnali yuklanmadi.' });
  }
});

router.get('/receipts/:id', (req, res) => {
  try {
    const receiptId = Number.parseInt(req.params.id, 10);
    const receipt = getReceiptDetail(db, receiptId);
    if (!receipt) return res.status(404).json({ error: 'Receipt topilmadi.' });
    return res.json({ receipt });
  } catch (error) {
    console.error('accounting receipt detail', error);
    return res.status(500).json({ error: 'Receipt ma’lumoti yuklanmadi.' });
  }
});

router.get('/receipts/:id/pdf', async (req, res) => {
  try {
    const receiptId = Number.parseInt(req.params.id, 10);
    const receipt = getReceiptDetail(db, receiptId);
    if (!receipt) return res.status(404).json({ error: 'Receipt topilmadi.' });
    const pdfBuffer = await buildSalaryReceiptPdf(receipt);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${receipt.receipt_number || 'receipt'}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('accounting receipt pdf', error);
    return res.status(500).json({ error: 'PDF tayyorlanmadi.' });
  }
});

export default router;
