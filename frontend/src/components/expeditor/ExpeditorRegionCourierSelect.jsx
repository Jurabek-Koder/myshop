import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../staff/StaffChipDropdown.css';
import './ExpeditorRegionCourierSelect.css';

/**
 * Mobil: birlashgan «Viloyat / kuryer» tanlovi — ikki bosqichli.
 *  1-modal: barcha viloyatlar.
 *  Viloyatga bosilsa — ustidan 2-modal: shu viloyat kuryerlari.
 *  Kuryer tanlansa — hamma modal yopiladi.
 */
export default function ExpeditorRegionCourierSelect({
  triggerLabel = 'Viloyat / kuryer',
  hasFilter = false,
  regions = [],
  couriersByVid = {},
  disabled = false,
  title = '',
  className = '',
  instanceId = 'expeditor-region-courier',
  onSelectAll,
  onSelectRegion,
  onSelectCourier,
}) {
  const [open, setOpen] = useState(false);
  const [drillVid, setDrillVid] = useState(null);
  const [panelStyle, setPanelStyle] = useState(null);
  const [isMobilePanel, setIsMobilePanel] = useState(false);
  const wrapRef = useRef(null);

  const triggerId = `${instanceId}-trigger`;
  const panelId = `${instanceId}-panel`;

  const closeAll = useCallback(() => {
    setOpen(false);
    setDrillVid(null);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setDrillVid((cur) => {
        if (cur) return null;
        setOpen(false);
        return null;
      });
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

  const drillRegion = drillVid ? regions.find((r) => r.id === drillVid) : null;
  const drillCouriers = drillVid ? couriersByVid[drillVid] || [] : [];
  const panelModeClass = isMobilePanel
    ? ' staff-chip-dropdown__panel--mobile'
    : ' staff-chip-dropdown__panel--desktop';

  return (
    <div
      className={`catalog-category-dropdown staff-chip-dropdown erc${className ? ` ${className}` : ''}`}
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
          setDrillVid(null);
          setOpen((v) => !v);
        }}
      >
        <span className="catalog-mobile-category-trigger-label">{triggerLabel}</span>
        <i
          className={`fas fa-chevron-${open ? 'up' : 'down'} catalog-mobile-category-trigger-chevron`}
          aria-hidden
        />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <>
              {/* 1-bosqich: barcha viloyatlar */}
              <div className="catalog-category-dropdown-backdrop" aria-hidden onClick={closeAll} />
              <nav
                id={panelId}
                className={`catalog-mobile-category-nav catalog-mobile-category-nav--dropdown staff-chip-dropdown__panel${panelModeClass}`}
                aria-labelledby={triggerId}
                style={panelStyle || undefined}
              >
                <button
                  type="button"
                  className={`catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill${!hasFilter ? ' is-active' : ''}`}
                  onClick={() => {
                    onSelectAll?.();
                    closeAll();
                  }}
                >
                  Barcha viloyat / kuryer
                </button>
                {regions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill erc-region-chip"
                    onClick={() => setDrillVid(r.id)}
                  >
                    <span className="erc-region-chip__name">{r.name}</span>
                    {r.count ? <span className="erc-region-chip__count">{r.count}</span> : null}
                    <i className="fas fa-chevron-right erc-region-chip__go" aria-hidden />
                  </button>
                ))}
              </nav>

              {/* 2-bosqich: tanlangan viloyat kuryerlari (ustidan) */}
              {drillVid ? (
                <>
                  <div
                    className="catalog-category-dropdown-backdrop erc-backdrop--step2"
                    aria-hidden
                    onClick={() => setDrillVid(null)}
                  />
                  <nav
                    className={`catalog-mobile-category-nav catalog-mobile-category-nav--dropdown staff-chip-dropdown__panel erc-panel--step2${panelModeClass}`}
                    aria-label={drillRegion?.name || 'Kuryerlar'}
                    style={panelStyle || undefined}
                  >
                    <button
                      type="button"
                      className="catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill erc-back-chip"
                      onClick={() => setDrillVid(null)}
                    >
                      <i className="fas fa-chevron-left" aria-hidden /> {drillRegion?.name || 'Orqaga'}
                    </button>
                    {drillVid !== '__other__' ? (
                      <button
                        type="button"
                        className="catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill"
                        onClick={() => {
                          onSelectRegion?.(drillVid);
                          closeAll();
                        }}
                      >
                        Barcha kuryer (butun viloyat)
                      </button>
                    ) : null}
                    {drillCouriers.map((c) => (
                      <button
                        key={String(c.id)}
                        type="button"
                        className="catalog-cat-chip catalog-cat-chip--sidebar catalog-cat-chip--mobile-pill"
                        onClick={() => {
                          onSelectCourier?.(String(c.id));
                          closeAll();
                        }}
                      >
                        {c.full_name || `Kuryer #${c.id}`}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </button>
                    ))}
                    {drillCouriers.length === 0 ? (
                      <div className="erc-empty">Bu viloyatda kuryer yo‘q.</div>
                    ) : null}
                  </nav>
                </>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
