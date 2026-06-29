import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerChatCompose from '../../components/picker/PickerChatCompose';
import PickerVideoNote from '../../components/picker/PickerVideoNote';
import PickerChatAudio from '../../components/picker/PickerChatAudio';
import PickerChatInlineVideo from '../../components/picker/PickerChatInlineVideo';
import PickerLichka from '../../components/picker/PickerLichka';
import StaffNotificationBell from '../../components/notifications/StaffNotificationBell.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu';
import StaffTopbarCenterId from '../../components/staff/StaffTopbarCenterId.jsx';
import StaffAdvanceConfirm from '../../components/StaffAdvanceConfirm.jsx';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import {
  formatPickerCurrency,
  formatPickerDateTime,
  formatPickerDateTimeFull,
  formatSkladPresenceSubtitle,
} from '../../i18n/pickerFormat';
import { PICKER_I18N } from '../../i18n/pickerI18n';
import StaffTransactionTimeline from '../../components/finance/StaffTransactionTimeline.jsx';
import { uploadStaffChatMediaFromBlobUrl, resolveStaffChatMediaUrl } from '../../utils/staffChatMedia.js';
import {
  requestSystemNotificationPermission,
  systemNotificationsSupported,
} from '../../utils/systemNotifications.js';
import { useSystemNotifyIncomingMessages } from '../../hooks/useSystemNotifyIncomingMessages.js';
import './PickerDashboard.css';

function resolvePickerProductImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (s.startsWith('/')) return `${base}${s}`;
  return s;
}

function pickerMessageSnippet(m, tr) {
  if (!m || !tr) return '';
  const typ = m.type || 'text';
  if (typ === 'text') return String(m.text || '').slice(0, 120) || tr.chatSnippetMsg;
  if (typ === 'audio') return tr.chatSnippetAudio;
  if (typ === 'video') return m.videoNote ? tr.chatSnippetVideoNote : tr.chatSnippetVideo;
  if (typ === 'image') return tr.chatSnippetImage;
  return `📎 ${m.fileName || tr.chatSnippetFileFallback}`;
}

function pickerCopyableText(m, tr) {
  if (!m || !tr) return '';
  if ((m.type === 'text' || !m.type) && m.text) return String(m.text);
  return pickerMessageSnippet(m, tr);
}

/** Telegram uslubidagi dumaloq avatar uchun 1–2 harf */
function pickerNickInitials(nick) {
  const s = String(nick || '?').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || '';
    const b = parts[1][0] || '';
    return `${a}${b}`.toUpperCase();
  }
  if (s.length <= 2) return s.toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

/** Javob berilayotgan xabar muallifining ko‘rinadigan ismi */
function chatReplyAuthorNick(m, pickerNick, brandName) {
  const p = String(pickerNick || '').trim();
  const b = String(brandName || '').trim();
  const fromMsg = String(m?.senderNick || '').trim();
  if (fromMsg) return fromMsg;
  return m?.out ? p || 'Picker' : b || 'MyShop';
}

/** Yuborilgan xabarlar doim o‘ngda, kelganlar chapda (LTR joylashuv) */
function pickerMsgIsOutgoing(m) {
  if (!m || typeof m !== 'object') return false;
  if (m.out === true || m.out === 1) return true;
  if (m.out === false || m.out === 0) return false;
  if (typeof m.out === 'string') {
    const s = m.out.toLowerCase().trim();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return false;
}

function OrderCard({
  order,
  onPicked,
  busyId,
  showPickedButton = true,
  footerLeft,
  footerRight,
  t,
  formatMoney,
  formatWhen,
}) {
  return (
    <article className="picker-card picker-order-block">
      <div className="picker-card-header">
        <span className="picker-card-id">
          {t.orderZakaz} #{order.id}
        </span>
        <span className="picker-card-date">{formatWhen(order.created_at)}</span>
      </div>
      <div className="picker-card-body">
        {order.items?.length > 0 ? (
          <ul className="picker-order-items" aria-label={t.orderZakaz}>
            {order.items.map((i) => {
              const img = resolvePickerProductImageUrl(i.image_url);
              return (
                <li key={i.id} className="picker-order-item-row">
                  <div className="picker-order-item-thumb">
                    {img ? (
                      <img src={img} alt="" loading="lazy" />
                    ) : (
                      <span className="picker-order-item-thumb-ph" aria-hidden />
                    )}
                  </div>
                  <span className="picker-order-item-name">{i.name_uz}</span>
                  <span className="picker-order-item-qty">
                  {i.quantity} {t.orderPcs}
                </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <div className="picker-row">
              <span className="picker-label">{t.orderSum}</span>
              <strong className="picker-value">{formatMoney(order.total_amount)}</strong>
            </div>
            {order.contact_phone && (
              <div className="picker-row picker-row-link">
                <span className="picker-label">{t.orderPhone}</span>
                <a href={`tel:${order.contact_phone}`} className="picker-tel">{order.contact_phone}</a>
              </div>
            )}
            {order.shipping_address && (
              <div className="picker-row">
                <span className="picker-label">{t.orderAddress}</span>
                <span className="picker-value picker-address">{order.shipping_address}</span>
              </div>
            )}
          </>
        )}
      </div>
      {showPickedButton && !footerLeft && !footerRight && (
        <div className="picker-card-footer">
          <button
            type="button"
            className="picker-btn picker-btn-primary picker-btn-block"
            onClick={() => onPicked(order.id)}
            disabled={busyId === order.id}
          >
            {busyId === order.id ? '...' : t.orderPickPacker}
          </button>
        </div>
      )}
      {(footerLeft || footerRight) && (
        <div className="picker-card-footer picker-card-footer-actions">
          <div className="picker-footer-left">{footerLeft}</div>
          <div className="picker-footer-right">{footerRight}</div>
        </div>
      )}
    </article>
  );
}

/** Tarix: yig‘ilgan zakazlarni mahsulot bo‘yicha guruhlash */
function aggregatePickerHistoryByProduct(orders) {
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
          orders: [],
          orderIdSet: new Set(),
          units_total: 0,
          latest_at: order.created_at,
        });
      }
      const g = map.get(pid);
      const img = sample?.image_url != null ? String(sample.image_url).trim() : '';
      if (img) g.image_url = sample.image_url;
      g.units_total += lineQty;
      const t = Date.parse(order.created_at || '');
      const gt = Date.parse(g.latest_at || '');
      if (!Number.isNaN(t) && (Number.isNaN(gt) || t > gt)) g.latest_at = order.created_at;
      if (!g.orderIdSet.has(order.id)) {
        g.orderIdSet.add(order.id);
        g.orders.push({
          ...order,
          item_quantity: lineQty,
        });
      }
    }
  }
  return [...map.values()]
    .map(({ orderIdSet, ...rest }) => ({
      ...rest,
      orders_count: orderIdSet.size,
    }))
    .sort((a, b) => {
      const ta = Date.parse(a.latest_at || '') || 0;
      const tb = Date.parse(b.latest_at || '') || 0;
      return tb - ta;
    });
}

