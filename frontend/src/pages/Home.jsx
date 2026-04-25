import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const API = '/api';

/** Bosh sahifa: footer ustida — barcha mijozlar ko‘radi */
const HOME_BENEFITS = [
  {
    accent: 'delivery',
    icon: 'fa-truck-fast',
    title: 'Tezkor yetkazib berish xizmati',
    text: "Buyurtmangiz O'zbekistonning ko'plab hududlariga 1–3 kun ichida yetkazib beriladi.",
  },
  {
    accent: 'payment',
    icon: 'fa-credit-card',
    title: "To'lov istalgan usulda",
    text: "Buyurtmani oldindan Click, Payme orqali yoki buyurtmani qo'lingizga olganingizdan keyin amalga oshiring.",
  },
  {
    accent: 'support',
    icon: 'fa-comments',
    title: 'Qo‘llab-quvvatlash',
    text: "Savollar bo'yicha yordam: +998 71 123 45 67. Telegram orqali ham yozishingiz mumkin.",
  },
  {
    accent: 'loyalty',
    icon: 'fa-gift',
    title: "Mijozlarni rag'batlantirish tizimi",
    text: "Doimiy mijozlar uchun aksiyalar, chegirmalar va maxsus takliflar.",
  },
];

/** `public/images` — `/images/...`; API ishlamaganda ham banner ko‘rinsin */
const FALLBACK_AD_SLIDES = [
  { id: 1, title: 'Yangi kelganlar', text: 'Eng so\'nggi mahsulotlar do\'konimizda', image: '/images/atir.webp' },
  { id: 2, title: 'Chegirmalar', text: 'Aksiyali narxlardan bahramand bo\'ling', image: '/images/blender.webp' },
  { id: 3, title: 'Bepul yetkazib berish', text: '500 000 so\'mdan ortiq buyurtmalarda', image: '/images/espander-universalnyy-168033-1.jpeg' },
  { id: 4, title: 'Tez yetkazib berish', text: 'Buyurtmangiz 1–3 kun ichida', image: '/images/photo_2026-03-22_18-25-13.jpg' },
  { id: 5, title: 'Kafolat', text: 'Sifat kafolati va qaytarish imkoniyati', image: '/images/photo_2026-03-22_18-26-16.jpg' },
  { id: 6, title: 'MyShop', text: 'Xavfsiz va qulay onlayn do\'kon', image: '/images/photo_2026-03-22_18-26-37.jpg' },
];

function youtubeVideoId(url) {
  const s = String(url || '');
  const m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?/#]+)/i);
  return m ? m[1] : null;
}

