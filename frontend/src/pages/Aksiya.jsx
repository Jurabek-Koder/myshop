import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { API_PREFIX, parseApiJsonText } from '../lib/apiBase';

export default function Aksiya() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { add } = useCart();

  useEffect(() => {
    fetch(`${API_PREFIX}/products?aksiya=1`)
      .then(async (r) => {
        const d = parseApiJsonText(await r.text());
        if (d && typeof d === 'object' && !Array.isArray(d)) setProducts(Array.isArray(d.products) ? d.products : []);
        else setProducts([]);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + " so'm";

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>
        Yuklanmoqda...
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="page-title">Aksiya</h1>
      <div className="deco-line" />
      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Chegirmadagi mahsulotlar. Vaqtida xarid qiling.
      </p>
      <div className="product-grid aksiya-grid">
        {products.map((p) => (
          <article key={p.id} className="card product-card product-card-aksiya">
            <Link to={`/products/${p.id}`} className="product-card-link">
              <div className="product-image">
                <span className="product-card-badge aksiya-badge">−{Math.round(Number(p.discount_percent) || 0)}%</span>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name_uz} />
                ) : (
                  <div className="product-placeholder" />
                )}
              </div>
              <div className="product-card-body">
                <h3>{p.name_uz}</h3>
                <div className="product-price-block">
                  <span className="product-price-old">{formatPrice(p.price)}</span>
                  <span className="product-price product-price-sale">{formatPrice(p.sale_price ?? p.price)}</span>
                </div>
              </div>
            </Link>
            <div className="product-card-actions">
              <button type="button" className="btn btn-gold" onClick={() => add(p)}>
                Savatga
              </button>
            </div>
          </article>
        ))}
      </div>
      {products.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
          Hozircha aksiyadagi mahsulotlar yo&apos;q.
        </p>
      )}
    </div>
  );
}
