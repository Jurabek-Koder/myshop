import React from 'react';

export default function AuthForgotPanel({
  t,
  step,
  forgotIdentifier,
  setForgotIdentifier,
  resetCode,
  setResetCode,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  loginMethod,
  loading,
  error,
  info,
  onRequest,
  onReset,
  onBack,
  fieldsClassName = 'auth-mobile-fields',
  submitClassName = 'auth-mobile-submit',
}) {
  if (step === 'request') {
    return (
      <form className={fieldsClassName} onSubmit={onRequest}>
        <input
          type={loginMethod === 'phone' ? 'tel' : 'text'}
          placeholder={loginMethod === 'phone' ? t.placeholderPhone : t.placeholderEmailLogin}
          value={forgotIdentifier}
          onChange={(e) => setForgotIdentifier(e.target.value)}
          required
          autoComplete={loginMethod === 'phone' ? 'tel' : 'username'}
          inputMode={loginMethod === 'phone' ? 'tel' : 'email'}
        />
        {error ? <p className="auth-split-error">{error}</p> : null}
        {info ? <p className="auth-split-info">{info}</p> : null}
        <button type="submit" className={submitClassName} disabled={loading}>
          {loading ? t.loading : t.submitForgotRequest}
        </button>
        <p className="auth-forgot-back">
          <button type="button" onClick={onBack}>
            {t.backToLogin}
          </button>
        </p>
      </form>
    );
  }

  return (
    <form className={fieldsClassName} onSubmit={onReset}>
      <input
        type="text"
        placeholder={t.placeholderResetCode}
        value={resetCode}
        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
      />
      <input
        type="password"
        placeholder={t.placeholderNewPassword}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder={t.placeholderConfirmPassword}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
      />
      {error ? <p className="auth-split-error">{error}</p> : null}
      {info ? <p className="auth-split-info">{info}</p> : null}
      <button type="submit" className={submitClassName} disabled={loading}>
        {loading ? t.loading : t.submitForgotReset}
      </button>
      <p className="auth-forgot-back">
        <button type="button" onClick={onBack}>
          {t.backToLogin}
        </button>
      </p>
    </form>
  );
}
