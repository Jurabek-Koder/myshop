import { param, body, validationResult } from 'express-validator';
import { createStructuredError } from '../utils/errorHandling.js';

const sendErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(createStructuredError('VALIDATION_ERROR', 'Invalid input provided.', {
      details: errors.array(),
    }));
  }
  next();
};

export const validateIdParam = [
  param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer.'),
  sendErrors,
];

export const validateItemIdParam = [
  param('itemId').isInt({ min: 1 }).withMessage('Item ID must be a positive integer.'),
  sendErrors,
];

export const validateUpdateStatus = [
  param('id').isInt({ min: 1 }).withMessage('Order ID must be a positive integer.'),
  body('status').trim().notEmpty().withMessage('Status is required.'),
  sendErrors,
];

export const validateUpdateItemHomeLeft = [
  param('id').isInt({ min: 1 }).withMessage('Order ID must be a positive integer.'),
  param('itemId').isInt({ min: 1 }).withMessage('Item ID must be a positive integer.'),
  body('home_left_in_courier').isBoolean().withMessage('home_left_in_courier must be a boolean (true/false).'),
  sendErrors,
];

export const validateCallLog = [
  body('orderId').isInt({ min: 1 }).withMessage('Order ID must be a positive integer.'),
  body('note').optional().trim().isLength({ max: 500 }),
  sendErrors,
];