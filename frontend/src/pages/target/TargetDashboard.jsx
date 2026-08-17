import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { API_PREFIX, parseApiJsonText } from '../../lib/apiBase';
import { isTargetPrincipal } from '../../utils/sellerPrincipal.js';
import { CATALOG_NAV_CATEGORIES, mergeCategoriesFromApi } from '../../constants/catalogCategories.js';
import {
  CABINET_QUICK_TILES,
  DEFAULT_TARGET_VIEW,
  TARGET_MENU_ITEMS,
  TARGET_MOBILE_TAB_ITEMS,
  TARGET_MORE_MENU_ITEMS,
  TARGET_ORDER_VIEW_KEYS,
  TARGET_ORDER_VIEWS,
  TARGET_VIEW_LABELS,
  normalizeTargetView,
} from './targetNav.js';
import { formatDateTimeUz } from '../../utils/uzbekistanTime.js';
import { PACKER_UZ_VILOYATLAR, getDistrictsForViloyat } from '../../constants/uzViloyatlarPacker.js';
import {
  NavCategoryMenuProvider,
  NavCategoryDesktopDropdown,
  NavCategoryMobileTrigger,
} from '../../components/NavCategoryMenu.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';
import StaffNotificationBell from '../../components/notifications/StaffNotificationBell.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu.jsx';
import { STAFF_TOPBAR_T_UZ } from '../../constants/staffTopbarUz.js';
import './TargetDashboard.css';
import TargetGuideView from './TargetGuideView.jsx';
import TargetMyChatView from './TargetMyChatView.jsx';
import TargetOrdersView from './TargetOrdersView.jsx';
import { affiliateCommissionInfo, formatAffiliatePercent } from './targetAffiliate.js';
import { buildTargetBillingWindowClient } from '../../utils/targetBillingWindow.js';
import {
  TARGET_ACCENT_PRESETS,
  alertTargetNotification,
  applySavedTargetAccentColors,
  applyTargetAccentColors,
  commitTargetAccentColors,
  playTargetIphoneSmsTone,
  readTargetAccentDark,
  readTargetAccentLight,
  readTargetNotificationsEnabled,
  setTargetAccentRuntime,
  vibrateTargetNotification,
  writeTargetNotificationsEnabled,
} from '../../utils/targetUiPrefs.js';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function resolveImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return s;
  return `/uploads/${s.replace(/^\/+/, '')}`;
}

/** Profil rasmini server limitiga mos JPEG ga qisqartirish */
function compressAvatarImage(file, maxEdge = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Rasm qayta ishlanmadi'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.88;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 180000 && quality > 0.45) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 200000) {
          reject(new Error('Rasm hajmi juda katta — boshqa rasm tanlang'));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Rasm ochilmadi'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi."));
    reader.readAsDataURL(file);
  });
}

function buildTargetApiKey(user) {
  const uid = Number(user?.id) || 0;
  const sid = Number(user?.seller_id) || uid;
  const seed = `msk-target-${sid}-${uid}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const body = `${sid.toString(36)}${uid.toString(36)}${hex}${hex}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `msk_live_${body.slice(0, 32)}`;
}

function maskApiKey(key) {
  return '•'.repeat(Math.max(24, String(key || '').length));
}

const SURVEY_COLUMNS = [
  { key: 'id', label: 'ID', narrow: true },
  { key: 'operator', label: 'Operator' },
  { key: 'date', label: 'Sana' },
  { key: 'stream', label: 'Oqim' },
  { key: 'customer', label: 'Haridor' },
  { key: 'region', label: 'Viloyat', narrow: true },
  { key: 'phone', label: 'Telefon' },
  { key: 'status', label: 'Holati', narrow: true },
  { key: 'note', label: 'Izoh' },
];

const LINKS_PAGE_SIZE = 8;
const STATS_PAGE_SIZE = 10;
const FAVORITES_PAGE_SIZE = 12;

const STATS_METRIC_KEYS = [
  { key: 'visits', label: 'Tashrif' },
  { key: 'new_count', label: 'Yangi' },
  { key: 'delivery', label: 'Dostavka Bugun/Keyin', paired: true },
  { key: 'packaging', label: 'Qadoqlash' },
  { key: 'delivering', label: 'Yetkazilmoqda' },
  { key: 'delivered', label: 'Yetkazildi' },
  { key: 'take_later', label: 'Keyin oladi' },
  { key: 'returned', label: 'Qaytib keldi' },
];

function formatStatNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '—';
  return new Intl.NumberFormat('uz-UZ').format(n);
}

function formatDeliveryPair(today, later) {
  const a = Number(today) || 0;
  const b = Number(later) || 0;
  if (a === 0 && b === 0) return '—/—';
  return `${a || '—'}/${b || '—'}`;
}

function renderStatMetric(row, metric) {
  if (metric.paired) {
    return formatDeliveryPair(row.delivery_today, row.delivery_later);
  }
  return formatStatNum(row[metric.key]);
}

const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

function formatContestDate(value) {
  const s = String(value || '').trim();
  if (!s) return '—';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const day = Number(m[3]);
  const month = UZ_MONTHS[Number(m[2]) - 1] || m[2];
  return `${day}-${month}, ${m[1]}-yil`;
}