function AdSliderSlide({ slide, isActive }) {
  const videoRef = useRef(null);
  const v = String(slide.video_url || '').trim();
  const img = String(slide.image_url || '').trim();
  const yid = v ? youtubeVideoId(v) : null;
  const showVideo = Boolean(v);
  const showImage = Boolean(img) && !showVideo;
  const hasMedia = showVideo || showImage;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || yid) return;
    if (isActive) {
      el.play().catch(() => {});
    } else {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [isActive, yid, v, slide.id]);

  const caption = (
    <div className="ad-slider-slide-caption">
      <h3>{slide.title}</h3>
      {slide.text ? <p>{slide.text}</p> : null}
    </div>
  );

  const mediaBlock = (
    <div className="ad-slider-slide-media" aria-hidden={!hasMedia}>
      {showVideo && yid ? (
        <iframe
          key={`${slide.id}-${isActive ? 'on' : 'off'}`}
          className="ad-slider-slide-iframe"
          src={
            isActive
              ? `https://www.youtube.com/embed/${yid}?autoplay=1&mute=1&playsinline=1&rel=0`
              : `https://www.youtube.com/embed/${yid}?mute=1&playsinline=1&rel=0`
          }
          title={slide.title || 'Reklama videosi'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : null}
      {showVideo && !yid ? (
        <video
          ref={videoRef}
          className="ad-slider-slide-video"
          src={v}
          poster={img || undefined}
          muted
          playsInline
          loop
          controls
          preload="auto"
        />
      ) : null}
      {showImage ? (
        <img
          src={img}
          alt=""
          className="ad-slider-slide-img--fill"
          decoding="async"
          fetchPriority={isActive ? 'high' : 'low'}
        />
      ) : null}
    </div>
  );

  const textOnlyInner = (
    <>
      <div className="ad-slider-slide-fallback" />
      <div className="ad-slider-slide-textonly">
        <h3>{slide.title}</h3>
        {slide.text ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>{slide.text}</p> : null}
      </div>
    </>
  );

  const u = (slide.link_url || '').trim();

  if (hasMedia) {
    const captionHit =
      /^https?:\/\//i.test(u) ? (
        <a href={u} target="_blank" rel="noopener noreferrer" className="ad-slider-slide-caption-hit">
          {caption}
        </a>
      ) : u.startsWith('/') ? (
        <Link to={u} className="ad-slider-slide-caption-hit">
          {caption}
        </Link>
      ) : (
        caption
      );

    return (
      <div className="ad-slider-slide-inner ad-slider-slide-inner--media">
        {mediaBlock}
        {captionHit}
      </div>
    );
  }

  if (/^https?:\/\//i.test(u)) {
    return (
      <a href={u} target="_blank" rel="noopener noreferrer" className="ad-slider-slide-link">
        {textOnlyInner}
      </a>
    );
  }
  if (u.startsWith('/')) {
    return <Link to={u} className="ad-slider-slide-link">{textOnlyInner}</Link>;
  }
  return <div className="ad-slider-slide-inner">{textOnlyInner}</div>;
}

