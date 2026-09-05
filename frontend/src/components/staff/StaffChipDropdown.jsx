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
  groups = null,
  triggerLabel = null,
  emptyValue = '',
  emptyLabel = 'Hammasi',
  disabled = false,
  title = '',
  className = '',
  instanceId = 'staff-chip-dropdown',
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const [isMobilePanel, setIsMobilePanel] = useState(false);
  const wrapRef = useRef(null);

  const hasGroups = Array.isArray(groups) && groups.length > 0;

  const selectedName = useMemo(() => {
    if (triggerLabel != null && String(triggerLabel) !== '') return triggerLabel;
    if (value === emptyValue || value == null || String(value) === '') return emptyLabel;
    if (hasGroups) {
      for (const g of groups) {
        if (String(g.value) === String(value)) return g.label;
        const child = (g.options || []).find((o) => String(o.value) === String(value));
        if (child) return child.label;
      }
    }
    const hit = options.find((o) => String(o.value) === String(value));
    return hit?.label || emptyLabel;
  }, [triggerLabel, value, emptyValue, emptyLabel, options, groups, hasGroups]);

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
        setPanelStyle({
          top: `${Math.max(0, Math.ceil(rect.bottom + 6))}px`,
        });
        return;
      }

      const panelWidth = Math.max(260, Math.ceil(rect.width));
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
          if (typeof window !== 'undefined') {
            setIsMobilePanel(window.matchMedia('(max-width: 767px)').matches);
          }
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
                className={`catalog-mobile-category-nav catalog-mobile-category-nav--dropdown staff-chip-dropdown__panel${
                  isMobilePanel ? ' staff-chip-dropdown__panel--mobile' : ' staff-chip-dropdown__panel--desktop'
                }`}
                aria-labelledby={triggerId}
                style={panelStyle || undefined}
              >
                <button
                  type="button"
                  className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill${!hasFilter ? ' is-active' : ''}`}
                  onClick={() => pick(emptyValue)}
                >
                  {emptyLabel}
                </button>
                {hasGroups
                  ? groups.map((g) => (
                      <div className="staff-chip-dropdown__group" key={`g-${String(g.value)}`}>
                        {g.selectable === false ? (
                          <div className="staff-chip-dropdown__group-head staff-chip-dropdown__group-head--static">
                            {g.label}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill staff-chip-dropdown__group-head${String(value) === String(g.value) ? ' is-active' : ''}`}
                            onClick={() => pick(g.value)}
                          >
                            {g.label}
                          </button>
                        )}
                        {(g.options || []).map((opt) => (
                          <button
                            key={String(opt.value)}
                            type="button"
                            className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill staff-chip-dropdown__group-item${String(value) === String(opt.value) ? ' is-active' : ''}`}
                            onClick={() => pick(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ))
                  : options.map((opt) => (
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
