import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function isSuperuser(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'superuser' || user?.role_id === 1;
}

function isSeller(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'seller';
}

function isCourier(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'courier';
}

function isOperator(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'operator';
}

function isPicker(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'picker';
}

function isPacker(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'packer';
}

function isExpeditor(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'expeditor';
}

function isOrderReceiver(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'order_receiver';
}

function canAccessPath(allowedPages, pathname) {
  if (!allowedPages || allowedPages.length === 0) return false;
  if (allowedPages.includes('*')) return true;
  if (allowedPages.includes(pathname)) return true;
  return allowedPages.some((p) => {
    if (p === '/') return pathname === '/';
    return pathname === p || pathname.startsWith(p + '/');
  });
}

function roleDefaultPath(user) {
  if (isSuperuser(user)) return '/admin';
  if (isSeller(user)) return '/seller';
  if (isCourier(user)) return '/courier';
  if (isOperator(user)) return '/operator';
  if (isPicker(user)) return '/picker';
  if (isPacker(user)) return '/packer';
  if (isExpeditor(user)) return '/expeditor';
  if (isOrderReceiver(user)) return '/qabul';
  return '/';
}

function resolveReturnTarget(rawFrom, user) {
  if (!rawFrom || typeof rawFrom !== 'string') return '';

  try {
    const parsed = new URL(rawFrom, window.location.origin);
    const pathname = parsed.pathname || '/';
    const fullTarget = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (pathname === '/login' || pathname === '/register') return '';

    if (pathname.startsWith('/admin')) {
      return isSuperuser(user) ? fullTarget : '';
    }

    if (pathname.startsWith('/seller')) {
      return isSeller(user) ? fullTarget : '';
    }
    if (pathname.startsWith('/courier')) {
      return isCourier(user) ? fullTarget : '';
    }
    if (pathname.startsWith('/operator')) {
      return isOperator(user) ? fullTarget : '';
    }
    if (pathname.startsWith('/picker')) {
      return isPicker(user) ? fullTarget : '';
    }
    if (pathname.startsWith('/packer')) {
      return isPacker(user) ? fullTarget : '';
    }
    if (pathname.startsWith('/expeditor')) {
      return isExpeditor(user) ? fullTarget : '';
    }
    if (pathname.startsWith('/qabul')) {
      return isOrderReceiver(user) ? fullTarget : '';
    }

    const allowed = user?.allowed_pages || (isSuperuser(user) ? ['*'] : []);
    if (
      canAccessPath(allowed, pathname)
      || pathname === '/'
      || pathname.startsWith('/products')
      || pathname === '/cart'
      || pathname === '/profile'
    ) {
      return fullTarget;
    }

    return '';
  } catch {
    return '';
  }
}

const REMEMBERED_LOGIN_KEY = 'myshop_remembered_login';
function getRememberedLogin() {
  try {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(REMEMBERED_LOGIN_KEY) || '') : '';
  } catch {
    return '';
  }
}

export default function Login() {
  const [email, setEmail] = useState(() => getRememberedLogin());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = typeof location.state?.from === 'string' ? location.state.from : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      try {
        localStorage.setItem(REMEMBERED_LOGIN_KEY, email.trim());
      } catch {}
      const target = resolveReturnTarget(from, data?.user);
      if (target) {
        navigate(target, { replace: true });
      } else {
        navigate(roleDefaultPath(data?.user), { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Kirish xatosi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Link to="/" className="login-back-home">
        ← Bosh sahifa
      </Link>
      <div className="login-card card">
        <h1 className="login-title">Kirish</h1>
        <div className="login-deco" />
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email yoki login</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="Email yoki rol login (masalan: operator01)"
            />
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label>Parol</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{ paddingRight: '2.75rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '2.6rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
              title={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
            >
              {showPassword ? (
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Kiring...' : 'Kirish'}
          </button>
        </form>
        <p className="login-footer">
          Akkaunt yo'q? <Link to="/register">Ro'yxatdan o'tish</Link>
        </p>
      </div>
    </div>
  );
}
