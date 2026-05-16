import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { ALL_NAV_CATEGORIES } from '../constants/catalogCategories.js';

/** Topbar: «Kategoriya» — bosilganda ro‘yxat (barcha foydalanuvchilar) */
export default function CustomerCategoryDropdown({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const activeCategory = location.pathname === '/products' ? params.get('category') || '' : '';

  useEffect(() => {
    const media = window.matchMedia('(max-width: 991px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!(open && isMobile)) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isMobile]);

  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  const panelContent = (
    <div className="catalog-cat-stack" role="list">
      <Link
        role="listitem"
        to="/products"
        className={`catalog-cat-chip catalog-cat-chip--sidebar ${!activeCategory ? 'is-active' : ''}`}
        onClick={close}
      >
        Hammasi
      </Link>
      {ALL_NAV_CATEGORIES.map((cat) => (
        <Link
          role="listitem"
          key={cat}
          to={`/products?category=${encodeURIComponent(cat)}`}
          className={`catalog-cat-chip catalog-cat-chip--sidebar ${activeCategory === cat ? 'is-active' : ''}`}
          onClick={close}
        >
          {cat}
        </Link>
      ))}
    </div>
  );

  const panelInline = open && !isMobile ? (
    <div
      className="nav-category-panel"
      id="nav-category-dropdown-list"
      role="region"
      aria-label="Mahsulot kategoriyalari"
      aria-labelledby="nav-category-dropdown-btn"
      ref={panelRef}
    >
      {panelContent}
    </div>
  ) : null;

  const panelMobile =
    open && isMobile
      ? createPortal(
          <>
            <div className="nav-category-backdrop" onClick={close} aria-hidden />
            <div
              className="nav-category-panel nav-category-panel--mobile-modal"
              id="nav-category-dropdown-list"
              role="region"
              aria-label="Mahsulot kategoriyalari"
              aria-labelledby="nav-category-dropdown-btn"
              ref={panelRef}
            >
              {panelContent}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div className="nav-category-dropdown" ref={wrapRef}>
      <button
        type="button"
        className={`nav-category-trigger ${open ? 'is-open' : ''} ${activeCategory ? 'has-filter' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="nav-category-dropdown-list"
        id="nav-category-dropdown-btn"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Kategoriya</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} nav-category-chevron`} aria-hidden />
      </button>
      {panelInline}
      {panelMobile}
    </div>
  );
}
