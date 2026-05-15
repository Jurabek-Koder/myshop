import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { API_PREFIX, parseApiJsonText } from '../lib/apiBase';
import { ALL_NAV_CATEGORIES } from '../constants/catalogCategories.js';

export default function ProductListPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const { add } = useCart();

  const category = searchParams.get('category') || '';
  const query = (searchParams.get('q') || '').trim().toLowerCase();

  const setCategory = (cat) => {
    const next = new URLSearchParams(searchParams);
    if (!cat) next.delete('category');
    else next.set('category', cat);
    setSearchParams(next);
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API_PREFIX}/products`).then(async (r) => {
        const d = parseApiJsonText(await r.text());
        return d && typeof d === 'object' ? d : {};
      }),
      fetch(`${API_PREFIX}/products/categories`).then(async (r) => {
        const d = parseApiJsonText(await r.text());
        return d && typeof d === 'object' ? d : {};
      }),
    ])
      .then(([p, c]) => {
        setProducts(Array.isArray(p.products) ? p.products : []);
        setCategories(Array.isArray(c.categories) ? c.categories : []);
      })
      .catch(() => {
        setProducts([]);
        setCategories([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((x) => {
    const matchCategory = category ? x.category === category : true;
    const name = String(x?.name_uz || '').toLowerCase();
    const matchQuery = query ? name.includes(query) : true;
    return matchCategory && matchQuery;
  });

  const displayCategories = useMemo(() => {
    const canon = ALL_NAV_CATEGORIES;
    const seen = new Set(canon);
    const extra = (categories || []).filter((c) => c && String(c).trim() && !seen.has(c));
    extra.sort((a, b) => String(a).localeCompare(String(b), 'uz'));
    return [...canon, ...extra];
  }, [categories]);

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';

  if (loading) return <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>Yuklanmoqda...</div>;

  return (
    <div className="container">
      <h1 className="page-title">Mahsulotlar</h1>
      <div className="deco-line" />
      {displayCategories.length > 0 && (
        <div className="filter-row">
          <button type="button" className={`btn ${!category ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategory('')}>
            Hammasi
          </button>
          {displayCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`btn ${category === cat ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
      <div className="product-grid">
        {filtered.map((p) => (
          <article key={p.id} className="card product-card">
            <Link to={`/products/${p.id}`} className="product-card-link">
              <div className="product-image">
                {p.image_url ? <img src={p.image_url} alt={p.name_uz} /> : <div className="product-placeholder" />}
              </div>
              <div className="product-card-body">
                <h3>{p.name_uz}</h3>
                {p.sale_price != null ? (
                  <div className="product-price-block">
                    <span className="product-price-old">{formatPrice(p.price)}</span>
                    <span className="product-price product-price-sale">{formatPrice(p.sale_price)}</span>
                  </div>
                ) : (
                  <p className="product-price">{formatPrice(p.price)}</p>
                )}
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
      {filtered.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Mahsulot topilmadi.</p>}
    </div>
  );
}
