import { Router } from 'express';
import { query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import {
  getPayrollSummary,
  listCycles,
  listPayrollEmployees,
  listPayrollRoleDefaults,
} from '../../services/payrollCycleService.js';
import { listAdvanceRuns } from '../../services/payrollAdvanceService.js';

const router = Router();

const ymQuery = [
  query('year').optional().isInt({ min: 2020, max: 2100 }),
  query('month').optional().isInt({ min: 1, max: 12 }),
  handleValidation,
];

/** Superuser — buxgalter ish haqi faqat kuzatuv (o‘qish) */
router.get('/role-defaults', (_req, res) => {
  try {
    res.json({ role_defaults: listPayrollRoleDefaults(), read_only: true });
  } catch (e) {
    console.error('admin payroll oversight role-defaults', e);
    res.status(500).json({ error: 'Rol standartlari yuklanmadi.' });
  }
});

router.get('/employees', (_req, res) => {
  try {
    res.json({ employees: listPayrollEmployees(), read_only: true });
  } catch (e) {
    console.error('admin payroll oversight employees', e);
    res.status(500).json({ error: 'Xodimlar yuklanmadi.' });
  }
});

router.get('/cycles', ymQuery, (req, res) => {
  try {
    const cycles = listCycles({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
    });
    res.json({ cycles, read_only: true });
  } catch (e) {
    console.error('admin payroll oversight cycles', e);
    res.status(500).json({ error: 'To‘lovlar yuklanmadi.' });
  }
});

router.get('/summary', ymQuery, (req, res) => {
  try {
    const y = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const m = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    res.json({ summary: getPayrollSummary(y, m), read_only: true });
  } catch (e) {
    console.error('admin payroll oversight summary', e);
    res.status(500).json({ error: 'Xulosa yuklanmadi.' });
  }
});

router.get('/advance-runs', ymQuery, (req, res) => {
  try {
    const runs = listAdvanceRuns({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
    });
    res.json({ runs, read_only: true });
  } catch (e) {
    console.error('admin payroll oversight advance-runs', e);
    res.status(500).json({ error: 'Avans oyliklari yuklanmadi.' });
  }
});

export default router;
