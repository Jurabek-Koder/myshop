import React from 'react';
import './StaffHomeProductCard.css';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function defaultImageSrc(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return s;
  return `/uploads/${s.replace(/^\/+/, '')}`;
}

function StaffHomeProductCardStats({ warehouseStock, orderCount }) {
  return (
    <div className="operator-home-card-stats" aria-label="Ombor va zakazlar soni">
      <span className="operator-home-card-stat operator-home-card-stat--stock" title="Ombordagi soni">
        {warehouseStock}
      </span>
      <span className="operator-home-card-stat operator-home-card-stat--orders" title="Zakazlar soni">
        {orderCount}
      </span>
    </div>
  );
}

function StaffHomeProductCardBody({ name, price, priceLabel, hidePrice = false }) {
  const bodyClass = hidePrice
    ? 'product-card-body packer-card-title-pane'
    : 'product-card-body operator-home-card-footer';
  return (
    <div className={bodyClass}>
      <h3>{name}</h3>
      {!hidePrice ? (
        <p className="product-price operator-home-card-price">{priceLabel ?? formatCurrency(price)}</p>
      ) : null}
    </div>
  );
}

function StaffHomeProductCardImage({ name, imageUrl, resolveImageUrl = defaultImageSrc }) {
  const src = resolveImageUrl(imageUrl);
  return (
    <div className="product-image">
      {src ? <img src={src} alt={name || ''} /> : <div className="product-placeholder" />}
    </div>
  );
}

export default function StaffHomeProductCard({
  name,
  price,
  priceLabel,
  imageUrl,
  warehouseStock = 0,
  orderCount = 0,
  blocked: blockedProp,
  onClick,
  onImageClick,
  onBodyClick,
  imageOverlay = null,
  resolveImageUrl = defaultImageSrc,
  className = '',
  ariaLabel,
  hidePrice = false,
}) {
  const warehouse = Number(warehouseStock ?? 0);
  const orders = Number(orderCount ?? 0);
  const isBlocked = blockedProp ?? warehouse <= 0;
  const cardClass = `card product-card operator-home-product-card staff-home-product-card${isBlocked ? ' disabled operator-home-product-card--blocked' : ''}${className ? ` ${className}` : ''}`;

  if (onClick && !onImageClick && !onBodyClick) {
    return (
      <article className={cardClass}>
        <button
          type="button"
          className="product-card-link operator-home-product-card-btn"
          onClick={() => {
            if (!isBlocked) void onClick();
          }}
          disabled={isBlocked}
          aria-label={ariaLabel || name || 'Mahsulot'}
          aria-disabled={isBlocked}
        >
          <StaffHomeProductCardImage name={name} imageUrl={imageUrl} resolveImageUrl={resolveImageUrl} />
          <StaffHomeProductCardStats warehouseStock={warehouse} orderCount={orders} />
          <StaffHomeProductCardBody name={name} price={price} priceLabel={priceLabel} hidePrice={hidePrice} />
        </button>
      </article>
    );
  }

  return (
    <article className={cardClass}>
      <div className="operator-home-product-card-stack">
        <div className="staff-home-product-card-media">
          {imageOverlay}
          <button
            type="button"
            className="staff-home-product-card-media-btn"
            onClick={() => void onImageClick?.()}
            aria-label={ariaLabel || name || 'Mahsulot'}
          >
            <StaffHomeProductCardImage name={name} imageUrl={imageUrl} resolveImageUrl={resolveImageUrl} />
          </button>
        </div>
        <StaffHomeProductCardStats warehouseStock={warehouse} orderCount={orders} />
        <button
          type="button"
          className="staff-home-product-card-body-btn"
          onClick={() => void onBodyClick?.()}
        >
          <StaffHomeProductCardBody name={name} price={price} priceLabel={priceLabel} hidePrice={hidePrice} />
        </button>
      </div>
    </article>
  );
}
