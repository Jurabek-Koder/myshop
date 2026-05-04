import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { security } from './config/security.js';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const corsMiddleware = cors({
  origin: security.cors.origins,
  credentials: security.cors.credentials,
  methods: security.cors.methods,
  allowedHeaders: security.cors.allowedHeaders,
});

export const globalRateLimiter = rateLimit(security.rateLimit);

export const authRateLimiter = rateLimit(security.authRateLimit);

export const sanitizeMiddleware = mongoSanitize();

export const bodyParserConfig = {
  limit: security.bodyLimit,
};
