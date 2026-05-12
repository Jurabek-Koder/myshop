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

const VIEW_KEYS = new Set(['home', 'kirim', 'chiqim', 'atkaz', 'brak', 'chat']);

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
  return VIEW_KEYS.has(v) ? v : 'home';
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
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const sheetHorizLockRef = useRef(false);

  const warehouseName = user?.full_name || user?.login || 'Ombor admini';

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
      { id: 'kirim', label: 'Omborga kirim', icon: '📥' },
      { id: 'chiqim', label: 'Ombordan chiqim', icon: '📤' },
      { id: 'atkaz', label: 'Atkaz mahsulot', icon: '🚫' },
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

  const syncSheetHorizontalScroll = useCallback((sourceEl, targetEl) => {
    if (!sourceEl || !targetEl || sheetHorizLockRef.current) return;
    if (Math.round(sourceEl.scrollLeft) === Math.round(targetEl.scrollLeft)) return;
    sheetHorizLockRef.current = true;
    targetEl.scrollLeft = sourceEl.scrollLeft;
    queueMicrotask(() => {
      sheetHorizLockRef.current = false;
    });
  }, []);

  const onHeaderWarehouseSheetScroll = useCallback(
    (e) => {
      syncSheetHorizontalScroll(e.currentTarget, bodyScrollRef.current);
    },
    [syncSheetHorizontalScroll],
  );

  const onBodyWarehouseSheetScroll = useCallback(
    (e) => {
      syncSheetHorizontalScroll(e.currentTarget, headerScrollRef.current);
    },
    [syncSheetHorizontalScroll],
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
    if (!['home', 'atkaz', 'brak'].includes(view)) return;
    let cancelled = false;
    (async () => {
      try {
        setSellerProductsLoading(true);
        const res = await request('/warehouse-admin/products-overview');
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSellerProductsOverview(res.ok && Array.isArray(d.products) ? d.products : []);
      } catch {
        if (!cancelled) setSellerProductsOverview([]);
      } finally {
        if (!cancelled) setSellerProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, request]);

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
    if (view === 'kirim') return 'Omborga kirim';
    if (view === 'chiqim') return 'Ombordan chiqim';
    if (view === 'atkaz') return 'Atkaz mahsulot';
    if (view === 'brak') return 'Brak mahsulot';
    return 'Bosh sahifa';
  }, [view]);

  const atkazProducts = useMemo(
    () => sellerProductsOverview.filter((p) => Number(p.atkaz_soni) > 0),
    [sellerProductsOverview],
  );
  const brakProducts = useMemo(
    () => sellerProductsOverview.filter((p) => Number(p.brak_qty) > 0),
    [sellerProductsOverview],
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
        {!isChatView && (
          <div className="warehouse-admin-top-rule-slot">
            <div
              ref={headerScrollRef}
              className="warehouse-admin-top-scroll-wrap"
              onScroll={onHeaderWarehouseSheetScroll}
            >
              <div className="warehouse-admin-top-vlines-strip" role="row" aria-label="Ombor jadvali ustunlari">
                {WAREHOUSE_GRID_HEADERS.map((label) => (
                  <div key={label} className="warehouse-admin-top-vseg">
                    <span className="warehouse-admin-top-vseg-label" title={label}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
            <div className="warehouse-admin-page">
              <h1 className="picker-title">{nonChatTitle}</h1>
              <p className="picker-subtitle">{todayLine}</p>

              {view === 'home' && (
                <>
                  <p className="warehouse-admin-home-intro warehouse-admin-home-intro--tight-top">
                    Sotuvchilar qoʻshgan mahsulotlar roʻyxati: har bir qator tepidagi 9 ustun bilan mos ravishda. Chiqim va atkaz —
                    buyurtmalar holati asosida hisoblangan; kirim yozuvlari hozircha alohida jurnal yoʻqligi uchun 0 (keyin toʻldirish
                    mumkin).
                  </p>
                  <div
                    ref={bodyScrollRef}
                    className="warehouse-admin-body-scroll-wrap"
                    onScroll={onBodyWarehouseSheetScroll}
                  >
                    <div className="warehouse-admin-grid-rows" role="grid">
                      {sellerProductsLoading && (
                        <p className="warehouse-admin-grid-row-empty" aria-live="polite">
                          Yuklanmoqda…
                        </p>
                      )}
                      {!sellerProductsLoading && sellerProductsOverview.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">Sotuvchi mahsulotlari yo‘q.</p>
                      )}
                      {!sellerProductsLoading &&
                        sellerProductsOverview.map((p) => (
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
                            <div className="warehouse-admin-grid-cell warehouse-admin-cell-actions" role="gridcell">
                              <button type="button" className="warehouse-admin-tasdiq-btn">
                                Tasdiqlash
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}

              {view === 'kirim' && (
                <>
                  <p className="warehouse-admin-home-intro">
                    Bu yerda skladga kelgan mahsulotlar, yetkazib beruvchi yoki ishlab chiqarishdan qabul qilish yozuvlari chiqadi —
                    forma va jadvallarni keyingi bosqichda ulanamiz.
                  </p>
                  <div className="warehouse-admin-home-grid">
                    <section className="warehouse-admin-home-card muted-card" aria-labelledby="wa-kirim-empty">
                      <h2 id="wa-kirim-empty" className="warehouse-admin-home-card-title">
                        Ro‘yxat
                      </h2>
                      <p className="warehouse-admin-placeholder">Hali kiruvchi partiyalar / qabul yozuvlari yo‘q.</p>
                    </section>
                  </div>
                </>
              )}

              {view === 'chiqim' && (
                <>
                  <p className="warehouse-admin-home-intro">
                    Bu yerda ombordan chiqarilgan mahsulotlar — kuryer/pickerga topshirish, sotuv yoki boshqa sabab bilan chiqim yozuvlari
                    joylashadi.
                  </p>
                  <div className="warehouse-admin-home-grid">
                    <section className="warehouse-admin-home-card muted-card" aria-labelledby="wa-chiqim-empty">
                      <h2 id="wa-chiqim-empty" className="warehouse-admin-home-card-title">
                        Ro‘yxat
                      </h2>
                      <p className="warehouse-admin-placeholder">Hali chiqim yozuvlari yo‘q.</p>
                    </section>
                  </div>
                </>
              )}

              {(view === 'atkaz' || view === 'brak') && (
                <>
                  <p className="warehouse-admin-home-intro warehouse-admin-home-intro--tight-top">
                    {view === 'atkaz'
                      ? 'Atkaz qilingan (mijoz qabul qilmagan / qaytarilgan) mahsulotlar — buyurtmalar holati asosida hisoblangan.'
                      : 'Brak (yaroqsiz / shikastlangan) sifatida belgilangan mahsulotlar.'}
                  </p>
                  <div className="warehouse-admin-home-grid">
                    <section className="warehouse-admin-home-card" aria-labelledby={`wa-${view}-list`}>
                      <h2 id={`wa-${view}-list`} className="warehouse-admin-home-card-title">
                        {view === 'atkaz' ? `Atkaz ro‘yxati (${atkazProducts.length})` : `Brak ro‘yxati (${brakProducts.length})`}
                      </h2>
                      {sellerProductsLoading && (
                        <p className="warehouse-admin-placeholder" aria-live="polite">Yuklanmoqda…</p>
                      )}
                      {!sellerProductsLoading && (view === 'atkaz' ? atkazProducts : brakProducts).length === 0 && (
                        <p className="warehouse-admin-placeholder">
                          {view === 'atkaz' ? 'Atkaz qilingan mahsulot yo‘q.' : 'Brak mahsulot yo‘q.'}
                        </p>
                      )}
                      {!sellerProductsLoading && (view === 'atkaz' ? atkazProducts : brakProducts).length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(view === 'atkaz' ? atkazProducts : brakProducts).map((p) => (
                            <li
                              key={p.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '8px 10px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8,
                              }}
                            >
                              {p.image_url ? (
                                <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                              ) : (
                                <span style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', display: 'inline-block' }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {p.name_uz || '—'}
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>{p.seller_name || '—'}</div>
                              </div>
                              <div style={{ fontWeight: 700, color: view === 'atkaz' ? '#dc2626' : '#d97706' }}>
                                {view === 'atkaz' ? Number(p.atkaz_soni) || 0 : Number(p.brak_qty) || 0}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
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
