import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { PACKER_UZ_VILOYATLAR } from '../../constants/uzViloyatlarPacker';
import { useAuth } from '../../context/AuthContext';
import {
  formatDateTimeUzCompact,
  formatDateTimeUzPipe,
  getDateTimePartsInUzbekistan,
  getLiveClockInUzbekistan,
  todayIsoDateInUzbekistan,
} from '../../utils/uzbekistanTime.js';
import { useTheme } from '../../context/ThemeContext';
import StaffTopbarCenterId from '../../components/staff/StaffTopbarCenterId.jsx';
import StaffChipDropdown from '../../components/staff/StaffChipDropdown';
import StaffRailTopbarActions from '../../components/staff/StaffRailTopbarActions';
import PackerViloyatDropdown from '../../components/packer/PackerViloyatDropdown.jsx';
import { parseOrderIdFromScan } from '../../utils/parseOrderIdFromScan.js';
import '../packer/PackerDashboard.css';
import '../picker/PickerDashboard.css';
import './ExpeditorDashboard.css';
import './ExpeditorMobileScanSession.css';
import ExpeditorMobileScanSession from './ExpeditorMobileScanSession.jsx';

const EXPEDITOR_VILOYAT_FILTER_KEY = 'expeditor_viloyat_filter_v1';
const EXPEDITOR_COURIER_FILTER_KEY = 'expeditor_courier_filter_v1';
const EXPEDITOR_LIST_CLOSED_KEY = 'expeditor_handoff_list_closed_v1';
/** Ro‘yxat «Listni yopish» bosilgandagi vaqt (ISO); drawer sanasi mos kelganda vaqtni avto to‘ldirish uchun. */
const EXPEDITOR_HANDOFF_LIST_CLOSED_AT_KEY = 'expeditor_handoff_list_closed_at_v1';
const EXPEDITOR_DRAWER_VILOYAT_KEY = 'expeditor_drawer_viloyat_v1';
const EXPEDITOR_DRAWER_DATE_KEY = 'expeditor_drawer_date_v1';

function readExpeditorViloyatFilter() {
  try {
    return localStorage.getItem(EXPEDITOR_VILOYAT_FILTER_KEY) || '';
  } catch {
    return '';
  }
}

