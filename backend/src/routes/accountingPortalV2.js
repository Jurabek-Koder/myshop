import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  bootstrapPayrollScheduler,
  createFinancialTransaction,
  createSalaryPayment,
  exportTransactionsCsv,
  getDashboardOverview,
  getReceiptById,
  getReportsSummary,
  listActivityLogs,
  listFinancialTransactions,
  listPayrollCycles,
  listPayrollEmployees,
  listReceipts,
  refreshPayrollState,
} from '../modules/accounting/accountingPayrollService.js';

const router = Router();
router.use(authRequired, requireRole('accounting'));

function parseIntSafe(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

bootstrapPayrollScheduler();

router.post('/sync', (req, res) => {
  try {
    refreshPayrollState();
    res.json({ ok: true });
  } catch (err) {
    console.error('accounting v2 sync', err);
    res.status(500).json({ error: 'Payroll sinxronizatsiyasida xato yuz berdi.' });
  }
});

router.get('/dashboard', (req, res) => {
  try {
    const rangeDays = parseIntSafe(req.query.range_days, 90);
    const payload = getDashboardOverview({ rangeDays });
    res.json(payload);
  } catch (err) {
    console.error('accounting v2 dashboard', err);
    res.status(500).json({ error: 'Dashboard ma’lumotlarini yuklashda xato yuz berdi.' });
  }
});

router.get('/payroll/employees', (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const employees = listPayrollEmployees({ search });
    res.json({ employees });
  } catch (err) {
    console.error('accounting v2 payroll employees', err);
    res.status(500).json({ error: 'Xodimlar ro‘yxatini olishda xato yuz berdi.' });
  }
});

router.get('/payroll/cycles', (req, res) => {
  try {
    const now = new Date();
    const year = parseIntSafe(req.query.year, now.getFullYear());
    const month = parseIntSafe(req.query.month, now.getMonth() + 1);
    const employeeId = parseIntSafe(req.query.employee_id, null);
    const cycles = listPayrollCycles({ year, month, employeeId });
    res.json({ cycles, year, month });
  } catch (err) {
    console.error('accounting v2 payroll cycles', err);
    res.status(500).json({ error: 'Ish haqi sikllarini olishda xato yuz berdi.' });
  }
});

router.post('/payroll/payments', async (req, res) => {
  try {
    const employeeId = parseIntSafe(req.body?.employee_id, 0);
    const payrollCycleId = parseIntSafe(req.body?.payroll_cycle_id, 0);
    if (!employeeId || !payrollCycleId) {
      return res.status(400).json({ error: 'employee_id va payroll_cycle_id maydonlari majburiy.' });
    }
    const payload = await createSalaryPayment({
      employeeId,
      payrollCycleId,
      amount: req.body?.amount,
      paymentMethod: req.body?.payment_method,
      paymentType: req.body?.payment_type,
      note: req.body?.note,
      actorUserId: req.user?.id || null,
    });
    res.status(201).json(payload);
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg) {
      return res.status(400).json({ error: msg });
    }
    console.error('accounting v2 payroll payment', err);
    res.status(500).json({ error: 'To‘lovni saqlashda xato yuz berdi.' });
  }
});

router.get('/transactions', (req, res) => {
  try {
    const transactions = listFinancialTransactions({
      type: req.query.type,
      source: req.query.source,
      search: req.query.search,
      fromDate: parseOptionalDate(req.query.from),
      toDate: parseOptionalDate(req.query.to),
      limit: parseIntSafe(req.query.limit, 300),
    });
    res.json({ transactions });
  } catch (err) {
    console.error('accounting v2 transactions list', err);
    res.status(500).json({ error: 'Tranzaksiyalarni olishda xato yuz berdi.' });
  }
});

router.post('/transactions', (req, res) => {
  try {
    const tx = createFinancialTransaction({
      transactionType: req.body?.transaction_type,
      sourceType: req.body?.source_type,
      amount: req.body?.amount,
      transactionDate: req.body?.transaction_date,
      note: req.body?.note,
      categoryCode: req.body?.category_code,
      actorUserId: req.user?.id || null,
    });
    res.status(201).json({ transaction: tx });
  } catch (err) {
    const message = String(err?.message || '').trim();
    if (message) return res.status(400).json({ error: message });
    console.error('accounting v2 transaction create', err);
    res.status(500).json({ error: 'Tranzaksiyani yaratishda xato yuz berdi.' });
  }
});

