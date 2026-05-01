import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../../components/picker/PickerLichka';
import StaffTopbarBellCluster, { StaffNotifModalHeader } from '../../components/staff/StaffTopbarBellCluster';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat.js';
import { formatDateTimeUz, UZ_TIMEZONE } from '../../utils/uzbekistanTime.js';
import '../picker/PickerDashboard.css';
import './OperatorDashboard.css';

const STATUS_LABELS = {
  pending: 'Yangi',
  contacted: "Bog'langan",
  ordered: 'Zakaz qilingan',
  cancelled: 'Arxiv',
};

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatDateTime(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

const myshopPlaneIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const OPERATOR_TAB_KEYS = new Set([
  'create_lead',
  'lichka',
  'pending',
  'contacted',
  'packaged',
  'delivered',
  'cancelled',
  'konkurs',
  'finance',
]);

function normalizeOperatorTab(raw) {
  const v = String(raw || '').trim();
  return OPERATOR_TAB_KEYS.has(v) ? v : 'pending';
}

export default function OperatorDashboard() {
  const { request, user, logout } = useAuth();
  const { t: pickerUiT, notificationsEnabled, setNotificationsEnabled } = usePickerUiSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => normalizeOperatorTab(searchParams.get('tab')), [searchParams]);
  const [leads, setLeads] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [finance, setFinance] = useState({ earnings: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [createModal, setCreateModal] = useState(null);
  const [createForm, setCreateForm] = useState({
    quantity: 1,
    shipping_address: '',
    contact_phone: '',
    contact_email: '',
    is_test: false,
  });
  const [detailModal, setDetailModal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contestResults, setContestResults] = useState({
    active: false,
    period: 'day',
    topByOrdersCreated: [],
    topByOrdersDelivered: [],
  });
  const [contestPeriod, setContestPeriod] = useState('day');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmThreads, setDmThreads] = useState({});
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [myShopGroupOpen, setMyShopGroupOpen] = useState(false);
  const [myShopGroupSection, setMyShopGroupSection] = useState('members');
  const [skladPresencePeers, setSkladPresencePeers] = useState([]);
  const teamChatPurgedRef = useRef(new Set());
  const [leadCreateForm, setLeadCreateForm] = useState({
    product_id: '',
    full_name: '',
    contact_phone: '',
    contact_email: '',
  });
  const [leadCreateBusy, setLeadCreateBusy] = useState(false);
  const [leadCreateMessage, setLeadCreateMessage] = useState('');

  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const operatorName = user?.full_name || 'Operator';
  const unreadNotifCount = notifications.filter((n) => !n.read_at).length;

  const isLeadsFilter = ['pending', 'contacted', 'ordered', 'all', 'cancelled'].includes(filter);
  const isOrdersFilter = ['packaged', 'delivered', 'cancelled'].includes(filter);
  const isFinanceFilter = filter === 'finance';
  const isKonkursFilter = filter === 'konkurs';
  const isCreateLeadFilter = filter === 'create_lead';
  const isLichkaFilter = filter === 'lichka';

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/operator/notifications');
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications || []);
      }
    } catch (_) {}
  }, [request]);

  const loadContestResults = async (period) => {
    try {
      const res = await request(`/operator/contest-results?period=${period || contestPeriod}`);
      if (res.ok) {
        const data = await res.json();
        setContestResults({
          active: data.active,
          period: data.period,
          topByOrdersCreated: data.topByOrdersCreated || [],
          topByOrdersDelivered: data.topByOrdersDelivered || [],
        });
      }
    } catch (_) {}
  };

  const loadData = async () => {
    if (isLichkaFilter) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isCreateLeadFilter) {
        const res = await request('/operator/products-for-lead');
        if (!res.ok) throw new Error('Mahsulotlar yuklanmadi');
        const data = await res.json();
        setProducts(data.products || []);
        setLeads([]);
        setOrders([]);
        setLoading(false);
        return;
      }
      if (isKonkursFilter) {
        setLeads([]);
        setOrders([]);
        await loadContestResults(contestPeriod);
      } else if (isFinanceFilter) {
        const res = await request('/operator/finance');
        if (!res.ok) throw new Error('Moliya yuklanmadi');
        const data = await res.json();
        setFinance({ earnings: data.earnings || [], total: data.total ?? 0 });
        setLeads([]);
        setOrders([]);
      } else if (isOrdersFilter) {
        const res = await request(`/operator/orders?filter=${filter}`);
        if (!res.ok) throw new Error('Zakazlar yuklanmadi');
        const data = await res.json();
        setOrders(data.orders || []);
        setLeads([]);
      } else {
        const todayParam = filter === 'pending' ? '&today=1' : '';
        const res = await request(`/operator/leads?status=${filter}${todayParam}`);
        if (!res.ok) throw new Error('Leadlar yuklanmadi');
        const data = await res.json();
        setLeads(data.leads || []);
        setProducts(data.products || []);
        setOrders([]);
      }
    } catch (e) {
      setError(e.message || "Ma'lumotlar yuklanmadi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (!isKonkursFilter) return;
    const t = setInterval(() => loadContestResults(contestPeriod), 5000);
    return () => clearInterval(t);
  }, [filter, contestPeriod]);

  useEffect(() => {
    if (!isLichkaFilter) return;
    let cancelled = false;
    (async () => {
      setDmPeersLoading(true);
      try {
        const res = await request('/operator/sklad-peers?operatorsOnly=1');
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
  }, [isLichkaFilter, request, pickerUiT.chatTeam, pickerUiT.dmRoleSupport]);

  useEffect(() => {
    const watch = isLichkaFilter && dmActivePeer?.id === 'myshop';
    if (!watch) {
      setSkladPresencePeers([]);
      return undefined;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await request('/operator/chat/presence?room=operators&staleSec=14');
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
  }, [isLichkaFilter, dmActivePeer?.id, request]);

  const skladPresenceSubtitle = useMemo(
    () => formatSkladPresenceSubtitle(skladPresencePeers, pickerUiT),
    [skladPresencePeers, pickerUiT]
  );

  const sendOperatorsPresence = useCallback(
    (state) => {
      void request('/operator/chat/presence', {
        method: 'POST',
        body: JSON.stringify({ chatRoom: 'operators', state }),
      }).catch(() => {});
    },
    [request]
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
    if (!isLichkaFilter || dmActivePeer?.id !== 'myshop') {
      setMyShopGroupOpen(false);
    }
  }, [isLichkaFilter, dmActivePeer?.id]);

  const goNav = (id) => {
    const next = normalizeOperatorTab(id);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next || next === 'pending') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true }
    );
    setSidePanelOpen(false);
    if (next !== 'lichka') setDmActivePeer(null);
  };

  const markNotificationRead = async (id) => {
    try {
      await request(`/operator/notifications/${id}/read`, { method: 'PATCH' });
    } catch (_) {}
    loadNotifications();
  };

  const handleReturn = async (leadId) => {
    setBusyId(leadId);
    setError('');
    try {
      const res = await request(`/operator/leads/${leadId}/return`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Qaytarish amalga oshmadi');
      }
      await loadData();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatus = async (leadId, status) => {
    setBusyId(leadId);
    setError('');
    try {
      const res = await request(`/operator/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Status yangilanmadi');
      }
      await loadData();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (lead) => {
    setDetailModal({ lead, product: null });
    setDetailLoading(true);
    try {
      const res = await request(`/operator/leads/${lead.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailModal(data);
      }
    } catch (_) {}
    setDetailLoading(false);
  };

  const openCreateOrder = (lead) => {
    setCreateModal(lead);
    setCreateForm({
      quantity: 1,
      shipping_address: '',
      contact_phone: lead.contact_phone || '',
      contact_email: lead.contact_email || '',
      is_test: false,
    });
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!createModal) return;
    setBusyId(createModal.id);
    setError('');
    try {
      const res = await request(`/operator/leads/${createModal.id}/create-order`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: createForm.quantity,
          shipping_address: createForm.shipping_address || null,
          contact_phone: createForm.contact_phone || null,
          contact_email: createForm.contact_email || null,
          is_test: !!createForm.is_test,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Zakaz yaratilmadi');
      }
      setCreateModal(null);
      await loadData();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    const productId = parseInt(String(leadCreateForm.product_id), 10);
    if (!productId || productId < 1) {
      setLeadCreateMessage('');
      setError('Mahsulotni tanlang.');
      return;
    }
    const phone = String(leadCreateForm.contact_phone || '').trim();
    const email = String(leadCreateForm.contact_email || '').trim();
    if (!phone && !email) {
      setError('Telefon yoki email kiriting.');
      return;
    }
    setLeadCreateBusy(true);
    setError('');
    setLeadCreateMessage('');
    try {
      const res = await request('/operator/leads', {
        method: 'POST',
        body: JSON.stringify({
          product_id: productId,
          contact_phone: phone || null,
          contact_email: email || null,
          full_name: String(leadCreateForm.full_name || '').trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Lead yaratilmadi');
      setLeadCreateMessage(d.message || 'Lead yaratildi. «Yangi» bo‘limida ko‘rasiz.');
      setLeadCreateForm({ product_id: '', full_name: '', contact_phone: '', contact_email: '' });
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setLeadCreateBusy(false);
    }
  };

  const sideNavItems = useMemo(
    () => [
      { id: 'create_lead', label: 'Lead yaratish', icon: '➕' },
      { id: 'lichka', label: pickerUiT.navMyShopChat, icon: myshopPlaneIcon },
      { id: 'pending', label: 'Yangi', icon: '📥' },
      { id: 'contacted', label: "Bog'langan", icon: '🔗' },
      { id: 'packaged', label: 'Qadoqlangan', icon: '📦' },
      { id: 'delivered', label: 'Sotildi', icon: '✅' },
      { id: 'cancelled', label: 'Arxiv zakazlar', icon: '📁' },
      { id: 'konkurs', label: 'Konkurs', icon: '🏆' },
      { id: 'finance', label: 'Moliya', icon: '💰' },
    ],
    [pickerUiT.navMyShopChat]
  );

  const filterTitle = useMemo(() => {
    const found = sideNavItems.find((n) => n.id === filter);
    if (found) return found.label;
    if (filter === 'finance') return 'Moliya';
    return '';
  }, [filter, sideNavItems]);

  const badgeText = useMemo(() => {
    if (filter === 'finance') return `Tushum: ${finance.earnings.length}`;
    if (isOrdersFilter) return `Zakazlar: ${orders.length}`;
    if (isCreateLeadFilter) return `Mahsulot: ${products.length}`;
    if (isLichkaFilter) return 'Chat';
    return `Leadlar: ${leads.length}`;
  }, [filter, finance.earnings.length, isOrdersFilter, orders.length, isCreateLeadFilter, products.length, isLichkaFilter, leads.length]);

  const mainTelegramLayout = isLichkaFilter;
  const hideTopbarForMessaging = isLichkaFilter;

  const todayLine = useMemo(
    () =>
      new Date().toLocaleDateString('uz-UZ', {
        timeZone: UZ_TIMEZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  return (
    <div className="picker-app picker-mobile operator-app-mobile">
      <div
        className={`picker-phone-frame${hideTopbarForMessaging ? ' picker-phone-frame--no-topbar' : ''}`}
      >
        {!hideTopbarForMessaging && (
          <header className="picker-topbar no-print operator-picker-topbar">
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
              <span className="picker-topbar-logo">MyShop Operator</span>
              <div className="picker-topbar-right">
                <StaffTopbarBellCluster
                  t={pickerUiT}
                  notificationsEnabled={notificationsEnabled}
                  notificationsOpen={notificationsOpen}
                  setNotificationsOpen={setNotificationsOpen}
                  unreadCount={unreadNotifCount}
                  onBellOpenChange={(open) => {
                    if (open) loadNotifications();
                  }}
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
                                    if (!n.read_at) markNotificationRead(n.id);
                                    setNotificationDetail(n);
                                    setNotificationsOpen(false);
                                  }}
                                >
                                  <span className="picker-bell-item-title">{n.title}</span>
                                  <span className="picker-bell-item-date">{formatDateTime(n.created_at)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </StaffTopbarBellCluster>
                <span className="picker-topbar-user" title={operatorName}>
                  {operatorName}
                </span>
              </div>
            </div>
          </header>
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
                <button type="button" className="picker-btn picker-btn-primary" onClick={() => setNotificationDetail(null)}>
                  Yopish
                </button>
              </div>
            </div>
          </div>
        )}

        <aside className={`picker-side-panel ${sidePanelOpen ? 'open' : ''}`} aria-hidden={!sidePanelOpen}>
          <div className="picker-side-panel-inner">
            <div className="picker-side-panel-head">Bo&apos;limlar</div>
            <p className="courier-side-intro operator-side-intro">
              <strong>{operatorName}</strong>
              <span className="courier-side-meta">{badgeText}</span>
            </p>
            <nav className="picker-side-panel-nav" aria-label="Operator bo'limlari">
              {sideNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`picker-side-panel-item ${filter === item.id ? 'picker-side-panel-item-active' : ''}`}
                  onClick={() => goNav(item.id)}
                >
                  <span
                    className={`picker-side-panel-item-icon${item.id === 'lichka' ? ' courier-side-nav-tg-plane' : ''}`}
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
          onClick={() => setSidePanelOpen(false)}
        />

        <main className={`picker-main operator-picker-main${mainTelegramLayout ? ' picker-main--telegram' : ''}`}>
          {isLichkaFilter ? (
            <PickerLichka
              t={pickerUiT}
              request={request}
              peers={dmPeers}
              peersLoading={dmPeersLoading}
              activePeer={dmActivePeer}
              setActivePeer={setDmActivePeer}
              threads={dmThreads}
              setThreads={setDmThreads}
              pickerChatNick={operatorName}
              skladPurgedRef={teamChatPurgedRef}
              onOpenMyShopGroup={openMyShopGroupPanel}
              onSkladThreadPurge={onSkladThreadPurge}
              skladPresenceSubtitle={skladPresenceSubtitle}
              onSkladPresence={sendOperatorsPresence}
              apiPrefix="/operator"
              teamChatRoom="operators"
              listTitleOverride={pickerUiT.navMyShopChat}
              listSubtitleOverride={pickerUiT.myshopOperatorsGroupSubtitle}
              listRegionAriaOverride={pickerUiT.courierMyShopChatRegionAria}
              onOpenSidePanel={() => setSidePanelOpen(true)}
              staffUserId={user?.id}
            />
          ) : (
            <>
              <h1 className="picker-title operator-main-title">{filterTitle}</h1>
              <p className="picker-subtitle">{todayLine}</p>

              {error && (
                <div className="operator-error picker-error-inline" role="alert">
                  {error}
                </div>
              )}

              {isCreateLeadFilter && loading ? (
                <div className="picker-loading">
                  <span className="picker-spinner" aria-hidden />
                  <span>Yuklanmoqda…</span>
                </div>
              ) : null}

              {isCreateLeadFilter && !loading ? (
                <form className="operator-lead-create-form" onSubmit={handleCreateLead}>
                  {leadCreateMessage ? <p className="operator-lead-create-ok">{leadCreateMessage}</p> : null}
                  <div className="operator-form-group">
                    <label>Mahsulot</label>
                    <select
                      value={leadCreateForm.product_id}
                      onChange={(e) => setLeadCreateForm((f) => ({ ...f, product_id: e.target.value }))}
                      required
                    >
                      <option value="">— Tanlang —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name_uz || `ID ${p.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="operator-form-group">
                    <label>Mijoz ismi</label>
                    <input
                      type="text"
                      value={leadCreateForm.full_name}
                      onChange={(e) => setLeadCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                      placeholder="Ixtiyoriy"
                    />
                  </div>
                  <div className="operator-form-group">
                    <label>Telefon</label>
                    <input
                      type="tel"
                      value={leadCreateForm.contact_phone}
                      onChange={(e) => setLeadCreateForm((f) => ({ ...f, contact_phone: e.target.value }))}
                      placeholder="+998…"
                    />
                  </div>
                  <div className="operator-form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={leadCreateForm.contact_email}
                      onChange={(e) => setLeadCreateForm((f) => ({ ...f, contact_email: e.target.value }))}
                      placeholder="Ixtiyoriy"
                    />
                  </div>
                  <p className="operator-lead-create-hint">Telefon yoki emaildan kamida bittasi majburiy.</p>
                  <button type="submit" className="picker-btn picker-btn-primary operator-lead-create-submit" disabled={leadCreateBusy}>
                    {leadCreateBusy ? 'Saqlanmoqda…' : 'Lead yaratish'}
                  </button>
                </form>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && loading ? (
                <div className="picker-loading">
                  <span className="picker-spinner" aria-hidden />
                  <span>Yuklanmoqda…</span>
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isKonkursFilter ? (
                <div className="operator-konkurs">
                  {!contestResults.active ? (
                    <div className="operator-konkurs-inactive">
                      Konkurs hozircha e&apos;lon qilinmagan. Superuser konkursni boshlaganda natijalar shu yerda
                      ko&apos;rinadi.
                    </div>
                  ) : (
                    <>
                      <div className="operator-konkurs-period">
                        <button
                          type="button"
                          className={contestPeriod === 'day' ? 'active' : ''}
                          onClick={() => {
                            setContestPeriod('day');
                            loadContestResults('day');
                          }}
                        >
                          Kunlik
                        </button>
                        <button
                          type="button"
                          className={contestPeriod === 'week' ? 'active' : ''}
                          onClick={() => {
                            setContestPeriod('week');
                            loadContestResults('week');
                          }}
                        >
                          Haftalik
                        </button>
                        <button
                          type="button"
                          className={contestPeriod === 'month' ? 'active' : ''}
                          onClick={() => {
                            setContestPeriod('month');
                            loadContestResults('month');
                          }}
                        >
                          Oylik
                        </button>
                      </div>
                      <div className="operator-konkurs-grid">
                        <section className="operator-konkurs-block">
                          <h3 className="operator-konkurs-title">Ko&apos;p zakaz olgan</h3>
                          <ol className="operator-konkurs-list">
                            {contestResults.topByOrdersCreated.map((row, i) => (
                              <li key={row.id || i} className="operator-konkurs-item">
                                <span className="operator-konkurs-rank">{i + 1}</span>
                                <span className="operator-konkurs-name">{row.name || '—'}</span>
                                <span className="operator-konkurs-count">{row.count} ta</span>
                              </li>
                            ))}
                          </ol>
                        </section>
                        <section className="operator-konkurs-block">
                          <h3 className="operator-konkurs-title">Ko&apos;p zakaz tushirgan</h3>
                          <ol className="operator-konkurs-list">
                            {contestResults.topByOrdersDelivered.map((row, i) => (
                              <li key={row.id || i} className="operator-konkurs-item">
                                <span className="operator-konkurs-rank">{i + 1}</span>
                                <span className="operator-konkurs-name">{row.name || '—'}</span>
                                <span className="operator-konkurs-count">{row.count} ta</span>
                              </li>
                            ))}
                          </ol>
                        </section>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isFinanceFilter ? (
                <div className="operator-finance">
                  <div className="operator-finance-total">
                    <span className="operator-finance-label">Jami operator ulushi</span>
                    <strong className="operator-finance-sum">{formatCurrency(finance.total)}</strong>
                  </div>
                  <ul className="operator-earnings-list">
                    {finance.earnings.map((e) => (
                      <li key={e.id} className="operator-earning-item">
                        <span>Zakaz #{e.order_id}</span>
                        <span>{formatCurrency(e.amount)}</span>
                        <span>{formatDateTime(e.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isOrdersFilter ? (
                <div className="operator-leads">
                  {orders.map((order) => (
                    <article key={order.id} className="operator-lead-card">
                      <div className="operator-lead-head">
                        <span className="operator-lead-id">Zakaz #{order.id}</span>
                        <span className={`operator-lead-status status-${order.status}`}>
                          {order.status === 'packaged' ? 'Qadoqlangan' : order.status === 'delivered' ? 'Sotildi' : 'Arxiv'}
                        </span>
                      </div>
                      <div className="operator-lead-body">
                        <p>
                          <strong>Summa:</strong> {formatCurrency(order.total_amount)}
                        </p>
                        <p>
                          <strong>Telefon:</strong>{' '}
                          {order.contact_phone ? <a href={`tel:${order.contact_phone}`}>{order.contact_phone}</a> : '—'}
                        </p>
                        <p>
                          <strong>Manzil:</strong> {order.shipping_address || '—'}
                        </p>
                        <p>
                          <strong>Vaqt:</strong> {formatDateTime(order.created_at)}
                        </p>
                        {order.items?.length > 0 && (
                          <p>
                            <strong>Mahsulotlar:</strong>{' '}
                            {order.items.map((i) => `${i.name_uz} × ${i.quantity}`).join(', ')}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isLeadsFilter ? (
                <div className="operator-leads">
                  {leads.length === 0 ? (
                    <div className="picker-empty operator-leads-empty">
                      <p>Hozircha lead yo&apos;q.</p>
                    </div>
                  ) : null}
                  {leads.map((lead) => (
                      <article
                        key={lead.id}
                        className={`operator-lead-card ${filter === 'pending' ? 'operator-lead-card-compact' : ''}`}
                      >
                        <div className="operator-lead-head">
                          <span className="operator-lead-id">#{lead.id}</span>
                          <span className={`operator-lead-status status-${lead.status}`}>
                            {STATUS_LABELS[lead.status] || lead.status}
                          </span>
                        </div>
                        {filter === 'pending' ? (
                          <div className="operator-lead-compact">
                            <p className="operator-lead-phone">
                              {lead.contact_phone ? (
                                <a href={`tel:${lead.contact_phone}`}>{lead.contact_phone}</a>
                              ) : (
                                lead.contact_email || '—'
                              )}
                            </p>
                            <p className="operator-lead-product">{lead.product_name}</p>
                            <div className="operator-lead-actions">
                              <button
                                type="button"
                                className="operator-btn operator-btn-primary"
                                onClick={() => openDetail(lead)}
                                disabled={detailLoading}
                              >
                                Batafsil
                              </button>
                              {lead.status === 'ordered' && lead.order_id ? (
                                <>
                                  <span className="operator-order-id">Zakaz #{lead.order_id}</span>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-warning"
                                    onClick={() => handleReturn(lead.id)}
                                    disabled={busyId === lead.id}
                                  >
                                    Qaytarish
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="operator-btn"
                                    onClick={() => handleStatus(lead.id, 'contacted')}
                                    disabled={busyId === lead.id}
                                  >
                                    Bog&apos;landim
                                  </button>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-primary"
                                    onClick={() => openCreateOrder(lead)}
                                    disabled={busyId === lead.id}
                                  >
                                    Zakaz qilish
                                  </button>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-danger"
                                    onClick={() => handleStatus(lead.id, 'cancelled')}
                                    disabled={busyId === lead.id}
                                  >
                                    Arxivga
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="operator-lead-body">
                              <p>
                                <strong>Mahsulot:</strong> {lead.product_name} — {formatCurrency(lead.product_price)}
                              </p>
                              <p>
                                <strong>Mijoz:</strong> {lead.full_name || '—'}
                              </p>
                              <p>
                                <strong>Telefon:</strong>{' '}
                                {lead.contact_phone ? (
                                  <a href={`tel:${lead.contact_phone}`}>{lead.contact_phone}</a>
                                ) : (
                                  '—'
                                )}
                              </p>
                              <p>
                                <strong>Email:</strong>{' '}
                                {lead.contact_email ? (
                                  <a href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a>
                                ) : (
                                  '—'
                                )}
                              </p>
                              <p>
                                <strong>Vaqt:</strong> {formatDateTime(lead.created_at)}
                              </p>
                              {lead.notes && (
                                <p>
                                  <strong>Izoh:</strong> {lead.notes}
                                </p>
                              )}
                            </div>
                            <div className="operator-lead-actions">
                              <button
                                type="button"
                                className="operator-btn"
                                onClick={() => openDetail(lead)}
                                disabled={detailLoading}
                              >
                                Batafsil
                              </button>
                              {lead.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    className="operator-btn"
                                    onClick={() => handleStatus(lead.id, 'contacted')}
                                    disabled={busyId === lead.id}
                                  >
                                    Bog&apos;landim
                                  </button>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-primary"
                                    onClick={() => openCreateOrder(lead)}
                                    disabled={busyId === lead.id}
                                  >
                                    Zakaz qilish
                                  </button>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-danger"
                                    onClick={() => handleStatus(lead.id, 'cancelled')}
                                    disabled={busyId === lead.id}
                                  >
                                    Arxivga
                                  </button>
                                </>
                              )}
                              {lead.status === 'contacted' && (
                                <>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-primary"
                                    onClick={() => openCreateOrder(lead)}
                                    disabled={busyId === lead.id}
                                  >
                                    Zakaz qilish
                                  </button>
                                  <button
                                    type="button"
                                    className="operator-btn"
                                    onClick={() => handleStatus(lead.id, 'cancelled')}
                                    disabled={busyId === lead.id}
                                  >
                                    Arxivga
                                  </button>
                                </>
                              )}
                              {lead.status === 'ordered' && lead.order_id && (
                                <>
                                  <span className="operator-order-id">Zakaz #{lead.order_id}</span>
                                  <button
                                    type="button"
                                    className="operator-btn operator-btn-warning"
                                    onClick={() => handleReturn(lead.id)}
                                    disabled={busyId === lead.id}
                                  >
                                    Qaytarish
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                </div>
              ) : null}

              {!isCreateLeadFilter &&
              !isLichkaFilter &&
              !loading &&
              !isLeadsFilter &&
              !isOrdersFilter &&
              !isFinanceFilter &&
              !isKonkursFilter ? (
                <div className="picker-empty">
                  <p>Bo&apos;lim tanlang.</p>
                </div>
              ) : null}
            </>
          )}
        </main>

        <PickerMyShopGroupPanel
          open={myShopGroupOpen}
          onClose={() => setMyShopGroupOpen(false)}
          section={myShopGroupSection}
          onSectionChange={setMyShopGroupSection}
          brandLine={pickerUiT.chatTeam}
          selfLine={`${operatorName} (${pickerUiT.groupYouMark})`}
          selfRoleHint={String(user?.role || '').trim() || ''}
          peers={groupPeersList}
          peersLoading={dmPeersLoading}
          messages={myShopPanelMessages}
          t={pickerUiT}
        />
      </div>

      {detailModal && (
        <div className="operator-modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="operator-modal operator-modal-detail" onClick={(e) => e.stopPropagation()}>
            <div className="operator-modal-header">
              <h4>Batafsil #{detailModal.lead?.id}</h4>
              <button type="button" className="operator-modal-close" onClick={() => setDetailModal(null)}>
                &times;
              </button>
            </div>
            <div className="operator-detail-body">
              {detailLoading ? (
                <p>Yuklanmoqda...</p>
              ) : detailModal.lead && detailModal.lead.product ? (
                <>
                  <section className="operator-detail-lead">
                    <h5>Mijoz</h5>
                    <p>
                      <strong>Ism:</strong> {detailModal.lead.full_name || '—'}
                    </p>
                    <p>
                      <strong>Telefon:</strong>{' '}
                      {detailModal.lead.contact_phone ? (
                        <a href={`tel:${detailModal.lead.contact_phone}`}>{detailModal.lead.contact_phone}</a>
                      ) : (
                        '—'
                      )}
                    </p>
                    <p>
                      <strong>Email:</strong>{' '}
                      {detailModal.lead.contact_email ? (
                        <a href={`mailto:${detailModal.lead.contact_email}`}>{detailModal.lead.contact_email}</a>
                      ) : (
                        '—'
                      )}
                    </p>
                    <p>
                      <strong>Vaqt:</strong> {formatDateTime(detailModal.lead.created_at)}
                    </p>
                  </section>
                  <section className="operator-detail-product">
                    <h5>Seller kiritgan mahsulot ma&apos;lumotlari</h5>
                    {detailModal.lead.product.image_url && (
                      <p>
                        <img src={detailModal.lead.product.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
                      </p>
                    )}
                    <p>
                      <strong>Nomi (UZ):</strong> {detailModal.lead.product.name_uz || '—'}
                    </p>
                    {detailModal.lead.product.name_ru && (
                      <p>
                        <strong>Nomi (RU):</strong> {detailModal.lead.product.name_ru}
                      </p>
                    )}
                    <p>
                      <strong>Narx:</strong> {formatCurrency(detailModal.lead.product.price)}
                    </p>
                    {detailModal.lead.product.category && (
                      <p>
                        <strong>Kategoriya:</strong> {detailModal.lead.product.category}
                      </p>
                    )}
                    <p>
                      <strong>Ombordagi:</strong> {detailModal.lead.product.stock ?? 0} ta
                    </p>
                    {detailModal.lead.product.description_uz && (
                      <p>
                        <strong>Tarif:</strong> {detailModal.lead.product.description_uz}
                      </p>
                    )}
                  </section>
                  <div className="operator-modal-actions">
                    <button
                      type="button"
                      className="operator-btn operator-btn-primary"
                      onClick={() => {
                        setDetailModal(null);
                        openCreateOrder(detailModal.lead);
                      }}
                    >
                      Zakaz qilish
                    </button>
                    <button type="button" className="operator-btn" onClick={() => setDetailModal(null)}>
                      Yopish
                    </button>
                  </div>
                </>
              ) : (
                <p>Ma&apos;lumot topilmadi</p>
              )}
            </div>
          </div>
        </div>
      )}

      {createModal && (
        <div className="operator-modal-overlay" onClick={() => setCreateModal(null)}>
          <div className="operator-modal" onClick={(e) => e.stopPropagation()}>
            <div className="operator-modal-header">
              <h4>Zakaz yaratish — {createModal.product_name}</h4>
              <button type="button" className="operator-modal-close" onClick={() => setCreateModal(null)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateOrder}>
              <div className="operator-form-group">
                <label>Miqdor</label>
                <input
                  type="number"
                  min={1}
                  value={createForm.quantity}
                  onChange={(e) => setCreateForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }))}
                  required
                />
              </div>
              <div className="operator-form-group">
                <label>Telefon</label>
                <input
                  type="tel"
                  value={createForm.contact_phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
              <div className="operator-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={createForm.contact_email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
              </div>
              <div className="operator-form-group">
                <label>Manzil</label>
                <input
                  type="text"
                  placeholder="Yetkazib berish manzili"
                  value={createForm.shipping_address}
                  onChange={(e) => setCreateForm((f) => ({ ...f, shipping_address: e.target.value }))}
                />
              </div>
              <div className="operator-form-group operator-form-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={!!createForm.is_test}
                    onChange={(e) => setCreateForm((f) => ({ ...f, is_test: e.target.checked }))}
                  />{' '}
                  Test zakaz (kuryer «Qaytarish (test)» tugmasi ko‘rinadi)
                </label>
              </div>
              <div className="operator-modal-actions">
                <button type="submit" className="operator-btn operator-btn-primary" disabled={busyId === createModal.id}>
                  {busyId === createModal.id ? '...' : 'Zakaz yaratish'}
                </button>
                <button type="button" className="operator-btn" onClick={() => setCreateModal(null)}>
                  Bekor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
