import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AuthModal({ onClose, onSuccess }) {
  const [tab, setTab] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [full_name, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let data;
      if (tab === 'login') {
        data = await login(email, password);
      } else {
        data = await register(email, password, full_name);
      }
      onSuccess?.();
      onClose?.();
      
      if (data?.user?.role === 'superuser' || data?.user?.role_id === 1) {
        navigate('/admin');
      } else if (String(data?.user?.role || '').toLowerCase() === 'seller') {
        navigate('/seller');
      }
    } catch (err) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content auth-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Yopish">&times;</button>
        <div className="modal-tabs">
          <button type="button" className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError(''); }}>
            Ro'yxatdan o'tish
          </button>
          <button type="button" className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); }}>
            Kirish
          </button>
        </div>
        <h2 className="modal-title">{tab === 'register' ? "Ro'yxatdan o'tish" : 'Kirish'}</h2>
        <div className="deco-line" />
        <form onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="form-group">
              <label>Ism</label>
              <input type="text" value={full_name} onChange={(e) => setFullName(e.target.value)} required placeholder="Ism familiya" />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label>Parol</label>
            <input 
              type={showPassword ? "text" : "password"} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder={tab === 'register' ? '8+ belgi, bosh harf, raqam, maxsus belgi' : ''} 
              minLength={tab === 'register' ? 8 : undefined} 
              style={{ paddingRight: '2.5rem' }}
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ 
                position: 'absolute', 
                right: '0.8rem', 
                top: '2.5rem', 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
              title={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
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
          <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Jarayonda...' : tab === 'register' ? "Ro'yxatdan o'tish" : 'Kirish'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {tab === 'register' ? (
            <>Akkaunt bormi? <button type="button" className="link-btn" onClick={() => { setTab('login'); setError(''); }}>Kirish</button></>
          ) : (
            <>Akkaunt yo'q? <button type="button" className="link-btn" onClick={() => { setTab('register'); setError(''); }}>Ro'yxatdan o'tish</button></>
          )}
        </p>
      </div>
    </div>
  );
}

