import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  formatDateTimeUz,
  formatIsoDateLabelUz,
  todayIsoDateInUzbekistan,
} from '../../utils/uzbekistanTime.js';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import SellerMyShopChat from '../../components/seller/SellerMyShopChat';
import { AUDIENCE_CATEGORIES } from '../../constants/audienceCategories.js';
import { isSellerPrincipal } from '../../utils/sellerPrincipal.js';
import './SellerDashboard.css';

const PROFILE_VIEW_KEY = 'profile';
const SELLER_VIEW_KEYS = [
  'dashboard',
  'products',
  'products_add',
  'products_archive',
  'products_print',
  'orders',
  'chat',
  'finance',
  'settings',
  PROFILE_VIEW_KEY,
];
const DEFAULT_SELLER_VIEW = 'dashboard';

function normalizeSellerView(value) {
  if (!value) return DEFAULT_SELLER_VIEW;
  const v = value === 'statistics' ? 'chat' : value;
  return SELLER_VIEW_KEYS.includes(v) ? v : DEFAULT_SELLER_VIEW;
}

function formatSearchQueryForSuggest(form) {
  const parts = [String(form?.name_uz || '').trim(), String(form?.category || '').trim()].filter(Boolean);
  return parts.join(' ') || 'product';
}

const PRODUCT_CATEGORIES = [
  'Uy ruzgor buyumlari',
  'Erkaklar uchun kiyimlar',
  'Ayollar uchun kiyimlar',
  'Bolalar uchun kiyimlar',
  'Erkaklar uchun poyafzallar',
  'Ayollar uchun poyafzallar',
  'Bolalalar uchun poyafzallar',
  'Erkaklar uchun naborlar',
  'Ayollarlar uchun parfumeriya',
  'Elektro Betavoy texnikalar',
  'Sovgalar tuplami',
  'Sport anjomlari',
  'Guzallik',
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const PRODUCT_IMAGE_SLOT_INDEXES = [0, 1, 2, 3, 4];

function primaryProductImageSlotIndex(slots, checked) {
  const withCheck = PRODUCT_IMAGE_SLOT_INDEXES.find((i) => checked[i] && slots[i]);
  if (withCheck !== undefined) return withCheck;
  const any = PRODUCT_IMAGE_SLOT_INDEXES.find((i) => slots[i]);
  return any === undefined ? -1 : any;
}

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

const SELLER_LIST_PIPELINE_STATUSES = new Set(['pending', 'scheduled', 'approved']);

function isSellerProductBrak(p) {
  const v = String(p?.off_sale_variant || '').trim().toLowerCase();
  if (v === 'brak') return true;
  return String(p?.status || '').trim().toLowerCase() === 'brak';
}

/** Sotuvda emas (“sotuvdan olingan”) — moderatsiya qatorida yo‘q, brak emas */
function isSellerWithdrawnProduct(p) {
  const st = String(p?.status || '').trim().toLowerCase();
  if (st === 'active') return false;
  if (SELLER_LIST_PIPELINE_STATUSES.has(st)) return false;
  return !isSellerProductBrak(p);
}

function sellerBrakQtyDisplay(p) {
  const b = Number(p?.brak_qty);
  if (Number.isFinite(b) && b >= 0) return Math.round(b);
  return Math.max(0, Math.round(Number(p?.stock) || 0));
}

/** Mahsulot nomi/kategoriya bo‘yicha izoh (faqat bo‘sh bo‘lsa to‘ldiriladi). */
function buildAutoProductDescription(nameUz, category) {
  const n = String(nameUz || '').trim();
  const c = String(category || '').trim();
  if (!n && !c) return '';
  if (n && c) {
    return `${n} — ${c} kategoriyasida. MyShop orqali uyga yetkazib beramiz yoki markazdan olib ketishingiz mumkin.`;
  }
  if (n) return `${n} — MyShop orqali sifatli mahsulot, tez yetkazib berish.`;
  return `${c} kategoriyasi mahsuloti — MyShop bilan xavfsiz xarid.`;
}

/** Mahsulot asosida reklama kreativlari (kamida 4: 2 rasm g‘oya, 2 video g‘oya + matn/sarlavha). */
function generateSellerProductCreatives(form) {
  const name = String(form.name_uz || '').trim() || 'Mahsulot';
  const cat = String(form.category || '').trim() || 'Mahsulot';
  const price = Number(form.price) || 0;
  const desc = String(form.description_uz || '').trim();
  const priceLabel = formatCurrency(price);
  return [
    {
      kind: 'ad_image',
      id: 'img1',
      headline: 'MyShop — tez yetkazib berish!',
      subline: `${name} — ${priceLabel}`,
      cta: 'Bugun buyurtma bering!',
    },
    {
      kind: 'ad_image',
      id: 'img2',
      headline: `${name} — chegirma va sifat`,
      subline: cat,
      cta: 'Hozir sotib oling',
    },
    {
      kind: 'video_idea',
      id: 'vid1',
      title: '15 soniya: mahsulotni tanishtirish',
      script:
        `Assalomu alaykum! ${name} — uyga yetkazib beramiz yoki markazdan olib ketasiz.`,
    },
    {
      kind: 'video_idea',
      id: 'vid2',
      title: '30 soniya: mijoz fokusi',
      script: `${name} — ${desc ? desc.slice(0, 100) : 'Sifatli mahsulot, tez yetkazma.'}`,
    },
    {
      kind: 'ad_copy',
      id: 'copy1',
      uz: 'Bugun buyurtma bering — tez yetkazib beramiz.',
    },
    {
      kind: 'headline',
      id: 'head1',
      headline: 'MyShop — ishonchli tanlov',
    },
  ];
}

function formatDateTime(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

function todayIsoDate() {
  return todayIsoDateInUzbekistan();
}

function normalizeDateValue(value) {
  const raw = String(value || '').trim();
  const fallback = todayIsoDateInUzbekistan();
  if (!raw) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  if (parsed.toISOString().slice(0, 10) !== raw) return fallback;
  return raw;
}

function formatDateLabel(value) {
  const iso = normalizeDateValue(value);
  return formatIsoDateLabelUz(iso);
}

/** Buyurtma statusini oddiy qilib (seller panel uchun) */
function sellerOrderStatusLabelUz(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const map = {
    pending: 'Kutilmoqda',
    hold: 'Vaqtinchalik saqlangan',
    picked: 'Yig‘ilgan',
    packaged: 'Qadoqlangan',
    assigned: 'Kuryerga berilgan',
    picked_up: 'Kuryer oldi',
    on_the_way: 'Yo‘lda',
    delivered: 'Yetkazildi',
    cancelled: 'Bekor qilindi',
    blocked: 'Bloklangan',
    archived: 'Arxiv',
  };
  return map[s] || (raw ? String(raw) : '—');
}

function makeProductForm() {
  return {
    name_uz: '',
    name_ru: '',
    description_uz: '',
    image_slots: ['', '', '', '', ''],
    image_slot_names: ['', '', '', '', ''],
    image_slot_checked: [true, false, false, false, false],
    video_url: '',
    video_file_name: '',
    category: '',
    stock: '0',
    price: '0',
    operator_share_percent: '10',
    site_fee_percent: '5',
  };
}

function makeProfileForm() {
  return {
    first_name: '',
    last_name: '',
    phone: '',
    login: '',
    email: '',
    password: '',
    confirm_password: '',
  };
}

function categoryOptionsFor(value) {
  const all = [...AUDIENCE_CATEGORIES, ...PRODUCT_CATEGORIES];
  if (!value || all.includes(value)) return all;
  return [value, ...all];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi."));
    reader.readAsDataURL(file);
  });
}


function clampPercent(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.min(n, 100);
}

function calcShares(price, operatorPercent, sitePercent) {
  const p = Number(price || 0);
  const op = clampPercent(operatorPercent);
  const sf = clampPercent(sitePercent);
  const operatorAmount = (p * op) / 100;
  const siteAmount = (p * sf) / 100;
  const sellerNet = p - operatorAmount - siteAmount;
  return {
    operatorPercent: op,
    sitePercent: sf,
    operatorAmount,
    siteAmount,
    sellerNet,
    valid: op + sf <= 100,
  };
}

