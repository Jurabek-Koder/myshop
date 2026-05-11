import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDateTimePartsInUzbekistan } from '../utils/uzbekistanTime.js';
import SiteMessages from './SiteMessages';
import CustomerCategoryDropdown from './CustomerCategoryDropdown';
import RouteLoader from './RouteLoader.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef(null);

  const isCustomer = Boolean(user && String(user?.role || '').toLowerCase() === 'customer');
  const isCheckoutPage = location.pathname === '/checkout';

  const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  useEffect(() => {
    if (!location.pathname.startsWith('/products')) {
      setMobileSearch('');
      setMobileSearchOpen(false);
      return;
    }
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    setMobileSearch(q);
    setMobileSearchOpen(Boolean(q));
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 991px)');
    const applyBodyScrollLock = () => {
      if (mq.matches && menuOpen) document.body.style.overflow = 'hidden';
      else document.body.style.overflow = '';
    };
    applyBodyScrollLock();
    mq.addEventListener('change', applyBodyScrollLock);
    return () => {
      mq.removeEventListener('change', applyBodyScrollLock);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const submitMobileSearch = (e) => {
    e.preventDefault();
    if (!mobileSearchOpen) {
      setMobileSearchOpen(true);
      window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
      return;
    }
    const q = mobileSearch.trim();
    if (!q) {
      navigate('/products');
      setMobileSearchOpen(false);
      return;
    }
    navigate(`/products?q=${encodeURIComponent(q)}`);
  };

  const collapseMobileSearchIfEmpty = () => {
    if (!mobileSearch.trim()) setMobileSearchOpen(false);
  };

  return (
    <>
      <header className="site-header">
        <div className="main-bar">
          <div className="container header-inner">
            <Link to="/" className="logo" onClick={() => setMenuOpen(false)}>
              <span className="logo-text">MyShop</span>
              <span className="deco-line" />
            </Link>
            <div className="header-mobile-actions">
              <form
                className={`mobile-top-search ${mobileSearchOpen || mobileSearch.trim() ? 'is-open' : 'is-collapsed'}`}
                onSubmit={submitMobileSearch}
              >
                <input
                  ref={mobileSearchInputRef}
                  type="search"
                  value={mobileSearch}
                  onChange={(e) => setMobileSearch(e.target.value)}
                  onFocus={() => setMobileSearchOpen(true)}
                  onBlur={collapseMobileSearchIfEmpty}
                  placeholder="Mahsulot qidirish..."
                  aria-label="Mahsulot qidirish"
                />
                <button type="submit" aria-label={mobileSearchOpen ? 'Qidirish' : 'Qidiruvni ochish'}>
                  <i className="fas fa-search" aria-hidden />
                </button>
              </form>
              <button type="button" className="nav-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menyu">
                <span className={menuOpen ? 'open' : ''} />
                <span className={menuOpen ? 'open' : ''} />
                <span className={menuOpen ? 'open' : ''} />
              </button>
            </div>
            <nav className={`nav ${menuOpen ? 'nav-open' : ''}`}>
              <Link to="/" className={isActive('/') ? 'active' : ''} onClick={() => setMenuOpen(false)}>Bosh sahifa</Link>
              <Link to="/products" className={isActive('/products') ? 'active' : ''} onClick={() => setMenuOpen(false)}>Mahsulotlar</Link>
              <Link to="/aksiya" className={isActive('/aksiya') ? 'active' : ''} onClick={() => setMenuOpen(false)}>Aksiya</Link>
              <CustomerCategoryDropdown onNavigate={() => setMenuOpen(false)} />
              {isCustomer ? <SiteMessages /> : null}
              {user ? (
                <>
                  {(String(user?.role || '').toLowerCase() === 'superuser' || user.role_id === 1) && (
                    <Link to="/admin" className={isActive('/admin') ? 'active' : ''} onClick={() => setMenuOpen(false)}>Boshqaruv paneli</Link>
                  )}
                  {String(user?.role || '').toLowerCase() === 'seller' && (
                    <Link to="/seller" className={isActive('/seller') ? 'active' : ''} onClick={() => setMenuOpen(false)}>Seller paneli</Link>
                  )}
                  {String(user?.role || '').toLowerCase() === 'courier' && (
                    <Link to="/courier" className={isActive('/courier') ? 'active' : ''} onClick={() => setMenuOpen(false)}>Kuryer paneli</Link>
                  )}
                  {String(user?.role || '').toLowerCase() === 'customer' && (
                    <Link
                      to="/profile"
                      className={isActive('/profile') ? 'active' : ''}
                      onClick={() => setMenuOpen(false)}
                    >
                      Profil
                    </Link>
                  )}
                  {!isCustomer ? <span className="nav-user">{user.full_name}</span> : null}
                  <button type="button" className="btn btn-outline-sm" onClick={() => { logout(); navigate('/'); setMenuOpen(false); }}>Chiqish</button>
                </>
              ) : (
                <Link
                  to="/profile"
                  className={isActive('/profile') ? 'active' : ''}
                  onClick={() => setMenuOpen(false)}
                >
                  Profil
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>
      <main className={`main${isCheckoutPage ? ' main--compact' : ''}`}>
        <Suspense fallback={<RouteLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="site-footer">
        <div className="footer-top-bar">
          <div className="container footer-top-bar-inner">
            <span className="footer-top-bar-text">
              Bepul yetkazib berish {'\u2014'} 500 000 so&apos;mdan ortiq buyurtmalarda
            </span>
            <span className="footer-top-bar-phone">+998 71 123 45 67</span>
          </div>
        </div>
        <div className="container footer-inner">
          <div className="deco-line" style={{ margin: '0 auto 1rem' }} />
          <p>
            MyShop {'\u2014'} xavfsiz onlayn do&apos;kon. &copy;{' '}
            {getDateTimePartsInUzbekistan(new Date())?.year ?? new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </>
  );
}

