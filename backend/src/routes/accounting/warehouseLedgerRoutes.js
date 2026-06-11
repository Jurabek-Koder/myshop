import { Router } from 'express';
import { query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import {
  listWarehouseLedgerEvents,
  listWarehouseLedgerFeed,
} from '../../services/warehouseLedgerService.js';

const router = Router();

/** Yangi harakatlar (polling): ?since_id=123 */
router.get(
  '/events',
  [
    query('since_id').optional().isInt({ min: 0 }),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    handleValidation,
  ],
  (req, res) => {
    try {
      const events = listWarehouseLedgerEvents({
        sinceId: req.query.since_id ? Number(req.query.since_id) : 0,
        limit: req.query.limit ? Number(req.query.limit) : 100,
      });
      res.json({ events, read_only: true });
    } catch (e) {
      console.error('accounting warehouse ledger events', e);
      res.status(500).json({ error: 'Kirim/chiqim jadvali yuklanmadi.' });
    }
  },
);

/** Oxirgi harakatlar (boshlang‘ich yuklash) */
router.get(
  '/feed',
  [query('limit').optional().isInt({ min: 1, max: 500 }), handleValidation],
  (req, res) => {
    try {
      const events = listWarehouseLedgerFeed({
        limit: req.query.limit ? Number(req.query.limit) : 80,
      });
      res.json({ events, read_only: true });
    } catch (e) {
      console.error('accounting warehouse ledger feed', e);
      res.status(500).json({ error: 'Kirim/chiqim jadvali yuklanmadi.' });
    }
  },
);

export default router;
