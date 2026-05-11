import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ fontSize: '5rem', lineHeight: 1, marginBottom: '1rem', opacity: 0.15 }}>
        404
      </div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Sahifa topilmadi</h1>
      <p style={{ color: 'var(--text-muted, #888)', marginBottom: '1.5rem', maxWidth: 360 }}>
        Siz qidirgan sahifa mavjud emas yoki ko'chirilgan bo'lishi mumkin.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => navigate(-1)}
        >
          <i className="fas fa-arrow-left" style={{ marginRight: 6 }} />
          Orqaga
        </button>
        <Link to="/" className="btn btn-primary">
          <i className="fas fa-home" style={{ marginRight: 6 }} />
          Bosh sahifa
        </Link>
      </div>
    </div>
  );
}
