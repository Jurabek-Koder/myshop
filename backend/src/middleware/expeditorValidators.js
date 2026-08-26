import { param, body, query, validationResult } from 'express-validator';

const sendErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input provided.',
        details: errors.array(),
      },
    });
  }
  next();
};

export const validateIdParam = [
  param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer.'),
  sendErrors,
];

export const validateAssignCourier = [
  param('id').isInt({ min: 1 }).withMessage('Order ID must be a positive integer.'),
  body('courier_staff_id').isInt({ min: 1 }).withMessage('Courier staff ID must be a positive integer.'),
  sendErrors,
];

export const validateUnassignCourier = [
  param('id').isInt({ min: 1 }).withMessage('Order ID must be a positive integer.'),
  body('courier_staff_id').isInt({ min: 1 }).withMessage('Courier staff ID must be a positive integer.'),
  sendErrors,
];

export const validateCloseHandoffList = [
  body('courier_staff_id').isInt({ min: 1 }).withMessage('Courier staff ID must be a positive integer.'),
  body('viloyat_id').optional().isString().trim().notEmpty().withMessage('Region ID must be a non-empty string if provided.'),
  sendErrors,
];

export const validateCourierIdQuery = [
  query('courier_staff_id').isInt({ min: 1 }).withMessage('Courier staff ID must be a positive integer.'),
  sendErrors,
];

export const validateIdAndCourierIdQuery = [
  query('courier_staff_id').isInt({ min: 1 }).withMessage('Courier staff ID must be a positive integer.'),
  query('viloyat_id').optional().isString().trim().notEmpty().withMessage('Region ID must be a non-empty string if provided.'),
  sendErrors,
];