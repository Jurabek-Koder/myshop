import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** Buxgalteriya — asosiy sahifalar keyinroq qo‘shiladi. */
export default function AccountingDashboard() {
  const { user, logout } = useAuth();
  const who = String(user?.full_name || user?.login || '').trim();

  return (
    <div className="container" style={{ padding: '2rem 1rem', maxWidth: 720 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Buxgalteriya paneli</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-outline">
            Do‘kon
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => logout()}>
            Chiqish
          </button>
        </div>
      </header>
      <p style={{ marginTop: '1.25rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.55 }}>
        {who ? `Salom, ${who}. ` : ''}
        Bu yerda moliya va hisob-kitob vazifalari joylashadi; hozircha panel ochiq va xavfsiz kirish tasdiqlangan.
      </p>
    </div>
  );
}
