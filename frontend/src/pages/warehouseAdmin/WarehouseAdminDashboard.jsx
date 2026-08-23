import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../../components/picker/PickerLichka';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import StaffNotificationBell from '../../components/notifications/StaffNotificationBell.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu';
import StaffTopbarCenterId from '../../components/staff/StaffTopbarCenterId.jsx';
import StaffCameraBarcodeScanner from '../../components/staff/StaffCameraBarcodeScanner.jsx';
import StaffSidePanel from '../../components/staff/StaffSidePanel.jsx';
import StaffArchivedOrdersTable from '../../components/staff/StaffArchivedOrdersTable.jsx';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat';
import { formatDateTimeUz, UZ_TIMEZONE } from '../../utils/uzbekistanTime.js';
import {
  LedgerQtyEditor,
  WarehouseActionsColumn,
  WarehouseGridColumnHeaders,
  WarehouseChiqimConfirmedDuplicateRow,
  warehouseKirimChiqimSheetMainRowClass,
  formatWarehouseProductSumUz,
} from '../../components/warehouse/WarehouseLedgerParts.jsx';
import '../picker/PickerDashboard.css';
import '../../styles/staffSidePanelCompact.css';
import './WarehouseAdminDashboard.css';

const VIEW_KEYS = new Set([
  'home',
  'kirim',
  'chiqim',
  'atkaz',
  'hold',
  'archived_orders',
  'brak',
  'chat',
  'delisted',
  'deleted',
  'profile',
  'settings',
  'courier',
  'seller',
  'operator',
  'packer',
  'picker',
  'expeditor',
  'order_receiver',
]);

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