export default function TargetDashboard() {
  const { user, loading, logout, request, retrySession } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notifBusyId, setNotifBusyId] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(CATALOG_NAV_CATEGORIES);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [cabinetStats, setCabinetStats] = useState({ balance: 0, transit: 0, coins: 0 });
  const [surveys, setSurveys] = useState([]);
  const [surveysLoading, setSurveysLoading] = useState(false);
  const [orderRows, setOrderRows] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [links, setLinks] = useState([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksSearchInput, setLinksSearchInput] = useState('');
  const [linksSearch, setLinksSearch] = useState('');
  const [linksPage, setLinksPage] = useState(1);
  const [linksMeta, setLinksMeta] = useState({ total: 0, total_pages: 1 });
  const [linkCopiedId, setLinkCopiedId] = useState(null);
  const [statsMode, setStatsMode] = useState('stream');
  const [statsRows, setStatsRows] = useState([]);
  const [statsSummary, setStatsSummary] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsPage, setStatsPage] = useState(1);
  const [statsMeta, setStatsMeta] = useState({ total: 0, total_pages: 1 });
  const [contestData, setContestData] = useState(null);
  const [contestLoading, setContestLoading] = useState(false);
  const [paymentData, setPaymentData] = useState({ balance: 0, coins: 0, pending: 0, withdrawals: [], coin_settings: null });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [withdrawTab, setWithdrawTab] = useState('money');
  const [withdrawCard, setWithdrawCard] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [withdrawErr, setWithdrawErr] = useState(false);
  const [referralData, setReferralData] = useState({ url: '', total: 0, referrals: [] });
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [favoritesMeta, setFavoritesMeta] = useState({ total: 0, total_pages: 1 });
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [favoriteBusyId, setFavoriteBusyId] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsErr, setSettingsErr] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    region_id: '',
    district_id: '',
    telegram_id: '',
    about: '',
  });
  const [passwordForm, setPasswordForm] = useState({ new_password: '', confirm_password: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordErr, setPasswordErr] = useState(false);
  const [contactForm, setContactForm] = useState({ phone: '', email: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMsg, setContactMsg] = useState('');
  const [contactErr, setContactErr] = useState(false);
  const [targetNotifSound, setTargetNotifSound] = useState(readTargetNotificationsEnabled);
  const [savedAccentLight, setSavedAccentLight] = useState(readTargetAccentLight);
  const [savedAccentDark, setSavedAccentDark] = useState(readTargetAccentDark);
  const [draftAccentLight, setDraftAccentLight] = useState(readTargetAccentLight);
  const [draftAccentDark, setDraftAccentDark] = useState(readTargetAccentDark);
  const [accentSaveMsg, setAccentSaveMsg] = useState('');
  const accentDraftRef = useRef({
    light: readTargetAccentLight(),
    dark: readTargetAccentDark(),
  });
  const avatarInputRef = useRef(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [profileAvatarDraft, setProfileAvatarDraft] = useState('');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const [avatarLightbox, setAvatarLightbox] = useState('');
  const knownNotifIdsRef = useRef(null);
  const { theme, setTheme } = useTheme();
  const [billingWindow, setBillingWindow] = useState(() => buildTargetBillingWindowClient());
  const [billingStatusLoading, setBillingStatusLoading] = useState(true);

  const billingUnlocked = billingWindow?.active === true;

  const activeView = normalizeTargetView(searchParams.get('view'));

  const setActiveView = useCallback(
    (nextView) => {
      const view = normalizeTargetView(nextView);
      const next = new URLSearchParams(searchParams);
      if (view === DEFAULT_TARGET_VIEW) next.delete('view');
      else next.set('view', view);
      setSearchParams(next, { replace: true });
      setSidebarOpen(false);
    },
    [searchParams, setSearchParams],
  );

  const isMobileTabActive = useCallback((key) => {
    if (key === '__more') {
      return TARGET_MORE_MENU_ITEMS.some((item) => item.key === activeView);
    }
    return activeView === key;
  }, [activeView]);

  useEffect(() => {
    setSidebarOpen(false);
    setMobileMoreOpen(false);
  }, [activeView]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setNotificationsLoading(true);
    try {
      const res = await request('/target/notifications', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifications([]);
        return;
      }
      const rows = Array.isArray(data?.notifications) ? data.notifications : [];
      const mapped = rows.map((item) => ({
        id: item.id,
        title: item.title || 'Xabar',
        body: item.message || '',
        created_at: item.created_at,
        read_at: Number(item.is_read) ? item.created_at || '1' : null,
        link_view: item.link_view,
        type: item.type,
      }));

      if (knownNotifIdsRef.current !== null) {
        const hasNewUnread = mapped.some(
          (item) => !item.read_at && !knownNotifIdsRef.current.has(item.id),
        );
        if (hasNewUnread) {
          alertTargetNotification(targetNotifSound);
        }
      }
      knownNotifIdsRef.current = new Set(mapped.map((item) => item.id));

      setNotifications(mapped);
    } catch {
      setNotifications([]);
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  }, [request, targetNotifSound]);

  useEffect(() => {
    if (!user || !isTargetPrincipal(user)) return undefined;
    loadNotifications(true);
    const timer = window.setInterval(() => loadNotifications(true), 15000);
    return () => window.clearInterval(timer);
  }, [user, loadNotifications]);

  useEffect(() => {
    if (notificationsOpen) loadNotifications(true);
  }, [notificationsOpen, loadNotifications]);

  const markNotificationRead = useCallback(async (id) => {
    setNotifBusyId(id);
    try {
      await request(`/target/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: n.created_at || new Date().toISOString() } : n)),
      );
    } catch {
      /* ignore */
    } finally {
      setNotifBusyId(null);
    }
  }, [request]);

  const handleNotifNavigate = useCallback((linkView) => {
    const key = String(linkView || '').trim().toLowerCase();
    const viewMap = {
      payment: 'payment',
      finance: 'payment',
      dashboard: 'cabinet',
      cabinet: 'cabinet',
      market: 'market',
      stats: 'stats',
      links: 'links',
      surveys: 'surveys',
      contest: 'contest',
      referral: 'referral',
      settings: 'settings',
      profile: 'profile',
    };
    if (viewMap[key]) setActiveView(viewMap[key]);
    setNotificationsOpen(false);
    setSidebarOpen(false);
  }, [setActiveView]);

  useEffect(() => {
    if (!mobileMoreOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMoreOpen]);

  const displayName = useMemo(() => {
    const name = String(user?.full_name || '').trim();
    if (name) return name;
    return String(user?.login || user?.email || 'Foydalanuvchi').trim();
  }, [user]);

  const phone = String(user?.phone || '').trim() || '—';

  const fallbackAvatarUrl = useMemo(
    () => `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&size=128`,
    [displayName],
  );

  const topbarAvatarUrl = useMemo(() => {
    const custom = String(profileAvatarUrl || '').trim();
    if (custom) return resolveImageUrl(custom) || custom;
    return fallbackAvatarUrl;
  }, [profileAvatarUrl, fallbackAvatarUrl]);

  const sidebarAvatarPreview = useMemo(() => {
    const custom = String(profileAvatarDraft || profileAvatarUrl || '').trim();
    if (custom) return resolveImageUrl(custom) || custom;
    return '';
  }, [profileAvatarDraft, profileAvatarUrl]);

  const avatarDirty = Boolean(profileAvatarDraft && profileAvatarDraft !== profileAvatarUrl);

  const apiKey = useMemo(() => buildTargetApiKey(user), [user]);

  const loadBillingAccess = useCallback(async () => {
    try {
      const res = await request('/target/access-status', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && typeof data.active === 'boolean') {
        setBillingWindow(data);
        return;
      }
    } catch {
      /* fallback */
    }
    setBillingWindow(buildTargetBillingWindowClient());
  }, [request]);

  useEffect(() => {
    if (activeView !== 'payment') return undefined;
    setBillingStatusLoading(true);
    loadBillingAccess().finally(() => setBillingStatusLoading(false));
    const timer = window.setInterval(() => loadBillingAccess(), 60000);
    return () => window.clearInterval(timer);
  }, [activeView, loadBillingAccess]);

  const loadCabinetStats = useCallback(async () => {
    try {
      const res = await request('/target/cabinet', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCabinetStats({ balance: 0, transit: 0, coins: 0 });
        return;
      }
      setCabinetStats({
        balance: Number(data?.balance) || 0,
        transit: Number(data?.pending) || 0,
        coins: Number(data?.coins) || 0,
      });
      const av = String(data?.avatar_url || '').trim();
      setProfileAvatarUrl(av);
      setProfileAvatarDraft(av);
    } catch {
      setCabinetStats({ balance: 0, transit: 0, coins: 0 });
    }
  }, [request]);

  const loadSurveys = useCallback(async () => {
    setSurveysLoading(true);
    try {
      const res = await request('/target/surveys', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSurveys([]);
        return;
      }
      setSurveys(Array.isArray(data?.surveys) ? data.surveys : []);
    } catch {
      setSurveys([]);
    } finally {
      setSurveysLoading(false);
    }
  }, [request]);

  const loadOrders = useCallback(async (bucket) => {
    setOrdersLoading(true);
    try {
      const res = await request(`/target/orders?bucket=${encodeURIComponent(bucket)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrderRows([]);
        return;
      }
      setOrderRows(Array.isArray(data?.orders) ? data.orders : []);
    } catch {
      setOrderRows([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [request]);

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(linksPage));
      params.set('limit', String(LINKS_PAGE_SIZE));
      if (linksSearch) params.set('q', linksSearch);
      const res = await request(`/target/links?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinks([]);
        setLinksMeta({ total: 0, total_pages: 1 });
        return;
      }
      setLinks(Array.isArray(data?.links) ? data.links : []);
      setLinksMeta({
        total: Number(data?.total) || 0,
        total_pages: Math.max(1, Number(data?.total_pages) || 1),
      });
    } catch {
      setLinks([]);
      setLinksMeta({ total: 0, total_pages: 1 });
    } finally {
      setLinksLoading(false);
    }
  }, [request, linksPage, linksSearch]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('mode', statsMode);
      params.set('page', String(statsPage));
      params.set('limit', String(STATS_PAGE_SIZE));
      const res = await request(`/target/stats?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatsRows([]);
        setStatsSummary(null);
        setStatsMeta({ total: 0, total_pages: 1 });
        return;
      }
      setStatsRows(Array.isArray(data?.rows) ? data.rows : []);
      setStatsSummary(data?.summary || null);
      setStatsMeta({
        total: Number(data?.total) || 0,
        total_pages: Math.max(1, Number(data?.total_pages) || 1),
      });
    } catch {
      setStatsRows([]);
      setStatsSummary(null);
      setStatsMeta({ total: 0, total_pages: 1 });
    } finally {
      setStatsLoading(false);
    }
  }, [request, statsMode, statsPage]);

  const loadContest = useCallback(async () => {
    setContestLoading(true);
    try {
      const res = await request('/target/contest', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContestData(null);
        return;
      }
      setContestData(data);
    } catch {
      setContestData(null);
    } finally {
      setContestLoading(false);
    }
  }, [request]);

  const loadPayment = useCallback(async () => {
    setPaymentLoading(true);
    try {
      const res = await request('/target/payment', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaymentData({ balance: 0, coins: 0, withdrawals: [] });
        return;
      }
      setPaymentData({
        balance: Number(data?.balance) || 0,
        coins: Number(data?.coins) || 0,
        pending: Number(data?.pending) || 0,
        coin_settings: data?.coin_settings || null,
        withdrawals: Array.isArray(data?.withdrawals) ? data.withdrawals : [],
      });
    } catch {
      setPaymentData({ balance: 0, coins: 0, withdrawals: [] });
    } finally {
      setPaymentLoading(false);
    }
  }, [request]);

  const loadReferral = useCallback(async () => {
    setReferralLoading(true);
    try {
      const res = await request('/target/referral', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReferralData({ url: '', total: 0, referrals: [] });
        return;
      }
      setReferralData({
        url: String(data?.url || ''),
        total: Number(data?.total) || 0,
        referrals: Array.isArray(data?.referrals) ? data.referrals : [],
      });
    } catch {
      setReferralData({ url: '', total: 0, referrals: [] });
    } finally {
      setReferralLoading(false);
    }
  }, [request]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsMsg('');
    setSettingsErr(false);
    try {
      const res = await request('/target/settings', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Sozlamalar yuklanmadi');
      const p = data?.profile || {};
      setProfileForm({
        first_name: String(p.first_name || '').trim(),
        last_name: String(p.last_name || '').trim(),
        region_id: String(p.region_id || '').trim(),
        district_id: String(p.district_id || '').trim(),
        telegram_id: String(p.telegram_id || '').trim(),
        about: String(p.about || '').trim(),
      });
      setContactForm({
        phone: String(p.phone || user?.phone || '').trim(),
        email: String(p.email || user?.email || '').trim(),
      });
      const av = String(p.avatar_url || '').trim();
      setProfileAvatarUrl(av);
      setProfileAvatarDraft(av);
    } catch (err) {
      const names = String(user?.full_name || '').trim().split(/\s+/).filter(Boolean);
      setProfileForm({
        first_name: names[0] || '',
        last_name: names.slice(1).join(' '),
        region_id: '',
        district_id: '',
        telegram_id: '',
        about: '',
      });
      setContactForm({
        phone: String(user?.phone || '').trim(),
        email: String(user?.email || '').trim(),
      });
      setSettingsMsg(err.message || 'Sozlamalar yuklanmadi');
      setSettingsErr(true);
    } finally {
      setSettingsLoading(false);
    }
  }, [request, user?.full_name, user?.phone, user?.email]);

  const handleContactSave = async (e) => {
    e.preventDefault();
    if (contactSaving) return;
    setContactSaving(true);
    setContactMsg('');
    setContactErr(false);
    try {
      const res = await request('/target/settings/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Saqlab bo\'lmadi');
      setContactMsg(data?.message || 'Saqlandi');
      setContactErr(false);
      await retrySession?.();
    } catch (err) {
      setContactMsg(err.message || 'Saqlab bo\'lmadi');
      setContactErr(true);
    } finally {
      setContactSaving(false);
    }
  };

  const handleTargetNotifToggle = () => {
    const next = !targetNotifSound;
    setTargetNotifSound(next);
    writeTargetNotificationsEnabled(next);
    if (next) playTargetIphoneSmsTone();
    else vibrateTargetNotification();
  };

  const applyAccentDraft = useCallback((light, dark) => {
    accentDraftRef.current = { light, dark };
    setTargetAccentRuntime(light, dark);
    applyTargetAccentColors(theme, light, dark);
  }, [theme]);

  const handleAccentLightChange = (color) => {
    const next = String(color || '').trim().toLowerCase();
    setDraftAccentLight(next);
    setAccentSaveMsg('');
    applyAccentDraft(next, accentDraftRef.current.dark);
  };

  const handleAccentDarkChange = (color) => {
    const next = String(color || '').trim().toLowerCase();
    setDraftAccentDark(next);
    setAccentSaveMsg('');
    applyAccentDraft(accentDraftRef.current.light, next);
  };

  const accentColorsDirty = useMemo(
    () => draftAccentLight !== savedAccentLight || draftAccentDark !== savedAccentDark,
    [draftAccentLight, draftAccentDark, savedAccentLight, savedAccentDark],
  );

  const handleAccentColorsSave = () => {
    commitTargetAccentColors(draftAccentLight, draftAccentDark);
    setSavedAccentLight(draftAccentLight);
    setSavedAccentDark(draftAccentDark);
    applySavedTargetAccentColors(theme);
    setAccentSaveMsg('Ranglar saqlandi');
  };

  const handleAvatarFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setAvatarMsg('Faqat rasm tanlang');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarMsg('Rasm hajmi 8 MB dan oshmasin');
      return;
    }
    try {
      const dataUrl = await compressAvatarImage(file);
      setProfileAvatarDraft(dataUrl);
      setAvatarMsg('');
    } catch (err) {
      setAvatarMsg(err.message || 'Rasm yuklanmadi');
    }
  };

  const handleAvatarView = () => {
    if (sidebarAvatarPreview) {
      setAvatarLightbox(sidebarAvatarPreview);
      return;
    }
    avatarInputRef.current?.click();
  };

  const handleAvatarSave = async () => {
    if (avatarSaving || !profileAvatarDraft) return;
    setAvatarSaving(true);
    setAvatarMsg('');
    try {
      const res = await request('/target/settings/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: profileAvatarDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Saqlab bo\'lmadi');
      const saved = String(data?.avatar_url || profileAvatarDraft).trim();
      setProfileAvatarUrl(saved);
      setProfileAvatarDraft(saved);
      setAvatarMsg('Saqlandi');
      await retrySession?.();
    } catch (err) {
      setAvatarMsg(err.message || 'Saqlab bo\'lmadi');
    } finally {
      setAvatarSaving(false);
    }
  };

  const loadFavoriteIds = useCallback(async () => {
    try {
      const res = await request('/target/favorites/ids', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFavoriteIds(new Set());
        return;
      }
      const ids = Array.isArray(data?.product_ids) ? data.product_ids.map(Number).filter((n) => n > 0) : [];
      setFavoriteIds(new Set(ids));
    } catch {
      setFavoriteIds(new Set());
    }
  }, [request]);

  const loadFavorites = useCallback(async () => {
    setFavoritesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(favoritesPage));
      params.set('limit', String(FAVORITES_PAGE_SIZE));
      const res = await request(`/target/favorites?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFavorites([]);
        setFavoritesMeta({ total: 0, total_pages: 1 });
        return;
      }
      setFavorites(Array.isArray(data?.favorites) ? data.favorites : []);
      setFavoritesMeta({
        total: Number(data?.total) || 0,
        total_pages: Math.max(1, Number(data?.total_pages) || 1),
      });
    } catch {
      setFavorites([]);
      setFavoritesMeta({ total: 0, total_pages: 1 });
    } finally {
      setFavoritesLoading(false);
    }
  }, [request, favoritesPage]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (searchQuery) params.set('q', searchQuery);
      const qs = params.toString();
      const [prodRes, catRes] = await Promise.all([
        fetch(`${API_PREFIX}/products${qs ? `?${qs}` : ''}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${API_PREFIX}/products/categories`, { credentials: 'include', cache: 'no-store' }),
      ]);
      const prodText = await prodRes.text();
      const catText = await catRes.text();
      const prodData = parseApiJsonText(prodText);
      const catData = parseApiJsonText(catText);
      setProducts(Array.isArray(prodData?.products) ? prodData.products : []);
      setCategories(mergeCategoriesFromApi(catData?.categories || []));
    } catch {
      setProducts([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [categoryFilter, searchQuery]);

  useEffect(() => {
    if (!user || !isTargetPrincipal(user)) return;
    loadCabinetStats();
  }, [user, loadCabinetStats]);

  useEffect(() => {
    if (activeView !== 'market') return;
    loadCatalog();
    loadFavoriteIds();
  }, [activeView, loadCatalog, loadFavoriteIds]);

  useEffect(() => {
    if (activeView !== 'cabinet') return;
    loadCabinetStats();
  }, [activeView, loadCabinetStats]);

  useEffect(() => {
    if (activeView !== 'surveys') return;
    loadSurveys();
  }, [activeView, loadSurveys]);

  useEffect(() => {
    if (!TARGET_ORDER_VIEW_KEYS.includes(activeView)) return;
    loadOrders(activeView);
  }, [activeView, loadOrders]);

  useEffect(() => {
    if (activeView !== 'links') return;
    loadLinks();
  }, [activeView, loadLinks]);

  useEffect(() => {
    if (activeView !== 'stats') return;
    loadStats();
  }, [activeView, loadStats]);

  useEffect(() => {
    if (activeView !== 'contest') return;
    loadContest();
  }, [activeView, loadContest]);

  useEffect(() => {
    if (activeView !== 'payment' || !billingUnlocked) return;
    loadPayment();
  }, [activeView, loadPayment, billingUnlocked]);

  useEffect(() => {
    if (activeView !== 'referral') return;
    loadReferral();
  }, [activeView, loadReferral]);

  useEffect(() => {
    if (activeView !== 'favorites') return;
    loadFavorites();
    loadFavoriteIds();
  }, [activeView, loadFavorites, loadFavoriteIds]);

  useEffect(() => {
    applySavedTargetAccentColors(theme);
  }, [theme]);

  useEffect(() => {
    const light = readTargetAccentLight();
    const dark = readTargetAccentDark();
    accentDraftRef.current = { light, dark };
    setTargetAccentRuntime(light, dark);
    applySavedTargetAccentColors(theme);
  }, []);

  useEffect(() => {
    if (activeView !== 'profile' && activeView !== 'settings') return;
    loadSettings();
  }, [activeView, loadSettings]);

  const districtOptions = useMemo(
    () => getDistrictsForViloyat(profileForm.region_id),
    [profileForm.region_id],
  );

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsMsg('');
    setSettingsErr(false);
    try {
      const res = await request('/target/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profileForm,
          district_id: profileForm.region_id ? profileForm.district_id : '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Saqlab bo\'lmadi');
      setSettingsMsg(data?.message || 'Saqlandi');
      setSettingsErr(false);
      await retrySession?.();
    } catch (err) {
      setSettingsMsg(err.message || 'Saqlab bo\'lmadi');
      setSettingsErr(true);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (passwordSaving) return;
    setPasswordSaving(true);
    setPasswordMsg('');
    setPasswordErr(false);
    try {
      const res = await request('/target/settings/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Parolni o'zgartirib bo'lmadi");
      setPasswordMsg(data?.message || "Parol o'zgartirildi");
      setPasswordErr(false);
      setPasswordForm({ new_password: '', confirm_password: '' });
    } catch (err) {
      setPasswordMsg(err.message || "Parolni o'zgartirib bo'lmadi");
      setPasswordErr(true);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCopyReferralLink = async () => {
    const url = referralData.url || `${window.location.origin}/register?id=${user?.id || ''}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Referal havola:', url);
      }
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      window.prompt('Referal havola:', url);
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    if (withdrawSubmitting) return;
    setWithdrawMsg('');
    setWithdrawErr(false);
    setWithdrawSubmitting(true);
    try {
      const res = await request('/target/payment/withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: withdrawTab,
          card_number: withdrawCard.trim(),
          amount: Number(withdrawAmount),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'So\'rov yuborilmadi');
      setWithdrawMsg(data?.message || "So'rov yuborildi");
      setWithdrawErr(false);
      setWithdrawCard('');
      setWithdrawAmount('');
      await loadPayment();
      await loadCabinetStats();
    } catch (err) {
      setWithdrawMsg(err.message || 'So\'rov yuborilmadi');
      setWithdrawErr(true);
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const handleCopyLink = async (link) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link.url);
      } else {
        window.prompt('Havola:', link.url);
      }
      setLinkCopiedId(link.id);
      window.setTimeout(() => setLinkCopiedId(null), 2000);
    } catch {
      window.prompt('Havola:', link.url);
    }
  };

  const handleLinksSearchSubmit = (e) => {
    e.preventDefault();
    setLinksPage(1);
    setLinksSearch(linksSearchInput.trim());
  };

  const handleCopyApiKey = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(apiKey);
      } else {
        window.prompt('API Key:', apiKey);
      }
      setApiKeyCopied(true);
      window.setTimeout(() => setApiKeyCopied(false), 2000);
    } catch {
      window.prompt('API Key:', apiKey);
    }
  };

  const handleCabinetTileClick = (tile) => {
    if (tile.action === 'logout') {
      logout();
      navigate('/login');
      return;
    }
    if (tile.key === 'favorites') setFavoritesPage(1);
    setActiveView(tile.key);
  };

  const handleBottomTabClick = (key) => {
    if (key === '__more') {
      setMobileMoreOpen(true);
      return;
    }
    setMobileMoreOpen(false);
    setSidebarOpen(false);
    setActiveView(key);
  };

  const handleMoreMenuClick = (key) => {
    if (key === 'favorites') setFavoritesPage(1);
    setMobileMoreOpen(false);
    setSidebarOpen(false);
    setActiveView(key);
  };

  const handleToggleFavorite = async (productId, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const id = Number(productId);
    if (!Number.isFinite(id) || id < 1 || favoriteBusyId === id) return;

    const isFav = favoriteIds.has(id);
    setFavoriteBusyId(id);
    try {
      const res = await request(
        isFav ? `/target/favorites/${id}` : '/target/favorites',
        {
          method: isFav ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isFav ? undefined : JSON.stringify({ product_id: id }),
        },
      );
      if (!res.ok) throw new Error('Xatolik');
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(id);
        else next.add(id);
        return next;
      });
      if (activeView === 'favorites') await loadFavorites();
    } catch {
      window.alert(isFav ? 'Saralanganlardan olib bo\'lmadi.' : 'Saralanganlarga qo\'shib bo\'lmadi.');
    } finally {
      setFavoriteBusyId(null);
    }
  };

  const handleCreateStream = async (product) => {
    try {
      const res = await request('/target/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          stream_name: product.name_uz || 'Oqim',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Oqim yaratib bo\'lmadi');
      const url = data.url || `${window.location.origin}/products/${product.id}?ref=${user?.seller_id || user?.id || ''}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert(`Oqim havolasi yaratildi va nusxalandi:\n${url}`);
      } else {
        window.prompt('Oqim havolasi:', url);
      }
      if (activeView === 'links') loadLinks();
    } catch (err) {
      const sellerId = user?.seller_id || user?.id || '';
      const url = `${window.location.origin}/products/${product.id}${sellerId ? `?ref=${sellerId}` : ''}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          window.alert(`Oqim havolasi nusxalandi:\n${url}`);
        }).catch(() => {
          window.prompt('Oqim havolasi:', url);
        });
      } else {
        window.prompt('Oqim havolasi:', url);
      }
      if (String(err?.message || '').trim()) {
        console.warn(err.message);
      }
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    if (activeView !== 'market') setActiveView('market');
  };

  const handleMobileSearchToggle = () => {
    setMobileSearchOpen((open) => !open);
  };

  if (loading) {
    return <div className="target-loading">Yuklanmoqda…</div>;
  }

  if (!user || !isTargetPrincipal(user)) {
    return null;
  }

  const showPaymentBillingLock = activeView === 'payment' && !billingStatusLoading && !billingUnlocked;
  const isMyChatView = activeView === 'mychat';

  const paymentBillingLockScreen = showPaymentBillingLock ? (
    <div className="target-billing-lock" role="alertdialog" aria-labelledby="target-billing-lock-title">
      <div className="target-billing-lock-card">
        <span className="target-billing-lock-icon" aria-hidden>
          <i className="fas fa-lock" />
        </span>
        <h2 id="target-billing-lock-title">Hisob vaqtincha qulflangan</h2>
        <p>
          Target panel hisob-kitobi faqat <strong>har oyning 15-kuni</strong> va{' '}
          <strong>oyning oxirgi kuni</strong> faol ishlaydi. Qolgan kunlarda hisob qulflangan bo&apos;ladi —
          yangi ro&apos;yxatdan o&apos;tgan xodimlar ham shu qoidaga bo&apos;ysunadi.
        </p>
        {billingWindow?.next_active_label ? (
          <p className="target-billing-lock-next">
            Keyingi faol kun: <strong>{billingWindow.next_active_label}</strong>
          </p>
        ) : null}
        <button type="button" className="target-billing-lock-btn" onClick={() => loadBillingAccess()}>
          <i className="fas fa-sync-alt" aria-hidden />
          Holatni yangilash
        </button>
      </div>
    </div>
  ) : null;

  return (
    <NavCategoryMenuProvider setMenuOpen={setTopbarMenuOpen} menuOpen={topbarMenuOpen}>
    <div className={`target-app${sidebarOpen ? ' target-app--sidebar-open' : ''}${isMyChatView ? ' target-app--mychat' : ''}`}>
      <div className={`target-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden />

      <div className="target-shell">
        <aside className={`target-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="target-sidebar-head">
            <Link
              to="/target"
              className="target-topbar-logo target-sidebar-logo"
              onClick={() => {
                setActiveView('market');
                setSidebarOpen(false);
              }}
            >
              MyShop
            </Link>
            <button
              type="button"
              className="target-sidebar-close"
              aria-label="Menyuni yopish"
              onClick={() => setSidebarOpen(false)}
            >
              <i className="fas fa-times" aria-hidden />
            </button>
          </div>

          <div className="target-profile-card">
            <div className="target-profile-avatar-wrap">
              <button
                type="button"
                className="target-profile-avatar"
                aria-label={sidebarAvatarPreview ? 'Profil rasmini ko\'rish' : 'Profil rasmini tanlash'}
                onClick={handleAvatarView}
              >
                {sidebarAvatarPreview ? (
                  <img src={sidebarAvatarPreview} alt="" className="target-profile-avatar-img" />
                ) : (
                  <i className="fas fa-user" aria-hidden />
                )}
              </button>
              <button
                type="button"
                className="target-profile-avatar-edit"
                aria-label="Galereyadan rasm tanlash"
                onClick={() => avatarInputRef.current?.click()}
              >
                <i className="fas fa-camera" aria-hidden />
              </button>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="target-profile-avatar-input"
              onChange={handleAvatarFilePick}
            />
            <div className="target-profile-name">{displayName}</div>
            <div className="target-profile-balances">
              <span className="target-profile-balance-item">
                <i className="fas fa-wallet" aria-hidden />
                {formatCurrency(cabinetStats.balance)}
              </span>
              <span className="target-profile-balance-sep" aria-hidden>·</span>
              <span className="target-profile-balance-item">
                <i className="fas fa-coins" aria-hidden />
                {new Intl.NumberFormat('uz-UZ').format(cabinetStats.coins)} tanga
              </span>
            </div>
            {avatarDirty ? (
              <button
                type="button"
                className="target-profile-avatar-save"
                disabled={avatarSaving}
                onClick={handleAvatarSave}
              >
                <i className="fas fa-save" aria-hidden />
                {avatarSaving ? 'Saqlanmoqda…' : 'Saqlash'}
              </button>
            ) : null}
            {avatarMsg ? (
              <p className={`target-profile-avatar-msg${avatarMsg === 'Saqlandi' ? ' is-success' : ''}`}>
                {avatarMsg}
              </p>
            ) : null}
          </div>

          <nav className="target-nav" aria-label="Target menyu">
            {TARGET_MENU_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`target-nav-item ${activeView === item.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveView(item.key);
                  setSidebarOpen(false);
                }}
              >
                <i className={`fas ${item.icon}`} aria-hidden />
                <span>{item.label}</span>
              </button>
            ))}

            <div className="target-sidebar-mobile-actions">
              <button
                type="button"
                className="target-logout-btn target-logout-btn--mobile"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <i className="fas fa-sign-out-alt" aria-hidden />
                Chiqish
              </button>
              <ThemeToggle
                className="target-sidebar-theme-toggle"
                ariaSun="Tun rejimi"
                ariaMoon="Kun rejimi"
              />
            </div>
          </nav>

          <div className="target-sidebar-footer target-sidebar-footer--desktop">
            <button
              type="button"
              className="target-logout-btn"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <i className="fas fa-sign-out-alt" aria-hidden />
              Chiqish
            </button>
          </div>
        </aside>

        <div className={`target-main${isMyChatView ? ' target-main--mychat' : ''}`}>
          {!isMyChatView ? (
          <header className="target-topbar">
            <div className="target-topbar-row">
              <div className="target-topbar-start">
                <button
                  type="button"
                  className="target-mobile-menu-btn"
                  aria-label="Menyu"
                  onClick={() => setSidebarOpen(true)}
                >
                  <i className="fas fa-bars" />
                </button>

                <Link to="/target" className="target-topbar-logo" onClick={() => setActiveView('market')}>
                  MyShop
                </Link>
              </div>

              <nav className="target-topbar-nav" aria-label="Yuqori menyu">
                <Link to="/">Bosh sahifa</Link>
                <NavCategoryDesktopDropdown label="Kategoriyalar" className="target-topbar-category" />
                <Link to="/products">Do&apos;kon</Link>
              </nav>

              <form
                className={`target-topbar-search${mobileSearchOpen ? ' is-open' : ''}`}
                onSubmit={handleSearchSubmit}
              >
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Mahsulot qidirish..."
                  aria-label="Mahsulot qidirish"
                />
                <button type="submit" aria-label="Qidirish">
                  <i className="fas fa-search" />
                </button>
              </form>

              <div className="target-topbar-tools">
                <div className="target-topbar-mobile-cat">
                  <NavCategoryMobileTrigger label="Kategoriyalar" className="target-topbar-category-trigger" />
                </div>

                <div className="target-topbar-actions">
                  <ThemeToggle
                    className="target-theme-toggle target-topbar-theme-desktop"
                    ariaSun="Tun rejimi"
                    ariaMoon="Kun rejimi"
                  />
                  <div className="target-topbar-bell-mobile">
                    <StaffNotificationBell
                      t={STAFF_TOPBAR_T_UZ}
                      notificationsOpen={notificationsOpen}
                      setNotificationsOpen={setNotificationsOpen}
                      unreadCount={unreadNotifCount}
                      notifications={notifications}
                      onMarkRead={markNotificationRead}
                      formatDateTime={(iso) => formatDateTimeUz(iso, { empty: '—' })}
                      busyId={notifBusyId}
                      onBellOpenChange={(open) => {
                        if (open) {
                          setMobileSearchOpen(false);
                          setProfileMenuOpen(false);
                        }
                      }}
                      onDismiss={async (n) => {
                        if (!n.read_at) await markNotificationRead(n.id);
                      }}
                      renderActions={(n) => {
                        const link = String(n.link_view || '').trim();
                        if (!link) return null;
                        return (
                          <button type="button" className="target-notif-open-btn" onClick={() => handleNotifNavigate(link)}>
                            Ko&apos;rish
                          </button>
                        );
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={`target-topbar-search-toggle${mobileSearchOpen ? ' is-active' : ''}`}
                    aria-label="Qidiruv"
                    aria-expanded={mobileSearchOpen}
                    onClick={handleMobileSearchToggle}
                  >
                    <i className="fas fa-search" aria-hidden />
                  </button>
                  <div className="target-topbar-profile-slot">
                    <StaffTopbarProfileMenu
                      name={displayName}
                      avatarUrl={topbarAvatarUrl}
                      open={profileMenuOpen}
                      onOpenChange={(next) => {
                        setProfileMenuOpen(next);
                        if (next) {
                          setNotificationsOpen(false);
                          setMobileSearchOpen(false);
                        }
                      }}
                      triggerClassName="target-profile-popover-trigger"
                      hideChevron
                      onHome={() => navigate('/')}
                      onProfile={() => {
                        setProfileMenuOpen(false);
                        setActiveView('profile');
                      }}
                      onSettings={() => {
                        setProfileMenuOpen(false);
                        setActiveView('settings');
                      }}
                      onLogout={() => {
                        logout();
                        navigate('/login');
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>
          ) : null}

          <main className={`target-content${isMyChatView ? ' target-content--mychat' : ''}`}>
            {activeView === 'cabinet' ? (
              <div className="target-cabinet-card">
                <h1 className="target-cabinet-title">Mening kabinetim</h1>

                <div className="target-cabinet-stats">
                  <article className="target-stat-card target-stat-card--balance">
                    <span className="target-stat-label">Asosiy Balans</span>
                    <strong className="target-stat-value">{formatCurrency(cabinetStats.balance)}</strong>
                  </article>
                  <article className="target-stat-card target-stat-card--transit">
                    <span className="target-stat-label">Yo&apos;ldagi Pul</span>
                    <strong className="target-stat-value">{formatCurrency(cabinetStats.transit)}</strong>
                  </article>
                  <article className="target-stat-card target-stat-card--coins">
                    <span className="target-stat-label">Tangalar</span>
                    <strong className="target-stat-value">{new Intl.NumberFormat('uz-UZ').format(cabinetStats.coins)}</strong>
                  </article>
                </div>

                <section className="target-cabinet-api" aria-label="API Key">
                  <label htmlFor="target-api-key">API Key</label>
                  <div className="target-cabinet-api-row">
                    <div className="target-cabinet-api-field">
                      <input
                        id="target-api-key"
                        type="text"
                        readOnly
                        value={apiKeyVisible ? apiKey : maskApiKey(apiKey)}
                        aria-label="API Key"
                      />
                      <button
                        type="button"
                        className="target-cabinet-api-toggle"
                        onClick={() => setApiKeyVisible((v) => !v)}
                        aria-label={apiKeyVisible ? 'API Key yashirish' : 'API Key ko\'rsatish'}
                      >
                        <i className={`fas ${apiKeyVisible ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden />
                      </button>
                    </div>
                    <button type="button" className="target-cabinet-copy-btn" onClick={handleCopyApiKey}>
                      <i className="fas fa-copy" aria-hidden />
                      {apiKeyCopied ? 'Nusxalandi' : 'Nusxa olish'}
                    </button>
                  </div>
                </section>

                <div className="target-cabinet-grid">
                  {CABINET_QUICK_TILES.map((tile) => (
                    <button
                      key={tile.action || tile.key}
                      type="button"
                      className={`target-cabinet-tile${tile.action === 'logout' ? ' target-cabinet-tile--logout' : ''}`}
                      onClick={() => handleCabinetTileClick(tile)}
                    >
                      <span className="target-cabinet-tile-icon">
                        <i className={`fas ${tile.icon}`} aria-hidden />
                      </span>
                      <span className="target-cabinet-tile-text">
                        <strong>{tile.label}</strong>
                        <small>{tile.desc}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : activeView === 'surveys' ? (
              <div className="target-surveys-card">
                <div className="target-surveys-head">
                  <i className="fas fa-clipboard-list" aria-hidden />
                  <h1>So&apos;rovnomalar</h1>
                </div>

                <div className="target-surveys-table-wrap">
                  <div className="target-surveys-grid" role="table" aria-label="So'rovnomalar jadvali">
                    <div className="target-surveys-colhead" role="row">
                      {SURVEY_COLUMNS.map((col) => (
                        <div
                          key={col.key}
                          className={`target-surveys-colhead-cell${col.narrow ? ' is-narrow' : ''}`}
                          role="columnheader"
                        >
                          {col.label}
                        </div>
                      ))}
                    </div>

                    {surveysLoading ? (
                      <div className="target-surveys-empty" role="row">
                        <div className="target-surveys-empty-inner" role="cell">
                          <i className="fas fa-spinner fa-spin" aria-hidden />
                          <p>Yuklanmoqda…</p>
                        </div>
                      </div>
                    ) : surveys.length === 0 ? (
                      <div className="target-surveys-empty" role="row">
                        <div className="target-surveys-empty-inner" role="cell">
                          <i className="fas fa-clipboard-list" aria-hidden />
                          <p>Hozircha so&apos;rovnomalar mavjud emas</p>
                        </div>
                      </div>
                    ) : (
                      surveys.map((row) => (
                        <div key={`survey-${row.id}-${row.date}`} className="target-surveys-row" role="row">
                          <div className="target-surveys-cell is-id" role="cell" title={String(row.id)}>
                            #{row.id}
                          </div>
                          <div className="target-surveys-cell" role="cell" title={row.operator}>
                            {row.operator}
                          </div>
                          <div className="target-surveys-cell is-muted" role="cell" title={formatDateTimeUz(row.date, { empty: '—' })}>
                            {formatDateTimeUz(row.date, { empty: '—' })}
                          </div>
                          <div className="target-surveys-cell is-strong" role="cell" title={row.stream}>
                            {row.stream}
                          </div>
                          <div className="target-surveys-cell" role="cell" title={row.customer}>
                            {row.customer}
                          </div>
                          <div className="target-surveys-cell is-muted" role="cell" title={row.region}>
                            {row.region}
                          </div>
                          <div className="target-surveys-cell is-phone" role="cell" title={row.phone}>
                            {row.phone}
                          </div>
                          <div className="target-surveys-cell is-status" role="cell">
                            <span className={`target-surveys-status target-surveys-status--${row.status_key || 'pending'}`}>
                              {row.status}
                            </span>
                          </div>
                          <div className="target-surveys-cell is-note" role="cell" title={row.note}>
                            {row.note}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : TARGET_ORDER_VIEW_KEYS.includes(activeView) ? (
              <TargetOrdersView
                title={TARGET_ORDER_VIEWS[activeView]?.label || TARGET_VIEW_LABELS[activeView]}
                icon={TARGET_ORDER_VIEWS[activeView]?.icon}
                subtitle={TARGET_ORDER_VIEWS[activeView]?.subtitle}
                rows={orderRows}
                loading={ordersLoading}
                emptyText={TARGET_ORDER_VIEWS[activeView]?.empty || 'Ma\'lumot yo\'q.'}
              />
            ) : activeView === 'links' ? (
              <div className="target-links-page">
                <div className="target-links-hero">
                  <i className="fas fa-link" aria-hidden />
                  <h1>Mening Havolalarim</h1>
                </div>

                <form className="target-links-search" onSubmit={handleLinksSearchSubmit}>
                  <input
                    type="search"
                    value={linksSearchInput}
                    onChange={(e) => setLinksSearchInput(e.target.value)}
                    placeholder="Oqim nomi yoki ID bo'yicha qidirish..."
                    aria-label="Havolalar qidiruvi"
                  />
                  <button type="submit">
                    <i className="fas fa-search" aria-hidden />
                    Qidirish
                  </button>
                </form>

                <div className="target-links-panel">
                  {linksLoading ? (
                    <div className="target-links-empty">
                      <i className="fas fa-spinner fa-spin" aria-hidden />
                      <p>Yuklanmoqda…</p>
                    </div>
                  ) : links.length === 0 ? (
                    <div className="target-links-empty">
                      <i className="fas fa-link" aria-hidden />
                      <p className="target-links-empty-title">Hozircha havolalar mavjud emas</p>
                      <p className="target-links-empty-hint">Birinchi oqimingizni yarating</p>
                      <button type="button" className="target-links-create-btn" onClick={() => setActiveView('market')}>
                        <i className="fas fa-plus" aria-hidden />
                        Marketdan oqim yaratish
                      </button>
                    </div>
                  ) : (
                    <div className="target-links-list">
                      {links.map((link) => {
                        const img = resolveImageUrl(link.product_image);
                        return (
                          <article key={link.id} className="target-links-item">
                            <div className="target-links-item-media">
                              {img ? <img src={img} alt="" loading="lazy" /> : <i className="fas fa-box" aria-hidden />}
                            </div>
                            <div className="target-links-item-body">
                              <div className="target-links-item-top">
                                <h3>{link.stream_name}</h3>
                                <span className="target-links-item-id">#{link.id}</span>
                              </div>
                              <p className="target-links-item-product">{link.product_name}</p>
                              <p className="target-links-item-price">{formatCurrency(link.price)}</p>
                              {(() => {
                                const { amount, percent } = affiliateCommissionInfo(link);
                                if (!percent && !amount) return null;
                                return (
                                  <p className="target-links-item-commission">
                                    Targitchi foizi: <strong>{formatAffiliatePercent(percent)}</strong>
                                    {amount > 0 ? (
                                      <>
                                        {' '}
                                        · To&apos;lov: <strong>{formatCurrency(amount)}</strong>
                                      </>
                                    ) : null}
                                  </p>
                                );
                              })()}
                              <div className="target-links-item-url" title={link.url}>
                                {link.url}
                              </div>
                              <div className="target-links-item-foot">
                                <span>{formatDateTimeUz(link.created_at, { empty: '—' })}</span>
                                <button type="button" onClick={() => handleCopyLink(link)}>
                                  <i className="fas fa-copy" aria-hidden />
                                  {linkCopiedId === link.id ? 'Nusxalandi' : 'Nusxa olish'}
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!linksLoading ? (
                  <div className="target-links-pagination" aria-label="Sahifalar">
                    {Array.from({ length: Math.max(1, linksMeta.total_pages) }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        className={pageNum === linksPage ? 'active' : ''}
                        onClick={() => setLinksPage(pageNum)}
                        aria-current={pageNum === linksPage ? 'page' : undefined}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : activeView === 'stats' ? (
              <div className="target-stats-card">
                <div className="target-stats-tabs" role="tablist" aria-label="Statistika ko'rinishi">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={statsMode === 'stream'}
                    className={statsMode === 'stream' ? 'active' : ''}
                    onClick={() => {
                      setStatsMode('stream');
                      setStatsPage(1);
                    }}
                  >
                    <i className="fas fa-th-large" aria-hidden />
                    Oqim
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={statsMode === 'date'}
                    className={statsMode === 'date' ? 'active' : ''}
                    onClick={() => {
                      setStatsMode('date');
                      setStatsPage(1);
                    }}
                  >
                    <i className="fas fa-calendar-alt" aria-hidden />
                    Sana
                  </button>
                </div>

                <div className="target-stats-table-wrap">
                  <div
                    className={`target-stats-grid${statsMode === 'date' ? ' target-stats-grid--date' : ''}`}
                    role="table"
                    aria-label="Statistika jadvali"
                  >
                    <div className="target-stats-colhead" role="row">
                      <div className="target-stats-colhead-cell" role="columnheader">
                        {statsMode === 'date' ? 'Sana' : 'Oqim'}
                      </div>
                      {statsMode === 'stream' ? (
                        <div className="target-stats-colhead-cell" role="columnheader">Mahsulot</div>
                      ) : null}
                      {STATS_METRIC_KEYS.map((col) => (
                        <div key={col.key} className="target-stats-colhead-cell" role="columnheader">
                          {col.label}
                        </div>
                      ))}
                    </div>

                    <div className="target-stats-total-row" role="row">
                      <div className="target-stats-total-cell is-label" role="cell">JAMI</div>
                      {statsMode === 'stream' ? (
                        <div className="target-stats-total-cell" role="cell">—</div>
                      ) : null}
                      {STATS_METRIC_KEYS.map((col) => (
                        <div key={col.key} className="target-stats-total-cell" role="cell">
                          {statsSummary ? renderStatMetric(statsSummary, col) : '—'}
                        </div>
                      ))}
                    </div>

                    {statsLoading ? (
                      <div className="target-stats-empty" role="row">
                        <div className="target-stats-empty-inner" role="cell">
                          <i className="fas fa-spinner fa-spin" aria-hidden />
                          <p>Yuklanmoqda…</p>
                        </div>
                      </div>
                    ) : statsRows.length === 0 ? (
                      <div className="target-stats-empty" role="row">
                        <div className="target-stats-empty-inner" role="cell">
                          <i className="fas fa-chart-bar" aria-hidden />
                          <p>Hozircha statistika mavjud emas</p>
                        </div>
                      </div>
                    ) : (
                      statsRows.map((row) => (
                        <div key={row.key} className="target-stats-row" role="row">
                          <div className="target-stats-cell is-strong" role="cell" title={row.label}>
                            {row.label}
                          </div>
                          {statsMode === 'stream' ? (
                            <div className="target-stats-cell" role="cell" title={row.product}>
                              {row.product}
                            </div>
                          ) : null}
                          {STATS_METRIC_KEYS.map((col) => (
                            <div key={col.key} className="target-stats-cell is-metric" role="cell">
                              {renderStatMetric(row, col)}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {!statsLoading ? (
                  <div className="target-stats-pagination" aria-label="Sahifalar">
                    <button
                      type="button"
                      disabled={statsPage <= 1}
                      onClick={() => setStatsPage((p) => Math.max(1, p - 1))}
                      aria-label="Oldingi sahifa"
                    >
                      <i className="fas fa-chevron-left" aria-hidden />
                    </button>
                    <span>{statsPage} / {statsMeta.total_pages}</span>
                    <button
                      type="button"
                      disabled={statsPage >= statsMeta.total_pages}
                      onClick={() => setStatsPage((p) => Math.min(statsMeta.total_pages, p + 1))}
                      aria-label="Keyingi sahifa"
                    >
                      <i className="fas fa-chevron-right" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : activeView === 'contest' ? (
              <div className="target-contest-page">
                <div className="target-contest-hero">
                  <i className="fas fa-trophy" aria-hidden />
                  <h1>Konkurs</h1>
                </div>

                <div className="target-contest-intro-card">
                  <h2>{contestData?.title || 'MyShop'}</h2>
                  <p>{contestData?.description?.[0] || 'MyShop jamoasidan bomba konkurs.'}</p>
                  <p>{contestData?.description?.[1] || 'Vaqtingizdan unumli foydalaning va bizning jamoamizga qo\'shiling va yil admini bo\'lish imkoniyatidan foydalaning'}</p>
                  <div className="target-contest-dates">
                    <div className="target-contest-date-btn target-contest-date-btn--start">
                      <strong>BOSHLASH</strong>
                      <span>{formatContestDate(contestData?.start || '2025-12-20')}</span>
                    </div>
                    <div className="target-contest-date-btn target-contest-date-btn--end">
                      <strong>YAKUNLASH</strong>
                      <span>{formatContestDate(contestData?.end || '2026-12-20')}</span>
                    </div>
                  </div>
                </div>

                <div className="target-contest-results-card">
                  <div className="target-contest-results-head">
                    <i className="fas fa-chart-bar" aria-hidden />
                    <span>Konkurs natijalari</span>
                  </div>
                  <div className="target-contest-results-note">
                    <i className="fas fa-clock" aria-hidden />
                    <span>Ma&apos;lumotlar har 12 soatda yangilanadi</span>
                  </div>

                  <div className="target-contest-table" role="table" aria-label="Konkurs natijalari jadvali">
                    <div className="target-contest-colhead" role="row">
                      <div role="columnheader">№</div>
                      <div role="columnheader">Sotuvchi</div>
                      <div role="columnheader">Sotilgan</div>
                    </div>

                    {contestLoading ? (
                      <div className="target-contest-empty" role="row">
                        <div role="cell">
                          <i className="fas fa-spinner fa-spin" aria-hidden />
                          <p>Yuklanmoqda…</p>
                        </div>
                      </div>
                    ) : !contestData?.results?.length ? (
                      <div className="target-contest-empty" role="row">
                        <div role="cell">
                          <i className="fas fa-trophy" aria-hidden />
                          <p>Hozircha natijalar mavjud emas</p>
                        </div>
                      </div>
                    ) : (
                      contestData.results.map((row) => (
                        <div key={row.rank} className="target-contest-row" role="row">
                          <div className="target-contest-cell is-rank" role="cell">{row.rank}</div>
                          <div className="target-contest-cell is-seller" role="cell">{row.seller}</div>
                          <div className="target-contest-cell is-sold" role="cell">
                            {new Intl.NumberFormat('uz-UZ').format(Number(row.sold) || 0)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : activeView === 'payment' ? (
              <div className={`target-payment-page${showPaymentBillingLock ? ' target-payment-page--locked' : ''}`}>
                {paymentBillingLockScreen}
                {!showPaymentBillingLock ? (
              <>
                <div className="target-payment-top">
                  <div className="target-payment-balance-card">
                    <div className="target-payment-balance-head">
                      <span>MENING HISOBIM</span>
                      <i className="fas fa-wallet" aria-hidden />
                    </div>
                    <strong>{paymentLoading ? '…' : formatCurrency(paymentData.balance)}</strong>
                  </div>

                  <div className="target-payment-withdraw-card">
                    <div className="target-payment-withdraw-head">
                      <i className={`fas ${withdrawTab === 'coin' ? 'fa-coins' : 'fa-money-bill-wave'}`} aria-hidden />
                      <span>{withdrawTab === 'coin' ? 'Tanga Yechish' : 'Pul Yechish'}</span>
                    </div>

                    {withdrawTab === 'coin' ? (
                      <p className="target-payment-coin-balance">
                        Mavjud tangalar:{' '}
                        <strong>{paymentLoading ? '…' : new Intl.NumberFormat('uz-UZ').format(paymentData.coins)}</strong>
                        {paymentData.coin_settings?.uzsPerCoin ? (
                          <span className="target-payment-coin-rate">
                            {' '}
                            (1 tanga = {new Intl.NumberFormat('uz-UZ').format(paymentData.coin_settings.uzsPerCoin)} so&apos;m)
                          </span>
                        ) : null}
                      </p>
                    ) : null}

                    <div className="target-payment-tabs" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={withdrawTab === 'money'}
                        className={withdrawTab === 'money' ? 'active' : ''}
                        onClick={() => setWithdrawTab('money')}
                      >
                        <i className="fas fa-money-bill-alt" aria-hidden />
                        Pul
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={withdrawTab === 'coin'}
                        className={withdrawTab === 'coin' ? 'active' : ''}
                        onClick={() => setWithdrawTab('coin')}
                      >
                        <i className="fas fa-coins" aria-hidden />
                        Tanga
                      </button>
                    </div>

                    <form className="target-payment-form" onSubmit={handleWithdrawSubmit}>
                      {withdrawTab === 'money' ? (
                        <label>
                          <span>KARTA RAQAMI</span>
                          <input
                            type="text"
                            value={withdrawCard}
                            onChange={(e) => setWithdrawCard(e.target.value)}
                            placeholder="Karta raqamini kiriting"
                          />
                        </label>
                      ) : null}
                      <label>
                        <span>{withdrawTab === 'coin' ? 'TANGA SONI' : 'SUMMA (SO\'M)'}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder={withdrawTab === 'coin' ? 'Tanga sonini kiriting' : 'Miqdorini kiriting'}
                        />
                      </label>
                      {withdrawMsg ? (
                        <p className={`target-payment-form-msg${withdrawErr ? ' is-error' : ' is-success'}`}>
                          {withdrawMsg}
                        </p>
                      ) : null}
                      <button type="submit" disabled={withdrawSubmitting || paymentLoading}>
                        <i className="fas fa-check" aria-hidden />
                        {withdrawSubmitting ? 'Yuborilmoqda…' : 'Tasdiqlash'}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="target-payment-history-card">
                  <div className="target-payment-history-head">
                    <div>
                      <i className="fas fa-history" aria-hidden />
                      <span>O&apos;tkazmalar Tarixi</span>
                    </div>
                    <span className="target-payment-history-badge">
                      {paymentData.withdrawals.length} ta
                    </span>
                  </div>

                  <div className="target-payment-table" role="table" aria-label="O'tkazmalar tarixi">
                    <div className="target-payment-colhead" role="row">
                      <div role="columnheader">Sana</div>
                      <div role="columnheader">Hisob raqam</div>
                      <div role="columnheader">Summa</div>
                      <div role="columnheader">Holat</div>
                      <div role="columnheader">Xabar</div>
                    </div>

                    {paymentLoading ? (
                      <div className="target-payment-empty" role="row">
                        <div role="cell">
                          <i className="fas fa-spinner fa-spin" aria-hidden />
                          <p>Yuklanmoqda…</p>
                        </div>
                      </div>
                    ) : paymentData.withdrawals.length === 0 ? (
                      <div className="target-payment-empty" role="row">
                        <div role="cell">
                          <i className="fas fa-history" aria-hidden />
                          <p>Hozircha pul yechish so&apos;rovlari mavjud emas</p>
                        </div>
                      </div>
                    ) : (
                      paymentData.withdrawals.map((row) => (
                        <div key={row.id} className="target-payment-row" role="row">
                          <div className="target-payment-cell" role="cell">
                            {formatDateTimeUz(row.created_at, { empty: '—' })}
                          </div>
                          <div className="target-payment-cell" role="cell" title={row.account}>
                            {row.account}
                          </div>
                          <div className="target-payment-cell is-amount" role="cell">
                            {formatCurrency(row.amount)}
                          </div>
                          <div className="target-payment-cell" role="cell">
                            <span className={`target-payment-status target-payment-status--${String(row.status || 'pending').toLowerCase()}`}>
                              {row.status_label}
                            </span>
                          </div>
                          <div className="target-payment-cell" role="cell" title={row.message}>
                            {row.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
                ) : null}
              </div>
            ) : activeView === 'referral' ? (
              <div className="target-referral-page">
                <div className="target-referral-link-card">
                  <h2>Referal havola</h2>
                  <p>Ushbu havola orqali ro&apos;yxatdan o&apos;tgan foydalanuvchilar sizning referallaringiz bo&apos;ladi.</p>

                  <div className="target-referral-link-box">
                    <span title={referralData.url || ''}>
                      {referralLoading
                        ? 'Yuklanmoqda…'
                        : referralData.url || `${window.location.origin}/register?id=${user?.id || ''}`}
                    </span>
                    <button type="button" onClick={handleCopyReferralLink} disabled={referralLoading}>
                      <i className="fas fa-copy" aria-hidden />
                      {referralCopied ? 'Nusxalandi' : 'Nusxa olish'}
                    </button>
                  </div>

                  <div className="target-referral-badge">
                    <i className="fas fa-users" aria-hidden />
                    <span>Jami referallar: {referralLoading ? '…' : referralData.total}</span>
                  </div>
                </div>

                <div className="target-referral-list-card">
                  <h2>Referallar ro&apos;yxati</h2>
                  <p>Sizning havolangiz orqali ro&apos;yxatdan o&apos;tgan foydalanuvchilar.</p>

                  {referralLoading ? (
                    <div className="target-referral-empty">
                      <i className="fas fa-spinner fa-spin" aria-hidden />
                      <p>Yuklanmoqda…</p>
                    </div>
                  ) : referralData.referrals.length === 0 ? (
                    <div className="target-referral-empty">
                      <i className="fas fa-users" aria-hidden />
                      <p>Hozircha referallar yo&apos;q.</p>
                    </div>
                  ) : (
                    <div className="target-referral-list">
                      {referralData.referrals.map((row) => (
                        <article key={row.id} className="target-referral-item">
                          <div className="target-referral-item-main">
                            <strong>{row.name}</strong>
                            <span>{row.email}</span>
                          </div>
                          <div className="target-referral-item-meta">
                            <span>{row.phone}</span>
                            <time>{formatDateTimeUz(row.created_at, { empty: '—' })}</time>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : activeView === 'favorites' ? (
              <div className="target-favorites-card">
                <div className="target-favorites-top">
                  <h1>Meni yoqtirganlarim</h1>
                  <div className="target-favorites-pagination" aria-label="Sahifalar">
                    <button
                      type="button"
                      disabled={favoritesLoading || favoritesPage <= 1}
                      onClick={() => setFavoritesPage((p) => Math.max(1, p - 1))}
                    >
                      Oldingi
                    </button>
                    <button
                      type="button"
                      disabled={favoritesLoading || favoritesPage >= favoritesMeta.total_pages}
                      onClick={() => setFavoritesPage((p) => p + 1)}
                    >
                      Keyingi
                    </button>
                  </div>
                </div>

                <div className="target-favorites-body">
                  {favoritesLoading ? (
                    <div className="target-favorites-empty">
                      <i className="fas fa-spinner fa-spin" aria-hidden />
                      <p>Yuklanmoqda…</p>
                    </div>
                  ) : favorites.length === 0 ? (
                    <div className="target-favorites-empty target-favorites-empty--plain" />
                  ) : (
                    <div className="target-product-grid">
                      {favorites.map((product) => {
                        const price = Number(product.price) || 0;
                        const { amount, percent } = affiliateCommissionInfo(product);
                        const stock = Number(product.stock) || 0;
                        const img = resolveImageUrl(product.image_url);
                        const isFav = favoriteIds.has(Number(product.product_id));
                        return (
                          <article key={product.id} className="target-product-card">
                            <div className="target-product-image">
                              {img ? <img src={img} alt={product.name_uz || ''} loading="lazy" /> : null}
                              {percent > 0 ? (
                                <span className="target-product-commission-badge" title="Targitchi foizi">
                                  {formatAffiliatePercent(percent)}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className={`target-product-fav-btn${isFav ? ' is-active' : ''}`}
                                aria-label="Saralanganlardan olib tashlash"
                                disabled={favoriteBusyId === product.product_id}
                                onClick={(e) => handleToggleFavorite(product.product_id, e)}
                              >
                                <i className={`fas fa-heart${isFav ? '' : '-o'}`} aria-hidden />
                              </button>
                            </div>
                            <div className="target-product-body">
                              <h3 className="target-product-title">{product.name_uz || 'Mahsulot'}</h3>
                              <p className="target-product-price">{formatCurrency(price)}</p>
                              <div className="target-product-meta">
                                <div className="target-product-meta-foiz">
                                  Targitchi foizi:
                                  <strong>{formatAffiliatePercent(percent)}</strong>
                                </div>
                                <div>
                                  To&apos;lov:
                                  <strong>{formatCurrency(amount)}</strong>
                                </div>
                                <div>
                                  Zaxirada:
                                  <strong>{stock} ta</strong>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="target-stream-btn"
                                onClick={() => handleCreateStream({ ...product, id: product.product_id })}
                              >
                                <i className="fas fa-link" aria-hidden />
                                Oqim yaratish
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : activeView === 'market' ? (
              <div className="target-market-card">
                <div className="target-market-head">
                  <i className="fas fa-shopping-cart" aria-hidden />
                  <h1>Sotuvdagi Mahsulotlar</h1>
                </div>

                <div className="target-categories" role="tablist" aria-label="Kategoriyalar">
                  <button
                    type="button"
                    className={!categoryFilter ? 'active' : ''}
                    onClick={() => setCategoryFilter('')}
                  >
                    Barchasi
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={categoryFilter === cat ? 'active' : ''}
                      onClick={() => setCategoryFilter(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <form className="target-market-search" onSubmit={handleSearchSubmit}>
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Mahsulot nomi bo'yicha qidirish..."
                    aria-label="Market qidiruv"
                  />
                  <button type="submit" aria-label="Qidirish">
                    <i className="fas fa-search" />
                  </button>
                </form>

                {catalogLoading ? (
                  <div className="target-loading">Mahsulotlar yuklanmoqda…</div>
                ) : products.length === 0 ? (
                  <div className="target-empty">Mahsulot topilmadi.</div>
                ) : (
                  <div className="target-product-grid">
                    {products.map((product) => {
                      const price = Number(product.sale_price ?? product.price) || 0;
                      const { amount, percent } = affiliateCommissionInfo(product);
                      const stock = Number(product.stock) || 0;
                      const img = resolveImageUrl(product.image_url);
                      return (
                        <article key={product.id} className="target-product-card">
                          <div className="target-product-image">
                            {img ? <img src={img} alt={product.name_uz || ''} loading="lazy" /> : null}
                            {percent > 0 ? (
                              <span className="target-product-commission-badge" title="Targitchi foizi">
                                {formatAffiliatePercent(percent)}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className={`target-product-fav-btn${favoriteIds.has(Number(product.id)) ? ' is-active' : ''}`}
                              aria-label={favoriteIds.has(Number(product.id)) ? 'Saralanganlardan olib tashlash' : 'Saralanganlarga qo\'shish'}
                              disabled={favoriteBusyId === product.id}
                              onClick={(e) => handleToggleFavorite(product.id, e)}
                            >
                              <i
                                className={`fas fa-heart${favoriteIds.has(Number(product.id)) ? '' : '-o'}`}
                                aria-hidden
                              />
                            </button>
                          </div>
                          <div className="target-product-body">
                            <h3 className="target-product-title">{product.name_uz || 'Mahsulot'}</h3>
                            <p className="target-product-price">{formatCurrency(price)}</p>
                            <div className="target-product-meta">
                              <div className="target-product-meta-foiz">
                                Targitchi foizi:
                                <strong>{formatAffiliatePercent(percent)}</strong>
                              </div>
                              <div>
                                To&apos;lov:
                                <strong>{formatCurrency(amount)}</strong>
                              </div>
                              <div>
                                Zaxirada:
                                <strong>{stock} ta</strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="target-stream-btn"
                              onClick={() => handleCreateStream(product)}
                            >
                              <i className="fas fa-link" aria-hidden />
                              Oqim yaratish
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeView === 'guide' ? (
              <TargetGuideView onNavigate={setActiveView} />
            ) : activeView === 'mychat' ? (
              <TargetMyChatView onOpenSidePanel={() => setSidebarOpen(true)} />
            ) : activeView === 'profile' ? (
              <div className="target-settings-page" id="target-profile-section">
                <div className="target-settings-card">
                  <div className="target-settings-head">
                    <h2>Profil ma&apos;lumotlari</h2>
                    <p>Ism, viloyat, telegram va boshqa shaxsiy ma&apos;lumotlaringiz</p>
                  </div>

                  <form className="target-settings-form" onSubmit={handleProfileSave}>
                    <div className="target-settings-grid target-settings-grid--2">
                      <label>
                        <span>Ism</span>
                        <input
                          type="text"
                          value={profileForm.first_name}
                          onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))}
                          disabled={settingsLoading}
                        />
                      </label>
                      <label>
                        <span>Familiya</span>
                        <input
                          type="text"
                          value={profileForm.last_name}
                          onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))}
                          disabled={settingsLoading}
                        />
                      </label>
                    </div>

                    <div className="target-settings-grid target-settings-grid--2">
                      <label>
                        <span>Viloyat</span>
                        <select
                          value={profileForm.region_id}
                          onChange={(e) => setProfileForm((p) => ({
                            ...p,
                            region_id: e.target.value,
                            district_id: '',
                          }))}
                          disabled={settingsLoading}
                        >
                          <option value="">Viloyatni tanlang</option>
                          {PACKER_UZ_VILOYATLAR.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Tuman / Shahar</span>
                        <select
                          value={profileForm.district_id}
                          onChange={(e) => setProfileForm((p) => ({ ...p, district_id: e.target.value }))}
                          disabled={settingsLoading || !profileForm.region_id}
                        >
                          <option value="">Tumanni tanlang</option>
                          {districtOptions.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label>
                      <span>Telegram ID</span>
                      <input
                        type="text"
                        value={profileForm.telegram_id}
                        onChange={(e) => setProfileForm((p) => ({ ...p, telegram_id: e.target.value }))}
                        placeholder="@username yoki ID"
                        disabled={settingsLoading}
                      />
                    </label>

                    <label>
                      <span>Haqida</span>
                      <textarea
                        rows={4}
                        value={profileForm.about}
                        onChange={(e) => setProfileForm((p) => ({ ...p, about: e.target.value }))}
                        disabled={settingsLoading}
                      />
                    </label>

                    {settingsMsg ? (
                      <p className={`target-settings-msg${settingsErr ? ' is-error' : ' is-success'}`}>
                        {settingsMsg}
                      </p>
                    ) : null}

                    <button type="submit" className="target-settings-btn" disabled={settingsSaving || settingsLoading}>
                      <i className="fas fa-save" aria-hidden />
                      {settingsSaving ? 'Saqlanmoqda…' : 'Saqlash'}
                    </button>
                  </form>
                </div>
              </div>
            ) : activeView === 'settings' ? (
              <div className="target-settings-page">
                <div className="target-settings-card">
                  <div className="target-settings-head">
                    <h2>Sozlamalar</h2>
                    <p>Ilova bildirishnomalari, mavzu va hisob xavfsizligi</p>
                  </div>

                  <div className="target-settings-section">
                    <div className="target-settings-section-head">
                      <h3>Qung&apos;iroqcha</h3>
                      <p>Yoqilganda iPhone SMS ovozi; o&apos;chirilganda faqat vibratsiya</p>
                    </div>
                    <div className="target-settings-toggle-row">
                      <button
                        type="button"
                        className={`target-settings-toggle${targetNotifSound ? ' is-on' : ''}`}
                        role="switch"
                        aria-checked={targetNotifSound}
                        onClick={handleTargetNotifToggle}
                      >
                        <span className="target-settings-toggle-knob" aria-hidden />
                      </button>
                      <span className="target-settings-toggle-label">
                        {targetNotifSound ? 'Yoniq — ovozli signal' : 'O\'chirilgan — vibratsiya'}
                      </span>
                    </div>
                  </div>

                  <div className="target-settings-section">
                    <div className="target-settings-section-head">
                      <h3>Tun / Kun rejimi</h3>
                      <p>Mavzuni tanlang va har bir rejim uchun alohida rang belgilang</p>
                    </div>
                    <div className="target-settings-theme-row">
                      <button
                        type="button"
                        className={`target-settings-theme-btn${theme === 'light' ? ' active' : ''}`}
                        onClick={() => setTheme('light')}
                      >
                        <i className="fas fa-sun" aria-hidden />
                        Kun
                      </button>
                      <button
                        type="button"
                        className={`target-settings-theme-btn${theme === 'dark' ? ' active' : ''}`}
                        onClick={() => setTheme('dark')}
                      >
                        <i className="fas fa-moon" aria-hidden />
                        Tun
                      </button>
                    </div>
                    <div className="target-settings-color-grid">
                      <div className="target-settings-color-block">
                        <span className="target-settings-color-label">Kun rejimi rangi</span>
                        <div className="target-settings-color-row">
                          {TARGET_ACCENT_PRESETS.map((preset) => (
                            <button
                              key={`light-${preset.id}`}
                              type="button"
                              className={`target-settings-color-swatch${draftAccentLight === preset.light ? ' active' : ''}`}
                              style={{ background: preset.light }}
                              title={preset.label}
                              aria-label={preset.label}
                              onClick={() => handleAccentLightChange(preset.light)}
                            />
                          ))}
                          <label className="target-settings-color-picker">
                            <input
                              type="color"
                              value={draftAccentLight}
                              onChange={(e) => handleAccentLightChange(e.target.value)}
                              aria-label="Kun rejimi rangi"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="target-settings-color-block">
                        <span className="target-settings-color-label">Tun rejimi rangi</span>
                        <div className="target-settings-color-row">
                          {TARGET_ACCENT_PRESETS.map((preset) => (
                            <button
                              key={`dark-${preset.id}`}
                              type="button"
                              className={`target-settings-color-swatch${draftAccentDark === preset.dark ? ' active' : ''}`}
                              style={{ background: preset.dark }}
                              title={preset.label}
                              aria-label={preset.label}
                              onClick={() => handleAccentDarkChange(preset.dark)}
                            />
                          ))}
                          <label className="target-settings-color-picker">
                            <input
                              type="color"
                              value={draftAccentDark}
                              onChange={(e) => handleAccentDarkChange(e.target.value)}
                              aria-label="Tun rejimi rangi"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="target-settings-accent-actions">
                      {accentSaveMsg ? (
                        <p className="target-settings-msg is-success">{accentSaveMsg}</p>
                      ) : null}
                      <button
                        type="button"
                        className="target-settings-btn"
                        disabled={!accentColorsDirty}
                        onClick={handleAccentColorsSave}
                      >
                        <i className="fas fa-save" aria-hidden />
                        Ranglarni saqlash
                      </button>
                    </div>
                  </div>
                </div>

                <div className="target-settings-card">
                  <div className="target-settings-head">
                    <h2>Telefon raqam</h2>
                    <p>Kirish va bildirishnomalar uchun telefon raqamingiz</p>
                  </div>
                  <form className="target-settings-form" onSubmit={handleContactSave}>
                    <label>
                      <span>Telefon</span>
                      <input
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="+998 90 123 45 67"
                        disabled={settingsLoading || contactSaving}
                      />
                    </label>
                    {contactMsg ? (
                      <p className={`target-settings-msg${contactErr ? ' is-error' : ' is-success'}`}>
                        {contactMsg}
                      </p>
                    ) : null}
                    <button type="submit" className="target-settings-btn" disabled={contactSaving || settingsLoading}>
                      <i className="fas fa-phone" aria-hidden />
                      {contactSaving ? 'Saqlanmoqda…' : 'Telefonni saqlash'}
                    </button>
                  </form>
                </div>

                <div className="target-settings-card">
                  <div className="target-settings-head">
                    <h2>Email</h2>
                    <p>Hisobingiz email manzili</p>
                  </div>
                  <form className="target-settings-form" onSubmit={handleContactSave}>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="email@example.com"
                        disabled={settingsLoading || contactSaving}
                        autoComplete="email"
                      />
                    </label>
                    {contactMsg ? (
                      <p className={`target-settings-msg${contactErr ? ' is-error' : ' is-success'}`}>
                        {contactMsg}
                      </p>
                    ) : null}
                    <button type="submit" className="target-settings-btn" disabled={contactSaving || settingsLoading}>
                      <i className="fas fa-envelope" aria-hidden />
                      {contactSaving ? 'Saqlanmoqda…' : 'Emailni saqlash'}
                    </button>
                  </form>
                </div>

                <div className="target-settings-card">
                  <div className="target-settings-head">
                    <h2>Parolni o&apos;zgartirish</h2>
                    <p>Hisobingiz xavfsizligi uchun parolni muntazam yangilang</p>
                  </div>

                  <form className="target-settings-form" onSubmit={handlePasswordSave}>
                    <div className="target-settings-grid target-settings-grid--2">
                      <label>
                        <span>Yangi parol</span>
                        <input
                          type="password"
                          value={passwordForm.new_password}
                          onChange={(e) => setPasswordForm((p) => ({ ...p, new_password: e.target.value }))}
                          placeholder="Yangi parol (kamida 6 belgi)"
                          autoComplete="new-password"
                        />
                      </label>
                      <label>
                        <span>Yangi parolni tasdiqlang</span>
                        <input
                          type="password"
                          value={passwordForm.confirm_password}
                          onChange={(e) => setPasswordForm((p) => ({ ...p, confirm_password: e.target.value }))}
                          placeholder="Yangi parolni qayta kiriting"
                          autoComplete="new-password"
                        />
                      </label>
                    </div>

                    {passwordMsg ? (
                      <p className={`target-settings-msg${passwordErr ? ' is-error' : ' is-success'}`}>
                        {passwordMsg}
                      </p>
                    ) : null}

                    <button type="submit" className="target-settings-btn" disabled={passwordSaving}>
                      <i className="fas fa-key" aria-hidden />
                      {passwordSaving ? 'Saqlanmoqda…' : "Parolni o'zgartirish"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="target-placeholder">
                <h2>{TARGET_VIEW_LABELS[activeView] || activeView}</h2>
                <p>Bu bo&apos;lim tez orada qo&apos;shiladi.</p>
              </div>
            )}
          </main>

          {!isMyChatView ? (
          <nav className="target-bottom-nav" aria-label="Mobil navigatsiya">
            {TARGET_MOBILE_TAB_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`target-bottom-nav-item${isMobileTabActive(item.key) ? ' active' : ''}`}
                onClick={() => handleBottomTabClick(item.key)}
              >
                <i className={`fas ${item.icon}`} aria-hidden />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          ) : null}
        </div>
      </div>

      <div
        className={`target-more-backdrop${mobileMoreOpen ? ' show' : ''}`}
        onClick={() => setMobileMoreOpen(false)}
        aria-hidden
      />
      <div
        className={`target-more-sheet${mobileMoreOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Qo'shimcha bo'limlar"
      >
        <div className="target-more-sheet-head">
          <h2>Boshqa bo&apos;limlar</h2>
          <button type="button" aria-label="Yopish" onClick={() => setMobileMoreOpen(false)}>
            <i className="fas fa-times" aria-hidden />
          </button>
        </div>
        <div className="target-more-sheet-grid">
          {TARGET_MORE_MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`target-more-sheet-item${activeView === item.key ? ' active' : ''}`}
              onClick={() => handleMoreMenuClick(item.key)}
            >
              <span className="target-more-sheet-icon">
                <i className={`fas ${item.icon}`} aria-hidden />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="target-more-sheet-foot">
          <Link to="/" className="target-more-sheet-link" onClick={() => setMobileMoreOpen(false)}>
            <i className="fas fa-home" aria-hidden />
            Bosh sahifa
          </Link>
          <button
            type="button"
            className="target-more-sheet-logout"
            onClick={() => {
              setMobileMoreOpen(false);
              logout();
              navigate('/login');
            }}
          >
            <i className="fas fa-sign-out-alt" aria-hidden />
            Chiqish
          </button>
        </div>
      </div>

      {avatarLightbox ? (
        <div
          className="target-avatar-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Profil rasmi"
          onClick={() => setAvatarLightbox('')}
        >
          <button
            type="button"
            className="target-avatar-lightbox-close"
            aria-label="Yopish"
            onClick={() => setAvatarLightbox('')}
          >
            <i className="fas fa-times" aria-hidden />
          </button>
          <img
            src={avatarLightbox}
            alt="Profil rasmi"
            className="target-avatar-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
    </NavCategoryMenuProvider>
  );
}
