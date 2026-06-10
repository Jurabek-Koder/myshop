import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import StaffTopbarCenterId from '../../components/staff/StaffTopbarCenterId.jsx';
import StaffAdvanceConfirm from '../../components/StaffAdvanceConfirm.jsx';
import PackerViloyatDropdown from '../../components/packer/PackerViloyatDropdown.jsx';
import StaffRailTopbarActions from '../../components/staff/StaffRailTopbarActions.jsx';
import { orderMatchesViloyatEntry, PACKER_UZ_VILOYATLAR } from '../../constants/uzViloyatlarPacker';
import {
  formatDateTimeUz,
  formatDateTimeUzCompact,
  getDateTimePartsInUzbekistan,
  parseServerDateTime,
  toIso8601DateTimeAttr,
} from '../../utils/uzbekistanTime.js';
import StaffHomeProductCard from '../../components/staff/StaffHomeProductCard.jsx';
import './PackerDashboard.css';
import '../picker/PickerDashboard.css';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatDateTime(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

/** Tarix kartalari: YYYY-MM-DD HH:mm (O‘zbekiston) */
function formatPackerHistoryWhen(value) {
  return formatDateTimeUzCompact(value, { empty: '-' });
}

function resolvePackerProductImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (s.startsWith('/')) return `${base}${s}`;
  return s;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Chek ustki o‘ng burchak: DD.MM-DD.MM (O‘zbekiston sanasi + keyingi kun) */
function formatReceiptDateRange(value) {
  const d0 = parseServerDateTime(value);
  if (!d0) return '—';
  const p1 = getDateTimePartsInUzbekistan(d0);
  if (!p1) return '—';
  const d1 = new Date(d0.getTime() + 86400000);
  const p2 = getDateTimePartsInUzbekistan(d1);
  if (!p2) return '—';
  const dm = (p) => `${p.day}.${p.month}`;
  return `${dm(p1)}-${dm(p2)}`;
}

/** Oddiy chiziqli shtrix (printer uchun) — zaxira */
function buildBarcodeSvgFallback(orderId) {
  const seed = Number(orderId) || 0;
  const w = 2;
  let x = 0;
  let rects = '';
  for (let i = 0; i < 48; i++) {
    const on = ((seed + i * 7) % 5) !== 0;
    if (on) rects += `<rect x="${x}" y="0" width="${w}" height="36" fill="#000"/>`;
    x += w;
  }
  return `<svg class="slip-barcode-svg" width="${x}" height="36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${rects}</svg>`;
}

/** Skanerlanadigan CODE128 shtrix — chekda `o-{id}` */
function buildBarcodeSvg(orderId) {
  if (typeof document === 'undefined') return buildBarcodeSvgFallback(orderId);
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, `o-${orderId}`, {
      format: 'CODE128',
      width: 1.6,
      height: 40,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    svg.setAttribute('class', 'slip-barcode-svg');
    return svg.outerHTML;
  } catch {
    return buildBarcodeSvgFallback(orderId);
  }
}

function buildPackingSlipHtml(order, packerName) {
  const items = order.items || [];
  const itemsSubtotal = items.reduce(
    (s, i) => s + (Number(i.price_at_order) || 0) * (Number(i.quantity) || 0),
    0
  );
  const total = Number(order.total_amount) || 0;
  const deliveryHint = Math.max(0, Math.round((total - itemsSubtotal) * 100) / 100);

  const customerName = String(order.customer_full_name || order.customer_name || '').trim();
  const phone = order.contact_phone != null ? String(order.contact_phone).trim() : '';
  const addr = order.shipping_address != null ? String(order.shipping_address).trim() : '';
  const customerLine1 = [customerName || null, phone || null].filter(Boolean).join(' · ') || '—';
  const customerLine2 = addr || '—';

  const itemRows = items.length
    ? items
        .map((i) => {
          const q = Number(i.quantity) || 0;
          const name = i.name_uz || 'Mahsulot';
          const oos = !isOrderItemInStock(i);
          const cls = oos ? 'slip-row slip-row--item slip-row--oos' : 'slip-row slip-row--item';
          return `<div class="${cls}"><span class="slip-row__left">${escapeHtml(name)}</span><span class="slip-row__right">${escapeHtml(String(q))} ta</span></div>`;
        })
        .join('')
    : `<div class="slip-row slip-row--item"><span class="slip-row__left">—</span><span class="slip-row__right">0 ta</span></div>`;

  const bigMark = String(order.id % 100 || order.id).padStart(2, '0');
  const refId = `o-${order.id}`;

  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <title>Chek · Zakaz #${escapeHtml(String(order.id))}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 5mm; size: auto; }
    body {
      font-family: 'Consolas', 'Roboto Mono', 'SFMono-Regular', ui-monospace, monospace;
      margin: 0 auto;
      padding: 10px 8px 16px;
      width: 72mm;
      max-width: 72mm;
      color: #000;
      background: #fff;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slip-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 6px;
    }
    .slip-head__left { flex: 1; min-width: 0; }
    .slip-head__ref { margin-top: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
    .slip-head__right { text-align: right; flex-shrink: 0; }
    .slip-head__mark { font-size: 28px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; }
    .slip-head__dates { margin-top: 4px; font-size: 10px; font-weight: 600; }
    .slip-barcode-svg { display: block; max-width: 100%; height: auto; }
    .slip-rule {
      border: none;
      border-top: 1px dashed #000;
      margin: 10px 0 8px;
      height: 0;
    }
    .slip-rule--solid { border-top-style: solid; margin: 8px 0; }
    .slip-rule__label {
      display: table;
      margin: -7px auto 0;
      padding: 0 6px;
      background: #fff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .slip-mijoz { text-align: center; margin-bottom: 2px; }
    .slip-mijoz__line { margin: 0; padding: 1px 0; font-weight: 600; word-break: break-word; }
    .slip-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin: 3px 0;
      font-size: 10px;
    }
    .slip-row__left { text-align: left; flex: 1; min-width: 0; word-break: break-word; }
    .slip-row__right { text-align: right; flex-shrink: 0; white-space: nowrap; font-weight: 600; }
    .slip-row--oos { color: #c62828; font-weight: 800; }
    .slip-row--oos .slip-row__left::after { content: ' (omborda yo\\q)'; font-weight: 700; font-size: 9px; }
    .slip-jami {
      text-align: center;
      font-size: 14px;
      font-weight: 800;
      margin: 10px 0 8px;
      letter-spacing: 0.02em;
    }
    .slip-items { margin-top: 6px; }
    .slip-foot {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #999;
      font-size: 9px;
      color: #333;
      text-align: center;
      line-height: 1.4;
    }
    @media print {
      body { padding: 4mm 3mm 6mm; }
    }
  </style>
</head>
<body>
  <div class="slip-head">
    <div class="slip-head__left">
      ${buildBarcodeSvg(order.id)}
      <div class="slip-head__ref">${escapeHtml(refId)}</div>
    </div>
    <div class="slip-head__right">
      <div class="slip-head__mark">${escapeHtml(bigMark)}</div>
      <div class="slip-head__dates">${escapeHtml(formatReceiptDateRange(order.created_at))}</div>
    </div>
  </div>

  <div class="slip-rule-wrap">
    <hr class="slip-rule" />
    <div class="slip-rule__label">Mijoz</div>
  </div>
  <div class="slip-mijoz">
    <p class="slip-mijoz__line">${escapeHtml(customerLine1)}</p>
    <p class="slip-mijoz__line">${escapeHtml(customerLine2)}</p>
  </div>

  <hr class="slip-rule slip-rule--solid" />

  <div class="slip-row">
    <span class="slip-row__left">Operator:</span>
    <span class="slip-row__right">${escapeHtml(packerName || '—')}</span>
  </div>
  <div class="slip-row">
    <span class="slip-row__left">Izoh:</span>
    <span class="slip-row__right">—</span>
  </div>

  <hr class="slip-rule slip-rule--solid" />

  <div class="slip-jami">Jami: ${escapeHtml(formatCurrency(order.total_amount))}</div>

  <div class="slip-row">
    <span class="slip-row__left">Maxsulotlar summasi:</span>
    <span class="slip-row__right">${escapeHtml(formatCurrency(itemsSubtotal || total))}</span>
  </div>
  <div class="slip-row">
    <span class="slip-row__left">Yetkazish xizmati:</span>
    <span class="slip-row__right">${escapeHtml(formatCurrency(deliveryHint))}</span>
  </div>

  <div class="slip-items">${itemRows}</div>

  <p class="slip-foot">MyShop · Qadoqlash cheki · ${escapeHtml(formatDateTime(order.created_at))}<br />Chop etish: brauzer menyusidan yoki <strong>Ctrl+P</strong></p>
</body>
</html>`;
}

/** Modal kontekstida zakazda faqat `item_quantity` bo‘lsa ham chekda to‘liq qator */
function normalizeOrderForPackingSlip(order, productGroup) {
  if (!order) return order;
  if (order.items && order.items.length > 0) return order;
  const q = Number(order.item_quantity) || 0;
  if (q <= 0) return order;
  const total = Number(order.total_amount) || 0;
  const unit = q > 0 && total > 0 ? total / q : 0;
  const lineName = productGroup?.name_uz || 'Mahsulot';
  return {
    ...order,
    items: [
      {
        product_id: productGroup?.product_id,
        name_uz: lineName,
        quantity: q,
        price_at_order: unit,
      },
    ],
  };
}

/**
 * Yangi tabda chek HTML (termal dizayn). autoPrint: true bo‘lsa, tab chizilgach print dialog.
 * productGroup: asosiy sahifa modalidagi mahsulot qatori (normalize uchun).
 */
function openPackingSlip(order, packerName, opts = {}) {
  const { productGroup = null, autoPrint = true, skipFulfillmentCheck = false } = opts;
  if (!skipFulfillmentCheck && order && order.packerCanFulfill === false) {
    window.alert('Omborda yetarli mahsulot yo‘q — chek chiqarilmaydi.');
    return false;
  }
  const normalized = normalizeOrderForPackingSlip(order, productGroup);
  const html = buildPackingSlipHtml(normalized, packerName);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    window.alert('Brauzer yangi oynasini blokladi. Popupga ruxsat bering.');
    return false;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  if (!autoPrint) return true;
  const runPrint = () => {
    try {
      w.print();
    } catch (_) {}
  };
  const delay = 400;
  if (w.document.readyState === 'complete') setTimeout(runPrint, delay);
  else w.onload = () => setTimeout(runPrint, delay);
  return true;
}

function printPackingSlip(order, packerName, productGroup) {
  openPackingSlip(order, packerName, {
    productGroup: productGroup ?? null,
    autoPrint: true,
    skipFulfillmentCheck: false,
  });
}

/** Zakazlarni mahsulot bo‘yicha guruhlash (bitta zakazda bir nechta mahsulot bo‘lishi mumkin) */
function aggregatePackerOrdersByProduct(orders) {
  const map = new Map();
  for (const order of orders) {
    const lineByPid = new Map();
    for (const item of order.items || []) {
      const pid = item.product_id;
      lineByPid.set(pid, (lineByPid.get(pid) || 0) + (Number(item.quantity) || 0));
    }
    for (const [pid, lineQty] of lineByPid) {
      const sample = (order.items || []).find((i) => i.product_id === pid);
      if (!map.has(pid)) {
        map.set(pid, {
          product_id: pid,
          name_uz: sample?.name_uz || `Mahsulot #${pid}`,
          image_url: sample?.image_url || null,
          price: Number(sample?.price_at_order) || 0,
          stock: 0,
          orders: [],
          orderIdSet: new Set(),
          units_in_queue: 0,
        });
      }
      const g = map.get(pid);
      if (sample?.stock != null) g.stock = Number(sample.stock);
      if (sample?.price_at_order != null && !g.price) {
        g.price = Number(sample.price_at_order) || 0;
      }
      const img = sample?.image_url != null ? String(sample.image_url).trim() : '';
      if (img) g.image_url = sample.image_url;
      g.units_in_queue += lineQty;
      if (!g.orderIdSet.has(order.id)) {
        g.orderIdSet.add(order.id);
        g.orders.push({
          ...order,
          item_quantity: lineQty,
        });
      }
    }
  }
  return [...map.values()].map(({ orderIdSet, ...rest }) => ({
    ...rest,
    orders_count: orderIdSet.size,
  }));
}