router.get('/reports/summary', (req, res) => {
  try {
    const summary = getReportsSummary({
      fromDate: parseOptionalDate(req.query.from),
      toDate: parseOptionalDate(req.query.to),
    });
    res.json(summary);
  } catch (err) {
    console.error('accounting v2 report summary', err);
    res.status(500).json({ error: 'Hisobot ma’lumotlarini olishda xato yuz berdi.' });
  }
});

router.get('/reports/export', (req, res) => {
  try {
    const format = String(req.query.format || 'csv')
      .trim()
      .toLowerCase();
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Hozircha faqat CSV eksport qo‘llab-quvvatlanadi.' });
    }
    const csv = exportTransactionsCsv({
      fromDate: parseOptionalDate(req.query.from),
      toDate: parseOptionalDate(req.query.to),
    });
    const fileName = `myshop-accounting-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err) {
    console.error('accounting v2 report export', err);
    res.status(500).json({ error: 'Eksportda xato yuz berdi.' });
  }
});

router.get('/activity', (req, res) => {
  try {
    const limit = parseIntSafe(req.query.limit, 100);
    const logs = listActivityLogs({ limit });
    res.json({ logs });
  } catch (err) {
    console.error('accounting v2 activity', err);
    res.status(500).json({ error: 'Faollik jurnalini olishda xato yuz berdi.' });
  }
});

router.get('/receipts', (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = parseIntSafe(req.query.limit, 200);
    const receipts = listReceipts({ search, limit });
    res.json({ receipts });
  } catch (err) {
    console.error('accounting v2 receipts list', err);
    res.status(500).json({ error: 'Cheklar ro‘yxatini olishda xato yuz berdi.' });
  }
});

router.get('/receipts/:id', (req, res) => {
  try {
    const id = parseIntSafe(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'Noto‘g‘ri receipt ID.' });
    const receipt = getReceiptById(id);
    if (!receipt) return res.status(404).json({ error: 'Chek topilmadi.' });
    res.json({ receipt });
  } catch (err) {
    console.error('accounting v2 receipt get', err);
    res.status(500).json({ error: 'Chekni olishda xato yuz berdi.' });
  }
});

router.get('/receipts/:id/pdf', (req, res) => {
  try {
    const id = parseIntSafe(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'Noto‘g‘ri receipt ID.' });
    const receipt = getReceiptById(id);
    if (!receipt) return res.status(404).json({ error: 'Chek topilmadi.' });

    const filename = `${receipt.receipt_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      margin: 42,
      size: 'A4',
      info: {
        Title: `MyShop Salary Receipt ${receipt.receipt_number}`,
        Author: 'MyShop Accounting',
      },
    });
    doc.pipe(res);
    doc.fontSize(20).text('MyShop - Ish haqi cheki', { align: 'left' });
    doc.moveDown(0.6);
    doc.fontSize(11).fillColor('#444').text(`Chek raqami: ${receipt.receipt_number}`);
    doc.text(`Berilgan sana: ${receipt.issued_at || '-'}`);
    doc.text(`Xodim: ${receipt.employee_name}`);
    doc.text(`Lavozim: ${receipt.position_title || 'Mas’ul xodim'}`);
    doc.text(`To‘lov turi: ${receipt.cycle_type_uz}`);
    doc.text(`Davr: ${receipt.period_start || '-'} -> ${receipt.period_end || '-'}`);
    doc.moveDown(0.8);
    doc.fontSize(15).fillColor('#111').text(`Summa: ${Number(receipt.payment_amount || 0).toLocaleString('uz-UZ')} so‘m`);
    doc.moveDown(0.8);
    doc.fontSize(11).fillColor('#444').text(`To‘lov usuli: ${receipt.payment_method || 'bank'}`);
    doc.text(`To‘lov vaqti: ${receipt.payment_date || '-'}`);
    if (receipt.payload?.note) {
      doc.moveDown(0.8);
      doc.text(`Izoh: ${receipt.payload.note}`);
    }
    doc.moveDown(2);
    doc.fillColor('#666').fontSize(10).text('Ushbu hujjat MyShop Accounting tizimi tomonidan avtomatik yaratildi.');
    doc.end();
  } catch (err) {
    console.error('accounting v2 receipt pdf', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF yaratishda xato yuz berdi.' });
    }
  }
});

export default router;