function formatSum(n) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`;
}

/** Rollar bo'yicha xodimlar jadvalining ustunlari (Kuryer/Seller/Operator/Packer/Picker/Ekspeditor/Qabul qiluvchi) */
const STAFF_DIRECTORY_COLUMNS = {
  courier: [
    { key: 'full_name', label: 'Ism' },
    { key: 'staff_member_id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Tel raqam' },
    { key: 'sold_orders_count', label: 'Sotilgan' },
    { key: 'atkaz_count', label: 'Atkaz' },
    { key: 'home_left_count', label: 'Uyda qoldi' },
    { key: 'courier_balance', label: 'Kuryer balansi' },
    { key: 'deposit', label: 'Depozit' },
    { key: 'status', label: 'Holat' },
    { key: 'rating_percent', label: 'Baholash' },
  ],
  seller: [
    { key: 'full_name', label: 'Ism' },
    { key: 'seller_id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Tel raqam' },
    { key: 'commission_percent', label: 'Sotuv foizi' },
    { key: 'status', label: 'Holat' },
    { key: 'balance', label: 'Umumiy balans' },
  ],
  operator: [
    { key: 'full_name', label: 'Ism' },
    { key: 'staff_member_id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Telefon' },
    { key: 'status', label: 'Holat' },
    { key: 'balance', label: 'Balans' },
  ],
  packer: [
    { key: 'full_name', label: 'Ism' },
    { key: 'staff_member_id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Telefon' },
    { key: 'status', label: 'Holat' },
    { key: 'balance', label: 'Balans' },
  ],
  picker: [
    { key: 'full_name', label: 'Ism' },
    { key: 'staff_member_id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Telefon' },
    { key: 'status', label: 'Holat' },
    { key: 'balance', label: 'Balans' },
  ],
  expeditor: [
    { key: 'full_name', label: 'Ism' },
    { key: 'id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Tel raqam' },
    { key: 'today_count', label: 'Bugungi zakazlar' },
  ],
  order_receiver: [
    { key: 'full_name', label: 'Ism' },
    { key: 'id', label: 'ID' },
    { key: 'login', label: 'Login' },
    { key: 'phone', label: 'Tel raqam' },
    { key: 'today_count', label: 'Bugungi zakazlar' },
  ],
};

const STAFF_STATUS_LABELS = { active: 'Faol', blocked: 'Bloklangan', pending: 'Kutilmoqda' };

function normalizeWarehouseView(raw) {
  const v = String(raw || '').trim();
  // Eski saqlangan/bookmark qilingan havolalar: birlashtirilgan sahifa endi "Kirim"ga yo'naltiriladi.
  if (v === 'kirim_chiqim') return 'kirim';
  return VIEW_KEYS.has(v) ? v : 'home';
}

/** Brak sahifasi ichidagi pastki tab: URL `brakTab` */
function normalizeBrakTab(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'pending' || v === 'kutilmoqda') return 'pending';
  return 'confirmed';
}

/**
 * Operator panelidan alohida: bosh sahifa, ombor kirim/chiqim, MyShop chat; pastda tema va chiqish.
 */
export default function WarehouseAdminDashboard() {
  const { request, user, logout, retrySession, updateProfile } = useAuth();
  const { t: pickerUiT, notificationsEnabled, setNotificationsEnabled, locale, setLocale } = usePickerUiSettings();
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [waProfileForm, setWaProfileForm] = useState({
    full_name: '',
    phone: '',
    avatar_url: '',
    email: '',
    login: '',
    password: '',
    password2: '',
  });
  const [waProfileLoading, setWaProfileLoading] = useState(false);
  const [waProfileSaving, setWaProfileSaving] = useState(false);
  const [waProfileError, setWaProfileError] = useState('');
  const [waProfileOk, setWaProfileOk] = useState('');

  const [sellerProductsOverview, setSellerProductsOverview] = useState([]);
  const [sellerProductsLoading, setSellerProductsLoading] = useState(false);
  const [archivedOrdersError, setArchivedOrdersError] = useState('');

  const [holdRows, setHoldRows] = useState([]);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdBusyOrderId, setHoldBusyOrderId] = useState(null);
  const [holdError, setHoldError] = useState('');

  const warehouseRoleLabel = 'Ombor admini';
  const warehouseName = user?.full_name || user?.login || warehouseRoleLabel;

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

  /** Hold sahifasi — status='hold' bo'lgan buyurtmalardagi mahsulotlar ro'yxati */
  const loadHoldRows = useCallback(async () => {
    try {
      setHoldLoading(true);
      setHoldError('');
      const res = await request('/warehouse-admin/hold-products');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHoldError(d?.error || 'Hold ro‘yxatini yuklab bo‘lmadi.');
        setHoldRows([]);
        return;
      }
      setHoldRows(Array.isArray(d.rows) ? d.rows : []);
    } catch {
      setHoldError('Hold ro‘yxatini yuklab bo‘lmadi.');
      setHoldRows([]);
    } finally {
      setHoldLoading(false);
    }
  }, [request]);

  const handleReleaseHoldOrder = useCallback(
    async (orderId) => {
      if (!orderId || holdBusyOrderId != null) return;
      setHoldBusyOrderId(orderId);
      setHoldError('');
      try {
        const res = await request(`/warehouse-admin/hold-products/${orderId}/release`, {
          method: 'POST',
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHoldError(d?.error || 'Holddan chiqarib bo‘lmadi.');
          return;
        }
        setHoldRows((prev) => prev.filter((r) => Number(r.order_id) !== Number(orderId)));
      } catch {
        setHoldError('Holddan chiqarib bo‘lmadi.');
      } finally {
        setHoldBusyOrderId(null);
      }
    },
    [request, holdBusyOrderId],
  );

  /**
   * Rollar bo'yicha xodimlar ro'yxati (Kuryer / Seller / Operator / Packer / Picker /
   * Ekspeditor / Qabul qiluvchi sahifalari). Superuser qaysi rolga xodim qo'shsa,
   * shu yerda avtomatik ko'rinadi — onlayn/oflayn holati bilan.
   */
  const STAFF_DIRECTORY_VIEWS = useMemo(
    () => new Set(['courier', 'seller', 'operator', 'packer', 'picker', 'expeditor', 'order_receiver']),
    [],
  );
  const [staffDirectoryRows, setStaffDirectoryRows] = useState([]);
  const [staffDirectoryLoading, setStaffDirectoryLoading] = useState(false);
  const [staffDirectoryError, setStaffDirectoryError] = useState('');

  const loadStaffDirectory = useCallback(
    async (role) => {
      try {
        setStaffDirectoryLoading(true);
        setStaffDirectoryError('');
        const res = await request(`/warehouse-admin/staff-directory/${encodeURIComponent(role)}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStaffDirectoryError(d?.error || 'Ro‘yxatni yuklab bo‘lmadi.');
          setStaffDirectoryRows([]);
          return;
        }
        setStaffDirectoryRows(Array.isArray(d.staff) ? d.staff : []);
      } catch {
        setStaffDirectoryError('Ro‘yxatni yuklab bo‘lmadi.');
        setStaffDirectoryRows([]);
      } finally {
        setStaffDirectoryLoading(false);
      }
    },
    [request],
  );

  /** Ekspeditor/Qabul qiluvchi — "Bugungi zakazlar" soniga bosilganda ochiladigan chek-modal */
  const [dailyOrdersModal, setDailyOrdersModal] = useState(null); // { role, userId, name, loading, data, error }

  const openDailyOrdersModal = useCallback(
    async (role, s) => {
      setDailyOrdersModal({ role, userId: s.id, name: s.full_name, loading: true, data: null, error: '' });
      try {
        const res = await request(`/warehouse-admin/staff-directory/${role}/${s.id}/daily-orders`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDailyOrdersModal((prev) =>
            prev ? { ...prev, loading: false, error: d?.error || 'Yuklab bo‘lmadi.' } : prev,
          );
          return;
        }
        setDailyOrdersModal((prev) => (prev ? { ...prev, loading: false, data: d } : prev));
      } catch {
        setDailyOrdersModal((prev) => (prev ? { ...prev, loading: false, error: 'Yuklab bo‘lmadi.' } : prev));
      }
    },
    [request],
  );

  const closeDailyOrdersModal = useCallback(() => setDailyOrdersModal(null), []);

  /** "Umumiy ma'lumot" modali — kalendar orqali kun tanlab, o'sha kun statistikasi */
  const [summaryModal, setSummaryModal] = useState(null); // { role, userId, name, date, loading, items, error }

  const loadDailySummary = useCallback(
    async (role, userId, date) => {
      try {
        const res = await request(
          `/warehouse-admin/staff-directory/${role}/${userId}/daily-summary?date=${encodeURIComponent(date)}`,
        );
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSummaryModal((prev) =>
            prev ? { ...prev, loading: false, error: d?.error || 'Yuklab bo‘lmadi.' } : prev,
          );
          return;
        }
        setSummaryModal((prev) =>
          prev ? { ...prev, loading: false, items: Array.isArray(d.items) ? d.items : [] } : prev,
        );
      } catch {
        setSummaryModal((prev) => (prev ? { ...prev, loading: false, error: 'Yuklab bo‘lmadi.' } : prev));
      }
    },
    [request],
  );

  /**
   * Kuryer modalidagi 4 ta yonma-yon ustun (Sotilgan / Bekor qilingan / Atkaz /
   * Uyda qoldi) — tanlangan ustun bo'yicha shu kungi "chek" ro'yxati.
   * "Uyda qoldi" alohida modalda mahsulotlar ro'yxatini ko'rsatadi.
   */
  const [activeCourierCategory, setActiveCourierCategory] = useState('sold');
  const [categoryOrdersData, setCategoryOrdersData] = useState(null); // { loading, orders, count, total_sum, error }
  const [homeLeftModal, setHomeLeftModal] = useState(null); // { loading, products, count, total_sum, error, date }

  const loadCourierCategoryOrders = useCallback(
    async (userId, category, date) => {
      setCategoryOrdersData({ loading: true, orders: [], count: 0, total_sum: 0, error: '' });
      try {
        const res = await request(
          `/warehouse-admin/staff-directory/courier/${userId}/category-orders?category=${category}&date=${encodeURIComponent(date)}`,
        );
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCategoryOrdersData({ loading: false, orders: [], count: 0, total_sum: 0, error: d?.error || 'Yuklab bo‘lmadi.' });
          return;
        }
        setCategoryOrdersData({
          loading: false,
          orders: Array.isArray(d.orders) ? d.orders : [],
          count: d.count || 0,
          total_sum: d.total_sum || 0,
          error: '',
        });
      } catch {
        setCategoryOrdersData({ loading: false, orders: [], count: 0, total_sum: 0, error: 'Yuklab bo‘lmadi.' });
      }
    },
    [request],
  );

  const selectCourierCategory = useCallback(
    (category) => {
      setActiveCourierCategory(category);
      if (summaryModal) void loadCourierCategoryOrders(summaryModal.userId, category, summaryModal.date);
    },
    [summaryModal, loadCourierCategoryOrders],
  );

  const openHomeLeftModal = useCallback(async () => {
    if (!summaryModal) return;
    setHomeLeftModal({ loading: true, products: [], count: 0, total_sum: 0, error: '', date: summaryModal.date });
    try {
      const res = await request(
        `/warehouse-admin/staff-directory/courier/${summaryModal.userId}/home-left-products?date=${encodeURIComponent(summaryModal.date)}`,
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHomeLeftModal((prev) => (prev ? { ...prev, loading: false, error: d?.error || 'Yuklab bo‘lmadi.' } : prev));
        return;
      }
      setHomeLeftModal((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              products: Array.isArray(d.products) ? d.products : [],
              count: d.count || 0,
              total_sum: d.total_sum || 0,
            }
          : prev,
      );
    } catch {
      setHomeLeftModal((prev) => (prev ? { ...prev, loading: false, error: 'Yuklab bo‘lmadi.' } : prev));
    }
  }, [summaryModal, request]);

  const closeHomeLeftModal = useCallback(() => setHomeLeftModal(null), []);

  const openSummaryModal = useCallback(
    (role, s) => {
      const today = new Date().toISOString().slice(0, 10);
      setSummaryModal({ role, userId: s.id, name: s.full_name, date: today, loading: true, items: [], error: '' });
      void loadDailySummary(role, s.id, today);
      if (role === 'courier') {
        setActiveCourierCategory('sold');
        void loadCourierCategoryOrders(s.id, 'sold', today);
      }
    },
    [loadDailySummary, loadCourierCategoryOrders],
  );

  const changeSummaryModalDate = useCallback(
    (newDate) => {
      setSummaryModal((prev) => {
        if (!prev) return prev;
        void loadDailySummary(prev.role, prev.userId, newDate);
        if (prev.role === 'courier') {
          void loadCourierCategoryOrders(prev.userId, activeCourierCategory, newDate);
        }
        return { ...prev, date: newDate, loading: true, error: '' };
      });
    },
    [loadDailySummary, loadCourierCategoryOrders, activeCourierCategory],
  );

  const closeSummaryModal = useCallback(() => {
    setSummaryModal(null);
    setCourierFilterOpen(false);
    setSelectedViloyatId('');
    setRegionCouriers([]);
    setSelectedCourierId(null);
    setCourierSummary(null);
    setActiveCourierCategory('sold');
    setCategoryOrdersData(null);
  }, []);

  /**
   * Ekspeditor/Qabul qiluvchi modalidagi "Kuryer" filtri — hudud tanlab,
   * shu hududdagi kuryerlardan birini tanlash, so'ng o'sha kuryerga
   * chiqarilgan / undan atkaz qabul qilingan buyurtmalar (soni+summasi).
   */
  const [courierFilterOpen, setCourierFilterOpen] = useState(false);
  const [viloyatlarList, setViloyatlarList] = useState([]);
  const [selectedViloyatId, setSelectedViloyatId] = useState('');
  const [regionCouriers, setRegionCouriers] = useState([]);
  const [regionCouriersLoading, setRegionCouriersLoading] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState(null);
  const [courierSummary, setCourierSummary] = useState(null); // { courier, items, loading, error }

  const openCourierFilter = useCallback(async () => {
    setCourierFilterOpen(true);
    setSelectedCourierId(null);
    setCourierSummary(null);
    if (viloyatlarList.length === 0) {
      try {
        const res = await request('/warehouse-admin/viloyatlar-list');
        const d = await res.json().catch(() => ({}));
        if (res.ok) setViloyatlarList(Array.isArray(d.viloyatlar) ? d.viloyatlar : []);
      } catch {
        /* jim */
      }
    }
  }, [request, viloyatlarList.length]);

  const closeCourierFilter = useCallback(() => {
    setCourierFilterOpen(false);
    setSelectedViloyatId('');
    setRegionCouriers([]);
    setSelectedCourierId(null);
    setCourierSummary(null);
  }, []);

  const pickViloyatForCourierFilter = useCallback(
    async (viloyatId) => {
      setSelectedViloyatId(viloyatId);
      setSelectedCourierId(null);
      setCourierSummary(null);
      setRegionCouriersLoading(true);
      try {
        const res = await request(
          `/warehouse-admin/couriers-by-region?viloyat_id=${encodeURIComponent(viloyatId)}`,
        );
        const d = await res.json().catch(() => ({}));
        setRegionCouriers(res.ok && Array.isArray(d.couriers) ? d.couriers : []);
      } catch {
        setRegionCouriers([]);
      } finally {
        setRegionCouriersLoading(false);
      }
    },
    [request],
  );

  const pickCourierForFilter = useCallback(
    async (courierStaffId) => {
      setSelectedCourierId(courierStaffId);
      setCourierSummary({ loading: true, items: [], error: '', courier: null });
      try {
        const res = await request(
          `/warehouse-admin/staff-directory/${summaryModal.role}/${summaryModal.userId}/courier-summary?courier_staff_id=${courierStaffId}&date=${encodeURIComponent(summaryModal.date)}`,
        );
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCourierSummary({ loading: false, items: [], error: d?.error || 'Yuklab bo‘lmadi.', courier: null });
          return;
        }
        setCourierSummary({ loading: false, items: d.items || [], error: '', courier: d.courier });
      } catch {
        setCourierSummary({ loading: false, items: [], error: 'Yuklab bo‘lmadi.', courier: null });
      }
    },
    [request, summaryModal],
  );

  /** Depozit (kuryer) va Sotuv foizi (seller) — joyida (inline) tahrirlash */
  const [directoryEdit, setDirectoryEdit] = useState(null); // { rowId, field, val }
  const [directoryEditBusy, setDirectoryEditBusy] = useState(false);

  const startDirectoryEdit = useCallback((rowId, field, currentVal) => {
    setDirectoryEdit({ rowId, field, val: String(currentVal ?? '') });
  }, []);

  const cancelDirectoryEdit = useCallback(() => setDirectoryEdit(null), []);

  const saveDirectoryEdit = useCallback(async () => {
    if (!directoryEdit) return;
    const { rowId, field, val } = directoryEdit;
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) {
      setStaffDirectoryError("Qiymat noto'g'ri.");
      return;
    }
    setDirectoryEditBusy(true);
    try {
      let url = '';
      let body = {};
      if (field === 'deposit') {
        url = `/warehouse-admin/staff-directory/courier/${rowId}/deposit`;
        body = { deposit: num };
      } else if (field === 'commission_percent') {
        url = `/warehouse-admin/staff-directory/seller/${rowId}/commission`;
        body = { commission_percent: num };
      } else {
        setDirectoryEditBusy(false);
        return;
      }
      const res = await request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStaffDirectoryError(d?.error || 'Saqlab bo‘lmadi.');
        return;
      }
      setStaffDirectoryRows((prev) =>
        prev.map((s) => {
          const matchId = field === 'deposit' ? s.staff_member_id : s.seller_id;
          if (matchId !== rowId) return s;
          return { ...s, [field]: num };
        }),
      );
      setDirectoryEdit(null);
    } catch {
      setStaffDirectoryError('Saqlab bo‘lmadi.');
    } finally {
      setDirectoryEditBusy(false);
    }
  }, [directoryEdit, request]);

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
      { id: 'kirim', label: 'Kirim', icon: '📥' },
      { id: 'chiqim', label: 'Chiqim', icon: '📤' },
      { id: 'atkaz', label: 'Atkaz mahsulot', icon: '🚫' },
      { id: 'hold', label: 'Hold', icon: '⏸️' },
      { id: 'archived_orders', label: 'Arxiv zakazlar', icon: '🗄️' },
      { id: 'delisted', label: 'Sotuvdan olinganlar', icon: '📴' },
      { id: 'deleted', label: 'Oʻchirilgan mahsulotlar', icon: '🗑️' },
      { id: 'brak', label: 'Brak mahsulot', icon: '⚠️' },
      { id: 'courier', label: 'Kuryer', icon: '🚴' },
      { id: 'seller', label: 'Seller', icon: '🏪' },
      { id: 'operator', label: 'Operator', icon: '🎧' },
      { id: 'packer', label: 'Packer', icon: '📦' },
      { id: 'picker', label: 'Picker', icon: '🧾' },
      { id: 'expeditor', label: 'Ekspeditor', icon: '🚚' },
      { id: 'order_receiver', label: 'Qabul qiluvchi', icon: '📮' },
      {
        id: 'chat',
        label: pickerUiT.navMyShopChat,
        icon: myshopPlaneIcon,
        iconClassName: 'courier-side-nav-tg-plane',
      },
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

  const staffSideNavItems = useMemo(
    () =>
      sideNavItems.map((item) => ({
        ...item,
        active: view === item.id,
        onClick: () => goView(item.id),
      })),
    [sideNavItems, view, goView],
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
    if (view === 'chat' || view === 'profile' || view === 'settings') return undefined;
    const id = window.setInterval(() => {
      void loadNotifications();
    }, 60000);
    return () => window.clearInterval(id);
  }, [view, loadNotifications]);

  useEffect(() => {
    if (view === 'chat' || view === 'profile' || view === 'settings' || view === 'hold') return undefined;
    void loadSellerProductsOverview();
    return undefined;
  }, [view, loadSellerProductsOverview]);

  useEffect(() => {
    if (view !== 'hold') return undefined;
    void loadHoldRows();
    return undefined;
  }, [view, loadHoldRows]);

  useEffect(() => {
    if (!STAFF_DIRECTORY_VIEWS.has(view)) return undefined;
    void loadStaffDirectory(view);
    return undefined;
  }, [view, STAFF_DIRECTORY_VIEWS, loadStaffDirectory]);

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

  useEffect(() => {
    if (view !== 'archived_orders') setArchivedOrdersError('');
  }, [view]);

  const closeSidebar = useCallback(() => setSidePanelOpen(false), []);

  const isChatView = view === 'chat';

  const nonChatTitle = useMemo(() => {
    if (view === 'profile') return 'Profil';
    if (view === 'settings') return pickerUiT.settingsTitle;
    if (view === 'kirim') return 'Kirim';
    if (view === 'chiqim') return 'Chiqim';
    if (view === 'atkaz') return 'Atkaz mahsulot';
    if (view === 'hold') return 'Hold';
    if (view === 'archived_orders') return 'Arxiv zakazlar';
    if (view === 'delisted') return 'Sotuvdan olingan mahsulotlar';
    if (view === 'deleted') return 'Oʻchirilgan mahsulotlar';
    if (view === 'brak') return 'Brak mahsulot';
    if (view === 'courier') return 'Kuryer';
    if (view === 'seller') return 'Seller';
    if (view === 'operator') return 'Operator';
    if (view === 'packer') return 'Packer';
    if (view === 'picker') return 'Picker';
    if (view === 'expeditor') return 'Ekspeditor';
    if (view === 'order_receiver') return 'Qabul qiluvchi';
    return 'Bosh sahifa';
  }, [view, pickerUiT.settingsTitle]);

  /** Kontent tepada — vizual sarlavha/sana yo‘q, SR uchun yashirin h1 */
  const ledgerSheetCompactHeader =
    view === 'home' ||
    view === 'brak' ||
    view === 'kirim' ||
    view === 'chiqim' ||
    view === 'atkaz' ||
    view === 'hold' ||
    view === 'courier' ||
    view === 'seller' ||
    view === 'operator' ||
    view === 'packer' ||
    view === 'picker' ||
    view === 'expeditor' ||
    view === 'order_receiver' ||
    view === 'archived_orders' ||
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

  /** Kirim sahifasi: bosh sahifada tasdiqlangan (warehouse_approved_at bor) mahsulotlar shu yerga o‘tadi. */
  const kirimListProducts = useMemo(
    () => sellerProductsOverview.filter((p) => Boolean(p.warehouse_approved_at)),
    [sellerProductsOverview],
  );

  /** Chiqim sahifasi: buyurtma bo‘yicha chiqim boshlangan yoki tasdiqlangan mahsulotlar. */
  const chiqimListProducts = useMemo(
    () =>
      sellerProductsOverview.filter(
        (p) => (Number(p.warehouse_chiqim_qty) || 0) >= 1 || Boolean(p.warehouse_chiqim_confirmed_at),
      ),
    [sellerProductsOverview],
  );

  /** Kirim/Chiqim/Sotuvdan olinganlar/Oʻchirilganlar — bitta umumiy jadval shu manbadan qatorlarni oladi. */
  const sheetRows = useMemo(() => {
    if (view === 'kirim') return kirimListProducts;
    if (view === 'chiqim') return chiqimListProducts;
    return sellerProductsOverview;
  }, [view, kirimListProducts, chiqimListProducts, sellerProductsOverview]);

  const sheetActionsContext = useMemo(() => {
    if (view === 'deleted') return 'deleted_sheet';
    if (view === 'kirim') return 'kirim_page';
    if (view === 'chiqim') return 'chiqim_page';
    return 'kirim_sheet';
  }, [view]);

  const sheetEmptyMessage = useMemo(() => {
    if (view === 'delisted') return 'Sotuvdan olingan mahsulot yoʻq.';
    if (view === 'deleted') return 'Oʻchirilgan mahsulot yoʻq.';
    if (view === 'kirim') return 'Tasdiqlangan kirim mahsulot yoʻq.';
    if (view === 'chiqim') return 'Chiqimda mahsulot yoʻq.';
    return 'Mahsulot yo‘q.';
  }, [view]);

  /**
   * Kamera skaneri — seller qo‘shgan mahsulotni (shtrix-kod/QR ichidagi ID) topib,
   * bosh sahifadagi tasdiqlash navbatida darhol ko‘rsatadi.
   */
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanHighlightId, setScanHighlightId] = useState(null);
  const homeRowRefs = useRef({});

  useEffect(() => {
    if (scanHighlightId == null) return undefined;
    const el = homeRowRefs.current[scanHighlightId];
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timerId = window.setTimeout(() => setScanHighlightId(null), 2600);
    return () => window.clearTimeout(timerId);
  }, [scanHighlightId]);

  const handleWarehouseProductScan = useCallback(
    async (codeText) => {
      const raw = String(codeText || '').trim();
      let productId = null;
      if (/^\d+$/.test(raw)) {
        productId = Number(raw);
      } else {
        const m = raw.match(/(\d{1,10})/);
        if (m) productId = Number(m[1]);
      }
      if (!Number.isInteger(productId) || productId < 1) {
        return { message: 'Kod tanilmadi. Qayta urinib ko‘ring.' };
      }
      const product = sellerProductsOverview.find((x) => Number(x.id) === productId);
      if (!product) {
        return { message: `Mahsulot topilmadi (ID ${productId}). Boshqa kodni sinab ko‘ring.` };
      }
      if (product.warehouse_approved_at) {
        return { message: `${product.name_uz || 'Mahsulot'} allaqachon tasdiqlangan.` };
      }
      if (view !== 'home') goView('home');
      setScanHighlightId(product.id);
      return { action: 'close' };
    },
    [sellerProductsOverview, view, goView],
  );

  const [approvingId, setApprovingId] = useState(0);
  const handleApproveKirim = useCallback(
    async (productId, qtyOverride) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      const row = sellerProductsOverview.find((x) => Number(x.id) === id);
      const qty =
        qtyOverride != null && Number.isFinite(Number(qtyOverride))
          ? Number(qtyOverride)
          : Math.max(Number(row?.warehouse_kirim_qty) || 0, Number(row?.stock) || 0);
      if (qty < 1) {
        alert('Kirim soni kamida 1 kiriting.');
        return;
      }
      setApprovingId(id);
      try {
        const res = await request(`/warehouse-admin/products/${id}/approve-kirim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse_kirim_qty: qty }),
        });
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
    [request, loadSellerProductsOverview, sellerProductsOverview],
  );

  const [confirmingChiqimId, setConfirmingChiqimId] = useState(0);
  const [confirmingAtkazId, setConfirmingAtkazId] = useState(0);
  const [revokingKirimId, setRevokingKirimId] = useState(0);
  const [delistingId, setDelistingId] = useState(0);
  const [deletingProductId, setDeletingProductId] = useState(0);

  const handleConfirmChiqim = useCallback(
    async (productId, qtyOverride) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      setConfirmingChiqimId(id);
      try {
        const body =
          qtyOverride != null && Number.isFinite(Number(qtyOverride))
            ? { warehouse_chiqim_qty: Number(qtyOverride) }
            : {};
        const res = await request(`/warehouse-admin/products/${id}/confirm-chiqim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
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

  const [kirimLedgerOpen, setKirimLedgerOpen] = useState(null);
  const [kirimCancelKeys, setKirimCancelKeys] = useState({});

  const bumpKirimCancelKey = useCallback((productId) => {
    const id = Number(productId);
    if (!Number.isInteger(id) || id < 1) return;
    setKirimCancelKeys((prev) => ({
      ...prev,
      [id]: (Number(prev[id]) || 0) + 1,
    }));
  }, []);

  const handleKirimLedgerReport = useCallback((productId, s) => {
    setKirimLedgerOpen((prev) => {
      if (s.expanded) {
        if (prev?.id === productId && prev.val === s.val) return prev;
        return { id: productId, val: s.val };
      }
      if (prev?.id === productId) return null;
      return prev;
    });
    if (s.expanded) {
      setChiqimLedgerOpen((prev) => (prev?.id === productId ? null : prev));
    }
  }, []);

  const handleKirimLedgerSaveAndApprove = useCallback(
    async (p, n) => {
      const id = Number(p.id);
      if (!Number.isInteger(id) || id < 1) return;
      if (!Number.isFinite(n) || n < 1) {
        alert('Kirim uchun kamida 1 kiriting.');
        return;
      }
      await handleApproveKirim(id, n);
      setKirimLedgerOpen(null);
      bumpKirimCancelKey(id);
    },
    [handleApproveKirim, bumpKirimCancelKey],
  );

  const handleKirimLedgerExpandCancel = useCallback(
    (productId) => {
      const id = Number(productId);
      setKirimLedgerOpen((prev) => (prev?.id === id ? null : prev));
      bumpKirimCancelKey(id);
    },
    [bumpKirimCancelKey],
  );

  const [chiqimLedgerOpen, setChiqimLedgerOpen] = useState(null);
  const [chiqimCancelKeys, setChiqimCancelKeys] = useState({});

  const bumpChiqimCancelKey = useCallback((productId) => {
    const id = Number(productId);
    if (!Number.isInteger(id) || id < 1) return;
    setChiqimCancelKeys((prev) => ({
      ...prev,
      [id]: (Number(prev[id]) || 0) + 1,
    }));
  }, []);

  const handleChiqimLedgerReport = useCallback((productId, s) => {
    setChiqimLedgerOpen((prev) => {
      if (s.expanded) {
        if (prev?.id === productId && prev.val === s.val) return prev;
        return { id: productId, val: s.val };
      }
      if (prev?.id === productId) return null;
      return prev;
    });
    if (s.expanded) {
      setKirimLedgerOpen((prev) => (prev?.id === productId ? null : prev));
    }
  }, []);

  const handleChiqimLedgerSaveAndConfirm = useCallback(
    async (p, n) => {
      const id = Number(p.id);
      if (!Number.isInteger(id) || id < 1) return;
      if (!Number.isFinite(n) || n < 1) {
        alert('Chiqim uchun kamida 1 kiriting.');
        return;
      }
      setConfirmingChiqimId(id);
      try {
        const confirmRes = await request(`/warehouse-admin/products/${id}/confirm-chiqim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse_chiqim_qty: n }),
        });
        const confirmD = await confirmRes.json().catch(() => ({}));
        if (!confirmRes.ok) {
          alert(confirmD?.error || 'Chiqim tasdiqlanmadi');
          return;
        }
        await loadSellerProductsOverview();
        setChiqimLedgerOpen(null);
        bumpChiqimCancelKey(id);
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setConfirmingChiqimId(0);
      }
    },
    [request, loadSellerProductsOverview, bumpChiqimCancelKey],
  );

  const handleChiqimLedgerExpandCancel = useCallback(
    (productId) => {
      const id = Number(productId);
      setChiqimLedgerOpen((prev) => (prev?.id === id ? null : prev));
      bumpChiqimCancelKey(id);
    },
    [bumpChiqimCancelKey],
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
      if (kind === 'approve_kirim') {
        await handleApproveKirim(
          p.id,
          Math.max(Number(p.warehouse_kirim_qty) || 0, Number(p.stock) || 0),
        );
      } else if (kind === 'confirm_chiqim') await handleConfirmChiqim(p.id);
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
        const wasDelisted = Boolean(p.warehouse_delisted_at);
        const nextStatus = wasDelisted ? 'active' : 'pending';
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
        if (!wasDelisted && nextStatus === 'pending') {
          goView('delisted');
        } else {
          await loadSellerProductsOverview();
        }
      } catch (e) {
        alert(e?.message || 'Tarmoq xatosi');
      } finally {
        setDelistingId(0);
      }
    },
    [request, loadSellerProductsOverview, goView],
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

  useEffect(() => {
    if (view !== 'profile') return undefined;
    let cancelled = false;
    setWaProfileError('');
    setWaProfileOk('');
    (async () => {
      setWaProfileLoading(true);
      try {
        const res = await request('/warehouse-admin/profile');
        const d = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const p = d.profile || {};
        setWaProfileForm({
          full_name: String(p.full_name || '').trim(),
          phone: String(p.phone || '').trim(),
          avatar_url: String(p.avatar_url || '').trim(),
          email: String(p.email || '').trim(),
          login: String(p.login || '').trim(),
          password: '',
          password2: '',
        });
      } catch {
        if (!cancelled) setWaProfileError('Profil yuklanmadi.');
      } finally {
        if (!cancelled) setWaProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, request]);

  const handleWaProfileSave = async (e) => {
    e.preventDefault();
    setWaProfileSaving(true);
    setWaProfileError('');
    setWaProfileOk('');
    const pwd = String(waProfileForm.password || '').trim();
    if (pwd && pwd !== String(waProfileForm.password2 || '').trim()) {
      setWaProfileError('Parollar mos kelmayapti.');
      setWaProfileSaving(false);
      return;
    }
    try {
      const updatedUser = await updateProfile({
        full_name: waProfileForm.full_name.trim(),
        email: waProfileForm.email.trim(),
        login: waProfileForm.login.trim(),
        phone: waProfileForm.phone.trim(),
        ...(pwd ? { password: pwd } : {}),
      });
      if (updatedUser) {
        setWaProfileForm((prev) => ({
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
      const res = await request('/warehouse-admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: waProfileForm.full_name.trim(),
          phone: waProfileForm.phone.trim(),
          avatar_url: waProfileForm.avatar_url.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Saqlanmadi');
      setWaProfileOk('Saqlandi.');
      setWaProfileForm((p) => ({ ...p, password: '', password2: '' }));
      await retrySession();
    } catch (err) {
      setWaProfileError(err.message || 'Xatolik');
    } finally {
      setWaProfileSaving(false);
    }
  };

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
                className="picker-topbar-hamburger warehouse-admin-topbar-hamburger"
                onClick={() => setSidePanelOpen((v) => !v)}
                aria-label={sidePanelOpen ? pickerUiT.ariaSideClose : pickerUiT.ariaSideOpen}
                aria-expanded={sidePanelOpen}
              >
                <span className="picker-hamburger-icon" />
              </button>
              <span className="picker-topbar-logo">MyShop · Ombor</span>
              <div className="picker-topbar-right">
                <button
                  type="button"
                  className="warehouse-admin-topbar-scan-btn"
                  onClick={() => setScannerOpen(true)}
                  aria-label="Mahsulotni skanerlash"
                  title="Mahsulotni skanerlash"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2M4 12h16"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <StaffNotificationBell
                  t={pickerUiT}
                  notificationsEnabled={notificationsEnabled}
                  notificationsOpen={notificationsOpen}
                  setNotificationsOpen={setNotificationsOpen}
                  unreadCount={unreadNotifCount}
                  notifications={notifications}
                  onMarkRead={markNotificationRead}
                  formatDateTime={formatNotifWhen}
                  onBellOpenChange={(open) => {
                    if (open) setProfileMenuOpen(false);
                  }}
                  onDismiss={async (n) => {
                    if (!n.read_at) await markNotificationRead(n.id);
                  }}
                />
                <div className="picker-topbar-profile-slot">
                  <StaffTopbarProfileMenu
                    name={warehouseName}
                    avatarUrl={waProfileForm.avatar_url || undefined}
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
                    onHome={() => navigate('/')}
                    onProfile={() => goView('profile')}
                    onSettings={() => goView('settings')}
                    onLogout={() => {
                      logout();
                      navigate('/');
                    }}
                  />
                      </div>
              </div>
            </div>
          </header>
        )}
        <StaffSidePanel
          open={sidePanelOpen}
          panelClassName="warehouse-admin-side-panel"
          brandIcon="📦"
          brandTitle="MyShop"
          brandSubtitle="OMBOR ADMIN PANELI"
          headExtra={<StaffTopbarCenterId className="staff-topbar-center-id--inline" />}
          userName={warehouseName}
          userRole={warehouseRoleLabel}
          navItems={staffSideNavItems}
          navAriaLabel="Ombor admin bo‘limlari"
          onLogout={() => {
                  logout();
                  navigate('/');
                }}
          onToggleTheme={toggleTheme}
          isDark={isDark}
          themeSunLabel={pickerUiT.themeSunLabel}
          themeMoonLabel={pickerUiT.themeMoonLabel}
          onOverlayClick={closeSidebar}
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

              {view === 'profile' ? (
                <section className="picker-subpage">
                  <p className="picker-profile-intro">{pickerUiT.profileIntro}</p>
                  <div className="picker-profile-card">
                    {waProfileLoading ? (
                      <div className="picker-profile-loading">
                        <span className="picker-spinner" aria-hidden />
                        <span>{pickerUiT.profileLoading}</span>
                      </div>
                    ) : (
                      <form className="picker-profile-form staff-account-touch" onSubmit={handleWaProfileSave}>
                        {waProfileError ? (
                          <div className="picker-profile-alert picker-profile-alert--error" role="alert">
                            {waProfileError}
                          </div>
                        ) : null}
                        {waProfileOk ? (
                          <div className="picker-profile-alert picker-profile-alert--ok" role="status">
                            {waProfileOk}
                          </div>
                        ) : null}
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profileName}</span>
                          <input
                            type="text"
                            className="picker-profile-input"
                            value={waProfileForm.full_name}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, full_name: ev.target.value }))}
                            autoComplete="name"
                            required
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profileEmail}</span>
                          <input
                            type="email"
                            className="picker-profile-input"
                            value={waProfileForm.email}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, email: ev.target.value }))}
                            autoComplete="email"
                            required
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profileLogin}</span>
                          <input
                            type="text"
                            className="picker-profile-input"
                            value={waProfileForm.login}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, login: ev.target.value }))}
                            autoComplete="username"
                            required
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profilePhone}</span>
                          <input
                            type="tel"
                            className="picker-profile-input"
                            value={waProfileForm.phone}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, phone: ev.target.value }))}
                            placeholder="+998901234567"
                            autoComplete="tel"
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">Avatar URL</span>
                          <input
                            type="url"
                            className="picker-profile-input"
                            value={waProfileForm.avatar_url}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, avatar_url: ev.target.value }))}
                            placeholder="https://…"
                            autoComplete="off"
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profilePassword}</span>
                          <input
                            type="password"
                            className="picker-profile-input"
                            value={waProfileForm.password}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, password: ev.target.value }))}
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
                            value={waProfileForm.password2}
                            onChange={(ev) => setWaProfileForm((p) => ({ ...p, password2: ev.target.value }))}
                            autoComplete="new-password"
                          />
                        </label>
                        <button
                          type="submit"
                          className="picker-btn picker-btn-primary picker-profile-submit"
                          disabled={waProfileSaving}
                        >
                          {waProfileSaving ? pickerUiT.profileSaving : pickerUiT.profileSave}
                        </button>
                      </form>
                    )}
                  </div>
                </section>
              ) : null}

              {view === 'settings' ? (
                <section className="picker-subpage">
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
              ) : null}

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
                            ref={(el) => {
                              homeRowRefs.current[p.id] = el;
                            }}
                            className={`warehouse-admin-sheet-row-group${
                              scanHighlightId === p.id ? ' warehouse-admin-sheet-row-group--scan-hit' : ''
                            }`}
                          >
                            <div
                              className={`warehouse-admin-grid-row warehouse-admin-grid-row--ledger${
                                (Number(p.warehouse_chiqim_qty) || 0) >= 1 && !p.warehouse_chiqim_confirmed_at
                                  ? ' warehouse-admin-grid-row--chiqim-active'
                                  : ''
                              }`}
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
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-num-cell warehouse-admin-cell-unit-sum"
                              role="gridcell"
                              title={formatWarehouseProductSumUz(p)}
                            >
                              <span className="warehouse-admin-cell-unit-sum-inner">
                                {formatWarehouseProductSumUz(p)}
                              </span>
                            </div>
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-grid-cell--ledger"
                              role="gridcell"
                            >
                              <LedgerQtyEditor
                                compact
                                hideConfirmButton
                                expandOnClick
                                deferConfirmToActionsColumn
                                reportState={(s) => handleKirimLedgerReport(p.id, s)}
                                peerExclusiveExpandedProductId={kirimLedgerOpen?.id ?? chiqimLedgerOpen?.id ?? null}
                                cancelExpandKey={kirimCancelKeys[p.id] || 0}
                                product={p}
                                field="warehouse_kirim_qty"
                                hintLabel="Stock (seller kiritgan)"
                                hintValue={Number(p.stock) || 0}
                                confirmedAt={p.warehouse_approved_at}
                                onReload={loadSellerProductsOverview}
                                request={request}
                              />
                            </div>
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-grid-cell--ledger"
                              role="gridcell"
                            >
                              <LedgerQtyEditor
                                compact
                                hideConfirmButton
                                expandOnClick
                                deferConfirmToActionsColumn
                                reportState={(s) => handleChiqimLedgerReport(p.id, s)}
                                peerExclusiveExpandedProductId={chiqimLedgerOpen?.id ?? kirimLedgerOpen?.id ?? null}
                                cancelExpandKey={chiqimCancelKeys[p.id] || 0}
                                product={p}
                                field="warehouse_chiqim_qty"
                                hintLabel="Buyurtma"
                                hintValue={Number(p.orders_chiqim_soni) || 0}
                                confirmSlug="confirm-chiqim"
                                confirmedAt={p.warehouse_chiqim_confirmed_at}
                                onReload={loadSellerProductsOverview}
                                request={request}
                              />
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
                              kirimLedgerOpenForProductId={kirimLedgerOpen?.id ?? null}
                              kirimLedgerDraftVal={String(kirimLedgerOpen?.val ?? '')}
                              onKirimLedgerSaveAndApprove={handleKirimLedgerSaveAndApprove}
                              onKirimLedgerExpandCancel={handleKirimLedgerExpandCancel}
                              chiqimLedgerOpenForProductId={chiqimLedgerOpen?.id ?? null}
                              chiqimLedgerDraftVal={String(chiqimLedgerOpen?.val ?? '')}
                              onChiqimLedgerSaveAndConfirm={handleChiqimLedgerSaveAndConfirm}
                              onChiqimLedgerExpandCancel={handleChiqimLedgerExpandCancel}
                            />
                            </div>
                            <WarehouseChiqimConfirmedDuplicateRow
                              product={p}
                              sheetView="home"
                              request={request}
                              onReload={loadSellerProductsOverview}
                            />
                          </div>
                        ))}
                    </div>
                    </div>
                  </div>
                </>
              )}

              {(view === 'kirim' || view === 'chiqim' || view === 'delisted' || view === 'deleted') && (
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
                      {!sellerProductsLoading && sheetRows.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">
                          {sheetEmptyMessage}
                        </p>
                      )}
                      {!sellerProductsLoading &&
                        sheetRows.map((p) => (
                          <div key={p.id} className="warehouse-admin-sheet-row-group">
                            <div
                              className={`warehouse-admin-grid-row warehouse-admin-grid-row--ledger${warehouseKirimChiqimSheetMainRowClass(view, p)}`}
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
                              className="warehouse-admin-grid-cell warehouse-admin-num-cell warehouse-admin-cell-unit-sum"
                              role="gridcell"
                              title={formatWarehouseProductSumUz(p)}
                            >
                              <span className="warehouse-admin-cell-unit-sum-inner">
                                {formatWarehouseProductSumUz(p)}
                              </span>
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
                              ) : (
                                <LedgerQtyEditor
                                  compact
                                  hideConfirmButton
                                  expandOnClick
                                  deferConfirmToActionsColumn
                                  reportState={(s) => handleKirimLedgerReport(p.id, s)}
                                  peerExclusiveExpandedProductId={
                                    kirimLedgerOpen?.id ?? chiqimLedgerOpen?.id ?? null
                                  }
                                  cancelExpandKey={kirimCancelKeys[p.id] || 0}
                                  product={p}
                                  field="warehouse_kirim_qty"
                                  hintLabel="Stock"
                                  hintValue={Number(p.stock) || 0}
                                  confirmedAt={p.warehouse_approved_at}
                                  onReload={loadSellerProductsOverview}
                                  request={request}
                                />
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
                                  expandOnClick
                                  deferConfirmToActionsColumn
                                  reportState={(s) => handleChiqimLedgerReport(p.id, s)}
                                  peerExclusiveExpandedProductId={chiqimLedgerOpen?.id ?? kirimLedgerOpen?.id ?? null}
                                  cancelExpandKey={chiqimCancelKeys[p.id] || 0}
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
                              actionsContext={sheetActionsContext}
                              busy={rowBusyFlags}
                              onPrimary={handlePrimaryAction}
                              onToggleSale={handleToggleWarehouseSale}
                              onDelete={handleDeleteProductWarehouse}
                              kirimLedgerOpenForProductId={
                                view === 'deleted' ? null : kirimLedgerOpen?.id ?? null
                              }
                              kirimLedgerDraftVal={String(kirimLedgerOpen?.val ?? '')}
                              onKirimLedgerSaveAndApprove={handleKirimLedgerSaveAndApprove}
                              onKirimLedgerExpandCancel={handleKirimLedgerExpandCancel}
                              chiqimLedgerOpenForProductId={
                                view === 'deleted' ? null : chiqimLedgerOpen?.id ?? null
                              }
                              chiqimLedgerDraftVal={String(chiqimLedgerOpen?.val ?? '')}
                              onChiqimLedgerSaveAndConfirm={handleChiqimLedgerSaveAndConfirm}
                              onChiqimLedgerExpandCancel={handleChiqimLedgerExpandCancel}
                            />
                          </div>
                            <WarehouseChiqimConfirmedDuplicateRow
                              product={p}
                              sheetView={view}
                              request={request}
                              onReload={loadSellerProductsOverview}
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
                            <div
                              className="warehouse-admin-grid-cell warehouse-admin-num-cell warehouse-admin-cell-unit-sum"
                              role="gridcell"
                              title={formatWarehouseProductSumUz(p)}
                            >
                              <span className="warehouse-admin-cell-unit-sum-inner">
                                {formatWarehouseProductSumUz(p)}
                              </span>
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

              {view === 'hold' && (
                <>
                  {holdError ? (
                    <div className="picker-error-inline" role="alert">
                      {holdError}
                    </div>
                  ) : null}
                  <div className="warehouse-admin-hold-wrap">
                    <div className="warehouse-admin-hold-table" role="table" aria-label="Hold mahsulotlari">
                      <div className="warehouse-admin-hold-row warehouse-admin-hold-row--head" role="row">
                        <span role="columnheader">Rasm</span>
                        <span role="columnheader">Mahsulot</span>
                        <span role="columnheader">Seller</span>
                        <span role="columnheader">Buyurtma</span>
                        <span role="columnheader">Soni</span>
                        <span role="columnheader">Holddan chiqarish</span>
                      </div>
                      {holdLoading && (
                        <p className="warehouse-admin-grid-row-empty" aria-live="polite">
                          Yuklanmoqda…
                        </p>
                      )}
                      {!holdLoading && holdRows.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">
                          Hozircha holdda turgan mahsulot yoʻq.
                        </p>
                      )}
                      {!holdLoading &&
                        holdRows.map((r) => {
                          const busy = holdBusyOrderId === r.order_id;
                          return (
                            <div key={r.item_id} className="warehouse-admin-hold-row" role="row">
                              <span role="cell" className="warehouse-admin-hold-cell-img">
                                <div className="warehouse-admin-product-thumb-wrap">
                                  {r.image_url ? (
                                    <img className="warehouse-admin-product-thumb" src={r.image_url} alt="" />
                                  ) : (
                                    <span className="warehouse-admin-thumb-ph" aria-hidden>
                                      —
                                    </span>
                                  )}
                                </div>
                              </span>
                              <span role="cell" title={r.name_uz} className="warehouse-admin-hold-cell-name">
                                {r.name_uz}
                              </span>
                              <span role="cell" title={r.seller_name} className="warehouse-admin-hold-cell-ellipsis">
                                {r.seller_name}
                              </span>
                              <span role="cell" className="warehouse-admin-hold-cell-order">
                                #{r.order_id}
                              </span>
                              <span role="cell" className="warehouse-admin-hold-cell-qty">
                                {r.qty}
                              </span>
                              <span role="cell">
                                <button
                                  type="button"
                                  className="warehouse-admin-hold-release-btn"
                                  onClick={() => void handleReleaseHoldOrder(r.order_id)}
                                  disabled={busy}
                                  title="Holddan chiqarish — buyurtma qayta navbatga qaytadi"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <path
                                      d="M12 19V5M12 5L6 11M12 5l6 6"
                                      stroke="currentColor"
                                      strokeWidth="2.4"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                  {busy ? '...' : 'Holddan chiqarish'}
                                </button>
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}

              {STAFF_DIRECTORY_VIEWS.has(view) && (
                <div className="warehouse-admin-staff-directory">
                  {staffDirectoryError ? (
                    <div className="picker-error-inline" role="alert">
                      {staffDirectoryError}
                    </div>
                  ) : null}
                  <div className="warehouse-admin-staff-directory-wrap">
                    <div
                      className={`warehouse-admin-staff-directory-table warehouse-admin-staff-directory-table--${view}`}
                      role="table"
                      aria-label={nonChatTitle}
                    >
                      <div
                        className="warehouse-admin-staff-directory-row warehouse-admin-staff-directory-row--head"
                        role="row"
                      >
                        {STAFF_DIRECTORY_COLUMNS[view].map((col) => (
                          <span role="columnheader" key={col.key}>
                            {col.label}
                          </span>
                        ))}
                      </div>
                      {staffDirectoryLoading && (
                        <p className="warehouse-admin-grid-row-empty" aria-live="polite">
                          Yuklanmoqda…
                        </p>
                      )}
                      {!staffDirectoryLoading && staffDirectoryRows.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">
                          Hozircha {nonChatTitle.toLowerCase()} roli bilan qo‘shilgan xodim yo‘q.
                        </p>
                      )}
                      {!staffDirectoryLoading &&
                        staffDirectoryRows.map((s) => (
                          <div key={s.id} className="warehouse-admin-staff-directory-row" role="row">
                            {STAFF_DIRECTORY_COLUMNS[view].map((col) => {
                              const val = s[col.key];

                              if (col.key === 'full_name') {
                                return (
                                  <span
                                    role="cell"
                                    key={col.key}
                                    data-label={col.label}
                                    className="warehouse-admin-staff-directory-cell-name"
                                  >
                                    <span className="warehouse-admin-staff-name-inner">
                                      <i
                                        className={`warehouse-admin-staff-online-dot${
                                          s.online ? ' warehouse-admin-staff-online-dot--online' : ''
                                        }`}
                                        title={s.online ? 'Onlayn' : 'Oflayn'}
                                        aria-hidden
                                      />
                                      {val}
                                    </span>
                                    <button
                                      type="button"
                                      className="warehouse-admin-staff-summary-btn"
                                      onClick={() => openSummaryModal(view, s)}
                                      title="Umumiy ma'lumot"
                                    >
                                      📊 Umumiy ma'lumot
                                    </button>
                                  </span>
                                );
                              }

                              if (col.key === 'status') {
                                return (
                                  <span role="cell" key={col.key} data-label={col.label}>
                                    <span
                                      className={`warehouse-admin-staff-online-badge${
                                        String(val) === 'active' ? ' warehouse-admin-staff-online-badge--online' : ''
                                      }`}
                                    >
                                      <i aria-hidden />
                                      {STAFF_STATUS_LABELS[val] || val || '—'}
                                    </span>
                                  </span>
                                );
                              }

                              // Tahrirlanadigan: Depozit (kuryer) va Sotuv foizi (seller)
                              if (col.key === 'deposit' || col.key === 'commission_percent') {
                                const rowId = col.key === 'deposit' ? s.staff_member_id : s.seller_id;
                                const isEditing =
                                  directoryEdit && directoryEdit.rowId === rowId && directoryEdit.field === col.key;
                                if (isEditing) {
                                  return (
                                    <span role="cell" key={col.key} data-label={col.label}>
                                      <span className="warehouse-admin-staff-edit-inline">
                                        <input
                                          type="number"
                                          min="0"
                                          className="warehouse-admin-staff-edit-input"
                                          value={directoryEdit.val}
                                          autoFocus
                                          onChange={(e) =>
                                            setDirectoryEdit((prev) => (prev ? { ...prev, val: e.target.value } : prev))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') void saveDirectoryEdit();
                                            if (e.key === 'Escape') cancelDirectoryEdit();
                                          }}
                                        />
                                        <button
                                          type="button"
                                          className="warehouse-admin-staff-edit-save"
                                          onClick={() => void saveDirectoryEdit()}
                                          disabled={directoryEditBusy}
                                        >
                                          ✓
                                        </button>
                                        <button
                                          type="button"
                                          className="warehouse-admin-staff-edit-cancel"
                                          onClick={cancelDirectoryEdit}
                                          disabled={directoryEditBusy}
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    </span>
                                  );
                                }
                                return (
                                  <span role="cell" key={col.key} data-label={col.label}>
                                    <button
                                      type="button"
                                      className="warehouse-admin-staff-editable-value"
                                      onClick={() => rowId && startDirectoryEdit(rowId, col.key, val)}
                                      disabled={!rowId}
                                      title="Tahrirlash"
                                    >
                                      {col.key === 'deposit' ? formatSum(val) : `${Number(val) || 0}%`}
                                      <span className="warehouse-admin-staff-editable-pencil" aria-hidden>
                                        ✎
                                      </span>
                                    </button>
                                  </span>
                                );
                              }

                              if (col.key === 'courier_balance' || col.key === 'balance') {
                                return (
                                  <span
                                    role="cell"
                                    key={col.key}
                                    data-label={col.label}
                                    className="warehouse-admin-staff-directory-cell-muted"
                                  >
                                    {formatSum(val)}
                                  </span>
                                );
                              }

                              if (col.key === 'rating_percent') {
                                return (
                                  <span
                                    role="cell"
                                    key={col.key}
                                    data-label={col.label}
                                    className="warehouse-admin-staff-directory-cell-muted"
                                  >
                                    {Number(val) || 0}%
                                  </span>
                                );
                              }

                              if (col.key === 'today_count') {
                                return (
                                  <span role="cell" key={col.key} data-label={col.label}>
                                    <button
                                      type="button"
                                      className="warehouse-admin-staff-daily-count-btn"
                                      onClick={() => void openDailyOrdersModal(view, s)}
                                      disabled={!Number(val)}
                                      title="Bugungi zakazlarni ko‘rish"
                                    >
                                      {Number(val) || 0} ta
                                    </button>
                                  </span>
                                );
                              }

                              return (
                                <span
                                  role="cell"
                                  key={col.key}
                                  data-label={col.label}
                                  className="warehouse-admin-staff-directory-cell-muted"
                                >
                                  {val === null || val === undefined || val === '' ? '—' : val}
                                </span>
                              );
                            })}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {view === 'archived_orders' && (
                <>
                  {archivedOrdersError ? (
                    <div className="picker-error-inline" role="alert">
                      {archivedOrdersError}
            </div>
                  ) : null}
                  <StaffArchivedOrdersTable
                    request={request}
                    canManage
                    onError={setArchivedOrdersError}
                  />
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

        <StaffCameraBarcodeScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={handleWarehouseProductScan}
          title="Mahsulotni skanerlang"
          hint="Seller mahsuloti shtrix-kodi/QR kodini ramka ichiga joylang"
        />

        {dailyOrdersModal && (
          <div
            className="warehouse-admin-daily-modal-backdrop"
            role="presentation"
            onClick={closeDailyOrdersModal}
          >
            <div
              className="warehouse-admin-daily-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Bugungi zakazlar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="warehouse-admin-daily-modal-head">
                <div>
                  <p className="warehouse-admin-daily-modal-name">{dailyOrdersModal.name}</p>
                  <p className="warehouse-admin-daily-modal-date">
                    {dailyOrdersModal.data?.date || new Date().toISOString().slice(0, 10)}
                  </p>
                </div>
                <button
                  type="button"
                  className="warehouse-admin-daily-modal-close"
                  onClick={closeDailyOrdersModal}
                  aria-label="Yopish"
                >
                  ✕
                </button>
              </div>

              <div className="warehouse-admin-daily-modal-summary">
                <div className="warehouse-admin-daily-modal-summary-item">
                  <span>Soni</span>
                  <strong>{dailyOrdersModal.data?.count ?? 0} ta</strong>
                </div>
                <div className="warehouse-admin-daily-modal-summary-item">
                  <span>Summasi</span>
                  <strong>{formatSum(dailyOrdersModal.data?.total_sum || 0)}</strong>
                </div>
              </div>

              <div className="warehouse-admin-daily-modal-body">
                {dailyOrdersModal.loading && <p className="warehouse-admin-grid-row-empty">Yuklanmoqda…</p>}
                {!dailyOrdersModal.loading && dailyOrdersModal.error && (
                  <p className="warehouse-admin-grid-row-empty">{dailyOrdersModal.error}</p>
                )}
                {!dailyOrdersModal.loading &&
                  !dailyOrdersModal.error &&
                  (dailyOrdersModal.data?.orders?.length ?? 0) === 0 && (
                    <p className="warehouse-admin-grid-row-empty">Bugun uchun zakaz topilmadi.</p>
                  )}
                {!dailyOrdersModal.loading &&
                  dailyOrdersModal.data?.orders?.map((o) => (
                    <div key={o.order_id} className="warehouse-admin-daily-modal-receipt-row">
                      <div className="warehouse-admin-daily-modal-receipt-main">
                        <span className="warehouse-admin-daily-modal-receipt-id">#{o.order_id}</span>
                        <span className="warehouse-admin-daily-modal-receipt-courier">{o.courier_name}</span>
                      </div>
                      <span className="warehouse-admin-daily-modal-receipt-sum">{formatSum(o.total_amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {summaryModal && (
          <div className="warehouse-admin-daily-modal-backdrop" role="presentation" onClick={closeSummaryModal}>
            <div
              className="warehouse-admin-daily-modal warehouse-admin-summary-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Umumiy ma'lumot"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="warehouse-admin-daily-modal-head">
                <div>
                  <p className="warehouse-admin-daily-modal-name">{summaryModal.name}</p>
                  <p className="warehouse-admin-daily-modal-date">{nonChatTitle} — kunlik ma'lumot</p>
                </div>
                <div className="warehouse-admin-summary-head-actions">
                  {(summaryModal.role === 'expeditor' || summaryModal.role === 'order_receiver') && (
                    <button
                      type="button"
                      className={`warehouse-admin-summary-courier-btn${courierFilterOpen ? ' is-active' : ''}`}
                      onClick={() => (courierFilterOpen ? closeCourierFilter() : openCourierFilter())}
                      title="Kuryer bo'yicha filtr"
                    >
                      🚴 Kuryer
                    </button>
                  )}
                  <button
                    type="button"
                    className="warehouse-admin-daily-modal-close"
                    onClick={closeSummaryModal}
                    aria-label="Yopish"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {courierFilterOpen && (
                <div className="warehouse-admin-courier-filter-panel">
                  <select
                    className="warehouse-admin-summary-calendar-input"
                    value={selectedViloyatId}
                    onChange={(e) => (e.target.value ? void pickViloyatForCourierFilter(e.target.value) : null)}
                  >
                    <option value="">— Hududni tanlang —</option>
                    {viloyatlarList.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>

                  {selectedViloyatId ? (
                    <select
                      className="warehouse-admin-summary-calendar-input"
                      value={selectedCourierId || ''}
                      onChange={(e) => (e.target.value ? void pickCourierForFilter(Number(e.target.value)) : null)}
                      disabled={regionCouriersLoading}
                    >
                      <option value="">
                        {regionCouriersLoading
                          ? 'Yuklanmoqda…'
                          : regionCouriers.length === 0
                            ? 'Bu hududda kuryer topilmadi'
                            : '— Kuryerni tanlang —'}
                      </option>
                      {regionCouriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {courierSummary && (
                    <div className="warehouse-admin-daily-modal-body warehouse-admin-courier-summary-body">
                      {courierSummary.loading && <p className="warehouse-admin-grid-row-empty">Yuklanmoqda…</p>}
                      {!courierSummary.loading && courierSummary.error && (
                        <p className="warehouse-admin-grid-row-empty">{courierSummary.error}</p>
                      )}
                      {!courierSummary.loading &&
                        !courierSummary.error &&
                        courierSummary.items.map((it) => (
                          <div key={it.key} className="warehouse-admin-summary-item-row">
                            <span className="warehouse-admin-summary-item-label">{it.label}</span>
                            <span className="warehouse-admin-summary-item-count">{it.count} ta</span>
                            <span className="warehouse-admin-summary-item-sum">{formatSum(it.sum)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="warehouse-admin-summary-calendar">
                <input
                  type="date"
                  className="warehouse-admin-summary-calendar-input"
                  value={summaryModal.date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => changeSummaryModalDate(e.target.value)}
                />
              </div>

              {!courierFilterOpen && summaryModal.role === 'courier' && (
                <>
                  <div className="warehouse-admin-courier-tabs">
                    {summaryModal.items.map((it) => (
                      <button
                        key={it.key}
                        type="button"
                        className={`warehouse-admin-courier-tab${
                          activeCourierCategory === it.key ? ' is-active' : ''
                        }`}
                        onClick={() =>
                          it.key === 'home_left' ? void openHomeLeftModal() : selectCourierCategory(it.key)
                        }
                      >
                        <span className="warehouse-admin-courier-tab-label">{it.label}</span>
                        <span className="warehouse-admin-courier-tab-count">{it.count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="warehouse-admin-daily-modal-body warehouse-admin-courier-receipt-body">
                    {(!categoryOrdersData || categoryOrdersData.loading) && (
                      <p className="warehouse-admin-grid-row-empty">Yuklanmoqda…</p>
                    )}
                    {categoryOrdersData && !categoryOrdersData.loading && categoryOrdersData.error && (
                      <p className="warehouse-admin-grid-row-empty">{categoryOrdersData.error}</p>
                    )}
                    {categoryOrdersData &&
                      !categoryOrdersData.loading &&
                      !categoryOrdersData.error &&
                      categoryOrdersData.orders.length === 0 && (
                        <p className="warehouse-admin-grid-row-empty">Bu kategoriyada zakaz topilmadi.</p>
                      )}
                    {categoryOrdersData &&
                      !categoryOrdersData.loading &&
                      categoryOrdersData.orders.map((o) => (
                        <div key={o.order_id} className="warehouse-admin-daily-modal-receipt-row">
                          <div className="warehouse-admin-daily-modal-receipt-main">
                            <span className="warehouse-admin-daily-modal-receipt-id">#{o.order_id}</span>
                            <span className="warehouse-admin-daily-modal-receipt-courier">{o.status}</span>
                          </div>
                          <span className="warehouse-admin-daily-modal-receipt-sum">{formatSum(o.total_amount)}</span>
                        </div>
                      ))}
                  </div>
                </>
              )}

              {!courierFilterOpen && summaryModal.role !== 'courier' && (
                <div className="warehouse-admin-daily-modal-body">
                  {summaryModal.loading && <p className="warehouse-admin-grid-row-empty">Yuklanmoqda…</p>}
                  {!summaryModal.loading && summaryModal.error && (
                    <p className="warehouse-admin-grid-row-empty">{summaryModal.error}</p>
                  )}
                  {!summaryModal.loading && !summaryModal.error && summaryModal.items.length === 0 && (
                    <p className="warehouse-admin-grid-row-empty">
                      Bu rol uchun kunlik statistika hozircha mavjud emas.
                    </p>
                  )}
                  {!summaryModal.loading &&
                    summaryModal.items.map((it) => (
                      <div key={it.key} className="warehouse-admin-summary-item-row">
                        <span className="warehouse-admin-summary-item-label">{it.label}</span>
                        <span className="warehouse-admin-summary-item-count">{it.count} ta</span>
                        <span className="warehouse-admin-summary-item-sum">{formatSum(it.sum)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {homeLeftModal && (
          <div className="warehouse-admin-daily-modal-backdrop" role="presentation" onClick={closeHomeLeftModal}>
            <div
              className="warehouse-admin-daily-modal warehouse-admin-home-left-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Uyda qolgan mahsulotlar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="warehouse-admin-daily-modal-head">
                <div>
                  <p className="warehouse-admin-daily-modal-name">Uyda qolgan mahsulotlar</p>
                  <p className="warehouse-admin-daily-modal-date">{homeLeftModal.date}</p>
                </div>
                <button
                  type="button"
                  className="warehouse-admin-daily-modal-close"
                  onClick={closeHomeLeftModal}
                  aria-label="Yopish"
                >
                  ✕
                </button>
              </div>

              <div className="warehouse-admin-daily-modal-summary">
                <div className="warehouse-admin-daily-modal-summary-item">
                  <span>Soni</span>
                  <strong>{homeLeftModal.count} ta</strong>
                </div>
                <div className="warehouse-admin-daily-modal-summary-item">
                  <span>Summasi</span>
                  <strong>{formatSum(homeLeftModal.total_sum)}</strong>
                </div>
              </div>

              <div className="warehouse-admin-daily-modal-body warehouse-admin-home-left-grid">
                {homeLeftModal.loading && <p className="warehouse-admin-grid-row-empty">Yuklanmoqda…</p>}
                {!homeLeftModal.loading && homeLeftModal.error && (
                  <p className="warehouse-admin-grid-row-empty">{homeLeftModal.error}</p>
                )}
                {!homeLeftModal.loading && !homeLeftModal.error && homeLeftModal.products.length === 0 && (
                  <p className="warehouse-admin-grid-row-empty">Uyda qolgan mahsulot topilmadi.</p>
                )}
                {!homeLeftModal.loading &&
                  homeLeftModal.products.map((p, idx) => (
                    <div key={`${p.order_id}-${p.product_id}-${idx}`} className="warehouse-admin-home-left-card">
                      <div className="warehouse-admin-home-left-thumb-wrap">
                        {p.image_url ? (
                          <img className="warehouse-admin-home-left-thumb" src={p.image_url} alt="" />
                        ) : (
                          <span className="warehouse-admin-thumb-ph" aria-hidden>
                            —
                          </span>
                        )}
                      </div>
                      <div className="warehouse-admin-home-left-card-info">
                        <span className="warehouse-admin-home-left-card-name" title={p.name_uz}>
                          {p.name_uz}
                        </span>
                        <span className="warehouse-admin-home-left-card-qty">#{p.order_id} · {p.quantity} dona</span>
                        <span className="warehouse-admin-home-left-card-sum">{formatSum(p.price * p.quantity)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