function ProductHistoryBlock({ group, t, formatWhen }) {
  const img = resolvePickerProductImageUrl(group.image_url);
  return (
    <article className="picker-card picker-history-product-block">
      <div className="picker-card-header">
        <div className="picker-history-product-head">
          {img ? (
            <img className="picker-history-product-head-img" src={img} alt="" loading="lazy" />
          ) : (
            <span className="picker-history-product-head-ph" aria-hidden />
          )}
          <span className="picker-history-product-head-name">{group.name_uz}</span>
        </div>
        <span className="picker-card-date">{formatWhen(group.latest_at)}</span>
      </div>
      <div className="picker-card-body">
        <p className="picker-history-product-meta">
          {group.orders_count} {t.ordersUnit} · {group.units_total} {t.orderPcs}
        </p>
        <ul className="picker-history-order-list">
          {group.orders.map((o) => (
            <li key={o.id} className="picker-history-order-entry" style={{ padding: '12px', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px', marginBottom: '10px', backgroundColor: 'var(--card-bg, #ffffff)' }}>
              <div className="picker-history-order-head" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border, #e2e8f0)', paddingBottom: '6px' }}>
                <span className="picker-card-id" style={{ fontWeight: 'bold' }}>
                  {t.orderZakaz} #{o.id}
                </span>
                <span className="picker-card-date" style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                  {formatWhen(o.created_at)}
                </span>
              </div>
              <ul className="picker-order-items" aria-label={t.orderZakaz} style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                {o.items?.map((i) => {
                  const img = resolvePickerProductImageUrl(i.image_url);
                  return (
                    <li key={i.id} className="picker-order-item-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <div className="picker-order-item-thumb" style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--bg-muted, #f8fafc)', flexShrink: 0 }}>
                        {img ? (
                          <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span className="picker-order-item-thumb-ph" aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />
                        )}
                      </div>
                      <span className="picker-order-item-name" style={{ flexGrow: 1, fontSize: '0.95rem' }}>{i.name_uz}</span>
                      <span className="picker-order-item-qty" style={{ fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                        {i.quantity} {t.orderPcs}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** Yon menyu — chat: samalyot + yonida «MyShop chat» */
const myshopPlaneIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false">
    <defs>
      <linearGradient id="pickerSidebarTelegram" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
        <stop stopColor="#37aee2" />
        <stop offset="1" stopColor="#1e96c8" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="11" fill="url(#pickerSidebarTelegram)" />
    <path
      fill="#fff"
      d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.12-.46-.52-.19l-9.48 5.99-4.1-1.3c-.88-.25-.89-.86.2-1.3L19.81 4.54c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.08-3.08-2.05 1.95c-.23.23-.42.42-.83.42z"
    />
  </svg>
);

export default function PickerDashboard() {
  const { request, user, logout, retrySession } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    locale,
    setLocale,
    t: pickerUiT,
  } = usePickerUiSettings();
  const formatMoney = useCallback((v) => formatPickerCurrency(v, locale), [locale]);
  const formatWhen = useCallback((v) => formatPickerDateTime(v, locale), [locale]);

  const bottomTabs = useMemo(
    () => [
      { id: 'home', label: pickerUiT.tabHome, icon: '🏠' },
      { id: 'orders', label: pickerUiT.tabOrders, icon: '📋' },
      { id: 'history', label: pickerUiT.tabHistory, icon: '📅' },
      { id: 'print', label: pickerUiT.tabPrint, icon: '🖨️' },
    ],
    [pickerUiT]
  );

  const PICKER_TAB_KEYS = useMemo(
    () =>
      new Set([
        ...bottomTabs.map((t) => t.id),
        ...['profile', 'settings', 'chat', 'lichka'],
      ]),
    [bottomTabs]
  );

  const normalizePickerTab = useCallback(
    (raw) => {
      const v = String(raw || '').trim();
      return PICKER_TAB_KEYS.has(v) ? v : 'home';
    },
    [PICKER_TAB_KEYS]
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => normalizePickerTab(searchParams.get('tab')), [searchParams, normalizePickerTab]);

  const setTab = useCallback(
    (id) => {
      const next = normalizePickerTab(id);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (!next || next === 'home') p.delete('tab');
          else p.set('tab', next);
          return p;
        },
        { replace: true }
      );
    },
    [normalizePickerTab, setSearchParams]
  );

  const sideNavItems = useMemo(
    () => [
      { id: 'home', label: pickerUiT.navHome, icon: '🏠' },
      { id: 'profile', label: pickerUiT.navProfile, icon: '👤' },
      { id: 'settings', label: pickerUiT.navSettings, icon: '⚙️' },
      { id: 'chat', label: pickerUiT.navMyShopChat, icon: myshopPlaneIcon },
      { id: 'lichka', label: pickerUiT.navLichka, icon: '✉️' },
    ],
    [pickerUiT]
  );

  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [printSearchQuery, setPrintSearchQuery] = useState('');
  const [printProducts, setPrintProducts] = useState([]);
  const [printProductsLoading, setPrintProductsLoading] = useState(false);
  const [printQuantities, setPrintQuantities] = useState({});
  const [chekToPrint, setChekToPrint] = useState(null);
  const [packers, setPackers] = useState([]);
  const [pickedBatch, setPickedBatch] = useState([]);
  const [showPackerModal, setShowPackerModal] = useState(false);
  /** Packerga biriktirildi — «Yopish» kutilyapti */
  const [packerModalAssignedOrderId, setPackerModalAssignedOrderId] = useState(null);
  const [assigningPacker, setAssigningPacker] = useState(false);

  const [balance, setBalance] = useState(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const [withdrawalMessage, setWithdrawalMessage] = useState('');
  const [withdrawalFeedbackIsError, setWithdrawalFeedbackIsError] = useState(false);
  const [homeWithdrawals, setHomeWithdrawals] = useState([]);
  const [homeFinanceTransactions, setHomeFinanceTransactions] = useState([]);
  const [homeWithdrawalsLoading, setHomeWithdrawalsLoading] = useState(false);
  const [homeTxHistoryOpen, setHomeTxHistoryOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    email: '',
    login: '',
    phone: '',
    password: '',
    password2: '',
    role_label: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  /** Sessiya davomida chatdan olib tashlangan id lar (qayta yuklanganda serverdan yashiriladi) */
  const teamChatPurgedRef = useRef(new Set());
  const [chatInput, setChatInput] = useState('');
  const chatListRef = useRef(null);

  const [chatReplyTo, setChatReplyTo] = useState(null);
  const chatReplyToRef = useRef(null);
  const [chatImageLightbox, setChatImageLightbox] = useState('');
  useEffect(() => {
    chatReplyToRef.current = chatReplyTo;
  }, [chatReplyTo]);

  useEffect(() => {
    if (!chatImageLightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setChatImageLightbox('');
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [chatImageLightbox]);

  const [chatActionMenu, setChatActionMenu] = useState(null);
  /** Javob iqtibosidagi muallif profili (modal) */
  const [chatAuthorProfile, setChatAuthorProfile] = useState(null);

  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmThreads, setDmThreads] = useState({});
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [lichkaBootPeer, setLichkaBootPeer] = useState(null);
  const [myShopGroupOpen, setMyShopGroupOpen] = useState(false);
  const [myShopGroupSection, setMyShopGroupSection] = useState('members');
  /** Faqat shu qurilmada yashirin xabar id-lari (Telegram «faqat menga») */
  const [hiddenChatMessageIds, setHiddenChatMessageIds] = useState([]);
  const [chatToast, setChatToast] = useState('');
  const [chatMediaUploadErr, setChatMediaUploadErr] = useState('');
  /** Boshqa sklad a’zolari: yozmoqda / media (jamoa chat va MyShop DM bir xona) */
  const [skladPresencePeers, setSkladPresencePeers] = useState([]);
  const longPressTimerRef = useRef(null);
  const bubblePressRef = useRef({ moved: false, startY: 0 });

  const visibleChatMessages = useMemo(
    () => chatMessages.filter((m) => !hiddenChatMessageIds.includes(m.id)),
    [chatMessages, hiddenChatMessageIds]
  );

  useSystemNotifyIncomingMessages({
    enabled: notificationsEnabled,
    messages: visibleChatMessages,
    isOutgoing: (m) => Boolean(m?.out),
    getTitle: (m) => String(m?.senderNick || '').trim() || pickerUiT.chatTeam || 'MyShop',
    getBody: (m) => pickerMessageSnippet(m, pickerUiT),
    getTag: (m) => `picker-sklad-chat-${m.id}`,
    shouldSuppress: () =>
      tab === 'chat' &&
      typeof document !== 'undefined' &&
      !document.hidden &&
      (typeof document.hasFocus === 'function' ? document.hasFocus() : true),
  });

  const skladPresenceSubtitle = useMemo(
    () => formatSkladPresenceSubtitle(skladPresencePeers, pickerUiT),
    [skladPresencePeers, pickerUiT]
  );

  const sendSkladPresence = useCallback((state) => {
    void request('/picker/chat/presence', {
      method: 'POST',
      body: JSON.stringify({ chatRoom: 'sklad', state }),
    }).catch(() => {});
  }, [request]);

  const sendOperatorsPresence = useCallback((state) => {
    void request('/picker/chat/presence', {
      method: 'POST',
      body: JSON.stringify({ chatRoom: 'operators', state }),
    }).catch(() => {});
  }, [request]);

  const groupPeersList = useMemo(() => dmPeers.filter((p) => p.id !== 'myshop'), [dmPeers]);

  const myShopPanelMessages = useMemo(() => {
    const byId = new Map();
    for (const m of visibleChatMessages) byId.set(m.id, m);
    for (const m of dmThreads['myshop'] || []) byId.set(m.id, m);
    return Array.from(byId.values());
  }, [visibleChatMessages, dmThreads]);

  const clearChatLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onChatMessagePointerDown = useCallback(
    (e, m) => {
      if (e.target.closest('audio, video, a[href], button, input, textarea')) return;
      bubblePressRef.current = {
        moved: false,
        startY: e.clientY ?? e.touches?.[0]?.clientY ?? 0,
      };
      clearChatLongPress();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        setChatActionMenu({ message: m, step: 'menu' });
      }, 480);
    },
    [clearChatLongPress]
  );

  const onChatMessagePointerMove = useCallback(
    (e) => {
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (y == null) return;
      if (Math.abs(y - bubblePressRef.current.startY) > 14) {
        bubblePressRef.current.moved = true;
        clearChatLongPress();
      }
    },
    [clearChatLongPress]
  );

  const onChatMessagePointerUp = useCallback(() => {
    clearChatLongPress();
  }, [clearChatLongPress]);

  const onChatMessageContextMenu = useCallback((e, m) => {
    e.preventDefault();
    clearChatLongPress();
    setChatActionMenu({ message: m, step: 'menu' });
  }, [clearChatLongPress]);

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const archivePickerChatMessage = useCallback(
    (msg) => {
      if (!msg?.out || !msg?.id) return;
      const tr = PICKER_I18N[locale] || PICKER_I18N.uz;
      const text =
        msg.type === 'text' || !msg.type
          ? String(msg.text || '')
          : pickerMessageSnippet(msg, tr);
      const mediaUrl =
        msg.mediaUrl && !String(msg.mediaUrl).startsWith('blob:') ? String(msg.mediaUrl) : undefined;
      const payload = {
        type: msg.type || 'text',
        text: msg.text,
        senderNick: msg.senderNick,
        replyTo: msg.replyTo,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(msg.videoNote ? { videoNote: true } : {}),
        ...(msg.durationSec != null ? { durationSec: msg.durationSec } : {}),
        ...(msg.fileName ? { fileName: msg.fileName } : {}),
      };
      void request('/picker/chat/archive', {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: msg.id,
          chatRoom: 'sklad',
          messageType: msg.type || 'text',
          text,
          isOutgoing: true,
          payload,
        }),
      });
    },
    [request, locale]
  );

  const appendChatMessage = useCallback(
    async (msg) => {
      const reply = chatReplyToRef.current;
      const replyTo = reply
        ? {
            id: reply.id,
            snippet: reply.snippet,
            type: reply.type,
            out: reply.out,
            ...(reply.senderNick ? { senderNick: reply.senderNick } : {}),
          }
        : undefined;
      const pickerNick = (user?.full_name || user?.login || 'Picker').trim();
      let next = { ...msg, ...(replyTo ? { replyTo } : {}) };
      if (next.out && !next.senderNick) next.senderNick = pickerNick;

      const blobUrl = next.mediaUrl && String(next.mediaUrl).startsWith('blob:') ? String(next.mediaUrl) : null;
      if (blobUrl) {
        setChatMediaUploadErr('');
        const tr = PICKER_I18N[locale] || PICKER_I18N.uz;
        try {
          const serverUrl = await uploadStaffChatMediaFromBlobUrl(request, blobUrl, next.fileName);
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (_) {}
          next = { ...next, mediaUrl: serverUrl };
        } catch (e) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (_) {}
          setChatMediaUploadErr(String(e?.message || tr.chatMediaUploadFail));
          throw e;
        }
      }

      setChatMessages((prev) => [...prev, next]);
      if (next.out) archivePickerChatMessage(next);
      if (reply) setChatReplyTo(null);
      scrollChatToBottom();
    },
    [scrollChatToBottom, user?.full_name, user?.login, archivePickerChatMessage, request, locale]
  );

  const sendChatMessage = useCallback(() => {
    setChatMediaUploadErr('');
    const t = String(chatInput || '').trim();
    if (!t) return;
    const reply = chatReplyToRef.current;
    const replyTo = reply
      ? {
          id: reply.id,
          snippet: reply.snippet,
          type: reply.type,
          out: reply.out,
          ...(reply.senderNick ? { senderNick: reply.senderNick } : {}),
        }
      : undefined;
    const pickerNick = (user?.full_name || user?.login || 'Picker').trim();
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const id = `m-${Date.now()}`;
    const newMsg = {
      id,
      type: 'text',
      text: t,
      out: true,
      time,
      senderNick: pickerNick,
      ...(replyTo ? { replyTo } : {}),
    };
    setChatMessages((prev) => [...prev, newMsg]);
    archivePickerChatMessage(newMsg);
    setChatInput('');
    setChatReplyTo(null);
    scrollChatToBottom();
  }, [chatInput, scrollChatToBottom, user?.full_name, user?.login, archivePickerChatMessage]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = chatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab, chatMessages.length, visibleChatMessages.length]);

  useEffect(() => {
    if (tab !== 'chat') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await request('/picker/chat/messages?limit=100');
        const d = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const list = Array.isArray(d.messages) ? d.messages : [];
        const purged = teamChatPurgedRef.current;
        const fromServer = list.filter((m) => !purged.has(m.id));
        setChatMessages((prev) => {
          const serverIds = new Set(fromServer.map((m) => m.id));
          const pendingOut = prev.filter((m) => m.out && !serverIds.has(m.id));
          return [...fromServer, ...pendingOut];
        });
      } catch {
        /* tarmoq xatosi — mahalliy ro‘yxat saqlanadi */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, request]);

  /** Serverdagi yangi xabarlar (jumladan avto-bot javoblari) — chat yorlig‘ida */
  useEffect(() => {
    if (tab !== 'chat') return;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await request('/picker/chat/messages?limit=100');
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const list = Array.isArray(d.messages) ? d.messages : [];
        const purged = teamChatPurgedRef.current;
        const fromServer = list.filter((m) => !purged.has(m.id));
        setChatMessages((prev) => {
          const serverIds = new Set(fromServer.map((m) => m.id));
          const pendingOut = prev.filter((m) => m.out && !serverIds.has(m.id));
          return [...fromServer, ...pendingOut];
        });
      } catch {
        /* tarmoq */
      }
    };
    const id = setInterval(tick, 18000);
    return () => clearInterval(id);
  }, [tab, request]);

  useEffect(() => {
    if (!lichkaBootPeer) return;
    setDmActivePeer(lichkaBootPeer);
    setLichkaBootPeer(null);
  }, [lichkaBootPeer]);

  useEffect(() => {
    if (tab !== 'lichka') setDmActivePeer(null);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'lichka' && tab !== 'chat') return;
    let cancelled = false;
    (async () => {
      setDmPeersLoading(true);
      try {
        const res = await request('/picker/sklad-peers');
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        const apiPeers = (d.peers || []).map((p) => ({
          id: p.id,
          displayName: String(p.full_name || p.login || `#${p.id}`).trim(),
          roleLabel: String(p.role_label || '').trim(),
          login: p.login || '',
          email: p.email || '',
          phone: String(p.phone || '').trim(),
        }));
        const myshop = {
          id: 'myshop',
          displayName: pickerUiT.chatTeam,
          roleLabel: pickerUiT.dmRoleSupport,
        };
        setDmPeers([myshop, ...apiPeers]);
      } catch {
        if (!cancelled) {
          setDmPeers([
            {
              id: 'myshop',
              displayName: pickerUiT.chatTeam,
              roleLabel: pickerUiT.dmRoleSupport,
            },
          ]);
        }
      } finally {
        if (!cancelled) setDmPeersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, request, pickerUiT.chatTeam, pickerUiT.dmRoleSupport]);

  useEffect(() => {
    let room = null;
    if (tab === 'chat') room = 'sklad';
    else if (tab === 'lichka' && dmActivePeer?.id === 'myshop') room = 'operators';
    if (!room) {
      setSkladPresencePeers([]);
      return undefined;
    }
    let cancelled = false;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const res = await request(`/picker/chat/presence?room=${encodeURIComponent(room)}&staleSec=14`);
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSkladPresencePeers(Array.isArray(data.peers) ? data.peers : []);
      } catch {
        /* tarmoq */
      }
    };
    pull();
    const id = setInterval(pull, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab, dmActivePeer?.id, request]);

  const loadPackers = useCallback(async () => {
    try {
      const res = await request('/picker/packers');
      const data = await res.json().catch(() => ({}));
      setPackers(data.packers || []);
    } catch {
      setPackers([]);
    }
  }, [request]);

  const loadBalance = useCallback(async () => {
    try {
      const res = await request('/picker/balance');
      const data = await res.json().catch(() => ({}));
      setBalance(Number(data.balance) || 0);
    } catch {
      setBalance(0);
    }
  }, [request]);

  const loadHomeWithdrawalsOnly = useCallback(async () => {
    setHomeWithdrawalsLoading(true);
    try {
      const fRes = await request('/picker/finance');
      const fData = await fRes.json().catch(() => ({}));
      if (fRes.ok) {
        setHomeFinanceTransactions(Array.isArray(fData.transactions) ? fData.transactions : []);
        setHomeWithdrawals(Array.isArray(fData.withdrawals) ? fData.withdrawals : []);
      } else {
      const wRes = await request('/picker/withdrawals');
      const wData = await wRes.json().catch(() => ({}));
      if (wRes.ok) setHomeWithdrawals(Array.isArray(wData.withdrawals) ? wData.withdrawals : []);
      else setHomeWithdrawals([]);
        setHomeFinanceTransactions([]);
      }
    } catch {
      setHomeWithdrawals([]);
      setHomeFinanceTransactions([]);
    } finally {
      setHomeWithdrawalsLoading(false);
    }
  }, [request]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/picker/notifications');
      const data = await res.json().catch(() => ({}));
      setNotifications(data.notifications || []);
    } catch {
      setNotifications([]);
    }
  }, [request]);

  const handleWithdrawal = async () => {
    const amount = Number(String(withdrawalAmount).replace(/\s/g, '').replace(/,/g, '.'));
    setWithdrawalMessage('');
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawalFeedbackIsError(true);
      setWithdrawalMessage(pickerUiT.errWithdrawalInvalid);
      return;
    }
    if (amount > balance) {
      setWithdrawalFeedbackIsError(true);
      setWithdrawalMessage(pickerUiT.errWithdrawalInsufficient);
      return;
    }
    setWithdrawalBusy(true);
    try {
      const res = await request('/picker/withdrawal', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setWithdrawalAmount('');
        setWithdrawalFeedbackIsError(false);
        setWithdrawalMessage(data.message || pickerUiT.withdrawalSuccessDefault);
        loadBalance();
        loadHomeWithdrawalsOnly();
      } else {
        setWithdrawalFeedbackIsError(true);
        setWithdrawalMessage(data.error || pickerUiT.errWithdrawalFailed);
      }
    } catch (e) {
      setWithdrawalFeedbackIsError(true);
      setWithdrawalMessage(e.message || pickerUiT.errWithdrawalFailed);
    } finally {
      setWithdrawalBusy(false);
    }
  };

  const markNotificationRead = useCallback(async (id) => {
    try {
      await request(`/picker/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    } catch (_) {}
  }, [request]);

  const loadPending = useCallback(async () => {
    if (tab !== 'orders') return;
    setLoading(true);
    setError('');
    try {
      const res = await request('/picker/orders');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || pickerUiT.errLoadOrders);
      }
      const list = Array.isArray(data.orders) ? data.orders : [];
      setOrders(list.slice(0, 20));
    } catch (e) {
      setError(e.message || pickerUiT.errLoadData);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [request, pickerUiT, tab]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await request('/picker/orders?status=picked');
      if (!res.ok) throw new Error(pickerUiT.errLoadHistory);
      const data = await res.json();
      setHistoryOrders(data.orders || []);
    } catch (e) {
      if (tab === 'history') setError(e.message || pickerUiT.errLoadHistory);
    } finally {
      setHistoryLoading(false);
    }
  }, [request, tab, pickerUiT]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (tab === 'home') {
      loadBalance();
      loadHomeWithdrawalsOnly();
    }
  }, [tab, loadBalance, loadHomeWithdrawalsOnly]);

  useEffect(() => {
    if (tab !== 'profile') return undefined;
    let cancelled = false;
    setProfileError('');
    setProfileOk('');
    setProfileLoading(true);
    (async () => {
      try {
        const res = await request('/picker/profile');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || pickerUiT.errProfileLoad);
        if (cancelled) return;
        const p = data.profile || {};
        setProfileForm({
          full_name: p.full_name || '',
          email: p.email || '',
          login: p.login || '',
          phone: p.phone || '',
          password: '',
          password2: '',
          role_label: p.role_label || '',
        });
      } catch (e) {
        if (!cancelled) setProfileError(e.message || pickerUiT.errGeneric);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, request, pickerUiT]);

  useEffect(() => {
    if (notificationsOpen) loadNotifications();
  }, [notificationsOpen, loadNotifications]);

  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    const prev = meta.getAttribute('content');
    meta.setAttribute('content', '#047857');
    return () => {
      if (prev) meta.setAttribute('content', prev);
      else meta.remove();
    };
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const searchProducts = useCallback(async (query) => {
    if (!query.trim()) {
      setPrintProducts([]);
      return;
    }
    setPrintProductsLoading(true);
    try {
      const res = await request('/products?q=' + encodeURIComponent(query.trim()));
      const data = await res.json().catch(() => ({}));
      setPrintProducts(data.products || []);
    } catch {
      setPrintProducts([]);
    } finally {
      setPrintProductsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (tab !== 'print') return;
    const t = setTimeout(() => searchProducts(printSearchQuery), 350);
    return () => clearTimeout(t);
  }, [tab, printSearchQuery, searchProducts]);

  const setPrintQty = (productId, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setPrintQuantities((prev) => ({ ...prev, [productId]: n }));
  };

  const handleChekPrint = (product, quantity) => {
    const qty = Math.max(1, quantity || 1);
    setChekToPrint({ product: { id: product.id, name_uz: product.name_uz, price: product.price }, quantity: qty });
    const clearChek = () => setChekToPrint(null);
    let fallback = setTimeout(clearChek, 3000);
    const onAfterPrint = () => {
      clearChek();
      clearTimeout(fallback);
      window.removeEventListener('afterprint', onAfterPrint);
    };
    window.addEventListener('afterprint', onAfterPrint);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const handlePicked = async (orderId) => {
    setBusyId(orderId);
    setError('');
    try {
      const res = await request(`/picker/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'picked' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || pickerUiT.errStatusUpdate);
      await loadPending();
      if (tab === 'history' || tab === 'print') await loadHistory();
    } catch (e) {
      setError(e.message || pickerUiT.errGeneric);
    } finally {
      setBusyId(null);
    }
  };

  const handleHold = async () => {
    if (orders.length === 0) return;
    const orderId = orders[0].id;
    setBusyId(orderId);
    setError('');
    try {
      const res = await request(`/picker/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'hold' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || pickerUiT.errStatusUpdate);
      setOrders((prev) => prev.slice(1));
      await loadPending();
    } catch (e) {
      setError(e.message || pickerUiT.errGeneric);
    } finally {
      setBusyId(null);
    }
  };

  const handleTayyorClick = async () => {
    if (orders.length === 0) return;
    const orderId = orders[0].id;
    setBusyId(orderId);
    setError('');
    try {
      const res = await request(`/picker/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'picked' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || pickerUiT.errStatusUpdate);
      setPickedBatch([orderId]);
      setPackerModalAssignedOrderId(null);
      setOrders((prev) => prev.slice(1));
      void loadPackers();
        setShowPackerModal(true);
      if (tab === 'history') loadHistory();
    } catch (e) {
      setError(e.message || pickerUiT.errGeneric);
    } finally {
      setBusyId(null);
    }
  };

  const resetPackerAssignmentModal = useCallback(() => {
    setShowPackerModal(false);
    setPickedBatch([]);
    setPackerModalAssignedOrderId(null);
  }, []);

  const handlePackerModalDismiss = useCallback(() => {
    if (assigningPacker) return;
    if (packerModalAssignedOrderId != null) {
      resetPackerAssignmentModal();
      return;
    }
    if (pickedBatch.length > 0) {
      if (!window.confirm(pickerUiT.packerModalCloseUnassignedConfirm)) return;
    }
    resetPackerAssignmentModal();
  }, [
    assigningPacker,
    packerModalAssignedOrderId,
    pickedBatch.length,
    pickerUiT.packerModalCloseUnassignedConfirm,
    resetPackerAssignmentModal,
  ]);

  const handleAssignBatchToPacker = async (packerId) => {
    if (pickedBatch.length === 0) return;
    const orderIds = [...pickedBatch];
    setAssigningPacker(true);
    setError('');
    try {
      const res = await request('/picker/orders/assign-batch', {
        method: 'POST',
        body: JSON.stringify({ order_ids: orderIds, packer_id: packerId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || pickerUiT.errAssignBatch);
      const assigned = Number(d.assigned);
      if (!Number.isFinite(assigned) || assigned < 1) {
        throw new Error(d.error || pickerUiT.errAssignBatch);
      }
      const oid = orderIds[0];
      setPickedBatch([]);
      setPackerModalAssignedOrderId(Number.isFinite(Number(oid)) ? Number(oid) : oid);
      if (tab === 'history') loadHistory();
    } catch (e) {
      setError(e.message || pickerUiT.errGeneric);
    } finally {
      setAssigningPacker(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileOk('');
    if (profileForm.password.trim() && profileForm.password.trim() !== profileForm.password2.trim()) {
      setProfileError('Parollar mos kelmayapti.');
      return;
    }
    setProfileSaving(true);
    try {
      const body = {
        full_name: profileForm.full_name.trim(),
        email: profileForm.email.trim(),
        login: profileForm.login.trim(),
        phone: profileForm.phone.trim(),
        role_label: profileForm.role_label.trim(),
      };
      if (profileForm.password.trim()) {
        body.password = profileForm.password.trim();
      }
      const res = await request('/picker/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || pickerUiT.errProfileSave);
      setProfileForm((prev) => ({ ...prev, password: '', password2: '' }));
      setProfileOk(pickerUiT.profileSaved);
      await retrySession();
    } catch (err) {
      setProfileError(err.message || pickerUiT.errGeneric);
    } finally {
      setProfileSaving(false);
    }
  };

  const name = user?.full_name || 'Picker';
  const pickerChatNick = (user?.full_name || user?.login || 'Picker').trim();
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  /** Chat / lichka: pastki tab navigatsiyasi va telegram-layout (lichka ro‘yxatida ham). */
  const telegramMainLayout = tab === 'chat' || tab === 'lichka';
  /** MyShop chat/lichka to‘liq ekran: umumiy topbar yashiriladi. */
  const fullBleedMessaging = telegramMainLayout;

  const openTeamLichka = useCallback(() => {
    setTab('lichka');
    setLichkaBootPeer({
      id: 'myshop',
      displayName: pickerUiT.chatTeam,
      roleLabel: pickerUiT.dmRoleSupport,
    });
    setSidePanelOpen(false);
  }, [pickerUiT.chatTeam, pickerUiT.dmRoleSupport]);

  const openMyShopGroupPanel = useCallback(() => {
    setMyShopGroupSection('members');
    setMyShopGroupOpen(true);
  }, []);

  const onSkladThreadPurge = useCallback((id) => {
    teamChatPurgedRef.current.add(id);
    setChatMessages((prev) => prev.filter((x) => x.id !== id));
    setDmThreads((prev) => ({
      ...prev,
      myshop: (prev.myshop || []).filter((x) => x.id !== id),
    }));
  }, []);

  const showPending = tab === 'orders';
  const showHistory = tab === 'history';
  const showPrint = tab === 'print';

  const historyProductGroups = useMemo(
    () => aggregatePickerHistoryByProduct(historyOrders),
    [historyOrders]
  );

  const handlePickerLogout = useCallback(() => {
    setSidePanelOpen(false);
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const goSideNav = (id) => {
    setTab(id);
    setSidePanelOpen(false);
    if (id === 'lichka') setDmActivePeer(null);
  };

  return (
    <div className="picker-app picker-mobile">
      <div
        className={`picker-phone-frame${fullBleedMessaging ? ' picker-phone-frame--no-topbar' : ''}`}
      >
        {!fullBleedMessaging && (
        <header className="picker-topbar no-print">
          <StaffTopbarCenterId />
          <div className="picker-topbar-inner">
            <button
              type="button"
              className="picker-topbar-hamburger picker-topbar-hamburger--mobile"
              onClick={() => setSidePanelOpen((v) => !v)}
              aria-label={sidePanelOpen ? pickerUiT.ariaSideClose : pickerUiT.ariaSideOpen}
              aria-expanded={sidePanelOpen}
            >
              <span className="picker-hamburger-icon" />
            </button>
            <button
              type="button"
              className="picker-topbar-menu-desktop"
              onClick={() => setSidePanelOpen((v) => !v)}
              aria-label={sidePanelOpen ? pickerUiT.ariaSideClose : pickerUiT.ariaSideOpen}
              aria-expanded={sidePanelOpen}
            >
              {pickerUiT.sideMenuTitle}
            </button>
            <span className="picker-topbar-logo">{pickerUiT.topbarBrand}</span>
            <div className="picker-topbar-right">
              <StaffNotificationBell
                t={pickerUiT}
                notificationsEnabled={notificationsEnabled}
                notificationsOpen={notificationsOpen}
                setNotificationsOpen={setNotificationsOpen}
                unreadCount={unreadCount}
                notifications={notifications}
                onMarkRead={markNotificationRead}
                formatDateTime={formatWhen}
                onBellOpenChange={(open) => {
                  if (open) setProfileMenuOpen(false);
                }}
                onDismiss={async (n) => {
                  if (!n.read_at) await markNotificationRead(n.id);
                }}
              />
              <div className="picker-topbar-profile-slot">
                <StaffTopbarProfileMenu
                  name={name}
                  open={profileMenuOpen}
                  onOpenChange={(next) => {
                    setProfileMenuOpen(next);
                    if (next) setNotificationsOpen(false);
                  }}
                  labels={{
                    home: pickerUiT.navHome,
                    profile: pickerUiT.navProfile,
                    settings: pickerUiT.navSettings,
                    logout: pickerUiT.logout,
                  }}
                  onHome={() => {
                    setSidePanelOpen(false);
                    navigate('/');
                  }}
                  onProfile={() => {
                    setTab('profile');
                    setSidePanelOpen(false);
                  }}
                  onSettings={() => {
                    setTab('settings');
                    setSidePanelOpen(false);
                  }}
                  onLogout={handlePickerLogout}
                />
                    </div>
            </div>
          </div>
        </header>
        )}

        <aside
          className={`picker-side-panel staff-side-panel-ref ${sidePanelOpen ? 'open' : ''}`}
          aria-hidden={!sidePanelOpen}
        >
          <div className="picker-side-panel-inner">
            <div className="staff-side-panel-head">
              <div className="staff-side-panel-brand">
                <span className="staff-side-panel-logo-icon" aria-hidden>
                  📦
                </span>
                <div className="staff-side-panel-logo-text">
                  <span>MyShop</span>
                  <small>PICKER PANELI</small>
              </div>
            </div>
          </div>
            <p className="courier-side-intro staff-side-intro">
              <strong>{name}</strong>{' '}
              <span className="courier-side-meta">Balans: {formatMoney(balance)}</span>
            </p>
            <nav className="picker-side-panel-nav" aria-label={pickerUiT.sideNavAria}>
              {sideNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`picker-side-panel-item ${tab === item.id ? 'picker-side-panel-item-active' : ''}`}
                  onClick={() => goSideNav(item.id)}
                  aria-label={item.label}
                >
                  <span
                    className={`picker-side-panel-item-icon${item.id === 'chat' ? ' courier-side-nav-tg-plane' : ''}`}
                    aria-hidden
                  >
                    {item.icon}
                    </span>
                      <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="picker-side-panel-footer">
              <button type="button" className="picker-side-panel-logout" onClick={handlePickerLogout}>
                {pickerUiT.logout}
              </button>
                <button
                  type="button"
                className={`picker-side-panel-theme-row${isDark ? ' picker-side-panel-theme-row--moon' : ''}`}
                  onClick={toggleTheme}
                aria-label={isDark ? pickerUiT.themeMoonLabel : pickerUiT.themeSunLabel}
              >
                <span className="staff-side-theme-icon" aria-hidden>
                  {isDark ? '🌙' : '☀️'}
                </span>
              </button>
            </div>
          </div>
        </aside>
        <div className={`picker-side-panel-overlay ${sidePanelOpen ? 'show' : ''}`} aria-hidden={!sidePanelOpen} onClick={() => setSidePanelOpen(false)} />

        {showPrint && (
          <div className="picker-print-search-wrap no-print">
          <input
            type="search"
            className="picker-print-search"
            placeholder={pickerUiT.printSearchPlaceholder}
            value={printSearchQuery}
            onChange={(e) => setPrintSearchQuery(e.target.value)}
            aria-label={pickerUiT.printSearchAria}
          />
          </div>
        )}

        <main className={`picker-main ${telegramMainLayout ? 'picker-main--telegram' : ''}`}>
          <StaffAdvanceConfirm />
        {tab === 'profile' && (
          <section className="picker-subpage">
            <h1 className="picker-title">{pickerUiT.profileTitle}</h1>
            <p className="picker-profile-intro">
              {pickerUiT.profileIntro}
            </p>
            <div className="picker-profile-card">
              {profileLoading ? (
                <div className="picker-profile-loading">
                  <span className="picker-spinner" aria-hidden />
                  <span>{pickerUiT.profileLoading}</span>
                </div>
              ) : (
                <form className="picker-profile-form staff-account-touch" onSubmit={handleProfileSave}>
                  {profileError && (
                    <div className="picker-profile-alert picker-profile-alert--error" role="alert">
                      {profileError}
                    </div>
                  )}
                  {profileOk && (
                    <div className="picker-profile-alert picker-profile-alert--ok" role="status">
                      {profileOk}
                    </div>
                  )}
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">{pickerUiT.profileName}</span>
                    <input
                      type="text"
                      className="picker-profile-input"
                      value={profileForm.full_name}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, full_name: ev.target.value }))}
                      autoComplete="name"
                      required
                    />
                  </label>
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">{pickerUiT.profileEmail}</span>
                    <input
                      type="email"
                      className="picker-profile-input"
                      value={profileForm.email}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, email: ev.target.value }))}
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">{pickerUiT.profileLogin}</span>
                    <input
                      type="text"
                      className="picker-profile-input"
                      value={profileForm.login}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, login: ev.target.value }))}
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">{pickerUiT.profilePhone}</span>
                    <input
                      type="tel"
                      className="picker-profile-input"
                      value={profileForm.phone}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, phone: ev.target.value }))}
                      placeholder="+998901234567"
                      autoComplete="tel"
                    />
                  </label>
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">{pickerUiT.profileRoleLabel}</span>
                    <input
                      type="text"
                      className="picker-profile-input"
                      value={profileForm.role_label}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, role_label: ev.target.value }))}
                      placeholder={pickerUiT.profilePlaceholderRole}
                    />
                    <span className="picker-profile-hint">
                      {pickerUiT.profileRoleHint} <strong>{user?.role || 'picker'}</strong> {pickerUiT.profileRoleHintFixed}
                    </span>
                  </label>
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">{pickerUiT.profilePassword}</span>
                    <input
                      type="password"
                      className="picker-profile-input"
                      value={profileForm.password}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, password: ev.target.value }))}
                      autoComplete="new-password"
                      placeholder={pickerUiT.profilePasswordPh}
                    />
                    <span className="picker-profile-hint">{pickerUiT.profilePasswordHint}</span>
                  </label>
                  <label className="picker-profile-field">
                    <span className="picker-profile-label">Parolni takrorlang</span>
                    <input
                      type="password"
                      className="picker-profile-input"
                      value={profileForm.password2}
                      onChange={(ev) => setProfileForm((p) => ({ ...p, password2: ev.target.value }))}
                      autoComplete="new-password"
                    />
                  </label>
                  <button
                    type="submit"
                    className="picker-btn picker-btn-primary picker-profile-submit"
                    disabled={profileSaving}
                  >
                    {profileSaving ? pickerUiT.profileSaving : pickerUiT.profileSave}
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="picker-subpage">
            <h1 className="picker-title">{pickerUiT.settingsTitle}</h1>
            <div className="picker-settings-card">
              <p className="picker-settings-hint">{pickerUiT.themeHint}</p>

              <div className="picker-settings-row picker-settings-row--toggle">
                <div className="picker-settings-row-text">
                  <span className="picker-settings-row-title">{pickerUiT.notifLabel}</span>
                  <p className="picker-settings-sub">{pickerUiT.notifSub}</p>
                </div>
                <button
                  type="button"
                  className={`picker-ios-theme-toggle picker-settings-notif-toggle ${notificationsEnabled ? 'picker-ios-theme-toggle-dark' : ''}`}
                  role="switch"
                  aria-checked={notificationsEnabled}
                  aria-label={pickerUiT.notifLabel}
                  onClick={() => {
                    const next = !notificationsEnabled;
                    setNotificationsEnabled(next);
                    if (next && systemNotificationsSupported() && Notification.permission === 'default') {
                      void requestSystemNotificationPermission();
                    }
                  }}
                >
                  <span className="picker-ios-theme-thumb" />
                </button>
              </div>
              <p className="picker-settings-status-line">
                <span className={notificationsEnabled ? 'picker-settings-on' : 'picker-settings-off'}>
                  {notificationsEnabled ? pickerUiT.notifOn : pickerUiT.notifOff}
                </span>
              </p>

              <div className="picker-settings-row picker-settings-row--lang">
                <span className="picker-settings-row-title">{pickerUiT.langLabel}</span>
                <select
                  className="picker-settings-lang-select"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  aria-label={pickerUiT.langLabel}
                >
                  <option value="uz">{pickerUiT.langUz}</option>
                  <option value="ru">{pickerUiT.langRu}</option>
                  <option value="en">{pickerUiT.langEn}</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {tab === 'chat' && (
          <div className="picker-tg-chat picker-lichka--flex-mount" dir="ltr" role="region" aria-label={pickerUiT.chatRegionAria}>
            <header className="picker-tg-head">
              <button
                type="button"
                className="picker-tg-head-hamburger"
                onClick={() => setSidePanelOpen((v) => !v)}
                aria-label={sidePanelOpen ? pickerUiT.ariaSideClose : pickerUiT.ariaSideOpen}
                aria-expanded={sidePanelOpen}
              >
                <span className="picker-hamburger-icon" />
              </button>
              <div className="picker-tg-head-avatar" aria-hidden>
                <span>MS</span>
              </div>
              <div className="picker-tg-head-text">
                <div
                  className="picker-tg-head-title picker-tg-head-title--tap"
                  role="button"
                  tabIndex={0}
                  onClick={() => openMyShopGroupPanel()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openMyShopGroupPanel();
                    }
                  }}
                >
                  {pickerUiT.chatTeam}
                </div>
                <div
                  className={`picker-tg-head-status ${skladPresenceSubtitle ? 'picker-tg-head-status--presence' : ''}`}
                >
                  {skladPresenceSubtitle || pickerUiT.chatOnline}
                </div>
              </div>
              <div className="picker-tg-head-actions">
                <button type="button" className="picker-tg-icon-btn" aria-label={pickerUiT.chatSearch}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                </button>
                <button type="button" className="picker-tg-icon-btn" aria-label={pickerUiT.chatMenu}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
              </div>
            </header>

            <div className="picker-tg-body">
              <div className="picker-tg-pattern" aria-hidden />
              <div className="picker-tg-scroll" ref={chatListRef}>
                <div className="picker-tg-date-pill">{pickerUiT.chatToday}</div>
                {visibleChatMessages.length === 0 ? (
                  <p className="picker-lichka-empty-thread picker-tg-empty-chat">{pickerUiT.chatEmptyTeam}</p>
                ) : null}
                {visibleChatMessages.map((m) => {
                  const isOut = pickerMsgIsOutgoing(m);
                  const isVideoNote = m.type === 'video' && m.videoNote;
                  const bareMedia =
                    !isVideoNote && ['image', 'audio', 'video'].includes(String(m.type || ''));
                  const msgNick = (m.senderNick || (isOut ? pickerChatNick : pickerUiT.chatBrandName)).trim();
                  const initials = pickerNickInitials(msgNick);
                  const avatarEl = !isOut ? (
                    <button
                      type="button"
                      className="picker-tg-avatar-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTeamLichka();
                      }}
                      title={pickerUiT.lichkaOpenTeamHint}
                      aria-label={pickerUiT.lichkaOpenTeamAria}
                    >
                      <span
                        className={`picker-tg-avatar picker-tg-avatar--in`}
                        aria-hidden
                      >
                        <span className="picker-tg-avatar-text">{initials}</span>
                      </span>
                    </button>
                  ) : (
                    <div
                      className={`picker-tg-avatar ${isOut ? 'picker-tg-avatar--out' : 'picker-tg-avatar--in'}`}
                      title={msgNick}
                      aria-label={msgNick}
                    >
                      <span className="picker-tg-avatar-text">{initials}</span>
                    </div>
                  );
                  const bubbleEl = (
                    <div
                      role="button"
                      tabIndex={0}
                      className={`picker-tg-bubble ${isOut ? 'picker-tg-bubble-out' : 'picker-tg-bubble-in'} ${m.type && m.type !== 'text' && !isVideoNote ? 'picker-tg-bubble--media' : ''} ${bareMedia ? 'picker-tg-bubble--bare-media' : ''} ${isVideoNote ? `picker-tg-bubble--video-note${m.replyTo ? ' picker-tg-bubble--video-note-reply' : ''}` : ''}`}
                      onPointerDown={(e) => onChatMessagePointerDown(e, m)}
                      onPointerMove={onChatMessagePointerMove}
                      onPointerUp={onChatMessagePointerUp}
                      onPointerCancel={onChatMessagePointerUp}
                      onContextMenu={(e) => onChatMessageContextMenu(e, m)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setChatReplyTo({
                            id: m.id,
                            snippet: pickerMessageSnippet(m, pickerUiT),
                            type: m.type || 'text',
                            out: isOut,
                            senderNick: chatReplyAuthorNick({ ...m, out: isOut }, pickerChatNick, pickerUiT.chatBrandName),
                          });
                        }
                      }}
                    >
                      {m.replyTo && (
                        <button
                          type="button"
                          className="picker-tg-reply-quote"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rt = m.replyTo;
                            const name = chatReplyAuthorNick(
                              { senderNick: rt.senderNick, out: rt.out },
                              pickerChatNick,
                              pickerUiT.chatBrandName
                            );
                            const initials = pickerNickInitials(name);
                            const isPicker = !!rt.out;
                            setChatAuthorProfile({
                              replyMsgId: String(rt.id),
                              name,
                              initials,
                              isPicker,
                              subtitle: isPicker
                                ? pickerUiT.chatReplyProfileRolePicker
                                : pickerUiT.chatReplyProfileRoleBrand,
                              login: isPicker ? String(user?.login || '').trim() : '',
                              email: isPicker ? String(user?.email || '').trim() : '',
                              teamHint: !isPicker ? pickerUiT.chatReplyProfileBrandHint : '',
                            });
                          }}
                        >
                          <span className="picker-tg-reply-quote-bar" aria-hidden />
                          <span className="picker-tg-reply-quote-inner">
                            <span className="picker-tg-reply-quote-name">
                              {m.replyTo.senderNick && String(m.replyTo.senderNick).trim()
                                ? m.replyTo.senderNick
                                : m.replyTo.out
                                  ? pickerUiT.chatYou
                                  : pickerUiT.chatBrandName}
                            </span>
                            <span className="picker-tg-reply-quote-snippet">{m.replyTo.snippet}</span>
                          </span>
                        </button>
                      )}
                      <div
                        className={`picker-tg-bubble-inner ${m.type && m.type !== 'text' && !isVideoNote ? 'picker-tg-bubble-inner--stack' : ''} ${bareMedia ? 'picker-tg-bubble-inner--bare-media' : ''} ${isVideoNote ? 'picker-tg-bubble-inner--video-note' : ''}`}
                      >
                        <div
                          className={`picker-tg-bubble-content${
                            m.type && m.type !== 'text' && !isVideoNote ? '' : ' picker-tg-bubble-content--text-row'
                          }`}
                        >
                          {m.type === 'audio' && m.mediaUrl && (
                            <PickerChatAudio
                              src={resolveStaffChatMediaUrl(m.mediaUrl)}
                              playAria={pickerUiT.chatAudioPlayAria}
                              pauseAria={pickerUiT.chatAudioPauseAria}
                            />
                          )}
                          {m.type === 'video' && m.mediaUrl && isVideoNote && (
                            <PickerVideoNote
                              src={resolveStaffChatMediaUrl(m.mediaUrl)}
                              out={isOut}
                              sentTitle={pickerUiT.chatSent}
                              playAria={pickerUiT.composeVideoNotePlayAria}
                            />
                          )}
                          {m.type === 'video' && m.mediaUrl && !isVideoNote && (
                            <PickerChatInlineVideo
                              src={resolveStaffChatMediaUrl(m.mediaUrl)}
                              playAria={pickerUiT.chatInlineVideoPlayAria}
                            />
                          )}
                          {m.type === 'image' && m.mediaUrl && (
                            <div
                              role="button"
                              tabIndex={0}
                              className="picker-tg-msg-img-wrap"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChatImageLightbox(resolveStaffChatMediaUrl(m.mediaUrl));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setChatImageLightbox(resolveStaffChatMediaUrl(m.mediaUrl));
                                }
                              }}
                            >
                              <img src={resolveStaffChatMediaUrl(m.mediaUrl)} alt="" className="picker-tg-msg-img" />
                            </div>
                          )}
                          {m.type === 'file' && m.mediaUrl && (
                            <a
                              href={resolveStaffChatMediaUrl(m.mediaUrl)}
                              download={m.fileName}
                              className="picker-tg-msg-file"
                            >
                              📎 {m.fileName || pickerUiT.chatSnippetFileFallback}
                            </a>
                          )}
                          {(m.type === 'text' || !m.type) && m.text != null && (
                            <p className="picker-tg-bubble-text">{m.text}</p>
                          )}
                          {!isVideoNote && (
                            <span className="picker-tg-meta">
                              <span className="picker-tg-time">{m.time}{m.durationSec ? ` · ${m.durationSec}s` : ''}</span>
                              {isOut && (
                                <span className="picker-tg-checks" aria-hidden title={pickerUiT.chatSent}>
                                  <svg width="19" height="11" viewBox="0 0 19 11" fill="none" className="picker-tg-check-svg">
                                    <path d="M1 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M7 5.5l2.5 2.5L18 1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  return (
                  <div
                    key={m.id}
                    data-picker-msg={m.id}
                    className={`picker-tg-row ${isOut ? 'picker-tg-row-out' : 'picker-tg-row-in'}`}
                  >
                    <div className={`picker-tg-row-cluster ${isOut ? 'picker-tg-row-cluster--out' : 'picker-tg-row-cluster--in'}`}>
                      {isOut ? (
                        <>
                          {bubbleEl}
                          {avatarEl}
                        </>
                      ) : (
                        <>
                          {avatarEl}
                          {bubbleEl}
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {chatToast && <div className="picker-tg-toast" role="status">{chatToast}</div>}

            {chatImageLightbox ? (
              <div
                className="picker-tg-img-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={pickerUiT.chatImageLightboxAria}
                onClick={() => setChatImageLightbox('')}
              >
                <button
                  type="button"
                  className="picker-tg-img-lightbox-close"
                  aria-label={pickerUiT.chatImageLightboxClose}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChatImageLightbox('');
                  }}
                >
                  ×
                </button>
                <img
                  src={chatImageLightbox}
                  alt=""
                  className="picker-tg-img-lightbox-img"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ) : null}

            {chatAuthorProfile && (
              <div
                className="picker-modal-overlay picker-chat-author-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="picker-chat-author-title"
                onClick={() => setChatAuthorProfile(null)}
              >
                <div className="picker-modal picker-chat-author-modal" onClick={(e) => e.stopPropagation()}>
                  <div
                    className={`picker-chat-author-avatar ${chatAuthorProfile.isPicker ? 'picker-chat-author-avatar--picker' : 'picker-chat-author-avatar--brand'}`}
                    aria-hidden
                  >
                    <span>{chatAuthorProfile.initials}</span>
                  </div>
                  <h2 id="picker-chat-author-title" className="picker-chat-author-name">
                    {chatAuthorProfile.name}
                  </h2>
                  <p className="picker-chat-author-subtitle">{chatAuthorProfile.subtitle}</p>
                  {chatAuthorProfile.isPicker && (chatAuthorProfile.login || chatAuthorProfile.email) ? (
                    <dl className="picker-chat-author-meta">
                      {chatAuthorProfile.login ? (
                        <>
                          <dt>{pickerUiT.chatReplyProfileLogin}</dt>
                          <dd>{chatAuthorProfile.login}</dd>
                        </>
                      ) : null}
                      {chatAuthorProfile.email ? (
                        <>
                          <dt>{pickerUiT.chatReplyProfileEmail}</dt>
                          <dd>{chatAuthorProfile.email}</dd>
                        </>
                      ) : null}
                    </dl>
                  ) : null}
                  {chatAuthorProfile.isPicker && !chatAuthorProfile.login && !chatAuthorProfile.email ? (
                    <p className="picker-modal-hint picker-chat-author-hint">{pickerUiT.chatReplyProfilePickerHint}</p>
                  ) : null}
                  {!chatAuthorProfile.isPicker && chatAuthorProfile.teamHint ? (
                    <p className="picker-modal-hint picker-chat-author-hint">{chatAuthorProfile.teamHint}</p>
                  ) : null}
                  <div className="picker-modal-actions picker-chat-author-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        const id = String(chatAuthorProfile.replyMsgId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        document.querySelector(`[data-picker-msg="${id}"]`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        });
                        setChatAuthorProfile(null);
                      }}
                    >
                      {pickerUiT.chatReplyProfileGoToMsg}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setChatAuthorProfile(null)}>
                      {pickerUiT.modalClose}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {chatActionMenu && (
              <>
                <div className="picker-tg-menu-backdrop" onClick={() => setChatActionMenu(null)} aria-hidden />
                <div
                  className="picker-tg-action-sheet"
                  role="dialog"
                  aria-labelledby="picker-chat-actions-title"
                >
                  {chatActionMenu.step === 'delete' ? (
                    <>
                      <div id="picker-chat-actions-title" className="picker-tg-action-sheet-title">
                        {pickerUiT.chatDeleteChooseTitle}
                      </div>
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn"
                        onClick={() => {
                          const msg = chatActionMenu.message;
                          setHiddenChatMessageIds((prev) => [...new Set([...prev, msg.id])]);
                          setChatActionMenu(null);
                          if (chatReplyTo?.id === msg.id) setChatReplyTo(null);
                        }}
                      >
                        {pickerUiT.chatDeleteForMe}
                      </button>
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--danger"
                        onClick={() => {
                          const id = chatActionMenu.message.id;
                          teamChatPurgedRef.current.add(id);
                          setChatMessages((prev) => prev.filter((x) => x.id !== id));
                          setDmThreads((prev) => ({
                            ...prev,
                            myshop: (prev.myshop || []).filter((x) => x.id !== id),
                          }));
                          setHiddenChatMessageIds((prev) => prev.filter((hid) => hid !== id));
                          setChatActionMenu(null);
                          if (chatReplyTo?.id === id) setChatReplyTo(null);
                        }}
                      >
                        {pickerUiT.chatDeleteRemoveFromChat}
                      </button>
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--muted"
                        onClick={() => setChatActionMenu((prev) => (prev ? { ...prev, step: 'menu' } : null))}
                      >
                        {pickerUiT.chatDeleteBack}
                      </button>
                    </>
                  ) : (
                    <>
                      <div id="picker-chat-actions-title" className="picker-tg-action-sheet-title">
                        {pickerUiT.chatActionTitle}
                      </div>
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn"
                        onClick={() => {
                          const msg = chatActionMenu.message;
                          setChatReplyTo({
                            id: msg.id,
                            snippet: pickerMessageSnippet(msg, pickerUiT),
                            type: msg.type || 'text',
                            out: msg.out,
                            senderNick: chatReplyAuthorNick(msg, pickerChatNick, pickerUiT.chatBrandName),
                          });
                          setChatActionMenu(null);
                        }}
                      >
                        {pickerUiT.chatReply}
                      </button>
                      {!chatActionMenu.message.out && (
                        <button
                          type="button"
                          className="picker-tg-action-sheet-btn"
                          onClick={() => {
                            setChatActionMenu(null);
                            openTeamLichka();
                          }}
                        >
                          {pickerUiT.lichkaOpenFromChat}
                        </button>
                      )}
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn"
                        onClick={async () => {
                          const msg = chatActionMenu.message;
                          try {
                            await navigator.clipboard.writeText(pickerCopyableText(msg, pickerUiT));
                            setChatToast(pickerUiT.chatCopyOk);
                            setTimeout(() => setChatToast(''), 2000);
                          } catch {
                            setChatToast(pickerUiT.chatCopyFail);
                            setTimeout(() => setChatToast(''), 2500);
                          }
                          setChatActionMenu(null);
                        }}
                      >
                        {pickerUiT.chatCopyAction}
                      </button>
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--danger"
                        onClick={() => setChatActionMenu((prev) => (prev ? { ...prev, step: 'delete' } : null))}
                      >
                        {pickerUiT.chatDelete}
                      </button>
                      <button
                        type="button"
                        className="picker-tg-action-sheet-btn picker-tg-action-sheet-btn--muted"
                        onClick={() => setChatActionMenu(null)}
                      >
                        {pickerUiT.chatCancel}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {chatMediaUploadErr ? (
              <p className="picker-chat-media-err" role="alert">
                {chatMediaUploadErr}
              </p>
            ) : null}
            <PickerChatCompose
              t={pickerUiT}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSendText={sendChatMessage}
              onAddMessage={appendChatMessage}
              scrollToBottom={scrollChatToBottom}
              replyTo={chatReplyTo}
              onClearReply={() => setChatReplyTo(null)}
              onSkladPresence={sendSkladPresence}
            />
          </div>
        )}

        {tab === 'lichka' && (
          <PickerLichka
            t={pickerUiT}
            request={request}
            peers={dmPeers}
            peersLoading={dmPeersLoading}
            activePeer={dmActivePeer}
            setActivePeer={setDmActivePeer}
            threads={dmThreads}
            setThreads={setDmThreads}
            pickerChatNick={pickerChatNick}
            skladPurgedRef={teamChatPurgedRef}
            onOpenMyShopGroup={openMyShopGroupPanel}
            onSkladThreadPurge={onSkladThreadPurge}
            skladPresenceSubtitle={skladPresenceSubtitle}
            onSkladPresence={sendOperatorsPresence}
            teamChatRoom="operators"
            listSubtitleOverride={pickerUiT.myshopOperatorsGroupSubtitle}
            onOpenSidePanel={() => setSidePanelOpen(true)}
            staffUserId={user?.id}
          />
        )}

        {tab === 'home' && (
          <>
            <div className="picker-home-stack">
              <section className="picker-withdrawal-card">
                <h2 className="picker-withdrawal-title">{pickerUiT.homeWithdrawTitle}</h2>
                <p className="picker-withdrawal-balance">
                  {pickerUiT.homeWithdrawAvailable} <strong>{formatMoney(balance)}</strong>
                </p>
                <div className="picker-withdrawal-row">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="picker-withdrawal-input"
                    placeholder={pickerUiT.homeWithdrawPlaceholder}
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    disabled={withdrawalBusy}
                    aria-label={pickerUiT.homeWithdrawAria}
                  />
                  <button
                    type="button"
                    className="picker-btn picker-btn-primary"
                    disabled={withdrawalBusy}
                    onClick={handleWithdrawal}
                  >
                    {withdrawalBusy ? '...' : pickerUiT.homeWithdrawSend}
                  </button>
                </div>
                {withdrawalMessage && (
                  <p className={`picker-withdrawal-msg ${withdrawalFeedbackIsError ? 'error' : 'success'}`}>{withdrawalMessage}</p>
                )}
              </section>

              <div className="picker-home-summary-card">
                      <button
                        type="button"
                  className="picker-home-tx-toggle-btn"
                  aria-expanded={homeTxHistoryOpen}
                  aria-controls="picker-home-tx-panel"
                  onClick={() => setHomeTxHistoryOpen((open) => !open)}
                >
                  {pickerUiT.homeTxHistoryBtn}
                      </button>
                {homeTxHistoryOpen ? (
                <div
                  className="picker-home-panel picker-home-panel--single"
                    id="picker-home-tx-panel"
                    role="region"
                    aria-label={pickerUiT.homeTabTx}
                  >
                      {homeWithdrawalsLoading ? (
                        <p className="picker-home-panel-muted">{pickerUiT.loading}</p>
                    ) : (
                      <StaffTransactionTimeline
                        transactions={homeFinanceTransactions}
                        title={pickerUiT.homeTabTx}
                        emptyText={pickerUiT.noTx}
                      />
                    )}
                                </div>
                        ) : null}
                  </div>
                </div>
          </>
        )}

        {tab === 'orders' && (
          <section className="picker-hero">
            <h1 className="picker-title">{pickerUiT.ordersTitle}</h1>
            <p className="picker-subtitle">{pickerUiT.ordersSubtitle}</p>
            <div className="picker-stats">
              <span className="picker-stat">
                {orders.length} {pickerUiT.ordersUnit}
              </span>
            </div>
          </section>
        )}

        {error && (
          <div className="picker-error no-print" role="alert">
            {error}
          </div>
        )}

        {showPending && (
          <>
            {loading ? (
              <div className="picker-loading">
                <span className="picker-spinner" aria-hidden="true" />
                <p>{pickerUiT.loading}</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="picker-empty">
                <span className="picker-empty-icon">✓</span>
                <p>{pickerUiT.noPickupOrders}</p>
                <button type="button" className="picker-btn picker-btn-secondary" onClick={loadPending}>
                  {pickerUiT.refresh}
                </button>
              </div>
            ) : orders[0] ? (
              <div className="picker-list">
                <OrderCard
                  key={orders[0].id}
                  order={orders[0]}
                  onPicked={handlePicked}
                  busyId={busyId}
                  t={pickerUiT}
                  formatMoney={formatMoney}
                  formatWhen={formatWhen}
                  showPickedButton={true}
                  footerLeft={
                    <button type="button" className="picker-btn picker-btn-hold" onClick={() => void handleHold()} disabled={busyId != null}>
                      {pickerUiT.holdBtn}
                    </button>
                  }
                  footerRight={
                    <button type="button" className="picker-btn picker-btn-primary" onClick={handleTayyorClick}>
                      {pickerUiT.readyBtn}
                    </button>
                  }
                />
                <p className="picker-queue-hint">
                  {orders.length > 1
                    ? `${pickerUiT.queueLabel} 1 / ${orders.length} — ${pickerUiT.queueNext} ${orders.length - 1} ${pickerUiT.ordersUnit}`
                    : `${pickerUiT.queueLabel} 1 / 1`}
                </p>
              </div>
            ) : (
              <div className="picker-empty">
                <span className="picker-empty-icon">✓</span>
                <p>{pickerUiT.ordersLoadingMore}</p>
                <button type="button" className="picker-btn picker-btn-secondary" onClick={loadPending}>
                  {pickerUiT.refresh}
                </button>
              </div>
            )}
          </>
        )}

        {showHistory && (
          <>
            {historyLoading ? (
              <div className="picker-loading">
                <span className="picker-spinner" aria-hidden="true" />
                <p>{pickerUiT.loading}</p>
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="picker-empty">
                <span className="picker-empty-icon">📅</span>
                <p>{pickerUiT.historyEmpty}</p>
                <button type="button" className="picker-btn picker-btn-secondary" onClick={loadHistory}>
                  {pickerUiT.refresh}
                </button>
              </div>
            ) : (
              <div className="picker-list">
                {historyOrders.map((o) => (
                  <article key={o.id} className="picker-card picker-order-block" style={{ border: '1px dashed var(--border, #e2e8f0)', borderRadius: '16px', background: 'var(--bg-card, #ffffff)' }}>
                    <div className="picker-card-header" style={{ background: 'transparent', borderBottom: '1px dashed var(--border, #e2e8f0)' }}>
                      <span className="picker-card-id" style={{ fontWeight: 'bold' }}>
                        {pickerUiT.orderZakaz} #{o.id}
                      </span>
                      <span className="picker-card-date">{formatWhen(o.created_at)}</span>
                    </div>
                    <div className="picker-card-body">
                      <ul className="picker-order-items" aria-label={pickerUiT.orderZakaz}>
                        {o.items?.map((i) => {
                          const img = resolvePickerProductImageUrl(i.image_url);
                          return (
                            <li key={i.id} className="picker-order-item-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                              <div className="picker-order-item-thumb" style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--bg-muted, #f8fafc)', flexShrink: 0 }}>
                                {img ? (
                                  <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span className="picker-order-item-thumb-ph" aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />
                                )}
                              </div>
                              <span className="picker-order-item-name" style={{ flexGrow: 1, fontSize: '0.95rem' }}>{i.name_uz}</span>
                              <span className="picker-order-item-qty" style={{ fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                                {i.quantity} {pickerUiT.orderPcs}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {showPrint && (
          <div className="picker-print-view">
            <p className="picker-print-hint">{pickerUiT.printHint}</p>
            {printProductsLoading ? (
              <div className="picker-loading">
                <span className="picker-spinner" aria-hidden="true" />
                <p>{pickerUiT.printSearching}</p>
              </div>
            ) : printProducts.length === 0 ? (
              <p className="picker-print-empty">
                {printSearchQuery.trim() ? pickerUiT.printNotFound : pickerUiT.printTypeSearch}
              </p>
            ) : (
              <ul className="picker-print-product-list">
                {printProducts.map((p) => (
                  <li key={p.id} className="picker-print-product-row" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px', background: 'var(--bg-card, #ffffff)', borderRadius: '16px', border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)', marginBottom: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '25px', minWidth: 0, flex: 1 }}>
                      <div className="picker-order-item-thumb" style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-muted, #f8fafc)', flexShrink: 0 }}>
                        {p.image_url ? (
                          <img src={resolvePickerProductImageUrl(p.image_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span className="picker-order-item-thumb-ph" aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />
                        )}
                      </div>
                      <span className="picker-print-product-name" style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name_uz}</span>
                    </div>
                    <div className="picker-print-product-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <input
                        type="number"
                        min={1}
                        className="picker-print-qty"
                        value={printQuantities[p.id] ?? ''}
                        onChange={(e) => setPrintQty(p.id, e.target.value)}
                        placeholder={pickerUiT.qtyShort}
                        aria-label={`${p.name_uz}, ${pickerUiT.qtyShort}`}
                        style={{ width: '3.6rem', minHeight: '38px', height: '38px', padding: '0 6px', borderRadius: '10px', border: '2px solid var(--border, #e2e8f0)', background: 'var(--input-bg, #ffffff)', color: 'var(--text)', textAlign: 'center', fontSize: '0.9rem', boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        className="picker-btn picker-btn-primary"
                        onClick={() => handleChekPrint(p, printQuantities[p.id])}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', minHeight: '38px', padding: 0, borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>🖨️</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {chekToPrint && (
              <div className="picker-chek-sheet picker-chek-only-print" aria-hidden="true">
                <div className="picker-chek-inner">
                  <h2 className="picker-chek-title">{pickerUiT.receiptTitle}</h2>
                  <p className="picker-chek-line">
                    <strong>{chekToPrint.product.name_uz}</strong> × {chekToPrint.quantity}
                  </p>
                  <p className="picker-chek-date">{formatPickerDateTimeFull(new Date(), locale)}</p>
                </div>
              </div>
            )}
          </div>
        )}
        </main>

        <PickerMyShopGroupPanel
          open={myShopGroupOpen}
          onClose={() => setMyShopGroupOpen(false)}
          section={myShopGroupSection}
          onSectionChange={setMyShopGroupSection}
          brandLine={pickerUiT.chatTeam}
          selfLine={`${pickerChatNick} (${pickerUiT.groupYouMark})`}
          selfRoleHint={String(user?.role || '').trim() || ''}
          peers={groupPeersList}
          peersLoading={dmPeersLoading}
          messages={myShopPanelMessages}
          t={pickerUiT}
        />

        {showPackerModal && (pickedBatch.length > 0 || packerModalAssignedOrderId != null) && (
        <div className="picker-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="picker-packers-title">
          <div className="picker-modal">
            <h2 id="picker-packers-title" className="picker-modal-title">
              {packerModalAssignedOrderId != null
                ? pickerUiT.packerAssignedLine.replace('{id}', String(packerModalAssignedOrderId))
                : `${pickerUiT.packerModalTitle} № ${pickedBatch[0] ?? ''}`}
            </h2>
            {packerModalAssignedOrderId == null ? (
              <>
            <p className="picker-modal-hint">{pickerUiT.packerModalHint}</p>
            {packers.length === 0 && !assigningPacker ? (
              <p className="picker-modal-empty">{pickerUiT.packerModalEmpty}</p>
            ) : (
              <ul className="picker-packers-list">
                {packers.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="picker-packers-btn"
                      onClick={() => handleAssignBatchToPacker(p.id)}
                      disabled={assigningPacker}
                    >
                      <span className="picker-packers-name">{p.full_name}</span>
                      {p.phone && <span className="picker-packers-phone">{p.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
                )}
              </>
            ) : (
              <p className="picker-modal-hint" style={{ marginTop: '0.5rem' }}>
                {pickerUiT.packerModalAssignedFootnote}
              </p>
            )}
            <div className="picker-modal-actions">
              <button
                type="button"
                className="picker-btn picker-btn-primary"
                onClick={() => handlePackerModalDismiss()}
                disabled={assigningPacker}
              >
                {pickerUiT.modalClose}
              </button>
            </div>
          </div>
        </div>
        )}

        {!telegramMainLayout && (
        <nav className="picker-footer picker-nav no-print" aria-label={pickerUiT.footerNavAria} role="tablist">
          <div className="picker-nav-inner">
            {bottomTabs.map((tb) => {
              const isActive = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tb.label}
                  data-tab={tb.id}
                  className={`picker-nav-btn ${isActive ? 'picker-nav-btn-active' : ''}`}
                  onClick={() => setTab(tb.id)}
                >
                  <span className="picker-nav-icon">{tb.icon}</span>
                  <span className="picker-nav-label">{tb.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        )}
      </div>
    </div>
  );
}
