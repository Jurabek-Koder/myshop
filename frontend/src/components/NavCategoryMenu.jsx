import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_PREFIX, parseApiJsonText } from '../lib/apiBase';
import { mergeCategoriesFromApi } from '../constants/catalogCategories.js';

const NavCategoryContext = createContext(null);

function useIsMobileNavBreakpoint() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 991px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 991px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return isMobile;
}

export function NavCategoryMenuProvider({ children, setMenuOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const desktopWrapRef = useRef(null);
  const mobileTriggerRef = useRef(null);
  const isMobile = useIsMobileNavBreakpoint();

  const categoryFromUrl =
    location.pathname.startsWith('/products') ? new URLSearchParams(location.search).get('category') || '' : '';

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_PREFIX}/products/categories`, { cache: 'no-store' })
      .then(async (r) => {
        const d = parseApiJsonText(await r.text());
        return d && typeof d === 'object' ? d : {};
      })
      .then((d) => {
        if (cancelled) return;
        setCategories(Array.isArray(d.categories) ? d.categories : []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayCategories = useMemo(() => mergeCategoriesFromApi(categories), [categories]);

  const pickCategory = useCallback(
    (cat) => {
      navigate(cat ? `/products?category=${encodeURIComponent(cat)}` : '/products');
      setOpen(false);
      setMenuOpen(false);
    },
    [navigate, setMenuOpen],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !isMobile) return undefined;
    document.body.classList.add('nav-category-sheet-open');
    return () => document.body.classList.remove('nav-category-sheet-open');
  }, [open, isMobile]);

  /** Mobil modal: panel boshlanishi — tugma ostidan */
  useEffect(() => {
    if (!open || !isMobile) {
      document.documentElement.style.removeProperty('--nav-category-panel-top');
      return undefined;
    }
    const el = mobileTriggerRef.current;
    if (!el) return undefined;
    const update = () => {
      const rect = el.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--nav-category-panel-top',
        `${Math.max(0, Math.ceil(rect.bottom + 8))}px`,
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.documentElement.style.removeProperty('--nav-category-panel-top');
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open || isMobile) return undefined;
    const onDown = (e) => {
      const wrap = desktopWrapRef.current;
      if (wrap && !wrap.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, isMobile]);

  /** Kengaytirish/o‘ynashda ochiq panel ikki xil rejimda qolib ketmasin */
  useEffect(() => {
    setOpen(false);
  }, [isMobile]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      displayCategories,
      pickCategory,
      categoryFromUrl,
      desktopWrapRef,
      mobileTriggerRef,
      isMobile,
    }),
    [open, displayCategories, pickCategory, categoryFromUrl, isMobile],
  );

  if (!displayCategories.length) {
    return children;
  }

  return (
    <NavCategoryContext.Provider value={value}>
      {children}
      <NavCategoryMobilePortal />
    </NavCategoryContext.Provider>
  );
}

function useNavCategory() {
  const v = useContext(NavCategoryContext);
  return v;
}

function NavCategoryMobilePortal() {
  const ctx = useNavCategory();
  if (!ctx || !ctx.open || !ctx.isMobile || typeof document === 'undefined') return null;

  const { setOpen, pickCategory, categoryFromUrl, displayCategories } = ctx;

  return createPortal(
    <>
      <div className="nav-category-backdrop" aria-hidden onClick={() => setOpen(false)} />
      <nav
        id="nav-category-panel-mobile"
        className="nav-category-panel nav-category-panel--mobile-modal"
        aria-label="Mahsulot kategoriyalari"
      >
        <button
          type="button"
          className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill ${!categoryFromUrl ? 'is-active' : ''}`}
          onClick={() => pickCategory('')}
        >
          Hammasi
        </button>
        {displayCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill ${categoryFromUrl === cat ? 'is-active' : ''}`}
            onClick={() => pickCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>
    </>,
    document.body,
  );
}

/** Desktop (≥992px): navigatsiya qatorida, ochiq panel absolute */
export function NavCategoryDesktopDropdown() {
  const ctx = useNavCategory();
  if (!ctx) return null;

  const { open, setOpen, pickCategory, categoryFromUrl, displayCategories, desktopWrapRef, isMobile } = ctx;
  if (isMobile) return null;

  return (
    <div className="nav-category-dropdown nav-category-desktop-slot" ref={desktopWrapRef}>
      <button
        type="button"
        className={`nav-category-trigger ${open ? 'is-open' : ''} ${categoryFromUrl ? 'has-filter' : ''}`}
        aria-expanded={open}
        aria-controls="nav-category-panel-desktop"
        id="nav-category-trigger-desktop"
        onClick={() => setOpen((v) => !v)}
      >
        Kategoriya
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} nav-category-chevron`} aria-hidden />
      </button>
      {open ? (
        <div className="nav-category-panel" id="nav-category-panel-desktop" role="navigation" aria-labelledby="nav-category-trigger-desktop">
          <button
            type="button"
            className={`catalog-cat-chip catalog-cat-chip--sidebar ${!categoryFromUrl ? 'is-active' : ''}`}
            onClick={() => pickCategory('')}
          >
            Hammasi
          </button>
          {displayCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`catalog-cat-chip catalog-cat-chip--sidebar ${categoryFromUrl === cat ? 'is-active' : ''}`}
              onClick={() => pickCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mobil: hamburger menyu ichida kategoriya (topbar tugmasidan mustaqil) */
export function NavCategoryHamburgerSection() {
  const ctx = useNavCategory();
  const [localOpen, setLocalOpen] = useState(false);
  if (!ctx) return null;

  const { pickCategory, categoryFromUrl, displayCategories, isMobile } = ctx;
  if (!isMobile) return null;

  const choose = (cat) => {
    pickCategory(cat);
    setLocalOpen(false);
  };

  return (
    <div className="nav-category-dropdown nav-category-hamburger-slot">
      <button
        type="button"
        className={`nav-category-trigger ${localOpen ? 'is-open' : ''} ${categoryFromUrl ? 'has-filter' : ''}`}
        aria-expanded={localOpen}
        aria-controls="nav-category-panel-hamburger"
        id="nav-category-trigger-hamburger"
        onClick={() => setLocalOpen((v) => !v)}
      >
        Kategoriya
        <i className={`fas fa-chevron-${localOpen ? 'up' : 'down'} nav-category-chevron`} aria-hidden />
      </button>
      {localOpen ? (
        <div
          className="nav-category-panel"
          id="nav-category-panel-hamburger"
          role="navigation"
          aria-labelledby="nav-category-trigger-hamburger"
        >
          <button
            type="button"
            className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill ${!categoryFromUrl ? 'is-active' : ''}`}
            onClick={() => choose('')}
          >
            Hammasi
          </button>
          {displayCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill ${categoryFromUrl === cat ? 'is-active' : ''}`}
              onClick={() => choose(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mobil: topbardagi tugma — overlay `/products` ga yo‘naltiradi */
export function NavCategoryMobileTrigger() {
  const ctx = useNavCategory();
  if (!ctx) return null;

  const { open, setOpen, categoryFromUrl, mobileTriggerRef, isMobile } = ctx;
  if (!isMobile) return null;

  return (
    <button
      type="button"
      ref={mobileTriggerRef}
      className={`nav-category-trigger nav-category-mobile-bar ${open ? 'is-open' : ''} ${categoryFromUrl ? 'has-filter' : ''}`}
      aria-expanded={open}
      aria-controls="nav-category-panel-mobile"
      id="nav-category-trigger-mobile"
      onClick={() => setOpen((v) => !v)}
    >
      Kategoriya
      <i className={`fas fa-chevron-${open ? 'up' : 'down'} nav-category-chevron`} aria-hidden />
    </button>
  );
}
