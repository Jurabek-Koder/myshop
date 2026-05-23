import { body, param, query } from 'express-validator';
import { handleValidation } from './validate.js';

const EXPENSE_CATEGORIES = ['reklama', 'oylik', 'dostavka', 'soliq', 'boshqa'];

export const expenseCreateValidation = [
  body('title').trim().notEmpty().isLength({ max: 500 }).escape(),
  body('amount').isFloat({ gt: 0 }).withMessage('amount musbat son.'),
  body('category').trim().isIn(EXPENSE_CATEGORIES).withMessage(`category: ${EXPENSE_CATEGORIES.join(', ')}`),
  body('comment').optional().trim().isLength({ max: 2000 }),
  handleValidation,
];

export const expensePatchValidation = [
  body('title').optional().trim().notEmpty().isLength({ max: 500 }).escape(),
  body('amount').optional().isFloat({ gt: 0 }),
  body('category').optional().trim().isIn(EXPENSE_CATEGORIES),
  body('comment').optional().trim().isLength({ max: 2000 }),
  handleValidation,
];

export const expenseIdParam = [param('id').isInt({ min: 1 }).withMessage('Noto‘g‘ri ID.'), handleValidation];

export const cashboxIdParam = [param('id').isInt({ min: 1 }).withMessage('Noto‘g‘ri kassa ID.'), handleValidation];

export const cashboxMovementValidation = [
  body('amount').isFloat({ gt: 0 }),
  body('direction').trim().isIn(['in', 'out']),
  body('comment').optional().trim().isLength({ max: 2000 }),
  body('ref_type').optional().trim().isLength({ max: 80 }),
  body('ref_id').optional().isInt({ min: 1 }),
  handleValidation,
];

const isoDate = (field) =>
  query(field)
    .optional()
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(`${field}: YYYY-MM-DD formatida bo‘lishi kerak.`);

export const payrollListQuery = [isoDate('from'), isoDate('to'), query('status').optional().trim().isLength({ max: 32 }), handleValidation];

export const payrollCreateBody = [
  body('employee_name').trim().notEmpty().isLength({ max: 200 }).escape(),
  body('role_label').optional().trim().isLength({ max: 120 }).escape(),
  body('amount').isFloat({ gt: 0 }).withMessage('amount musbat son bo‘lishi kerak.'),
  body('period_start').trim().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('period_start: YYYY-MM-DD'),
  body('period_end').trim().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('period_end: YYYY-MM-DD'),
  body('status').optional().isIn(['draft', 'approved', 'paid']).withMessage('status: draft, approved yoki paid.'),
  body('comment').optional().trim().isLength({ max: 2000 }),
  handleValidation,
];

export const payrollIdParam = [param('id').isInt({ min: 1 }).withMessage('Noto‘g‘ri ID.'), handleValidation];

export const payrollPatchBody = [
  body('employee_name').optional().trim().notEmpty().isLength({ max: 200 }).escape(),
  body('role_label').optional().trim().isLength({ max: 120 }).escape(),
  body('amount').optional().isFloat({ gt: 0 }),
  body('period_start').optional().trim().matches(/^\d{4}-\d{2}-\d{2}$/),
  body('period_end').optional().trim().matches(/^\d{4}-\d{2}-\d{2}$/),
  body('status').optional().isIn(['draft', 'approved', 'paid']),
  body('comment').optional().trim().isLength({ max: 2000 }),
  handleValidation,
];

export const courierStaffIdParam = [
  param('staffId').isInt({ min: 1 }).withMessage('Noto‘g‘ri kuryer (staff) ID.'),
  handleValidation,
];

export const courierAdjustBody = [
  body('amount').isFloat({ gt: 0 }).withMessage('amount musbat son.'),
  body('type').trim().isIn(['credit', 'debit']).withMessage('type: credit yoki debit.'),
  body('comment').optional().trim().isLength({ max: 2000 }),
  handleValidation,
];

export const reportGenerateBody = [
  body('report_type').trim().isIn(['monthly', 'range', 'summary']).withMessage('report_type: monthly, range yoki summary.'),
  body('title').trim().notEmpty().isLength({ max: 240 }).escape(),
  body('period_start').trim().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('period_start: YYYY-MM-DD'),
  body('period_end').trim().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('period_end: YYYY-MM-DD'),
  handleValidation,
];

export const reportIdParam = [param('id').isInt({ min: 1 }).withMessage('Noto‘g‘ri ID.'), handleValidation];

export const financeLogsQuery = [
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('entity_type').optional().trim().isLength({ max: 80 }),
  handleValidation,
];