const PACKER_VILOYAT_FILTER_KEY = 'packer_viloyat_filter_v1';

function readPackerViloyatFilter() {
  try {
    return localStorage.getItem(PACKER_VILOYAT_FILTER_KEY) || '';
  } catch {
    return '';
  }
}

function writePackerViloyatFilter(value) {
  try {
    if (value === '' || value == null) localStorage.removeItem(PACKER_VILOYAT_FILTER_KEY);
    else localStorage.setItem(PACKER_VILOYAT_FILTER_KEY, String(value));
  } catch {
    /* brauzer bloklasa */
  }
}

/** Asosiy sahifa: ko‘p zakaz tushgan mahsulot tepada, kam zakazli — pastda */
function sortPackerQueueByOrdersDesc(groups) {
  return [...groups].sort((a, b) => {
    const ca = Number(a.orders_count) || 0;
    const cb = Number(b.orders_count) || 0;
    if (cb !== ca) return cb - ca;
    const ua = Number(a.units_in_queue) || 0;
    const ub = Number(b.units_in_queue) || 0;
    if (ub !== ua) return ub - ua;
    const na = String(a.name_uz || '');
    const nb = String(b.name_uz || '');
    return na.localeCompare(nb, 'uz', { sensitivity: 'base' });
  });
}

/** Zakazda alohida pozitsiyalar soni (chek tartibi uchun). */
function orderDistinctLineCount(order) {
  const items = order?.items;
  if (Array.isArray(items) && items.length > 0) return items.length;
  return 1;
}

const PACKER_GATHERED_STORAGE_KEY = 'packer_gathered_lines_v1';

function gatheredLineKey(orderId, productId) {
  return `${orderId}:${productId}`;
}

