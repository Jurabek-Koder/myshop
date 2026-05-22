import { Router } from 'express';
import { param } from 'express-validator';
import { authRequired } from '../middleware/auth.js';
import { handleValidation } from '../middleware/validate.js';
import {
  listPendingAdvancesForUser,
  workerConfirmAdvanceItem,
} from '../services/payrollAdvanceService.js';

const router = Router();
router.use(authRequired);

router.get('/pending', (req, res) => {
  try {
    const items = listPendingAdvancesForUser(req.user);
    res.json({ items });
  } catch (e) {
    console.error('worker advance pending', e);
    res.status(500).json({ error: 'Yuklanmadi.' });
  }
});

router.post(
  '/:id/confirm',
  [param('id').isInt({ min: 1 }), handleValidation],
  (req, res) => {
    try {
      const item = workerConfirmAdvanceItem(Number(req.params.id), req.user);
      res.json({ item });
    } catch (e) {
      if (e?.message === 'NOT_FOUND') return res.status(404).json({ error: 'Topilmadi.' });
      if (e?.message === 'NO_PAYROLL_EMPLOYEE') {
        return res.status(404).json({ error: 'Ish haqi ro‘yxatida topilmadingiz.' });
      }
      if (e?.message === 'FORBIDDEN') return res.status(403).json({ error: 'Ruxsat yo‘q.' });
      if (e?.message === 'INVALID_STATUS') {
        return res.status(400).json({ error: 'Bu avans hozir tasdiqlanmaydi.' });
      }
      console.error('worker advance confirm', e);
      res.status(500).json({ error: 'Tasdiqlanmadi.' });
    }
  },
);

export default router;
