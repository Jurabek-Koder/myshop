import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../../components/picker/PickerLichka';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import StaffTopbarBellCluster, { StaffNotifModalHeader } from '../../components/staff/StaffTopbarBellCluster';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat';
import { formatDateTimeUz, UZ_TIMEZONE } from '../../utils/uzbekistanTime.js';
import '../picker/PickerDashboard.css';
import './WarehouseAdminDashboard.css';

const VIEW_KEYS = new Set(['home', 'kirim_chiqim', 'atkaz', 'brak', 'chat', 'delisted', 'deleted']);

/** Sklad kataklari sarlavalari — `.warehouse-admin-top-vseg-label` */
const WAREHOUSE_GRID_HEADERS = [
  'Seller',
  'Maxsulot rasmi',
  'Nomi',
  'Soni',
  'Kirim soni',
  'Chiqim soni',
  'Atkaz soni',
  'Brak maxsulot',
  'Tasdiqlash',
];

const myshopPlaneIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

/** Sklad/MyShop jamoaviy xonasi va xodimlar lichkalari (`staffSkladLichka`). */
const TEAM_CHAT_ROOM = 'sklad';

function formatNotifWhen(value) {
  return formatDateTimeUz(value, { empty: '—' });
}

function normalizeWarehouseView(raw) {
  const v = String(raw || '').trim();
  if (v === 'kirim' || v === 'chiqim') return 'kirim_chiqim';
  return VIEW_KEYS.has(v) ? v : 'home';
}

/** Brak sahifasi ichidagi pastki tab: URL `brakTab` */
function normalizeBrakTab(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'pending' || v === 'kutilmoqda') return 'pending';
  return 'confirmed';
}

/** Ombor ledger — PATCH /warehouse-admin/products/:id/warehouse-ledger */
function LedgerQtyEditor({
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
}) {
  const fv = Number(p[field]) || 0;
  const [val, setVal] = useState(String(fv));
  useEffect(() => {
    setVal(String(Number(p[field]) || 0));
  }, [p.id, p[field], field]);
  const [phase, setPhase] = useState('');

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
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={Boolean(phase)}
          className={`warehouse-admin-ledger-input${compact ? ' warehouse-admin-ledger-input--compact' : ''}`}
          aria-label="Miqdor"
        />
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
      </div>
      {confirmedAt && !compact && (
        <span style={{ fontSize: 11, color: 'var(--success-text, #16a34a)', fontWeight: 600 }}>Tasdiqlangan</span>
      )}
      {confirmedAt && compact && (
        <span className="warehouse-admin-ledger-compact-ok" title="Tasdiqlangan">
          ✓
        </span>
      )}
    </div>
  );
}