export default function SellerDashboard() {
  const { request, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t: pickerUiT } = usePickerUiSettings();

  const menuItems = useMemo(
    () => [
      { key: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
      { key: 'products', icon: 'fa-box', label: 'Mahsulotlar' },
      { key: 'orders', icon: 'fa-shopping-cart', label: 'Buyurtmalar' },
      { key: 'chat', icon: 'fa-comments', label: pickerUiT.navMyShopChat, telegram: true },
      { key: 'finance', icon: 'fa-wallet', label: 'Moliya' },
      { key: 'settings', icon: 'fa-cog', label: 'Sozlamalar' },
      { key: 'profile', icon: 'fa-user', label: 'Profil' },
    ],
    [pickerUiT.navMyShopChat]
  );

  const pageTitle = useCallback(
    (view) => {
      if (view === PROFILE_VIEW_KEY) return 'Profil';
      if (view === 'products_add') return 'Mahsulot qo‘shish';
      if (view === 'products_archive') return 'Sotuvdan olingan';
      if (view === 'products_print') return 'Chek chiqarish';
      const found = menuItems.find((item) => item.key === view);
      return found ? found.label : 'Dashboard';
    },
    [menuItems]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const [seller, setSeller] = useState(null);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);

  const [search, setSearch] = useState('');
  const [form, setForm] = useState(makeProductForm());
  const [productAdCreatives, setProductAdCreatives] = useState([]);
  const [creativeBusy, setCreativeBusy] = useState(false);
  const [suggestAssetsBusy, setSuggestAssetsBusy] = useState(false);
  const [profileForm, setProfileForm] = useState(makeProfileForm());
  const [profileSavedMessage, setProfileSavedMessage] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  const [activeView, setActiveView] = useState(() => normalizeSellerView(searchParams.get('view')));
  const [selectedDate, setSelectedDate] = useState(() => normalizeDateValue(searchParams.get('date')));
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [salesChartPeriod, setSalesChartPeriod] = useState('month');
  const [salesChartPoints, setSalesChartPoints] = useState([]);
  const [sellerWithdrawBal, setSellerWithdrawBal] = useState(null);
  const [sellerWithdrawHist, setSellerWithdrawHist] = useState([]);
  const [sellerWithdrawAmount, setSellerWithdrawAmount] = useState('');
  const [sellerWithdrawPayout, setSellerWithdrawPayout] = useState('cash');
  const [sellerWithdrawBusy, setSellerWithdrawBusy] = useState(false);
  const [sellerWithdrawMsg, setSellerWithdrawMsg] = useState('');
  const [sellerWithdrawErr, setSellerWithdrawErr] = useState(false);
  const [salesChartLoading, setSalesChartLoading] = useState(false);

  const [ordersOverviewLoading, setOrdersOverviewLoading] = useState(false);
  const [ordersOverviewErr, setOrdersOverviewErr] = useState('');
  const [ordersOverviewSummary, setOrdersOverviewSummary] = useState(null);
  const [ordersOverviewProducts, setOrdersOverviewProducts] = useState([]);
  const [ordersOverviewRecent, setOrdersOverviewRecent] = useState([]);
  const [ordersViewSearch, setOrdersViewSearch] = useState('');
  const [printSearchQuery, setPrintSearchQuery] = useState('');
  const [receiptPrintDraft, setReceiptPrintDraft] = useState({
    productName: '',
    priceNumeric: 0,
    qty: 1,
  });
  const sellerProductImageSlotFileRefs = useRef({});
  const videoFileInputRef = useRef(null);

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 1024;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 1024;
  });

  useEffect(() => {
    const onResize = () => {
      const desktop = window.innerWidth > 1024;
      setIsDesktop(desktop);
      setSidebarOpen(desktop);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isDesktop || !sidebarOpen) {
      document.body.style.overflow = '';
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isDesktop, sidebarOpen]);

  useEffect(() => {
    const nextView = normalizeSellerView(searchParams.get('view'));
    const nextDate = normalizeDateValue(searchParams.get('date'));

    setActiveView((prev) => (prev === nextView ? prev : nextView));
    setSelectedDate((prev) => (prev === nextDate ? prev : nextDate));
  }, [searchParams]);

  /** Eski ?view=statistics xavfisini MyShop Chat ga yo‘naltirish */
  useEffect(() => {
    if (searchParams.get('view') === 'statistics') {
      const params = new URLSearchParams(searchParams);
      params.set('view', 'chat');
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setProfileOpen(false);
    setNotificationsOpen(false);
    if (activeView !== 'orders') setOrdersViewSearch('');
    if (activeView !== 'products_print') setPrintSearchQuery('');
  }, [activeView]);

  /** Nom/kategoriya kiritilganda izoh bo‘sh bo‘lsa — avtomatik matn. */
  useEffect(() => {
    if (String(form.description_uz || '').trim()) return;
    const auto = buildAutoProductDescription(form.name_uz, form.category);
    if (!auto) return;
    setForm((p) => {
      if (String(p.description_uz || '').trim()) return p;
      return { ...p, description_uz: auto };
    });
  }, [form.name_uz, form.category]);

  /** 1-slotga rasm qo‘yilgach: 2–5 internet (Unsplash/Picsum), video (Pexels/namuna). */
  const runSuggestInternetAssets = useCallback(
    async (searchQuery) => {
      setSuggestAssetsBusy(true);
      setError('');
      try {
        const res = await request('/seller/suggest-assets', {
          method: 'POST',
          body: JSON.stringify({
            search_query: String(searchQuery || '').trim() || 'product',
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Tavsiyalar yuklanmadi');
        }
        const data = await res.json();
        const images = Array.isArray(data.images) ? data.images : [];
        const videoUrl = String(data.video_url || '').trim();
        setForm((p) => {
          const slots = [...p.image_slots];
          const names = [...p.image_slot_names];
          for (let i = 0; i < 4; i += 1) {
            const idx = i + 1;
            if (images[i]) {
              slots[idx] = images[i];
              names[idx] = `internet-${i + 1}.jpg`;
            }
          }
          const checked = PRODUCT_IMAGE_SLOT_INDEXES.map((j) => Boolean(slots[j]));
          const next = {
            ...p,
            image_slots: slots,
            image_slot_names: names,
            image_slot_checked: checked,
          };
          if (videoUrl && !p.video_url) {
            next.video_url = videoUrl;
            next.video_file_name = 'video-tavsiya.mp4';
          }
          return next;
        });
      } catch (e) {
        setError(e.message || 'Internetdan rasm yuklanmadi.');
      } finally {
        setSuggestAssetsBusy(false);
      }
    },
    [request]
  );

  const setActiveViewWithUrl = (nextView) => {
    const normalized = normalizeSellerView(nextView);
    setActiveView(normalized);

    const params = new URLSearchParams(searchParams);
    if (normalized === DEFAULT_SELLER_VIEW) {
      params.delete('view');
    } else {
      params.set('view', normalized);
    }

    setSearchParams(params, { replace: true });
  };

  const setSelectedDateWithUrl = (nextDate) => {
    const normalized = normalizeDateValue(nextDate);
    setSelectedDate(normalized);

    const params = new URLSearchParams(searchParams);
    params.set('date', normalized);
    setSearchParams(params, { replace: true });
  };

  const ensureOk = async (res, fallback) => {
    if (res.ok) return res.json();
    let message = fallback;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  };

  const loadSellerCatalog = useCallback(async () => {
    try {
      const res = await request('/seller/products');
      const data = res.ok ? await res.json() : { products: [] };
      setCatalogProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (_) {
      setCatalogProducts([]);
    }
  }, [request]);

  const loadOrdersOverview = useCallback(async () => {
    setOrdersOverviewLoading(true);
    setOrdersOverviewErr('');
    try {
      const res = await request('/seller/orders-overview');
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      if (!res.ok) throw new Error(data.error || 'Buyurtmalar ko‘rinmadi');
      setOrdersOverviewSummary(data.summary || null);
      setOrdersOverviewProducts(Array.isArray(data.products) ? data.products : []);
      setOrdersOverviewRecent(Array.isArray(data.recent_orders) ? data.recent_orders : []);
    } catch (e) {
      const msg = e.message || 'Buyurtmalar yuklanmadi';
      setOrdersOverviewErr(msg);
      setOrdersOverviewSummary(null);
      setOrdersOverviewProducts([]);
      setOrdersOverviewRecent([]);
    } finally {
      setOrdersOverviewLoading(false);
    }
  }, [request]);

  const loadData = useCallback(
    async (withLoader = true, targetDate) => {
      const dateValue = normalizeDateValue(targetDate ?? selectedDate);
      if (withLoader) setLoading(true);
      setError('');
      try {
        const res = await request(`/seller/dashboard?date=${encodeURIComponent(dateValue)}`);
        const data = await ensureOk(res, 'Seller panel yuklanmadi');
        setSeller(data?.seller || null);
        setSummary(data?.summary || null);
        setProducts(data?.products || []);
      } catch (e) {
        setError(e.message || 'Seller panel yuklanmadi');
      } finally {
        if (withLoader) setLoading(false);
      }
    },
    [request, selectedDate]
  );

  const loadNotifications = async (targetDate = selectedDate, silent = false) => {
    if (!silent) setNotificationsLoading(true);
    try {
      const dateValue = normalizeDateValue(targetDate);
      const res = await request(`/seller/notifications?date=${encodeURIComponent(dateValue)}`);
      const data = await ensureOk(res, 'Notificationlar yuklanmadi');
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
      setUnreadCount(Number(data?.unread_count || 0));
    } catch (e) {
      if (!silent) setError(e.message || 'Notificationlar yuklanmadi');
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    setProfileSavedMessage('');
    try {
      const res = await request('/seller/profile');
      const data = await ensureOk(res, 'Profil yuklanmadi');
      const profile = data?.profile || {};
      setProfileForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
        login: profile.login || '',
        email: profile.email || '',
        password: '',
        confirm_password: '',
      });
    } catch (e) {
      setError(e.message || 'Profil yuklanmadi');
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    if (!isSellerPrincipal(user)) {
      setLoading(false);
      return;
    }

    const firstLoad = !hasLoadedOnceRef.current;
    hasLoadedOnceRef.current = true;

    loadData(firstLoad, selectedDate);
    loadNotifications(selectedDate, true);
    loadOrdersOverview();
  }, [user, selectedDate, loadData, loadOrdersOverview]);

  useEffect(() => {
    if (!user) return;

    if (!isSellerPrincipal(user)) return;

    const timer = setInterval(() => {
      loadNotifications(selectedDate, true);
    }, 15000);

    return () => clearInterval(timer);
  }, [user, selectedDate]);

  useEffect(() => {
    if (activeView === PROFILE_VIEW_KEY) {
      loadProfile();
    }
  }, [activeView]);

  useEffect(() => {
    if (!isSellerPrincipal(user)) return;
    if (activeView !== 'products' && activeView !== 'products_add' && activeView !== 'products_archive') return;
    loadSellerCatalog();
  }, [user, activeView, loadSellerCatalog]);

  useEffect(() => {
    if (!isDesktop || activeView !== 'products_add') return;
    setActiveViewWithUrl('products');
  }, [isDesktop, activeView]);

  useEffect(() => {
    if (!user) return;
    if (activeView !== 'dashboard') return;
    let cancelled = false;
    (async () => {
      setSalesChartLoading(true);
      try {
        const res = await request(`/seller/sales-series?period=${encodeURIComponent(salesChartPeriod)}`);
        const data = await ensureOk(res, 'Sotuv grafigi yuklanmadi');
        if (!cancelled) setSalesChartPoints(Array.isArray(data.points) ? data.points : []);
      } catch {
        if (!cancelled) setSalesChartPoints([]);
      } finally {
        if (!cancelled) setSalesChartLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeView, salesChartPeriod, request]);

  useEffect(() => {
    if (!user || !isSellerPrincipal(user)) return undefined;
    if (activeView !== 'finance') return undefined;
    let cancelled = false;
    setSellerWithdrawMsg('');
    setSellerWithdrawErr(false);
    (async () => {
      try {
        const [bRes, wRes] = await Promise.all([request('/seller/balance'), request('/seller/withdrawals')]);
        if (cancelled) return;
        const bData = bRes.ok ? await bRes.json().catch(() => ({})) : {};
        const wData = wRes.ok ? await wRes.json().catch(() => ({})) : {};
        setSellerWithdrawBal(bRes.ok ? Number(bData.balance) || 0 : null);
        setSellerWithdrawHist(Array.isArray(wData.withdrawals) ? wData.withdrawals : []);
      } catch {
        if (!cancelled) {
          setSellerWithdrawBal(null);
          setSellerWithdrawHist([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeView, request]);

  const runMutation = async (key, fn) => {
    if (busyKey) return;
    setBusyKey(key);
    setError('');
    try {
      await fn();
      await loadData(false, selectedDate);
      await loadSellerCatalog();
      await loadOrdersOverview();
      await loadNotifications(selectedDate, true);
    } catch (e) {
      setError(e.message || 'Amal bajarilmadi');
    } finally {
      setBusyKey('');
    }
  };

  const formShare = useMemo(
    () => calcShares(form.price, form.operator_share_percent, form.site_fee_percent),
    [form.price, form.operator_share_percent, form.site_fee_percent]
  );

  const productRowsForTable = useMemo(() => {
    const cat = Array.isArray(catalogProducts) ? catalogProducts : [];
    if (activeView === 'products_archive') return cat;
    if (activeView === 'products' || activeView === 'products_add') return cat;
    return Array.isArray(products) ? products : [];
  }, [activeView, catalogProducts, products]);

  const filteredProducts = useMemo(() => {
    const cat = Array.isArray(catalogProducts) ? catalogProducts : [];
    let table = Array.isArray(productRowsForTable) ? productRowsForTable : [];
    if (activeView === 'products_archive') {
      table = cat.filter((p) => isSellerProductBrak(p) || isSellerWithdrawnProduct(p));
    }
    const q = search.trim().toLowerCase();
    if (!q) return table;
    return table.filter((row) =>
      `${row.name_uz || ''} ${row.category || ''} ${row.id}`.toLowerCase().includes(q),
    );
  }, [productRowsForTable, search, activeView, catalogProducts]);

  const productListSummaryNodes = useMemo(
    () =>
      filteredProducts.map((row) => {
        const sold = Math.max(0, Math.round(Number(row.sold_qty) || 0));
        const stock = Math.max(0, Math.round(Number(row.stock) || 0));
        const title = row.name_uz || `Mahsulot #${row.id}`;
        const archiveBrak = activeView === 'products_archive' && isSellerProductBrak(row);

        return (
          <div key={row.id} className="seller-product-summary-row" role="listitem" aria-label={title}>
            <div className="seller-product-summary-thumb">
              {row.image_url ? (
                <img src={row.image_url} alt="" className="seller-product-summary-img" />
              ) : (
                <span className="seller-product-summary-placeholder" aria-hidden>
                  <i className="fas fa-image" />
                </span>
              )}
            </div>
            {archiveBrak ? (
              <div className="seller-archive-brak-main">
                <strong className="seller-archive-brak-name">{title}</strong>
                <p className="seller-archive-brak-qty-line">
                  <span>Brak soni</span>
                  <strong>{sellerBrakQtyDisplay(row)} dona</strong>
                </p>
              </div>
            ) : (
              <dl className="seller-product-summary-metrics">
                <div className="seller-product-metric">
                  <dt>Narx</dt>
                  <dd>{formatCurrency(row.price)}</dd>
                </div>
                <div className="seller-product-metric">
                  <dt>Omborda</dt>
                  <dd>{stock}</dd>
                </div>
                <div className="seller-product-metric">
                  <dt>Sotilgan</dt>
                  <dd>{sold}</dd>
                </div>
              </dl>
            )}
          </div>
        );
      }),
    [filteredProducts, activeView],
  );
  const printActiveCatalog = useMemo(
    () =>
      Array.isArray(catalogProducts)
        ? catalogProducts.filter((p) => String(p?.status || '').trim().toLowerCase() === 'active')
        : [],
    [catalogProducts],
  );

  const printSearchMatches = useMemo(() => {
    const q = printSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return printActiveCatalog
      .filter((row) =>
        `${row.name_uz || ''} ${row.category || ''} ${row.id}`.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [printActiveCatalog, printSearchQuery]);

  const printReceiptForProduct = useCallback((row) => {
    const name = String(row?.name_uz || '').trim() || `Mahsulot #${row?.id}`;
    const priceNumeric = Number(row?.price) || 0;
    setReceiptPrintDraft({ productName: name, priceNumeric, qty: 1 });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
      .slice(0, 6);
  }, [products]);

  const filteredOrderOverviewProducts = useMemo(() => {
    const q = ordersViewSearch.trim().toLowerCase();
    const list = ordersOverviewProducts || [];
    if (!q) return list;
    return list.filter((row) => `${row.name_uz || ''} ${row.id}`.toLowerCase().includes(q));
  }, [ordersOverviewProducts, ordersViewSearch]);

  const recentOrders = useMemo(() => {
    return (ordersOverviewRecent || []).slice(0, 6).map((r) => ({
      id: r.id,
      title: `Buyurtma #${r.id}`,
      subtitle: `${r.qty_seller_lines != null ? r.qty_seller_lines : ''} ta mahsulot qatori`,
      time: formatDateTime(r.created_at),
      status: sellerOrderStatusLabelUz(r.status),
      amount: formatCurrency(r.line_total || 0),
    }));
  }, [ordersOverviewRecent]);

  const salesChartDisplay = useMemo(() => {
    const pts = salesChartPoints || [];
    const maxRev = Math.max(...pts.map((p) => Number(p.revenue) || 0), 1);
    return pts.map((p) => ({
      ...p,
      barPct: Math.max(8, Math.round(((Number(p.revenue) || 0) / maxRev) * 100)),
    }));
  }, [salesChartPoints]);

  const sellerName = seller?.name || user?.full_name || 'Seller';
  const sellerAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(sellerName)}&background=10b981&color=fff&size=128`;
  const selectedDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);

  const hasProductImage = useMemo(
    () => PRODUCT_IMAGE_SLOT_INDEXES.some((i) => Boolean(form.image_slots[i])),
    [form.image_slots]
  );
  const canSaveProduct = productAdCreatives.length >= 4;

  const handleReklamaQilish = async () => {
    if (!hasProductImage) return;
    setCreativeBusy(true);
    setError('');
    try {
      await new Promise((r) => setTimeout(r, 400));
      setProductAdCreatives(generateSellerProductCreatives(form));
    } finally {
      setCreativeBusy(false);
    }
  };

  const todayIncome = Math.round((summary?.seller_net_total || 0) * 0.14);
  const ordersCount =
    ordersOverviewSummary?.distinct_buyurtmalar != null
      ? Math.max(0, Number(ordersOverviewSummary.distinct_buyurtmalar) || 0)
      : Math.max(0, Math.round((summary?.products_count || 0) * 1.9));
  const productCount = summary?.products_count || products.length || 0;
  const rating = (4.6 + Math.min(0.4, productCount / 200)).toFixed(1);

  const pendingOrders = Math.max(0, Math.round(ordersCount * 0.22));
  const deliveredOrders = Math.max(0, Math.round(ordersCount * 0.68));
  const cancelledOrders = Math.max(0, ordersCount - pendingOrders - deliveredOrders);
  const conversion = ordersCount > 0 ? Math.min(99, Math.round((deliveredOrders / ordersCount) * 100)) : 0;

  const handleProductImageSlotFile = async (slotIndex, e) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (input) input.value = '';
    if (!file) {
      setProductAdCreatives([]);
      setForm((p) => {
        const slots = [...p.image_slots];
        const names = [...p.image_slot_names];
        slots[slotIndex] = '';
        names[slotIndex] = '';
        if (slotIndex === 0) {
          for (let i = 1; i < 5; i += 1) {
            const s = slots[i];
            if (s && (String(s).startsWith('http://') || String(s).startsWith('https://'))) {
              slots[i] = '';
              names[i] = '';
            }
          }
        }
        return { ...p, image_slots: slots, image_slot_names: names };
      });
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      setError('Faqat rasm fayl tanlang.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError('Rasm hajmi 5MB dan oshmasligi kerak.');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setProductAdCreatives([]);
      setForm((p) => {
        const slots = [...p.image_slots];
        const names = [...p.image_slot_names];
        const checked = [...p.image_slot_checked];
        slots[slotIndex] = dataUrl;
        names[slotIndex] = file.name;
        checked[slotIndex] = true;
        let desc = p.description_uz;
        if (!String(desc || '').trim()) {
          const auto = buildAutoProductDescription(p.name_uz, p.category);
          if (auto) desc = auto;
        }
        const next = {
          ...p,
          image_slots: slots,
          image_slot_names: names,
          image_slot_checked: checked,
          description_uz: desc,
        };
        if (slotIndex === 0) {
          queueMicrotask(() => runSuggestInternetAssets(formatSearchQueryForSuggest(next)));
        }
        return next;
      });
      setError('');
    } catch (err) {
      setError(err.message || 'Rasm yuklanmadi.');
    }
  };

  const toggleProductImageSlotChecked = (slotIndex) => {
    setForm((p) => {
      const next = [...p.image_slot_checked];
      next[slotIndex] = !next[slotIndex];
      return { ...p, image_slot_checked: next };
    });
  };

  const handleVideoFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setForm((p) => ({ ...p, video_url: '', video_file_name: '' }));
      return;
    }

    if (!String(file.type || '').startsWith('video/')) {
      setError('Faqat video fayl tanlang.');
      return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
      setError('Video hajmi 20MB dan oshmasligi kerak.');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setProductAdCreatives([]);
      setForm((p) => {
        let desc = p.description_uz;
        if (!String(desc || '').trim()) {
          const auto = buildAutoProductDescription(p.name_uz, p.category);
          if (auto) desc = auto;
        }
        return {
          ...p,
          video_url: dataUrl,
          video_file_name: file.name,
          description_uz: desc,
        };
      });
      setError('');
    } catch (err) {
      setError(err.message || 'Video yuklanmadi.');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name_uz.trim()) return setError('Mahsulot nomi kerak.');
    if (!form.category) return setError('Kategoriyani tanlang.');
    if (!formShare.valid) return setError("Operator ulushi va sayt foizi yig'indisi 100% dan oshmasligi kerak.");
    const primaryImgIdx = primaryProductImageSlotIndex(form.image_slots, form.image_slot_checked);
    if (primaryImgIdx < 0 || !form.image_slots[primaryImgIdx]) {
      return setError("Kamida bitta rasm yuklang (+ tugmasi — galeriya yoki fayl).");
    }
    if (productAdCreatives.length < 4) {
      return setError('«Saqlash» uchun kamida 4 ta kreativ kerak. «Reklama qilish» ni bosing.');
    }

    await runMutation('create-product', async () => {
      const orderedImages = PRODUCT_IMAGE_SLOT_INDEXES.map((i) => form.image_slots[i]).filter(Boolean);
      const res = await request('/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          name_uz: form.name_uz.trim(),
          name_ru: form.name_ru.trim() || null,
          description_uz: form.description_uz.trim() || null,
          image_url: form.image_slots[primaryImgIdx] || null,
          image_gallery_json: orderedImages.length ? JSON.stringify(orderedImages) : null,
          video_url: form.video_url || null,
          category: form.category || null,
          stock: Number(form.stock) || 0,
          price: Number(form.price) || 0,
          operator_share_percent: formShare.operatorPercent,
          site_fee_percent: formShare.sitePercent,
          ai_creatives_json: JSON.stringify(productAdCreatives),
        }),
      });
      await ensureOk(res, 'Mahsulot qo\'shilmadi');
      setProductAdCreatives([]);
      setForm(makeProductForm());
      setActiveViewWithUrl('products');
    });
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();

    const firstName = profileForm.first_name.trim();
    const lastName = profileForm.last_name.trim();
    const phone = profileForm.phone.trim();
    const login = profileForm.login.trim();
    const email = profileForm.email.trim().toLowerCase();
    const password = profileForm.password;
    const confirmPassword = profileForm.confirm_password;

    if (!firstName) return setError('Ismni kiriting.');
    if (!lastName) return setError('Familiyani kiriting.');
    if (!phone) return setError('Telefon raqamni kiriting.');
    if (!login) return setError('Loginni kiriting.');
    if (!email) return setError('Emailni kiriting.');
    if (password && password !== confirmPassword) return setError('Parollar mos kelmadi.');

    setProfileSavedMessage('');

    await runMutation('save-profile', async () => {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        phone,
        login,
        email,
      };

      if (password) payload.password = password;

      const res = await request('/seller/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      const data = await ensureOk(res, 'Profil saqlanmadi');
      const profile = data?.profile || {};

      setProfileForm((prev) => ({
        ...prev,
        first_name: profile.first_name || firstName,
        last_name: profile.last_name || lastName,
        phone: profile.phone || phone,
        login: profile.login || login,
        email: profile.email || email,
        password: '',
        confirm_password: '',
      }));

      setProfileSavedMessage('Profil muvaffaqiyatli saqlandi.');
    });
  };

  const handleDateChange = (event) => {
    const next = normalizeDateValue(event.target.value);
    setSelectedDateWithUrl(next);
  };

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    setProfileOpen(false);
    if (nextOpen) {
      loadNotifications(selectedDate);
    }
  };

  const handleReadNotification = async (id) => {
    setNotificationsLoading(true);
    setError('');
    try {
      const res = await request(`/seller/notifications/${id}/read`, { method: 'PATCH' });
      await ensureOk(res, 'Xabarni o\'qilgan qilishda xato');
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: 1 } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      setError(e.message || 'Xabarni yangilab bo\'lmadi');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleReadAllNotifications = async () => {
    setNotificationsLoading(true);
    setError('');
    try {
      const res = await request('/seller/notifications/read-all', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate }),
      });
      await ensureOk(res, 'Xabarlarni o\'qilgan qilishda xato');
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
      setUnreadCount(0);
    } catch (e) {
      setError(e.message || 'Xabarlarni yangilab bo\'lmadi');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleOpenFromNotification = (linkView) => {
    const target = String(linkView || '').trim();
    if (!target) return;

    if (target === 'profile') {
      setActiveViewWithUrl(PROFILE_VIEW_KEY);
    } else {
      setActiveViewWithUrl(target);
    }

    setNotificationsOpen(false);
    if (!isDesktop) setSidebarOpen(false);
  };

  if (loading) {
    return <div className="seller-loading-page">Yuklanmoqda...</div>;
  }

  const isMyShopChatView = activeView === 'chat';

  return (
    <div className={`seller-app seller-mobile-shell ${darkMode ? 'seller-dark' : ''}${isMyShopChatView ? ' seller-chat-mode' : ''}`}>
      <div className={`seller-overlay ${!isDesktop && sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`seller-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="seller-sidebar-inner">
          <div className="seller-sidebar-header">
            <div className="seller-logo" title="MyShop Seller">
              <span className="seller-logo-icon"><i className="fas fa-store" /></span>
              <span className="seller-logo-text">MyShop Seller</span>
            </div>
            <button type="button" className="seller-close-btn" aria-label="Yopish" onClick={() => setSidebarOpen(false)}>
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
          <div className="seller-logo-line" aria-hidden="true" />
          <div className="seller-name-block">
            <strong>{sellerName}</strong>
            <span className="seller-status"><i className="fas fa-circle" /> Aktiv</span>
          </div>

          <div className="seller-menu-label">ASOSIY</div>
          <nav className="seller-menu-list">
            {menuItems.map((item) => {
              const qtyYolda =
                ordersOverviewSummary != null ? Number(ordersOverviewSummary.total_qty_yolda) || 0 : null;
              const badge =
                item.key === 'products'
                  ? productCount
                  : item.key === 'orders'
                    ? qtyYolda != null && qtyYolda > 0
                      ? Math.min(99, qtyYolda)
                      : ordersOverviewSummary != null &&
                          Number(ordersOverviewSummary.distinct_buyurtmalar) > 0 &&
                          qtyYolda === 0
                        ? Math.min(99, Number(ordersOverviewSummary.distinct_buyurtmalar))
                        : null
                    : null;

              return (
                <button
                  key={item.key}
                  type="button"
                  data-nav={item.key}
                  className={`seller-menu-item ${activeView === item.key ? 'active' : ''}`}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => {
                    setActiveViewWithUrl(item.key);
                    if (!isDesktop) setSidebarOpen(false);
                  }}
                >
                  <span className="seller-menu-item-leading">
                    {item.telegram ? (
                      <span className="seller-menu-icon-telegram" aria-hidden="true">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
                          <defs>
                            <linearGradient
                              id="sellerSidebarTelegram"
                              x1="12"
                              y1="1"
                              x2="12"
                              y2="23"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop stopColor="#37aee2" />
                              <stop offset="1" stopColor="#1e96c8" />
                            </linearGradient>
                          </defs>
                          <circle cx="12" cy="12" r="11" fill="url(#sellerSidebarTelegram)" />
                          <path
                            fill="#fff"
                            d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.12-.46-.52-.19l-9.48 5.99-4.1-1.3c-.88-.25-.89-.86.2-1.3L19.81 4.54c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.08-3.08-2.05 1.95c-.23.23-.42.42-.83.42z"
                          />
                        </svg>
                      </span>
                    ) : (
                      <i className={`fas ${item.icon}`} aria-hidden="true" />
                    )}
                  </span>
                  <span className="seller-menu-item-label">{item.label}</span>
                  <span className="seller-menu-item-badge-wrap">
                    {badge !== null && (
                      <em className={item.key === 'orders' ? 'warning' : ''}>{badge}</em>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="seller-sidebar-footer">
            <div className="seller-footer-row">
              <label className="seller-theme-toggle" title={darkMode ? 'Kun rejimi' : 'Tun rejimi'}>
                <input type="checkbox" checked={darkMode} onChange={toggleTheme} className="seller-theme-checkbox" aria-label={darkMode ? 'Kun' : 'Tun'} />
                <span className="seller-theme-slider" />
              </label>
              <button
                type="button"
                className="seller-logout-btn"
                title="Chiqish"
                aria-label="Chiqish"
                onClick={() => { logout(); navigate('/login'); }}
              >
                <i className="fas fa-sign-out-alt" aria-hidden="true" />
                <span>Chiqish</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className={`seller-main${isMyShopChatView ? ' seller-main--chat' : ''}`}>
        {!isMyShopChatView && (notificationsOpen || profileOpen) ? (
          <div
            className="seller-dropdown-backdrop"
            aria-hidden
            onClick={() => {
              setNotificationsOpen(false);
              setProfileOpen(false);
            }}
          />
        ) : null}
        {!isMyShopChatView && (
        <header className="seller-topbar">
          <div className="seller-topbar-left">
            <button type="button" className="seller-menu-toggle" onClick={() => setSidebarOpen((v) => !v)}>
              <i className="fas fa-bars" />
            </button>
            <div>
              <h1>{pageTitle(activeView)}</h1>
              <p>{selectedDateLabel} bo'yicha ma'lumotlar, {sellerName}.</p>
            </div>
          </div>

          <div className="seller-topbar-right">
            <label className="seller-date-chip" htmlFor="sellerDatePicker">
              <i className="fas fa-calendar-alt" />
              <input
                id="sellerDatePicker"
                className="seller-date-input"
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                max={todayIsoDate()}
              />
              <small>{selectedDateLabel}</small>
            </label>

            <div className="seller-notify-wrap">
              <button type="button" className="seller-icon-btn" onClick={toggleNotifications}>
                <i className="fas fa-bell" />
                {unreadCount > 0 && <em>{unreadCount > 99 ? '99+' : unreadCount}</em>}
              </button>

              {notificationsOpen && (
                <div className="seller-notify-menu">
                  <div className="seller-notify-head">
                    <strong>Xabarlar</strong>
                    <button type="button" onClick={handleReadAllNotifications} disabled={notificationsLoading || unreadCount < 1}>
                      Hammasini o'qilgan qil
                    </button>
                  </div>

                  <div className="seller-notify-list">
                    {notificationsLoading && <p className="seller-muted">Xabarlar yuklanmoqda...</p>}
                    {!notificationsLoading && notifications.length === 0 && <p className="seller-muted">Tanlangan sana uchun xabar yo'q.</p>}
                    {!notificationsLoading && notifications.map((item) => (
                      <article key={item.id} className={`seller-notify-item ${Number(item.is_read) ? 'read' : 'unread'}`}>
                        <div className="seller-notify-item-head">
                          <strong>{item.title || 'Xabar'}</strong>
                          <span>{formatDateTime(item.created_at)}</span>
                        </div>
                        <p>{item.message || '-'}</p>
                        <div className="seller-notify-actions">
                          {item.link_view && (
                            <button type="button" onClick={() => handleOpenFromNotification(item.link_view)}>
                              Ochish
                            </button>
                          )}
                          {!Number(item.is_read) && (
                            <button type="button" onClick={() => handleReadNotification(item.id)}>
                              O'qildi
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="seller-profile-wrap">
              <button type="button" className="seller-profile-btn" onClick={() => { setNotificationsOpen(false); setProfileOpen((v) => !v); }}>
                <img src={sellerAvatar} alt="Profile" />
                <span>{sellerName}</span>
                <i className="fas fa-chevron-down" />
              </button>

              {profileOpen && (
                <div className="seller-profile-menu">
                  <button type="button" onClick={() => { setActiveViewWithUrl(PROFILE_VIEW_KEY); setProfileOpen(false); }}><i className="fas fa-user" /> Profil</button>
                  <button type="button" onClick={() => { setActiveViewWithUrl('settings'); setProfileOpen(false); }}><i className="fas fa-cog" /> Sozlamalar</button>
                  <button type="button" className="danger" onClick={() => { logout(); navigate('/login'); }}><i className="fas fa-sign-out-alt" /> Chiqish</button>
                </div>
              )}
            </div>
          </div>
        </header>
        )}

        <section
          className={`seller-content${isMyShopChatView ? ' seller-content--chat' : ''}${
            activeView === 'products_print' || activeView === 'products_archive'
              ? ' seller-content--seller-bare-shell'
              : ''
          }`}
        >
          {error && <div className="seller-error-box">{error}</div>}

          {activeView === 'dashboard' && (
            <>
              <div className="seller-stats-grid">
                <article className="seller-stat-card">
                  <div className="seller-stat-icon blue"><i className="fas fa-dollar-sign" /></div>
                  <div>
                    <span>Bugungi daromad</span>
                    <h3>{formatCurrency(todayIncome)}</h3>
                    <p className="pos"><i className="fas fa-arrow-up" /> +12.5%</p>
                  </div>
                </article>

                <article className="seller-stat-card">
                  <div className="seller-stat-icon green"><i className="fas fa-shopping-cart" /></div>
                  <div>
                    <span>Buyurtmalar</span>
                    <h3>{ordersCount}</h3>
                    <p className="pos"><i className="fas fa-arrow-up" /> +8%</p>
                  </div>
                </article>

                <article className="seller-stat-card">
                  <div className="seller-stat-icon orange"><i className="fas fa-box" /></div>
                  <div>
                    <span>Mahsulotlar</span>
                    <h3>{productCount}</h3>
                    <p>{Math.max(1, Math.round(productCount / 8))} turdagi</p>
                  </div>
                </article>

                <article className="seller-stat-card">
                  <div className="seller-stat-icon purple"><i className="fas fa-star" /></div>
                  <div>
                    <span>Reyting</span>
                    <h3>{rating}</h3>
                    <p>5 yulduz</p>
                  </div>
                </article>
              </div>

              <div className="seller-charts-row">
                <article className="seller-panel-card">
                  <div className="seller-panel-head">
                    <h4>Sotuv statistikasi</h4>
                    <select
                      value={salesChartPeriod}
                      onChange={(e) => setSalesChartPeriod(e.target.value)}
                      aria-label="Sotuv davri"
                    >
                      <option value="day">Kunlik</option>
                      <option value="week">Haftalik</option>
                      <option value="month">Oylik</option>
                      <option value="year">Yillik</option>
                    </select>
                  </div>

                  <div
                    className="seller-chart-box"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(1, salesChartDisplay.length || 1)}, minmax(0, 1fr))`,
                    }}
                  >
                    {salesChartLoading ? (
                      <div className="seller-chart-message">Yuklanmoqda...</div>
                    ) : salesChartDisplay.length === 0 ? (
                      <div className="seller-chart-message">Ma&apos;lumot yo&apos;q</div>
                    ) : (
                      salesChartDisplay.map((row) => (
                        <div className="seller-bar-col" key={row.key}>
                          <div
                            className="seller-bar"
                            style={{ height: `${row.barPct}%` }}
                            title={`${new Intl.NumberFormat('uz-UZ').format(Math.round(row.revenue))} so'm • ${row.order_count} ta`}
                          />
                          <span>{row.label}</span>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="seller-mini-stats">
                  <div className="seller-mini-item">
                    <i className="fas fa-clock blue" />
                    <div><span>Kutilayotgan</span><strong>{pendingOrders}</strong></div>
                  </div>
                  <div className="seller-mini-item">
                    <i className="fas fa-check-circle green" />
                    <div><span>Yetkazilgan</span><strong>{deliveredOrders}</strong></div>
                  </div>
                  <div className="seller-mini-item">
                    <i className="fas fa-times-circle orange" />
                    <div><span>Bekor qilingan</span><strong>{cancelledOrders}</strong></div>
                  </div>
                  <div className="seller-mini-item">
                    <i className="fas fa-percent purple" />
                    <div><span>Konversiya</span><strong>{conversion}%</strong></div>
                  </div>
                </article>
              </div>

              <div className="seller-activity-grid">
                <article className="seller-panel-card">
                  <div className="seller-panel-head">
                    <h4>Eng ko'p sotilgan mahsulotlar</h4>
                    <button type="button" onClick={() => setActiveViewWithUrl('products')}>Barchasi</button>
                  </div>
                  <div className="seller-list-box">
                    {topProducts.length === 0 && <p className="seller-muted">Mahsulotlar yo'q</p>}
                    {topProducts.map((p) => (
                      <div className="seller-list-row" key={p.id}>
                        <div>
                          <strong>{p.name_uz || `Mahsulot #${p.id}`}</strong>
                          <span>{p.category || 'Kategoriya yo\'q'}</span>
                        </div>
                        <div className="right">
                          <strong>{formatCurrency(p.price)}</strong>
                          <span>stock: {p.stock || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="seller-panel-card">
                  <div className="seller-panel-head">
                    <h4>So'nggi buyurtmalar</h4>
                    <button type="button" onClick={() => setActiveViewWithUrl('orders')}>Barchasi</button>
                  </div>
                  <div className="seller-list-box">
                    {recentOrders.length === 0 && (
                      <p className="seller-muted">
                        {ordersOverviewLoading ? 'Yuklanmoqda...' : "Hozircha buyurtmalar yo'q"}
                      </p>
                    )}
                    {recentOrders.map((row) => (
                      <div className="seller-list-row" key={`${row.id}-${row.time}`}>
                        <div>
                          <strong>{row.title}</strong>
                          <span>{row.time}</span>
                          {row.subtitle ? <span className="seller-muted seller-list-row-sub">{row.subtitle}</span> : null}
                        </div>
                        <div className="right">
                          <strong>{row.amount}</strong>
                          <span className="status-chip">{row.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </>
          )}

          {(activeView === 'products' || activeView === 'products_add' || activeView === 'products_archive') && (
            <>
              {((isDesktop && activeView === 'products') || activeView === 'products_add') && (
              <article className="seller-panel-card">
                <div className="seller-panel-head">
                  <h4>Yangi mahsulot qo&apos;shish</h4>
                  <button
                    type="button"
                    onClick={() => setActiveViewWithUrl(!isDesktop ? 'products' : 'dashboard')}
                  >
                    {!isDesktop ? 'Mahsulotlar' : 'Dashboard'}
                  </button>
                </div>

                <form className="seller-product-form" onSubmit={handleCreate}>
                  <input className="seller-field" placeholder="Mahsulot nomi (uz)" value={form.name_uz} onChange={(e) => setForm((p) => ({ ...p, name_uz: e.target.value }))} required />
                  <input className="seller-field" placeholder="Mahsulot nomi (ru)" value={form.name_ru} onChange={(e) => setForm((p) => ({ ...p, name_ru: e.target.value }))} />
                  <select
                    className="seller-field seller-field-wide"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    required
                    aria-label="Kategoriya va mijoz guruhi"
                  >
                    <option value="">Kategoriya tanlang</option>
                    <optgroup label="Mijoz guruhi">
                      {AUDIENCE_CATEGORIES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Mahsulot kategoriyasi">
                      {PRODUCT_CATEGORIES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="seller-field-wide seller-media-row">
                  <div className="seller-field-block seller-product-image-slots-wrap">
                    <span>Rasmlar (5 tagacha)</span>
                    <div className="seller-product-image-slots" role="group" aria-label="Mahsulot rasmlari">
                      {PRODUCT_IMAGE_SLOT_INDEXES.map((i) => {
                        const src = form.image_slots[i];
                        const name = form.image_slot_names[i];
                        const chk = form.image_slot_checked[i];
                        const prim = primaryProductImageSlotIndex(form.image_slots, form.image_slot_checked);
                        return (
                          <div
                            key={`pimg-${i}`}
                            className={`seller-product-image-slot${chk ? ' is-selected' : ''}${prim === i ? ' is-primary' : ''}`}
                          >
                            <div className="seller-product-image-slot-frame">
                              <input
                                type="file"
                                accept="image/*"
                                className="seller-product-image-slot-file"
                                ref={(el) => {
                                  if (el) sellerProductImageSlotFileRefs.current[i] = el;
                                  else delete sellerProductImageSlotFileRefs.current[i];
                                }}
                                onChange={(ev) => handleProductImageSlotFile(i, ev)}
                                aria-label={`${i + 1}-rasm: galeriya yoki fayl`}
                              />
                              <button
                                type="button"
                                className={`seller-product-image-slot-add${src ? ' has-image' : ''}`}
                                onClick={() => sellerProductImageSlotFileRefs.current[i]?.click()}
                              >
                                {src ? (
                                  <img src={src} alt="" className="seller-product-image-slot-img" />
                                ) : null}
                                <span className="seller-product-image-slot-plus" aria-hidden>
                                  <i className="fas fa-plus" />
                                </span>
                              </button>
                            </div>
                            <label className={`seller-product-image-slot-check${chk ? ' is-on' : ''}`}>
                              <input
                                type="checkbox"
                                checked={chk}
                                onChange={() => toggleProductImageSlotChecked(i)}
                                aria-label={`${i + 1}-rasmni tanlash`}
                              />
                              <span className="seller-product-image-slot-check-face" aria-hidden>
                                {chk ? <i className="fas fa-check" /> : null}
                              </span>
                              <span className="seller-product-image-slot-num">{i + 1}</span>
                            </label>
                            {name ? <small className="seller-product-image-slot-fname">{name}</small> : null}
                          </div>
                        );
                      })}
                    </div>
                    <small className="seller-field-hint">
                      1-slot — o‘zingiz yuklaysiz. 2–5-slotlar 1-slot to‘ldirilgach internetdan (o‘xshash) rasmlar bilan avtomatik to‘ldiriladi.
                      Belgilanganlar ichidan eng kichik raqamli slot asosiy rasm. Har biri max 5MB.
                    </small>
                    {suggestAssetsBusy ? (
                      <small className="seller-field-hint">Internetdan rasmlar va video yuklanmoqda…</small>
                    ) : null}
                  </div>
                  <div className="seller-field-block seller-video-block">
                    <span>Reklama videosi</span>
                    <div className="seller-video-upload">
                      <input
                        ref={videoFileInputRef}
                        type="file"
                        accept="video/*"
                        className="seller-file-hidden"
                        onChange={handleVideoFileSelect}
                        aria-label="Video fayl tanlash"
                      />
                      <button
                        type="button"
                        className="seller-video-upload-btn"
                        onClick={() => videoFileInputRef.current?.click()}
                      >
                        Video yuklash
                      </button>
                    </div>
                    <small className="seller-field-hint">
                      {form.video_file_name
                        ? `Tanlandi: ${form.video_file_name}`
                        : '1-slotdagi rasm qo‘yilgach video tavsiyasi avtomatik keladi; qo‘lda yuklash: max 20MB'}
                    </small>
                  </div>
                  </div>
                  <input className="seller-field" type="number" min="0" placeholder="Narx" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} required />
                  <input className="seller-field" type="number" min="0" placeholder="Soni (stock)" value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} />
                  <input className="seller-field" type="number" min="0" max="100" placeholder="Operator ulushi %" value={form.operator_share_percent} onChange={(e) => setForm((p) => ({ ...p, operator_share_percent: e.target.value }))} />
                  <input className="seller-field" type="number" min="0" max="100" placeholder="Sayt foizi %" value={form.site_fee_percent} onChange={(e) => setForm((p) => ({ ...p, site_fee_percent: e.target.value }))} />
                  <textarea className="seller-field seller-field-wide" rows={2} placeholder="Izoh (mahsulot haqida batafsil)" value={form.description_uz} onChange={(e) => setForm((p) => ({ ...p, description_uz: e.target.value }))} />

                  <div className="seller-calc-box seller-field-wide">
                    <div><span>Operator ulushi summasi</span><strong>{formatCurrency(formShare.operatorAmount)}</strong></div>
                    <div><span>Sayt foizi summasi</span><strong>{formatCurrency(formShare.siteAmount)}</strong></div>
                    <div><span>Sellerga qoladigan summa</span><strong className="success">{formatCurrency(formShare.sellerNet)}</strong></div>
                  </div>

                  <div className="seller-field-block seller-field-wide">
                    <span>Reklama kreativlari</span>
                    <button
                      type="button"
                      className="seller-video-upload-btn seller-field-wide"
                      disabled={!hasProductImage || creativeBusy}
                      onClick={handleReklamaQilish}
                    >
                      {creativeBusy ? 'Yaratilmoqda...' : 'Reklama qilish'}
                    </button>
                    <small className="seller-field-hint">
                      Rasm bo‘lmaguncha tugma o‘chiq. Bosilganda kamida 4 ta kreativ (2 ta rasm g‘oyasi, 2 ta video g‘oyasi, matn,
                      sarlavha) yaratiladi — keyin «Saqlash» ochiladi.
                    </small>
                    {productAdCreatives.length > 0 ? (
                      <ul className="seller-creatives-preview" aria-label="Yaratilgan kreativlar">
                        {productAdCreatives.map((c) => (
                          <li key={c.id}>
                            <span className="seller-creatives-kind">{c.kind}</span>
                            {c.headline ? ` — ${c.headline}` : ''}
                            {c.title ? ` — ${c.title}` : ''}
                            {c.uz ? ` — ${c.uz}` : ''}
                            {c.subline ? ` (${c.subline})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    className="seller-primary-btn seller-field-wide"
                    disabled={busyKey === 'create-product' || !canSaveProduct}
                  >
                    {busyKey === 'create-product' ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </form>
              </article>
              )}

              {activeView === 'products' && (
                <article className="seller-panel-card">
                  <div className="seller-panel-head seller-archive-panel-head">
                    <h4>Mahsulotlarim</h4>
                    {isDesktop ? (
                      <div className="seller-products-head-actions">
                        <button type="button" className="seller-mini-btn" onClick={() => setActiveViewWithUrl('products_print')}>
                          Chek
                        </button>
                        <button type="button" className="seller-mini-btn" onClick={() => setActiveViewWithUrl('products_archive')}>
                          Sotuvdan
                        </button>
                      </div>
                    ) : null}
                    <input className="seller-search" placeholder="Qidirish..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>

                  <div className="seller-product-summary-wrap">
                    <div className="seller-product-summary-list" role="list" aria-label="Mahsulotlar ro'yxati">
                      {productListSummaryNodes}
                    </div>
                    {filteredProducts.length === 0 && (
                      <p className="seller-empty seller-product-summary-empty">Mahsulot topilmadi</p>
                    )}
                  </div>
                </article>
              )}

              {activeView === 'products_archive' && (
                <article className="seller-print-page seller-print-page--bare">
                  <div className="seller-print-inner-bare seller-print-inner-bare--centered">
                    <label className="seller-print-search-wrap">
                      <span className="seller-print-screen-reader-label">Arxivda mahsulot bo&apos;yicha qidirish</span>
                      <i className="fas fa-search seller-print-search-icon" aria-hidden />
                      <input
                        type="search"
                        className="seller-print-search-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Mahsulot nomi bo'yicha qidirish..."
                        autoComplete="off"
                        enterKeyHint="search"
                      />
                    </label>
                    <div
                      className="seller-product-summary-list seller-archive-bare-list seller-print-results--bare"
                      role="list"
                      aria-label="Arxivdagi mahsulotlar"
                    >
                      {productListSummaryNodes}
                    </div>
                  </div>
                </article>
              )}
            </>
          )}

          {activeView === 'products_print' && (
            <>
              <article className="seller-print-page seller-print-page--bare">
                <div className="seller-print-inner-bare seller-print-inner-bare--centered">
                  <label className="seller-print-search-wrap">
                    <span className="seller-print-screen-reader-label">Mahsulot nomi bo&apos;yicha qidirish</span>
                    <i className="fas fa-search seller-print-search-icon" aria-hidden />
                    <input
                      type="search"
                      className="seller-print-search-input"
                      value={printSearchQuery}
                      onChange={(e) => setPrintSearchQuery(e.target.value)}
                      placeholder="Mahsulot nomi bo&apos;yicha qidirish..."
                      autoComplete="off"
                      enterKeyHint="search"
                    />
                  </label>
                  <div className="seller-print-results seller-print-results--bare" role="list" aria-label="Qidiruv natijalari">
                    {printSearchMatches.map((row) => {
                      const title = row.name_uz || `Mahsulot #${row.id}`;
                      return (
                        <div key={row.id} className="seller-print-result-row seller-print-result-row--bare" role="listitem">
                          <div className="seller-print-result-thumb">
                            {row.image_url ? (
                              <img src={row.image_url} alt="" />
                            ) : (
                              <span className="seller-print-result-thumb-ph" aria-hidden>
                                <i className="fas fa-image" />
                              </span>
                            )}
                          </div>
                          <div className="seller-print-result-text">
                            <strong className="seller-print-result-title">{title}</strong>
                          </div>
                          <button
                            type="button"
                            className="seller-print-trigger seller-print-trigger--bare"
                            onClick={() => printReceiptForProduct(row)}
                            aria-label={`${title} uchun chek`}
                          >
                            <i className="fas fa-print" aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>

              <div id="seller-sale-receipt" className="seller-receipt-sheet seller-receipt-sheet--print-only" aria-hidden>
                <div className="seller-receipt-inner">
                  <div className="seller-receipt-brand">MyShop</div>
                  <div className="seller-receipt-seller">{sellerName}</div>
                  <hr className="seller-receipt-rule" />
                  <div className="seller-receipt-row">
                    <span>Mahsulot</span>
                    <strong>{receiptPrintDraft.productName.trim() || '—'}</strong>
                  </div>
                  <div className="seller-receipt-row">
                    <span>Soni</span>
                    <strong>{Math.max(1, Math.round(Number(receiptPrintDraft.qty) || 1))}</strong>
                  </div>
                  <div className="seller-receipt-row">
                    <span>Jami</span>
                    <strong>
                      {Number(receiptPrintDraft.priceNumeric) > 0
                        ? formatCurrency(receiptPrintDraft.priceNumeric)
                        : '—'}
                    </strong>
                  </div>
                  <div className="seller-receipt-foot">{formatDateLabel(todayIsoDate())}</div>
                </div>
              </div>
            </>
          )}

          {activeView === 'orders' && (
            <>
              <article className="seller-panel-card seller-orders-overview-card">
                <div className="seller-panel-head seller-orders-overview-head">
                  <h4>Buyurtmalar</h4>
                  <button
                    type="button"
                    className="seller-mini-btn"
                    disabled={ordersOverviewLoading}
                    onClick={() => loadOrdersOverview()}
                  >
                    Yangilash
                  </button>
                </div>
                {ordersOverviewErr ? (
                  <p className="seller-orders-overview-error">{ordersOverviewErr}</p>
                ) : null}
                <div className="seller-orders-summary-strip" aria-label="Umumiy statistika">
                  <div className="seller-orders-summary-tile">
                    <span>Jami zakazlar</span>
                    <strong>{ordersOverviewSummary?.distinct_buyurtmalar ?? (ordersOverviewLoading ? '…' : 0)}</strong>
                    <small className="seller-muted">Sizning mahsulotlaringiz qatnashgan</small>
                  </div>
                  <div className="seller-orders-summary-tile">
                    <span>Yo‘ldagi mahsulotlar</span>
                    <strong>{ordersOverviewSummary?.total_qty_yolda ?? (ordersOverviewLoading ? '…' : 0)}</strong>
                    <small className="seller-muted">Dona (yetkazish jarayonida)</small>
                  </div>
                  <div className="seller-orders-summary-tile">
                    <span>Qaytgan / bekor</span>
                    <strong>{ordersOverviewSummary?.total_qty_qaytgan ?? (ordersOverviewLoading ? '…' : 0)}</strong>
                    <small className="seller-muted">Dona</small>
                  </div>
                </div>
              </article>

              <article className="seller-panel-card">
                <div className="seller-panel-head seller-orders-overview-head">
                  <h4>Mahsulotlar bo‘yicha</h4>
                  <button type="button" className="seller-mini-btn" onClick={() => setActiveViewWithUrl('products')}>
                    Mahsulotlarim
                  </button>
                </div>
                <input
                  className="seller-search"
                  placeholder="Mahsulot bo‘yicha qidirish..."
                  value={ordersViewSearch}
                  onChange={(e) => setOrdersViewSearch(e.target.value)}
                  aria-label="Buyurtmadagi mahsulotlardan qidirish"
                />

                <div className="seller-product-summary-wrap seller-orders-by-product-wrap">
                  <div className="seller-product-summary-list" role="list" aria-label="Mahsulotlar va buyurtma statistikasi">
                    {filteredOrderOverviewProducts.map((row) => {
                      const title = row.name_uz || `Mahsulot #${row.id}`;
                      const oz = Number(row.orders_count) || 0;
                      const oy = Number(row.qty_on_way) || 0;
                      const orr = Number(row.qty_returned) || 0;
                      return (
                        <div
                          key={row.id}
                          className="seller-product-summary-row seller-orders-product-row"
                          role="listitem"
                          aria-label={`${title}. Buyurtma: ${oz}, yo'lda: ${oy}, qaytgan: ${orr}`}
                        >
                          <div className="seller-product-summary-thumb">
                            {row.image_url ? (
                              <img src={row.image_url} alt="" className="seller-product-summary-img" />
                            ) : (
                              <span className="seller-product-summary-placeholder" aria-hidden>
                                <i className="fas fa-image" />
                              </span>
                            )}
                          </div>
                          <div className="seller-orders-product-body">
                            <strong className="seller-orders-product-name">{title}</strong>
                            <dl className="seller-product-summary-metrics seller-orders-product-metrics">
                              <div className="seller-product-metric">
                                <dt>Buyurtmalar</dt>
                                <dd>{oz}</dd>
                              </div>
                              <div className="seller-product-metric">
                                <dt>Yo‘lda</dt>
                                <dd>{oy}</dd>
                              </div>
                              <div className="seller-product-metric">
                                <dt>Qaytganlar</dt>
                                <dd>{orr}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!ordersOverviewLoading && filteredOrderOverviewProducts.length === 0 && (
                    <p className="seller-empty seller-product-summary-empty">
                      {ordersViewSearch.trim()
                        ? 'Qidiruv bo‘yicha mahsulot topilmadi'
                        : "Hali bu mahsulotlar uchun buyurtma yozuvlari yo‘q — mijoz zakaz bergach shu yerda chiqadi"}
                    </p>
                  )}
                </div>
              </article>

              <article className="seller-panel-card">
                <div className="seller-panel-head">
                  <h4>Oxirgi buyurtmalar</h4>
                  <button type="button" className="seller-mini-btn" disabled={ordersOverviewLoading} onClick={() => loadOrdersOverview()}>
                    Yangilash
                  </button>
                </div>
                <div className="seller-list-box seller-orders-recent-list">
                  {ordersOverviewLoading && !(ordersOverviewRecent || []).length ? (
                    <p className="seller-muted">Yuklanmoqda...</p>
                  ) : null}
                  {!(ordersOverviewRecent || []).length && !ordersOverviewLoading ? (
                    <p className="seller-muted">Buyurtmalar yo‘q</p>
                  ) : null}
                  {(ordersOverviewRecent || []).slice(0, 30).map((r) => (
                    <div className="seller-list-row" key={`all-${r.id}`}>
                      <div>
                        <strong>#{r.id}</strong>
                        <span>{formatDateTime(r.created_at)}</span>
                        <span className="seller-muted seller-list-row-sub">
                          {sellerOrderStatusLabelUz(r.status)}
                          {typeof r.qty_seller_lines === 'number'
                            ? ` · ${r.qty_seller_lines} dona`
                            : ''}
                        </span>
                      </div>
                      <div className="right">
                        <strong>{formatCurrency(r.line_total || 0)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </>
          )}

          {activeView === 'chat' && (
            <SellerMyShopChat
              onOpenSidePanel={() => setSidebarOpen(true)}
              onExitChat={() => setActiveViewWithUrl('dashboard')}
            />
          )}

          {activeView === 'finance' && (
            <article className="seller-panel-card">
              <div className="seller-panel-head"><h4>Moliya</h4></div>
              <div className="seller-finance-grid">
                <div><span>Umumiy narx</span><strong>{formatCurrency(summary?.gross_price_total || 0)}</strong></div>
                <div><span>Operator ulushi</span><strong>{formatCurrency(summary?.operator_share_total || 0)}</strong></div>
                <div><span>Sayt foizi</span><strong>{formatCurrency(summary?.site_fee_total || 0)}</strong></div>
                <div><span>Sof daromad (mahs.)</span><strong className="seller-net-text">{formatCurrency(summary?.seller_net_total || 0)}</strong></div>
              </div>
              <section className="seller-finance-withdraw picker-withdrawal-card">
                <h5 className="picker-withdrawal-title">Chiqarish mumkin balans</h5>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
                  Buxgalter qayd etilgan balans. So‘rov superuser tasdiqlaydi — keyin kassa&nbsp;«Pul&nbsp;berildi» yozadi.
                </p>
                {sellerWithdrawBal != null ? (
                  <p className="picker-withdrawal-balance">
                    Joriy:&nbsp;<strong>{formatCurrency(sellerWithdrawBal)}</strong>
                  </p>
                ) : (
                  <p className="picker-withdrawal-msg error">Balans yuklanmadi.</p>
                )}
                <form
                  className="picker-withdrawal-row"
                  style={{ flexWrap: 'wrap' }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const raw = String(sellerWithdrawAmount).replace(/\s/g, '').replace(/,/g, '.');
                    const n = Number(raw);
                    if (!Number.isFinite(n) || n <= 0) {
                      setSellerWithdrawMsg('Summani kiriting.');
                      setSellerWithdrawErr(true);
                      return;
                    }
                    setSellerWithdrawBusy(true);
                    setSellerWithdrawMsg('');
                    setSellerWithdrawErr(false);
                    try {
                      const res = await request('/seller/withdrawal', {
                        method: 'POST',
                        body: JSON.stringify({ amount: n, payout_method: sellerWithdrawPayout }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || 'Yuborilmadi');
                      setSellerWithdrawMsg(data.message || "So‘rov yuborildi.");
                      setSellerWithdrawErr(false);
                      setSellerWithdrawAmount('');
                      const [bRes, wRes] = await Promise.all([request('/seller/balance'), request('/seller/withdrawals')]);
                      const bData = bRes.ok ? await bRes.json().catch(() => ({})) : {};
                      const wData = wRes.ok ? await wRes.json().catch(() => ({})) : {};
                      setSellerWithdrawBal(bRes.ok ? Number(bData.balance) || 0 : null);
                      setSellerWithdrawHist(Array.isArray(wData.withdrawals) ? wData.withdrawals : []);
                      await loadData(false, selectedDate);
                      await loadNotifications(selectedDate, true);
                      await loadOrdersOverview();
                    } catch (err) {
                      setSellerWithdrawMsg(String(err.message || 'Xatolik'));
                      setSellerWithdrawErr(true);
                    } finally {
                      setSellerWithdrawBusy(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    className="picker-withdrawal-input"
                    placeholder="Summa"
                    value={sellerWithdrawAmount}
                    onChange={(ev) => setSellerWithdrawAmount(ev.target.value)}
                    disabled={sellerWithdrawBusy || sellerWithdrawBal == null}
                    aria-label="Pul chiqarish summasi"
                  />
                  <select
                    className="picker-withdrawal-input"
                    value={sellerWithdrawPayout}
                    onChange={(ev) => setSellerWithdrawPayout(ev.target.value)}
                    disabled={sellerWithdrawBusy || sellerWithdrawBal == null}
                    aria-label="To‘lov turi"
                  >
                    <option value="cash">Naqd</option>
                    <option value="card">Karta</option>
                  </select>
                  <button type="submit" className="seller-primary-btn" disabled={sellerWithdrawBusy || sellerWithdrawBal == null}>
                    {sellerWithdrawBusy ? '...' : 'Yuborish'}
                  </button>
                </form>
                {sellerWithdrawMsg ? (
                  <p className={`picker-withdrawal-msg ${sellerWithdrawErr ? 'error' : 'success'}`}>{sellerWithdrawMsg}</p>
                ) : null}
                {sellerWithdrawHist.length > 0 ? (
                  <div className="seller-finance-withdraw-list">
                    <h6 className="muted" style={{ margin: '14px 0 8px', fontWeight: 600 }}>Oxirgi so‘rovlar</h6>
                    <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                      {sellerWithdrawHist.slice(0, 10).map((row) => {
                        let stuz = row.paid_out_at
                          ? 'Berildi'
                          : String(row.status || '').toLowerCase() === 'approved'
                            ? 'Tasdiqlangan · kassa'
                            : String(row.status || '').toLowerCase() === 'rejected'
                              ? 'Rad etildi'
                              : 'Superuser kutilyapti';
                        const pmuz = row.payout_method === 'card' ? 'karta' : 'naqd';
                        return (
                          <li key={row.id} style={{ marginBottom: 6 }}>
                            {formatCurrency(row.amount)} — {stuz} ({pmuz})
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </section>
            </article>
          )}

          {activeView === PROFILE_VIEW_KEY && (
            <article className="seller-panel-card">
              <div className="seller-panel-head"><h4>Profil</h4></div>
              <div className="seller-settings-box">
                {profileSavedMessage && <div className="seller-success-box">{profileSavedMessage}</div>}
                {profileLoading ? (
                  <p className="seller-muted">Profil yuklanmoqda...</p>
                ) : (
                  <form className="seller-profile-form" onSubmit={handleProfileSave}>
                    <input
                      className="seller-field"
                      placeholder="Ism"
                      value={profileForm.first_name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))}
                      required
                    />
                    <input
                      className="seller-field"
                      placeholder="Familiya"
                      value={profileForm.last_name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))}
                      required
                    />
                    <input
                      className="seller-field"
                      placeholder="Telefon"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                      required
                    />
                    <input
                      className="seller-field"
                      placeholder="Login"
                      value={profileForm.login}
                      onChange={(e) => setProfileForm((p) => ({ ...p, login: e.target.value }))}
                      required
                    />
                    <input
                      className="seller-field seller-field-wide"
                      type="email"
                      placeholder="Pochta manzili"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                    <input
                      className="seller-field"
                      type="password"
                      placeholder="Yangi parol (ixtiyoriy)"
                      value={profileForm.password}
                      onChange={(e) => setProfileForm((p) => ({ ...p, password: e.target.value }))}
                    />
                    <input
                      className="seller-field"
                      type="password"
                      placeholder="Parolni tasdiqlang"
                      value={profileForm.confirm_password}
                      onChange={(e) => setProfileForm((p) => ({ ...p, confirm_password: e.target.value }))}
                    />
                    <div className="seller-password-note seller-field-wide">
                      Parolni bo'sh qoldirsangiz, eski parol o'zgarmaydi.
                    </div>
                    <button type="submit" className="seller-primary-btn seller-field-wide" disabled={busyKey === 'save-profile'}>
                      {busyKey === 'save-profile' ? 'Saqlanmoqda...' : 'Profilni saqlash'}
                    </button>
                  </form>
                )}
              </div>
            </article>
          )}

          {activeView === 'settings' && (
            <article className="seller-panel-card">
              <div className="seller-panel-head"><h4>Sozlamalar</h4></div>
              <div className="seller-settings-box">
                <div><span>Do'kon nomi:</span><strong>{sellerName}</strong></div>
                <div><span>Email:</span><strong>{seller?.email || user?.email || '-'}</strong></div>
                <div><span>Status:</span><strong>{seller?.status || 'active'}</strong></div>
                <button type="button" className="seller-primary-btn" onClick={toggleTheme}>
                  {darkMode ? 'Yorug\' rejimga o\'tish' : 'Tungi rejimga o\'tish'}
                </button>
              </div>
            </article>
          )}
        </section>

        {!isDesktop && !isMyShopChatView && (
          <nav className="seller-mobile-dock seller-mobile-shell-dock" aria-label="Asosiy pastki menyu">
            <div className="seller-mobile-dock-inner">
              {[
                { key: 'dashboard', icon: 'fa-home', label: 'Bosh sahifa' },
                { key: 'products', icon: 'fa-box', label: 'Mahsulotlar' },
                { key: 'products_add', icon: 'fa-plus', label: 'Qo‘shish', fab: true },
                { key: 'products_print', icon: 'fa-print', label: 'Chek' },
                { key: 'products_archive', icon: 'fa-archive', label: 'Sotuvdan' },
              ].map((d) => {
                const isActive =
                  activeView === d.key ||
                  (d.key === 'dashboard' && activeView === DEFAULT_SELLER_VIEW);
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={`seller-mobile-dock-item${isActive ? ' is-active' : ''}${d.fab ? ' seller-mobile-dock-item--fab' : ''}`}
                    onClick={() => setActiveViewWithUrl(d.key)}
                    aria-label={d.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="seller-mobile-dock-icon-wrap" aria-hidden>
                      <i className={`fas ${d.icon}`} />
                    </span>
                    <span className="seller-mobile-dock-label">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </main>
    </div>
  );
}














