import { Router } from 'express';
import { query } from 'express-validator';
import { handleValidation } from '../../middleware/validate.js';
import { listProductsReport, listArchivedProductsReport } from '../../services/productsReportService.js';

const router = Router();

router.get(
  '/',
  [query('limit').optional().isInt({ min: 1, max: 2000 }), query('seller_id').optional().isInt({ min: 1 }), handleValidation],
  (req, res) => {
    try {
      const products = listProductsReport({
        limit: req.query.limit ? Number(req.query.limit) : 500,
        sellerId: req.query.seller_id ? Number(req.query.seller_id) : undefined,
        archived: false,
      });
      res.json({ products, read_only: true });
    } catch (e) {
      console.error('accounting products report', e);
      res.status(500).json({ error: 'Mahsulotlar hisoboti yuklanmadi.' });
    }
  },
);

router.get(
  '/archive',
  [query('limit').optional().isInt({ min: 1, max: 2000 }), query('seller_id').optional().isInt({ min: 1 }), handleValidation],
  (req, res) => {
    try {
      const products = listArchivedProductsReport({
        limit: req.query.limit ? Number(req.query.limit) : 500,
        sellerId: req.query.seller_id ? Number(req.query.seller_id) : undefined,
      });
      res.json({ products, read_only: true });
    } catch (e) {
      console.error('accounting products archive', e);
      res.status(500).json({ error: 'Mahsulotlar arxivi yuklanmadi.' });
    }
  },
);

export default router;
