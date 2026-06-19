import { Router } from 'express';
import { body, query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import {
  getPayrollSummary,
  listCycles,
  listPayrollEmployees,
  listPayrollRoleDefaults,
  syncAllPayrollEmployees,
  upsertPayrollEmployee,
  upsertPayrollRoleDefault,
} from '../../services/payrollCycleService.js';
import { listAdvanceRuns } from '../../services/payrollAdvanceService.js';
import {
  assertCanEditPayrollEmployee,
  assertCanEditPayrollRoleDefault,
  payrollAccessErrorResponse,
} from '../../lib/payrollAccess.js';

const router = Router();

const ymQuery = [
  query('year').optional().isInt({ min: 2020, max: 2100 }),
  query('month').optional().isInt({ min: 1, max: 12 }),
  handleValidation,
];

router.get('/role-defaults', (_req, res) => {
  try {
    res.json({ role_defaults: listPayrollRoleDefaults() });
  } catch (e) {
    console.error('admin payroll oversight role-defaults', e);
    res.status(500).json({ error: 'Rol standartlari yuklanmadi.' });
  }
});

router.put(
  '/role-defaults',
  [
    body('role_source').isIn(['system', 'work']),
    body('role_key').optional().trim().isLength({ min: 1, max: 80 }),
    body('role_label').optional().trim().isLength({ min: 1, max: 120 }),
    body('monthly_salary_uzs').isFloat({ min: 0 }),
    body('advance_percent').optional().isFloat({ min: 0.1, max: 0.9 }),
    body('advance_due_day').optional().isInt({ min: 1, max: 28 }),
    body('balance_due_day').optional().isInt({ min: 0, max: 28 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      assertCanEditPayrollRoleDefault(req.user, req.body.role_key || req.body.role_label);
      const row = upsertPayrollRoleDefault(req.body, req.user.id);
      res.json({ role_default: row });
    } catch (e) {
      const handled = payrollAccessErrorResponse(res, e);
      if (handled) return handled;
      if (e?.message === 'INVALID_ROLE_SOURCE' || e?.message === 'INVALID_ROLE_KEY') {
        return res.status(400).json({ error: 'Rol ma’lumoti noto‘g‘ri.' });
      }
      console.error('admin payroll oversight role-default upsert', e);
      res.status(500).json({ error: 'Saqlanmadi.' });
    }
  },
);

router.get('/employees', (_req, res) => {
  try {
    res.json({ employees: listPayrollEmployees() });
  } catch (e) {
    console.error('admin payroll oversight employees', e);
    res.status(500).json({ error: 'Xodimlar yuklanmadi.' });
  }
});

router.post('/employees/sync-all', (req, res) => {
  try {
    const result = syncAllPayrollEmployees(req.user.id);
    res.json(result);
  } catch (e) {
    const handled = payrollAccessErrorResponse(res, e);
    if (handled) return handled;
    console.error('admin payroll oversight sync all', e);
    res.status(500).json({ error: 'Sinxronlash bajarilmadi.' });
  }
});

router.post(
  '/employees',
  [
    body('user_id').optional().isInt({ min: 1 }),
    body('work_role_id').optional().isInt({ min: 1 }),
    body('monthly_salary_uzs').isFloat({ min: 0 }),
    body('advance_percent').optional().isFloat({ min: 0.1, max: 0.9 }),
    body('advance_due_day').optional().isInt({ min: 1, max: 28 }),
    body('balance_due_day').optional().isInt({ min: 0, max: 28 }),
    body('active').optional().isBoolean(),
    body('notes').optional().trim().isLength({ max: 2000 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      if (!req.body.user_id && !req.body.work_role_id) {
        return res.status(400).json({ error: 'user_id yoki work_role_id kerak.' });
      }
      assertCanEditPayrollEmployee(req.user, req.body);
      const row = upsertPayrollEmployee(req.body, req.user.id);
      res.status(201).json({ employee: row });
    } catch (e) {
      const handled = payrollAccessErrorResponse(res, e);
      if (handled) return handled;
      if (e?.message === 'NOT_PAYROLL_ELIGIBLE') {
        return res.status(400).json({ error: 'Bu rol uchun ish haqi belgilanmaydi.' });
      }
      if (e?.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
      if (e?.message === 'WORK_ROLE_NOT_FOUND') return res.status(404).json({ error: 'Ish roli topilmadi.' });
      if (e?.message === 'INVALID_EMPLOYEE_REF') {
        return res.status(400).json({ error: 'Bitta xodim: user_id yoki work_role_id.' });
      }
      if (e?.message === 'DUPLICATE_IDENTITY') {
        return res.status(409).json({ error: 'Bu xodim allaqachon boshqa yozuvda mavjud.' });
      }
      console.error('admin payroll oversight employee upsert', e);
      res.status(500).json({ error: 'Saqlanmadi.' });
    }
  },
);

router.get('/cycles', ymQuery, (req, res) => {
  try {
    const cycles = listCycles({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
    });
    res.json({ cycles });
  } catch (e) {
    console.error('admin payroll oversight cycles', e);
    res.status(500).json({ error: 'To‘lovlar yuklanmadi.' });
  }
});

router.get('/summary', ymQuery, (req, res) => {
  try {
    const y = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const m = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    res.json({ summary: getPayrollSummary(y, m) });
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
    res.json({ runs });
  } catch (e) {
    console.error('admin payroll oversight advance-runs', e);
    res.status(500).json({ error: 'Avans oyliklari yuklanmadi.' });
  }
});

export default router;