function writeExpeditorViloyatFilter(value) {
  try {
    if (value === '' || value == null) localStorage.removeItem(EXPEDITOR_VILOYAT_FILTER_KEY);
    else localStorage.setItem(EXPEDITOR_VILOYAT_FILTER_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function readExpeditorCourierFilter() {
  try {
    return localStorage.getItem(EXPEDITOR_COURIER_FILTER_KEY) || '';
  } catch {
    return '';
  }
}

function writeExpeditorCourierFilter(value) {
  try {
    if (value === '' || value == null) localStorage.removeItem(EXPEDITOR_COURIER_FILTER_KEY);
    else localStorage.setItem(EXPEDITOR_COURIER_FILTER_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function readLocalStorageValue(key, fallback = '') {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeLocalStorageValue(key, value) {
  try {
    if (value === '' || value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

const EXPEDITOR_VILOYAT_NAME_OVERRIDES = {};

function getExpeditorViloyatDisplayName(viloyatId) {
  if (viloyatId === 'all') return 'Barcha viloyatlar';
  if (!viloyatId) return 'Viloyat';
  const entry = PACKER_UZ_VILOYATLAR.find((v) => v.id === viloyatId);
  return EXPEDITOR_VILOYAT_NAME_OVERRIDES[viloyatId] || entry?.name || String(viloyatId);
}

function navLinkClassRail({ isActive }) {
  return `packer-nav-link packer-nav-link--rail${isActive ? ' packer-nav-link--active' : ''}`;
}

/** Takroriy skaner: uzoq, baland ogohlantirish signal (sirena naqshi, sintez nutq emas). */
function playExpeditorScanAlertBeeps() {
  if (typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = () => ctx.currentTime;

    const PULSE_MS = 320;
    const GAP_MS = 100;
    const PULSES = 10;
    const HI_HZ = 1080;
    const LO_HZ = 740;
    /** Chiqish darajasi. Kvadrat to‘lqin juda keskin bo‘lgani uchun uchburchak + yuqori peak. */
    const PEAK = 0.58;

    const scheduleTone = (offsetSec, freqHz, durationMs, peakGain) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freqHz;
      const t0 = now() + offsetSec;
      const dur = Math.max(0.04, durationMs / 1000);
      const atk = Math.min(0.02, dur * 0.12);
      const rel = Math.min(0.05, dur * 0.18);
      const p = Math.min(0.85, Math.max(0.08, peakGain));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(p, t0 + atk);
      g.gain.setValueAtTime(p, t0 + dur - rel);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.025);
    };

    void (async () => {
      try {
        if (ctx.state === 'suspended') await ctx.resume();
      } catch {
        /* */
      }
      const step = PULSE_MS / 1000 + GAP_MS / 1000;
      let t = 0;
      for (let i = 0; i < PULSES; i += 1) {
        const hz = i % 2 === 0 ? HI_HZ : LO_HZ;
        scheduleTone(t, hz, PULSE_MS, PEAK);
        t += step;
      }
      const closeMs = Math.ceil(t * 1000 + PULSE_MS + 400);
      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, closeMs);
    })();
  } catch {
    /* brauzer ovozni bloklagan */
  }
}

function ExpeditorScanDuplicateModal({ title, detail, onClose }) {
  useEffect(() => {
    playExpeditorScanAlertBeeps();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [detail]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Skaner / klaviatura / joylashtirish modal yopilguncha — dialog tashqarisida to‘xtatiladi (Escape ruxsat). */
  useEffect(() => {
    const dialogEl = () => document.querySelector('.expeditor-scan-alert-dialog');
    const blockKey = (e) => {
      if (e.key === 'Escape') return;
      const dialog = dialogEl();
      if (dialog && dialog.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const blockPaste = (e) => {
      const dialog = dialogEl();
      if (dialog && dialog.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', blockKey, true);
    document.addEventListener('paste', blockPaste, true);
    return () => {
      window.removeEventListener('keydown', blockKey, true);
      document.removeEventListener('paste', blockPaste, true);
    };
  }, []);

  return (
    <div className="expeditor-scan-alert-overlay" role="presentation" onClick={onClose}>
      <div
        className="expeditor-scan-alert-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="expeditor-scan-alert-title"
        aria-describedby="expeditor-scan-alert-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="expeditor-scan-alert-icon" aria-hidden>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 id="expeditor-scan-alert-title" className="expeditor-scan-alert-title">
          {title || "Skanerda xato aniqlandi"}
        </h2>
        <p id="expeditor-scan-alert-desc" className="expeditor-scan-alert-detail">
          {detail}
        </p>
        <p className="expeditor-scan-alert-scan-paused">Skaner vaqtincha to‘xtatilgan. Davom etish uchun «Tushundim» ni bosing.</p>
        <button type="button" className="expeditor-scan-alert-ok" onClick={onClose} autoFocus>
          Tushundim
        </button>
      </div>
    </div>
  );
}

/** Sklat navbati tugagach — ro‘yxatni yopish haqida doimiy eslatma (yopilguncha ekranda qoladi). */
function ExpeditorListCloseReminderModal({ scannedCount, onCloseList, error = '' }) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="expeditor-list-close-reminder-overlay" role="presentation">
      <div
        className="expeditor-list-close-reminder-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="expeditor-list-close-reminder-title"
        aria-describedby="expeditor-list-close-reminder-desc"
      >
        <div className="expeditor-list-close-reminder-icon" aria-hidden>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id="expeditor-list-close-reminder-title" className="expeditor-list-close-reminder-title">
          Barcha zakazlar biriktirildi
        </h2>
        <p id="expeditor-list-close-reminder-desc" className="expeditor-list-close-reminder-detail">
          {scannedCount > 0
            ? `${scannedCount} ta chek skaner qilindi va kuryerga berildi.`
            : 'Viloyat bo‘yicha sklat navbatidagi zakazlar kuryerga biriktirildi.'}{' '}
          Endi kuryer ro‘yxatini yoping — keyingi safar yangi navbat bilan davom etasiz.
        </p>
        {error ? <p className="expeditor-list-close-reminder-error">{error}</p> : null}
        <button type="button" className="expeditor-list-close-reminder-btn" onClick={onCloseList} autoFocus>
          Listni yopish
        </button>
      </div>
    </div>
  );
}

function formatExpeditorDateTime(value) {
  return formatDateTimeUzPipe(value, { empty: '—' });
}

function formatExpeditorMoney(n, currency = 'UZS') {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(n) || 0)} ${currency || 'UZS'}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function openUnsoldProductsReceipt({ orders, courierLabel, regionLabel, autoPrint = true, isTest = false }) {
  const rows = Array.isArray(orders) ? orders : [];
  if (rows.length === 0) {
    window.alert("Chek chiqarish uchun kuryerda qolgan mahsulot topilmadi.");
    return;
  }
  const byProduct = new Map();
  for (const order of rows) {
    const items = Array.isArray(order?.items) ? order.items : [];
    for (const it of items) {
      const productId = Number(it?.product_id) || 0;
      const key = productId > 0 ? `id:${productId}` : `name:${String(it?.name_uz || 'Nomaʼlum')}`;
      const prev = byProduct.get(key) || {
        product_id: productId || null,
        name_uz: String(it?.name_uz || 'Nomaʼlum'),
        quantity: 0,
      };
      prev.quantity += Number(it?.quantity) || 0;
      byProduct.set(key, prev);
    }
  }
  const lines = Array.from(byProduct.values()).sort((a, b) => String(a.name_uz).localeCompare(String(b.name_uz), 'uz'));
  if (lines.length === 0) {
    window.alert("Chek chiqarish uchun mahsulot qatori topilmadi.");
    return;
  }
  const now = formatExpeditorDateTime(new Date().toISOString());
  const ordersCount = rows.length;
  const totalQty = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const receiptNo = String(ordersCount).padStart(2, '0');
  const barcodeText = `${rows.map((o) => Number(o.id) || 0).filter((n) => n > 0).slice(0, 4).join('') || '3611575'}`;
  const firstOrder = rows[0] || {};
  const customerPhone = String(firstOrder.contact_phone || '+998999015782');
  const customerAddress = String(firstOrder.shipping_address || 'Toshkent shaxar, Uchtepa, Srin ko‘cha');
  const customerName = 'Mijoz';
  const operatorLabel = courierLabel || 'Operator';
  const html = `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="utf-8" />
    <title>Kuryer qoldig'i cheki</title>
    <style>
      body { margin: 0; background: #fff; color: #111; font-family: "Courier New", ui-monospace, monospace; }
      .sheet { width: 306px; margin: 10px auto; border: 1px solid #d1d5db; padding: 8px 9px 10px; box-sizing: border-box; }
      .barcode { height: 44px; background: repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 3px, #000 3px 5px, #fff 5px 7px); border: 1px solid #111; }
      .barcode-id { margin-top: 2px; font-size: 10px; letter-spacing: 1.1px; }
      .topline { margin-top: 2px; display: flex; justify-content: space-between; align-items: flex-end; }
      .big-no { font-size: 46px; font-weight: 700; line-height: 0.9; }
      .dt { font-size: 11px; font-weight: 700; }
      .muted { color: #444; font-size: 10px; }
      .row { margin-top: 5px; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
      .row strong { font-size: 13px; }
      .line { margin: 8px 0; border-top: 1px dashed #444; }
      .addr { font-size: 14px; font-weight: 700; line-height: 1.25; }
      .money-wrap { margin-top: 8px; text-align: center; }
      .money-title { font-size: 34px; font-weight: 700; line-height: 1; }
      .money-main { font-size: 32px; font-weight: 700; line-height: 1.05; margin-top: 2px; }
      .items { margin-top: 7px; font-size: 12px; }
      .item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; border-top: 1px dotted #777; padding-top: 4px; margin-top: 4px; }
      .item:first-child { border-top: none; margin-top: 0; padding-top: 0; }
      .sumright { text-align: right; white-space: nowrap; }
      .qty { text-align: right; min-width: 2.2ch; }
      .stamp { margin-top: 7px; font-size: 10px; color: #555; text-align: center; }
      .test-badge { display: inline-block; margin-top: 4px; font-size: 10px; border: 1px solid #000; padding: 1px 5px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="barcode"></div>
      <div class="topline">
        <span class="barcode-id">${escapeHtml(barcodeText)}</span>
        <span class="big-no">${escapeHtml(receiptNo)}</span>
      </div>
      <div class="row">
        <span class="muted">Chek vaqti</span>
        <strong class="dt">${escapeHtml(now)}</strong>
      </div>
      <div class="line"></div>
      <div class="row"><strong>${escapeHtml(customerPhone)}</strong><span class="muted">${escapeHtml(customerName)}</span></div>
      <div class="addr">${escapeHtml(customerAddress)}</div>
      <div class="line"></div>
      <div class="row"><span class="muted">Operator:</span><strong>${escapeHtml(operatorLabel)}</strong></div>
      <div class="row"><span class="muted">Izoh:</span><strong>${escapeHtml(regionLabel || 'oladi')}</strong></div>
      <div class="line"></div>
      <div class="money-wrap">
        <div class="money-title">Jami: <span class="money-main">${new Intl.NumberFormat('uz-UZ').format(totalQty)}</span></div>
        <div class="muted">Buyurtmalar: ${ordersCount} ta</div>
      </div>
      <div class="items">
        ${lines
          .map(
            (line) => `
          <div class="item">
            <span>${escapeHtml(line.name_uz)}</span>
            <span class="sumright">${new Intl.NumberFormat('uz-UZ').format(Number(line.quantity) || 0)}</span>
            <span class="qty">ta</span>
          </div>`,
          )
          .join('')}
      </div>
      <div class="stamp">MyShop · ekspeditor cheki</div>
      ${isTest ? '<div class="test-badge">TEST CHEK (PREVIEW)</div>' : ''}
    </div>
    ${autoPrint ? '<script>window.onload = () => { window.print(); };</script>' : ''}
  </body>
</html>`;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }

  // Fallback: popup bloklangan holatda ham chek faylini yangi tab/fayl sifatida beramiz.
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = `myshop-chek-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    window.alert("Popup bloklangan bo‘lishi mumkin. Chek HTML fayli ochildi/yuklandi.");
  } catch {
    window.alert("Chek oynasini ochib bo‘lmadi. Brauzer popup ruxsatini yoqing.");
  }
}

/** Drawer: ID, telefon, mahsulot nomi, manzil (viloyat/hudud) bo‘yicha tezkor qidiruv. */
function orderMatchesHandoffDrawerSearch(order, queryRaw) {
  const query = String(queryRaw || '').trim();
  if (!query) return true;
  const qLower = query.toLowerCase();
  const qDigits = query.replace(/\D/g, '');
  if (String(order.id).includes(query)) return true;
  const phone = String(order.contact_phone || '');
  const phoneDigits = phone.replace(/\D/g, '');
  if (qDigits.length >= 2 && phoneDigits.includes(qDigits)) return true;
  if (phone.toLowerCase().includes(qLower)) return true;
  if (String(order.shipping_address || '').toLowerCase().includes(qLower)) return true;
  const items = Array.isArray(order.items) ? order.items : [];
  for (const it of items) {
    if (String(it.name_uz || '').toLowerCase().includes(qLower)) return true;
    if (String(it.name_ru || '').toLowerCase().includes(qLower)) return true;
  }
  return false;
}

const EXPEDITOR_ACTIVE_HANDOFF = ['assigned', 'picked_up', 'on_the_way'];

const HANDOFF_STATUS_LABELS = {
  assigned: 'Tayinlangan',
  picked_up: 'Olib ketildi',
  on_the_way: "Yo'lda",
  delivered: 'Sotildi',
  cancelled: 'Bekor',
};

function ExpeditorOrderChek({
  order,
  variant,
  courierStaffId,
  request,
  onHandoffReverted,
  allowRevert = true,
  /** handoff: o‘rta vaqt, o‘ngda pill (masalan qabulchi: «Bekor qilingan» / «Qabul qilindi») */
  handoffPillLabel = null,
  /** pending: pill matni (qabulchi: «Bekor qilingan») */
  pendingPillLabel = null,
  /** mahsulot qatorlari bo‘sh bo‘lsa blokni butunlay yashirish */
  hideEmptyProductSection = false,
}) {
  const currency = order.currency || 'UZS';
  const items = Array.isArray(order.items) ? order.items : [];
  const phoneStr = order.contact_phone ? String(order.contact_phone).trim() : null;
  const addressStr = order.shipping_address ? String(order.shipping_address).trim() : '';

  let addrStr = addressStr;
  let commentStr = null;

  const sharhIndex = addressStr.toLowerCase().indexOf('. sharh:');
  if (sharhIndex !== -1) {
    addrStr = addressStr.substring(0, sharhIndex).trim();
    commentStr = addressStr.substring(sharhIndex + 8).trim();
  } else {
    const sharhIndex2 = addressStr.toLowerCase().indexOf('sharh:');
    if (sharhIndex2 !== -1) {
      addrStr = addressStr.substring(0, sharhIndex2).trim();
      commentStr = addressStr.substring(sharhIndex2 + 6).trim();
    }
  }

  const productSum = items.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.price_at_order) || 0), 0) || Number(order.total_amount) || 0;
  const courierFee = Number(order.courier_fee ?? 25000);
  const finalTotal = productSum + courierFee;

  const [reverting, setReverting] = useState(false);
  const isClosed = Boolean(order.expeditor_batch_id && order.expeditor_batch_id !== 0);
  const canRevertHandoff =
    variant === 'handoff' &&
    allowRevert &&
    courierStaffId &&
    request &&
    EXPEDITOR_ACTIVE_HANDOFF.includes(String(order.status || ''));

  const onRevertHandoff = async () => {
    if (!request || !courierStaffId) return;
    if (!window.confirm('Zakaz qadoqlangan navbatga qaytarilsinmi? (Kuryer biriktirish bekor qilinadi.)')) return;
    setReverting(true);
    try {
      const res = await request(`/expeditor/orders/${order.id}/unassign-courier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier_staff_id: Number(courierStaffId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Qaytarib bo‘lmadi');
      onHandoffReverted?.();
    } catch (e) {
      window.alert(e.message || 'Xatolik');
    } finally {
      setReverting(false);
    }
  };

  return (
    <article
      className={`expeditor-chek${variant === 'handoff' ? ' expeditor-chek--handoff' : ''}${isClosed ? ' expeditor-chek--closed-batch' : ''}`}
      aria-label={`Zakaz ${order.id}`}
    >
      <header className="expeditor-chek__head">
        <span className="expeditor-chek__id">ID: {order.id}</span>
        {variant === 'pending' ? (
          <span className="expeditor-chek__head-mid expeditor-chek__datetime">{formatExpeditorDateTime(order.created_at)}</span>
        ) : handoffPillLabel ? (
          <span className="expeditor-chek__head-mid expeditor-chek__datetime">
            {formatExpeditorDateTime(order.status_updated_at || order.created_at)}
          </span>
        ) : (
          <span className="expeditor-chek__head-mid expeditor-chek__datetime">
            {isClosed ? 'Kuryerga yuborilgan' : (HANDOFF_STATUS_LABELS[order.status] || order.status)}
          </span>
        )}
        {variant === 'pending' ? (
          <span className="expeditor-chek__pill">{pendingPillLabel || 'Qadoqlangan'}</span>
        ) : isClosed ? (
          <span className="expeditor-chek__pill expeditor-chek__pill--closed-batch">Yopilgan list</span>
        ) : handoffPillLabel ? (
          <span className="expeditor-chek__pill">{handoffPillLabel}</span>
        ) : (
          <span className="expeditor-chek__status expeditor-chek__datetime expeditor-chek__head-trailing">
            {formatExpeditorDateTime(order.status_updated_at || order.created_at)}
          </span>
        )}
      </header>
      {!(hideEmptyProductSection && items.length === 0) ? (
        <>
          <div className="expeditor-chek__rule" aria-hidden />
          <div className="expeditor-chek__grid-head" aria-hidden>
            <span>Mahsulot</span>
            <span>Soni</span>
            <span>Summa</span>
          </div>
          {items.length === 0 ? (
            <p className="expeditor-chek__none">Mahsulot qatori yo‘q</p>
          ) : (
            <ul className="expeditor-chek__lines">
              {items.map((it) => {
                const q = Number(it.quantity) || 0;
                const pu = Number(it.price_at_order) || 0;
                const line = q * pu;
                return (
                  <li key={it.id} className="expeditor-chek__line">
                    <span className="expeditor-chek__name">{it.name_uz || '—'}</span>
                    <span className="expeditor-chek__qty">{q}</span>
                    <span className="expeditor-chek__line-sum">{formatExpeditorMoney(line, currency)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
      <div className="expeditor-chek__courier-fee">
        <span>Kuryer haqi</span>
        <strong>{formatExpeditorMoney(courierFee, currency)}</strong>
      </div>
      <div className="expeditor-chek__total">
        <span>Jami</span>
        <strong>{formatExpeditorMoney(finalTotal, currency)}</strong>
      </div>
      <div className="expeditor-chek__rule expeditor-chek__rule--dashed" aria-hidden />
      <div className="expeditor-chek__foot">
        <div className="expeditor-chek__foot-row">
          <div className="expeditor-chek__customer-box">
            {phoneStr ? (
              <>
                <div className="expeditor-chek__customer-row">
                  <span className="expeditor-chek__customer-label">Tel raqam:</span>
                  <span className="expeditor-chek__customer-value">{phoneStr}</span>
                </div>
                <div className="expeditor-chek__customer-divider" aria-hidden />
              </>
            ) : null}
            <div className="expeditor-chek__customer-row">
              <span className="expeditor-chek__customer-label">Mijoz manzili:</span>
              <span className="expeditor-chek__customer-value">{addrStr || '—'}</span>
            </div>
            {commentStr ? (
              <>
                <div className="expeditor-chek__customer-divider" aria-hidden />
                <div className="expeditor-chek__customer-row">
                  <span className="expeditor-chek__customer-label">Izoh:</span>
                  <span className="expeditor-chek__customer-value">{commentStr}</span>
                </div>
              </>
            ) : null}
          </div>
          {canRevertHandoff ? (
            <button
              type="button"
              className="expeditor-chek__revert"
              onClick={() => void onRevertHandoff()}
              disabled={reverting}
              aria-label="Qadoqlangan navbatga qaytarish"
              title="Adashgan bo‘lsangiz — zakazni chap tomondagi navbatga qaytarish"
            >
              <svg className="expeditor-chek__revert-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path
                  d="M19 12H5m4-4-4 4 4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function formatHandoffBatchStamp(closedAt, count) {
  const parts = getDateTimePartsInUzbekistan(closedAt);
  const qty = Number(count) || 0;
  if (!parts?.date || !parts?.time) return `--.--.---- · --:-- · ${qty} ta`;
  const [year, month, day] = String(parts.date).split('-');
  return `${day}.${month}.${year} · ${parts.time} · ${qty} ta`;
}

function ExpeditorCourierHandoffDrawer({
  open,
  onClose,
  courierStaffId,
  regionFilterId,
  courierLabel,
  request,
  onHandoffMutated,
  listsRefreshNonce = 0,
}) {
  const [closedBatches, setClosedBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [errBatches, setErrBatches] = useState('');
  const [selectedViloyatId, setSelectedViloyatId] = useState(() => readLocalStorageValue(EXPEDITOR_DRAWER_VILOYAT_KEY, 'all'));
  const [selectedDate, setSelectedDate] = useState(() => readLocalStorageValue(EXPEDITOR_DRAWER_DATE_KEY, ''));
  const [searchDate, setSearchDate] = useState('');
  const [searchRequested, setSearchRequested] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [selectedBatchOrders, setSelectedBatchOrders] = useState([]);
  const [loadingBatchDetail, setLoadingBatchDetail] = useState(false);
  const [drawerOrderSearch, setDrawerOrderSearch] = useState('');

  const loadClosedBatches = useCallback(async (date) => {
    const queryDate = date || searchDate;
    if (!open) {
      setClosedBatches([]);
      return;
    }
    if (!selectedViloyatId || !queryDate) {
      setClosedBatches([]);
      return;
    }
    setLoadingBatches(true);
    setErrBatches('');
    try {
      const params = new URLSearchParams();
      if (courierStaffId) params.set('courier_staff_id', String(courierStaffId));
      if (selectedViloyatId !== 'all') params.set('viloyat_id', selectedViloyatId);
      if (queryDate) params.set('date', queryDate);
      const res = await request(`/expeditor/handoff-lists?${params}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Yuklanmadi');
      setClosedBatches(Array.isArray(data.batches) ? data.batches : []);
    } catch (e) {
      setErrBatches(e.message || 'Xatolik');
      setClosedBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  }, [open, courierStaffId, selectedViloyatId, searchDate, request]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!selectedViloyatId) {
      setSelectedViloyatId(regionFilterId || 'all');
    }
  }, [open, regionFilterId, selectedViloyatId]);

  useEffect(() => {
    if (!open) return;
    setSelectedBatchId(null);
    setSelectedBatchOrders([]);
  }, [selectedViloyatId, searchDate, open]);

  // Selected region filter does not reset the searched date list to allow wide searches

  useEffect(() => {
    if (!open) return;
    setSearchRequested(false);
  }, [selectedDate, open]);

  useEffect(() => {
    writeLocalStorageValue(EXPEDITOR_DRAWER_VILOYAT_KEY, selectedViloyatId || 'all');
  }, [selectedViloyatId]);

  useEffect(() => {
    writeLocalStorageValue(EXPEDITOR_DRAWER_DATE_KEY, selectedDate);
  }, [selectedDate]);

  const selectedViloyatName = getExpeditorViloyatDisplayName(selectedViloyatId);

  const batchesForDate = useMemo(() => {
    if (!searchDate) return [];
    return closedBatches.filter((b) => {
      const parts = getDateTimePartsInUzbekistan(b.closed_at);
      return parts?.date === searchDate;
    });
  }, [closedBatches, searchDate]);

  const selectedBatch = useMemo(
    () => batchesForDate.find((b) => Number(b.id) === Number(selectedBatchId)) || null,
    [batchesForDate, selectedBatchId],
  );

  const openBatchDetail = useCallback(
    async (batchId) => {
      setSelectedBatchId(batchId);
      setDrawerOrderSearch('');
      setLoadingBatchDetail(true);
      setSelectedBatchOrders([]);
      try {
        const res = await request(`/expeditor/handoff-lists/${batchId}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Yuklanmadi');
        setSelectedBatchOrders(Array.isArray(data.batch?.orders) ? data.batch.orders : []);
      } catch {
        setSelectedBatchOrders([]);
      } finally {
        setLoadingBatchDetail(false);
      }
    },
    [request],
  );

  const handoffTotalAmount = useMemo(
    () =>
      (selectedBatchId ? selectedBatchOrders : batchesForDate.flatMap((b) => b.orders || [])).reduce(
        (sum, o) => sum + (Number(o?.total_amount) || 0),
        0,
      ),
    [selectedBatchId, selectedBatchOrders, batchesForDate],
  );


  useEffect(() => {
    if (!selectedBatchId) setDrawerOrderSearch('');
  }, [selectedBatchId]);

  const handleSearchLists = useCallback(async () => {
    if (!selectedDate || !selectedViloyatId) return;
    setSearchDate(selectedDate);
    setSearchRequested(true);
    setSelectedBatchId(null);
    setSelectedBatchOrders([]);
    await loadClosedBatches(selectedDate);
  }, [loadClosedBatches, selectedDate, selectedViloyatId]);

  const handoffDrawerDisplayOrders = useMemo(
    () => selectedBatchOrders.filter((o) => orderMatchesHandoffDrawerSearch(o, drawerOrderSearch)),
    [selectedBatchOrders, drawerOrderSearch],
  );

  if (!open) return null;

  return (
    <div
      className="expeditor-handoff-drawer-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expeditor-handoff-drawer-title"
    >
      <button type="button" className="expeditor-handoff-drawer-backdrop" aria-label="Yopish" onClick={onClose} />
      <div className="expeditor-handoff-drawer-panel">
        <header className="expeditor-handoff-drawer-head">
          <div className="expeditor-handoff-drawer-head-top">
            <h2 id="expeditor-handoff-drawer-title" className="expeditor-handoff-drawer-title">
              {courierStaffId ? 'Kuryerga zakazlar' : 'Yopilgan listlar arxivi'}
            </h2>
            <div className="expeditor-handoff-total-chip" title="Tanlangan kunlik listlar umumiy summasi">
              <span className="expeditor-handoff-total-chip-k">Umumiy balans</span>
              <strong className="expeditor-handoff-total-chip-v">{formatExpeditorMoney(handoffTotalAmount, 'UZS')}</strong>
            </div>
          </div>
          <p className="expeditor-handoff-drawer-sub">
            Yopilgan kunlik listlar — viloyat va sana bo‘yicha.
            {courierStaffId ? (
              <>
                {' '}
                Kuryer: <strong>{courierLabel || `#${courierStaffId}`}</strong>.
              </>
            ) : (
              <> Barcha kuryerlarning yopilgan ro'yxatlari.</>
            )}
          </p>
          <button type="button" className="expeditor-handoff-drawer-close" onClick={onClose} aria-label="Yopish">
            ×
          </button>
        </header>
        {!selectedBatchId ? (
          <div className="expeditor-handoff-filterbar">
            <StaffChipDropdown
              value={selectedViloyatId}
              onChange={(value) => setSelectedViloyatId(value)}
              options={PACKER_UZ_VILOYATLAR.map((v) => ({
                value: v.id,
                label: EXPEDITOR_VILOYAT_NAME_OVERRIDES[v.id] || v.name,
              }))}
              emptyValue="all"
              emptyLabel="Barcha viloyatlar"
              title="Viloyat bo‘yicha filter"
              instanceId="expeditor-drawer-viloyat"
            />
            <input
              type="date"
              value={selectedDate}
              onChange={(ev) => setSelectedDate(ev.target.value)}
              aria-label="Sana tanlash"
            />
            <button
              type="button"
              className="expeditor-handoff-find-btn"
              onClick={handleSearchLists}
              disabled={!selectedDate}
            >
              Ro‘yxatni top
            </button>
          </div>
        ) : (
          <div className="expeditor-handoff-filterbar expeditor-handoff-filterbar--searchonly">
            <div className="expeditor-handoff-search-row">
              <label htmlFor="expeditor-handoff-drawer-search" className="expeditor-handoff-search-heading">
                Qidiruv
              </label>
              <input
                id="expeditor-handoff-drawer-search"
                type="search"
                className="expeditor-handoff-search-input"
                value={drawerOrderSearch}
                onChange={(ev) => setDrawerOrderSearch(ev.target.value)}
                placeholder="Zakaz ID, telefon, mahsulot nomi, manzil…"
                autoComplete="off"
                enterKeyHint="search"
              />
              <button
                type="button"
                className="expeditor-handoff-search-back"
                onClick={() => {
                  setSelectedBatchId(null);
                  setSelectedBatchOrders([]);
                  setDrawerOrderSearch('');
                }}
              >
                <svg className="expeditor-handoff-search-back-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Listlarga qaytish</span>
              </button>
            </div>
          </div>
        )}
        <div className="expeditor-handoff-drawer-body">
          {!selectedDate ? (
            <p className="expeditor-queue-hint">Sana tanlang va Ro‘yxatni top tugmasini bosing.</p>
          ) : !searchRequested ? (
            <p className="expeditor-queue-hint">Ro‘yxatni top tugmasini bosing.</p>
          ) : loadingBatches ? (
            <p className="expeditor-queue-hint">Yuklanmoqda…</p>
          ) : errBatches ? (
            <p className="expeditor-queue-err">{errBatches}</p>
          ) : !selectedBatchId ? (
            batchesForDate.length === 0 ? (
              <p className="expeditor-queue-hint">Bu sana bo‘yicha yopilgan list yo‘q. «Listni yopish» bosilganda list shu yerga qo‘shiladi.</p>
            ) : (
              <>
                <p className="expeditor-handoff-result-summary">
                  <strong>{selectedViloyatName}</strong> · {selectedDate} — <strong>{batchesForDate.length} ta</strong> list
                </p>
                {batchesForDate.map((batch) => {
                  const count = Number(batch.orders_count) || 0;
                  const stamp = formatHandoffBatchStamp(batch.closed_at, count);
                  return (
                    <button
                      key={batch.id}
                      type="button"
                      className="expeditor-handoff-result-item"
                      onClick={() => void openBatchDetail(batch.id)}
                      aria-expanded={false}
                    >
                      <span className="expeditor-handoff-result-item-title">
                        {stamp}{batch.courier_name ? ` · ${batch.courier_name}` : ''}
                      </span>
                      <span className="expeditor-handoff-result-item-meta">
                        {count} ta zakaz · Ochish
                      </span>
                    </button>
                  );
                })}
              </>
            )
          ) : loadingBatchDetail ? (
            <p className="expeditor-queue-hint">Yuklanmoqda…</p>
          ) : selectedBatchOrders.length === 0 ? (
            <p className="expeditor-queue-hint">Bu listda zakaz topilmadi.</p>
          ) : handoffDrawerDisplayOrders.length === 0 ? (
            <p className="expeditor-queue-hint">Qidiruv bo‘yicha mos zakaz yo‘q.</p>
          ) : (
            <>
              <p className="expeditor-handoff-result-summary">
                {selectedBatch ? (
                  <>
                    {formatHandoffBatchStamp(selectedBatch.closed_at, selectedBatchOrders.length)}
                    {selectedBatch.courier_name ? ` · ${selectedBatch.courier_name}` : ''}
                  </>
                ) : 'List'}
                {drawerOrderSearch.trim() ? (
                  <>
                    {' '}
                    · qidiruv: <strong>{handoffDrawerDisplayOrders.length} ta</strong>
                  </>
                ) : null}
              </p>
              <ul className="expeditor-chek-list">
                {handoffDrawerDisplayOrders.map((o) => (
                  <li key={o.id} className="expeditor-chek-list__item">
                    <ExpeditorOrderChek
                      order={o}
                      variant="handoff"
                      courierStaffId={courierStaffId || o.courier_id}
                      request={request}
                      allowRevert={batchesForDate.find((b) => b.id === selectedBatchId)?.status !== 'received'}
                      onHandoffReverted={() => {
                        onHandoffMutated?.();
                        void openBatchDetail(selectedBatchId);
                        void loadClosedBatches();
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpeditorHomePaneTabs({ activePane, onActivePaneChange, pendingCount, handoffCount }) {
  return (
    <div className="expeditor-pane-tabs" role="tablist" aria-label="Sklad va kuryer">
      <button
        type="button"
        role="tab"
        id="expeditor-tab-sklad"
        aria-selected={activePane === 'sklad'}
        aria-controls="expeditor-pane-a-title"
        className={`expeditor-pane-tab expeditor-pane-tab--sklad${activePane === 'sklad' ? ' is-active' : ''}`}
        onClick={() => onActivePaneChange('sklad')}
      >
        <span className="expeditor-pane-tab__label">Sklad</span>
        <span className="expeditor-pane-tab__n" aria-hidden>
          {pendingCount ?? '…'}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        id="expeditor-tab-kuryer"
        aria-selected={activePane === 'kuryer'}
        aria-controls="expeditor-pane-b-title"
        className={`expeditor-pane-tab expeditor-pane-tab--kuryer${activePane === 'kuryer' ? ' is-active' : ''}`}
        onClick={() => onActivePaneChange('kuryer')}
      >
        <span className="expeditor-pane-tab__label">Kuryer</span>
        <span className="expeditor-pane-tab__n" aria-hidden>
          {handoffCount ?? '—'}
        </span>
      </button>
    </div>
  );
}

function ExpeditorHomeQueues({
  regionFilterId,
  courierStaffId,
  request,
  refreshNonce,
  bumpQueueRefresh,
  mainHandoffListClosed,
  onHandoffCountChange,
  onHandoffIdsChange,
  onPendingCountChange,
  activePane = 'sklad',
  handoffPillLabel = null,
  pendingPillLabel = null,
  hideEmptyProductSection = false,
}) {
  const [pending, setPending] = useState([]);
  const [handoff, setHandoff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const refreshQueues = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const qP = regionFilterId ? `?viloyat_id=${encodeURIComponent(regionFilterId)}` : '';
      const resP = await request(`/expeditor/orders/pending-packaged${qP}`, { cache: 'no-store' });
      const dataP = await resP.json().catch(() => ({}));
      if (!resP.ok) throw new Error(dataP.error || 'Navbat yuklanmadi');
      setPending(Array.isArray(dataP.orders) ? dataP.orders : []);

      if (!courierStaffId) {
        setHandoff([]);
      } else {
        const params = new URLSearchParams({ courier_staff_id: String(courierStaffId) });
        if (regionFilterId) params.set('viloyat_id', regionFilterId);
        const resH = await request(`/expeditor/orders/courier-handoff?${params}`, { cache: 'no-store' });
        const dataH = await resH.json().catch(() => ({}));
        if (!resH.ok) throw new Error(dataH.error || 'Kuryer zakazlari yuklanmadi');
        setHandoff(Array.isArray(dataH.orders) ? dataH.orders : []);
      }
    } catch (e) {
      setErr(e.message || 'Yuklanmadi');
      setPending([]);
      setHandoff([]);
    } finally {
      setLoading(false);
    }
  }, [request, regionFilterId, courierStaffId]);

  useEffect(() => {
    void refreshQueues();
  }, [refreshQueues, refreshNonce]);

  useEffect(() => {
    onHandoffCountChange?.(handoff.length);
    onHandoffIdsChange?.(handoff.map((o) => Number(o.id)).filter((n) => Number.isFinite(n) && n >= 1));
  }, [handoff, onHandoffCountChange, onHandoffIdsChange]);

  useEffect(() => {
    onPendingCountChange?.(pending.length);
  }, [pending.length, onPendingCountChange]);

  const handoffTotalAmount = useMemo(
    () => handoff.reduce((sum, o) => sum + (Number(o?.total_amount) || 0), 0),
    [handoff]
  );

  return (
    <div
      className={`expeditor-home-split expeditor-home-split--${activePane}`}
      role="group"
      aria-label="Asosiy ish maydoni"
    >
      <section className="expeditor-pane expeditor-pane--pending" aria-labelledby="expeditor-pane-a-title">
        <h2 id="expeditor-pane-a-title" className="expeditor-pane__head expeditor-pane__head--pending">
          <span className="expeditor-pane__head-main">Qadoqlovchidan tayyor</span>
          <span
            className="expeditor-pane__head-badge expeditor-pane__head-badge--countdown"
            aria-live="polite"
            title="Kuryerga berilmagan zakazlar. Barcode skaner qilganingizcha son kamayadi."
          >
            <span className="expeditor-pane__badge-k">Qoldi</span>
            <span className="expeditor-pane__badge-n">{loading ? '…' : pending.length}</span>
          </span>
        </h2>
        <div className="expeditor-pane__body">
          {err ? <p className="expeditor-queue-err">{err}</p> : null}
          {loading && !pending.length ? (
            <p className="expeditor-queue-hint">Yuklanmoqda…</p>
          ) : pending.length === 0 ? (
            <p className="expeditor-queue-hint">Bu filtr bo‘yicha skaner kutadigan zakaz yo‘q.</p>
          ) : (
            <ul className="expeditor-chek-list">
              {pending.map((o) => (
                <li key={o.id} className="expeditor-chek-list__item">
                  <ExpeditorOrderChek
                    order={o}
                    variant="pending"
                    hideEmptyProductSection={hideEmptyProductSection}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="expeditor-pane expeditor-pane--handoff" aria-labelledby="expeditor-pane-b-title">
        <h2 id="expeditor-pane-b-title" className="expeditor-pane__head expeditor-pane__head--handoff">
          <span className="expeditor-pane__head-main">
            Kuryerga berilgan
            {courierStaffId ? (
              <span className="expeditor-pane__head-main-sum"> · {formatExpeditorMoney(handoffTotalAmount, 'UZS')}</span>
            ) : null}
          </span>
          <span
            className="expeditor-pane__head-badge expeditor-pane__head-badge--countup"
            aria-live="polite"
            title="Tanlangan kuryerga biriktirilgan zakazlar. Yangi biriktirish bilan son o‘sadi."
          >
            <span className="expeditor-pane__badge-k">Berilgan</span>
            <span className="expeditor-pane__badge-n">{courierStaffId ? (loading ? '…' : handoff.length) : '—'}</span>
          </span>
        </h2>
        {!courierStaffId ? (
          <div className="expeditor-pane__body expeditor-pane__body--empty">
            <span>Kuryer tanlang — faqat shu kuryer uchun yo‘ldagi zakazlar chiqadi.</span>
          </div>
        ) : (
          <div className="expeditor-pane__body">
            {loading && !handoff.length ? (
              <p className="expeditor-queue-hint">Yuklanmoqda…</p>
            ) : handoff.length === 0 ? (
              <p className="expeditor-queue-hint">Hozircha yo‘ldagi zakaz yo‘q.</p>
            ) : (
              <div className="expeditor-handoff-pane-content">
                {mainHandoffListClosed ? (
                  <div className="expeditor-handoff-closed-alert">
                    <div className="expeditor-handoff-closed-alert-title-row">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="expeditor-handoff-closed-alert-icon">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <strong>List yopilgan</strong>
                    </div>
                    <span className="expeditor-handoff-closed-alert-text">
                      Joriy list kuryerga muvaffaqiyatli yuborildi. Quyida yuborilgan list nusxasi ko'rsatilmoqda.
                    </span>
                  </div>
                ) : null}
                <ul className="expeditor-chek-list">
                  {handoff.map((o) => (
                    <li key={o.id} className="expeditor-chek-list__item">
                      <ExpeditorOrderChek
                        order={o}
                        variant="handoff"
                        courierStaffId={courierStaffId}
                        request={request}
                        onHandoffReverted={bumpQueueRefresh}
                        hideEmptyProductSection={hideEmptyProductSection}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Ekspeditor: tepada tanlangan viloyat/kuryer bo‘yicha kuryerda qolgan mahsulotlar. */
function ExpeditorUnsoldSection({
  regionFilterId,
  courierStaffId,
  courierLabel,
  request,
  refreshNonce,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!courierStaffId) {
      setOrders([]);
      setErr('');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({ courier_staff_id: String(courierStaffId) });
      if (regionFilterId) params.set('viloyat_id', regionFilterId);
      const res = await request(`/expeditor/orders/courier-cancelled-unsold?${params}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Yuklanmadi');
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (e) {
      setErr(e.message || 'Yuklanmadi');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [request, courierStaffId, regionFilterId]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const regionLabel =
    getExpeditorViloyatDisplayName(regionFilterId === 'all' ? 'all' : regionFilterId || '') ||
    (regionFilterId ? String(regionFilterId) : 'Barcha viloyatlar');

  if (!courierStaffId) return null;
  if (loading) return null;
  if (orders.length === 0 && !err) return null;
  if (orders.length === 0 && err) {
    return <p className="expeditor-queue-err order-receiver-atkaz__err--bare">{err}</p>;
  }

  return (
    <section className="order-receiver-atkaz" aria-labelledby="expeditor-unsold-title">
      <h2 id="expeditor-unsold-title" className="packer-sr-only">
        Kuryerda qolgan mahsulotlar
      </h2>
      {err ? <p className="expeditor-queue-err order-receiver-atkaz__err">{err}</p> : null}
      <ul className="expeditor-chek-list order-receiver-atkaz__list">
        {orders.map((o) => (
          <li key={o.id} className="expeditor-chek-list__item">
            <ExpeditorOrderChek
              order={o}
              variant="handoff"
              courierStaffId={courierStaffId}
              allowRevert={false}
            />
          </li>
        ))}
      </ul>
      <div className="order-receiver-atkaz__actions">
        <button
          type="button"
          className="order-receiver-atkaz__receive-btn"
          onClick={() => openUnsoldProductsReceipt({ orders, courierLabel, regionLabel, autoPrint: true, isTest: false })}
        >
          Alohida chek chiqarish
        </button>
        <button
          type="button"
          className="order-receiver-atkaz__receive-btn order-receiver-atkaz__preview-btn"
          onClick={() => openUnsoldProductsReceipt({ orders, courierLabel, regionLabel, autoPrint: false, isTest: true })}
        >
          Test chekni ko‘rish
        </button>
      </div>
    </section>
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

function formatMoliyaCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function expeditorWithdrawalStatusUz(st, paidOutAt) {
  if (paidOutAt) return 'Berildi';
  const s = String(st || '').toLowerCase();
  if (s === 'approved') return 'Superuser tasdiqladi · kassa kutilyapti';
  if (s === 'rejected') return 'Rad etildi';
  return 'Superuser tasdiqi kutilmoqda';
}

function ExpeditorMoliyaPanel({ request }) {
  const [balance, setBalance] = useState(null);
  const [noWorkRole, setNoWorkRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setNoWorkRole(false);
    try {
      const [bRes, wRes] = await Promise.all([request('/expeditor/work-role/balance'), request('/expeditor/withdrawals')]);
      const bData = await bRes.json().catch(() => ({}));
      if (bRes.status === 404 && bData.code === 'no_work_role') {
        setNoWorkRole(true);
        setBalance(null);
      } else if (bRes.ok) setBalance(Number(bData.balance) || 0);
      else setBalance(null);
      const wData = wRes.ok ? await wRes.json().catch(() => ({})) : {};
      setList(Array.isArray(wData.withdrawals) ? wData.withdrawals : []);
    } catch (_) {
      setMsg("Ma'lumot yuklanmadi.");
      setMsgErr(true);
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
      setMsgErr(true);
      return;
    }
    setBusy(true);
    setMsg('');
    setMsgErr(false);
    try {
      const res = await request('/expeditor/withdrawal', {
        method: 'POST',
        body: JSON.stringify({ amount: n, payout_method: payoutMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Yuborilmadi');
      setMsg(data.message || "So'rov superuserga yuborildi.");
      setMsgErr(false);
      setAmount('');
      await load();
    } catch (err) {
      setMsg(String(err.message || 'Xatolik'));
      setMsgErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="packer-page">
      <h2 className="packer-route-title">Moliya</h2>
      <p className="packer-db-hint">Balansdan pul chiqarish — superuser tasdiqlaydi, keyin buxgalteriya «Pul berildi» yozadi.</p>
      {loading ? (
        <p className="packer-db-hint">Yuklanmoqda...</p>
      ) : (
        <section className="picker-withdrawal-card">
          <h3 className="picker-withdrawal-title">Haqq ({noWorkRole ? '—' : formatMoliyaCurrency(balance ?? 0)})</h3>
          {noWorkRole ? (
            <p className="picker-withdrawal-msg error">
              Ishchi rol topilmadi. Administrator portalda siz uchun ekspeditor (yoki zakaz qabul) ish ro‘yi yarating —
              login yoki email bilan.
            </p>
          ) : (
            <>
              <p className="picker-withdrawal-balance">
                Chiqarish mumkin: <strong>{formatMoliyaCurrency(balance ?? 0)}</strong>
              </p>
              <form className="picker-withdrawal-row" onSubmit={onSubmit}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="picker-withdrawal-input"
                  placeholder="Summa"
                  value={amount}
                  onChange={(ev) => setAmount(ev.target.value)}
                  disabled={busy}
                  aria-label="Chiqarish summasi"
                />
                <select
                  className="picker-withdrawal-input"
                  value={payoutMethod}
                  onChange={(ev) => setPayoutMethod(ev.target.value)}
                  disabled={busy}
                  aria-label="To‘lov turi"
                >
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                </select>
                <button type="submit" className="picker-btn picker-btn-primary" disabled={busy}>
                  {busy ? '...' : 'Yuborish'}
                </button>
              </form>
            </>
          )}
          {msg ? <p className={`picker-withdrawal-msg ${msgErr ? 'error' : 'success'}`}>{msg}</p> : null}
        </section>
      )}
      {list.length > 0 ? (
        <section className="picker-card" style={{ marginTop: 16 }}>
          <div className="picker-card-header">
            <span className="picker-card-id">So‘rovlar</span>
          </div>
          <div className="picker-card-body">
            <ul className="courier-call-log-list">
              {list.map((row) => (
                <li key={row.id} className="courier-call-log-item">
                  <span>
                    {formatMoliyaCurrency(row.amount)} · {expeditorWithdrawalStatusUz(row.status, row.paid_out_at)}
                  </span>
                  <span className="muted">{String(row.created_at || '').slice(0, 16)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ExpeditorProfileView({ user, updateProfile }) {
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
    <div className="packer-profile-layout">
      <div className="packer-profile-editor">
        <form className="packer-profile-form" onSubmit={(ev) => void onSubmit(ev)}>
          <div className="packer-profile-fields packer-meta-dl packer-profile-dl">
            <div>
              <label className="packer-profile-field-label" htmlFor="expeditor-profile-full_name">
                Ism
              </label>
              <input
                id="expeditor-profile-full_name"
                className="packer-profile-input"
                value={fullName}
                onChange={(ev) => setFullName(ev.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label className="packer-profile-field-label" htmlFor="expeditor-profile-email">
                Email
              </label>
              <input
                id="expeditor-profile-email"
                type="email"
                className="packer-profile-input"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="packer-profile-field-label" htmlFor="expeditor-profile-login">
                Login
              </label>
              <input
                id="expeditor-profile-login"
                className="packer-profile-input"
                value={login}
                onChange={(ev) => setLogin(ev.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="packer-profile-field-label" htmlFor="expeditor-profile-phone">
                Telefon
              </label>
              <input
                id="expeditor-profile-phone"
                type="tel"
                className="packer-profile-input"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="packer-meta-full">
              <span className="packer-profile-field-label">Rol</span>
              <p className="packer-profile-ro">{user.role || 'order_receiver'}</p>
              <p className="packer-profile-ro-hint">Rol faqat administrator tomonidan o‘zgartiriladi.</p>
            </div>
          </div>

          <div className="packer-profile-password-group">
            <div>
              <label className="packer-profile-field-label" htmlFor="expeditor-profile-password">
                Yangi parol (ixtiyoriy)
              </label>
              <input
                id="expeditor-profile-password"
                type="password"
                className="packer-profile-input"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="packer-profile-field-label" htmlFor="expeditor-profile-password2">
                Parolni takrorlang
              </label>
              <input
                id="expeditor-profile-password2"
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
    </div>
  );
}

export default function ExpeditorDashboard() {
  const { user, logout, updateProfile, request } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const [staffNotifOpen, setStaffNotifOpen] = useState(false);
  const [staffProfileOpen, setStaffProfileOpen] = useState(false);
  const [staffNotifSoundOn, setStaffNotifSoundOn] = useState(true);
  const [staffNotifications, setStaffNotifications] = useState([]);

  const loadStaffNotifications = useCallback(async () => {
    try {
      const res = await request('/expeditor/notifications', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setStaffNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setStaffNotifications([]);
    }
  }, [request]);

  const markStaffNotificationRead = useCallback(async (id) => {
    try {
      await request(`/expeditor/notifications/${id}/read`, { method: 'PATCH' });
      setStaffNotifications((prev) =>
        prev.map((n) => (Number(n.id) === Number(id) ? { ...n, read_at: new Date().toISOString() } : n)),
      );
    } catch (_) {}
  }, [request]);

  const staffNotifUnreadCount = useMemo(
    () => staffNotifications.filter((n) => !n.read_at).length,
    [staffNotifications],
  );

  useEffect(() => {
    if (staffNotifOpen) void loadStaffNotifications();
  }, [staffNotifOpen, loadStaffNotifications]);

  const [regionFilterId, setRegionFilterId] = useState(() => readExpeditorViloyatFilter());
  const [courierStaffId, setCourierStaffId] = useState(() => readExpeditorCourierFilter());
  const [couriers, setCouriers] = useState([]);
  const [couriersLoading, setCouriersLoading] = useState(true);
  const [couriersError, setCouriersError] = useState('');
  const [orderScanValue, setOrderScanValue] = useState('');
  const [orderScanBusy, setOrderScanBusy] = useState(false);
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  const [scanSessionQueue, setScanSessionQueue] = useState([]);
  const [listCloseReminderOpen, setListCloseReminderOpen] = useState(false);
  const [scanDuplicateModal, setScanDuplicateModal] = useState(null);
  const [handoffOrderIds, setHandoffOrderIds] = useState([]);
  const [queueRefreshNonce, setQueueRefreshNonce] = useState(0);
  const [handoffDrawerOpen, setHandoffDrawerOpen] = useState(false);
  const [handoffListsRefreshNonce, setHandoffListsRefreshNonce] = useState(0);
  const [closeListError, setCloseListError] = useState('');

  const [expeditorBalance, setExpeditorBalance] = useState(null);

  const loadExpeditorBalance = useCallback(async () => {
    try {
      const res = await request('/expeditor/work-role/balance');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setExpeditorBalance(Number(data.balance) || 0);
      }
    } catch (_) {}
  }, [request]);

  useEffect(() => {
    void loadExpeditorBalance();
  }, [loadExpeditorBalance, queueRefreshNonce]);

  /** Viloyat tanlangan bo‘lsa ro‘yxat yopiqdan boshlanadi — tepada «Ro‘yxat» (soat o‘rnida), keyin ochiladi. */
  const [mainHandoffListClosed, setMainHandoffListClosed] = useState(() => {
    const vil = readExpeditorViloyatFilter();
    const lsClosed = readLocalStorageValue(EXPEDITOR_LIST_CLOSED_KEY, '0') === '1';
    if (vil && PACKER_UZ_VILOYATLAR.some((r) => r.id === vil)) return true;
    return lsClosed;
  });
  const [liveHandoffCount, setLiveHandoffCount] = useState(0);
  const [livePendingCount, setLivePendingCount] = useState(0);
  const [homePaneTab, setHomePaneTab] = useState('sklad');
  const [topbarClockTick, setTopbarClockTick] = useState(0);
  const [isMobileTopbar, setIsMobileTopbar] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobileTopbar(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTopbarClockTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const topbarUzClock = useMemo(() => getLiveClockInUzbekistan(), [topbarClockTick]);

  useEffect(() => {
    if (!scanDuplicateModal) return;
    document.getElementById('expeditor-order-scan')?.blur();
  }, [scanDuplicateModal]);

  useEffect(() => {
    setRegionFilterId((cur) => {
      if (!cur) return cur;
      if (PACKER_UZ_VILOYATLAR.some((r) => r.id === cur)) return cur;
      writeExpeditorViloyatFilter('');
      return '';
    });
  }, []);

  useEffect(() => {
    setCourierStaffId((cur) => {
      if (!cur) return cur;
      const id = String(cur);
      if (/^\d+$/.test(id)) return id;
      writeExpeditorCourierFilter('');
      return '';
    });
  }, []);

  const loadCouriers = useCallback(async () => {
    setCouriersError('');
    setCouriersLoading(true);
    try {
      const q = regionFilterId ? `?viloyat_id=${encodeURIComponent(regionFilterId)}` : '';
      const res = await request(`/expeditor/couriers${q}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kuryerlar yuklanmadi');
      setCouriers(Array.isArray(data.couriers) ? data.couriers : []);
    } catch (e) {
      setCouriersError(e.message || 'Kuryerlar yuklanmadi');
      setCouriers([]);
    } finally {
      setCouriersLoading(false);
    }
  }, [request, regionFilterId]);

  useEffect(() => {
    void loadCouriers();
  }, [loadCouriers]);

  useEffect(() => {
    // Any assign/unassign flow bumps queueRefreshNonce.
    // Refresh couriers too so selected courier balance updates immediately.
    if (queueRefreshNonce < 1) return;
    void loadCouriers();
  }, [queueRefreshNonce, loadCouriers]);

  useEffect(() => {
    if (!courierStaffId || couriers.length === 0) return;
    const ok = couriers.some((c) => String(c.id) === String(courierStaffId));
    if (!ok) {
      writeExpeditorCourierFilter('');
      setCourierStaffId('');
    }
  }, [courierStaffId, couriers]);

  useEffect(() => {
    writeLocalStorageValue(EXPEDITOR_LIST_CLOSED_KEY, mainHandoffListClosed ? '1' : '0');
  }, [mainHandoffListClosed]);

  const reportHandoffIds = useCallback((ids) => {
    setHandoffOrderIds(Array.isArray(ids) ? ids : []);
  }, []);

  const closeHandoffList = useCallback(async () => {
    if (!courierStaffId) {
      setCloseListError('Kuryer tanlanmagan.');
      return;
    }
    setCloseListError('');
    try {
      const res = await request('/expeditor/handoff-lists/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier_staff_id: Number(courierStaffId),
          viloyat_id: regionFilterId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ro\'yxat yopilmadi');
      const closedAt = data.batch?.closed_at || new Date().toISOString();
      writeLocalStorageValue(EXPEDITOR_HANDOFF_LIST_CLOSED_AT_KEY, closedAt);
      setMainHandoffListClosed(true);
      setListCloseReminderOpen(false);
      setQueueRefreshNonce((n) => n + 1);
      setHandoffListsRefreshNonce((n) => n + 1);
      setHandoffDrawerOpen(true);
      queueMicrotask(() => {
        document.getElementById('expeditor-rail-plus-btn')?.focus({ preventScroll: false });
      });
    } catch (e) {
      setCloseListError(e.message || 'Ro\'yxat yopilmadi');
    }
  }, [courierStaffId, regionFilterId, request]);

  const isHome =
    location.pathname === '/expeditor' || location.pathname === '/expeditor/';

  const courierDropdownOptions = useMemo(
    () =>
      couriers.map((c) => ({
        value: String(c.id),
        label: `${c.full_name || `Kuryer #${c.id}`}${c.region_name ? ` · ${c.region_name}` : ''}${c.phone ? ` · ${c.phone}` : ''}`,
      })),
    [couriers],
  );

  const courierDropdownEmptyLabel =
    couriersLoading && !couriers.length
      ? 'Yuklanmoqda…'
      : regionFilterId
        ? 'Kuryer tanlang'
        : 'Barcha viloyat — kuryer tanlang';

  const expeditorTopbarName = String(user?.full_name || '').trim() || 'Ekspeditor';

  const selectedCourier = useMemo(() => {
    if (!courierStaffId) return null;
    return couriers.find((c) => String(c.id) === String(courierStaffId)) || null;
  }, [couriers, courierStaffId]);

  const courierBalanceNegative = Boolean(selectedCourier && Number(selectedCourier.balance ?? 0) < 0);
  const showCourierBalance = Boolean(isHome && regionFilterId && courierStaffId && selectedCourier);
  const scanBlockedByBalance = Boolean(courierStaffId && selectedCourier && courierBalanceNegative);
  const scanBlockedByDuplicateModal = Boolean(scanDuplicateModal);

  const submitOrderToCourier = useCallback(
    async (e, rawScan, options = {}) => {
      const { silentInvalid = false } = options;
      if (e?.preventDefault) e.preventDefault();
      if (scanDuplicateModal) return 'cancelled';
      if (!courierStaffId) {
        if (!silentInvalid) window.alert('Avval kuryer tanlang.');
        return 'blocked';
      }
      if (courierBalanceNegative) {
        setScanDuplicateModal({
          title: "Kuryer balansida pul yo'q",
          detail: "Kuryer balansi manfiy. Balans to‘languncha zakaz biriktirish taqiqlanadi.",
        });
        return 'blocked';
      }
      const scanRaw = rawScan != null ? String(rawScan) : orderScanValue;
      const id = parseOrderIdFromScan(scanRaw);
      if (!Number.isFinite(id) || id < 1) {
        if (!silentInvalid) window.alert('Zakaz ID noto‘g‘ri. Masalan: 42 yoki o-42.');
        return 'invalid';
      }
      if (handoffOrderIds.includes(id)) {
        setScanDuplicateModal({
          detail: 'Siz allaqachon ushbu buyurtmani skanerlagansiz.',
        });
        return 'duplicate';
      }
      setOrderScanBusy(true);
      try {
        const res = await request(`/expeditor/orders/${id}/assign-courier`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courier_staff_id: Number(courierStaffId) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(data.error || 'Biriktirilmadi');
          if (data.code) err.code = data.code;
          throw err;
        }
        setOrderScanValue('');
        setScanDuplicateModal(null);
        setMainHandoffListClosed(false);
        setHomePaneTab('kuryer');
        await loadCouriers();
        setQueueRefreshNonce((n) => n + 1);
        return 'success';
      } catch (er) {
        if (er?.code === 'order_already_assigned') {
          setScanDuplicateModal({
            detail: er.message || 'Bu buyurtma allaqachon biriktirilgan.',
          });
          return 'duplicate';
        }
        if (!silentInvalid) window.alert(er.message || 'Xatolik');
        return 'error';
      } finally {
        setOrderScanBusy(false);
      }
    },
    [request, courierStaffId, orderScanValue, courierBalanceNegative, loadCouriers, handoffOrderIds, scanDuplicateModal],
  );

  const openCameraScanner = useCallback(() => {
    if (scanDuplicateModal) {
      window.alert('Ogohlantirish yopilgunicha skaner ishlamaydi.');
      return;
    }
    if (listCloseReminderOpen) {
      return;
    }
    if (!courierStaffId) {
      window.alert('Avval kuryer tanlang.');
      return;
    }
    if (courierBalanceNegative) {
      setScanDuplicateModal({
        title: "Kuryer balansida pul yo'q",
        detail: "Kuryer balansi manfiy. Balans to‘languncha zakaz biriktirish taqiqlanadi.",
      });
      return;
    }
    const openScan = () => {
      setScanSessionQueue([]);
      setHomePaneTab('sklad');
      setCameraScanOpen(true);
    };
    if (!isHome) {
      navigate('/expeditor');
      queueMicrotask(openScan);
      return;
    }
    openScan();
  }, [scanDuplicateModal, listCloseReminderOpen, courierStaffId, courierBalanceNegative, isHome, navigate]);

  const handleCameraScanResult = useCallback(
    async (raw) => {
      const scanRaw = String(raw || '').trim();
      setOrderScanValue(scanRaw);
      const id = parseOrderIdFromScan(scanRaw);
      const result = await submitOrderToCourier(null, raw, { silentInvalid: true });

      if (result === 'success') {
        setScanSessionQueue((queue) => [...queue, { id, at: Date.now() }]);
        setHomePaneTab('kuryer');
        return { action: 'continue' };
      }
      if (result === 'duplicate') {
        return { action: 'continue', message: 'Bu chek allaqachon skanerlangan.' };
      }
      if (result === 'blocked' || result === 'cancelled') {
        return { action: 'close' };
      }
      if (result === 'invalid') {
        return {
          action: 'continue',
          message: 'Zakaz ID noto‘g‘ri. Chek shtrix-kodini qayta tuting.',
        };
      }
      return {
        action: 'continue',
        message: 'Biriktirilmadi. Qayta urinib ko‘ring.',
      };
    },
    [submitOrderToCourier],
  );

  useEffect(() => {
    if (!cameraScanOpen) return;
    if (livePendingCount !== 0) return;
    if (scanSessionQueue.length < 1) return;
    setCameraScanOpen(false);
    setListCloseReminderOpen(true);
  }, [cameraScanOpen, livePendingCount, scanSessionQueue.length]);

  useEffect(() => {
    if (mainHandoffListClosed && listCloseReminderOpen) {
      setListCloseReminderOpen(false);
    }
  }, [mainHandoffListClosed, listCloseReminderOpen]);

  const topMeta = useMemo(() => {
    const pathNorm = location.pathname.replace(/\/$/, '') || '/';
    if (pathNorm.endsWith('/profile')) return { title: 'Profil', showBrand: false };
    if (pathNorm.endsWith('/moliya')) return { title: 'Moliya', showBrand: false };
    return { title: null, showBrand: false };
  }, [location.pathname]);

  const hasViloyatFilter = Boolean(String(regionFilterId || '').trim());
  /** Soat o‘rnida: viloyat + ro‘yxat ochiq → «Listni yopish» (faqat eslatma modali yopiq bo‘lsa) */
  const showCloseHandoffListBtn = Boolean(
    isHome && hasViloyatFilter && !mainHandoffListClosed && !listCloseReminderOpen,
  );
  /** Soat o‘rnida: viloyat + ro‘yxat yopiq → «Ro‘yxat» */
  const showOpenHandoffListBtn = Boolean(isHome && hasViloyatFilter && mainHandoffListClosed);
  const showPlusOrdersBadge = Boolean(
    isHome &&
      mainHandoffListClosed &&
      String(courierStaffId || '').trim() !== '' &&
      liveHandoffCount > 0,
  );

  const staffActionsProps = {
    displayName: expeditorTopbarName,
    profilePath: '/expeditor/profile',
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
  };

  const hideHomeTopbarDetails = isMobileTopbar && !isHome;

  const topbarClockOrList = showCloseHandoffListBtn ? (
    <button
      type="button"
      className="expeditor-topbar-close-list-btn"
      onClick={closeHandoffList}
    >
      Listni yopish
    </button>
  ) : showOpenHandoffListBtn ? (
    <button
      type="button"
      className="expeditor-topbar-open-list-btn"
      title="Tanlangan viloyat bo‘yicha zakazlar ro‘yxatini ochish (chap: tayyor; o‘ng: kuryerga berilgan — kuryer tanlangan bo‘lsa)"
      onClick={() => {
        setMainHandoffListClosed(false);
        setHomePaneTab('kuryer');
        setQueueRefreshNonce((n) => n + 1);
        window.requestAnimationFrame(() => {
          const hasCourier = Boolean(String(courierStaffId || '').trim());
          const pane = document.querySelector(
            hasCourier ? '.expeditor-pane--handoff' : '.expeditor-pane--pending',
          );
          pane?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }}
    >
      Ro‘yxat
    </button>
  ) : (
    <time
      className="expeditor-topbar-clock"
      dateTime={topbarUzClock.dateTimeAttr}
      title="O‘zbekiston vaqti (Asia/Tashkent)"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="expeditor-topbar-clock__date">{topbarUzClock.dateLabel}</span>
      <span className="expeditor-topbar-clock__time">{topbarUzClock.timeLabel}</span>
    </time>
  );

  const orderScanForm = (
    <form className="expeditor-topbar-scan" onSubmit={(ev) => void submitOrderToCourier(ev)}>
      <label htmlFor="expeditor-order-scan" className="packer-sr-only">
        Zakaz ID
      </label>
      <div
        className={`expeditor-topbar-scan-pill${
          scanBlockedByDuplicateModal ? ' expeditor-topbar-scan-pill--blocked' : ''
        }`}
      >
        <input
          id="expeditor-order-scan"
          className="expeditor-topbar-scan-input"
          value={orderScanValue}
          onChange={(ev) => {
            setOrderScanValue(ev.target.value);
            setScanDuplicateModal(null);
          }}
          placeholder="Zakaz ID yoki o-123"
          autoComplete="off"
          disabled={orderScanBusy || scanBlockedByDuplicateModal}
          enterKeyHint="go"
        />
        <button
          type="submit"
          className="expeditor-topbar-scan-arrow"
          disabled={orderScanBusy || scanBlockedByDuplicateModal}
          aria-label="Kuryerga biriktirish (o‘ng oyna)"
          title={
            scanBlockedByDuplicateModal
              ? 'Ogohlantirish yopilgunicha skaner o‘chirilgan'
              : 'Kuryerga biriktirish'
          }
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path
              d="M5 12h14m-6-6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </form>
  );

  return (
    <div className="packer-app packer-app--compact-cards">
      <aside id="expeditor-sidebar-nav" className="packer-sidebar packer-sidebar--rail" aria-label="Ekspeditor navigatsiyasi">
        <div className="packer-sidebar-inner">
          <StaffRailTopbarActions
            {...staffActionsProps}
            className="packer-rail-staff-actions"
            showProfile={false}
          />
          <nav className="packer-nav packer-nav--rail" aria-label="Ekspeditor bo‘limlari">
            <NavLink to="/expeditor" end className={navLinkClassRail} title="Bosh sahifa">
              <RailIconNav>
                <path
                  {...RAIL_IC}
                  d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </RailIconNav>
              <span className="packer-sr-only">Bosh sahifa</span>
            </NavLink>
            <NavLink to="/expeditor/profile" className={navLinkClassRail} title="Profil">
              <RailIconNav>
                <path
                  {...RAIL_IC}
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </RailIconNav>
              <span className="packer-sr-only">Profil</span>
            </NavLink>
            <NavLink to="/expeditor/moliya" className={navLinkClassRail} title="Moliya">
              <RailIconNav>
                <path
                  {...RAIL_IC}
                  d="M21 18V12a2 2 0 0 0-1.11-1.79l-6-3a2 2 0 0 0-1.78 0l-6 3A2 2 0 0 0 3 12v6M3 18h18M7 21h10M12 21v-3"
                />
              </RailIconNav>
              <span className="packer-sr-only">Moliya</span>
            </NavLink>
            <button
              type="button"
              id="expeditor-rail-plus-btn"
              className="packer-nav-link packer-nav-link--rail expeditor-rail-plus"
              title="Kuryerga zakaz biriktirish — ro‘yxatni ochish"
              aria-label={`Kuryerga zakaz biriktirish va kuryerdagi ro‘yxat${
                showPlusOrdersBadge ? `, ${liveHandoffCount} ta zakaz bor` : ''
              }`}
              onClick={() => setHandoffDrawerOpen(true)}
            >
              <RailIconNav>
                <path {...RAIL_IC} d="M12 5v14M5 12h14" />
              </RailIconNav>
              {showPlusOrdersBadge ? (
                <span className="expeditor-rail-plus-badge" aria-hidden>
                  {liveHandoffCount > 99 ? '99+' : liveHandoffCount}
                </span>
              ) : null}
              <span className="packer-sr-only">Kuryer zakazlari</span>
            </button>
            {isHome ? (
              <button
                type="button"
                id="expeditor-rail-scan-btn"
                className="packer-nav-link packer-nav-link--rail expeditor-rail-scan"
                title="Zakaz skanerlash — kamera ochiladi"
                aria-label="Zakaz skanerlash — sklat chekini kamera bilan o‘qish"
                onClick={openCameraScanner}
                disabled={orderScanBusy}
              >
                <RailIconNav>
                  <path
                    {...RAIL_IC}
                    d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h.01M12 8h.01M17 8h.01M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01"
                  />
                </RailIconNav>
                <span className="packer-sr-only">Skaner</span>
              </button>
            ) : null}
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
              {...staffActionsProps}
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
                    'Sahifadan chiqishni tasdiqlaysizmi?\n\nTasdiqlasangiz, hisobdan chiqasiz va bosh sahifaga o‘tadi.',
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
        <header className={`packer-sticky-topbar packer-sticky-topbar--expeditor${hideHomeTopbarDetails ? ' expeditor-topbar--compact' : ''}`}>
          <div className="packer-sticky-topbar-title">
            {topMeta.title != null ? <span className="packer-sticky-brand">{topMeta.title}</span> : null}
            {topMeta.showBrand ? <span className="packer-sticky-brand">Ekspeditor</span> : null}
          </div>
          <div className="packer-topbar-region-row expeditor-topbar-region-row">
            <div className="expeditor-topbar-filters expeditor-topbar-filters--chips">
              <div className="expeditor-topbar-select-wrap">
                <PackerViloyatDropdown
                  value={regionFilterId}
                  onChange={(v) => {
                    setRegionFilterId(v);
                    writeExpeditorViloyatFilter(v);
                    if (v) setMainHandoffListClosed(true);
                  }}
                  title="Yetkazish manzili bo‘yicha viloyat"
                />
              </div>
              <div className="expeditor-topbar-select-wrap">
                <StaffChipDropdown
                  value={courierStaffId}
                  onChange={(v) => {
                    setCourierStaffId(v);
                    writeExpeditorCourierFilter(v);
                  }}
                  options={courierDropdownOptions}
                  emptyValue=""
                  emptyLabel={courierDropdownEmptyLabel}
                  disabled={couriersLoading && couriers.length === 0}
                  title="Kuryer bo‘yicha"
                  instanceId="expeditor-courier"
                />
              </div>
            </div>
            <StaffTopbarCenterId className="packer-topbar-inline-id" />
          </div>
          {isHome ? (
            <div className="expeditor-topbar-tools packer-topbar-end">
              <div className="expeditor-topbar-balances-row">
                <div className="expeditor-topbar-balance expeditor-topbar-balance--mahsulot" role="status">
                  <span className="expeditor-topbar-balance__k">Mahsulot Balansi</span>
                  <span className="expeditor-topbar-balance__v">
                    {formatExpeditorMoney(expeditorBalance ?? 0, 'UZS')}
                  </span>
                </div>
                {showCourierBalance ? (
                  <div
                    className={`expeditor-topbar-balance ${
                      courierBalanceNegative ? 'expeditor-topbar-balance--courier-red' : 'expeditor-topbar-balance--courier-blue'
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="expeditor-topbar-balance__k">Kuryer Balansi</span>
                    <span className="expeditor-topbar-balance__v">
                      {formatExpeditorMoney(Number(selectedCourier.balance ?? 0), 'UZS')}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="expeditor-topbar-scan-clock-row">
                <div className="expeditor-topbar-scan-wrap">{orderScanForm}</div>
                <div className="expeditor-topbar-clock-slot expeditor-topbar-clock-slot--scan-row">
                  {topbarClockOrList}
                </div>
              </div>
            </div>
          ) : null}
          <div className="expeditor-topbar-trailing">
            <StaffRailTopbarActions {...staffActionsProps} className="packer-topbar-staff-actions" />
            <div className="expeditor-topbar-clock-slot expeditor-topbar-clock-slot--trailing">
              {topbarClockOrList}
            </div>
          </div>
        </header>

        <main
          className={`packer-main${
            isHome ? ' packer-main--products-only expeditor-main-shell' : ''
          }${cameraScanOpen ? ' packer-main--expeditor-scan-open' : ''}`}
        >
          {cameraScanOpen && isHome ? (
            <ExpeditorMobileScanSession
              open={cameraScanOpen}
              onClose={() => setCameraScanOpen(false)}
              onScan={handleCameraScanResult}
              scanQueue={scanSessionQueue}
              title="Sklat chekini skanerlang"
            />
          ) : null}
          {!cameraScanOpen ? (
          <Routes>
            <Route
              index
              element={
                <>
                  <ExpeditorHomePaneTabs
                    activePane={homePaneTab}
                    onActivePaneChange={setHomePaneTab}
                    pendingCount={livePendingCount}
                    handoffCount={courierStaffId ? liveHandoffCount : null}
                  />
                  <ExpeditorUnsoldSection
                    regionFilterId={regionFilterId}
                    courierStaffId={courierStaffId}
                    courierLabel={selectedCourier?.full_name || (courierStaffId ? `#${courierStaffId}` : '')}
                    request={request}
                    refreshNonce={queueRefreshNonce}
                  />
                  <ExpeditorHomeQueues
                    regionFilterId={regionFilterId}
                    courierStaffId={courierStaffId}
                    request={request}
                    refreshNonce={queueRefreshNonce}
                    bumpQueueRefresh={() => {
                      setQueueRefreshNonce((n) => n + 1);
                      setMainHandoffListClosed(false);
                    }}
                    mainHandoffListClosed={mainHandoffListClosed}
                    onHandoffCountChange={setLiveHandoffCount}
                    onHandoffIdsChange={reportHandoffIds}
                    onPendingCountChange={setLivePendingCount}
                    activePane={homePaneTab}
                  />
                </>
              }
            />
            <Route
              path="profile"
              element={
                <div className="packer-page packer-profile-page">
                  <h2 className="packer-route-title">Profil</h2>
                  <p className="packer-db-hint">Hisob ma’lumotlari server orqali yangilanadi.</p>
                  <ExpeditorProfileView user={user} updateProfile={updateProfile} />
                </div>
              }
            />
            <Route path="moliya" element={<ExpeditorMoliyaPanel request={request} />} />
            <Route path="*" element={<Navigate to="/expeditor" replace />} />
          </Routes>
          ) : null}
        </main>
      </div>
      <ExpeditorCourierHandoffDrawer
        open={handoffDrawerOpen}
        onClose={() => setHandoffDrawerOpen(false)}
        courierStaffId={courierStaffId}
        regionFilterId={regionFilterId}
        courierLabel={selectedCourier?.full_name || ''}
        request={request}
        listsRefreshNonce={handoffListsRefreshNonce}
        onHandoffMutated={() => {
          setQueueRefreshNonce((n) => n + 1);
          setMainHandoffListClosed(false);
        }}
      />
      {scanDuplicateModal ? (
        <ExpeditorScanDuplicateModal
          title={scanDuplicateModal.title}
          detail={scanDuplicateModal.detail}
          onClose={() => setScanDuplicateModal(null)}
        />
      ) : null}
      {listCloseReminderOpen ? (
        <ExpeditorListCloseReminderModal
          scannedCount={scanSessionQueue.length}
          onCloseList={closeHandoffList}
          error={closeListError}
        />
      ) : null}
    </div>
  );
}
