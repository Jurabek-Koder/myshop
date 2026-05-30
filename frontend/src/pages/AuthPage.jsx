import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SocialAuthButtons from '../components/auth/SocialAuthButtons.jsx';
import {
  getRememberedLogin,
  REMEMBERED_LOGIN_KEY,
  resolveReturnTarget,
  roleDefaultPath,
} from '../utils/authRedirect.js';
import './AuthPage.css';

export default function AuthPage({ initialMode = 'login' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, socialAuth, retrySession } = useAuth();

  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(() => getRememberedLogin());
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState('');
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

  const afterAuth = (data) => {
    try {
      if (email.trim()) localStorage.setItem(REMEMBERED_LOGIN_KEY, email.trim());
    } catch {}
    const target = resolveReturnTarget(from, data?.user);
    navigate(target || roleDefaultPath(data?.user), { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password, { rememberDevice });
      afterAuth(data);
    } catch (err) {
      setError(err.message || 'Kirish xatosi');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(email, password, fullName, { rememberDevice });
      afterAuth(data);
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
      afterAuth(data);
    } catch (err) {
      setError(err.message || 'Ijtimoiy tarmoq orqali kirish xatosi');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setError('');
    setPassword('');
    navigate(next === 'register' ? '/register' : '/login', { replace: true, state: location.state });
  };

  const isRegister = mode === 'register';

  return (
    <div className="auth-split-page">
      <Link to="/" className="auth-split-back">
        ← Bosh sahifa
      </Link>

      <div className="auth-split-center">
      <div className="auth-split-card" data-mode={mode}>
        <aside className="auth-split-brand">
          <div className="auth-split-brand-inner">
            {isRegister ? (
              <>
                <h2>Xush kelibsiz!</h2>
                <p>Ro'yxatdan o'ting — mahsulotlarni savatga qo'yib xarid qiling</p>
                <button type="button" className="auth-split-toggle" onClick={() => switchMode('login')}>
                  Kirish
                </button>
              </>
            ) : (
              <>
                <h2>Salom, do&apos;st!</h2>
                <p>Ro'yxatdan o'tib, xarid qilishni boshlang</p>
                <button type="button" className="auth-split-toggle" onClick={() => switchMode('register')}>
                  Ro'yxatdan o'tish
                </button>
              </>
            )}
          </div>
        </aside>

        <div className="auth-split-form-wrap">
          <div className="auth-split-form">
            <h1>{isRegister ? "Ro'yxatdan o'tish" : 'Kirish'}</h1>
            <p className="auth-split-lead">
              {isRegister
                ? 'Tez ro\u2018yxatdan o\u2018ting va xavfsiz xarid qiling — Google, Instagram, Facebook yoki Telegram'
                : 'Email yoki login va parol bilan kiring'}
            </p>

            {isRegister ? (
              <>
                <SocialAuthButtons
                  disabled={loading}
                  rememberDevice={rememberDevice}
                  onSuccess={handleSocial}
                  onError={setError}
                />
                <p className="auth-split-or">yoki email orqali ro‘yxatdan o‘ting</p>
                <form className="auth-split-fields" onSubmit={handleRegister}>
                  <input
                    type="text"
                    placeholder="Ism"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                  <input
                    type="password"
                    placeholder="Parol"
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
                    <span>Bu qurilmada eslab qol</span>
                  </label>
                   {error ? <p className="auth-split-error">{error}</p> : null}
                   <button type="submit" className="auth-split-submit" disabled={loading}>
                     {loading ? 'Kutilmoqda...' : "Ro'yxatdan o'tish"}
                   </button>
                   <p className="auth-mobile-toggle-helper">
                     Akkauntingiz bormi? <span onClick={() => switchMode('login')}>Kirish</span>
                   </p>
                 </form>
               </>
             ) : (
               <form className="auth-split-fields" onSubmit={handleLogin}>
                 <input
                   type="text"
                   placeholder="Email yoki login"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   required
                   autoComplete="username"
                 />
                 <div className="auth-split-password-wrap">
                   <input
                     type={showPassword ? 'text' : 'password'}
                     placeholder="Parol"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     required
                     autoComplete="current-password"
                   />
                   <button
                     type="button"
                     className="auth-split-password-toggle"
                     onClick={() => setShowPassword(!showPassword)}
                     aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                   >
                     {showPassword ? '🙈' : '👁'}
                   </button>
                 </div>
                 <label className="auth-split-remember">
                   <input
                     type="checkbox"
                     checked={rememberDevice}
                     onChange={(e) => setRememberDevice(e.target.checked)}
                   />
                   <span>Bu qurilmada eslab qol</span>
                 </label>
                 {error ? <p className="auth-split-error">{error}</p> : null}
                 <button type="submit" className="auth-split-submit" disabled={loading}>
                   {loading ? 'Kutilmoqda...' : 'Kirish'}
                 </button>
                 <p className="auth-mobile-toggle-helper">
                   Akkauntingiz yo'qmi? <span onClick={() => switchMode('register')}>Ro'yxatdan o'tish</span>
                 </p>
               </form>
             )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
