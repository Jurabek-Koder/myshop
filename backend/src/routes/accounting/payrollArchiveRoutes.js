import { Router } from 'express';
import { query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import { listPayrollArchive } from '../../services/payrollArchiveService.js';

const router = Router();

router.get(
  '/',
  [
    query('year').optional().isInt({ min: 2020, max: 2100 }),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      const data = listPayrollArchive({
        year: req.query.year ? Number(req.query.year) : undefined,
        month: req.query.month ? Number(req.query.month) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 200,
      });
      res.json({ ...data, read_only: true });
    } catch (e) {
      console.error('accounting payroll archive', e);
      res.status(500).json({ error: 'Ish haqi arxivi yuklanmadi.' });
    }
  },
);

export default router;
