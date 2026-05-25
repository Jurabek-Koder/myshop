import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './StaffChipDropdown.css';

/**
 * Katalog «Kategoriya» dropdown dizayni — chip ro‘yxat + shisha panel (packer / expeditor).
 */
export default function StaffChipDropdown({
  value,
  onChange,
  options = [],
  emptyValue = '',
  emptyLabel = 'Hammasi',
  disabled = false,
  title = '',
  className = '',
  instanceId = 'staff-chip-dropdown',
}) {
  const [open, setOpen] = useState(false);
  const [panelTop, setPanelTop] = useState(null);
  const wrapRef = useRef(null);

  const selectedName = useMemo(() => {
    if (value === emptyValue || value == null || String(value) === '') return emptyLabel;
    const hit = options.find((o) => String(o.value) === String(value));
    return hit?.label || emptyLabel;
  }, [value, emptyValue, emptyLabel, options]);

  const hasFilter = value !== emptyValue && value != null && String(value) !== '';

  const pick = useCallback(
    (next) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  const triggerId = `${instanceId}-trigger`;
  const panelId = `${instanceId}-panel`;

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
      setPanelTop(null);
      return undefined;
    }
    const el = wrapRef.current;
    if (!el || typeof window === 'undefined') return undefined;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setPanelTop(Math.max(0, Math.ceil(rect.bottom + 6)));
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
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      className={`catalog-category-dropdown staff-chip-dropdown${className ? ` ${className}` : ''}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={`catalog-mobile-category-trigger staff-chip-dropdown__trigger${open ? ' is-open' : ''}${hasFilter ? ' has-filter' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        id={triggerId}
        title={title}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="catalog-mobile-category-trigger-label">{selectedName}</span>
        <i
          className={`fas fa-chevron-${open ? 'up' : 'down'} catalog-mobile-category-trigger-chevron`}
          aria-hidden
        />
      </button>
      {open && !disabled && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                className="catalog-category-dropdown-backdrop"
                aria-hidden
                onClick={() => setOpen(false)}
              />
              <nav
                id={panelId}
                className="catalog-mobile-category-nav catalog-mobile-category-nav--dropdown staff-chip-dropdown__panel"
                aria-labelledby={triggerId}
                style={panelTop != null ? { top: `${panelTop}px` } : undefined}
              >
                <button
                  type="button"
                  className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill${!hasFilter ? ' is-active' : ''}`}
                  onClick={() => pick(emptyValue)}
                >
                  {emptyLabel}
                </button>
                {options.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill${String(value) === String(opt.value) ? ' is-active' : ''}`}
                    onClick={() => pick(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </nav>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
