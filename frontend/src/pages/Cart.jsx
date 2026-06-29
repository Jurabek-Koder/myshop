import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import AuthModal from '../components/AuthModal';

export default function Cart() {
  const { user } = useAuth();
  const { items, remove, setQuantity, totalSum } = useCart();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const navigate = useNavigate();

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';

  if (items.length === 0) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>
        <h1 className="page-title">Savat</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Savat bo'sh.</p>
        <Link to="/products" className="btn btn-primary" style={{ marginTop: '1rem' }}>Mahsulotlar</Link>
      </div>
    );
  }

  return (
    <div className="container cart-page">
      <h1 className="page-title">Savat</h1>
      <div className="deco-line" />
      <div className="cart-list">
        {items.map((it) => (
          <div key={it.product_id} className="card cart-item">
            <div className="product-image cart-thumb">
              {it.product?.image_url ? <img src={it.product.image_url} alt="" /> : <div className="product-placeholder" />}
            </div>
            <div className="cart-info">
              <strong className="cart-name">{it.product?.name_uz}</strong>
              <p className="product-price">{formatPrice((it.product?.sale_price ?? it.product?.price ?? 0) * (it.quantity || 0))}</p>
            </div>
            <div className="cart-controls">
              <div className="cart-qty">
                <button type="button" className="cart-qty-btn" onClick={() => setQuantity(it.product_id, (it.quantity || 1) - 1)}>−</button>
                <span className="cart-qty-count">{it.quantity}</span>
                <button type="button" className="cart-qty-btn" onClick={() => setQuantity(it.product_id, (it.quantity || 1) + 1)}>+</button>
              </div>
              <button type="button" className="cart-remove-btn" onClick={() => remove(it.product_id)}>O'chirish</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card cart-summary">
        <p className="cart-summary-total">Jami: <strong className="product-price">{formatPrice(totalSum)}</strong></p>
        {user ? (
          <Link to="/checkout" className="btn btn-gold cart-checkout-btn">Buyurtma berish</Link>
        ) : (
          <button type="button" className="btn btn-gold cart-checkout-btn" onClick={() => setAuthModalOpen(true)}>
            Xarid qilish
          </button>
        )}
      </div>
      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => navigate('/checkout')}
        />
      )}
    </div>
  );
}
