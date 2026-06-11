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
import StaffAdvanceConfirm from '../../components/StaffAdvanceConfirm.jsx';
import StaffNotificationBell from '../../components/notifications/StaffNotificationBell.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu';
import StaffTopbarCenterId from '../../components/staff/StaffTopbarCenterId.jsx';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat';
import '../picker/PickerDashboard.css';
import './CourierDashboard.css';
import '../expeditor/ExpeditorDashboard.css';
import StaffTransactionTimeline from '../../components/finance/StaffTransactionTimeline.jsx';

const STATUS_LABELS = {
  pending: 'Kutilmoqda',
  assigned: 'Tayinlangan',
  picked_up: 'Olib ketildi',
  on_the_way: "Yo'lda",
  delivered: 'Sotildi',
  cancelled: 'Bekor',
  blocked: 'Kiyin oladi',
  left_at_home: 'Uyda qoldi',
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

const myshopPlaneIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false">
    <defs>
      <linearGradient id="courierSidebarTelegram" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
        <stop stopColor="#37aee2" />
        <stop offset="1" stopColor="#1e96c8" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="11" fill="url(#courierSidebarTelegram)" />
    <path
      fill="#fff"
      d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.12-.46-.52-.19l-9.48 5.99-4.1-1.3c-.88-.25-.89-.86.2-1.3L19.81 4.54c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.08-3.08-2.05 1.95c-.23.23-.42.42-.83.42z"
    />
  </svg>
);

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

/** Biriktirilish/yangilanish vaqti bo‘yicha — birinchisi ustunda (navbat). */
function sortBatchOrdersByAssignedTimeAsc(orders) {
  return [...(orders || [])].sort((a, b) => {
    const ta = String(a?.status_updated_at || a?.created_at || '').trim();
    const tb = String(b?.status_updated_at || b?.created_at || '').trim();
    return ta.localeCompare(tb);
  });
}

const COURIER_TAB_KEYS = new Set([
  'lists',
  'sklad',
  'courier_base',
  'later',
  'delivered',
  'cancelled',
  'warehouse',
  'moliya',
  'konkurs',
  'lichka',
  'courier_calls',
  'profile',
  'settings',
]);

function normalizeCourierTab(raw) {
  const v = String(raw || '').trim();
  if (v === 'new' || v === 'all') return 'lists';
  return COURIER_TAB_KEYS.has(v) ? v : 'lists';
}

