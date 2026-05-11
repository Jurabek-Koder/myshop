import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';
import { canAccessPath } from '../utils/allowedPages';
import './Profile.css';

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
};

function IconOrders() {
  return (
    <svg {...iconProps}>
      <path
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconProducts() {
  return (
    <svg {...iconProps}>
      <path
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCart() {
  return (
    <svg {...iconProps}>
      <path
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconProfileMark() {
  return (
    <svg className="profile-guest-icon-mark" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileGuestHub() {
  const { totalItems } = useCart();
  return (
    <div className="profile-page profile-page--guest-hub">
      <div className="profile-guest-ambient" aria-hidden="true">
        <span className="profile-guest-ambient__orb profile-guest-ambient__orb--a" />
        <span className="profile-guest-ambient__orb profile-guest-ambient__orb--b" />
        <span className="profile-guest-ambient__mesh" />
      </div>
      <div className="profile-split profile-split--guest">
        <section className="profile-guest-shell" aria-labelledby="profile-guest-title">
          <header className="profile-guest-shell__head">
            <div className="profile-guest-shell__mark" aria-hidden="true">
              <IconProfileMark />
            </div>
            <div className="profile-guest-shell__titles">
              <p className="profile-guest-shell__eyebrow">Shaxsiy kabinet</p>
              <h1 id="profile-guest-title" className="profile-guest-shell__title">
                Profil
              </h1>
            </div>
          </header>
          <p className="profile-guest-shell__lead">
            Savat va buyurtmalarni shu yerda kuzating. Tizimga kiring yoki ro‘yxatdan o‘ting.
          </p>
          <div className="profile-guest-shell__actions">
            <Link
              to="/cart"
              className="profile-guest-action profile-guest-action--primary"
            >
              <span className="profile-guest-action__icon" aria-hidden>
                <IconCart />
              </span>
              <span className="profile-guest-action__text">
                Savat
                {totalItems > 0 ? (
                  <span className="profile-guest-action__badge">{totalItems}</span>
                ) : null}
              </span>
              <span className="profile-guest-action__chev" aria-hidden>
                →
              </span>
            </Link>
            <div className="profile-guest-shell__row">
              <Link to="/login" className="profile-guest-action profile-guest-action--secondary">
                Kirish
              </Link>
              <Link to="/register" className="profile-guest-action profile-guest-action--accent">
                Ro&apos;yxatdan o&apos;tish
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ProfileBootSkeleton() {
  return (
    <div className="profile-page profile-page--guest-hub" aria-busy="true" aria-label="Profil yuklanmoqda">
      <div className="profile-guest-ambient profile-guest-ambient--muted" aria-hidden="true">
        <span className="profile-guest-ambient__orb profile-guest-ambient__orb--a" />
        <span className="profile-guest-ambient__orb profile-guest-ambient__orb--b" />
      </div>
      <div className="profile-split profile-split--guest">
        <div className="profile-guest-shell profile-guest-shell--skeleton">
          <div className="profile-skel profile-skel--head" />
          <div className="profile-skel profile-skel--line profile-skel--wide" />
          <div className="profile-skel profile-skel--line" />
          <div className="profile-skel profile-skel--btn" />
          <div className="profile-guest-shell__row">
            <div className="profile-skel profile-skel--half" />
            <div className="profile-skel profile-skel--half" />
          </div>
          <p className="profile-guest-skel-hint">Sessiya tekshirilmoqda…</p>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateProfile, logout, loading, authStatus } = useAuth();
  const { totalItems } = useCart();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [login, setLogin] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name || '');
    setEmail(user.email || '');
    setLogin(user.login || '');
    setPhone(user.phone || '');
    setPassword('');
    setPassword2('');
    setError('');
    setOk('');
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (password.trim() && password !== password2) {
      setError('Parollar mos kelmayapti.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        full_name: fullName.trim(),
        email: email.trim(),
        login: login.trim(),
        phone: phone.trim(),
      };
      if (password.trim()) body.password = password.trim();
      await updateProfile(body);
      setPassword('');
      setPassword2('');
      setOk("Saqlandi.");
    } catch (err) {
      setError(err.message || 'Saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  if (loading || authStatus === 'bootstrapping') {
    return <ProfileBootSkeleton />;
  }

  if (!user || authStatus === 'guest') {
    return <ProfileGuestHub />;
  }

  const allowed = user.allowed_pages || [];
  if (!canAccessPath(allowed, '/profile')) {
    return (
      <div className="container" style={{ padding: '2rem', maxWidth: 520 }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Profil sahifasi</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Bu bo‘lim sizning rolingiz uchun ochiq emas.
          </p>
          <Link to="/" className="btn btn-secondary btn-sm">
            Bosh sahifa
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-split">
        <section className="profile-pane" aria-labelledby="profile-pane-title">
          <div id="profile-pane-title" className="profile-pane__head">
            Profil
          </div>
          <div className="profile-pane__body">
            <form className="profile-form profile-form--stretch" onSubmit={handleSubmit}>
              <div className="profile-form-grid">
                <div className="form-group">
                  <label>Ism</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="form-group">
                  <label>Login</label>
                  <input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="+998…"
                  />
                </div>
                <div className="form-group profile-span-2">
                  <label>Yangi parol</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={password ? 6 : 0}
                    placeholder="ixtiyoriy"
                  />
                </div>
                <div className="form-group profile-span-2">
                  <label>Takror</label>
                  <input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    autoComplete="new-password"
                    minLength={password ? 6 : 0}
                  />
                </div>
                <p className="profile-footer profile-span-2">
                  <Link to="/">Bosh sahifa</Link>
                </p>
              </div>
              <div className="profile-actions">
                {error && <p className="error-msg">{error}</p>}
                {ok && <p className="success-msg">{ok}</p>}
                <button type="submit" className="btn-profile-save" disabled={saving}>
                  {saving ? '…' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <aside className="profile-pane" aria-labelledby="settings-pane-title">
          <div id="settings-pane-title" className="profile-pane__head">
            Sozlamalar
          </div>
          <div className="profile-pane__body">
            <div className="profile-settings-section">
              <span className="profile-settings-label">Mavzu</span>
              <div className="profile-theme-toggle" role="group" aria-label="Sayt mavzusi">
                <button
                  type="button"
                  className={`profile-theme-btn${theme === 'light' ? ' profile-theme-btn--active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  Yorug&apos;
                </button>
                <button
                  type="button"
                  className={`profile-theme-btn${theme === 'dark' ? ' profile-theme-btn--active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  Qorong&apos;u
                </button>
              </div>
            </div>
            <div className="profile-settings-footer">
              <nav className="profile-settings-quick" aria-label="Savat va buyurtmalar">
                <Link
                  to="/cart"
                  className="profile-quick-link profile-quick-link--with-badge"
                  title="Savat"
                  aria-label="Savat"
                >
                  <IconCart />
                  {totalItems > 0 ? (
                    <span className="profile-quick-badge">{totalItems}</span>
                  ) : null}
                </Link>
                <Link
                  to="/orders"
                  className="profile-quick-link"
                  title="Buyurtmalarim"
                  aria-label="Buyurtmalarim"
                >
                  <IconOrders />
                </Link>
                <Link
                  to="/products"
                  className="profile-quick-link"
                  title="Mahsulotlar"
                  aria-label="Mahsulotlar"
                >
                  <IconProducts />
                </Link>
              </nav>
              <div className="profile-settings-logout">
                <button
                  type="button"
                  className="btn-profile-save"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Chiqish
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
