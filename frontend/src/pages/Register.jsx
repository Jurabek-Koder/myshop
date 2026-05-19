import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, fullName, { rememberDevice });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || "Ro'yxatdan o'tish xatosi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-page--auth login-page--register">
      <aside className="login-brand-panel" aria-hidden="true">
        <div className="login-brand-glow login-brand-glow--a" />
        <div className="login-brand-glow login-brand-glow--b" />
        <div className="login-brand-inner">
          <span className="login-brand-logo">MyShop</span>
          <h2 className="login-brand-headline">Mijoz sifatida tezda ro‘yxatdan o‘ting</h2>
          <p className="login-brand-lead">Mahsulotlarni ko‘rish, savat va buyurtma — barchasi bitta akkauntda.</p>
          <ul className="login-brand-list">
            <li>Xavfsiz akkaunt</li>
            <li>Buyurtma tarixi</li>
            <li>Har qanday qurilmadan kirish</li>
          </ul>
        </div>
      </aside>

      <div className="login-content">
        <header className="login-content-top">
          <Link to="/" className="login-back-home">
            <span className="login-back-home-icon" aria-hidden>
              ←
            </span>
            Bosh sahifa
          </Link>
        </header>

        <div className="login-card-stage">
          <div className="login-card card">
            <h1 className="login-title">Ro&apos;yxatdan o&apos;tish</h1>
            <p className="login-subtitle">Yangi akkaunt yarating va do‘kondan xarid qilishni boshlang.</p>
            <div className="login-deco" />
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="register-name">Ism</label>
                <input
                  id="register-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Ismingiz"
                />
              </div>
              <div className="form-group">
                <label htmlFor="register-email">Email</label>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="email@example.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="register-password">Parol</label>
                <input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  minLength={8}
                />
              </div>
              <div className="form-group login-remember-row">
                <label className="login-remember-label">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                  />
                  <span>Bu qurilmada eslab qol (brauzerni yopganda ham sessiya)</span>
                </label>
              </div>
              {error && <p className="error-msg login-error">{error}</p>}
              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? "Ro'yxatdan o'tilmoqda..." : "Ro'yxatdan o'tish"}
              </button>
            </form>
            <p className="login-footer">
              Akkaunt bor? <Link to="/login">Kirish</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
