/**
 * Bank darajasidagi xavfsizlik sozlamalari
 * DDoS, XSS, CSRF, injection va tarmoq hujumlariga qarshi
 */

export const security = {
  // Rate limit: umumiy (DDoS himoyasi) — kundalik foydalanishda tez-tez to'g'rilanmasin
  rateLimit: {
    windowMs: 15 * 60 * 1000,   // 15 daqiqa
    max: 1200,                   // 1200 so'rov / 15 min (oldingi 300)
    message: { error: 'Juda ko\'p so\'rov. Keyinroq urinib ko\'ring.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
  },
  // Login/register — odatiy foydalanishda tez-tez bloklanmasin
  authRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: { error: 'Kirish urinishlari cheklangan. 15 daqiqadan keyin qaytaring.' },
  },
  // Parol tiklash / kritik amallar
  strictRateLimit: {
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Amal vaqtiinchalik bloklangan.' },
  },
  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'CHANGE_IN_PRODUCTION_MIN_32_CHARS!!',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'CHANGE_REFRESH_IN_PRODUCTION_32!!',
    accessExpiry: '15m',
    refreshExpiry: '7d',
    issuer: 'myshop-api',
    audience: 'myshop-client',
  },
  // CORS: prod — ro‘yxat; dev — `true` (so‘rov kelgan Origin qaytariladi) — 192.168... yoki boshqa port bilan ham kirish ishlaydi
  cors: {
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : process.env.NODE_ENV === 'production'
        ? ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175', 'http://localhost:5176', 'http://127.0.0.1:5176', 'http://localhost:5177', 'http://127.0.0.1:5177']
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-App-Secret-Key'],
  },
  // Request body hajmi (oversize DDoS qarshisi)
  bodyLimit: '30mb',
  // Parol talablari
  password: {
    minLength: 8,
    requireUppercase: true,
    requireNumber: true,
    requireSpecial: true,
  },
};
