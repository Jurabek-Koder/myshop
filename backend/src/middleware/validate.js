import { body, param, validationResult } from 'express-validator';
import { security } from '../config/security.js';

export function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    const parts = errors.array().map((e) => e.msg).filter(Boolean);
    const error = parts.length ? parts.join(' ') : 'Validatsiya xatosi.';
    return res.status(400).json({ error, details });
  }
  next();
}

const passwordSchema = (field = 'password') =>
  body(field)
    .trim()
    .isLength({ min: security.password.minLength })
    .withMessage(`Kamida ${security.password.minLength} belgi`)
    .matches(security.password.requireUppercase ? /[A-Z]/ : /.*/)
    .withMessage('Kamida bitta bosh harf')
    .matches(security.password.requireNumber ? /\d/ : /.*/)
    .withMessage('Kamida bitta raqam')
    .matches(security.password.requireSpecial ? /[!@#$%^&*(),.?":{}|<>]/ : /.*/)
    .withMessage('Kamida bitta maxsus belgi');

export const registerValidation = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Yaroqli email kiriting'),
  body('full_name').trim().notEmpty().escape().isLength({ max: 200 }).withMessage('Ism kerak'),
  passwordSchema(),
  handleValidation,
];

export const loginValidation = [
  body('email').trim().notEmpty().withMessage('Email yoki login kerak'),
  body('password').notEmpty().withMessage('Parol kerak'),
  handleValidation,
];

export const productValidation = [
  body('name_uz').trim().notEmpty().escape().isLength({ max: 300 }),
  body('price').isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  body('category').optional().trim().escape().isLength({ max: 100 }),
  handleValidation,
];

export const orderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Kamida bitta mahsulot kerak'),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  body('shipping_address').optional().trim().escape(),
  body('contact_phone').optional().trim().escape(),
  handleValidation,
];

export const idParam = [param('id').isInt({ min: 1 }).withMessage('Noto\'g\'ri ID'), handleValidation];