function readGatheredFromStorage() {
  try {
    const raw = sessionStorage.getItem(PACKER_GATHERED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeGatheredToStorage(set) {
  try {
    sessionStorage.setItem(PACKER_GATHERED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* brauzer bloklasa */
  }
}

function isOrderItemInStock(item) {
  const need = Number(item?.quantity) || 0;
  const stock = item?.stock != null ? Number(item.stock) : 0;
  return need <= 0 || stock >= need;
}

function orderAllItemsInStock(order) {
  return (order?.items || []).every(isOrderItemInStock);
}

function orderProductIds(order) {
  const ids = new Set();
  for (const i of order?.items || []) {
    if (i.product_id != null) ids.add(i.product_id);
  }
  return ids;
}

function isOrderFullyGathered(order, gatheredSet) {
  const ids = orderProductIds(order);
  if (ids.size === 0) return false;
  for (const pid of ids) {
    if (!gatheredSet.has(gatheredLineKey(order.id, pid))) return false;
  }
  return true;
}

/** Ko‘p mahsulotli zakazda barcha qatorlar terilgan va omborda yetarli bo‘lsa chek chiqadi */
function canPrintOrderChek(order, gatheredSet) {
  if (order?.packerCanFulfill === false) return false;
  if (!orderAllItemsInStock(order)) return false;
  if (orderDistinctLineCount(order) >= 2) return isOrderFullyGathered(order, gatheredSet);
  return true;
}

/** Chek / modal: avval 2 va undan ko‘p pozitsiyali zakazlar, keyin bittalik; guruhda FIFO. */
function sortOrdersForChekPrintOrder(orders) {
  return [...orders].sort((a, b) => {
    const ma = orderDistinctLineCount(a) >= 2 ? 0 : 1;
    const mb = orderDistinctLineCount(b) >= 2 ? 0 : 1;
    if (ma !== mb) return ma - mb;
    const ta = parseServerDateTime(a.created_at)?.getTime() ?? 0;
    const tb = parseServerDateTime(b.created_at)?.getTime() ?? 0;
    return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
  });
}

/** FIFO: ombor qoldig‘i bo‘yicha qaysi zakazlar to‘liq bajariladi — faqat ularga chek / qadoqlash */
function applyStockAllocationToProductGroup(group) {
  const stock = Number(group.stock) || 0;
  const sorted = [...(group.orders || [])].sort((a, b) => {
    const ta = parseServerDateTime(a.created_at)?.getTime() ?? 0;
    const tb = parseServerDateTime(b.created_at)?.getTime() ?? 0;
    return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
  });
  let rem = stock;
  const orders = sorted.map((o) => {
    const need = Number(o.item_quantity) || 0;
    const packerCanFulfill = need > 0 && need <= rem;
    if (packerCanFulfill) rem -= need;
    return { ...o, packerCanFulfill };
  });
  const hasPackerOverflow = orders.some((o) => !o.packerCanFulfill);
  const showHoldCta = orders.length > 0 && (hasPackerOverflow || stock === 0);
  return { ...group, orders, hasPackerOverflow, showHoldCta };
}

function navLinkClass({ isActive }) {
  return `packer-nav-link${isActive ? ' packer-nav-link--active' : ''}`;
}

function navLinkClassRail({ isActive }) {
  return `packer-nav-link packer-nav-link--rail${isActive ? ' packer-nav-link--active' : ''}`;
}

function PackerTopbarControls({
  topMeta,
  regionFilterId,
  onRegionChange,
  packerDisplayName,
  queueOrderCount,
  queueProductsLength,
  isHome,
  loading,
  onRefresh,
  staffActionsProps,
}) {
  return (
    <>
      <div className="packer-sticky-topbar-title">
        {topMeta.title != null ? <span className="packer-sticky-brand">{topMeta.title}</span> : null}
        {topMeta.showCount ? <span className="packer-sticky-count">{topMeta.count}</span> : null}
      </div>
      {isHome ? (
        <div className="packer-topbar-region-row">
          <div className="packer-topbar-region-wrap">
            <PackerViloyatDropdown value={regionFilterId} onChange={onRegionChange} />
          </div>
          <StaffTopbarCenterId className="packer-topbar-inline-id" />
        </div>
      ) : null}
      <div className="packer-topbar-end">
        {isHome ? (
          <span className="packer-topbar-meta" title={`${packerDisplayName} · navbatda ${queueOrderCount} zakaz`}>
            <span className="packer-topbar-meta-badge">
              {queueOrderCount} / {queueProductsLength}
            </span>
          </span>
        ) : null}
        {isHome ? (
          <button
            type="button"
            className="packer-icon-refresh"
            onClick={() => void onRefresh()}
            disabled={loading}
            aria-label="Yangilash"
            title="Yangilash"
          >
            <svg
              className="packer-icon-refresh-svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7m0 0L19.5 15.75m-3.819-9.581a8.25 8.25 0 0 0 0 9.581"
              />
            </svg>
          </button>
        ) : (
          <span className="packer-topbar-spacer" aria-hidden />
        )}
        <StaffRailTopbarActions {...staffActionsProps} className="packer-topbar-staff-actions" />
      </div>
    </>
  );
}

const RAIL_IC = {
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function RailIconNav({ children }) {
  return (
    <span className="packer-nav-link__icon" aria-hidden>
      <svg className="packer-rail-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        {children}
      </svg>
    </span>
  );
}

function RailIconBtnInner({ children }) {
  return (
    <svg className="packer-rail-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {children}
    </svg>
  );
}

function packerWithdrawStatusUz(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return 'Tasdiqlandi';
  if (s === 'rejected') return 'Rad etildi';
  return 'Kutilmoqda';
}

function packerLedgerKindUz(kind) {
  const k = String(kind || '');
  if (k === 'fine') return 'Jarima';
  if (k === 'reward') return 'Mukofot';
  if (k === 'balance_set') return 'Balans / oylik';
  return k || '—';
}

/** Moliya yozuvi — tarix zakaz qatori bilan bir xil «strip» dizayn */
function PackerFinanceTxCard({
  variant,
  kindLabel,
  when,
  dateTime,
  body,
  metaPrimary,
  metaSecondary,
  withdrawStatus,
  amountText,
  amountTone = 'neutral',
}) {
  const cardClass = `packer-archive-card packer-finance-tx-card packer-finance-tx-card--${variant}`;
  const sumClass = `packer-archive-sum packer-finance-tx-sum packer-finance-tx-sum--${amountTone}`;
  const bodyStr = body && String(body).trim() ? String(body).trim() : '—';
  const WhenEl = dateTime ? (
    <time className="packer-archive-seg packer-archive-seg--when" dateTime={dateTime}>
      {when}
    </time>
  ) : (
    <span className="packer-archive-seg packer-archive-seg--when">{when}</span>
  );
  const metaPrimaryNode =
    metaPrimary && withdrawStatus ? (
      <span className={`packer-profile-withdraw-badge packer-profile-withdraw-badge--${withdrawStatus}`}>
        {metaPrimary}
      </span>
    ) : metaPrimary ? (
      <span className="packer-archive-customer-addr">{metaPrimary}</span>
    ) : null;
  return (
    <li className={cardClass}>
      <div className="packer-archive-row packer-finance-tx-row">
        <div className="packer-archive-main-clip">
          <div className="packer-archive-segments">
            <span className="packer-archive-seg packer-archive-seg--id">{kindLabel}</span>
            <span className="packer-archive-seg-rule" aria-hidden />
            {WhenEl}
            <span className="packer-archive-seg-rule" aria-hidden />
            <span className="packer-archive-seg packer-archive-seg--products" title={bodyStr}>
              {bodyStr}
            </span>
          </div>
        </div>
        <div className="packer-archive-trail packer-finance-tx-trail">
          {metaPrimary || metaSecondary ? (
            <span className="packer-archive-customer">
              {metaPrimaryNode}
              {metaSecondary ? <span className="packer-archive-customer-phone">{metaSecondary}</span> : null}
            </span>
          ) : null}
          <span className={sumClass}>{amountText}</span>
        </div>
      </div>
    </li>
  );
}

function PackerProfileFinance({ request, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detailTab, setDetailTab] = useState('balance');

  const load = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!silent) {
      setLoading(true);
      setErr('');
    }
    try {
      const res = await request('/packer/finance');
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.code === 'no_work_role') {
        setData(null);
        setErr('');
        return;
      }
      if (!res.ok) throw new Error(body.error || 'Ma’lumot yuklanmadi');
      setData(body);
    } catch (e) {
      if (!silent) {
        setErr(e.message || 'Xatolik');
        setData(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!refreshKey) return;
    void load({ silent: true });
  }, [refreshKey, load]);

  if (loading) {
    return <div className="packer-finance-block packer-finance-block--muted">Moliya: yuklanmoqda…</div>;
  }
  if (!data) {
    return err ? (
      <div className="packer-finance-block packer-workspace-alert" role="alert">
        {err}
      </div>
    ) : null;
  }

  const { summary, fines, rewards, transactions } = data;

  return (
    <div className="packer-finance-block">
      <h3 className="packer-finance-heading">Moliya va tranzaksiyalar</h3>
      <p className="packer-finance-intro">
        Jarima va mukofotlar sklad administratori tomonidan belgilanadi; yangi yozuvlar shu yerda paydo bo‘ladi.
      </p>

      <div className="packer-finance-summary-grid" role="group" aria-label="Moliya: balans, jarima, mukofot">
        <button
          type="button"
          className={`packer-finance-stat${detailTab === 'balance' ? ' packer-finance-stat--active' : ''}`}
          aria-pressed={detailTab === 'balance'}
          onClick={() => setDetailTab('balance')}
        >
          <span className="packer-finance-stat-label">Balans</span>
          <strong className="packer-finance-stat-value">{formatCurrency(summary.balance)}</strong>
        </button>
        <button
          type="button"
          className={`packer-finance-stat${detailTab === 'fines' ? ' packer-finance-stat--active' : ''}`}
          aria-pressed={detailTab === 'fines'}
          onClick={() => setDetailTab('fines')}
        >
          <span className="packer-finance-stat-label">Jami jarimalar</span>
          <strong className="packer-finance-stat-value packer-finance-stat-value--warn">{formatCurrency(summary.fine_amount)}</strong>
          <span className="packer-finance-stat-meta">{summary.fines_count} marta</span>
        </button>
        <button
          type="button"
          className={`packer-finance-stat${detailTab === 'rewards' ? ' packer-finance-stat--active' : ''}`}
          aria-pressed={detailTab === 'rewards'}
          onClick={() => setDetailTab('rewards')}
        >
          <span className="packer-finance-stat-label">Jami mukofotlar</span>
          <strong className="packer-finance-stat-value packer-finance-stat-value--ok">{formatCurrency(summary.reward_amount)}</strong>
        </button>
      </div>

      <section
        className={`packer-finance-detail${detailTab === 'balance' ? ' packer-finance-detail--balance-only' : ''}`}
        aria-live="polite"
      >
        {detailTab === 'balance' ? (
          <div className="packer-finance-balance-grid">
            <div className="packer-archive-card packer-finance-panel packer-finance-panel--strip">
              <div className="packer-archive-row packer-finance-tx-row">
                <div className="packer-archive-main-clip">
                  <div className="packer-archive-segments">
                    <span className="packer-archive-seg packer-archive-seg--id">Asosiy balans</span>
                    <span className="packer-archive-seg-rule" aria-hidden />
                    <span className="packer-archive-seg packer-archive-seg--when">Hozirgi</span>
                    <span className="packer-archive-seg-rule" aria-hidden />
                    <span className="packer-archive-seg packer-archive-seg--products" title="Ish haqi / balans">
                      Ish haqi / balans
                    </span>
                  </div>
                </div>
                <div className="packer-archive-trail packer-finance-tx-trail">
                  <span className="packer-archive-sum packer-finance-tx-sum packer-finance-tx-sum--neutral">
                    {formatCurrency(summary.balance)}
                  </span>
                </div>
              </div>
            </div>
            <div className="packer-archive-card packer-finance-panel">
              <p className="packer-finance-panel-kicker">Reyting</p>
              <ul className="packer-finance-balance-stats">
                <li>
                  <span>Buyurtmalar (reyting)</span>
                  <strong>{summary.orders_count}</strong>
                </li>
                <li>
                  <span>Nishonlar</span>
                  <strong>{summary.badges_count}</strong>
                </li>
                <li>
                  <span>Daraja</span>
                  <strong>{summary.rank_title || '—'}</strong>
                </li>
              </ul>
            </div>
            <div className="packer-archive-card packer-finance-panel packer-finance-panel--hint">
              <p className="packer-finance-panel-kicker">Pul yechish</p>
              <p className="packer-finance-detail-hint packer-finance-panel-hint-body">
                «Hisobdan pul yechish» bloki orqali summani tanlab, <strong>naqd</strong> yoki <strong>karta</strong> usulida superuserga so‘rov
                yuborishingiz mumkin.
              </p>
            </div>
          </div>
        ) : null}
        {detailTab === 'fines' ? (
          <>
            <h4 className="packer-finance-detail-title">Olingan jarimalar</h4>
            <p className="packer-finance-detail-lead packer-finance-detail-lead--warn">{formatCurrency(summary.fine_amount)}</p>
            <p className="packer-finance-detail-hint packer-finance-detail-hint--spaced">
              Jami <strong>{summary.fines_count}</strong> marta jarima qayd etilgan.
            </p>
            {fines.length === 0 ? (
              <div className="packer-archive-card packer-finance-empty-strip" role="status">
                <div className="packer-archive-row packer-finance-tx-row">
                  <div className="packer-archive-main-clip">
                    <div className="packer-archive-segments">
                      <span className="packer-archive-seg packer-archive-seg--id">Jarimalar</span>
                      <span className="packer-archive-seg-rule" aria-hidden />
                      <span className="packer-archive-seg packer-archive-seg--when">—</span>
                      <span className="packer-archive-seg-rule" aria-hidden />
                      <span className="packer-archive-seg packer-archive-seg--products">
                        Batafsil yozuv yo‘q (eski ma’lumotlar faqat jami bo‘lishi mumkin)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <ul className="packer-finance-tx-list">
                {fines.map((r) => (
                  <PackerFinanceTxCard
                    key={r.id}
                    variant="fine"
                    kindLabel="Jarima"
                    when={formatPackerHistoryWhen(r.created_at)}
                    dateTime={toIso8601DateTimeAttr(r.created_at)}
                    body={r.title || '—'}
                    amountText={`−${formatCurrency(r.amount)}`}
                    amountTone="debit"
                  />
                ))}
              </ul>
            )}
          </>
        ) : null}
        {detailTab === 'rewards' ? (
          <>
            <h4 className="packer-finance-detail-title">Olingan mukofotlar</h4>
            <p className="packer-finance-detail-lead packer-finance-detail-lead--ok">{formatCurrency(summary.reward_amount)}</p>
            {rewards.length === 0 ? (
              <div className="packer-archive-card packer-finance-empty-strip" role="status">
                <div className="packer-archive-row packer-finance-tx-row">
                  <div className="packer-archive-main-clip">
                    <div className="packer-archive-segments">
                      <span className="packer-archive-seg packer-archive-seg--id">Mukofotlar</span>
                      <span className="packer-archive-seg-rule" aria-hidden />
                      <span className="packer-archive-seg packer-archive-seg--when">—</span>
                      <span className="packer-archive-seg-rule" aria-hidden />
                      <span className="packer-archive-seg packer-archive-seg--products">Hozircha yozuv yo‘q</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <ul className="packer-finance-tx-list">
                {rewards.map((r) => (
                  <PackerFinanceTxCard
                    key={r.id}
                    variant="reward"
                    kindLabel="Mukofot"
                    when={formatPackerHistoryWhen(r.created_at)}
                    dateTime={toIso8601DateTimeAttr(r.created_at)}
                    body={r.title || '—'}
                    amountText={`+${formatCurrency(r.amount)}`}
                    amountTone="credit"
                  />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>

      <section className="packer-finance-section packer-finance-section--wide" aria-labelledby="packer-finance-all-tx">
        <h4 id="packer-finance-all-tx" className="packer-finance-section-title">
          Barcha tranzaksiyalar
        </h4>
        {transactions.length === 0 ? (
          <div className="packer-archive-card packer-finance-empty-strip" role="status">
            <div className="packer-archive-row packer-finance-tx-row">
              <div className="packer-archive-main-clip">
                <div className="packer-archive-segments">
                  <span className="packer-archive-seg packer-archive-seg--id">Tranzaksiyalar</span>
                  <span className="packer-archive-seg-rule" aria-hidden />
                  <span className="packer-archive-seg packer-archive-seg--when">—</span>
                  <span className="packer-archive-seg-rule" aria-hidden />
                  <span className="packer-archive-seg packer-archive-seg--products">Hozircha yozuv yo‘q</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ul className="packer-finance-tx-list" aria-label="Barcha tranzaksiyalar">
            {transactions.map((row) => {
              if (row.category === 'withdrawal') {
                const pm = row.payout_method === 'card' ? 'Karta' : 'Naqd';
                return (
                  <PackerFinanceTxCard
                    key={`w-${row.id}`}
                    variant="withdrawal"
                    kindLabel="Pul yechish"
                    when={formatPackerHistoryWhen(row.created_at)}
                    dateTime={toIso8601DateTimeAttr(row.created_at)}
                    body={row.note || 'Hisobdan yechish'}
                    metaPrimary={packerWithdrawStatusUz(row.status)}
                    metaSecondary={pm}
                    withdrawStatus={String(row.status || 'pending')}
                    amountText={formatCurrency(row.amount)}
                    amountTone="neutral"
                  />
                );
              }
              const isFine = row.kind === 'fine';
              const isRew = row.kind === 'reward';
              const sign = isFine ? '−' : isRew ? '+' : '';
              const tone = isFine ? 'debit' : isRew ? 'credit' : 'neutral';
              const v = isFine ? 'fine' : isRew ? 'reward' : 'ledger';
              return (
                <PackerFinanceTxCard
                  key={`l-${row.id}`}
                  variant={v}
                  kindLabel={packerLedgerKindUz(row.kind)}
                  when={formatPackerHistoryWhen(row.created_at)}
                  dateTime={toIso8601DateTimeAttr(row.created_at)}
                  body={row.note || row.title || '—'}
                  amountText={`${sign}${formatCurrency(row.amount)}`}
                  amountTone={tone}
                />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Superuserga pul yechish so‘rovi — `work_roles` balansi (picker bilan bir xil). */
function PackerWithdrawPanel({ request, onFinanceChange }) {
  const [balance, setBalance] = useState(null);
  const [noWorkRole, setNoWorkRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgIsError, setMsgIsError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNoWorkRole(false);
    try {
      const bRes = await request('/packer/balance');
      const bData = await bRes.json().catch(() => ({}));
      if (bRes.status === 403 && bData.code === 'no_work_role') {
        setNoWorkRole(true);
        setBalance(null);
        return;
      }
      if (!bRes.ok) throw new Error(bData.error || 'Balans yuklanmadi');
      setBalance(Number(bData.balance) || 0);
    } catch (e) {
      setMsg(String(e.message || 'Xatolik'));
      setMsgIsError(true);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const raw = String(amount).replace(/\s/g, '').replace(/,/g, '.');
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg('Summani kiriting.');
      setMsgIsError(true);
      return;
    }
    if (balance != null && n > balance) {
      setMsg('Hisobda yetarli mablag‘ yo‘q.');
      setMsgIsError(true);
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await request('/packer/withdrawal', {
        method: 'POST',
        body: JSON.stringify({ amount: n, payout_method: payoutMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'So‘rov yuborilmadi');
      setAmount('');
      setMsg(data.message || 'So‘rov superuserga yuborildi.');
      setMsgIsError(false);
      await load();
      onFinanceChange?.();
    } catch (err) {
      setMsg(err.message || 'Xatolik');
      setMsgIsError(true);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <aside className="packer-profile-withdraw" aria-label="Pul yechish">
        <h3 className="packer-profile-withdraw-title">Hisobdan pul yechish</h3>
        <p className="packer-profile-withdraw-muted">Yuklanmoqda…</p>
      </aside>
    );
  }

  if (noWorkRole) {
    return (
      <aside className="packer-profile-withdraw" aria-label="Pul yechish">
        <h3 className="packer-profile-withdraw-title">Hisobdan pul yechish</h3>
        <p className="packer-profile-withdraw-muted">
          Sklad ish ro‘lingiz (work_roles) akkauntingiz bilan bog‘lanmagan yoki topilmadi. Balans va so‘rovlar faqat administrator
          bergan ish ro‘yi uchun ishlaydi — administrator bilan bog‘laning.
        </p>
      </aside>
    );
  }

  return (
    <aside className="packer-profile-withdraw" aria-label="Pul yechish">
      <h3 className="packer-profile-withdraw-title">Hisobdan pul yechish</h3>
      <p className="packer-profile-withdraw-hint">
        Summani kiriting; so‘rov superuser tomonga boradi. Tasdiqlangach balansdan yechiladi.
      </p>
      <p className="packer-profile-withdraw-balance">
        Mavjud: <strong>{formatCurrency(balance ?? 0)}</strong>
      </p>
      <form className="packer-profile-withdraw-form" onSubmit={(ev) => void onSubmit(ev)}>
        <label className="packer-profile-field-label" htmlFor="packer-wd-method">
          To‘lov usuli
        </label>
        <select
          id="packer-wd-method"
          className="packer-profile-input packer-profile-select"
          value={payoutMethod}
          onChange={(ev) => setPayoutMethod(ev.target.value)}
          disabled={busy}
          aria-label="Pul naqd yoki kartaga"
        >
          <option value="cash">Naqd</option>
          <option value="card">Karta</option>
        </select>
        <label className="packer-profile-field-label" htmlFor="packer-wd-amount">
          Summa (so‘m)
        </label>
        <div className="packer-profile-withdraw-row">
          <input
            id="packer-wd-amount"
            className="packer-profile-input"
            inputMode="decimal"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value)}
            disabled={busy}
            placeholder="Masalan: 500000"
          />
          <button type="submit" className="packer-btn packer-btn-primary" disabled={busy}>
            {busy ? '…' : 'So‘rov yuborish'}
          </button>
        </div>
      </form>
      {msg ? (
        <p className={`packer-profile-withdraw-msg${msgIsError ? ' packer-profile-withdraw-msg--err' : ''}`} role="status">
          {msg}
        </p>
      ) : null}
      <p className="packer-profile-withdraw-foot">Tranzaksiyalar va so‘rovlar tarixi — pastdagi ro‘yxatda.</p>
    </aside>
  );
}

function PackerProfileView({ user, updateProfile, request }) {
  const [financeTick, setFinanceTick] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [login, setLogin] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedbackOk, setFeedbackOk] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name || '');
    setEmail(user.email || '');
    setLogin(user.login || '');
    setPhone(user.phone || '');
    setPassword('');
    setPassword2('');
    setFeedbackOk(false);
  }, [user]);

  if (!user) {
    return <div className="packer-loading packer-loading--muted">Profil ma’lumotlari yuklanmadi.</div>;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!updateProfile) return;
    if (password.trim() && password !== password2) {
      window.alert('Parollar mos emas.');
      return;
    }
    setSaving(true);
    setFeedbackOk(false);
    try {
      const body = {
        full_name: fullName.trim(),
        email: email.trim(),
        login: login.trim(),
        phone: phone.trim(),
      };
      if (password.trim()) body.password = password;
      await updateProfile(body);
      setPassword('');
      setPassword2('');
      setFeedbackOk(true);
    } catch (err) {
      window.alert(err.message || 'Saqlanmadi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="packer-profile-layout">
        <div className="packer-profile-editor">
          <form className="packer-profile-form staff-account-touch" onSubmit={(ev) => void onSubmit(ev)}>
        <div className="packer-profile-fields packer-meta-dl packer-profile-dl">
          <div>
            <label className="packer-profile-field-label" htmlFor="packer-profile-full_name">
              Ism
            </label>
            <input
              id="packer-profile-full_name"
              className="packer-profile-input"
              value={fullName}
              onChange={(ev) => setFullName(ev.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label className="packer-profile-field-label" htmlFor="packer-profile-email">
              Email
            </label>
            <input
              id="packer-profile-email"
              type="email"
              className="packer-profile-input"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="packer-profile-field-label" htmlFor="packer-profile-login">
              Login
            </label>
            <input
              id="packer-profile-login"
              className="packer-profile-input"
              value={login}
              onChange={(ev) => setLogin(ev.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="packer-profile-field-label" htmlFor="packer-profile-phone">
              Telefon
            </label>
            <input
              id="packer-profile-phone"
              type="tel"
              className="packer-profile-input"
              value={phone}
              onChange={(ev) => setPhone(ev.target.value)}
              autoComplete="tel"
            />
          </div>
          <div className="packer-meta-full">
            <span className="packer-profile-field-label">Rol</span>
            <p className="packer-profile-ro">{user.role || 'packer'}</p>
            <p className="packer-profile-ro-hint">Rol faqat administrator tomonidan o‘zgartiriladi.</p>
          </div>
        </div>

        <div className="packer-profile-password-group">
          <div>
            <label className="packer-profile-field-label" htmlFor="packer-profile-password">
              Yangi parol (ixtiyoriy)
            </label>
            <input
              id="packer-profile-password"
              type="password"
              className="packer-profile-input"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="packer-profile-field-label" htmlFor="packer-profile-password2">
              Parolni takrorlang
            </label>
            <input
              id="packer-profile-password2"
              type="password"
              className="packer-profile-input"
              value={password2}
              onChange={(ev) => setPassword2(ev.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="packer-profile-form-actions">
          <button type="submit" className="packer-btn packer-btn-primary" disabled={saving}>
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          {feedbackOk ? (
            <span className="packer-profile-feedback-ok" role="status">
              O‘zgarishlar saqlandi.
            </span>
          ) : null}
        </div>
      </form>
        </div>
        {request ? <PackerWithdrawPanel request={request} onFinanceChange={() => setFinanceTick((t) => t + 1)} /> : null}
      </div>
      <div className="packer-profile-page-rule" role="separator" />
      {request ? <PackerProfileFinance request={request} refreshKey={financeTick} /> : null}
    </>
  );
}

/** Tarix: qadoqlash cheki (print) */
function PackerArchivePrintBtn({ order, packerName, disabled }) {
  return (
    <button
      type="button"
      className="packer-archive-print-btn"
      aria-label="Qadoqlash chekini chop etish"
      title="Chek chop etish"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        printPackingSlip(order, packerName);
      }}
    >
      <svg className="packer-archive-print-btn__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M6 9V3h12v6M6 15v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6M6 15H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"
        />
      </svg>
    </button>
  );
}

/** Tarix: packaged→navbat; Hold: hold→navbat */
function PackerArchiveHomeArrow({ busy, onReturn, variant = 'history' }) {
  const isHold = variant === 'hold';
  const aria = isHold ? 'Holddan asosiy navbatga chiqarish' : 'Zakazni asosiy navbatga qaytarish';
  const hint = isHold ? 'Holddan navbatga' : 'Navbatga qaytarish';
  return (
    <button
      type="button"
      className="packer-archive-home-btn"
      aria-label={aria}
      title={busy ? 'Bajarilmoqda…' : hint}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void onReturn();
      }}
    >
      <svg className="packer-archive-home-btn__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 6 6v0"
        />
      </svg>
    </button>
  );
}

/** Tarix va Hold sahifalari: bir xil kartochka qatorlari (Hold: chek tug‘masi yo‘q) */
function PackerArchiveOrderRows({
  orders,
  packerName,
  returningId,
  onReturnOrder,
  onOpenOrderReceipt,
  homeVariant = 'history',
  showPrintButton = true,
}) {
  const rowClickable = typeof onOpenOrderReceipt === 'function';

  return (
    <ul className="packer-archive-list">
      {orders.map((o, cardIdx) => {
        const items = o.items || [];
        const whenStr = formatPackerHistoryWhen(o.created_at);
        const itemsSummary = items
          .map((i) => `${i.name_uz || 'Mahsulot'} ×${Number(i.quantity) || 0}`)
          .join(' · ');
        const addrStr =
          o.shipping_address != null && String(o.shipping_address).trim() !== '' ? String(o.shipping_address).trim() : null;
        let addressPart = addrStr;
        let commentPart = null;
        if (addrStr) {
          const lowerAddr = addrStr.toLowerCase();
          const sharhIdx = lowerAddr.indexOf('. sharh:');
          const izohIdx = lowerAddr.indexOf('. izoh:');
          if (sharhIdx !== -1) {
            addressPart = addrStr.substring(0, sharhIdx).trim();
            commentPart = addrStr.substring(sharhIdx + 8).trim();
          } else if (izohIdx !== -1) {
            addressPart = addrStr.substring(0, izohIdx).trim();
            commentPart = addrStr.substring(izohIdx + 7).trim();
          }
        }
        const phoneStr =
          o.contact_phone != null && String(o.contact_phone).trim() !== '' ? String(o.contact_phone).trim() : null;
        const nameStr =
          o.customer_full_name != null && String(o.customer_full_name).trim() !== ''
            ? String(o.customer_full_name).trim()
            : null;
        const customerTitle = [nameStr, phoneStr, addrStr].filter(Boolean).join('\n');
        const rowTitle = [
          `Zakaz #${o.id}`,
          whenStr,
          nameStr,
          phoneStr,
          addrStr,
          items.length ? itemsSummary : null,
          formatCurrency(o.total_amount),
        ]
          .filter(Boolean)
          .join(' · ');
        const tone = cardIdx % 4;
        const rowBusy = returningId === o.id;
        return (
          <li key={o.id} className={`packer-archive-card packer-archive-card--tone-${tone}`}>
            <div
              className={`packer-archive-row${rowBusy ? ' packer-archive-row--busy' : ''}${rowClickable ? ' packer-archive-row--clickable' : ''}`}
              title={rowTitle}
              role={rowClickable ? 'button' : undefined}
              tabIndex={rowClickable ? 0 : undefined}
              onClick={() => {
                if (!rowBusy && rowClickable) onOpenOrderReceipt(o);
              }}
              onKeyDown={(event) => {
                if (!rowBusy && rowClickable && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onOpenOrderReceipt(o);
                }
              }}
            >
              <div className="packer-archive-main-clip">
                <div className="packer-archive-segments">
                  <span className="packer-archive-seg packer-archive-seg--id">Zakaz #{o.id}</span>
                  <span className="packer-archive-seg-rule" aria-hidden />
                  <time
                    className="packer-archive-seg packer-archive-seg--when"
                    dateTime={toIso8601DateTimeAttr(o.created_at)}
                  >
                    {whenStr}
                  </time>
                  {items.length > 0 ? (
                    <>
                      <span className="packer-archive-seg-rule" aria-hidden />
                      <span className="packer-archive-seg packer-archive-seg--products" title={itemsSummary}>
                        {items.map((i, idx) => (
                          <div key={i.id ?? `${o.id}-${i.product_id}-${idx}`} className="packer-archive-product-row">
                            <div className="packer-archive-product-left">
                              <span className="packer-archive-line-thumb" aria-hidden>
                                {i.image_url ? (
                                  <img src={resolvePackerProductImageUrl(i.image_url)} alt="" loading="lazy" decoding="async" />
                                ) : null}
                              </span>
                              <span className="packer-archive-line-name">{i.name_uz || 'Mahsulot'}</span>
                            </div>
                            <span className="packer-archive-line-qty">×{Number(i.quantity) || 0}</span>
                          </div>
                        ))}
                      </span>
                    </>
                  ) : null}
                  {addressPart ? (
                    <>
                      <span className="packer-archive-seg-rule packer-archive-seg-rule--address" aria-hidden />
                      <span className="packer-archive-address" title={addrStr}>
                        <div className="packer-archive-address-row">
                          <span className="packer-archive-address-label">Mijoz manzili:</span>
                          <span className="packer-archive-address-value">{addressPart}</span>
                        </div>
                        {commentPart ? (
                          <>
                            <div className="packer-archive-address-divider" aria-hidden />
                            <div className="packer-archive-address-row">
                              <span className="packer-archive-address-label">Izoh:</span>
                              <span className="packer-archive-address-value">{commentPart}</span>
                            </div>
                          </>
                        ) : null}
                      </span>
                    </>
                  ) : null}
                  <span className="packer-archive-seg-rule packer-archive-seg-rule--customer" aria-hidden />
                  <span className="packer-archive-customer packer-archive-customer--middle" title={customerTitle || undefined}>
                    {nameStr ? (
                      <div className="packer-archive-customer-row">
                        <span className="packer-archive-customer-label">Mijoz ismi:</span>
                        <span className="packer-archive-customer-value">{nameStr}</span>
                      </div>
                    ) : null}
                    {phoneStr ? (
                      <>
                        {nameStr ? <div className="packer-archive-customer-divider" aria-hidden /> : null}
                        <div className="packer-archive-customer-row">
                          <span className="packer-archive-customer-label">Tel raqam:</span>
                          <span className="packer-archive-customer-value">{phoneStr}</span>
                        </div>
                      </>
                    ) : null}
                    {!nameStr && !addrStr && !phoneStr ? <span className="packer-archive-customer-missing">—</span> : null}
                  </span>
                  <span className="packer-archive-seg-rule packer-archive-seg-rule--sum" aria-hidden />
                  <span className="packer-archive-seg packer-archive-seg--total-sum">
                    <span className="packer-archive-total-sum-label">Jami:</span>
                    <strong className="packer-archive-total-sum-val">{formatCurrency(o.total_amount)}</strong>
                  </span>
                </div>
              </div>
              <div className="packer-archive-trail">
                <span className="packer-archive-sum packer-archive-sum--order-total">{formatCurrency(o.total_amount)}</span>
                {showPrintButton ? (
                  <PackerArchivePrintBtn order={o} packerName={packerName || 'Packer'} disabled={rowBusy} />
                ) : null}
                <PackerArchiveHomeArrow
                  busy={rowBusy}
                  variant={homeVariant}
                  onReturn={() => onReturnOrder(o.id)}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PackerReceiptView({ request, packerName }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const id = Number(orderId);
    if (!orderId || Number.isNaN(id) || id < 1) {
      setOrder(null);
      setError("Noto'g'ri zakaz identifikatori.");
      setLoading(false);
      return;
    }

    const loadOrder = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await request('/packer/orders/history');
        if (!res.ok) throw new Error('Chek tarixi olinmadi');
        const data = await res.json();
        const found = (Array.isArray(data.orders) ? data.orders : []).find((o) => Number(o.id) === id);
        if (!isMounted) return;
        if (!found) {
          setError('Ushbu zakaz tarixi topilmadi.');
          setOrder(null);
        } else {
          setOrder(found);
        }
      } catch (e) {
        if (!isMounted) return;
        setError(e.message || 'Xatolik');
        setOrder(null);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    void loadOrder();
    return () => {
      isMounted = false;
    };
  }, [orderId, request]);

  const handlePrint = useCallback(() => {
    if (!order) return;
    printPackingSlip(order, packerName);
  }, [order, packerName]);

  const items = order?.items || [];
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + (Number(item.price_at_order) || 0) * (Number(item.quantity) || 0),
    0,
  );
  const total = Number(order?.total_amount) || 0;
  const deliveryHint = Math.max(0, Math.round((total - itemsSubtotal) * 100) / 100);
  const customerName = String(order?.customer_full_name || order?.customer_name || '').trim();
  const phone = order?.contact_phone != null ? String(order.contact_phone).trim() : '';
  const addr = order?.shipping_address != null ? String(order.shipping_address).trim() : '';
  const customerLine1 = [customerName || null, phone || null].filter(Boolean).join(' · ') || '—';
  const customerLine2 = addr || '—';
  const barcodeSvg = order ? buildBarcodeSvg(order.id) : '';

  if (loading) {
    return <div className="packer-loading">Yuklanmoqda...</div>;
  }

  if (error) {
    return (
      <div className="packer-page packer-archive-page">
        <div className="packer-route-title-row">
          <button type="button" className="packer-receipt-back-btn" onClick={() => navigate('/packer/history')}>
            ← Orqaga
          </button>
          <h2 className="packer-route-title">Chek</h2>
        </div>
        <p className="packer-db-hint">{error}</p>
      </div>
    );
  }

  return (
    <div className="packer-page packer-archive-page packer-receipt-page">
      <div className="packer-route-title-row">
        <button type="button" className="packer-receipt-back-btn" onClick={() => navigate('/packer/history')}>
          ← Tarixga qaytish
        </button>
        <h2 className="packer-route-title">Chek #{order.id}</h2>
        <button type="button" className="packer-archive-print-btn" onClick={handlePrint}>
          Chop etish
        </button>
      </div>
      <div className="packer-receipt-card">
        <div className="packer-receipt-head">
          <div className="packer-receipt-barcode" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          <div className="packer-receipt-summary">
            <div className="packer-receipt-summary-item">
              <span className="packer-receipt-summary-key">Zakaz</span>
              <span className="packer-receipt-summary-value">#{order.id}</span>
            </div>
            <div className="packer-receipt-summary-item">
              <span className="packer-receipt-summary-key">Sana</span>
              <span className="packer-receipt-summary-value">{formatDateTime(order.created_at)}</span>
            </div>
            <div className="packer-receipt-summary-item">
              <span className="packer-receipt-summary-key">Operator</span>
              <span className="packer-receipt-summary-value">{packerName || '—'}</span>
            </div>
          </div>
        </div>
        <div className="packer-receipt-section">
          <div className="packer-receipt-section-title">Mijoz</div>
          <div className="packer-receipt-section-body">
            <div>{customerLine1}</div>
            <div>{customerLine2}</div>
          </div>
        </div>
        <div className="packer-receipt-section">
          <div className="packer-receipt-item-list">
            {items.length > 0 ? (
              items.map((item) => (
                <div key={item.id ?? `${item.product_id}-${item.quantity}`} className="packer-receipt-item-row">
                  <span className="packer-receipt-item-name">{item.name_uz || 'Mahsulot'}</span>
                  <span className="packer-receipt-item-qty">×{Number(item.quantity) || 0}</span>
                </div>
              ))
            ) : (
              <div className="packer-receipt-item-row packer-receipt-item-row--empty">Zakazda mahsulot yo‘q</div>
            )}
          </div>
        </div>
        <div className="packer-receipt-section packer-receipt-totals">
          <div className="packer-receipt-total-row">
            <span>Maxsulotlar summasi</span>
            <strong>{formatCurrency(itemsSubtotal || total)}</strong>
          </div>
          <div className="packer-receipt-total-row">
            <span>Yetkazish xizmati</span>
            <strong>{formatCurrency(deliveryHint)}</strong>
          </div>
          <div className="packer-receipt-total-row packer-receipt-total-row--grand">
            <span>Jami</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function PackerArchiveList({ request, apiPath, emptyText, title, packerName }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returningId, setReturningId] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      if (!silent) {
    setLoading(true);
    setError('');
      }
    try {
        const res = await request(apiPath);
        if (!res.ok) throw new Error("Ro'yxat yuklanmadi");
      const data = await res.json();
      setOrders(data.orders || []);
        setError('');
    } catch (e) {
        if (!silent) setError(e.message || 'Xatolik');
    } finally {
        if (!silent) setLoading(false);
      }
    },
    [request, apiPath]
  );

  const returnOrderToQueue = useCallback(
    async (orderId) => {
      setReturningId(orderId);
      try {
        const res = await request(`/packer/orders/${orderId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'picked' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Zakaz navbatga qaytarilmadi');
        await load({ silent: true });
      } catch (e) {
        window.alert(e.message || 'Xatolik');
      } finally {
        setReturningId(null);
      }
    },
    [request, load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load({ silent: true });
    }, 45000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && orders.length === 0) {
    return <div className="packer-loading">Yuklanmoqda...</div>;
  }
  if (error) {
    return (
      <div className="packer-page">
        <p className="packer-workspace-alert" role="alert">
          {error}
        </p>
        <button type="button" className="packer-btn packer-btn-secondary" onClick={() => void load()}>
          Qayta urinish
        </button>
      </div>
    );
  }
  const heading = title || 'Chiqarilgan zakazlar tarixi';

  if (orders.length === 0) {
    return (
      <div className="packer-page packer-archive-page">
        <h2 className="packer-route-title">{heading}</h2>
        <p className="packer-db-hint">
          Ma’lumotlar API orqali server bazasidan keladi (administrator ko‘rgan buyurtmalar bilan bir xil bazada).
        </p>
        <div className="packer-loading packer-loading--muted">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="packer-page packer-archive-page">
      <h2 className="packer-route-title">{heading}</h2>
      <p className="packer-db-hint">
        Ma’lumotlar API orqali server bazasidan keladi (administrator ko‘rgan buyurtmalar bilan bir xil bazada).
      </p>
      <PackerArchiveOrderRows
        orders={orders}
        packerName={packerName}
        returningId={returningId}
        onReturnOrder={returnOrderToQueue}
        homeVariant="history"
        onOpenOrderReceipt={(order) => navigate(`/packer/history/${order.id}`)}
      />
    </div>
  );
}

/** Hold zakazlari — tarix bilan bir xil qatorlar, bazadan `/packer/orders/hold` */
function PackerHoldProductsView({ request, packerName }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returningId, setReturningId] = useState(null);

  const load = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const res = await request('/packer/orders/hold');
        if (!res.ok) throw new Error("Hold ro'yxati yuklanmadi");
        const data = await res.json();
        setOrders(data.orders || []);
        setError('');
      } catch (e) {
        if (!silent) setError(e.message || 'Xatolik');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [request]
  );

  const returnHoldToQueue = useCallback(
    async (orderId) => {
      setReturningId(orderId);
      try {
        const res = await request(`/packer/orders/${orderId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'picked' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Zakaz navbatga chiqmadi');
        await load({ silent: true });
      } catch (e) {
        window.alert(e.message || 'Xatolik');
      } finally {
        setReturningId(null);
      }
    },
    [request, load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load({ silent: true });
    }, 45000);
    return () => clearInterval(id);
  }, [load]);

  const sortedOrders = useMemo(() => {
    const list = [...orders];
    list.sort((a, b) => {
      const ta = parseServerDateTime(a.created_at)?.getTime() ?? 0;
      const tb = parseServerDateTime(b.created_at)?.getTime() ?? 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
    return list;
  }, [orders]);

  if (loading && orders.length === 0) {
    return <div className="packer-loading">Yuklanmoqda...</div>;
  }
  if (error) {
    return (
      <div className="packer-page">
        <p className="packer-workspace-alert" role="alert">
          {error}
        </p>
        <button type="button" className="packer-btn packer-btn-secondary" onClick={() => void load()}>
          Qayta urinish
        </button>
      </div>
    );
  }

  const emptyText = 'Hold holatidagi zakazlar yo‘q yoki ular sizga tayinlanmagan.';

  if (orders.length === 0) {
    return (
      <div className="packer-page packer-archive-page">
        <h2 className="packer-route-title">Hold</h2>
        <p className="packer-db-hint">
          Ma’lumotlar API orqali server bazasidan keladi (administrator ko‘rgan buyurtmalar bilan bir xil bazada).
        </p>
        <div className="packer-loading packer-loading--muted">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="packer-page packer-archive-page">
      <h2 className="packer-route-title">Hold</h2>
      <p className="packer-db-hint">
        Ma’lumotlar API orqali server bazasidan keladi (administrator ko‘rgan buyurtmalar bilan bir xil bazada).
      </p>
      <PackerArchiveOrderRows
        orders={sortedOrders}
        packerName={packerName}
        returningId={returningId}
        onReturnOrder={returnHoldToQueue}
        homeVariant="hold"
        showPrintButton={false}
      />
    </div>
  );
}

export default function PackerDashboard() {
  const { request, user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();
  const [staffNotifOpen, setStaffNotifOpen] = useState(false);
  const [staffProfileOpen, setStaffProfileOpen] = useState(false);
  const [staffNotifSoundOn, setStaffNotifSoundOn] = useState(true);
  const [staffNotifications, setStaffNotifications] = useState([]);

  const loadStaffNotifications = useCallback(async () => {
    try {
      const res = await request('/packer/notifications', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setStaffNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setStaffNotifications([]);
    }
  }, [request]);

  const markStaffNotificationRead = useCallback(async (id) => {
    try {
      await request(`/packer/notifications/${id}/read`, { method: 'PATCH' });
      setStaffNotifications((prev) =>
        prev.map((n) => (Number(n.id) === Number(id) ? { ...n, read_at: new Date().toISOString() } : n)),
      );
    } catch (_) {}
  }, [request]);

  const staffNotifUnreadCount = useMemo(
    () => staffNotifications.filter((n) => !n.read_at).length,
    [staffNotifications],
  );

  const packerDisplayName = user?.full_name || 'Packer';

  useEffect(() => {
    if (staffNotifOpen) void loadStaffNotifications();
  }, [staffNotifOpen, loadStaffNotifications]);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [productModal, setProductModal] = useState(null);
  const [gatheredLines, setGatheredLines] = useState(() => readGatheredFromStorage());
  const [regionFilterId, setRegionFilterId] = useState(() => readPackerViloyatFilter());

  const markLineGathered = useCallback((orderId, productId) => {
    setGatheredLines((prev) => {
      const next = new Set(prev);
      next.add(gatheredLineKey(orderId, productId));
      writeGatheredToStorage(next);
      return next;
    });
  }, []);

  const clearGatheredForOrder = useCallback((orderId) => {
    setGatheredLines((prev) => {
      const next = new Set(prev);
      for (const key of [...next]) {
        if (key.startsWith(`${orderId}:`)) next.delete(key);
      }
      writeGatheredToStorage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setRegionFilterId((cur) => {
      if (!cur) return cur;
      if (PACKER_UZ_VILOYATLAR.some((r) => r.id === cur)) return cur;
      writePackerViloyatFilter('');
      return '';
    });
  }, []);

  const loadData = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      if (!silent) {
        setLoading(true);
        setActionError('');
      }
      try {
        const res = await request('/packer/orders', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Zakazlar yuklanmadi');
        const list = data.orders || [];
        setOrders(list);
      } catch (e) {
        if (!silent) {
          setActionError(e.message || "Ma'lumotlar yuklanmadi");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [request]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadData({ silent: true });
    }, 28000);
    return () => clearInterval(id);
  }, [loadData]);

  const filteredOrdersForQueue = useMemo(() => {
    if (!regionFilterId) return orders;
    const reg = PACKER_UZ_VILOYATLAR.find((r) => r.id === regionFilterId);
    if (!reg) return orders;
    return orders.filter((o) => orderMatchesViloyatEntry(o.shipping_address, reg));
  }, [orders, regionFilterId]);

  const aggregated = useMemo(() => aggregatePackerOrdersByProduct(filteredOrdersForQueue), [filteredOrdersForQueue]);

  const queueProductsRaw = useMemo(() => aggregated, [aggregated]);
  const queueProducts = useMemo(() => {
    const withAlloc = queueProductsRaw.map((g) => applyStockAllocationToProductGroup(g));
    return sortPackerQueueByOrdersDesc(withAlloc);
  }, [queueProductsRaw]);

  useEffect(() => {
    setProductModal((m) => {
      if (!m) return m;
      const fresh = queueProducts.find((g) => g.product_id === m.product_id);
      if (!fresh) return null;
      return fresh;
    });
  }, [queueProducts]);

  const handleBulkHoldForProduct = async (row) => {
    const targets = (row.orders || []).filter((o) => o.packerCanFulfill === false && o.id > 0);
    if (!targets.length) return;
    setActionError('');
    try {
      for (const o of targets) {
        const res = await request(`/packer/orders/${o.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'hold' }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Hold qilinmadi');
      }
      await loadData();
      setProductModal(null);
    } catch (e) {
      setActionError(e.message || 'Xatolik');
    }
  };

  const handlePackaged = async (orderId) => {
    setBusyId(orderId);
    setActionError('');
    try {
      const res = await request(`/packer/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'packaged' }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Status yangilanmadi');
      }
      clearGatheredForOrder(orderId);
      await loadData();
      return true;
    } catch (e) {
      setActionError(e.message || 'Xatolik');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handlePrintOrderChek = useCallback(
    (order, productGroup) => {
      if (!canPrintOrderChek(order, gatheredLines)) {
        if (!orderAllItemsInStock(order)) {
          window.alert('Omborda yetarli mahsulot yo‘q — qizil qatorlarni tekshiring.');
        } else if (orderDistinctLineCount(order) >= 2 && !isOrderFullyGathered(order, gatheredLines)) {
          window.alert('Avval zakazdagi barcha mahsulotlarni terib oling.');
        } else {
          window.alert('Omborda yetarli mahsulot yo‘q — chek chiqarilmaydi.');
        }
        return;
      }
      openPackingSlip(order, packerDisplayName, {
        productGroup: productGroup ?? null,
        autoPrint: true,
        skipFulfillmentCheck: false,
      });
    },
    [gatheredLines, packerDisplayName]
  );

  const openQueueProductModal = useCallback(
    (row) => {
      setProductModal(row);
      const sorted = sortOrdersForChekPrintOrder(row.orders || []);
      const pick = sorted.find((o) => o.packerCanFulfill !== false) ?? sorted[0];
      if (!pick) return;
      openPackingSlip(pick, packerDisplayName, {
        productGroup: row,
        autoPrint: false,
        skipFulfillmentCheck: true,
      });
    },
    [packerDisplayName]
  );

  const handleDirectPrintAndPack = useCallback(
    async (row) => {
      const sorted = sortOrdersForChekPrintOrder(row.orders || []);
      const targetOrder = sorted.find((o) => o.packerCanFulfill !== false) || sorted[0];
      if (!targetOrder) return;

      if (targetOrder.packerCanFulfill === false) {
        window.alert('Omborda yetarli mahsulot yo‘q — chek chiqarilmaydi.');
        return;
      }

      if (!orderAllItemsInStock(targetOrder)) {
        window.alert('Omborda yetarli mahsulot yo‘q — qizil qatorlarni tekshiring.');
        return;
      }

      if (orderDistinctLineCount(targetOrder) >= 2 && !isOrderFullyGathered(targetOrder, gatheredLines)) {
        window.alert('Avval zakazdagi barcha mahsulotlarni terib oling.');
        return;
      }

      const slipOpened = openPackingSlip(targetOrder, packerDisplayName, {
        productGroup: row,
        autoPrint: true,
        skipFulfillmentCheck: false,
      });

      if (slipOpened) {
        const success = await handlePackaged(targetOrder.id);
        if (success) {
          navigate('/packer/history');
        }
      }
    },
    [gatheredLines, packerDisplayName, navigate]
  );

  const productModalOrdersDisplay = useMemo(
    () => (productModal ? sortOrdersForChekPrintOrder(productModal.orders || []) : []),
    [productModal]
  );

  const isHome = location.pathname === '/packer' || location.pathname === '/packer/';

  useEffect(() => {
    if (!isHome) return;
    const oid = searchParams.get('order');
    if (!oid) return;
    if (loading) return;
    const id = Number(oid);
    const group = Number.isFinite(id)
      ? queueProducts.find((g) => (g.orders || []).some((o) => Number(o.id) === id))
      : null;
    const next = new URLSearchParams(searchParams);
    next.delete('order');
    setSearchParams(next, { replace: true });
    if (group) {
      setProductModal(group);
      const pick = group.orders.find((o) => Number(o.id) === id);
      if (pick) {
        openPackingSlip(pick, packerDisplayName, {
          productGroup: group,
          autoPrint: false,
          skipFulfillmentCheck: true,
        });
      }
    }
  }, [isHome, loading, packerDisplayName, searchParams, queueProducts, setSearchParams]);

  const topMeta = useMemo(() => {
    const pathNorm = location.pathname.replace(/\/$/, '') || '/';
    if (pathNorm.endsWith('/profile')) return { title: 'Profil', showCount: false, count: 0 };
    if (pathNorm.endsWith('/history')) return { title: 'Tarix', showCount: false, count: 0 };
    if (pathNorm.endsWith('/hold')) return { title: 'Hold', showCount: false, count: 0 };
    /* Asosiy sahifa: faqat kartalar — sarlavha yo‘q */
    if (pathNorm === '/packer') return { title: null, showCount: true, count: queueProducts.length };
    return { title: 'Bosh sahifa', showCount: true, count: queueProducts.length };
  }, [location.pathname, queueProducts.length]);

  const queueOrderCount = queueProducts.reduce((s, g) => s + (g.orders_count || 0), 0);

  const handleRegionFilterChange = useCallback((value) => {
    setRegionFilterId(value);
    writePackerViloyatFilter(value);
  }, []);

  const topbarControlsProps = {
    topMeta,
    regionFilterId,
    onRegionChange: handleRegionFilterChange,
    packerDisplayName,
    queueOrderCount,
    queueProductsLength: queueProducts.length,
    isHome,
    loading,
    onRefresh: loadData,
    staffActionsProps: {
      displayName: packerDisplayName,
      profilePath: '/packer/profile',
      staffNotifOpen,
      setStaffNotifOpen,
      staffNotifSoundOn,
      staffNotifUnreadCount,
      staffNotifications,
      markStaffNotificationRead,
      staffProfileOpen,
      setStaffProfileOpen,
      navigate,
      logout,
    },
  };

  return (
    <div className="packer-app packer-app--v2-queue">
      <aside id="packer-sidebar-nav" className="packer-sidebar packer-sidebar--rail" aria-label="Packer navigatsiyasi">
        <div className="packer-sidebar-inner">
          <StaffRailTopbarActions
            {...topbarControlsProps.staffActionsProps}
            className="packer-rail-staff-actions"
            showProfile={false}
          />
          <nav className="packer-nav packer-nav--rail" aria-label="Packer bo‘limlari">
            <NavLink to="/packer" end className={navLinkClassRail} title="Bosh sahifa">
              <RailIconNav>
                <path
                  {...RAIL_IC}
                  d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </RailIconNav>
              <span className="packer-sr-only">Bosh sahifa</span>
            </NavLink>
            <NavLink to="/packer/profile" className={navLinkClassRail} title="Profil">
              <RailIconNav>
                <path
                  {...RAIL_IC}
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </RailIconNav>
              <span className="packer-sr-only">Profil</span>
            </NavLink>
            <NavLink to="/packer/history" className={navLinkClassRail} title="Tarix">
              <RailIconNav>
                <path {...RAIL_IC} d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </RailIconNav>
              <span className="packer-sr-only">Tarix</span>
            </NavLink>
            <NavLink to="/packer/hold" className={navLinkClassRail} title="Hold">
              <RailIconNav>
                <path {...RAIL_IC} d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </RailIconNav>
              <span className="packer-sr-only">Hold</span>
            </NavLink>
          </nav>

          <div className="packer-sidebar-footer packer-sidebar-footer--rail">
            <div className="packer-rail-theme" role="group" aria-label="Mavzu">
              <button
                type="button"
                className={`packer-rail-icon-btn packer-rail-theme-toggle${theme === 'dark' ? ' packer-rail-icon-btn--on' : ''}`}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-pressed={theme === 'dark'}
                aria-label={theme === 'dark' ? 'Kun rejimiga o‘tish' : 'Tun rejimiga o‘tish'}
                title={theme === 'dark' ? 'Kun' : 'Tun'}
              >
                <RailIconBtnInner>
                  {theme === 'dark' ? (
                    <path
                      {...RAIL_IC}
                      d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
                    />
                  ) : (
                    <path
                      {...RAIL_IC}
                      d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"
                    />
                  )}
                </RailIconBtnInner>
              </button>
            </div>
            <StaffRailTopbarActions
              {...topbarControlsProps.staffActionsProps}
              className="packer-rail-footer-profile"
              showBell={false}
              profileTriggerClassName="packer-rail-footer-profile-trigger"
              profileHideChevron
            />
            <button
              type="button"
              className="packer-rail-icon-btn packer-rail-icon-btn--logout packer-rail-logout-btn"
              onClick={() => {
                if (
                  !window.confirm(
                    'Sahifadan chiqishni tasdiqlaysizmi?\n\nTasdiqlasangiz, hisobdan chiqasiz va bosh sahifaga o‘tadi.'
                  )
                ) {
                  return;
                }
                logout();
                navigate('/');
              }}
              aria-label="Chiqish"
              title="Chiqish"
            >
              <RailIconBtnInner>
                <path
                  {...RAIL_IC}
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M18 12H9.75m5.25 0 3-3m-3 3 3 3"
                />
              </RailIconBtnInner>
            </button>
          </div>
        </div>
      </aside>

      <div className="packer-workspace">
        <header className="packer-sticky-topbar">
          <PackerTopbarControls {...topbarControlsProps} />
        </header>

        {actionError ? (
          <div className="packer-workspace-alert" role="alert">
            {actionError}
          </div>
        ) : null}

        <main className={`packer-main packer-main--products-only${isHome ? ' packer-main--v2-home' : ''}`}>
          <StaffAdvanceConfirm />
          <Routes>
            <Route
              index
              element={
                <div className="packer-v2-queue">
                  {loading && orders.length === 0 ? (
                    <div className="packer-loading packer-v2-queue__loading">Yuklanmoqda...</div>
                  ) : queueProducts.length === 0 ? (
                    <div className="packer-loading packer-loading--muted packer-v2-queue__loading">
                      Hozircha navbat bo‘sh.
                    </div>
                  ) : (
                    <div className="packer-v2-product-grid operator-home-product-grid product-grid">
                      {queueProducts.map((row) => (
                        <StaffHomeProductCard
                          key={row.product_id}
                          name={row.name_uz}
                          imageUrl={row.image_url}
                          warehouseStock={row.stock}
                          orderCount={row.orders_count ?? 0}
                          blocked={false}
                          hidePrice
                          className="packer-home-product-card"
                          resolveImageUrl={resolvePackerProductImageUrl}
                          onImageClick={() => handleDirectPrintAndPack(row)}
                          onBodyClick={() => openQueueProductModal(row)}
                          ariaLabel={`${row.name_uz} — to'g'ridan-to'g'ri chop etish va qadoqlash`}
                          imageOverlay={
                            row.showHoldCta ? (
                              <div className="packer-card-hold-overlay">
                                <button
                                  type="button"
                                  className="packer-card-hold-btn"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleBulkHoldForProduct(row);
                                  }}
                                >
                                  Hold
                                </button>
                              </div>
                            ) : null
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              }
            />
            <Route
              path="profile"
              element={
                <div className="packer-page packer-profile-page">
                  <h2 className="packer-route-title">Profil</h2>
                  <p className="packer-db-hint">
                    Ma’lumotlar tizimdagi akkauntingiz bo‘yicha (server) ko‘rsatiladi.
                  </p>
                  <PackerProfileView user={user} updateProfile={updateProfile} request={request} />
                </div>
              }
            />
            <Route
              path="history/:orderId"
              element={<PackerReceiptView request={request} packerName={packerDisplayName} />}
            />
            <Route
              path="history"
              element={
                <PackerArchiveList
                  request={request}
                  apiPath="/packer/orders/history"
                  title="Chiqarilgan zakazlar tarixi"
                  emptyText="Hozircha qadoqlangan zakazlar tarixi bo‘sh."
                  packerName={packerDisplayName}
                />
              }
            />
            <Route path="hold" element={<PackerHoldProductsView request={request} packerName={packerDisplayName} />} />
            <Route path="*" element={<Navigate to="/packer" replace />} />
          </Routes>
      </main>
      </div>

      {productModal ? (
        <div
          className="packer-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="packer-pm-title"
          onClick={() => setProductModal(null)}
        >
          <div className="packer-product-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="packer-pm-title" className="packer-product-modal-title">
              {productModal.name_uz}
            </h2>
            <p className="packer-product-modal-meta">
              Jami: {productModal.orders_count} ta zakaz · navbatda {productModal.units_in_queue} dona · omborda{' '}
              {productModal.stock}
            </p>
            {productModal.showHoldCta ? (
              <div className="packer-product-modal-hold-row">
                <button type="button" className="packer-btn packer-btn-outline packer-modal-hold-all" onClick={() => void handleBulkHoldForProduct(productModal)}>
                  Ombor yetmaydi — ortiqcha zakazlarni Hold
                </button>
              </div>
            ) : null}
            <ul className="packer-product-modal-orders">
              {productModalOrdersDisplay.map((o) => {
                const multiLine = orderDistinctLineCount(o) >= 2;
                const currentPid = productModal.product_id;
                const currentGathered = gatheredLines.has(gatheredLineKey(o.id, currentPid));
                const canPrint = canPrintOrderChek(o, gatheredLines);
                const allInStock = orderAllItemsInStock(o);
                return (
                <li key={o.id} className="packer-product-modal-order">
                  <div className="packer-product-modal-order-head">
                    <span>Zakaz #{o.id}</span>
                    <strong>{formatCurrency(o.total_amount)}</strong>
                  </div>
                  <span className="packer-product-modal-qty">Shu mahsulotdan: {o.item_quantity}</span>
                  {multiLine ? (
                    <ul className="packer-modal-order-lines">
                      {(o.items || []).map((item) => {
                        const oos = !isOrderItemInStock(item);
                        const gathered = gatheredLines.has(gatheredLineKey(o.id, item.product_id));
                        const isCurrent = item.product_id === currentPid;
                        return (
                          <li
                            key={item.id ?? `${o.id}-${item.product_id}`}
                            className={`packer-modal-order-line${oos ? ' packer-modal-order-line--oos' : ''}${gathered ? ' packer-modal-order-line--gathered' : ''}${isCurrent ? ' packer-modal-order-line--current' : ''}`}
                          >
                            <span className="packer-modal-order-line-name">{item.name_uz}</span>
                            <span className="packer-modal-order-line-qty">{item.quantity} ta</span>
                            {oos ? <span className="packer-modal-order-line-oos">Omborda yo‘q</span> : null}
                            {gathered ? <span className="packer-modal-order-line-done">Terilgan</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {o.packerCanFulfill === false ? (
                    <span className="packer-product-modal-warn">Omborda yetarli emas — chek chiqmaydi</span>
                  ) : !allInStock ? (
                    <span className="packer-product-modal-warn">Zakazda omborda yo‘q mahsulot bor (qizil qator)</span>
                  ) : multiLine && !isOrderFullyGathered(o, gatheredLines) ? (
                    <span className="packer-product-modal-hint">Barcha mahsulotlarni terib oling — keyin chek chiqadi</span>
                  ) : null}
                  <span className="packer-product-modal-when">{formatDateTime(o.created_at)}</span>
                  {o.contact_phone ? <span className="packer-product-modal-phone">{o.contact_phone}</span> : null}
                  <div className="packer-product-modal-actions">
                    {multiLine && !currentGathered && o.packerCanFulfill !== false && allInStock ? (
                      <button
                        type="button"
                        className="packer-btn packer-btn-secondary"
                        onClick={() => markLineGathered(o.id, currentPid)}
                      >
                        Terganman
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="packer-btn packer-btn-outline"
                      disabled={!canPrint}
                      title={
                        !allInStock
                          ? 'Omborda yetarli mahsulot yo‘q'
                          : multiLine && !isOrderFullyGathered(o, gatheredLines)
                            ? 'Avval barcha mahsulotlarni terib oling'
                            : o.packerCanFulfill === false
                              ? 'Omborda yetarli mahsulot yo‘q'
                              : undefined
                      }
                      onClick={() => handlePrintOrderChek(o, productModal)}
                    >
                      Chekni chop etish
                    </button>
                    <button
                      type="button"
                      className="packer-btn packer-btn-primary"
                      onClick={() => handlePackaged(o.id)}
                      disabled={busyId === o.id || o.packerCanFulfill === false || !allInStock}
                      title={
                        o.packerCanFulfill === false || !allInStock
                          ? 'Avval omborni to‘ldiring yoki Hold'
                          : undefined
                      }
                    >
                      {busyId === o.id ? '...' : 'Qadoqlandi'}
                    </button>
                  </div>
                </li>
              );
              })}
            </ul>
            <button type="button" className="packer-btn packer-btn-secondary packer-product-modal-close" onClick={() => setProductModal(null)}>
              Yopish
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
