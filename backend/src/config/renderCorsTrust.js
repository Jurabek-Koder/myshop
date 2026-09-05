/**
 * Prod + Render va CORS_FRONTEND_ENV bo‘lmasa: *.onrender.com ga avto CORS (middleware).
 * Log uchun ham shu shart.
 */
export function isRenderSubdomainCorsTrustActive() {
  const explicitList =
    Boolean(String(process.env.CORS_ORIGINS || '').trim()) ||
    Boolean(String(process.env.FRONTEND_URL || '').trim());
  const trustOff =
    String(process.env.MYSHOP_CORS_TRUST_ONRENDER || '').trim() === '0' ||
    String(process.env.MYSHOP_CORS_TRUST_ONRENDER || '').trim().toLowerCase() === 'false';
  const onRender = String(process.env.RENDER || '').trim().toLowerCase() === 'true';
  return onRender && process.env.NODE_ENV === 'production' && !explicitList && !trustOff;
}
