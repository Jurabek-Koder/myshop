import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { API_PREFIX, parseApiJsonText } from '../lib/apiBase';
import { mergeCategoriesFromApi } from '../constants/catalogCategories.js';

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

  const displayCategories = useMemo(() => mergeCategoriesFromApi(categories), [categories]);

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';

  if (loading) return <div className="container" style={{ textAlign: 'center', padding: '3rem' }}>Yuklanmoqda...</div>;

  return (
    <div className="container product-catalog-page">
      <header className="product-catalog-header">
        <h1 className="page-title">Mahsulotlar</h1>
        <div className="deco-line" />
      </header>

      <div className={`catalog-layout${displayCategories.length === 0 ? ' catalog-layout--full' : ''}`}>
        {displayCategories.length > 0 ? (
          <aside className="catalog-sidebar" aria-labelledby="catalog-sidebar-title">
            <h2 id="catalog-sidebar-title" className="catalog-sidebar-title">
              Kategoriya
            </h2>
            <nav className="catalog-sidebar-nav" aria-label="Mahsulot kategoriyalari">
              <button
                type="button"
                className={`catalog-cat-chip catalog-cat-chip--sidebar ${!category ? 'is-active' : ''}`}
                onClick={() => setCategory('')}
              >
                Hammasi
              </button>
              {displayCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`catalog-cat-chip catalog-cat-chip--sidebar ${category === cat ? 'is-active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </aside>
        ) : null}

        <div className="catalog-main">
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
          {filtered.length === 0 && (
            <p className="catalog-empty-hint">Mahsulot topilmadi.</p>
          )}
        </div>
      </div>
    </div>
  );
}