export default function CourierDashboard() {
  const { request, user, logout, retrySession, updateProfile } = useAuth();
  const { t: pickerUiT, notificationsEnabled, setNotificationsEnabled, locale, setLocale } = usePickerUiSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => normalizeCourierTab(searchParams.get('tab')), [searchParams]);
  const selectedBatchId = useMemo(() => String(searchParams.get('batch') || '').trim(), [searchParams]);
  const [courier, setCourier] = useState(null);
  const [orders, setOrders] = useState([]);
  const [courierFeePerOrder, setCourierFeePerOrder] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [busyHomeItemId, setBusyHomeItemId] = useState(null);
  const [contestResults, setContestResults] = useState({ active: false, period: 'day', topByDelivered: [] });
  const [contestPeriod, setContestPeriod] = useState('day');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmThreads, setDmThreads] = useState({});
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [packerClosedBatches, setPackerClosedBatches] = useState([]);
  const [leftAtHomeProducts, setLeftAtHomeProducts] = useState([]);
  const [moliyaStats, setMoliyaStats] = useState([]);
  const [expeditorHandoffBatches, setExpeditorHandoffBatches] = useState([]);
  const [openExpeditorHandoffBatches, setOpenExpeditorHandoffBatches] = useState({});
  const [expeditorHandoffBatchOrders, setExpeditorHandoffBatchOrders] = useState({});
  const [openPackerBatches, setOpenPackerBatches] = useState({});
  const [openExpeditorBatches, setOpenExpeditorBatches] = useState({});
  const [openStandaloneNewBatches, setOpenStandaloneNewBatches] = useState({});
  const [openDailyNewBatches, setOpenDailyNewBatches] = useState({});
  const [openOutcomeBatches, setOpenOutcomeBatches] = useState({});
  const [myShopGroupOpen, setMyShopGroupOpen] = useState(false);
  const [myShopGroupSection, setMyShopGroupSection] = useState('members');
  const [skladPresencePeers, setSkladPresencePeers] = useState([]);
  const [withdrawRoleBalance, setWithdrawRoleBalance] = useState(null);
  const [withdrawNoWorkRole, setWithdrawNoWorkRole] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPayoutMethod, setWithdrawPayoutMethod] = useState('cash');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [withdrawMsgIsError, setWithdrawMsgIsError] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);
  const [financeTransactions, setFinanceTransactions] = useState([]);
  const [courierProfileForm, setCourierProfileForm] = useState({
    full_name: '',
    phone: '',
    avatar_url: '',
    email: '',
    login: '',
    password: '',
    password2: '',
  });
  const [courierProfileLoading, setCourierProfileLoading] = useState(false);
  const [courierProfileSaving, setCourierProfileSaving] = useState(false);
  const [courierProfileError, setCourierProfileError] = useState('');
  const [courierProfileOk, setCourierProfileOk] = useState('');
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
    if (filter === 'lichka' || filter === 'courier_calls' || filter === 'profile' || filter === 'settings') {
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
          : filter === 'lists'
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
      if (filter === 'lists') {
        const [meRes, listsRes, ordersRes] = await Promise.all([
          request('/courier/me'),
          request('/courier/handoff-lists'),
          request('/courier/orders?filter=new'),
        ]);
        if (!meRes.ok) throw new Error('Kuryer profil yuklanmadi');
        if (!listsRes.ok) throw new Error('Listlar yuklanmadi');
        const meData = await meRes.json();
        const listsData = await listsRes.json();
        const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] };
        
        setCourier(meData.courier);
        setExpeditorHandoffBatches(listsData.batches || []);
        setOrders(ordersData.orders || []);
        setPackerClosedBatches([]);
        if (listsData.courier_fee_per_order != null) {
          setCourierFeePerOrder(Number(listsData.courier_fee_per_order) || 0);
        } else if (meData.courier_fee_per_order != null) {
          setCourierFeePerOrder(Number(meData.courier_fee_per_order) || 0);
        }
        setLoading(false);
        return;
      }
      if (filter === 'courier_base') {
        const [meRes, productsRes] = await Promise.all([
          request('/courier/me'),
          request('/courier/left-at-home-products'),
        ]);
        if (!meRes.ok) throw new Error('Kuryer profil yuklanmadi');
        if (!productsRes.ok) throw new Error('Maxsulotlar yuklanmadi');
        const meData = await meRes.json();
        const productsData = await productsRes.json();
        setCourier(meData.courier);
        setLeftAtHomeProducts(productsData.products || []);
        setLoading(false);
        return;
      }
      
      const pArr = [
        request('/courier/me'),
        request(`/courier/orders?filter=${ordersFilter}`),
      ];
      if (filter === 'moliya') {
        pArr.push(request('/courier/moliya-stats'));
      }
      
      const resArr = await Promise.all(pArr);
      const meRes = resArr[0];
      const ordersRes = resArr[1];
      const statsRes = resArr[2];

      if (!meRes.ok) throw new Error('Kuryer profil yuklanmadi');
      if (!ordersRes.ok) throw new Error('Buyurtmalar yuklanmadi');
      
      const meData = await meRes.json();
      const ordersData = await ordersRes.json();
      
      setCourier(meData.courier);
      setOrders(ordersData.orders || []);
      setPackerClosedBatches(ordersData.packer_closed_batches || []);

      if (filter === 'moliya' && statsRes) {
        if (!statsRes.ok) throw new Error('Moliya statistikasi yuklanmadi');
        const statsData = await statsRes.json();
        setMoliyaStats(statsData.stats || []);
      }
      if (ordersData.courier_fee_per_order != null) {
        setCourierFeePerOrder(Number(ordersData.courier_fee_per_order) || 0);
      } else if (meData.courier_fee_per_order != null) {
        setCourierFeePerOrder(Number(meData.courier_fee_per_order) || 0);
      }

      if (meData.has_work_role === false) {
        setWithdrawNoWorkRole(true);
      } else {
        setWithdrawNoWorkRole(false);
      }
      if (meData.work_role_balance != null) {
        setWithdrawRoleBalance(Number(meData.work_role_balance));
      }
    } catch (e) {
      setError(e.message || "Ma'lumotlar yuklanmadi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const raw = String(searchParams.get('tab') || '').trim();
    if (raw === 'new' || raw === 'all') {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('tab');
          return p;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    loadData();
  }, [filter]);

  useEffect(() => {
    if (filter !== 'profile') return undefined;
    let cancelled = false;
    setCourierProfileError('');
    setCourierProfileOk('');
    (async () => {
      setCourierProfileLoading(true);
      try {
        const res = await request('/courier/profile');
        const d = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const p = d.profile || {};
        setCourierProfileForm({
          full_name: String(p.full_name || '').trim(),
          phone: String(p.phone || '').trim(),
          avatar_url: String(p.avatar_url || '').trim(),
          email: String(p.email || '').trim(),
          login: String(p.login || '').trim(),
          password: '',
          password2: '',
        });
      } catch {
        if (!cancelled) setCourierProfileError('Profil yuklanmadi.');
      } finally {
        if (!cancelled) setCourierProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, request]);

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (filter !== 'konkurs') return;
    const t = setInterval(() => loadContestResults(contestPeriod), 5000);
    return () => clearInterval(t);
  }, [filter, contestPeriod]);

  useEffect(() => {
    if (filter !== 'moliya') return undefined;
    let cancelled = false;
    setWithdrawNoWorkRole(false);
    setWithdrawMsg('');
    setWithdrawMsgIsError(false);
    (async () => {
      try {
        const bRes = await request('/courier/work-role/balance');
        const bData = await bRes.json().catch(() => ({}));
        if (cancelled) return;
        if (bRes.status === 404 && bData.code === 'no_work_role') {
          setWithdrawNoWorkRole(true);
          setWithdrawRoleBalance(null);
          return;
        }
        if (bRes.ok) setWithdrawRoleBalance(Number(bData.balance) || 0);
        else setWithdrawRoleBalance(null);
        
        try {
          const fRes = await request('/courier/finance');
          if (fRes.ok) {
            const fData = await fRes.json().catch(() => ({}));
            setFinanceTransactions(Array.isArray(fData.transactions) ? fData.transactions : []);
            setWithdrawals(Array.isArray(fData.withdrawals) ? fData.withdrawals : []);
          } else {
            const wRes = await request('/courier/withdrawals');
            if (wRes.ok) {
              const wData = await wRes.json().catch(() => ({}));
              setWithdrawals(wData.withdrawals || []);
            }
            setFinanceTransactions([]);
          }
        } catch (_) {}
      } catch {
        if (!cancelled) setWithdrawRoleBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, request]);

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

  /** Sklad / kuryer baza: ekspeditor partiyalari sukut bo‘yicha yopiq; ochish — toggle. */
  const isExpeditorBatchExpanded = (batchId) => !!openExpeditorBatches[batchId];

  const toggleExpeditorBatchAdaptive = useCallback((batchId) => {
    setOpenExpeditorBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  }, []);

  const toggleStandaloneNewBatchOpen = (batchId) => {
    setOpenStandaloneNewBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const toggleDailyNewBatchOpen = (batchId) => {
    setOpenDailyNewBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const isDailyNewBatchExpanded = (batchId) => !!openDailyNewBatches[batchId];

  const toggleDailyNewBatchAdaptive = useCallback((batchId) => {
    setOpenDailyNewBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  }, []);

  const toggleOutcomeBatchOpen = (batchId) => {
    setOpenOutcomeBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const toggleHandoffListBatch = useCallback(
    async (batchId) => {
      const key = String(batchId);
      const isOpen = !!openExpeditorHandoffBatches[key];
      if (isOpen) {
        setOpenExpeditorHandoffBatches((prev) => ({ ...prev, [key]: false }));
        return;
      }
      setOpenExpeditorHandoffBatches((prev) => ({ ...prev, [key]: true }));
      if (expeditorHandoffBatchOrders[key]?.length) return;
      try {
        const res = await request(`/courier/handoff-lists?batch_id=${encodeURIComponent(key)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.batch?.orders)) {
          setExpeditorHandoffBatchOrders((prev) => ({ ...prev, [key]: data.batch.orders }));
        }
      } catch (_) {
        /* ignore */
      }
    },
    [openExpeditorHandoffBatches, expeditorHandoffBatchOrders, request],
  );

  const displayedOrders = useMemo(() => (Array.isArray(orders) ? [...orders] : []), [orders]);

  const expeditorClosedBatches = useMemo(() => {
    if (!['lists', 'sklad'].includes(filter)) return [];
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

  const standaloneDisplayedOrders = displayedOrders;

  const todayDateKey = useMemo(() => todayIsoDateInUzbekistan(), []);
  const tomorrowDateKey = useMemo(() => nextIsoDate(todayDateKey), [todayDateKey]);

  const dailyNewBatches = useMemo(() => {
    if (filter !== 'courier_base') return [];
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

  const outcomeListFilters = useMemo(() => new Set(['later', 'delivered', 'cancelled', 'warehouse', 'left_at_home']), []);

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
    () => filter === 'courier_base' && dailyNewBatches.some((b) => (b.orders || []).length > 0),
    [filter, dailyNewBatches]
  );

  const courierMainListEmpty = useMemo(() => {
    if (loading) return false;
    if (filter === 'moliya' || filter === 'konkurs') return false;
    if (filter === 'lists') return expeditorHandoffBatches.length === 0;
    if (filter === 'sklad') return expeditorClosedBatches.length === 0;
    if (filter === 'courier_base') {
      return expeditorClosedBatches.length === 0 && !hasDailyNewBatchesContent;
    }
    return displayedOrders.length === 0;
  }, [
    loading,
    filter,
    expeditorClosedBatches.length,
    displayedOrders.length,
    hasDailyNewBatchesContent,
    expeditorHandoffBatches.length,
  ]);

  const moliyaMetrics = useMemo(() => {
    let expectedCount = 0;
    let expectedSum = 0;
    let deliveredCount = 0;
    let deliveredSum = 0;
    let deliveredFee = 0;
    let cancelledCount = 0;
    let leftAtHomeCount = 0;

    (moliyaStats || []).forEach(s => {
      const c = Number(s.count) || 0;
      const total = Number(s.total_amount) || 0;
      const fee = Number(s.total_courier_fee) || 0;
      const fullAmount = total + fee;

      if (['assigned', 'picked_up', 'on_the_way', 'delivered'].includes(s.status)) {
        expectedCount += c;
        expectedSum += fullAmount;
      }
      
      if (s.status === 'delivered') {
        deliveredCount += c;
        deliveredSum += fullAmount;
        deliveredFee += fee;
      } else if (s.status === 'left_at_home') {
        leftAtHomeCount += c;
      } else if (s.status === 'cancelled') {
        cancelledCount += c;
      }
    });

    return { expectedCount, expectedSum, deliveredCount, deliveredSum, deliveredFee, netSum: deliveredSum - deliveredFee, cancelledCount, leftAtHomeCount };
  }, [moliyaStats]);

  const courierMainNav = useMemo(
    () => [
      { id: 'lists', label: 'Listlar', icon: '📋' },
      { id: 'courier_base', label: 'Kuryer baza', icon: '📦' },
      { id: 'delivered', label: 'Sotildi', icon: '✅' },
      { id: 'cancelled', label: 'Bekor qilingan', icon: '❌' },
      { id: 'later', label: 'Kiyin oladi', icon: '⏳' },
      { id: 'left_at_home', label: 'Uyda qoldi', icon: '🏠' },
      { id: 'warehouse', label: 'Qaytarish', icon: '↩️' },
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
        icon: myshopPlaneIcon,
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

  const filterTitle = useMemo(() => {
    if (filter === 'profile') return pickerUiT.profileTitle;
    if (filter === 'settings') return pickerUiT.settingsTitle;
    return sideNavItems.find((n) => n.id === filter)?.label || '';
  }, [filter, sideNavItems, pickerUiT.profileTitle, pickerUiT.settingsTitle]);

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

  const handleCourierProfileSave = async (e) => {
    e.preventDefault();
    setCourierProfileSaving(true);
    setCourierProfileError('');
    setCourierProfileOk('');
    const pwd = String(courierProfileForm.password || '').trim();
    if (pwd && pwd !== String(courierProfileForm.password2 || '').trim()) {
      setCourierProfileError('Parollar mos kelmayapti.');
      setCourierProfileSaving(false);
      return;
    }
    try {
      const updatedUser = await updateProfile({
        full_name: courierProfileForm.full_name.trim(),
        email: courierProfileForm.email.trim(),
        login: courierProfileForm.login.trim(),
        phone: courierProfileForm.phone.trim(),
        ...(pwd ? { password: pwd } : {}),
      });
      if (updatedUser) {
        setCourierProfileForm((prev) => ({
          ...prev,
          full_name: String(updatedUser.full_name || prev.full_name).trim(),
          email: String(updatedUser.email || prev.email).trim(),
          login: String(updatedUser.login || prev.login).trim(),
          phone: String(updatedUser.phone ?? prev.phone).trim(),
          password: '',
          password2: '',
        }));
      }
      await retrySession();
      const res = await request('/courier/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: courierProfileForm.full_name.trim(),
          phone: courierProfileForm.phone.trim(),
          avatar_url: courierProfileForm.avatar_url.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Saqlanmadi');
      setCourierProfileOk('Saqlandi.');
      setCourierProfileForm((p) => ({ ...p, password: '', password2: '' }));
      await retrySession();
      try {
        const meRes = await request('/courier/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          setCourier(meData.courier);
        }
      } catch (_) {}
    } catch (err) {
      setCourierProfileError(err.message || 'Xatolik');
    } finally {
      setCourierProfileSaving(false);
    }
  };

  const goNav = (id) => {
    const next = normalizeCourierTab(id);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next || next === 'lists') p.delete('tab');
        else p.set('tab', next);
        if (next !== 'courier_base') p.delete('batch');
        return p;
      },
      { replace: true }
    );
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

  const handleAcceptList = async (batchId) => {
    if (!window.confirm('Haqiqatdan ham ushbu listni qabul qilasizmi?')) return;
    try {
      const res = await request(`/courier/handoff-lists/${batchId}/accept`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Xatolik');
      void loadData();
    } catch (e) {
      window.alert(e.message || 'Xatolik');
    }
  };

  const renderOrderListCard = (o) => {
    const isPackagedPool = !o.courier_id && o.status === 'packaged';
    const cardTapTakeOrder = isPackagedPool;
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
          <span className="picker-card-id">#{o.id}</span>
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
            <span className="picker-topbar-logo">MyShop Kuryer</span>
            <div className="picker-topbar-right">
              <StaffNotificationBell
                t={pickerUiT}
                notificationsEnabled={notificationsEnabled}
                notificationsOpen={notificationsOpen}
                setNotificationsOpen={setNotificationsOpen}
                unreadCount={unreadNotifCount}
                notifications={notifications}
                onMarkRead={markNotificationRead}
                formatDateTime={formatDateTime}
                onBellOpenChange={(open) => {
                  if (open) {
                    loadNotifications();
                    setProfileMenuOpen(false);
                  }
                }}
                onDismiss={async (n) => {
                  if (!n.read_at) await markNotificationRead(n.id);
                }}
              />
              <div className="picker-topbar-profile-slot">
                <StaffTopbarProfileMenu
                  name={courierName}
                  avatarUrl={courierProfileForm.avatar_url || undefined}
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
                  onProfile={() => goNav('profile')}
                  onSettings={() => goNav('settings')}
                  onLogout={() => {
                    logout();
                    navigate('/', { replace: true });
                  }}
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
                  🚚
                </span>
                <div className="staff-side-panel-logo-text">
                  <span>MyShop</span>
                  <small>KURYER PANELI</small>
                </div>
              </div>
            </div>
            <p className="courier-side-intro staff-side-intro">
              <strong>{courierName}</strong>{' '}
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
        <div
          className={`picker-side-panel-overlay ${sidePanelOpen ? 'show' : ''}`}
          aria-hidden={!sidePanelOpen}
          onClick={() => setSidePanelOpen(false)}
        />

        <main className={`picker-main${mainTelegramLayout ? ' picker-main--telegram' : ''}`}>
          <StaffAdvanceConfirm />
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
          ) : filter === 'profile' ? (
            <section className="picker-subpage">
              <h1 className="picker-title">{pickerUiT.profileTitle}</h1>
              <p className="picker-profile-intro">{pickerUiT.profileIntro}</p>
              <div className="picker-profile-card">
                {courierProfileLoading ? (
                  <div className="picker-profile-loading">
                    <span className="picker-spinner" aria-hidden />
                    <span>{pickerUiT.profileLoading}</span>
                  </div>
                ) : (
                  <form className="picker-profile-form staff-account-touch" onSubmit={handleCourierProfileSave}>
                    {courierProfileError ? (
                      <div className="picker-profile-alert picker-profile-alert--error" role="alert">
                        {courierProfileError}
                      </div>
                    ) : null}
                    {courierProfileOk ? (
                      <div className="picker-profile-alert picker-profile-alert--ok" role="status">
                        {courierProfileOk}
                      </div>
                    ) : null}
                    <label className="picker-profile-field">
                      <span className="picker-profile-label">{pickerUiT.profileName}</span>
                      <input
                        type="text"
                        className="picker-profile-input"
                        value={courierProfileForm.full_name}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, full_name: ev.target.value }))}
                        autoComplete="name"
                        required
                      />
                    </label>
                    <label className="picker-profile-field">
                      <span className="picker-profile-label">{pickerUiT.profileEmail}</span>
                      <input
                        type="email"
                        className="picker-profile-input"
                        value={courierProfileForm.email}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, email: ev.target.value }))}
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label className="picker-profile-field">
                      <span className="picker-profile-label">{pickerUiT.profileLogin}</span>
                      <input
                        type="text"
                        className="picker-profile-input"
                        value={courierProfileForm.login}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, login: ev.target.value }))}
                        autoComplete="username"
                        required
                      />
                    </label>
                    <label className="picker-profile-field">
                      <span className="picker-profile-label">{pickerUiT.profilePhone}</span>
                      <input
                        type="tel"
                        className="picker-profile-input"
                        value={courierProfileForm.phone}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, phone: ev.target.value }))}
                        placeholder="+998901234567"
                        autoComplete="tel"
                      />
                    </label>
                    <label className="picker-profile-field">
                      <span className="picker-profile-label">Avatar URL</span>
                      <input
                        type="url"
                        className="picker-profile-input"
                        value={courierProfileForm.avatar_url}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, avatar_url: ev.target.value }))}
                        placeholder="https://…"
                        autoComplete="off"
                      />
                    </label>
                    <label className="picker-profile-field">
                      <span className="picker-profile-label">{pickerUiT.profilePassword}</span>
                      <input
                        type="password"
                        className="picker-profile-input"
                        value={courierProfileForm.password}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, password: ev.target.value }))}
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
                        value={courierProfileForm.password2}
                        onChange={(ev) => setCourierProfileForm((p) => ({ ...p, password2: ev.target.value }))}
                        autoComplete="new-password"
                      />
                    </label>
                    <button
                      type="submit"
                      className="picker-btn picker-btn-primary picker-profile-submit"
                      disabled={courierProfileSaving}
                    >
                      {courierProfileSaving ? pickerUiT.profileSaving : pickerUiT.profileSave}
                    </button>
                  </form>
                )}
              </div>
            </section>
          ) : filter === 'settings' ? (
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
                    onClick={() => setNotificationsEnabled(!notificationsEnabled)}
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
          ) : (
            <>
          <h1 className="picker-title">{filterTitle}</h1>
          <p className="picker-subtitle">{todayLine}</p>

          {error && (
            <div className="picker-error" role="alert">
              {error}
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
            <h2 style={{ padding: '0 1rem', marginBottom: '1rem', color: 'var(--text-main)', fontSize: '1.25rem' }}>Kunlik Moliya (Bugun)</h2>
            <div className="courier-moliya-cards">
                <div className="picker-withdrawal-card courier-moliya-stat">
                  <span className="courier-moliya-label">Kunlik List Jami Summasi</span>
                  <strong className="courier-moliya-value" style={{ color: 'var(--text-main)' }}>{formatCurrency(moliyaMetrics.expectedSum)}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Jami cheklar: {moliyaMetrics.expectedCount} ta</div>
                </div>
                <div className="picker-withdrawal-card courier-moliya-stat">
                  <span className="courier-moliya-label">Sotildi (Yetkazilgan)</span>
                  <strong className="courier-moliya-value" style={{ color: '#16a34a' }}>{formatCurrency(moliyaMetrics.deliveredSum)}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Sotilgan cheklar: {moliyaMetrics.deliveredCount} ta</div>
                </div>
                <div className="picker-withdrawal-card courier-moliya-stat">
                  <span className="courier-moliya-label">Kuryer Haqqi (Jami)</span>
                  <strong className="courier-moliya-value">{formatCurrency(moliyaMetrics.deliveredFee)}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Har biriga (taxminan): {formatCurrency(courierFeePerOrder)}</div>
                </div>
                <div className="picker-withdrawal-card courier-moliya-stat courier-moliya-stat--net">
                  <span className="courier-moliya-label">Kassaga Topshiriladigan (Netto)</span>
                  <strong className="courier-moliya-value courier-moliya-value--net" style={{ fontSize: '1.5rem' }}>
                    {formatCurrency(moliyaMetrics.netSum)}
                  </strong>
                </div>
                <div className="picker-withdrawal-card courier-moliya-stat" style={{ gridColumn: '1 / -1', background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.1)' }}>
                  <span className="courier-moliya-label">Bekor qilingan / Uyda qolgan</span>
                  <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
                    <div><strong style={{ color: '#e11d48' }}>{moliyaMetrics.cancelledCount} ta</strong> bekor qilingan</div>
                    <div><strong style={{ color: '#2563eb' }}>{moliyaMetrics.leftAtHomeCount} ta</strong> uyda qolgan</div>
                  </div>
                </div>
            </div>
            <section className="picker-withdrawal-card courier-moliya-withdraw" aria-labelledby="courier-withdraw-heading">
              <h3 id="courier-withdraw-heading" className="picker-withdrawal-title">
                Balansdan pul chiqarish
              </h3>
              <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
                Portal&nbsp;moliya&nbsp;balansidan chiqariladi (superuser&nbsp;tasdiqlaydi, keyin&nbsp;buxgalteriya «Pul&nbsp;berildi»).
              </p>
              {withdrawNoWorkRole ? (
                <p className="picker-withdrawal-msg error">
                  Ishchi rol topilmadi. Administrator portalda siz uchun kuryer ish&nbsp;ro‘yi (login&nbsp;/&nbsp;email) yarating.
                </p>
              ) : withdrawRoleBalance != null ? (
                <p className="picker-withdrawal-balance">
                  Chiqarish mumkin: <strong>{formatCurrency(withdrawRoleBalance)}</strong>
                </p>
              ) : (
                <p className="picker-withdrawal-msg error">Balans yuklanmadi.</p>
              )}
              <form
                className="picker-withdrawal-row"
                style={{ flexWrap: 'wrap' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const raw = String(withdrawAmount).replace(/\s/g, '').replace(/,/g, '.');
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n <= 0) {
                    setWithdrawMsg('Summani kiriting.');
                    setWithdrawMsgIsError(true);
                    return;
                  }
                  setWithdrawBusy(true);
                  setWithdrawMsg('');
                  setWithdrawMsgIsError(false);
                  try {
                    const res = await request('/courier/withdrawal', {
                      method: 'POST',
                      body: JSON.stringify({ amount: n, payout_method: withdrawPayoutMethod }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || 'Yuborilmadi');
                    setWithdrawMsg(data.message || "So'rov yuborildi.");
                    setWithdrawMsgIsError(false);
                    setWithdrawAmount('');
                    const bRes = await request('/courier/work-role/balance');
                      const bData = await bRes.json().catch(() => ({}));
                      if (bRes.ok) setWithdrawRoleBalance(Number(bData.balance) || 0);
                      
                      try {
                        const wRes = await request('/courier/withdrawals');
                        if (wRes.ok) {
                          const wData = await wRes.json().catch(() => ({}));
                          setWithdrawals(wData.withdrawals || []);
                        }
                      } catch (_) {}
                    } catch (err) {
                    setWithdrawMsg(String(err.message || 'Xatolik'));
                    setWithdrawMsgIsError(true);
                  } finally {
                    setWithdrawBusy(false);
                  }
                }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  className="picker-withdrawal-input"
                  placeholder="Summa"
                  value={withdrawAmount}
                  onChange={(ev) => setWithdrawAmount(ev.target.value)}
                  disabled={withdrawBusy || withdrawNoWorkRole}
                  aria-label="Pul chiqarish summasi"
                />
                <select
                  className="picker-withdrawal-input"
                  value={withdrawPayoutMethod}
                  onChange={(ev) => setWithdrawPayoutMethod(ev.target.value)}
                  disabled={withdrawBusy || withdrawNoWorkRole}
                  aria-label="To‘lov turi"
                >
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                </select>
                <button
                  type="submit"
                  className="picker-btn picker-btn-primary"
                  disabled={withdrawBusy || withdrawNoWorkRole}
                >
                  {withdrawBusy ? '...' : 'Yuborish'}
                </button>
              </form>
              {withdrawMsg ? (
                <p className={`picker-withdrawal-msg ${withdrawMsgIsError ? 'error' : 'success'}`}>{withdrawMsg}</p>
              ) : null}
            </section>
            <StaffTransactionTimeline transactions={financeTransactions} />
              <h2 className="courier-moliya-list-title">Sotilgan buyurtmalar</h2>
              <div className="picker-list">
                  {orders.slice(0, 50).map((o) => (
                  <article key={o.id} className="picker-card">
                    <div className="picker-card-header">
                      <span className="picker-card-id">#{o.id}</span>
                      <span className="picker-card-date">{formatCurrency(Number(o.total_amount) + Number(courierFeePerOrder || 25000))}</span>
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
              <p>{filter === 'lists' ? 'Ekspeditor yuborgan listlar hozircha yo\'q.' : 'Bu bo&apos;limda hozir buyurtma yo&apos;q.'}</p>
          </div>
        ) : (
            <>
              {filter === 'lists' ? (
                <div className="courier-packer-batches" aria-label="Ekspeditor listlari">
                  {expeditorHandoffBatches.map((batch) => {
                    const batchKey = String(batch.id);
                    const open = !!openExpeditorHandoffBatches[batchKey];
                    const batchOrdersRaw = expeditorHandoffBatchOrders[batchKey] || batch.orders || [];
                    const batchOrders = sortBatchOrdersByAssignedTimeAsc(batchOrdersRaw);
                    const count = Number(batch.orders_count) || batchOrders.length;
                    const totalAmount = batchOrders.reduce((sum, o) => sum + (Number(o?.total_amount) || 0), 0);
                    const totalLabel = count > 0 ? formatCurrency(totalAmount) : '—';
                    const countLabel = `${count} ta`;
                    const stamp = formatBatchStamp(batch.closed_at, count);
                    return (
                      <section key={batchKey} className="courier-packer-batch">
                        <div
                          className="courier-packer-batch-toolbar"
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={() => void toggleHandoffListBatch(batch.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void toggleHandoffListBatch(batch.id);
                            }
                          }}
                        >
                          <div className="courier-packer-batch-meta">
                            <span className="courier-packer-batch-title">Ekspeditor listi</span>
                            <span className="courier-packer-batch-sub courier-packer-batch-sub--stats">
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--sum">{totalLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--count">{countLabel}</span>
                              <span className="courier-packer-batch-pill courier-packer-batch-pill--date">{stamp}</span>
                            </span>
                          </div>
                          <span className="courier-packer-batch-caret" aria-hidden>{open ? '▾' : '▸'}</span>
                        </div>
                        {open ? (
                          <>
                            {batch.status !== 'received' ? (
                               <div style={{ padding: '0 1rem 1rem' }}>
                                 <button className="primary-btn" style={{ width: '100%', padding: '0.8rem', background: '#3b82f6', color: '#fff', borderRadius: '8px', border: 'none', fontWeight: 'bold' }} onClick={() => handleAcceptList(batch.id)}>Listni olganimni tasdiqlayman</button>
                               </div>
                            ) : null}
                            {batchOrders.length === 0 ? (
                              <p className="expeditor-queue-hint" style={{ padding: '0.75rem 1rem' }}>
                                Yuklanmoqda:
                              </p>
                            ) : (
                              <div className="picker-list courier-packer-batch-orders">
                                {batchOrders.map((o) => (
                                  <div key={o.id} style={{ marginBottom: '1.5rem' }}>
                                    <CourierOrderChek order={o} />
                                    {batch.status === 'received' && (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.2rem', marginTop: '0.5rem', padding: '0 0.5rem' }}>
                                        <button className="picker-btn" style={{ fontSize: '0.7rem', padding: '0.25rem 0.1rem', minHeight: '32px', background: 'rgba(34, 197, 94, 0.15)', color: '#15803d', border: '1px solid rgba(34, 197, 94, 0.4)', backdropFilter: 'blur(4px)', whiteSpace: 'normal', lineHeight: '1.1' }} onClick={() => handleStatus(o.id, 'delivered')} disabled={busyId === o.id}>Sotildi</button>
                                        <button className="picker-btn" style={{ fontSize: '0.7rem', padding: '0.25rem 0.1rem', minHeight: '32px', background: 'rgba(239, 68, 68, 0.15)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.4)', backdropFilter: 'blur(4px)', whiteSpace: 'normal', lineHeight: '1.1' }} onClick={() => handleStatus(o.id, 'cancelled', { courierUnsoldReturn: false })} disabled={busyId === o.id}>Bekor</button>
                                        <button className="picker-btn" style={{ fontSize: '0.7rem', padding: '0.25rem 0.1rem', minHeight: '32px', background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.4)', backdropFilter: 'blur(4px)', whiteSpace: 'normal', lineHeight: '1.1' }} onClick={() => handleStatus(o.id, 'blocked')} disabled={busyId === o.id}>Kiyin</button>
                                        <button className="picker-btn" style={{ fontSize: '0.7rem', padding: '0.25rem 0.1rem', minHeight: '32px', background: 'rgba(59, 130, 246, 0.15)', color: '#1d4ed8', border: '1px solid rgba(59, 130, 246, 0.4)', backdropFilter: 'blur(4px)', whiteSpace: 'normal', lineHeight: '1.1' }} onClick={() => handleStatus(o.id, 'left_at_home')} disabled={busyId === o.id}>Uyda qoldi</button>
                                        <button className="picker-btn" style={{ fontSize: '0.7rem', padding: '0.25rem 0.1rem', minHeight: '32px', background: 'rgba(107, 114, 128, 0.15)', color: '#374151', border: '1px solid rgba(107, 114, 128, 0.4)', backdropFilter: 'blur(4px)', whiteSpace: 'normal', lineHeight: '1.1' }} onClick={() => handleStatus(o.id, 'cancelled', { courierUnsoldReturn: true })} disabled={busyId === o.id}>Qaytarish</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
              {filter === 'sklad' || filter === 'lists' ? (
                <div className="courier-packer-batches" aria-label="Kuryer baza listlari">
                  {expeditorClosedBatches.map((batch) => {
                    const batchOrdersRaw = batch.orders || [];
                    if (!batchOrdersRaw.length) return null;
                    const batchOrders = sortBatchOrdersByAssignedTimeAsc(batchOrdersRaw).filter(
                      (o) => !['delivered', 'cancelled', 'blocked', 'left_at_home'].includes(o?.status)
                    );
                    if (!batchOrders.length) return null;
                    const open = isExpeditorBatchExpanded(batch.id);
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
                          onClick={() => toggleExpeditorBatchAdaptive(batch.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleExpeditorBatchAdaptive(batch.id);
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
              {filter === 'courier_base' ? (
                <div className="courier-base-products" aria-label="Uyda qolgan maxsulotlar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', padding: '1rem' }}>
                  {leftAtHomeProducts.map((p) => (
                    <div key={p.id} className="courier-base-product-card" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <div className="product-image-wrapper" style={{ width: '100%', aspectRatio: '1/1', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                        {p.photo_url || p.image_url ? (
                          <img src={p.photo_url || p.image_url} alt={p.name_uz} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '2rem' }}>📦</div>
                        )}
                      </div>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name_uz}</h4>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Soni: {p.total_quantity} ta</div>
                    </div>
                  ))}
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
                              <div key={o.id} style={{ marginBottom: '1.5rem' }}>
                                <CourierOrderChek order={o} />
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
              {!outcomeListFilters.has(filter) && standaloneDisplayedOrders.length > 0 ? (
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

function CourierOrderChek({ order }) {
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

  return (
    <article className="expeditor-chek expeditor-chek--handoff expeditor-chek--closed-batch" aria-label={`Zakaz ${order.id}`}>
      <header className="expeditor-chek__head">
        <span className="expeditor-chek__id">ID: {order.id}</span>
        <span className="expeditor-chek__head-mid expeditor-chek__datetime">
           Kuryerga yuborilgan
        </span>
        <span className="expeditor-chek__pill expeditor-chek__pill--closed-batch">Yopilgan list</span>
      </header>
      {items.length > 0 ? (
        <>
          <div className="expeditor-chek__rule" aria-hidden />
          <div className="expeditor-chek__grid-head" aria-hidden>
            <span>Mahsulot</span>
            <span>Soni</span>
            <span>Summa</span>
          </div>
          <ul className="expeditor-chek__lines">
            {items.map((it) => {
              const q = Number(it.quantity) || 0;
              const p = Number(it.price_at_order) || 0;
              const line = q * p;
              return (
                <li key={it.id} className="expeditor-chek__line">
                  <span className="expeditor-chek__name">{it.name_uz || it.product_name || `Mahsulot ${it.product_id}`}</span>
                  <span className="expeditor-chek__qty">{q}</span>
                  <span className="expeditor-chek__line-sum">{new Intl.NumberFormat('ru-RU').format(line)} {currency}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <div className="expeditor-chek__courier-fee">
        <span>Kuryer haqi</span>
        <strong>{new Intl.NumberFormat('ru-RU').format(courierFee)} {currency}</strong>
      </div>
      <div className="expeditor-chek__total">
        <span>Jami</span>
        <strong>{new Intl.NumberFormat('ru-RU').format(finalTotal)} {currency}</strong>
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
              <span className="expeditor-chek__customer-value">{addrStr || '-'}</span>
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
        </div>
      </div>
    </article>
  );
}
