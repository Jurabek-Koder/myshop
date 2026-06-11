import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePickerUiSettings } from '../context/PickerUiSettingsContext';
import SocialAuthButtons from '../components/auth/SocialAuthButtons.jsx';
import AuthLangSelect from '../components/auth/AuthLangSelect.jsx';
import AuthForgotPanel from '../components/auth/AuthForgotPanel.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { AUTH_I18N } from '../i18n/authI18n.js';
import {
  getRememberedLogin,
  normalizeLoginIdentifier,
  REMEMBERED_LOGIN_KEY,
  resolveReturnTarget,
  roleDefaultPath,
} from '../utils/authRedirect.js';
import './AuthPage.css';

export default function AuthPage({ initialMode = 'login' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, socialAuth, retrySession, requestPasswordReset, resetPasswordWithToken } = useAuth();
  const { locale, setLocale } = usePickerUiSettings();
  const t = useMemo(() => AUTH_I18N[locale] || AUTH_I18N.uz, [locale]);

  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(() => getRememberedLogin());
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loginMethod, setLoginMethod] = useState('email');
  const [forgotStep, setForgotStep] = useState(null);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const from = typeof location.state?.from === 'string' ? location.state.from : '';

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('oauth') === '1') {
      retrySession?.()
        .then(() => navigate('/', { replace: true }))
        .catch(() => {});
    }
    const oauthErr = params.get('oauth_error');
    if (oauthErr) setError(decodeURIComponent(oauthErr));
  }, [location.search, navigate, retrySession]);

  const loginIdentifier = normalizeLoginIdentifier(email, loginMethod);

  const afterAuth = (data, savedLogin = loginIdentifier) => {
    try {
      if (savedLogin.trim()) localStorage.setItem(REMEMBERED_LOGIN_KEY, savedLogin.trim());
    } catch {}
    const target = resolveReturnTarget(from, data?.user);
    navigate(target || roleDefaultPath(data?.user), { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await login(loginIdentifier, password, { rememberDevice });
      afterAuth(data, loginIdentifier);
    } catch (err) {
      setError(err.message || 'Kirish xatosi');
    } finally {
      setLoading(false);
    }
  };

  const switchLoginMethod = (method) => {
    setLoginMethod(method);
    setError('');
    setInfo('');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(email, password, fullName, { rememberDevice });
      afterAuth(data, email.trim());
    } catch (err) {
      setError(err.message || "Ro'yxatdan o'tish xatosi");
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider, payload) => {
    setError('');
    setLoading(true);
    try {
      const data = await socialAuth(provider, payload, { rememberDevice });
      afterAuth(data, email.trim());
    } catch (err) {
      setError(err.message || 'Ijtimoiy tarmoq orqali kirish xatosi');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setError('');
    setInfo('');
    setPassword('');
    setForgotStep(null);
    navigate(next === 'register' ? '/register' : '/login', { replace: true, state: location.state });
  };

  const openForgotPassword = () => {
    setForgotStep('request');
    setForgotIdentifier(normalizeLoginIdentifier(email, loginMethod));
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setInfo('');
  };

  const closeForgotPassword = () => {
    setForgotStep(null);
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setInfo('');
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const identifier = normalizeLoginIdentifier(forgotIdentifier, loginMethod);
      const data = await requestPasswordReset(identifier);
      if (data?.reset_token) setResetCode(String(data.reset_token));
      setInfo(data?.message || t.forgotCodeSent);
      setForgotStep('reset');
    } catch (err) {
      setError(err.message || 'So\'rov bajarilmadi');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (newPassword !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const identifier = normalizeLoginIdentifier(forgotIdentifier, loginMethod);
      const data = await resetPasswordWithToken(identifier, resetCode, newPassword);
      setEmail(identifier);
      setPassword('');
      closeForgotPassword();
      setInfo(data?.message || t.resetSuccess);
    } catch (err) {
      setError(err.message || 'Parol yangilanmadi');
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div className="auth-split-page">
      <div className="auth-mobile-only">
        <header className="auth-mobile-topbar">
          <Link to="/" className="auth-mobile-logo">
            MyShop
          </Link>
          <div className="auth-mobile-topbar-actions">
            <AuthLangSelect value={locale} onChange={setLocale} ariaLabel={t.langAria} />
            <ThemeToggle
              className="auth-mobile-theme"
              ariaSun={t.themeSunAria}
              ariaMoon={t.themeMoonAria}
            />
          </div>
        </header>

        <main className="auth-mobile-body">
          <h1 className="auth-mobile-title">
            {isRegister ? t.registerTitle : forgotStep ? t.forgotTitle : t.loginTitle}
          </h1>
          <p className="auth-mobile-lead">
            {isRegister
              ? t.registerLead
              : forgotStep
                ? forgotStep === 'request'
                  ? t.forgotLeadRequest
                  : t.forgotLeadReset
                : t.loginLead}
          </p>

          {isRegister ? (
            <>
              <SocialAuthButtons
                disabled={loading}
                rememberDevice={rememberDevice}
                onSuccess={handleSocial}
                onError={setError}
              />
              <p className="auth-mobile-or">{t.registerOr}</p>
              <form className="auth-mobile-fields" onSubmit={handleRegister}>
                <input
                  type="text"
                  placeholder={t.placeholderName}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
                <input
                  type="email"
                  placeholder={t.placeholderEmail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <input
                  type="password"
                  placeholder={t.placeholderPassword}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <div className="auth-mobile-options">
                  <label className="auth-mobile-remember">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <span>{t.remember}</span>
                  </label>
                </div>
                {error ? <p className="auth-mobile-error">{error}</p> : null}
                {info ? <p className="auth-mobile-info">{info}</p> : null}
                <button type="submit" className="auth-mobile-submit" disabled={loading}>
                  {loading ? t.loading : t.submitRegister}
                </button>
                <p className="auth-mobile-switch">
                  {t.hasAccount}{' '}
                  <button type="button" onClick={() => switchMode('login')}>{t.goLogin}</button>
                </p>
              </form>
            </>
          ) : forgotStep ? (
            <AuthForgotPanel
              t={t}
              step={forgotStep}
              forgotIdentifier={forgotIdentifier}
              setForgotIdentifier={setForgotIdentifier}
              resetCode={resetCode}
              setResetCode={setResetCode}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              loginMethod={loginMethod}
              loading={loading}
              error={error}
              info={info}
              onRequest={handleForgotRequest}
              onReset={handleForgotReset}
              onBack={closeForgotPassword}
              fieldsClassName="auth-mobile-fields"
              submitClassName="auth-mobile-submit"
            />
          ) : (
            <>
              <div className="auth-login-tabs" role="tablist" aria-label={t.tabsAria}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginMethod === 'email'}
                  className={loginMethod === 'email' ? 'is-active' : ''}
                  onClick={() => switchLoginMethod('email')}
                >
                  {t.tabEmail}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginMethod === 'phone'}
                  className={loginMethod === 'phone' ? 'is-active' : ''}
                  onClick={() => switchLoginMethod('phone')}
                >
                  {t.tabPhone}
                </button>
              </div>
              <form className="auth-mobile-fields" onSubmit={handleLogin}>
                <input
                  type={loginMethod === 'phone' ? 'tel' : 'text'}
                  placeholder={loginMethod === 'phone' ? t.placeholderPhone : t.placeholderEmailLogin}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete={loginMethod === 'phone' ? 'tel' : 'username'}
                  inputMode={loginMethod === 'phone' ? 'tel' : 'email'}
                />
                <input
                  type="password"
                  placeholder={t.placeholderPassword}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <div className="auth-mobile-options">
                  <label className="auth-mobile-remember">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <span>{t.remember}</span>
                  </label>
                  <button type="button" className="auth-mobile-forgot" onClick={openForgotPassword}>
                    {t.forgotPassword}
                  </button>
                </div>
                {error ? <p className="auth-mobile-error">{error}</p> : null}
                {info ? <p className="auth-mobile-info">{info}</p> : null}
                <button type="submit" className="auth-mobile-submit" disabled={loading}>
                  {loading ? t.loading : t.submitLogin}
                </button>
                <p className="auth-mobile-switch">
                  {t.noAccount}{' '}
                  <button type="button" onClick={() => switchMode('register')}>{t.goRegister}</button>
                </p>
              </form>
            </>
          )}
        </main>
      </div>

      <Link to="/" className="auth-split-back auth-desktop-only">
        {t.backHome}
      </Link>

      <div className="auth-split-center auth-desktop-only">
      <div className="auth-split-layout">
      <div className="auth-split-card" data-mode={mode}>
        <aside className="auth-split-brand">
          <div className="auth-split-brand-inner">
            {isRegister ? (
              <>
                <h2>{t.brandRegisterTitle}</h2>
                <p>{t.brandRegisterDesc}</p>
                <button type="button" className="auth-split-toggle" onClick={() => switchMode('login')}>
                  {t.submitLogin}
                </button>
              </>
            ) : (
              <>
                <h2>{t.brandLoginTitle}</h2>
                <p>{t.brandLoginDesc}</p>
                <button type="button" className="auth-split-toggle" onClick={() => switchMode('register')}>
                  {t.submitRegister}
                </button>
              </>
            )}
          </div>
        </aside>

        <div className="auth-split-form-wrap">
          <div className="auth-split-form">
            <h1>{isRegister ? t.registerTitle : forgotStep ? t.forgotTitle : t.desktopLoginTitle}</h1>
            <p className="auth-split-lead">
              {isRegister
                ? t.desktopRegisterLead
                : forgotStep
                  ? forgotStep === 'request'
                    ? t.forgotLeadRequest
                    : t.forgotLeadReset
                  : loginMethod === 'phone'
                    ? t.desktopLoginLeadPhone
                    : t.desktopLoginLeadEmail}
            </p>

            {isRegister ? (
              <>
                <SocialAuthButtons
                  disabled={loading}
                  rememberDevice={rememberDevice}
                  onSuccess={handleSocial}
                  onError={setError}
                />
                <p className="auth-split-or">{t.registerOr}</p>
                <form className="auth-split-fields" onSubmit={handleRegister}>
                  <input
                    type="text"
                    placeholder={t.placeholderName}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                  <input
                    type="email"
                    placeholder={t.placeholderEmail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                  <input
                    type="password"
                    placeholder={t.placeholderPassword}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <label className="auth-split-remember">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <span>{t.rememberDevice}</span>
                  </label>
                   {error ? <p className="auth-split-error">{error}</p> : null}
                   <button type="submit" className="auth-split-submit" disabled={loading}>
                     {loading ? t.loading : t.submitRegister}
                   </button>
                   <p className="auth-mobile-toggle-helper">
                     {t.hasAccount} <span onClick={() => switchMode('login')}>{t.goLogin}</span>
                   </p>
                 </form>
               </>
             ) : forgotStep ? (
               <AuthForgotPanel
                 t={t}
                 step={forgotStep}
                 forgotIdentifier={forgotIdentifier}
                 setForgotIdentifier={setForgotIdentifier}
                 resetCode={resetCode}
                 setResetCode={setResetCode}
                 newPassword={newPassword}
                 setNewPassword={setNewPassword}
                 confirmPassword={confirmPassword}
                 setConfirmPassword={setConfirmPassword}
                 loginMethod={loginMethod}
                 loading={loading}
                 error={error}
                 info={info}
                 onRequest={handleForgotRequest}
                 onReset={handleForgotReset}
                 onBack={closeForgotPassword}
                 fieldsClassName="auth-split-fields"
                 submitClassName="auth-split-submit"
               />
             ) : (
               <>
               <div className="auth-login-tabs auth-login-tabs--desktop" role="tablist" aria-label={t.tabsAria}>
                 <button
                   type="button"
                   role="tab"
                   aria-selected={loginMethod === 'email'}
                   className={loginMethod === 'email' ? 'is-active' : ''}
                   onClick={() => switchLoginMethod('email')}
                 >
                   {t.tabEmail}
                 </button>
                 <button
                   type="button"
                   role="tab"
                   aria-selected={loginMethod === 'phone'}
                   className={loginMethod === 'phone' ? 'is-active' : ''}
                   onClick={() => switchLoginMethod('phone')}
                 >
                   {t.tabPhone}
                 </button>
               </div>
               <form className="auth-split-fields" onSubmit={handleLogin}>
                 <input
                   type={loginMethod === 'phone' ? 'tel' : 'text'}
                   placeholder={loginMethod === 'phone' ? t.placeholderPhone : t.placeholderEmailLogin}
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   required
                   autoComplete={loginMethod === 'phone' ? 'tel' : 'username'}
                   inputMode={loginMethod === 'phone' ? 'tel' : 'email'}
                 />
                 <div className="auth-split-password-wrap">
                   <input
                     type={showPassword ? 'text' : 'password'}
                     placeholder={t.placeholderPassword}
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     required
                     autoComplete="current-password"
                   />
                   <button
                     type="button"
                     className="auth-split-password-toggle"
                     onClick={() => setShowPassword(!showPassword)}
                     aria-label={showPassword ? t.hidePasswordAria : t.showPasswordAria}
                   >
                     {showPassword ? '🙈' : '👁'}
                   </button>
                 </div>
                 <div className="auth-split-options">
                   <label className="auth-split-remember">
                     <input
                       type="checkbox"
                       checked={rememberDevice}
                       onChange={(e) => setRememberDevice(e.target.checked)}
                     />
                     <span>{t.rememberDevice}</span>
                   </label>
                   <button type="button" className="auth-split-forgot" onClick={openForgotPassword}>
                     {t.forgotPassword}
                   </button>
                 </div>
                 {error ? <p className="auth-split-error">{error}</p> : null}
                 {info ? <p className="auth-split-info">{info}</p> : null}
                 <button type="submit" className="auth-split-submit" disabled={loading}>
                   {loading ? t.loading : t.submitLogin}
                 </button>
                 <p className="auth-mobile-toggle-helper">
                   {t.noAccount} <span onClick={() => switchMode('register')}>{t.goRegister}</span>
                 </p>
               </form>
               </>
             )}
          </div>
        </div>
      </div>

      <aside className="auth-split-side-rail" aria-label={t.langAria}>
        <AuthLangSelect
          value={locale}
          onChange={setLocale}
          ariaLabel={t.langAria}
          menuPlacement="left"
        />
        <ThemeToggle
          className="auth-split-side-theme"
          ariaSun={t.themeSunAria}
          ariaMoon={t.themeMoonAria}
        />
      </aside>
      </div>
      </div>
    </div>
  );
}
