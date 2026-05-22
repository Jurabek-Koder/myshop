import React, { useEffect, useRef, useState } from 'react';

/** Sklad kataklari sarlavalari — `.warehouse-admin-top-vseg-label` */
export const WAREHOUSE_GRID_HEADERS = [
  'Seller',
  'Maxsulot rasmi',
  'Nomi',
  'Soni',
  'Maxsulot summasi',
  'Kirim soni',
  'Chiqim soni',
  'Atkaz soni',
  'Brak maxsulot',
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
            <span className="warehouse-admin-ledger-compact-ok" title="Tasdiqlangan" aria-hidden>
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
    return (
      <button
        type="button"
        className="warehouse-admin-ledger warehouse-admin-ledger--compact warehouse-admin-ledger--click-to-edit"
        title={[hintTitle, 'Tahrirlash uchun bosing'].filter(Boolean).join(' · ')}
        onClick={() => setExpanded(true)}
      >
        <span className="warehouse-admin-ledger-readonly-qty">{fv}</span>
        {confirmedAt && (
          <span className="warehouse-admin-ledger-compact-ok" title="Tasdiqlangan">
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
          <span className="warehouse-admin-ledger-compact-ok" title="Tasdiqlangan" aria-hidden>
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
  if (actionsContext === 'home') return null;
  if (actionsContext === 'kirim_sheet') {
    if (!p.warehouse_chiqim_confirmed_at && (Number(p.warehouse_chiqim_qty) || 0) >= 1) return 'confirm_chiqim';
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
  chiqimLedgerOpenForProductId = null,
  chiqimLedgerDraftVal = '',
  onChiqimLedgerSaveAndConfirm,
  onChiqimLedgerExpandCancel,
}) {
  if (readOnly) {
    const showTasdiq =
      Boolean(p?.warehouse_approved_at) &&
      (actionsContext === 'kirim_sheet' || actionsContext === 'home');
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

  const isChiqimActionsOverlay =
    chiqimLedgerOpenForProductId != null &&
    chiqimLedgerOpenForProductId === p.id &&
    (actionsContext === 'kirim_sheet' || actionsContext === 'home');

  if (isChiqimActionsOverlay) {
    const n = Number.parseInt(String(chiqimLedgerDraftVal ?? '').trim(), 10);
    const canT =
      !p.warehouse_chiqim_confirmed_at &&
      Number.isFinite(n) &&
      n >= 1 &&
      !warehouseRowActionsBusy(p, busy);
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

  const showPrimary = actionsContext !== 'sale_delete_only';
  const primaryDisabled = rowBusy || kind === null;
  const primaryLabel = primaryPending
    ? '...'
    : kind === 'revoke_kirim'
      ? 'Tasdiq bekor'
      : 'Tasdiqlash';

  const saleDisabled = rowBusy || (!delisted && !canDelist);
  const saleLabel =
    busy.delistingId === p.id ? '...' : delisted ? 'Maxsulotni qaytarish' : 'Sotuvdan olish';

  const saleTitle = delisted
    ? 'Mahsulotni qaytarish (sotuvga)'
    : canDelist
      ? 'Saytdan yechish (sotuvdan olinganlar ro‘yxatiga)'
      : 'Avval bosh sahifada kirim tasdiqlang yoki mahsulot sotuvda (active) bo‘lsin';

  const stackInner = (
    <>
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
      <button
        type="button"
        className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--warn"
        title={saleTitle}
        onClick={() => void onToggleSale(p)}
        disabled={saleDisabled}
      >
        {saleLabel}
      </button>
      <button
        type="button"
        className="warehouse-admin-tasdiq-btn warehouse-admin-action-btn--danger"
        onClick={() => void onDelete(p)}
        disabled={rowBusy}
      >
        {busy.deletingProductId === p.id ? '...' : 'Maxsulotni uchirish'}
      </button>
    </>
  );

  if (isEmbedded) {
    return <div className="warehouse-admin-actions-stack warehouse-admin-actions-stack--embedded">{stackInner}</div>;
  }

  const showKirimTasdiqLabel =
    Boolean(p.warehouse_approved_at) && (actionsContext === 'kirim_sheet' || actionsContext === 'home');

  return (
    <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
      <div className="warehouse-admin-actions-stack">
        {showKirimTasdiqLabel && (
          <span className="warehouse-admin-actions-tasdiq-label">Tasdiqlangan</span>
        )}
        {stackInner}
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
  if (view === 'kirim_chiqim' || view === 'delisted' || view === 'deleted') {
    const cq = Number(p.warehouse_chiqim_qty) || 0;
    const outConfirmed = Boolean(p.warehouse_chiqim_confirmed_at);
    if (!outConfirmed && cq >= 1) return ' warehouse-admin-grid-row--chiqim-active';
    if ((view === 'kirim_chiqim' || view === 'delisted') && p.warehouse_approved_at) {
      return ' warehouse-admin-grid-row--kirim-approved';
    }
    return '';
  }
  return '';
}

/**
 * @param {object} props
 * @param {object} props.product
 * @param {'home'|'kirim_chiqim'|'delisted'|'deleted'} props.sheetView
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
