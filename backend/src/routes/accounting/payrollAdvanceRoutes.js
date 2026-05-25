import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import {
  accountingAssignAdvanceRun,
  accountingDistributeAdvanceItem,
  accountingDistributeAllConfirmed,
  createMonthlyAdvanceRun,
  getAdvanceRun,
  listAdvanceItems,
  listAdvanceRuns,
} from '../../services/payrollAdvanceService.js';
import { assertPayrollWriteAccess, payrollAccessErrorResponse } from '../../lib/payrollAccess.js';

const router = Router();

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

router.get('/runs', (req, res) => {
  try {
    const runs = listAdvanceRuns({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
    });
    res.json({ runs });
  } catch (e) {
    console.error('advance runs list', e);
    res.status(500).json({ error: 'Avans oyliklari yuklanmadi.' });
  }
});

router.get('/runs/:id', [param('id').isInt({ min: 1 }), handleValidation], (req, res) => {
  try {
    const data = getAdvanceRun(Number(req.params.id));
    if (!data) return res.status(404).json({ error: 'Topilmadi.' });
    res.json(data);
  } catch (e) {
    console.error('advance run get', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

router.post(
  '/runs/create',
  requirePayrollWrite,
  [
    body('year').optional().isInt({ min: 2020, max: 2100 }),
    body('month').optional().isInt({ min: 1, max: 12 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      const now = new Date();
      const y = req.body.year ? Number(req.body.year) : now.getFullYear();
      const m = req.body.month ? Number(req.body.month) : now.getMonth() + 1;
      const result = createMonthlyAdvanceRun(y, m, req.user.id);
      res.status(result.created ? 201 : 200).json(result);
    } catch (e) {
      console.error('advance run create', e);
      res.status(500).json({ error: 'Avans yaratilmadi.' });
    }
  },
);

router.post(
  '/runs/:id/assign',
  requirePayrollWrite,
  [param('id').isInt({ min: 1 }), handleValidation],
  (req, res) => {
    try {
      const data = accountingAssignAdvanceRun(Number(req.params.id), req.user.id);
      res.json(data);
    } catch (e) {
      if (e?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Topilmadi.' });
      if (e?.message === 'INVALID_STATUS') {
        return res.status(400).json({ error: 'Avval superuser tasdiqlashi kerak.' });
      }
      console.error('advance assign', e);
      res.status(500).json({ error: 'Biriktirilmadi.' });
    }
  },
);

router.get('/items', (req, res) => {
  try {
    const items = listAdvanceItems({
      run_id: req.query.run_id ? Number(req.query.run_id) : undefined,
      status: req.query.status,
    });
    res.json({ items });
  } catch (e) {
    console.error('advance items', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

router.post(
  '/items/:id/distribute',
  requirePayrollWrite,
  [param('id').isInt({ min: 1 }), handleValidation],
  (req, res) => {
    try {
      const item = accountingDistributeAdvanceItem(Number(req.params.id), req.user.id);
      res.json({ item });
    } catch (e) {
      if (e?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Topilmadi.' });
      if (e?.message === 'WORKER_NOT_CONFIRMED') {
        return res.status(400).json({ error: 'Ishchi avansni hali tasdiqlamagan.' });
      }
      if (e?.message === 'NO_WORK_ROLE') {
        return res.status(400).json({ error: 'Sklad ish roli topilmadi — balansga yozib bo‘lmaydi.' });
      }
      console.error('advance distribute', e);
      res.status(500).json({ error: 'Tarqatilmadi.' });
    }
  },
);

router.post(
  '/runs/:id/distribute-confirmed',
  requirePayrollWrite,
  [param('id').isInt({ min: 1 }), handleValidation],
  (req, res) => {
    try {
      const result = accountingDistributeAllConfirmed(Number(req.params.id), req.user.id);
      res.json(result);
    } catch (e) {
      console.error('advance distribute all', e);
      res.status(500).json({ error: 'Tarqatish bajarilmadi.' });
    }
  },
);

export default router;
