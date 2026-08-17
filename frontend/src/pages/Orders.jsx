import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { formatDateTimeUz } from '../utils/uzbekistanTime.js';

export default function Orders() {
  const { user, request } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const createdId = location.state?.created;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    request('/orders')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setOrders(data.orders || []);
      })
      .catch(() => {
        if (!cancelled) setError("Buyurtmalar yuklanmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, request]);

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0)) + ' so\'m';
  const formatDate = (d) => formatDateTimeUz(d, { empty: '-' });

  function lineTotal(it) {
    const q = Number(it.quantity) || 0;
    const unit = Number(it.price_at_order) || 0;
    return q * unit;
  }

  /** Mijozga tushunarli buyurtma holati (Status | …) */
  function orderStatusLine(statusRaw) {
    const s = String(statusRaw || 'pending').trim().toLowerCase().replace(/\s+/g, '_');
    if (s === 'delivered' || s === 'completed') return "Yetkazilgan";
    if (s === 'assigned' || s === 'picked_up' || s === 'on_the_way' || s === 'delivery') return "Yo'lda";
    if (s === 'cancelled' || s === 'canceled') return 'Bekor qilingan';
    if (s === 'archived') return 'Arxivlangan';
    if (
      s === 'pending'
      || s === 'hold'
      || s === 'picked'
      || s === 'packaged'
      || s === 'processing'
    ) {
      return 'Mahsulot faol';
    }
    return 'Mahsulot faol';
  }

  if (!user) {
    return (
      <div className="container">
        <p>Buyurtmalarni ko&apos;rish uchun <Link to="/login">tizimga kiring</Link>.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="container"><p>Yuklanmoqda...</p></div>;
  }

  return (
    <div className="container">
      <h1 className="page-title">Buyurtmalarim</h1>
      <div className="deco-line" />
      {createdId && <p className="success-msg">Buyurtma #{createdId} muvaffaqiyatli yaratildi.</p>}
      {error && <p className="error-msg">{error}</p>}
      {orders.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Buyurtmalar yo&apos;q.</p>
      ) : (
        <div className="orders-list">
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong>#{o.id}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{formatDate(o.created_at)}</span>
              </div>
              {Array.isArray(o.items) && o.items.length > 0 && (
                <ul
                  style={{
                    margin: '0.75rem 0 0',
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {o.items.map((it) => (
                    <li
                      key={`${o.id}-${it.id ?? it.product_id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.35rem 0.75rem',
                        fontSize: '0.95rem',
                      }}
                    >
                      <span>{it.name_uz || `Mahsulot #${it.product_id}`}</span>
                      <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                        {Number(it.quantity) || 0} ta × {formatPrice(it.price_at_order)} ={' '}
                        <strong style={{ color: 'var(--text, inherit)' }}>{formatPrice(lineTotal(it))}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div
                style={{
                  margin: '0.75rem 0 0',
                  padding: '0.75rem 0 0',
                  borderTop: '1px solid var(--border, rgba(0,0,0,0.08))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem 1rem',
                  fontSize: '1.2rem',
                  lineHeight: 1.35,
                }}
              >
                <p style={{ margin: 0, color: 'var(--text-muted)', textAlign: 'left' }}>
                  <strong style={{ color: 'var(--text, inherit)' }}>Status</strong>
                  <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}> | </span>
                  <span>{orderStatusLine(o.status)}</span>
                </p>
                <p style={{ margin: 0, textAlign: 'right' }}>
                  <strong>Jami:</strong>{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{formatPrice(o.total_amount)}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