export default function Home() {
  const { user } = useAuth();
  const { add } = useCart();
  const isSeller = String(user?.role || '').toLowerCase() === 'seller';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adIndex, setAdIndex] = useState(0);
  const [adSlidesRemote, setAdSlidesRemote] = useState(null);
  const adTimerRef = useRef(null);

  const adSlidesDisplay = useMemo(() => {
    if (adSlidesRemote === null) {
      return FALLBACK_AD_SLIDES.map((s) => ({
        id: s.id,
        title: s.title,
        text: s.text,
        link_url: '',
        image_url: s.image || '',
        video_url: '',
      }));
    }
    if (adSlidesRemote.length > 0) {
      return adSlidesRemote.map((s) => ({
        id: s.id,
        title: s.title,
        text: s.subtitle || '',
        link_url: s.link_url || '',
        image_url: s.image_url || '',
        video_url: s.video_url || '',
      }));
    }
    return FALLBACK_AD_SLIDES.map((s) => ({
      id: s.id,
      title: s.title,
      text: s.text,
      link_url: '',
      image_url: s.image || '',
      video_url: '',
    }));
  }, [adSlidesRemote]);

  useEffect(() => {
    fetch(`${API}/products`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/ad-slides`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAdSlidesRemote(Array.isArray(d.slides) ? d.slides : []);
      })
      .catch(() => {
        if (!cancelled) setAdSlidesRemote([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAdIndex((i) => {
      const n = adSlidesDisplay.length;
      if (n === 0) return 0;
      return i % n;
    });
  }, [adSlidesDisplay.length]);

  useEffect(() => {
    const n = adSlidesDisplay.length;
    if (n === 0) return undefined;
    adTimerRef.current = setInterval(() => {
      setAdIndex((i) => (i + 1) % n);
    }, 5000);
    return () => clearInterval(adTimerRef.current);
  }, [adSlidesDisplay.length]);

  const formatPrice = (n) => new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';

  const activeProducts = products.filter((p) => (p.status === 'active' || !p.status) && p.stock > 0);
  const ommabop = activeProducts.slice(0, 12);
  const ommabopDuplicated = [...ommabop, ...ommabop];
  const gridProducts = activeProducts;
  const disabledProducts = products.filter((p) => (p.status === 'active' || !p.status) && p.stock <= 0);

  function ProductCard({ p, className = '', showAdd = true }) {
    const isDisabled = (p.stock ?? 0) <= 0;
    return (
      <article className={`card product-card ${isDisabled ? 'disabled' : ''} ${className}`}>
        <Link to={`/products/${p.id}`} className="product-card-link">
          <div className="product-image">
            {p.image_url ? <img src={p.image_url} alt={p.name_uz} /> : <div className="product-placeholder" />}
          </div>
          <div className="product-card-body">
            <h3>{p.name_uz}</h3>
            <p className="product-price">{formatPrice(p.sale_price ?? p.price)}</p>
          </div>
        </Link>
        {showAdd && !isDisabled && (
          <div className="product-card-actions">
            <button type="button" className="btn btn-primary" onClick={() => add(p)}>Savatga</button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="home-page">
      {adSlidesDisplay.length > 0 ? (
        <section className="ad-slider-section ad-slider-section--fullwidth" aria-label="Asosiy banner">
          <div className="ad-slider">
            <div className="ad-slider-track" style={{ transform: `translateX(-${adIndex * 100}%)` }}>
              {adSlidesDisplay.map((slide, i) => {
                const hasBannerMedia = Boolean(String(slide.video_url || '').trim() || String(slide.image_url || '').trim());
                return (
                  <div key={slide.id} className={`ad-slider-slide${hasBannerMedia ? ' ad-slider-slide--media' : ''}`}>
                    <AdSliderSlide slide={slide} isActive={i === adIndex} />
                  </div>
                );
              })}
            </div>
            <div className="ad-slider-dots">
              {adSlidesDisplay.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ad-slider-dot ${i === adIndex ? 'active' : ''}`}
                  onClick={() => setAdIndex(i)}
                  aria-label={`Reklama ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="container">
        <section className="home-products">
          <div className="home-products-heading-row">
            <div className="home-section-heading">
              <h2 className="home-section-title">Eng ommabop mahsulotlar</h2>
            </div>
            {isSeller ? (
              <Link to="/seller?view=products" className="btn btn-secondary btn-sm">
                Yangi mahsulot qo‘shish
              </Link>
            ) : null}
          </div>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Yuklanmoqda...</p>
          ) : ommabop.length > 0 ? (
            <div className="home-ommabop-wrap home-ommabop-wrap--fullbleed">
              <div className="home-ommabop-track">
                {ommabopDuplicated.map((p) => (
                  <ProductCard key={`${p.id}-${p.name_uz}`} p={p} />
                ))}
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Hozircha mahsulot yo&apos;q.</p>
          )}
        </section>

        <section className="home-products home-products-grid">
          <div className="home-section-heading">
            <h2 className="home-section-title">Barcha mahsulotlar</h2>
          </div>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Yuklanmoqda...</p>
          ) : (
            <div className="product-grid">
              {gridProducts.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
              {disabledProducts.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
          {!loading && products.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <Link to="/products" className="btn btn-secondary home-all-products-cta">
                Barcha mahsulotlar
                <i className="fas fa-arrow-right home-all-products-cta-icon" aria-hidden />
              </Link>
            </div>
          )}
        </section>
      </div>

      <section className="home-benefits" aria-labelledby="home-benefits-heading">
        <div className="container">
          <h2 id="home-benefits-heading" className="home-benefits-title">
            MyShop qulayliklari
          </h2>
          <div className="home-benefits-grid">
            {HOME_BENEFITS.map((item) => (
              <div key={item.title} className={`home-benefits-card home-benefits-card--${item.accent}`}>
                <div className="home-benefits-icon-wrap" aria-hidden>
                  <i className={`fas ${item.icon} home-benefits-icon`} />
                </div>
                <h3 className="home-benefits-card-title">{item.title}</h3>
                <p className="home-benefits-card-text">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
