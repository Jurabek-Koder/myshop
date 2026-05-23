import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import {
  generateCyclesForMonth,
  getCycleReceipt,
  getPayrollSummary,
  listCycles,
  listPayrollEmployees,
  listPayrollRoleDefaults,
  markCyclePaid,
  syncAllPayrollEmployees,
  syncSuperuserEmployees,
  upsertPayrollEmployee,
  upsertPayrollRoleDefault,
} from '../../services/payrollCycleService.js';
import payrollAdvanceRoutes from './payrollAdvanceRoutes.js';
import {
  assertCanEditPayrollEmployee,
  assertCanEditPayrollRoleDefault,
  assertPayrollWriteAccess,
  payrollAccessErrorResponse,
} from '../../lib/payrollAccess.js';

const router = Router();
router.use('/advances', payrollAdvanceRoutes);

function requirePayrollWrite(req, res, next) {
  try {
    assertPayrollWriteAccess(req.user);
    next();
  } catch (e) {
    const handled = payrollAccessErrorResponse(res, e);
    if (handled) return handled;
    next(e);
  }
}

const ymQuery = [
  query('year').optional().isInt({ min: 2020, max: 2100 }),
  query('month').optional().isInt({ min: 1, max: 12 }),
  handleValidation,
];

router.get('/employees', (req, res) => {
  try {
    res.json({ employees: listPayrollEmployees() });
  } catch (e) {
    console.error('payroll employees list', e);
    res.status(500).json({ error: 'Xodimlar yuklanmadi.' });
  }
});

router.get('/role-defaults', (req, res) => {
  try {
    res.json({ role_defaults: listPayrollRoleDefaults() });
  } catch (e) {
    console.error('payroll role defaults list', e);
    res.status(500).json({ error: 'Rol standartlari yuklanmadi.' });
  }
});

router.put(
  '/role-defaults',
  requirePayrollWrite,
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
      console.error('payroll role default upsert', e);
      res.status(500).json({ error: 'Saqlanmadi.' });
    }
  },
);

router.post('/employees/sync-all', requirePayrollWrite, (req, res) => {
  try {
    const result = syncAllPayrollEmployees(req.user.id);
    res.json(result);
  } catch (e) {
    console.error('payroll sync all', e);
    res.status(500).json({ error: 'Sinxronlash bajarilmadi.' });
  }
});

router.post('/employees/sync-superusers', requirePayrollWrite, (req, res) => {
  try {
    const result = syncSuperuserEmployees(req.user.id);
    res.json(result);
  } catch (e) {
    console.error('payroll sync superusers', e);
    res.status(500).json({ error: 'Sinxronlash bajarilmadi.' });
  }
});

router.post(
  '/employees',
  requirePayrollWrite,
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
        return res.status(400).json({ error: 'Bu rol uchun ish haqi belgilanmaydi (masalan mijoz).' });
      }
      if (e?.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
      if (e?.message === 'WORK_ROLE_NOT_FOUND') return res.status(404).json({ error: 'Ish roli topilmadi.' });
      if (e?.message === 'INVALID_EMPLOYEE_REF') {
        return res.status(400).json({ error: 'Bitta xodim: user_id yoki work_role_id.' });
      }
      if (e?.message === 'DUPLICATE_IDENTITY') {
        return res.status(409).json({ error: 'Bu xodim (ism/login/rol) allaqachon boshqa yozuvda mavjud.' });
      }
      console.error('payroll employee upsert', e);
      res.status(500).json({ error: 'Saqlanmadi.' });
    }
  },
);

router.patch(
  '/employees/:userId',
  requirePayrollWrite,
  [
    param('userId').isInt({ min: 1 }),
    body('monthly_salary_uzs').optional().isFloat({ min: 0 }),
    body('advance_percent').optional().isFloat({ min: 0.1, max: 0.9 }),
    body('advance_due_day').optional().isInt({ min: 1, max: 28 }),
    body('balance_due_day').optional().isInt({ min: 0, max: 28 }),
    body('active').optional().isBoolean(),
    body('notes').optional().trim().isLength({ max: 2000 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      assertCanEditPayrollEmployee(req.user, { user_id: Number(req.params.userId) });
      const row = upsertPayrollEmployee({ ...req.body, user_id: Number(req.params.userId) }, req.user.id);
      res.json({ employee: row });
    } catch (e) {
      const handled = payrollAccessErrorResponse(res, e);
      if (handled) return handled;
      console.error('payroll employee patch', e);
      res.status(500).json({ error: 'Yangilanmadi.' });
    }
  },
);

router.get('/cycles', ymQuery, (req, res) => {
  try {
    const cycles = listCycles({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
      status: req.query.status,
      employeeId: req.query.employee_id ? Number(req.query.employee_id) : undefined,
    });
    res.json({ cycles });
  } catch (e) {
    console.error('payroll cycles list', e);
    res.status(500).json({ error: 'To‘lovlar yuklanmadi.' });
  }
});

router.post(
  '/cycles/generate',
  requirePayrollWrite,
  [
    body('year').isInt({ min: 2020, max: 2100 }),
    body('month').isInt({ min: 1, max: 12 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      const result = generateCyclesForMonth(req.body.year, req.body.month, req.user.id);
      res.status(201).json(result);
    } catch (e) {
      console.error('payroll cycles generate', e);
      res.status(500).json({ error: 'Tsikllar yaratilmadi.' });
    }
  },
);

router.get('/cycles/summary', ymQuery, (req, res) => {
  try {
    const y = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const m = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
    res.json({ summary: getPayrollSummary(y, m) });
  } catch (e) {
    console.error('payroll summary', e);
    res.status(500).json({ error: 'Xulosa yuklanmadi.' });
  }
});

router.post('/cycles/:id/mark-paid', requirePayrollWrite, [param('id').isInt({ min: 1 }), handleValidation], (req, res) => {
  try {
    const row = markCyclePaid(Number(req.params.id), req.user.id, {
      receipt_ref: req.body?.receipt_ref,
      notes: req.body?.notes,
    });
    res.json({ cycle: row });
  } catch (e) {
    if (e?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Topilmadi.' });
    if (e?.message === 'ALREADY_PAID') return res.status(400).json({ error: 'Allaqachon to‘langan.' });
    if (e?.message === 'BALANCE_NOT_ZERO') {
      return res.status(400).json({ error: 'Hisob balansi 0 emas — avval balansni yoping, keyin to‘lang.' });
    }
    if (e?.message === 'MONTHLY_ALREADY_PAID') {
      return res.status(400).json({ error: 'Bu oy uchun oylik ish haqi allaqachon to‘langan.' });
    }
    console.error('payroll mark paid', e);
    res.status(500).json({ error: 'Bajarilmadi.' });
  }
});

router.get('/cycles/:id/receipt', [param('id').isInt({ min: 1 }), handleValidation], (req, res) => {
  try {
    res.json({ receipt: getCycleReceipt(Number(req.params.id)) });
  } catch (e) {
    if (e?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Topilmadi.' });
    res.status(500).json({ error: 'Kvitansiya yuklanmadi.' });
  }
});

export default router;
