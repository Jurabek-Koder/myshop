import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Sklad kataklari sarlavalari — `.warehouse-admin-top-vseg-label` */
export const WAREHOUSE_GRID_HEADERS = [
  'Seller',
  'Maxsulot rasmi',
  'Nomi',
  'Mahsulot ID',
  'Soni',
  'Maxsulot summasi',
  'Kirim soni',
  'Chiqim soni',
  'Atkaz soni',
  'Brak maxsulot',
  'Sana',
  'Umumiy soni',
  'Tasdiqlash',
];

/** Birlik narxi (aksiya bo‘lsa chegirmali) — `products` API bilan mos */
export function warehouseUnitDisplaySum(p) {
  const base = Number(p?.price) || 0;
  const discount = Number(p?.discount_percent) || 0;
  if (discount > 0) return Math.round(base * (1 - discount / 100));
  return Math.round(base);
}

export function formatWarehouseProductSumUz(p) {
  const unit = warehouseUnitDisplaySum(p);
  return `${new Intl.NumberFormat('uz-UZ').format(unit)} so'm`;
}

/** Ombor ledger — PATCH /warehouse-admin/products/:id/warehouse-ledger */
export function LedgerQtyEditor({
  product: p,
  field,
  hintLabel,
  hintValue,
  confirmSlug,
  confirmedAt,
  onReload,
  request,
  compact = false,
  hideConfirmButton = false,
  readOnly = false,
  /** `compact` rejimida: avval raqam, bosilganda input + Saqlash */
  expandOnClick = false,
  /** `true`: ochilganda faqat input (Tasdiqlash jadval oxiridagi ustunda) */
  deferConfirmToActionsColumn = false,
  reportState,
  /** Boshqa qatordagi chiqim ochilganda bu qator yopiladi */
  peerExclusiveExpandedProductId = null,
  /** Bekor — ota `cancelExpandKey` ni oshiradi */
  cancelExpandKey = 0,
}) {
  const fv = Number(p[field]) || 0;
  const [val, setVal] = useState(String(fv));
  useEffect(() => {
    setVal(String(Number(p[field]) || 0));
  }, [p.id, p[field], field]);
  const [phase, setPhase] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);
  const prevCancelExpandKey = useRef(cancelExpandKey);
  const confirmOkClass =
    field === 'warehouse_kirim_qty'
      ? 'warehouse-admin-ledger-compact-ok warehouse-admin-ledger-compact-ok--kirim'
      : field === 'warehouse_chiqim_qty'
        ? 'warehouse-admin-ledger-compact-ok warehouse-admin-ledger-compact-ok--chiqim'
        : 'warehouse-admin-ledger-compact-ok';

  useEffect(() => {
    setExpanded(false);
  }, [p.id, field]);

  useEffect(() => {
    if (cancelExpandKey !== prevCancelExpandKey.current) {
      prevCancelExpandKey.current = cancelExpandKey;
      setExpanded(false);
    }
  }, [cancelExpandKey]);

  useEffect(() => {
    if (!expandOnClick || !compact || readOnly) return;
    if (
      expanded &&
      peerExclusiveExpandedProductId != null &&
      peerExclusiveExpandedProductId !== p.id
    ) {
      setExpanded(false);
    }
  }, [peerExclusiveExpandedProductId, p.id, expanded, expandOnClick, compact, readOnly]);

  const reportRef = useRef(reportState);
  reportRef.current = reportState;

  useEffect(() => {
    reportRef.current?.({ expanded, val });
  }, [expanded, val]);

  useEffect(() => {
    if (!expanded || !inputRef.current) return;
    const id = requestAnimationFrame(() => {
      try {
        inputRef.current?.focus?.();
        inputRef.current?.select?.();
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  if (readOnly) {
    return (
      <div
        className={`warehouse-admin-ledger warehouse-admin-ledger--compact warehouse-admin-ledger--readonly`}
        title={
          hintLabel != null && hintValue !== undefined && hintValue !== null
            ? `${hintLabel}: ${hintValue}`
            : undefined
        }
        style={{
          minWidth: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 4,
        }}
      >
        <span className="warehouse-admin-ledger-readonly-qty">{fv}</span>
        {confirmedAt && (
          <>
            <span className={confirmOkClass} title="Tasdiqlangan" aria-hidden>
              ✓
            </span>
            <span className="warehouse-admin-ledger-readonly-tasdiq-label">Tasdiqlangan</span>
          </>
        )}
      </div>
    );
  }

  const save = async () => {
    const n = Number.parseInt(String(val).trim(), 10);
    if (!Number.isFinite(n) || n < 0) {
      alert('0 yoki musbat butun son kiriting.');
      return;
    }
    setPhase('save');
    try {
      const res = await request(`/warehouse-admin/products/${p.id}/warehouse-ledger`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: n }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d?.error || 'Saqlanmadi');
        return;
      }
      await onReload();
      setExpanded(false);
    } catch (e) {
      alert(e?.message || 'Tarmoq xatosi');
    } finally {
      setPhase('');
    }
  };

  const confirm = async () => {
    if (!confirmSlug) return;
    setPhase('confirm');
    try {
      const res = await request(`/warehouse-admin/products/${p.id}/${confirmSlug}`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d?.error || 'Tasdiqlanmadi');
        return;
      }
      await onReload();
      setExpanded(false);
    } catch (e) {
      alert(e?.message || 'Tarmoq xatosi');
    } finally {
      setPhase('');
    }
  };

  const nVal = Number.parseInt(String(val).trim(), 10);
  const canConfirm = Boolean(confirmSlug) && !confirmedAt && Number.isFinite(nVal) && nVal >= 1;

  const hintTitle =
    hintLabel != null && hintValue !== undefined && hintValue !== null
      ? `${hintLabel}: ${hintValue}`
      : undefined;

  if (expandOnClick && compact && !readOnly && !expanded) {
    // MUHIM: chiqim bir necha marta (alohida partiyalarda) tasdiqlanishi
    // mumkin bo'lgani uchun, katakcha "tasdiqlangan"dan keyin ham DOIM
    // bosiladigan (tahrirlanadigan) bo'lib qoladi.
    return (
      <button
        type="button"
        className="warehouse-admin-ledger warehouse-admin-ledger--compact warehouse-admin-ledger--click-to-edit"
        title={[hintTitle, 'Tahrirlash uchun bosing'].filter(Boolean).join(' · ')}
        onClick={() => setExpanded(true)}
      >
        <span className="warehouse-admin-ledger-readonly-qty">{fv}</span>
        {confirmedAt && (
          <span className={confirmOkClass} title="Tasdiqlangan">
            ✓
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={compact ? 'warehouse-admin-ledger warehouse-admin-ledger--compact' : undefined}
      title={compact ? [hintTitle, confirmedAt ? 'Tasdiqlangan' : undefined].filter(Boolean).join(' · ') || undefined : undefined}
      style={
        compact
          ? {
              minWidth: 0,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 4,
            }
          : {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 6,
              minWidth: 0,
            }
      }
    >
      {!compact && hintLabel != null && (
        <span style={{ fontSize: 11, opacity: 0.72, textAlign: 'right', lineHeight: 1.25 }}>
          {hintLabel}: <strong>{hintValue}</strong>
        </span>
      )}
      <div
        className={compact ? 'warehouse-admin-ledger-controls' : undefined}
        style={
          compact
            ? undefined
            : { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }
        }
      >
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && expandOnClick && compact) {
              e.preventDefault();
              setExpanded(false);
              setVal(String(Number(p[field]) || 0));
            }
          }}
          disabled={Boolean(phase)}
          className={`warehouse-admin-ledger-input${compact ? ' warehouse-admin-ledger-input--compact' : ''}`}
          aria-label="Miqdor"
        />
        {!(deferConfirmToActionsColumn && compact && expanded) && (
          <>
            <button
              type="button"
              title="Saqlash"
              className="warehouse-admin-ledger-btn"
              onClick={() => void save()}
              disabled={Boolean(phase)}
            >
              {phase === 'save' ? '…' : 'Saqlash'}
            </button>
            {confirmSlug && !confirmedAt && !hideConfirmButton && (
              <button
                type="button"
                title="Tasdiqlash"
                className="warehouse-admin-ledger-btn warehouse-admin-ledger-btn--primary"
                onClick={() => void confirm()}
                disabled={Boolean(phase) || !canConfirm}
              >
                {phase === 'confirm' ? '…' : 'Tasdiqlash'}
              </button>
            )}
          </>
        )}
      </div>
      {deferConfirmToActionsColumn && compact && expanded && !confirmedAt && (
        <span className="warehouse-admin-ledger-hint-actions">Tasdiqlash — jadval oxirida</span>
      )}
      {confirmedAt && !compact && (
        <span style={{ fontSize: 11, color: 'var(--success-text, #16a34a)', fontWeight: 600 }}>Tasdiqlangan</span>
      )}
      {confirmedAt && compact && (
        <>
          <span className={confirmOkClass} title="Tasdiqlangan" aria-hidden>
            ✓
          </span>
          <span className="warehouse-admin-ledger-readonly-tasdiq-label">Tasdiqlangan</span>
        </>
      )}
    </div>
  );
}

/** kirim_sheet — kirim/chiqim jadvali va «sotuvdan olinganlar» */
export function warehousePrimaryActionKind(p, actionsContext) {
  if (actionsContext === 'deleted_sheet') return null;
  if (actionsContext === 'sale_delete_only') return null;
  if (!p?.warehouse_approved_at) return 'approve_kirim';
  if (actionsContext === 'home') {
    if (!p.warehouse_chiqim_confirmed_at && (Number(p.warehouse_chiqim_qty) || 0) >= 1) return 'confirm_chiqim';
    if (p.warehouse_chiqim_confirmed_at && (Number(p.warehouse_chiqim_qty) || 0) >= 1) return 'reverse_chiqim';
    return 'revoke_kirim';
  }
  if (actionsContext === 'kirim_sheet' || actionsContext === 'kirim_page' || actionsContext === 'chiqim_page') {
    if (!p.warehouse_chiqim_confirmed_at && (Number(p.warehouse_chiqim_qty) || 0) >= 1) return 'confirm_chiqim';
    if (p.warehouse_chiqim_confirmed_at && (Number(p.warehouse_chiqim_qty) || 0) >= 1) return 'reverse_chiqim';
    return 'revoke_kirim';
  }
  if (actionsContext === 'atkaz_sheet') {
    if (!p.warehouse_atkaz_confirmed_at && (Number(p.warehouse_atkaz_qty) || 0) >= 1) return 'confirm_atkaz';
    return 'revoke_kirim';
  }
  return null;
}

export function canWarehouseTakeOffSale(p) {
  const st = String(p?.status || '').trim().toLowerCase();
  if (st === 'active' || st === 'approved') return true;
  return Boolean(p?.warehouse_approved_at);
}

export function warehouseRowActionsBusy(p, busy) {
  const id = p.id;
  return (
    busy.approvingId === id ||
    busy.confirmingChiqimId === id ||
    busy.confirmingAtkazId === id ||
    busy.revokingKirimId === id ||
    busy.revokingChiqimId === id ||
    busy.delistingId === id ||
    busy.deletingProductId === id
  );
}

export function WarehouseActionsColumn({
  p,
  actionsContext,
  busy,
  onPrimary,
  onToggleSale,
  onDelete,
  variant = 'grid',
  readOnly = false,
  kirimLedgerOpenForProductId = null,
  kirimLedgerDraftVal = '',
  onKirimLedgerSaveAndApprove,
  onKirimLedgerExpandCancel,
  chiqimLedgerOpenForProductId = null,
  chiqimLedgerDraftVal = '',
  onChiqimLedgerSaveAndConfirm,
  onChiqimLedgerExpandCancel,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const menuPanelRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState(null);

  useEffect(() => {
    if (!menuOpen) {
      setDropdownStyle(null);
      return;
    }
    const handleClick = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        return;
      }
      if (triggerRef.current && triggerRef.current.contains(e.target)) {
        return;
      }
      if (menuPanelRef.current && menuPanelRef.current.contains(e.target)) {
        return;
      }
      setMenuOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !triggerRef.current || typeof window === 'undefined') {
      return;
    }
    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 170;
      let left = Math.ceil(rect.left) - menuWidth - 4;
      const minLeft = 8;
      if (left < minLeft) left = minLeft;
      setDropdownStyle({
        position: 'fixed',
        top: `${Math.max(0, Math.ceil(rect.top))}px`,
        left: `${left}px`,
        zIndex: 9999,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen]);

  if (readOnly) {
    const showTasdiq =
      Boolean(p?.warehouse_approved_at) &&
      (actionsContext === 'kirim_sheet' ||
        actionsContext === 'home' ||
        actionsContext === 'kirim_page' ||
        actionsContext === 'chiqim_page');
    return (
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
        {showTasdiq ? (
          <span className="warehouse-admin-status-label warehouse-admin-status-label--kirim-readonly">
            Tasdiqlangan
          </span>
        ) : (
          <span className="warehouse-admin-num-muted" title="Superuser: faqat ko‘rish">
            —
          </span>
        )}
      </div>
    );
  }

  const isKirimActionsOverlay =
    kirimLedgerOpenForProductId != null &&
    kirimLedgerOpenForProductId === p.id &&
    (actionsContext === 'kirim_sheet' || actionsContext === 'home' || actionsContext === 'kirim_page' || actionsContext === 'chiqim_page');

  if (isKirimActionsOverlay) {
    const n = Number.parseInt(String(kirimLedgerDraftVal ?? '').trim(), 10);
    const canT = Number.isFinite(n) && n >= 1 && !warehouseRowActionsBusy(p, busy);
    return (
      <div
        className="warehouse-admin-grid-cell warehouse-admin-cell-actions warehouse-admin-actions-chiqim-overlay"
        role="gridcell"
      >
        <div className="warehouse-admin-actions-chiqim-overlay-inner">
          <button
            type="button"
            className="warehouse-admin-tasdiq-btn warehouse-admin-tasdiq-btn--chiqim-primary"
            onClick={() => void onKirimLedgerSaveAndApprove?.(p, n)}
            disabled={!canT || busy.approvingId === p.id}
          >
            {busy.approvingId === p.id ? '…' : 'Tasdiqlash'}
          </button>
          <button
            type="button"
            className="warehouse-admin-chiqim-expand-cancel"
            onClick={() => onKirimLedgerExpandCancel?.(p.id)}
          >
            Bekor
          </button>
        </div>
      </div>
    );
  }

  const isChiqimActionsOverlay =
    chiqimLedgerOpenForProductId != null &&
    chiqimLedgerOpenForProductId === p.id &&
    (actionsContext === 'kirim_sheet' || actionsContext === 'home' || actionsContext === 'kirim_page' || actionsContext === 'chiqim_page');

  if (isChiqimActionsOverlay) {
    const n = Number.parseInt(String(chiqimLedgerDraftVal ?? '').trim(), 10);
    // MUHIM: "!p.warehouse_chiqim_confirmed_at" sharti ATAYLAB olib tashlangan —
    // endi bir mahsulotdan bir necha marta, alohida partiyalarda chiqim
    // qilish mumkin (backend endi buni to'sqinlik qilmaydi).
    const canT = Number.isFinite(n) && n >= 1 && !warehouseRowActionsBusy(p, busy);
    return (
      <div
        className="warehouse-admin-grid-cell warehouse-admin-cell-actions warehouse-admin-actions-chiqim-overlay"
        role="gridcell"
      >
        <div className="warehouse-admin-actions-chiqim-overlay-inner">
          <button
            type="button"
            className="warehouse-admin-tasdiq-btn warehouse-admin-tasdiq-btn--chiqim-primary"
            onClick={() => void onChiqimLedgerSaveAndConfirm?.(p, n)}
            disabled={!canT || busy.confirmingChiqimId === p.id}
          >
            {busy.confirmingChiqimId === p.id ? '…' : 'Tasdiqlash'}
          </button>
          <button
            type="button"
            className="warehouse-admin-chiqim-expand-cancel"
            onClick={() => onChiqimLedgerExpandCancel?.(p.id)}
          >
            Bekor
          </button>
        </div>
      </div>
    );
  }

  const isEmbedded = variant === 'embedded';
  const rowBusy = warehouseRowActionsBusy(p, busy);
  const kind = warehousePrimaryActionKind(p, actionsContext);
  const primaryPending =
    busy.approvingId === p.id ||
    busy.confirmingChiqimId === p.id ||
    busy.confirmingAtkazId === p.id ||
    busy.revokingKirimId === p.id;

  const delisted = Boolean(p.warehouse_delisted_at);
  const relisted = Boolean(p.warehouse_relisted_at);
  const canDelist = canWarehouseTakeOffSale(p);

  if (actionsContext === 'deleted_sheet') {
    return (
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
        <span className="warehouse-admin-actions-deleted-label" title="Ombor ro‘yxatidan olib tashlangan">
          Oʻchirilgan
        </span>
      </div>
    );
  }

  if (actionsContext === 'delisted_page') {
    return (
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
        <div className="warehouse-admin-actions-dropdown" ref={menuRef}>
          <button
            type="button"
            ref={triggerRef}
            className="warehouse-admin-actions-dropdown-trigger"
            aria-label="Amallar"
            aria-expanded={menuOpen}
            onMouseDown={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
          >
            <i className="fas fa-ellipsis-v" aria-hidden />
          </button>
          {menuOpen
            ? createPortal(
                <div
                  className="warehouse-admin-actions-dropdown-menu"
                  role="menu"
                  ref={menuPanelRef}
                  style={dropdownStyle || undefined}
                >
                  {relisted ? (
                    <span className="warehouse-admin-status-label warehouse-admin-status-label--relisted">Sotuvga qaytarildi</span>
                  ) : (
                    <button
                      type="button"
                      className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--return"
                      role="menuitem"
                      title="Mahsulotni sotuvga qaytarish"
                      onClick={() => {
                        setMenuOpen(false);
                        void onToggleSale(p);
                      }}
                      disabled={rowBusy || !delisted}
                    >
                      {busy.delistingId === p.id ? '...' : 'Qaytarish'}
                    </button>
                  )}
                </div>,
                document.body,
              )
            : null}
        </div>
      </div>
    );
  }

  const showPrimary = actionsContext !== 'sale_delete_only';
  const primaryDisabled = rowBusy || kind === null;
  const primaryLabel = primaryPending
    ? '...'
    : kind === 'revoke_kirim' || kind === 'reverse_chiqim'
      ? 'Tasdiq bekor'
      : 'Tasdiqlash';

  const showSaleToggle =
    actionsContext !== 'home' && actionsContext !== 'chiqim_page';
  const showDelete = actionsContext !== 'home';

  const saleDisabled = rowBusy || (!delisted && !canDelist);
  const saleLabel =
    busy.delistingId === p.id ? '...' : delisted ? 'Maxsulotni qaytarish' : 'Sotuvdan olish';

  const saleTitle = delisted
    ? 'Mahsulotni qaytarish (sotuvga)'
    : canDelist
      ? 'Saytdan yechish (sotuvdan olinganlar ro‘yxatiga)'
      : 'Avval bosh sahifada kirim tasdiqlang yoki mahsulot sotuvda (active) bo‘lsin';

  const hasActions = showPrimary || showSaleToggle || showDelete;

  if (isEmbedded) {
    return (
      <div className="warehouse-admin-actions-stack warehouse-admin-actions-stack--embedded">
        {showKirimTasdiqLabel && (
          <span className="warehouse-admin-actions-tasdiq-label">Tasdiqlangan</span>
        )}
        {showPrimary && (
          <button
            type="button"
            className="warehouse-admin-tasdiq-btn"
            title={
              primaryDisabled && !primaryPending && kind === null
                ? actionsContext === 'home'
                  ? 'Navbatda tasdiqlash'
                  : 'Hozircha tasdiqlash yoki bekor qilish uchun navbat yo‘q'
                : undefined
            }
            onClick={() => void onPrimary(p, actionsContext)}
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </button>
        )}
        {showSaleToggle && (
          <button
            type="button"
            className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--warn"
            title={saleTitle}
            onClick={() => void onToggleSale(p)}
            disabled={saleDisabled}
          >
            {saleLabel}
          </button>
        )}
        {showDelete && (
          <button
            type="button"
            className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--danger"
            onClick={() => void onDelete(p)}
            disabled={rowBusy}
          >
            {busy.deletingProductId === p.id ? '...' : 'Maxsulotni uchirish'}
          </button>
        )}
      </div>
    );
  }

  const showKirimTasdiqLabel =
    Boolean(p.warehouse_approved_at) && (actionsContext === 'kirim_sheet' || actionsContext === 'home');

  return (
    <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
      <div className="warehouse-admin-actions-dropdown" ref={menuRef}>
        {showKirimTasdiqLabel && (
          <span className="warehouse-admin-actions-tasdiq-label">Tasdiqlangan</span>
        )}
        <button
          type="button"
          ref={triggerRef}
          className="warehouse-admin-actions-dropdown-trigger"
          aria-label="Amallar"
          aria-expanded={menuOpen}
          onMouseDown={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          <i className="fas fa-ellipsis-v" aria-hidden />
        </button>
        {menuOpen && hasActions
          ? createPortal(
              <div
                className="warehouse-admin-actions-dropdown-menu"
                role="menu"
                ref={menuPanelRef}
                style={dropdownStyle || undefined}
              >
                {showPrimary && (
                  <button
                    type="button"
                    className="warehouse-admin-tasdiq-btn"
                    role="menuitem"
                    title={
                      primaryDisabled && !primaryPending && kind === null
                        ? actionsContext === 'home'
                          ? 'Navbatda tasdiqlash'
                          : 'Hozircha tasdiqlash yoki bekor qilish uchun navbat yo‘q'
                        : undefined
                    }
                    onClick={() => {
                      setMenuOpen(false);
                      void onPrimary(p, actionsContext);
                    }}
                    disabled={primaryDisabled}
                  >
                    {primaryLabel}
                  </button>
                )}
                {showSaleToggle && (
                  <button
                    type="button"
                    className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--warn"
                    role="menuitem"
                    title={saleTitle}
                    onClick={() => {
                      setMenuOpen(false);
                      void onToggleSale(p);
                    }}
                    disabled={saleDisabled}
                  >
                    {saleLabel}
                  </button>
                )}
                {showDelete && (
                  <button
                    type="button"
                    className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void onDelete(p);
                    }}
                    disabled={rowBusy}
                  >
                    {busy.deletingProductId === p.id ? '...' : 'Maxsulotni uchirish'}
                  </button>
                )}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

/** Tasdiqlangan chiqim — alohida to‘liq jadval qatori (asosiy yashil qator ostida, qizil) */
export function warehouseChiqimDuplicateRowVisible(p) {
  return Boolean(p?.warehouse_chiqim_confirmed_at) && (Number(p?.warehouse_chiqim_qty) || 0) >= 1;
}

/** Kirim/chiqim sahifasida asosiy qator rangi: tasdiqlangan chiqimda asosiy qator qizil emas */
export function warehouseKirimChiqimSheetMainRowClass(view, p) {
  if (view === 'kirim' || view === 'chiqim' || view === 'delisted' || view === 'deleted') {
    const cq = Number(p.warehouse_chiqim_qty) || 0;
    const outConfirmed = Boolean(p.warehouse_chiqim_confirmed_at);
    if (view === 'delisted' && p.warehouse_relisted_at) {
      return ' warehouse-admin-grid-row--relisted';
    }
    if (view === 'delisted' && p.warehouse_delisted_at) {
      return ' warehouse-admin-grid-row--delisted';
    }
    if (view === 'chiqim' && outConfirmed && cq >= 1) {
      return ' warehouse-admin-grid-row--chiqim-confirmed-duplicate';
    }
    if (!outConfirmed && cq >= 1) return ' warehouse-admin-grid-row--chiqim-active';
    if ((view === 'kirim' || view === 'delisted') && p.warehouse_approved_at) {
      return ' warehouse-admin-grid-row--kirim-approved';
    }
    return '';
  }
  return '';
}

/**
 * @param {object} props
 * @param {object} props.product
 * @param {'home'|'kirim'|'chiqim'|'delisted'|'deleted'} props.sheetView
 * @param {function} props.request
 * @param {function} props.onReload
 */
export function WarehouseChiqimConfirmedDuplicateRow({ product: p, sheetView, request, onReload }) {
  if (!warehouseChiqimDuplicateRowVisible(p)) return null;
  const isDeleted = sheetView === 'deleted';

  return (
    <div
      className="warehouse-admin-grid-row warehouse-admin-grid-row--ledger warehouse-admin-grid-row--chiqim-confirmed-duplicate"
      role="row"
      aria-label={`${p.name_uz || 'Mahsulot'} — tasdiqlangan chiqim`}
    >
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-text" role="gridcell" title={p.seller_name || ''}>
        <span className="warehouse-admin-cell-ellipsis">{p.seller_name || '—'}</span>
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-img" role="gridcell">
        <div className="warehouse-admin-product-thumb-wrap">
          {p.image_url ? (
            <img className="warehouse-admin-product-thumb" src={p.image_url} alt="" />
          ) : (
            <span className="warehouse-admin-thumb-ph" aria-hidden>
              —
            </span>
          )}
        </div>
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-name" role="gridcell" title={p.name_uz || ''}>
        <div className="warehouse-admin-cell-name-inner">
          <span className="warehouse-admin-product-name-row">{p.name_uz || '—'}</span>
        </div>
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
        {Number(p.stock) || 0}
      </div>
      <div
        className="warehouse-admin-grid-cell warehouse-admin-num-cell warehouse-admin-cell-unit-sum"
        role="gridcell"
        title={formatWarehouseProductSumUz(p)}
      >
        <span className="warehouse-admin-cell-unit-sum-inner">{formatWarehouseProductSumUz(p)}</span>
      </div>
      <div
        className={`warehouse-admin-grid-cell ${isDeleted ? 'warehouse-admin-num-cell' : 'warehouse-admin-grid-cell--ledger'}`}
        role="gridcell"
      >
        {isDeleted ? (
          Number(p.warehouse_kirim_qty) || 0
        ) : p.warehouse_approved_at ? (
          <LedgerQtyEditor
            readOnly
            compact
            product={p}
            field="warehouse_kirim_qty"
            hintLabel="Stock"
            hintValue={Number(p.stock) || 0}
            confirmedAt={p.warehouse_approved_at}
            onReload={onReload}
            request={request}
          />
        ) : (
          <span className="warehouse-admin-num-muted" title="Kirim">
            —
          </span>
        )}
      </div>
      <div
        className={`warehouse-admin-grid-cell ${isDeleted ? 'warehouse-admin-num-cell' : 'warehouse-admin-grid-cell--ledger'}`}
        role="gridcell"
      >
        {isDeleted ? (
          Number(p.warehouse_chiqim_qty) || 0
        ) : (
          <LedgerQtyEditor
            readOnly
            compact
            hideConfirmButton
            product={p}
            field="warehouse_chiqim_qty"
            hintLabel="Buyurtma"
            hintValue={Number(p.orders_chiqim_soni) || 0}
            confirmSlug="confirm-chiqim"
            confirmedAt={p.warehouse_chiqim_confirmed_at}
            onReload={onReload}
            request={request}
          />
        )}
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
        {Number(p.atkaz_soni) || 0}
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
        {Number(p.brak_qty) || 0}
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-text" role="gridcell">
        <span className="warehouse-admin-cell-ellipsis">
          {p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '—'}
        </span>
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
        {Number(p.stock) || 0}
      </div>
      <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
        <span className="warehouse-admin-status-label warehouse-admin-status-label--chiqim-confirmed">
          Tasdiqlangan
        </span>
      </div>
    </div>
  );
}

/** Jadval ustunlari — scroll qobig‘i ichida body bilan birga harakatlanadi */
export function WarehouseGridColumnHeaders() {
  return (
    <div
      className="warehouse-admin-top-vlines-strip warehouse-admin-top-vlines-strip--sheet"
      role="row"
      aria-label="Ombor jadvali ustunlari"
    >
      {WAREHOUSE_GRID_HEADERS.map((label) => (
        <div key={label} className="warehouse-admin-top-vseg">
          <span className="warehouse-admin-top-vseg-label" title={label}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
