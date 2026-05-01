import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { PACKER_UZ_VILOYATLAR } from '../constants/uzViloyatlarPacker.js';

function strApi(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && typeof v.message === 'string') return v.message.trim();
  return String(v).trim();
}

export default function Checkout() {
  const { user, request } = useAuth();
  const { items, totalSum, clearCart } = useCart();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(String(user?.full_name || '').trim());
  const [regionId, setRegionId] = useState('');
  const [regionOpen, setRegionOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const regionWrapRef = useRef(null);
  const regionPanelRef = useRef(null);

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
  const selectedRegionName = PACKER_UZ_VILOYATLAR.find((v) => v.id === regionId)?.name || '';

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!regionOpen) return undefined;
    const onDoc = (e) => {
      const inTrigger = regionWrapRef.current?.contains(e.target);
      const inPanel = regionPanelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) setRegionOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setRegionOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [regionOpen]);

  useEffect(() => {
    if (!(regionOpen && isMobile)) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [regionOpen, isMobile]);

  if (!user) {
    return (
      <div className="container">
        <p>Buyurtma berish uchun <Link to="/login">tizimga kiring</Link>.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container">
        <p>Savat bo'sh. <Link to="/products">Mahsulotlar</Link></p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const name = String(fullName || '').trim();
    const region = PACKER_UZ_VILOYATLAR.find((v) => v.id === regionId)?.name || '';
    const contact = String(phone || '').trim();
    const note = String(comment || '').trim();

    if (!name) {
      setError('Ism-familiyani kiriting.');
      return;
    }
    if (!region) {
      setError('Viloyatni tanlang.');
      return;
    }
    if (!contact) {
      setError('Telefon raqamini kiriting.');
      return;
    }

    const onlyDigits = contact.replace(/\D/g, '');
    if (onlyDigits.length < 9) {
      setError('Telefon raqami to‘liq emas.');
      return;
    }

    setLoading(true);
    try {
      const orderItems = items
        .map((i) => ({
          product_id: Number.parseInt(String(i.product_id), 10),
          quantity: Math.max(1, Number.parseInt(String(i.quantity || 1), 10) || 1),
        }))
        .filter((i) => Number.isInteger(i.product_id) && i.product_id >= 1);
      if (orderItems.length === 0) {
        setError("Savatda yaroqsiz mahsulot. Savatni yangilab, qayta urinib ko'ring.");
        setLoading(false);
        return;
      }
      const res = await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: orderItems,
          shipping_address: note ? `${region}. Sharh: ${note}` : region,
          contact_phone: contact,
          customer_name: name,
          region_name: region,
          comment: note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detailParts = Array.isArray(data.details)
          ? data.details.map((d) => strApi(d?.message ?? d?.msg ?? d)).filter(Boolean)
          : [];
        const msg = detailParts.length ? detailParts.join(' ') : strApi(data.error) || 'Buyurtma xatosi';
        throw new Error(msg);
      }
      clearCart();
      navigate('/orders', { state: { created: data.id } });
    } catch (err) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container checkout-page">
      <h1 className="page-title">Buyurtma berish</h1>
      <div className="deco-line" />
      <form onSubmit={handleSubmit} className="card checkout-form">
        <p className="checkout-total">Jami: <strong className="product-price">{formatPrice(totalSum)}</strong></p>
        <div className="form-group">
          <label>Ism-familiya</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Masalan: Ali Valiyev"
            required
          />
        </div>
        <div className="form-group">
          <label>Viloyat</label>
          <div className="checkout-region-picker" ref={regionWrapRef}>
            <button
              type="button"
              className={`checkout-region-trigger ${regionOpen ? 'is-open' : ''} ${regionId ? 'has-value' : ''}`}
              aria-expanded={regionOpen}
              aria-haspopup="listbox"
              aria-controls="checkout-region-listbox"
              onClick={() => setRegionOpen((v) => !v)}
            >
              <span>{selectedRegionName || 'Viloyatni tanlang'}</span>
              <i className={`fas fa-chevron-${regionOpen ? 'up' : 'down'}`} aria-hidden />
            </button>
            {regionOpen && !isMobile ? (
              <div className="checkout-region-options" id="checkout-region-listbox" role="listbox" ref={regionPanelRef}>
                {PACKER_UZ_VILOYATLAR.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`checkout-region-option ${regionId === v.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setRegionId(v.id);
                      setRegionOpen(false);
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="form-group">
          <label>Telefon</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            required
          />
        </div>
        <div className="form-group">
          <label>Sharh (ixtiyoriy)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Masalan: qo‘ng‘iroqdan keyin yetkazilsin"
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button type="submit" className="btn btn-gold checkout-submit-btn" disabled={loading}>
          {loading ? 'Jarayonda...' : 'Buyurtmani tasdiqlash'}
        </button>
      </form>
      {regionOpen && isMobile
        ? createPortal(
            <>
              <div className="checkout-region-backdrop" onClick={() => setRegionOpen(false)} aria-hidden />
              <div className="checkout-region-options checkout-region-options--mobile-modal" role="listbox" ref={regionPanelRef}>
                {PACKER_UZ_VILOYATLAR.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`checkout-region-option ${regionId === v.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setRegionId(v.id);
                      setRegionOpen(false);
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