/** kirim_sheet — kirim/chiqim jadvali va «sotuvdan olinganlar» */
function warehousePrimaryActionKind(p, actionsContext) {
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

function canWarehouseTakeOffSale(p) {
  const st = String(p?.status || '').trim().toLowerCase();
  if (st === 'active' || st === 'approved') return true;
  return Boolean(p?.warehouse_approved_at);
}

function warehouseRowActionsBusy(p, busy) {
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

function WarehouseActionsColumn({
  p,
  actionsContext,
  busy,
  onPrimary,
  onToggleSale,
  onDelete,
  variant = 'grid',
}) {
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
    return (
      <div className="warehouse-admin-actions-stack warehouse-admin-actions-stack--embedded">{stackInner}</div>
    );
  }

  return (
    <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
      <div className="warehouse-admin-actions-stack">{stackInner}</div>
    </div>
  );
}

/** Jadval ustunlari — scroll qobig‘i ichida body bilan birga harakatlanadi */
function WarehouseGridColumnHeaders() {
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

/**
 * Operator panelidan alohida: bosh sahifa, ombor kirim/chiqim, MyShop chat; pastda tema va chiqish.
 */
export default function WarehouseAdminDashboard() {
  const { request, user, logout } = useAuth();
  const { t: pickerUiT, notificationsEnabled, setNotificationsEnabled } = usePickerUiSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const view = useMemo(() => normalizeWarehouseView(searchParams.get('view')), [searchParams]);

  const brakTab = useMemo(() => {
    if (view !== 'brak') return 'confirmed';
    return normalizeBrakTab(searchParams.get('brakTab'));
  }, [view, searchParams]);

  const setBrakTab = useCallback(
    (tab) => {
      const t = tab === 'pending' ? 'pending' : 'confirmed';
      setSearchParams({ view: 'brak', brakTab: t }, { replace: true });
    },
    [setSearchParams],
  );

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmThreads, setDmThreads] = useState({});
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [myShopGroupOpen, setMyShopGroupOpen] = useState(false);
  const [myShopGroupSection, setMyShopGroupSection] = useState('members');
  const [skladPresencePeers, setSkladPresencePeers] = useState([]);
  const teamChatPurgedRef = useRef(new Set());

  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState(null);

  const [sellerProductsOverview, setSellerProductsOverview] = useState([]);
  const [sellerProductsLoading, setSellerProductsLoading] = useState(false);

  const warehouseName = user?.full_name || user?.login || 'Ombor admini';

  const overviewBucket = useMemo(() => {
    if (view === 'delisted') return 'delisted';
    if (view === 'deleted') return 'deleted';
    return 'active';
  }, [view]);

  const loadSellerProductsOverview = useCallback(async () => {
    try {
      setSellerProductsLoading(true);
      const res = await request(
        `/warehouse-admin/products-overview?bucket=${encodeURIComponent(overviewBucket)}`,
      );
      const d = await res.json().catch(() => ({}));
      setSellerProductsOverview(res.ok && Array.isArray(d.products) ? d.products : []);
    } catch {
      setSellerProductsOverview([]);
    } finally {
      setSellerProductsLoading(false);
    }
  }, [request, overviewBucket]);

  const todayLine = useMemo(
    () =>
      new Intl.DateTimeFormat('uz-UZ', {
        timeZone: UZ_TIMEZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date()),
    [],
  );

  const sideNavItems = useMemo(
    () => [
      { id: 'home', label: 'Bosh sahifa', icon: '🏠' },
      { id: 'kirim_chiqim', label: 'Kirim va chiqim', icon: '📊' },
      { id: 'atkaz', label: 'Atkaz mahsulot', icon: '🚫' },
      { id: 'delisted', label: 'Sotuvdan olinganlar', icon: '📴' },
      { id: 'deleted', label: 'Oʻchirilgan mahsulotlar', icon: '🗑️' },
      { id: 'brak', label: 'Brak mahsulot', icon: '⚠️' },
      { id: 'chat', label: pickerUiT.navMyShopChat, icon: myshopPlaneIcon },
    ],
    [pickerUiT.navMyShopChat],
  );

  const goView = useCallback(
    (next) => {
      if (next === 'home') setSearchParams({}, { replace: true });
      else setSearchParams({ view: next });
      setSidePanelOpen(false);
    },
    [setSearchParams],
  );

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/warehouse-admin/notifications');
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      setNotifications(Array.isArray(d.notifications) ? d.notifications : []);
    } catch {
      setNotifications([]);
    }
  }, [request]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  const markNotificationRead = useCallback(
    async (id) => {
      try {
        await request(`/warehouse-admin/notifications/${id}/read`, { method: 'PATCH' });
        setNotifications((prev) =>
          prev.map((n) => (Number(n.id) === Number(id) ? { ...n, read_at: new Date().toISOString() } : n)),
        );
      } catch {
        await loadNotifications();
      }
    },
    [request, loadNotifications],
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!notificationsOpen) return;
    void loadNotifications();
  }, [notificationsOpen, loadNotifications]);

  useEffect(() => {
    if (view === 'chat') return undefined;
    const id = window.setInterval(() => {
      void loadNotifications();
    }, 60000);
    return () => window.clearInterval(id);
  }, [view, loadNotifications]);

  useEffect(() => {
    if (view === 'chat') return undefined;
    void loadSellerProductsOverview();
    return undefined;
  }, [view, loadSellerProductsOverview]);

  useEffect(() => {
    if (view !== 'chat') return;
    let cancelled = false;
    (async () => {
      setDmPeersLoading(true);
      try {
        const res = await request('/warehouse-admin/sklad-peers');
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
            { id: 'myshop', displayName: pickerUiT.chatTeam, roleLabel: pickerUiT.dmRoleSupport },
          ]);
        }
      } finally {
        if (!cancelled) setDmPeersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, request, pickerUiT.chatTeam, pickerUiT.dmRoleSupport]);

  useEffect(() => {
    const watch = view === 'chat' && dmActivePeer?.id === 'myshop';
    if (!watch) {
      setSkladPresencePeers([]);
      return undefined;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await request(
          `/warehouse-admin/chat/presence?room=${encodeURIComponent(TEAM_CHAT_ROOM)}&staleSec=14`,
        );
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSkladPresencePeers(Array.isArray(data.peers) ? data.peers : []);
      } catch {
        /* tarmoq */
      }
    };
    pull();
    const id = setInterval(pull, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view, dmActivePeer?.id, request]);

  const skladPresenceSubtitle = useMemo(
    () => formatSkladPresenceSubtitle(skladPresencePeers, pickerUiT),
    [skladPresencePeers, pickerUiT],
  );

  const sendTeamPresence = useCallback(
    (state) => {
      void request('/warehouse-admin/chat/presence', {
        method: 'POST',
        body: JSON.stringify({ chatRoom: TEAM_CHAT_ROOM, state }),
      }).catch(() => {});
    },
    [request],
  );

  const onSkladThreadPurge = useCallback((id) => {
    teamChatPurgedRef.current.add(id);
    setDmThreads((prev) => ({
      ...prev,
      myshop: (prev.myshop || []).filter((x) => x.id !== id),
    }));
  }, []);

  const groupPeersList = useMemo(() => dmPeers.filter((p) => p.id !== 'myshop'), [dmPeers]);
  const myShopPanelMessages = useMemo(() => [...(dmThreads.myshop || [])], [dmThreads]);

  const openMyShopGroupPanel = useCallback(() => {
    setMyShopGroupSection('members');
    setMyShopGroupOpen(true);
  }, []);

  useEffect(() => {
    if (view !== 'chat' || dmActivePeer?.id !== 'myshop') {
      setMyShopGroupOpen(false);
    }
  }, [view, dmActivePeer?.id]);

  const closeSidebar = useCallback(() => setSidePanelOpen(false), []);

  const isChatView = view === 'chat';

  const nonChatTitle = useMemo(() => {
    if (view === 'kirim_chiqim') return 'Kirim va chiqim';
    if (view === 'atkaz') return 'Atkaz mahsulot';
    if (view === 'delisted') return 'Sotuvdan olingan mahsulotlar';
    if (view === 'deleted') return 'Oʻchirilgan mahsulotlar';
    if (view === 'brak') return 'Brak mahsulot';
    return 'Bosh sahifa';
  }, [view]);

  /** Kontent tepada — vizual sarlavha/sana yo‘q, SR uchun yashirin h1 */
  const ledgerSheetCompactHeader =
    view === 'home' ||
    view === 'brak' ||
    view === 'kirim_chiqim' ||
    view === 'atkaz' ||
    view === 'delisted' ||
    view === 'deleted';

  const atkazSiteGridProducts = useMemo(() => {
    const rows = sellerProductsOverview.filter(
      (p) =>
        (Number(p.orders_atkaz_soni) || 0) > 0 ||
        (Number(p.warehouse_atkaz_qty) || 0) > 0 ||
        Boolean(p.warehouse_atkaz_confirmed_at),
    );
    rows.sort((a, b) => (Number(b.orders_atkaz_soni) || 0) - (Number(a.orders_atkaz_soni) || 0));
    return rows;
  }, [sellerProductsOverview]);
  const brakConfirmed = useMemo(
    () =>
      sellerProductsOverview.filter(
        (p) => Boolean(p.warehouse_brak_confirmed_at) && Number(p.brak_qty) > 0,
      ),
    [sellerProductsOverview],
  );
  const brakPending = useMemo(
    () =>
      sellerProductsOverview.filter(
        (p) => !p.warehouse_brak_confirmed_at && Number(p.brak_qty) > 0,
      ),
    [sellerProductsOverview],
  );
  const brakActiveList = useMemo(() => {
    if (view !== 'brak') return [];
    return brakTab === 'pending' ? brakPending : brakConfirmed;
  }, [view, brakTab, brakConfirmed, brakPending]);
  const brakActiveEmptyMessage =
    brakTab === 'pending' ? 'Kutilayotgan brak yoʻq.' : 'Tasdiqlangan brak yoʻq.';
  const pendingProducts = useMemo(
    () => sellerProductsOverview.filter((p) => !p.warehouse_approved_at),
    [sellerProductsOverview],
  );

  const [approvingId, setApprovingId] = useState(0);
  const handleApproveKirim = useCallback(
    async (productId) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      setApprovingId(id);
      try {
        const res = await request(`/warehouse-admin/products/${id}/approve-kirim`, { method: 'POST' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(d?.error || 'Tasdiqlashda xatolik');
          return;
        }
        await loadSellerProductsOverview();
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setApprovingId(0);
      }
    },
    [request, loadSellerProductsOverview],
  );

  const [confirmingChiqimId, setConfirmingChiqimId] = useState(0);
  const [confirmingAtkazId, setConfirmingAtkazId] = useState(0);
  const [revokingKirimId, setRevokingKirimId] = useState(0);
  const [delistingId, setDelistingId] = useState(0);
  const [deletingProductId, setDeletingProductId] = useState(0);

  const handleConfirmChiqim = useCallback(
    async (productId) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      setConfirmingChiqimId(id);
      try {
        const res = await request(`/warehouse-admin/products/${id}/confirm-chiqim`, { method: 'POST' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(d?.error || 'Chiqim tasdiqlanmadi');
          return;
        }
        await loadSellerProductsOverview();
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setConfirmingChiqimId(0);
      }
    },
    [request, loadSellerProductsOverview],
  );

  const handleConfirmAtkaz = useCallback(
    async (productId) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      setConfirmingAtkazId(id);
      try {
        const res = await request(`/warehouse-admin/products/${id}/confirm-atkaz`, { method: 'POST' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(d?.error || 'Atkaz tasdiqlanmadi');
          return;
        }
        await loadSellerProductsOverview();
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setConfirmingAtkazId(0);
      }
    },
    [request, loadSellerProductsOverview],
  );

  const handleRevokeKirimApproval = useCallback(
    async (productId) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      setRevokingKirimId(id);
      try {
        const res = await request(`/warehouse-admin/products/${id}/revoke-kirim-approval`, {
          method: 'POST',
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(d?.error || 'Tasdiq bekor qilinmadi');
          return;
        }
        await loadSellerProductsOverview();
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setRevokingKirimId(0);
      }
    },
    [request, loadSellerProductsOverview],
  );

  const handlePrimaryAction = useCallback(
    async (p, actionsContext) => {
      const kind = warehousePrimaryActionKind(p, actionsContext);
      if (kind === 'approve_kirim') await handleApproveKirim(p.id);
      else if (kind === 'confirm_chiqim') await handleConfirmChiqim(p.id);
      else if (kind === 'confirm_atkaz') await handleConfirmAtkaz(p.id);
      else if (kind === 'revoke_kirim') await handleRevokeKirimApproval(p.id);
    },
    [handleApproveKirim, handleConfirmChiqim, handleConfirmAtkaz, handleRevokeKirimApproval],
  );

  const handleToggleWarehouseSale = useCallback(
    async (p) => {
      const id = Number(p.id);
      if (!Number.isInteger(id) || id < 1) return;
      setDelistingId(id);
      try {
        const nextStatus = p.warehouse_delisted_at ? 'active' : 'pending';
        const res = await request(`/warehouse-admin/products/${id}/sale-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(d?.error || (nextStatus === 'pending' ? 'Sotuvdan olinmadi' : 'Sotuvga qaytarilmadi'));
          return;
        }
        await loadSellerProductsOverview();
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setDelistingId(0);
      }
    },
    [request, loadSellerProductsOverview],
  );

  const handleDeleteProductWarehouse = useCallback(
    async (p) => {
      const id = Number(p.id);
      if (!Number.isInteger(id) || id < 1) return;
      const label = String(p.name_uz || '').trim() || `ID ${id}`;
      if (
        !window.confirm(`«${label}» mahsulotini butunlay o‘chirishni tasdiqlaysizmi? Bu amal qaytarilmaydi.`)
      ) {
        return;
      }
      setDeletingProductId(id);
      try {
        const res = await request(`/warehouse-admin/products/${id}`, { method: 'DELETE' });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(d?.error || 'O‘chirilmadi');
          return;
        }
        await loadSellerProductsOverview();
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setDeletingProductId(0);
      }
    },
    [request, loadSellerProductsOverview],
  );

  const rowBusyFlags = useMemo(
    () => ({
      approvingId,
      confirmingChiqimId,
      confirmingAtkazId,
      revokingKirimId,
      delistingId,
      deletingProductId,
    }),
    [approvingId, confirmingChiqimId, confirmingAtkazId, revokingKirimId, delistingId, deletingProductId],
  );

  return (
    <div className="picker-app picker-mobile warehouse-admin-shell">
      <div className={`picker-phone-frame${isChatView ? ' picker-phone-frame--no-topbar' : ''}`}>
        {!isChatView && (
          <header className="picker-topbar no-print warehouse-admin-topbar">
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
              <span className="picker-topbar-logo">MyShop · Ombor</span>
              <div className="picker-topbar-right">
                <StaffTopbarBellCluster
                  t={pickerUiT}
                  notificationsEnabled={notificationsEnabled}
                  notificationsOpen={notificationsOpen}
                  setNotificationsOpen={setNotificationsOpen}
                  unreadCount={unreadNotifCount}
                >
                  {notificationsOpen && (
                    <>
                      <div
                        className="picker-bell-backdrop"
                        onClick={() => setNotificationsOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="picker-bell-dropdown">
                        <StaffNotifModalHeader
                          t={pickerUiT}
                          notificationsEnabled={notificationsEnabled}
                          setNotificationsEnabled={setNotificationsEnabled}
                        />
                        {notifications.length === 0 ? (
                          <p className="picker-bell-empty">{pickerUiT.bellEmpty}</p>
                        ) : (
                          <ul className="picker-bell-list">
                            {notifications.map((n) => (
                              <li key={n.id}>
                                <button
                                  type="button"
                                  className={`picker-bell-item ${n.read_at ? '' : 'unread'}`}
                                  onClick={() => {
                                    setNotificationDetail(n);
                                    setNotificationsOpen(false);
                                    if (!n.read_at) void markNotificationRead(n.id);
                                  }}
                                >
                                  <span className="picker-bell-item-title">{n.title}</span>
                                  <span className="picker-bell-item-date">{formatNotifWhen(n.created_at)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </StaffTopbarBellCluster>
                <span className="picker-topbar-user" title={warehouseName}>
                  {warehouseName}
                </span>
              </div>
            </div>
          </header>
        )}
        <aside className={`picker-side-panel ${sidePanelOpen ? 'open' : ''}`} aria-hidden={!sidePanelOpen}>
          <div className="picker-side-panel-inner">
            <div className="picker-side-panel-head">Bo&apos;limlar</div>
            <p className="courier-side-intro operator-side-intro">
              <strong>{warehouseName}</strong>
              <span className="courier-side-meta">Ombor admini</span>
            </p>
            <nav className="picker-side-panel-nav" aria-label="Ombor admin bo‘limlari">
              {sideNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`picker-side-panel-item ${view === item.id ? 'picker-side-panel-item-active' : ''}`}
                  onClick={() => goView(item.id)}
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
              <div className="picker-side-panel-theme-row">
                <span className="picker-side-panel-theme-label">{isDark ? '🌙 Tun' : '☀️ Kun'}</span>
                <button
                  type="button"
                  className={`picker-ios-theme-toggle ${isDark ? 'picker-ios-theme-toggle-dark' : ''}`}
                  onClick={toggleTheme}
                  role="switch"
                  aria-checked={isDark}
                  aria-label="Mavzu"
                >
                  <span className="picker-ios-theme-thumb" />
                </button>
              </div>
              <button
                type="button"
                className="picker-side-panel-logout"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Chiqish
              </button>
            </div>
          </div>
        </aside>
        <div
          className={`picker-side-panel-overlay ${sidePanelOpen ? 'show' : ''}`}
          aria-hidden={!sidePanelOpen}
          onClick={closeSidebar}
        />

        {isChatView ? (
          <main className="picker-main picker-main--telegram warehouse-admin-main">
            <PickerLichka
              t={pickerUiT}
              request={request}
              peers={dmPeers}
              peersLoading={dmPeersLoading}
              activePeer={dmActivePeer}
              setActivePeer={setDmActivePeer}
              threads={dmThreads}
              setThreads={setDmThreads}
              pickerChatNick={warehouseName}
              skladPurgedRef={teamChatPurgedRef}
              onOpenMyShopGroup={openMyShopGroupPanel}
              onSkladThreadPurge={onSkladThreadPurge}
              skladPresenceSubtitle={skladPresenceSubtitle}
              onSkladPresence={sendTeamPresence}
              apiPrefix="/warehouse-admin"
              teamChatRoom={TEAM_CHAT_ROOM}
              listTitleOverride={pickerUiT.navMyShopChat}
              listSubtitleOverride="Sklad jamoasi chati va pastda boshqa xodimlar bilan shaxsiy lichka."
              listRegionAriaOverride={pickerUiT.courierMyShopChatRegionAria}
              onOpenSidePanel={() => setSidePanelOpen(true)}
              staffUserId={user?.id}
            />
          </main>
        ) : (
          <main className="picker-main warehouse-admin-main">
            <div
              className={`warehouse-admin-page${ledgerSheetCompactHeader ? ' warehouse-admin-page--sheet-first' : ''}`}
            >
              {ledgerSheetCompactHeader ? (
                <h1 className="warehouse-admin-visually-hidden">{nonChatTitle}</h1>
              ) : (
                <>
                  <h1 className="picker-title">{nonChatTitle}</h1>
                  <p className="picker-subtitle">{todayLine}</p>
                </>
              )}

              {view === 'home' && (
                <>
                  <div className="warehouse-admin-sheet-unified">
                    <div className="warehouse-admin-sheet-unified-inner">
                      <WarehouseGridColumnHeaders />
                      <div className="warehouse-admin-grid-rows warehouse-admin-grid-rows--sheet" role="grid">
                      {sellerProductsLoading && (
                        <p className="warehouse-admin-grid-row-empty" aria-live="polite">
                          Yuklanmoqda…
                        </p>
                      )}
                      {!sellerProductsLoading && pendingProducts.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">Tasdiq kutayotgan mahsulot yo‘q.</p>
                      )}
                      {!sellerProductsLoading &&
                        pendingProducts.map((p) => (
                          <div
                            key={p.id}
                            className="warehouse-admin-grid-row"
                            role="row"
                            aria-label={p.name_uz}
                          >
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-cell-text"
                              role="gridcell"
                              title={p.seller_name || ''}
                            >
                              <span className="warehouse-admin-cell-ellipsis">{p.seller_name || '—'}</span>
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-cell-img" role="gridcell">
                              <div className="warehouse-admin-product-thumb-wrap">
                                {p.image_url ? (
                                  <img
                                    className="warehouse-admin-product-thumb"
                                    src={p.image_url}
                                    alt=""
                                  />
                                ) : (
                                  <span className="warehouse-admin-thumb-ph" aria-hidden>
                                    —
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-cell-name"
                              role="gridcell"
                              title={p.name_uz || ''}
                            >
                              <div className="warehouse-admin-cell-name-inner">
                                <span className="warehouse-admin-product-name-row">{p.name_uz || '—'}</span>
                              </div>
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.stock) || 0}
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.kirim_soni) || 0}
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.chiqim_soni) || 0}
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.atkaz_soni) || 0}
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.brak_qty) || 0}
                            </div>
                            <WarehouseActionsColumn
                              p={p}
                              actionsContext="home"
                              busy={rowBusyFlags}
                              onPrimary={handlePrimaryAction}
                              onToggleSale={handleToggleWarehouseSale}
                              onDelete={handleDeleteProductWarehouse}
                            />
                          </div>
                        ))}
                    </div>
                    </div>
                  </div>
                </>
              )}

              {(view === 'kirim_chiqim' || view === 'delisted' || view === 'deleted') && (
                <>
                  <div className="warehouse-admin-sheet-unified">
                    <div className="warehouse-admin-sheet-unified-inner">
                      <WarehouseGridColumnHeaders />
                      <div className="warehouse-admin-grid-rows warehouse-admin-grid-rows--sheet" role="grid">
                      {sellerProductsLoading && (
                        <p className="warehouse-admin-grid-row-empty" aria-live="polite">
                          Yuklanmoqda…
                        </p>
                      )}
                      {!sellerProductsLoading && sellerProductsOverview.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">
                          {view === 'delisted'
                            ? 'Sotuvdan olingan mahsulot yoʻq.'
                            : view === 'deleted'
                              ? 'Oʻchirilgan mahsulot yoʻq.'
                              : 'Mahsulot yo‘q.'}
                        </p>
                      )}
                      {!sellerProductsLoading &&
                        sellerProductsOverview.map((p) => (
                          <div
                            key={p.id}
                            className="warehouse-admin-grid-row warehouse-admin-grid-row--ledger"
                            role="row"
                            aria-label={p.name_uz}
                          >
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-cell-text"
                              role="gridcell"
                              title={p.seller_name || ''}
                            >
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
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-cell-name"
                              role="gridcell"
                              title={p.name_uz || ''}
                            >
                              <div className="warehouse-admin-cell-name-inner">
                                <span className="warehouse-admin-product-name-row">{p.name_uz || '—'}</span>
                              </div>
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.stock) || 0}
                            </div>
                            <div
                              className={`warehouse-admin-grid-cell ${
                                view === 'deleted'
                                  ? 'warehouse-admin-num-cell'
                                  : 'warehouse-admin-grid-cell--ledger'
                              }`}
                              role="gridcell"
                            >
                              {view === 'deleted' ? (
                                Number(p.warehouse_kirim_qty) || 0
                              ) : p.warehouse_approved_at ? (
                                <LedgerQtyEditor
                                  compact
                                  product={p}
                                  field="warehouse_kirim_qty"
                                  hintLabel="Stock"
                                  hintValue={Number(p.stock) || 0}
                                  confirmedAt={p.warehouse_approved_at}
                                  onReload={loadSellerProductsOverview}
                                  request={request}
                                />
                              ) : (
                                <span className="warehouse-admin-num-muted" title="Avval bosh sahifada tasdiqlang">
                                  —
                                </span>
                              )}
                            </div>
                            <div
                              className={`warehouse-admin-grid-cell ${
                                view === 'deleted'
                                  ? 'warehouse-admin-num-cell'
                                  : 'warehouse-admin-grid-cell--ledger'
                              }`}
                              role="gridcell"
                            >
                              {view === 'deleted' ? (
                                Number(p.warehouse_chiqim_qty) || 0
                              ) : (
                                <LedgerQtyEditor
                                  compact
                                  hideConfirmButton
                                  product={p}
                                  field="warehouse_chiqim_qty"
                                  hintLabel="Buyurtma"
                                  hintValue={Number(p.orders_chiqim_soni) || 0}
                                  confirmSlug="confirm-chiqim"
                                  confirmedAt={p.warehouse_chiqim_confirmed_at}
                                  onReload={loadSellerProductsOverview}
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
                            <WarehouseActionsColumn
                              p={p}
                              actionsContext={view === 'deleted' ? 'deleted_sheet' : 'kirim_sheet'}
                              busy={rowBusyFlags}
                              onPrimary={handlePrimaryAction}
                              onToggleSale={handleToggleWarehouseSale}
                              onDelete={handleDeleteProductWarehouse}
                            />
                          </div>
                        ))}
                    </div>
                    </div>
                  </div>
                </>
              )}

              {view === 'atkaz' && (
                <>
                  <div className="warehouse-admin-sheet-unified">
                    <div className="warehouse-admin-sheet-unified-inner">
                      <WarehouseGridColumnHeaders />
                      <div className="warehouse-admin-grid-rows warehouse-admin-grid-rows--sheet" role="grid">
                      {sellerProductsLoading && (
                        <p className="warehouse-admin-grid-row-empty" aria-live="polite">
                          Yuklanmoqda…
                        </p>
                      )}
                      {!sellerProductsLoading && atkazSiteGridProducts.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">
                          Hozircha atkaz boʻyicha yozuv yoʻq (buyurtma yoki ombor yozuvi).
                        </p>
                      )}
                      {!sellerProductsLoading &&
                        atkazSiteGridProducts.map((p) => (
                          <div
                            key={p.id}
                            className="warehouse-admin-grid-row warehouse-admin-grid-row--ledger"
                            role="row"
                            aria-label={p.name_uz}
                          >
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-cell-text"
                              role="gridcell"
                              title={p.seller_name || ''}
                            >
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
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-cell-name"
                              role="gridcell"
                              title={p.name_uz || ''}
                            >
                              <div className="warehouse-admin-cell-name-inner">
                                <span className="warehouse-admin-product-name-row">{p.name_uz || '—'}</span>
                              </div>
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.stock) || 0}
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.kirim_soni) || 0}
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.chiqim_soni) || 0}
                            </div>
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-grid-cell--ledger"
                              role="gridcell"
                            >
                              <LedgerQtyEditor
                                compact
                                hideConfirmButton
                                product={p}
                                field="warehouse_atkaz_qty"
                                hintLabel="Buyurtma"
                                hintValue={Number(p.orders_atkaz_soni) || 0}
                                confirmSlug="confirm-atkaz"
                                confirmedAt={p.warehouse_atkaz_confirmed_at}
                                onReload={loadSellerProductsOverview}
                                request={request}
                              />
                            </div>
                            <div className="warehouse-admin-grid-cell warehouse-admin-num-cell" role="gridcell">
                              {Number(p.brak_qty) || 0}
                            </div>
                            <WarehouseActionsColumn
                              p={p}
                              actionsContext="atkaz_sheet"
                              busy={rowBusyFlags}
                              onPrimary={handlePrimaryAction}
                              onToggleSale={handleToggleWarehouseSale}
                              onDelete={handleDeleteProductWarehouse}
                            />
                          </div>
                        ))}
                    </div>
                    </div>
                  </div>
                </>
              )}

              {view === 'brak' && (
                <>
                  <div className="warehouse-admin-brak-tabstrip" role="tablist" aria-label="Brak bo‘limlari">
                    <button
                      type="button"
                      role="tab"
                      id="wa-brak-tab-confirmed"
                      aria-selected={brakTab === 'confirmed'}
                      aria-controls="wa-brak-tabpanel"
                      className={`warehouse-admin-brak-tab${brakTab === 'confirmed' ? ' warehouse-admin-brak-tab--active' : ''}`}
                      onClick={() => setBrakTab('confirmed')}
                    >
                      <span className="warehouse-admin-brak-tab-line1">
                        Tasdiqlangan brak ({brakConfirmed.length})
                      </span>
                      <span className="warehouse-admin-brak-tab-line2">Tasdiqlangan yozuvlar</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="wa-brak-tab-pending"
                      aria-selected={brakTab === 'pending'}
                      aria-controls="wa-brak-tabpanel"
                      className={`warehouse-admin-brak-tab${brakTab === 'pending' ? ' warehouse-admin-brak-tab--active' : ''}`}
                      onClick={() => setBrakTab('pending')}
                    >
                      <span className="warehouse-admin-brak-tab-line1">
                        Tasdiqlash kutilmoqda ({brakPending.length})
                      </span>
                      <span className="warehouse-admin-brak-tab-line2">Tasdiqlanishi kutilayotgan mahsulotlar</span>
                    </button>
                  </div>
                  <section
                    id="wa-brak-tabpanel"
                    role="tabpanel"
                    aria-labelledby={
                      brakTab === 'pending' ? 'wa-brak-tab-pending' : 'wa-brak-tab-confirmed'
                    }
                    className="warehouse-admin-home-card warehouse-admin-brak-tabpanel"
                  >
                    {sellerProductsLoading && (
                      <p className="warehouse-admin-placeholder" aria-live="polite">
                        Yuklanmoqda…
                      </p>
                    )}
                    {!sellerProductsLoading && brakActiveList.length === 0 && (
                      <p className="warehouse-admin-placeholder">{brakActiveEmptyMessage}</p>
                    )}
                    {!sellerProductsLoading && brakActiveList.length > 0 && (
                      <ul className="warehouse-admin-brak-list">
                        {brakActiveList.map((p) => (
                          <li key={p.id} className="warehouse-admin-brak-row">
                            {p.image_url ? (
                              <img className="warehouse-admin-brak-thumb" src={p.image_url} alt="" />
                            ) : (
                              <span className="warehouse-admin-brak-thumb-ph" aria-hidden />
                            )}
                            <div className="warehouse-admin-brak-row-meta">
                              <div className="warehouse-admin-brak-row-title">{p.name_uz || '—'}</div>
                              <div className="warehouse-admin-brak-row-seller">{p.seller_name || '—'}</div>
                            </div>
                            <div className="warehouse-admin-brak-row-tail">
                              <LedgerQtyEditor
                                compact
                                product={p}
                                field="brak_qty"
                                confirmSlug="confirm-brak"
                                confirmedAt={p.warehouse_brak_confirmed_at}
                                onReload={loadSellerProductsOverview}
                                request={request}
                              />
                              <WarehouseActionsColumn
                                variant="embedded"
                                actionsContext="sale_delete_only"
                                p={p}
                                busy={rowBusyFlags}
                                onPrimary={handlePrimaryAction}
                                onToggleSale={handleToggleWarehouseSale}
                                onDelete={handleDeleteProductWarehouse}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>
          </main>
        )}

        {notificationDetail && (
          <div
            className="picker-modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setNotificationDetail(null)}
          >
            <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="picker-modal-title">{notificationDetail.title}</h2>
              <p className="picker-notification-body">{notificationDetail.body}</p>
              <div className="picker-modal-actions">
                <button
                  type="button"
                  className="picker-btn picker-btn-primary"
                  onClick={() => setNotificationDetail(null)}
                >
                  {pickerUiT.modalClose}
                </button>
              </div>
            </div>
          </div>
        )}

        {isChatView && (
          <PickerMyShopGroupPanel
            open={myShopGroupOpen}
            onClose={() => setMyShopGroupOpen(false)}
            section={myShopGroupSection}
            onSectionChange={setMyShopGroupSection}
            brandLine={pickerUiT.chatTeam}
            selfLine={`${warehouseName} (${pickerUiT.groupYouMark})`}
            selfRoleHint={String(user?.role || '').trim() || ''}
            peers={groupPeersList}
            peersLoading={dmPeersLoading}
            messages={myShopPanelMessages}
            t={pickerUiT}
          />
        )}
      </div>
    </div>
  );
}
