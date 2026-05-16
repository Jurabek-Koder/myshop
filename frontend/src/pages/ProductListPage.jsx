import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { API_PREFIX, parseApiJsonText } from '../lib/apiBase';
import { mergeCategoriesFromApi } from '../constants/catalogCategories.js';

export default function ProductListPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { add } = useCart();

  const category = searchParams.get('category') || '';
  const query = (searchParams.get('q') || '').trim().toLowerCase();

  const setCategory = useCallback(
    (cat) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (!cat) next.delete('category');
        else next.set('category', cat);
        return next;
      });
    },
    [setSearchParams],
  );

  const pickCategory = useCallback(
    (cat) => {
      setCategory(cat);
      setCategoryPanelOpen(false);
    },
    [setCategory],
  );

  useEffect(() => {
    if (!categoryPanelOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setCategoryPanelOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [categoryPanelOpen]);

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
      <h1 className="product-catalog-page-sr-only">Mahsulotlar</h1>
      <div className="product-catalog-toolbar">
        <div className="product-catalog-toolbar-cluster">
          <Link to="/" className="product-catalog-back-home" aria-label="Bosh sahifaga">
            <i className="fas fa-arrow-left" aria-hidden />
          </Link>
          {displayCategories.length > 0 ? (
            <div className="catalog-category-dropdown">
              <button
                type="button"
                className="catalog-mobile-category-trigger"
                aria-expanded={categoryPanelOpen}
                aria-controls="catalog-mobile-category-nav"
                id="catalog-mobile-category-trigger"
                onClick={() => setCategoryPanelOpen((v) => !v)}
              >
                <span className="catalog-mobile-category-trigger-label">Kategoriya</span>
                <i
                  className={`fas fa-chevron-${categoryPanelOpen ? 'up' : 'down'} catalog-mobile-category-trigger-chevron`}
                  aria-hidden
                />
              </button>
              {categoryPanelOpen ? (
                <>
                  <div
                    className="catalog-category-dropdown-backdrop"
                    aria-hidden
                    onClick={() => setCategoryPanelOpen(false)}
                  />
                  <nav
                    id="catalog-mobile-category-nav"
                    className="catalog-mobile-category-nav catalog-mobile-category-nav--dropdown"
                    aria-labelledby="catalog-mobile-category-trigger"
                  >
                    <button
                      type="button"
                      className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill ${!category ? 'is-active' : ''}`}
                      onClick={() => pickCategory('')}
                    >
                      Hammasi
                    </button>
                    {displayCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill ${category === cat ? 'is-active' : ''}`}
                        onClick={() => pickCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </nav>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="catalog-layout catalog-layout--full">
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
