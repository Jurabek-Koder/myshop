import React, { useEffect, useMemo, useState, useCallback, useRef, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import {
  formatDateTimeUz,
  getDateTimePartsInUzbekistan,
  todayIsoDateInUzbekistan,
  UZ_TIMEZONE,
} from '../../utils/uzbekistanTime.js';
import PickerLichka from '../../components/picker/PickerLichka';
import StaffTopbarBellCluster, { StaffNotifModalHeader } from '../../components/staff/StaffTopbarBellCluster';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat';
import '../picker/PickerDashboard.css';
import './CourierDashboard.css';

const STATUS_LABELS = {
  pending: 'Kutilmoqda',
  assigned: 'Tayinlangan',
  picked_up: 'Olib ketildi',
  on_the_way: "Yo'lda",
  delivered: 'Sotildi',
  cancelled: 'Bekor',
  blocked: 'Kiyin oladi',
};

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatDateTime(value) {
  return formatDateTimeUz(value, { empty: '—' });
}

function formatBatchStamp(value, count) {
  const parts = getDateTimePartsInUzbekistan(value);
  const qty = Number(count) || 0;
  if (!parts?.date || !parts?.time) return `--.--.---- · --:-- · ${qty} ta`;
  const [year, month, day] = String(parts.date).split('-');
  return `${day}.${month}.${year} · ${parts.time} · ${qty} ta`;
}

function nextIsoDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [yy, mm, dd] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(yy, mm - 1, dd));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatIsoDateLabel(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '--.--.----';
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

function dayListTitle(dateKey, todayDateKey, tomorrowDateKey, suffixLabel) {
  if (dateKey === todayDateKey) return `Bugungi ${suffixLabel}`;
  if (dateKey === tomorrowDateKey) return `Ertangi ${suffixLabel}`;
  return `${formatIsoDateLabel(dateKey)} ${suffixLabel}`;
}

function formatCustomerName(order) {
  const full = String(order?.customer_full_name || '').trim();
  const last = String(order?.customer_last_name || '').trim();
  if (full && last) {
    const fLower = full.toLowerCase();
    const lLower = last.toLowerCase();
    if (fLower.endsWith(` ${lLower}`) || fLower === lLower) return full;
    return `${full} ${last}`.trim();
  }
  return full || last || 'Mijoz';
}

function formatOperatorMeta(order) {
  const id = order?.operator_id != null ? String(order.operator_id).trim() : '';
  const name = String(order?.operator_name || '').trim();
  if (id && name) return `#${id} ${name}`;
  if (id) return `#${id}`;
  if (name) return name;
  return '—';
}

/** Backend `courier/orders?filter=new` — `courier_assigned_via` NULL/bo‘sh yoki `expeditor` (courier_take emas). */
function isExpeditorHandoffVia(v) {
  const s = String(v ?? '').trim();
  return s === '' || s === 'expeditor';
}

const COURIER_TAB_KEYS = new Set([
  'new',
  'sklad',
  'courier_base',
  'all',
  'later',
  'delivered',
  'cancelled',
  'warehouse',
  'moliya',
  'konkurs',
  'lichka',
  'courier_calls',
]);

function normalizeCourierTab(raw) {
  const v = String(raw || '').trim();
  return COURIER_TAB_KEYS.has(v) ? v : 'new';
}

export default function CourierDashboard() {
  const { request, user, logout } = useAuth();
  const { t: pickerUiT, notificationsEnabled, setNotificationsEnabled } = usePickerUiSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => normalizeCourierTab(searchParams.get('tab')), [searchParams]);
  const selectedBatchId = useMemo(() => String(searchParams.get('batch') || '').trim(), [searchParams]);
  const [courier, setCourier] = useState(null);
  const [orders, setOrders] = useState([]);
  const [allSubFilter, setAllSubFilter] = useState(null);
  const [allDate, setAllDate] = useState('');
  const [courierFeePerOrder, setCourierFeePerOrder] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [busyHomeItemId, setBusyHomeItemId] = useState(null);
  const [contestResults, setContestResults] = useState({ active: false, period: 'day', topByDelivered: [] });
  const [contestPeriod, setContestPeriod] = useState('day');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmThreads, setDmThreads] = useState({});
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [packerClosedBatches, setPackerClosedBatches] = useState([]);
  const [openPackerBatches, setOpenPackerBatches] = useState({});
  const [openExpeditorBatches, setOpenExpeditorBatches] = useState({});
  const [openStandaloneNewBatches, setOpenStandaloneNewBatches] = useState({});
  const [openDailyNewBatches, setOpenDailyNewBatches] = useState({});
  const [openOutcomeBatches, setOpenOutcomeBatches] = useState({});
  const [myShopGroupOpen, setMyShopGroupOpen] = useState(false);
  const [myShopGroupSection, setMyShopGroupSection] = useState('members');
  const [skladPresencePeers, setSkladPresencePeers] = useState([]);
  const teamChatPurgedRef = useRef(new Set());
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const courierName = courier?.full_name || user?.full_name || 'Kuryer';
  const unreadNotifCount = notifications.filter((n) => !n.read_at).length;

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/courier/notifications');
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications || []);
      }
    } catch (_) {}
  }, [request]);

  const loadContestResults = async (period) => {
    try {
      const res = await request(`/courier/contest-results?period=${period || contestPeriod}`);
      if (res.ok) {
        const data = await res.json();
        setContestResults({
          active: data.active,
          period: data.period,
          topByDelivered: data.topByDelivered || [],
        });
      }
    } catch (_) {}
  };

  const loadData = async () => {
    if (filter === 'lichka' || filter === 'courier_calls') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const ordersFilter =
      filter === 'moliya'
        ? 'delivered'
        : filter === 'konkurs'
          ? null
          : filter === 'sklad' || filter === 'courier_base'
            ? 'new'
            : filter;
    try {
      if (filter === 'konkurs') {
        await loadContestResults(contestPeriod);
        setLoading(false);
        return;
      }
      const [meRes, ordersRes] = await Promise.all([
        request('/courier/me'),
        request(`/courier/orders?filter=${ordersFilter}`),
      ]);
      if (!meRes.ok) throw new Error('Kuryer profil yuklanmadi');
      if (!ordersRes.ok) throw new Error('Buyurtmalar yuklanmadi');
      const meData = await meRes.json();
      const ordersData = await ordersRes.json();
      setCourier(meData.courier);
      setOrders(ordersData.orders || []);
      setPackerClosedBatches(ordersData.packer_closed_batches || []);
      if (ordersData.courier_fee_per_order != null) {
        setCourierFeePerOrder(Number(ordersData.courier_fee_per_order) || 0);
      } else if (meData.courier_fee_per_order != null) {
        setCourierFeePerOrder(Number(meData.courier_fee_per_order) || 0);
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
    if (filter !== 'konkurs') return;
    const t = setInterval(() => loadContestResults(contestPeriod), 5000);
    return () => clearInterval(t);
  }, [filter, contestPeriod]);

  useEffect(() => {
    if (filter !== 'lichka') return;
    let cancelled = false;
    (async () => {
      setDmPeersLoading(true);
      try {
        const res = await request('/courier/sklad-peers');
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
  }, [filter, request, pickerUiT.chatTeam, pickerUiT.dmRoleSupport]);

  const loadCallLogs = useCallback(async () => {
    setCallLogsLoading(true);
    try {
      const res = await request('/courier/call-logs');
      const d = await res.json().catch(() => ({}));
      if (res.ok) setCallLogs(Array.isArray(d.logs) ? d.logs : []);
      else setCallLogs([]);
    } catch {
      setCallLogs([]);
    } finally {
      setCallLogsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (filter !== 'courier_calls') return;
    void loadCallLogs();
  }, [filter, loadCallLogs]);

  const skladPresenceSubtitle = useMemo(
    () => formatSkladPresenceSubtitle(skladPresencePeers, pickerUiT),
    [skladPresencePeers, pickerUiT]
  );

  const sendOperatorsPresence = useCallback(
    (state) => {
      void request('/courier/chat/presence', {
        method: 'POST',
        body: JSON.stringify({ chatRoom: 'operators', state }),
      }).catch(() => {});
    },
    [request]
  );

  useEffect(() => {
    const watch = filter === 'lichka' && dmActivePeer?.id === 'myshop';
    if (!watch) {
      setSkladPresencePeers([]);
      return undefined;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await request('/courier/chat/presence?room=operators&staleSec=14');
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
  }, [filter, dmActivePeer?.id, request]);

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
    if (filter !== 'lichka' || dmActivePeer?.id !== 'myshop') {
      setMyShopGroupOpen(false);
    }
  }, [filter, dmActivePeer?.id]);

  const handleTake = async (orderId) => {
    setBusyId(orderId);
    setError('');
    try {
      const res = await request(`/courier/orders/${orderId}/take`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Olishda xatolik');
      }
      await loadData();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatus = async (orderId, status, opts = {}) => {
    setBusyId(orderId);
    setError('');
    try {
      const body = { status };
      if (status === 'cancelled') {
        if (opts.courierUnsoldReturn === true) {
          body.courier_unsold_return = true;
        } else if (opts.courierUnsoldReturn === false) {
          body.courier_unsold_return = false;
        } else {
          body.courier_unsold_return = true;
        }
      }
      const res = await request(`/courier/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Status yangilanmadi');
      }
      await loadData();
      void loadCallLogs();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleReturnTest = async (orderId) => {
    setBusyId(orderId);
    setError('');
    try {
      const res = await request(`/courier/orders/${orderId}/return-test`, { method: 'POST' });
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

  const canToggleHomeMark = (order) =>
    Boolean(order?.courier_id) && !['delivered', 'blocked'].includes(String(order?.status || ''));

  const handleToggleHomeMark = async (orderId, itemId, nextValue) => {
    setBusyHomeItemId(itemId);
    setError('');
    try {
      const res = await request(`/courier/orders/${orderId}/items/${itemId}/home-left`, {
        method: 'PATCH',
        body: JSON.stringify({ home_left_in_courier: Boolean(nextValue) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Mahsulotni 'uyda qoldi' qilib belgilab bo'lmadi");
      }
      await loadData();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyHomeItemId(null);
    }
  };

  const togglePackerBatchOpen = (batchId) => {
    setOpenPackerBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const toggleExpeditorBatchOpen = (batchId) => {
    setOpenExpeditorBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const toggleStandaloneNewBatchOpen = (batchId) => {
    setOpenStandaloneNewBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const toggleDailyNewBatchOpen = (batchId) => {
    setOpenDailyNewBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const toggleOutcomeBatchOpen = (batchId) => {
    setOpenOutcomeBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const displayedOrders = useMemo(() => {
    let list = Array.isArray(orders) ? [...orders] : [];
    if (filter !== 'all') return list;
    if (allDate && allDate.trim()) {
      const dateStr = String(allDate).trim().slice(0, 10);
      list = list.filter((o) => {
        const raw = o?.created_at;
        if (!raw) return false;
        const parts = getDateTimePartsInUzbekistan(raw);
        return parts?.date === dateStr;
      });
    }
    if (allSubFilter) {
      if (allSubFilter === 'warehouse') {
        list = list.filter(
          (o) => String(o?.status) === 'cancelled' && Number(o.courier_unsold_return) === 1,
        );
      } else if (allSubFilter === 'cancelled') {
        list = list.filter(
          (o) =>
            String(o?.status) === 'cancelled' && Number(o.courier_unsold_return) !== 1,
        );
      } else {
        list = list.filter((o) => o?.status === allSubFilter);
      }
    }
    return list;
  }, [orders, filter, allDate, allSubFilter]);

  const expeditorClosedBatches = useMemo(() => {
    if (!['new', 'sklad', 'courier_base'].includes(filter)) return [];
    const rows = displayedOrders.filter(
      (o) =>
        Number(o?.courier_id) > 0 &&
        String(o?.status || '') === 'assigned' &&
        isExpeditorHandoffVia(o?.courier_assigned_via)
    );
    const groups = new Map();
    for (const row of rows) {
      const raw = String(row?.status_updated_at || row?.created_at || '').trim();
      const key = raw ? raw.slice(0, 16) : `order-${row.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          assignedAt: raw || null,
          orders: [],
        });
      }
      groups.get(key).orders.push(row);
    }
    return Array.from(groups.values()).sort((a, b) =>
      String(b.assignedAt || '').localeCompare(String(a.assignedAt || ''))
    );
  }, [filter, displayedOrders]);

  const standaloneDisplayedOrders = useMemo(() => {
    if (filter !== 'new') return displayedOrders;
    const expeditorOrderIds = new Set(
      expeditorClosedBatches.flatMap((batch) => (batch.orders || []).map((o) => Number(o.id)))
    );
    return displayedOrders.filter((o) => !expeditorOrderIds.has(Number(o.id)));
  }, [filter, displayedOrders, expeditorClosedBatches]);

  const standaloneNewBatches = useMemo(() => {
    if (filter !== 'new') return [];
    const rows = standaloneDisplayedOrders.filter(
      (o) => !o?.courier_id && String(o?.status || '') === 'packaged'
    );
    const groups = new Map();
    for (const row of rows) {
      const raw = String(row?.created_at || '').trim();
      const key = raw ? raw.slice(0, 16) : `new-${row.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          createdAt: raw || null,
          orders: [],
        });
      }
      groups.get(key).orders.push(row);
    }
    return Array.from(groups.values()).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  }, [filter, standaloneDisplayedOrders]);

  const todayDateKey = useMemo(() => todayIsoDateInUzbekistan(), []);
  const tomorrowDateKey = useMemo(() => nextIsoDate(todayDateKey), [todayDateKey]);

  const dailyNewBatches = useMemo(() => {
    if (!['new', 'courier_base'].includes(filter)) return [];
    const rows = displayedOrders.filter((o) => {
      const status = String(o?.status || '');
      const isPackagedPool = !o?.courier_id && status === 'packaged';
      return isPackagedPool;
    });
    const groups = new Map();
    for (const row of rows) {
      const sourceTime = row?.status_updated_at || row?.created_at || null;
      const parts = getDateTimePartsInUzbekistan(sourceTime);
      const dateKey = parts?.date || 'unknown';
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          id: `day-${dateKey}`,
          dateKey,
          anchorTime: sourceTime,
          orders: [],
        });
      }
      const group = groups.get(dateKey);
      group.orders.push(row);
      if (!group.anchorTime && sourceTime) {
        group.anchorTime = sourceTime;
      }
    }
    return Array.from(groups.values()).sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
  }, [filter, displayedOrders]);

  const outcomeListFilters = useMemo(() => new Set(['later', 'delivered', 'cancelled', 'warehouse']), []);

  const outcomeBatches = useMemo(() => {
    if (!outcomeListFilters.has(filter)) return [];
    const groups = new Map();
    for (const row of displayedOrders) {
      const sourceTime = row?.status_updated_at || row?.created_at || null;
      const parts = getDateTimePartsInUzbekistan(sourceTime);
      const dateKey = parts?.date || 'unknown';
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          id: `${filter}-${dateKey}`,
          dateKey,
          anchorTime: sourceTime,
          orders: [],
        });
      }
      const group = groups.get(dateKey);
      group.orders.push(row);
      if (!group.anchorTime && sourceTime) group.anchorTime = sourceTime;
    }
    return Array.from(groups.values()).sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
  }, [filter, displayedOrders, outcomeListFilters]);

  const hasDailyNewBatchesContent = useMemo(
    () => ['new', 'courier_base'].includes(filter) && dailyNewBatches.some((b) => (b.orders || []).length > 0),
    [filter, dailyNewBatches]
  );

  const courierMainListEmpty = useMemo(() => {
    if (loading) return false;
    if (filter === 'moliya' || filter === 'konkurs') return false;
    if (filter === 'sklad') return expeditorClosedBatches.length === 0;
    if (filter === 'courier_base') {
      return expeditorClosedBatches.length === 0 && !hasDailyNewBatchesContent;
    }
    if (filter !== 'new') return displayedOrders.length === 0;
    return !(hasDailyNewBatchesContent || expeditorClosedBatches.length > 0);
  }, [
    loading,
    filter,
    expeditorClosedBatches.length,
    displayedOrders.length,
    hasDailyNewBatchesContent,
  ]);

  const courierMainNav = useMemo(
    () => [
      { id: 'new', label: 'Yangi zakazlar', icon: '🆕' },
      { id: 'courier_base', label: 'Kuryer baza', icon: '🧭' },
      { id: 'sklad', label: 'Sklad', icon: '🏬' },
      { id: 'all', label: 'Barchasi', icon: '📋' },
      { id: 'later', label: 'Kiyin oladi', icon: '🕒' },
      { id: 'delivered', label: 'Sotildi', icon: '✅' },
      { id: 'cancelled', label: 'Bekor qilingan', icon: '⛔' },
      { id: 'warehouse', label: 'Skladga qaytarildi', icon: '📦' },
      { id: 'moliya', label: 'Moliya', icon: '💰' },
      { id: 'konkurs', label: 'Konkurs', icon: '🏆' },
    ],
    []
  );

  const sideNavItems = useMemo(
    () => [
      ...courierMainNav,
      {
        id: 'lichka',
        label: pickerUiT.navMyShopChat,
        icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        ),
      },
      {
        id: 'courier_calls',
        label: pickerUiT.courierNavCalls,
        icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        ),
      },
    ],
    [pickerUiT.navMyShopChat, pickerUiT.courierNavCalls, courierMainNav]
  );

  const filterTitle = useMemo(() => sideNavItems.find((n) => n.id === filter)?.label || '', [filter, sideNavItems]);

  const mainTelegramLayout = filter === 'lichka';
  const hideTopbarForMessaging = filter === 'lichka';

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

  const goNav = (id) => {
    const next = normalizeCourierTab(id);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next || next === 'new') p.delete('tab');
        else p.set('tab', next);
        if (next !== 'courier_base') p.delete('batch');
        return p;
      },
      { replace: true }
    );
    setAllSubFilter(null);
    if (next !== 'lichka') setDmActivePeer(null);
    setSidePanelOpen(false);
  };

  const markNotificationRead = async (id) => {
    try {
      await request(`/courier/notifications/${id}/read`, { method: 'PATCH' });
    } catch (_) {}
    loadNotifications();
  };

  useEffect(() => {
    if (filter !== 'courier_base') return;
    if (!selectedBatchId) return;
    if (String(selectedBatchId).startsWith('day-')) {
      setOpenDailyNewBatches((prev) => ({ ...prev, [selectedBatchId]: true }));
    } else {
      setOpenExpeditorBatches((prev) => ({ ...prev, [selectedBatchId]: true }));
    }
  }, [filter, selectedBatchId]);

  const renderOrderActions = (o) => {
    const canReturnTest =
      Number(o.is_test) === 1 &&
      o.courier_id &&
      ['assigned', 'picked_up', 'on_the_way'].includes(o.status);
    if (!o.courier_id) {
      return (
        <button
          type="button"
          className="picker-btn picker-btn-primary picker-btn-block"
          onClick={() => handleTake(o.id)}
          disabled={busyId === o.id}
        >
          {busyId === o.id ? '...' : 'Olish'}
        </button>
      );
    }
    return (
      <>
        {o.status === 'blocked' && (
          <div className="courier-blocked-actions">
            <button
              type="button"
              className="picker-btn courier-action-btn-sold courier-blocked-action-btn"
              onClick={() => handleStatus(o.id, 'delivered')}
              disabled={busyId === o.id}
            >
              Sotildi
            </button>
            <button
              type="button"
              className="picker-btn courier-action-btn-cancel courier-blocked-action-btn"
              onClick={() => handleStatus(o.id, 'cancelled', { courierUnsoldReturn: false })}
              disabled={busyId === o.id}
            >
              Bekor qilindi
            </button>
            <button
              type="button"
              className="picker-btn picker-btn-secondary courier-blocked-action-btn courier-blocked-action-btn--warehouse"
              onClick={() => handleStatus(o.id, 'cancelled', { courierUnsoldReturn: true })}
              disabled={busyId === o.id}
            >
              Skladga
            </button>
          </div>
        )}
        {canReturnTest ? (
          <button
            type="button"
            className="picker-btn picker-btn-outline picker-btn-block courier-return-test-btn"
            onClick={() => void handleReturnTest(o.id)}
            disabled={busyId === o.id}
          >
            {busyId === o.id ? '…' : pickerUiT.courierReturnTestBtn}
          </button>
        ) : null}
        {o.status === 'assigned' && (
          <button
            type="button"
            className="picker-btn picker-btn-secondary picker-btn-block"
            onClick={() => handleStatus(o.id, 'picked_up')}
            disabled={busyId === o.id}
          >
            Olib ketdim
          </button>
        )}
        {o.status === 'picked_up' && (
          <button
            type="button"
            className="picker-btn picker-btn-secondary picker-btn-block"
            onClick={() => handleStatus(o.id, 'on_the_way')}
            disabled={busyId === o.id}
          >
            Yo&apos;ldaman
          </button>
        )}
        {o.status === 'on_the_way' && (
          <>
            <button
              type="button"
              className="picker-btn courier-action-btn-sold picker-btn-block"
              onClick={() => handleStatus(o.id, 'delivered')}
              disabled={busyId === o.id}
            >
              Sotildi
            </button>
            <button
              type="button"
              className="picker-btn courier-action-btn-cancel picker-btn-block"
              onClick={() => handleStatus(o.id, 'cancelled')}
              disabled={busyId === o.id}
            >
              Bekor (atkaz)
            </button>
            <button
              type="button"
              className="picker-btn picker-btn-primary picker-btn-block"
              onClick={() => {
                const tel = String(o?.contact_phone || '').trim();
                if (!tel) return;
                window.location.href = `tel:${tel}`;
              }}
              disabled={busyId === o.id || !String(o?.contact_phone || '').trim()}
            >
              {pickerUiT.courierOrderCallBtn}
            </button>
          </>
        )}
      </>
    );
  };

  const renderOrderListCard = (o) => {
    const isPackagedPool = !o.courier_id && o.status === 'packaged';
    const cardTapTakeOrder = isPackagedPool;
    const isTest = Number(o.is_test) === 1;
    const statusLabel =
      o.status === 'cancelled' && Number(o.courier_unsold_return) === 1
        ? 'Skladga qaytarildi'
        : STATUS_LABELS[o.status] || o.status;
  return (
      <article
        className={`picker-card courier-order-card${cardTapTakeOrder ? ' courier-order-card--new-tap' : ''}${
          busyId === o.id ? ' courier-order-card--busy' : ''
        }`}
        role={cardTapTakeOrder ? 'button' : undefined}
        tabIndex={cardTapTakeOrder ? 0 : undefined}
        onClick={cardTapTakeOrder ? () => void handleTake(o.id) : undefined}
        onKeyDown={
          cardTapTakeOrder
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void handleTake(o.id);
                }
              }
            : undefined
        }
      >
        <div className="picker-card-header">
          <span className="picker-card-id">
            #{o.id}
            {isTest ? (
              <span className="courier-test-badge" title={pickerUiT.courierTestBadgeHint}>
                {pickerUiT.courierTestBadge}
              </span>
            ) : null}
          </span>
          <span className={`courier-status-pill courier-status-${o.status}`}>{statusLabel}</span>
          <span className="picker-card-date">{formatCurrency(o.total_amount)}</span>
        </div>
        <div className="courier-order-top-meta">
          <div className="courier-order-main-meta">
            <span className="courier-order-main-name">{formatCustomerName(o)}</span>
            <span className="courier-order-main-phone">{String(o?.contact_phone || '').trim() || '—'}</span>
          </div>
          <div className="courier-order-operator-inline">Operator: {formatOperatorMeta(o)}</div>
        </div>
        <div className="picker-card-body courier-order-card-body">
          <div className="picker-row">
            <span className="picker-label">Manzil</span>
            <span className="picker-value picker-address">{o.shipping_address || '—'}</span>
          </div>
          <div className="picker-row">
            <span className="picker-label">Vaqtlar</span>
            <span className="picker-value">
              {formatDateTime(o.created_at)} · {formatDateTime(o.status_updated_at || o.created_at)}
            </span>
          </div>
          <div className="picker-items-block">
            <span className="picker-label">Mahsulotlar</span>
            {o.items?.length > 0 ? (
              <ul className="picker-items">
                {o.items.map((it) => (
                  <li key={it.id} className="courier-item-line">
                    <div className="courier-item-line-main">
                      <span className="courier-item-name">{it.name_uz}</span>
                      <span className="courier-item-qty">× {it.quantity}</span>
                      {Number(it.home_left_in_courier) === 1 ? (
                        <span className="courier-item-home-badge">Uyda qoldi</span>
                      ) : null}
                    </div>
                    {canToggleHomeMark(o) ? (
                      <button
                        type="button"
                        className={`picker-btn picker-btn-outline courier-item-home-btn ${
                          Number(it.home_left_in_courier) === 1 ? 'courier-item-home-btn--active' : ''
                        }`}
                        disabled={busyHomeItemId === it.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleHomeMark(o.id, it.id, Number(it.home_left_in_courier) !== 1);
                        }}
                      >
                        {busyHomeItemId === it.id
                          ? '...'
                          : Number(it.home_left_in_courier) === 1
                            ? 'Uydan olindi'
                            : 'Uyda qoldi'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="picker-value">—</div>
            )}
          </div>
        </div>
        {cardTapTakeOrder ? (
          <div className="courier-new-order-tap-hint">
            Bosing — zakaz olinadi.
          </div>
        ) : null}
        {!cardTapTakeOrder &&
        ((o.courier_id &&
          (o.status === 'assigned' || o.status === 'picked_up' || o.status === 'on_the_way' || o.status === 'blocked')) ||
          !o.courier_id) ? (
          <div className="picker-card-footer courier-order-footer">{renderOrderActions(o)}</div>
        ) : null}
      </article>
    );
  };

  return (
    <div className="picker-app picker-mobile">
      <div
        className={`picker-phone-frame${hideTopbarForMessaging ? ' picker-phone-frame--no-topbar' : ''}`}
      >
        {!hideTopbarForMessaging && (
        <header className="picker-topbar no-print">
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
            <span className="picker-topbar-logo">MyShop Kuryer</span>
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
              <span className="picker-topbar-user" title={courierName}>
                {courierName}
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
            <p className="courier-side-intro">
              <strong>{courierName}</strong>
              <span className="courier-side-meta">
                ⭐ {courier?.rating ?? '—'} · {courier?.orders_handled ?? 0} ta buyurtma
              </span>
            </p>
            <nav className="picker-side-panel-nav" aria-label="Kuryer bo'limlari">
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

        <main className={`picker-main${mainTelegramLayout ? ' picker-main--telegram' : ''}`}>
          {filter === 'lichka' ? (
            <PickerLichka
              t={pickerUiT}
              request={request}
              peers={dmPeers}
              peersLoading={dmPeersLoading}
              activePeer={dmActivePeer}
              setActivePeer={setDmActivePeer}
              threads={dmThreads}
              setThreads={setDmThreads}
              pickerChatNick={courierName}
              skladPurgedRef={teamChatPurgedRef}
              onOpenMyShopGroup={openMyShopGroupPanel}
              onSkladThreadPurge={onSkladThreadPurge}
              skladPresenceSubtitle={skladPresenceSubtitle}
              onSkladPresence={sendOperatorsPresence}
              apiPrefix="/courier"
              teamChatRoom="operators"
              listTitleOverride={pickerUiT.navMyShopChat}
              listSubtitleOverride={pickerUiT.myshopOperatorsGroupSubtitle}
              listRegionAriaOverride={pickerUiT.courierMyShopChatRegionAria}
              onOpenSidePanel={() => setSidePanelOpen(true)}
              staffUserId={user?.id}
            />
          ) : filter === 'courier_calls' ? (
            <>
              <h1 className="picker-title">{pickerUiT.courierCallLogsTitle}</h1>
              <p className="picker-subtitle">{pickerUiT.courierCallLogsSubtitle}</p>
              <button
                type="button"
                className="picker-btn picker-btn-secondary courier-customer-chat-refresh"
                onClick={() => void loadCallLogs()}
                disabled={callLogsLoading}
              >
                {callLogsLoading ? `${pickerUiT.loading}…` : pickerUiT.refresh}
              </button>
              {callLogsLoading && callLogs.length === 0 ? (
                <p className="picker-lichka-loading">{pickerUiT.loading}</p>
              ) : null}
              {!callLogsLoading && callLogs.length === 0 ? (
                <p className="picker-empty">{pickerUiT.courierCallLogsEmpty}</p>
              ) : null}
              {callLogs.length > 0 ? (
                <div className="picker-list courier-calls-log-list">
                  {callLogs.map((log) => (
                    <article key={log.id} className="picker-card">
                      <div className="picker-card-header">
                        <span className="picker-card-id">
                          {pickerUiT.courierCallLogOrder} #{log.order_id}
                        </span>
                        <span className="picker-card-date">{formatDateTime(log.created_at)}</span>
                      </div>
                      <div className="picker-card-body">
                        <div className="picker-row">
                          <span className="picker-label">{pickerUiT.courierCallLogStatus}</span>
                          <span className="picker-value">
                            {STATUS_LABELS[log.order_status] || log.order_status}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
          <h1 className="picker-title">{filterTitle}</h1>
          <p className="picker-subtitle">{todayLine}</p>

          {error && (
            <div className="picker-error" role="alert">
              {error}
            </div>
          )}

          {filter === 'all' && (
            <div className="courier-toolbar">
              <div className="courier-chip-scroll" role="tablist" aria-label="Filtr">
                <button
                  type="button"
                  className={`courier-chip courier-chip--hammasi${allSubFilter === null ? ' courier-chip--active' : ''}`}
                  onClick={() => setAllSubFilter(null)}
                >
                  Hammasi
                </button>
                <button
                  type="button"
                  className={`courier-chip courier-chip--sotildi${allSubFilter === 'delivered' ? ' courier-chip--active' : ''}`}
                  onClick={() => setAllSubFilter('delivered')}
                >
                  Sotildi
                </button>
                <button
                  type="button"
                  className={`courier-chip courier-chip--kiyin-oladi${allSubFilter === 'blocked' ? ' courier-chip--active' : ''}`}
                  onClick={() => setAllSubFilter('blocked')}
                >
                  Kiyin oladi
                </button>
                <button
                  type="button"
                  className={`courier-chip courier-chip--bekor${allSubFilter === 'cancelled' ? ' courier-chip--active' : ''}`}
                  onClick={() => setAllSubFilter('cancelled')}
                >
                  Bekor qilindi
                </button>
                <button
                  type="button"
                  className={`courier-chip courier-chip--sklad${allSubFilter === 'warehouse' ? ' courier-chip--active' : ''}`}
                  onClick={() => setAllSubFilter('warehouse')}
                >
                  Sklad
                </button>
              </div>
              <label className="courier-date-field">
                <span className="courier-date-field-label">Sana</span>
                <input
                  type="date"
                  className="courier-date-input"
                  value={allDate || ''}
                  onChange={(e) => setAllDate(e.target.value || '')}
                />
                {allDate ? (
                  <button type="button" className="picker-btn picker-btn-secondary courier-date-clear" onClick={() => setAllDate('')}>
                    Tozalash
                  </button>
                ) : null}
              </label>
          </div>
        )}

        {filter === 'konkurs' ? (
          <div className="courier-konkurs">
            {!contestResults.active ? (
                <div className="picker-empty">
                  <p>
                    Konkurs hozircha e&apos;lon qilinmagan. Superuser konkursni boshlaganda reyting shu yerda
                    ko&apos;rinadi.
                  </p>
                </div>
            ) : (
              <>
                <div className="courier-konkurs-period">
                    <button
                      type="button"
                      className={`courier-konkurs-tab ${contestPeriod === 'day' ? 'courier-konkurs-tab--active' : ''}`}
                      onClick={() => {
                        setContestPeriod('day');
                        loadContestResults('day');
                      }}
                    >
                      Kunlik
                    </button>
                    <button
                      type="button"
                      className={`courier-konkurs-tab ${contestPeriod === 'week' ? 'courier-konkurs-tab--active' : ''}`}
                      onClick={() => {
                        setContestPeriod('week');
                        loadContestResults('week');
                      }}
                    >
                      Haftalik
                    </button>
                    <button
                      type="button"
                      className={`courier-konkurs-tab ${contestPeriod === 'month' ? 'courier-konkurs-tab--active' : ''}`}
                      onClick={() => {
                        setContestPeriod('month');
                        loadContestResults('month');
                      }}
                    >
                      Oylik
                    </button>
                  </div>
                  <section className="picker-card courier-konkurs-card">
                    <div className="picker-card-header">
                      <span className="picker-card-id">Ko&apos;p yetkazganlar</span>
                </div>
                    <div className="picker-card-body courier-konkurs-body">
                  <ol className="courier-konkurs-list">
                    {contestResults.topByDelivered.map((row, i) => (
                      <li key={row.id || i} className="courier-konkurs-item">
                        <span className="courier-konkurs-rank">{i + 1}</span>
                        <span className="courier-konkurs-name">{row.name || '—'}</span>
                        <span className="courier-konkurs-count">{row.count} ta</span>
                      </li>
                    ))}
                  </ol>
                    </div>
                </section>
              </>
            )}
          </div>
          ) : loading ? (
            <div className="picker-loading">
              <span className="picker-spinner" aria-hidden />
              <span>Yuklanmoqda…</span>
            </div>
          ) : filter === 'moliya' ? (
          <div className="courier-moliya">
            <div className="courier-moliya-cards">
                <div className="picker-withdrawal-card courier-moliya-stat">
                <span className="courier-moliya-label">Jami yetkazilgan</span>
                <strong className="courier-moliya-value">{courier?.orders_handled ?? 0} ta</strong>
              </div>
                <div className="picker-withdrawal-card courier-moliya-stat">
                  <span className="courier-moliya-label">Ro&apos;yxatdagi buyurtmalar</span>
                <strong className="courier-moliya-value">{orders.length} ta</strong>
              </div>
                <div className="picker-withdrawal-card courier-moliya-stat">
                <span className="courier-moliya-label">Kuryer haqqi (1 ta)</span>
                <strong className="courier-moliya-value">{formatCurrency(orders[0]?.courier_fee ?? courierFeePerOrder)}</strong>
              </div>
                <div className="picker-withdrawal-card courier-moliya-stat">
                <span className="courier-moliya-label">Kuryer haqqi (jami)</span>
                  <strong className="courier-moliya-value">
                    {formatCurrency(orders.reduce((s, o) => s + (Number(o.courier_fee ?? courierFeePerOrder) || 0), 0))}
                  </strong>
              </div>
                <div className="picker-withdrawal-card courier-moliya-stat">
                  <span className="courier-moliya-label">Buyurtmalar jami</span>
                  <strong className="courier-moliya-value">
                    {formatCurrency(orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0))}
                  </strong>
              </div>
                <div className="picker-withdrawal-card courier-moliya-stat courier-moliya-stat--net">
                  <span className="courier-moliya-label">Qolgan (haqq chiqarilgach)</span>
                  <strong className="courier-moliya-value courier-moliya-value--net">
                  {formatCurrency(
                    orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) -
                    orders.reduce((s, o) => s + (Number(o.courier_fee ?? courierFeePerOrder) || 0), 0)
                  )}
                </strong>
              </div>
            </div>
              <h2 className="courier-moliya-list-title">Sotilgan buyurtmalar</h2>
              <div className="picker-list">
                  {orders.slice(0, 50).map((o) => (
                  <article key={o.id} className="picker-card">
                    <div className="picker-card-header">
                      <span className="picker-card-id">#{o.id}</span>
                      <span className="picker-card-date">{formatCurrency(o.total_amount)}</span>
                    </div>
                    <div className="picker-card-body">
                      <div className="picker-row">
                        <span className="picker-label">Kuryer haqqi</span>
                        <strong className="picker-value">{formatCurrency(o.courier_fee ?? courierFeePerOrder)}</strong>
                      </div>
                      <div className="picker-row">
                        <span className="picker-label">Manzil</span>
                        <span className="picker-value picker-address">{o.shipping_address || '—'}</span>
                      </div>
                      <div className="picker-row">
                        <span className="picker-label">Vaqt</span>
                        <span className="picker-value">{formatDateTime(o.created_at)}</span>
                      </div>
                      </div>
                    </article>
                  ))}
                </div>
            </div>
          ) : courierMainListEmpty ? (
            <div className="picker-empty">
              <div className="picker-empty-icon" aria-hidden>
                📦
              </div>
              <p>Bu bo&apos;limda hozir buyurtma yo&apos;q.</p>
          </div>
        ) : (
            <>
              {filter === 'new' || filter === 'sklad' || filter === 'courier_base' ? (
                <div className="courier-packer-batches" aria-label="Kuryer baza listlari">
                  {expeditorClosedBatches.map((batch) => {
                    const batchOrders = batch.orders || [];
                    if (!batchOrders.length) return null;
                    const open = !!openExpeditorBatches[batch.id];
                    const countLabel = `${batchOrders.length} ta`;
                    const totalAmount = batchOrders.reduce((sum, o) => sum + (Number(o?.total_amount) || 0), 0);
                    const totalLabel = formatCurrency(totalAmount);
                    const stamp = formatBatchStamp(batch.assignedAt, batchOrders.length);
                    return (
                      <section key={batch.id} className="courier-packer-batch">
                        <div
                          className="courier-packer-batch-toolbar"
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={() => {
                            if (filter === 'new') {
                              setSearchParams(
                                (prev) => {
                                  const p = new URLSearchParams(prev);
                                  p.set('tab', 'courier_base');
                                  p.set('batch', String(batch.id));
                                  return p;
                                },
                                { replace: true }
                              );
                              return;
                            }
                            toggleExpeditorBatchOpen(batch.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (filter === 'new') {
                                setSearchParams(
                                  (prev) => {
                                    const p = new URLSearchParams(prev);
                                    p.set('tab', 'courier_base');
                                    p.set('batch', String(batch.id));
                                    return p;
                                  },
                                  { replace: true }
                                );
                                return;
                              }
                              toggleExpeditorBatchOpen(batch.id);
                            }
                          }}
                        >
                          <div className="courier-packer-batch-meta">
                            <span className="courier-packer-batch-title">Kuryer baza listi</span>
                            <span className="courier-packer-batch-sub courier-packer-batch-sub--stats">
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--sum">{totalLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--count">{countLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--date">{stamp}</span>
                            </span>
                          </div>
                          <span className="courier-packer-batch-caret" aria-hidden>{open ? '▾' : '▸'}</span>
                        </div>
                        {open ? (
                          <div className="picker-list courier-packer-batch-orders">
                            {batchOrders.map((o) => (
                              <Fragment key={o.id}>{renderOrderListCard(o)}</Fragment>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
              {['new', 'courier_base'].includes(filter) && dailyNewBatches.length > 0 ? (
                <div className="courier-packer-batches" aria-label="Kunlik yangi zakazlar listlari">
                  {dailyNewBatches.map((batch) => {
                    const batchOrders = batch.orders || [];
                    if (!batchOrders.length) return null;
                    const open = !!openDailyNewBatches[batch.id];
                    const title = dayListTitle(batch.dateKey, todayDateKey, tomorrowDateKey, 'yangi zakazlar');
                    const totalAmount = batchOrders.reduce((sum, o) => sum + (Number(o?.total_amount) || 0), 0);
                    const countLabel = `${batchOrders.length} ta`;
                    const totalLabel = formatCurrency(totalAmount);
                    const dateLabel = formatIsoDateLabel(batch.dateKey);
                    const openDailyBatchFromNew = () => {
                      if (filter === 'new') {
                        setSearchParams(
                          (prev) => {
                            const p = new URLSearchParams(prev);
                            p.set('tab', 'courier_base');
                            p.set('batch', String(batch.id));
                            return p;
                          },
                          { replace: true }
                        );
                        return;
                      }
                      toggleDailyNewBatchOpen(batch.id);
                    };
                    return (
                      <section key={batch.id} className="courier-packer-batch">
                        <div
                          className="courier-packer-batch-toolbar"
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={openDailyBatchFromNew}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDailyBatchFromNew();
                            }
                          }}
                        >
                          <div className="courier-packer-batch-meta">
                            <span className="courier-packer-batch-title">{title}</span>
                            <span className="courier-packer-batch-sub courier-packer-batch-sub--stats">
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--sum">{totalLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--count">{countLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--date">{dateLabel}</span>
                            </span>
                          </div>
                          <span className="courier-packer-batch-caret" aria-hidden>{open ? '▾' : '▸'}</span>
                        </div>
                        {open ? (
                          <div className="picker-list courier-packer-batch-orders">
                            {batchOrders.map((o) => (
                              <Fragment key={o.id}>{renderOrderListCard(o)}</Fragment>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
              {outcomeListFilters.has(filter) && outcomeBatches.length > 0 ? (
                <div className="courier-packer-batches" aria-label={`${filterTitle} listlari`}>
                  {outcomeBatches.map((batch) => {
                    const batchOrders = batch.orders || [];
                    if (!batchOrders.length) return null;
                    const open = !!openOutcomeBatches[batch.id];
                    const outcomeLabel = (filterTitle || 'zakazlar').toLowerCase();
                    const title = dayListTitle(batch.dateKey, todayDateKey, tomorrowDateKey, outcomeLabel);
                    const totalAmount = batchOrders.reduce((sum, o) => sum + (Number(o?.total_amount) || 0), 0);
                    const countLabel = `${batchOrders.length} ta`;
                    const totalLabel = formatCurrency(totalAmount);
                    const dateLabel = formatIsoDateLabel(batch.dateKey);
                    return (
                      <section key={batch.id} className="courier-packer-batch">
                        <div
                          className="courier-packer-batch-toolbar"
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={() => toggleOutcomeBatchOpen(batch.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleOutcomeBatchOpen(batch.id);
                            }
                          }}
                        >
                          <div className="courier-packer-batch-meta">
                            <span className="courier-packer-batch-title">{title}</span>
                            <span className="courier-packer-batch-sub courier-packer-batch-sub--stats">
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--sum">{totalLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--count">{countLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--date">{dateLabel}</span>
                            </span>
                          </div>
                          <span className="courier-packer-batch-caret" aria-hidden>{open ? '▾' : '▸'}</span>
                        </div>
                        {open ? (
                          <div className="picker-list courier-packer-batch-orders">
                            {batchOrders.map((o) => (
                              <Fragment key={o.id}>{renderOrderListCard(o)}</Fragment>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
              {!outcomeListFilters.has(filter) && filter !== 'new' && standaloneDisplayedOrders.length > 0 ? (
                <div className="picker-list">
                  {standaloneDisplayedOrders.map((o) => (
                    <Fragment key={o.id}>{renderOrderListCard(o)}</Fragment>
                  ))}
                </div>
              ) : null}
            </>
                        )}
                      </>
                    )}
        </main>

        <PickerMyShopGroupPanel
          open={myShopGroupOpen}
          onClose={() => setMyShopGroupOpen(false)}
          section={myShopGroupSection}
          onSectionChange={setMyShopGroupSection}
          brandLine={pickerUiT.chatTeam}
          selfLine={`${courierName} (${pickerUiT.groupYouMark})`}
          selfRoleHint={String(user?.role || '').trim() || ''}
          peers={groupPeersList}
          peersLoading={dmPeersLoading}
          messages={myShopPanelMessages}
          t={pickerUiT}
        />
        </div>
    </div>
  );
}
