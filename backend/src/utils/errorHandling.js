export function createStructuredError(code, message, extra = {}) {
  return {
    code: String(code || 'ERROR'),
    error: String(message || 'Error'),
    message: String(message || 'Error'),
    ...extra,
  };
}
