import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './StaffChipDropdown.css';
import './StaffTopbarBalanceDropdown.css';

/**
 * Topbar balans dropdowni (mobil): bitta tugma — ochilganda
 * sklad mahsulotlari balansi + (tanlangan) kuryer balansi ko‘rinadi.
 * Panel joylashuvi StaffChipDropdown bilan bir xil (responsive portal).
 */
export default function StaffTopbarBalanceDropdown({
  triggerLabel = 'Balans',
  rows = [],
  alert = false,
  title = '',
  className = '',
  instanceId = 'staff-balance-dropdown',
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const [isMobilePanel, setIsMobilePanel] = useState(false);
  const wrapRef = useRef(null);

  const triggerId = `${instanceId}-trigger`;
  const panelId = `${instanceId}-panel`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }
    const el = wrapRef.current;
    if (!el || typeof window === 'undefined') return undefined;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      setIsMobilePanel(mobile);

      if (mobile) {
        setPanelStyle({ top: `${Math.max(0, Math.ceil(rect.bottom + 6))}px` });
        return;
      }

      const panelWidth = Math.max(240, Math.ceil(rect.width));
      let left = Math.ceil(rect.left);
      const maxLeft = window.innerWidth - panelWidth - 8;
      if (left > maxLeft) left = Math.max(8, maxLeft);

      setPanelStyle({
        '--staff-chip-panel-top': `${Math.max(0, Math.ceil(rect.bottom + 6))}px`,
        '--staff-chip-panel-left': `${left}px`,
        '--staff-chip-panel-width': `${panelWidth}px`,
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isMobilePanel) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobilePanel]);

  return (
    <div
      className={`catalog-category-dropdown staff-chip-dropdown staff-balance-dropdown${className ? ` ${className}` : ''}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={`catalog-mobile-category-trigger staff-chip-dropdown__trigger staff-balance-dropdown__trigger${open ? ' is-open' : ''}${alert ? ' staff-balance-dropdown__trigger--alert' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        id={triggerId}
        title={title}
        onClick={() => {
          if (typeof window !== 'undefined') {
            setIsMobilePanel(window.matchMedia('(max-width: 767px)').matches);
          }
          setOpen((v) => !v);
        }}
      >
        {alert ? <span className="staff-balance-dropdown__dot" aria-hidden /> : null}
        <span className="catalog-mobile-category-trigger-label">{triggerLabel}</span>
        <i
          className={`fas fa-chevron-${open ? 'up' : 'down'} catalog-mobile-category-trigger-chevron`}
          aria-hidden
        />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div className="catalog-category-dropdown-backdrop" aria-hidden onClick={close} />
              <nav
                id={panelId}
                className={`catalog-mobile-category-nav catalog-mobile-category-nav--dropdown staff-chip-dropdown__panel staff-balance-dropdown__panel${
                  isMobilePanel ? ' staff-chip-dropdown__panel--mobile' : ' staff-chip-dropdown__panel--desktop'
                }`}
                aria-labelledby={triggerId}
                style={panelStyle || undefined}
              >
                {rows.map((r) => (
                  <div
                    key={r.key}
                    className={`staff-balance-dropdown__row${r.danger ? ' staff-balance-dropdown__row--danger' : ''}`}
                  >
                    <span className="staff-balance-dropdown__row-k">{r.label}</span>
                    <span className="staff-balance-dropdown__row-v">{r.value}</span>
                  </div>
                ))}
              </nav>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
