import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './AdminDashboard.css';
import AdminStaffChat from './admin/AdminStaffChat.jsx';
import { PACKER_UZ_VILOYATLAR, TOSHKENT_SH_TUMANS } from '../constants/uzViloyatlarPacker.js';
import {
  formatDateTimeUz,
  getDateTimePartsInUzbekistan,
  parseServerDateTime,
  todayIsoDateInUzbekistan,
} from '../utils/uzbekistanTime.js';

/** Ads Manager — kampaniyalar sahifasi; `act` = saqlangan reklama akkaunti raqami (Meta formatida). */
function metaAdsManagerCampaignsUrl(adAccountIdRaw) {
  const digits = String(adAccountIdRaw || '').trim().replace(/^act_/i, '').replace(/\D/g, '');
  if (!digits) return 'https://adsmanager.facebook.com/';
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${digits}`;
}

const MENU_GROUPS = [
  {
    label: 'ASOSIY',
    items: [
      { key: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard', badgeKey: 'users' },
      { key: 'staff_chat', icon: 'fa-comments', label: 'Chat' },
      { key: 'roles', icon: 'fa-user-tag', label: 'Rollar' },
      { key: 'orders', icon: 'fa-shopping-cart', label: 'Zakazlar', badgeKey: 'orders' },
      { key: 'product_moderation', icon: 'fa-box-open', label: 'Mahsulotlar', badgeKey: 'pendingSellerProducts' },
    ],
  },
  {
    label: 'BOSHQARUV',
    items: [
      { key: 'couriers', icon: 'fa-motorcycle', label: 'Kuryerlar' },
      { key: 'operators', icon: 'fa-headset', label: 'Operatorlar' },
      { key: 'packers', icon: 'fa-box', label: 'Packerlar' },
      { key: 'pickers', icon: 'fa-clipboard-list', label: 'Pickerlar' },
    ],
  },
  {
    label: 'STATUSLAR',
    items: [
      { key: 'hold', icon: 'fa-pause-circle', label: 'Hold', badgeKey: 'pending' },
      { key: 'atkaz', icon: 'fa-times-circle', label: 'Atkaz', badgeKey: 'atkaz', badgeTone: 'danger' },
      { key: 'arxiv', icon: 'fa-archive', label: 'Arxiv' },
      { key: 'delivery', icon: 'fa-truck', label: 'Yetkazilmoqda' },
      { key: 'on_the_way', icon: 'fa-road', label: "Yo'lda" },
    ],
  },
  {
    label: 'BOSHQALAR',
    items: [
      { key: 'customers', icon: 'fa-users', label: 'Mijozlar' },
      { key: 'seller_search', icon: 'fa-store', label: 'Sellerlar' },
      { key: 'regions', icon: 'fa-map-marker-alt', label: 'Viloyatlar' },
      { key: 'accounting', icon: 'fa-calculator', label: 'Buxgalteriya' },
      { key: 'withdrawals', icon: 'fa-money-bill-wave', label: 'Pul yechish so\'rovlari', badgeKey: 'pendingWithdrawals' },
      { key: 'ai_calls', icon: 'fa-phone', label: 'AI operator (qo‘ng‘iroqlar)' },
      { key: 'reklama', icon: 'fa-ad', label: 'Reklama' },
      { key: 'ai_target', icon: 'fa-bullseye', label: 'AI Target' },
      { key: 'konkurs', icon: 'fa-trophy', label: 'Konkurs' },
      { key: 'promotions', icon: 'fa-percent', label: 'Aksiyalar' },
    ],
  },
];

const ADMIN_VIEW_KEYS = MENU_GROUPS.flatMap((group) => group.items.map((item) => item.key));
const HIDDEN_VIEW_KEYS = ['seller_products', 'customer_detail', 'admin_profile', 'admin_settings'];

const ADMIN_HEADER_EXTRA = {
  admin_profile: { key: 'admin_profile', label: 'Profil', icon: 'fa-user' },
  admin_settings: { key: 'admin_settings', label: 'Sozlamalar', icon: 'fa-cog' },
};
const DEFAULT_ADMIN_VIEW = 'dashboard';

function normalizeAdminView(value) {
  if (!value) return DEFAULT_ADMIN_VIEW;
  return (ADMIN_VIEW_KEYS.includes(value) || HIDDEN_VIEW_KEYS.includes(value)) ? value : DEFAULT_ADMIN_VIEW;
}

function isCustomerUserRow(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (role === 'customer') return true;
  if (role && role !== 'customer') return false;
  const roleId = Number(row?.role_id);
  if (roleId !== 2) return false;
  if (row?.seller_id != null) return false;
  if (row?.staff_member_id != null) return false;
  return true;
}

function customerCellValue(value, fallback = "Ma'lumot kelmagan") {
  const out = String(value || '').trim();
  return out || fallback;
}

function sellerModerationNeedsApprove(st) {
  const s = String(st ?? '').trim().toLowerCase();
  return !s || s === 'pending';
}

/** Reklama slaydi — bosilganda mijoz qaysi sahifaga o‘tadi */
const AD_SLIDE_PAGE_OPTIONS = [
  { value: '', label: 'Havola yo‘q' },
  { value: '/', label: 'Bosh sahifa' },
  { value: '/products', label: 'Mahsulotlar katalogi' },
  { value: '/aksiya', label: 'Aksiyalar' },
  { value: '/cart', label: 'Savat' },
  { value: '/checkout', label: 'Buyurtmani rasmiylashtirish' },
  { value: '/login', label: 'Kirish' },
  { value: '/register', label: 'Ro‘yxatdan o‘tish' },
  { value: '/orders', label: 'Mening buyurtmalarim' },
];

function adSlideLinkPathFromStored(linkUrl) {
  const s = String(linkUrl || '').trim();
  if (!s || !s.startsWith('/')) return '';
  if (s.includes('//') || s.includes('..')) return '';
  return s;
}

function adSlideLinkLabel(path) {
  if (!path) return '';
  const f = AD_SLIDE_PAGE_OPTIONS.find((o) => o.value === path);
  return f ? f.label : path;
}

function adSlideYoutubeVideoId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?/#]+)/i);
  return m ? m[1] : null;
}

const AD_SLIDE_SLOT_COUNT = 5;
const AD_SLIDE_SLOT_INDEXES = [0, 1, 2, 3, 4];

/** Belgilangan slotlardan eng kichik indeks — forma va rasm ko‘rinishi shu slaydga bog‘lanadi */
function primaryAdSlideSlotIndex(selectedFlags) {
  const found = AD_SLIDE_SLOT_INDEXES.find((i) => selectedFlags[i]);
  return found === undefined ? null : found;
}

/** Yangi yaratilgan slaydni tartibda `targetIndex` o‘rniga siljitish */
async function moveAdSlideToSlotIndex(request, slideId, targetIndex, initialSlides) {
  let slides = Array.isArray(initialSlides) ? [...initialSlides] : [];
  const maxOps = Math.max(slides.length + 2, 8) * 2;
  let ops = 0;
  while (ops < maxOps) {
    const idx = slides.findIndex((s) => s.id === slideId);
    if (idx < 0) break;
    if (idx === targetIndex) break;
    const direction = idx > targetIndex ? 'up' : 'down';
    const res = await request(`/admin/portal/ad-slides/${slideId}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) break;
    const d = await res.json().catch(() => ({}));
    if (!Array.isArray(d.slides)) break;
    slides = d.slides;
    ops += 1;
  }
  return slides;
}

/** Mahsulot statusi (API qiymati inglizcha, foydalanuvchiga o‘zbekcha) */
const PRODUCT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Tasdiqlanish kutilmoqda' },
  { value: 'active', label: 'Sotuvda' },
  { value: 'approved', label: 'Tasdiqlangan' },
  { value: 'scheduled', label: 'Sotuvga rejalashtirilgan' },
];

function productStatusLabelUz(st) {
  const k = String(st ?? '').trim().toLowerCase();
  if (!k) return 'Tasdiqlanish kutilmoqda';
  const found = PRODUCT_STATUS_OPTIONS.find((o) => o.value === k);
  return found ? found.label : String(st);
}

const SELLER_MOD_FILTER_OPTIONS = [
  { value: 'all', label: 'Barchasi' },
  { value: 'pending', label: 'Tasdiqlash kutilmoqda' },
  { value: 'active', label: 'Sotuvda' },
  { value: 'other', label: 'Boshqa holat' },
];

/** Umumiy filtr/select — admin-filter-dropdown stillari */
function AdminOptionsDropdown({ options, value, onChange, ariaLabel, placeholder = 'Tanlang', variant = 'default', disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const current = options.find((o) => o.value === value);
  const label = current ? current.label : placeholder;
  const variantClass = variant === 'table-cell' ? ' admin-filter-dropdown--cell' : '';

  return (
    <div className={`admin-filter-dropdown${variantClass} ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="admin-filter-dropdown-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        <span className="admin-filter-dropdown-label">{label}</span>
        <i className="fas fa-chevron-down admin-filter-dropdown-chevron" aria-hidden />
      </button>
      <ul className="admin-filter-dropdown-menu" role="listbox" aria-hidden={!open}>
        {options.map((o) => (
          <li key={String(o.value)} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={o.value === value ? 'is-selected' : ''}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminModerationFilterDropdown({ value, onChange }) {
  return (
    <AdminOptionsDropdown
      options={SELLER_MOD_FILTER_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Mahsulotlar filtri"
      placeholder={SELLER_MOD_FILTER_OPTIONS[0]?.label}
    />
  );
}

/** Operator / packer / picker jadvalida Saqlash va O‘chirish — bitta dropdown */
function StaffRowActionsMenu({ onSave, onDelete, saveBusy, deleteBusy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (saveBusy || deleteBusy) setOpen(false);
  }, [saveBusy, deleteBusy]);

  const disabled = saveBusy || deleteBusy;

  return (
    <div className={`admin-filter-dropdown admin-staff-row-actions ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="admin-filter-dropdown-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Amallar"
      >
        <span className="admin-filter-dropdown-label">Amallar</span>
        <i className="fas fa-chevron-down admin-filter-dropdown-chevron" aria-hidden />
      </button>
      <ul className="admin-filter-dropdown-menu" role="menu">
        <li role="presentation">
          <button type="button" role="menuitem" disabled={saveBusy} onClick={() => { onSave(); setOpen(false); }}>
            Saqlash
          </button>
        </li>
        <li role="presentation">
          <button type="button" role="menuitem" className="admin-staff-menu-danger" disabled={deleteBusy} onClick={() => { onDelete(); setOpen(false); }}>
            O&apos;chirish
          </button>
        </li>
      </ul>
    </div>
  );
}

function matchesStaffSimpleSearch(row, debouncedRaw) {
  const raw = String(debouncedRaw || '').trim();
  if (!raw) return false;
  const q = raw.toLowerCase();
  const qDigits = raw.replace(/\D/g, '');
  const name = String(row.full_name || '').toLowerCase();
  const login = String(row.login || '').toLowerCase();
  const email = String(row.email || '').toLowerCase();
  const phoneD = String(row.phone || '').replace(/\D/g, '');
  if (String(row.id) === raw) return true;
  if (name.includes(q)) return true;
  if (login.includes(q)) return true;
  if (email.includes(q)) return true;
  if (qDigits.length >= 2 && phoneD.includes(qDigits)) return true;
  return false;
}

function AdminStaffSimpleTable({ rows, busyKey, staffDrafts, setStaffDrafts, handleSaveStaff, handleDeleteStaff }) {
  return (
    <div className="table-wrap admin-staff-table-wrap admin-staff-simple-results">
      <table className="neo-table admin-staff-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>F.I.Sh</th>
            <th>Login</th>
            <th>Telefon</th>
            <th>Zakaz</th>
            <th>Amal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const draft = staffDrafts[row.id] || {
              full_name: row.full_name || '',
              phone: row.phone || '',
              status: row.status || 'active',
              region_id: row.region_id || '',
              orders_handled: row.orders_handled ?? 0,
              rating: row.rating ?? 5,
            };
            const saveBusy = busyKey === `staff-save-${row.id}`;
            const deleteBusy = busyKey === `staff-delete-${row.id}`;
            return (
              <tr key={row.id}>
                <td className="admin-staff-col-id">{row.id}</td>
                <td>
                  <input
                    className="neo-input admin-staff-cell-input"
                    value={draft.full_name}
                    onChange={(e) => setStaffDrafts((p) => ({ ...p, [row.id]: { ...draft, full_name: e.target.value } }))}
                  />
                </td>
                <td className="admin-staff-col-login">
                  <code className="admin-staff-login-code">{row.login || '—'}</code>
                </td>
                <td>
                  <input
                    className="neo-input admin-staff-cell-input"
                    value={draft.phone}
                    onChange={(e) => setStaffDrafts((p) => ({ ...p, [row.id]: { ...draft, phone: e.target.value } }))}
                  />
                </td>
                <td className="admin-staff-col-zakaz">
                  <input
                    className="neo-input admin-staff-cell-input admin-staff-input-zakaz"
                    type="number"
                    min="0"
                    value={draft.orders_handled}
                    onChange={(e) => setStaffDrafts((p) => ({ ...p, [row.id]: { ...draft, orders_handled: e.target.value } }))}
                  />
                </td>
                <td className="admin-staff-col-amal">
                  <StaffRowActionsMenu
                    onSave={() => handleSaveStaff(row.id)}
                    onDelete={() => handleDeleteStaff(row.id)}
                    saveBusy={saveBusy}
                    deleteBusy={deleteBusy}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg'];
const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'processing', label: 'Jarayonda' },
  { value: 'on_the_way', label: "Yo'lda" },
  { value: 'delivery', label: 'Yetkazilmoqda' },
  { value: 'completed', label: 'Yakunlangan' },
  { value: 'delivered', label: 'Yetkazildi' },
  { value: 'hold', label: 'Hold' },
  { value: 'cancelled', label: 'Atkaz' },
  { value: 'archived', label: 'Arxiv' },
];

const ORDER_FILTER_OPTIONS = [{ value: 'all', label: 'Barchasi' }, ...ORDER_STATUS_OPTIONS];

/** Tez ustun: faqat yetkazilmoqda / yo‘lda */
const ORDER_TEZ_OPTIONS = [
  { value: 'on_the_way', label: "Yo'lda" },
  { value: 'delivery', label: 'Yetkazilmoqda' },
];
const STAFF_TYPES = ['courier', 'operator', 'packer', 'picker'];
const STAFF_LABELS = {
  courier: 'Kuryerlar',
  operator: 'Operatorlar',
  packer: 'Packerlar',
  picker: 'Pickerlar',
};
const STAFF_VIEW_TO_TYPE = {
  couriers: 'courier',
  operators: 'operator',
  packers: 'packer',
  pickers: 'picker',
};
const ROLE_PERMISSIONS = [
  { value: 'view', label: 'Tekshirish' },
  { value: 'block', label: 'Bloklash' },
  { value: 'activate', label: 'Aktiv qilish' },
  { value: 'assign_role', label: 'Rol tayinlash' },
  { value: 'accounting', label: 'Buxgalteriya' },
  { value: 'check_operators', label: 'Operatorlarni tekshirish' },
  { value: 'promotions', label: 'Aksiyalar' },
  { value: 'orders', label: 'Zakazlar' },
  { value: 'hold_cancel', label: 'Hold/Atkaz' },
];

/** Login orqali qaysi ishchi panel ochilishini backend bilan moslashtirish (work_roles.portal_role). */
const ROLE_PORTAL_OPTIONS = [
  { value: '', label: 'Avto (nom/vazifa/izoh bo\'yicha)' },
  { value: 'seller', label: 'Seller paneli' },
  { value: 'courier', label: 'Kuryer paneli' },
  { value: 'operator', label: 'Operator paneli' },
  { value: 'picker', label: 'Picker (yig\'uvchi)' },
  { value: 'packer', label: 'Packer paneli' },
  { value: 'expeditor', label: 'Ekspeditor paneli' },
  { value: 'order_receiver', label: 'Buyurtma qabul qiluvchi (/qabul)' },
];

function workPortalRoleLabel(key) {
  if (key == null || key === '') return 'Avto';
  const opt = ROLE_PORTAL_OPTIONS.find((o) => o.value === key);
  return opt ? opt.label : String(key);
}
const EMPTY_ORDER_STATS = {
  pending: 0,
  processing: 0,
  delivery: 0,
  on_the_way: 0,
  completed: 0,
  delivered: 0,
  hold: 0,
  cancelled: 0,
  archived: 0,
  total: 0,
};

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatDate(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

function makeRoleForm() {
  return {
    role_name: '',
    login: '',
    password: '12345',
    confirmPassword: '12345',
    phone: '+998901234567',
    email: 'user@myshop.uz',
    task: '',
    description: '',
    portal_role: 'operator',
    courier_viloyat_id: '',
    courier_tuman_ids: [],
    permissions: [],
  };
}

function makeStaffForm(staffType) {
  return {
    staff_type: staffType,
    full_name: '',
    phone: '',
    status: 'active',
    region_id: '',
  };
}

function normalizeLogin(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

function statusLabel(status) {
  const found = ORDER_STATUS_OPTIONS.find((item) => item.value === status);
  return found ? found.label : status || '-';
}

function badgeValue(item, stats, usersCount, pendingWithdrawalsCount) {
  if (!stats && pendingWithdrawalsCount == null) return null;
  if (item.badgeKey === 'users') return usersCount || (stats && stats.users) || 0;
  if (item.badgeKey === 'orders') return stats?.orders ?? 0;
  if (item.badgeKey === 'pending') return Math.max(0, Math.round((stats?.orders || 0) * 0.14));
  if (item.badgeKey === 'atkaz') return Math.max(0, Math.round((stats?.orders || 0) * 0.06));
  if (item.badgeKey === 'pendingWithdrawals') return pendingWithdrawalsCount ?? 0;
  if (item.badgeKey === 'pendingSellerProducts') {
    const n = Number(stats?.pendingSellerProducts) || 0;
    return n > 0 ? n : null;
  }
  return null;
}

function StatCard({ icon, tone, label, value, trend, negative = false }) {
  return (
    <div className="stat-card-neo">
      <div className={`stat-icon-neo ${tone}`}>
        <i className={`fas ${icon}`} />
      </div>
      <div className="stat-content-neo">
        <span className="stat-label-neo">{label}</span>
        <h3 className="stat-value-neo">{value}</h3>
        <span className={`stat-trend-neo ${negative ? 'negative' : 'positive'}`}>
          <i className={`fas ${negative ? 'fa-arrow-down' : 'fa-arrow-up'}`} /> {trend}
        </span>
      </div>
    </div>
  );
}

function AdminAiOperatorFeedTable({ events, emptyLabel, resolveFeedAudio }) {
  if (!events.length) {
    return <p className="muted" style={{ margin: 0 }}>{emptyLabel}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="neo-table">
        <thead>
          <tr>
            <th>Manba</th>
            <th>Zakaz</th>
            <th>Telefon</th>
            <th>Mijoz</th>
            <th>Event</th>
            <th>Vaqt</th>
            <th>Oldindan ko‘rish</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const feedAudio = e.source === 'ai_call' && resolveFeedAudio ? resolveFeedAudio(e) : null;
            return (
              <tr key={`${e.source}-${e.source_id}`}>
                <td>{e.source}</td>
                <td>{e.order_id != null ? `#${e.order_id}` : '—'}</td>
                <td>{e.phone || '—'}</td>
                <td>{e.customer_full_name || '—'}</td>
                <td>{e.event_type || '—'}</td>
                <td>{e.created_at ? formatDateTimeUz(e.created_at, { empty: '-' }) : '-'}</td>
                <td style={{ maxWidth: 520 }}>
                  <span className="muted">{e.preview || '—'}</span>
                  {feedAudio ? (
                    <div style={{ marginTop: 8 }}>
                      <audio controls preload="none" src={feedAudio} style={{ width: '100%' }} />
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Meta token va reklama akkaunti ID — qisqa texnik qo‘llanma (forma + modal) */
function AdminMetaConnectionHowto({ inModal = false, showHeading = true }) {
  const wrapClass = inModal ? 'admin-meta-howto admin-meta-howto--modal' : 'admin-meta-howto';
  return (
    <div className={wrapClass} id={inModal ? 'ai-target-meta-howto-modal' : undefined}>
      {showHeading ? (
        <h4 className="admin-meta-howto-title">
          <i className="fas fa-plug" aria-hidden />
          Token va reklama akkaunti ID — qanday olaman?
        </h4>
      ) : null}
      <p className="admin-meta-howto-lead">
        Bu yerda <strong>ikkita</strong> narsa kerak: (1) reklama akkauntining raqamli ID si — Pixel ID emas; (2) Graph API <strong>access token</strong> — kampaniyalarni o‘qish uchun odatda{' '}
        <code className="admin-ai-target-code">ads_read</code> ruxsati.
      </p>
      <ol className="admin-meta-howto-steps">
        <li>
          <strong>Reklama akkaunti ID.</strong> Meta Business ichida:{' '}
          <a href="https://business.facebook.com/latest/settings/ad_accounts" target="_blank" rel="noopener noreferrer">
            Reklama akkauntlari
          </a>
          {' '}→ kerakli akkauntni tanlang → <strong>Reklama akkaunti ID</strong> (ko‘pincha uzun raqam, ba&apos;zan <code className="admin-ai-target-code">act_…</code> ko‘rinishida). Shu raqamni yoki <code className="admin-ai-target-code">act_</code>siz nusxalang — tizim ikkala formatni ham qabul qiladi.
        </li>
        <li>
          <strong>Ilova.</strong>{' '}
          <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">
            developers.facebook.com/apps
          </a>
          {' '}da o‘z ilovangiz bo‘lsin. Agar yo‘q bo‘lsa — yarating.{' '}
          <strong>Marketing API</strong> ulangan bo‘lishi kerak (ilova sozlamalarida «Marketing API» yoki tegishli mahsulot).
        </li>
        <li>
          <strong>Token.</strong>{' '}
          <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">
            Graph API Explorer
          </a>
          ni oching. Yuqoridan <strong>o‘z ilovangizni</strong> tanlang → «Generate Access Token» / «Get User Access Token» → ruxsatlar ro‘yxatidan{' '}
          <code className="admin-ai-target-code">ads_read</code> ni yoqing (keyinroq reklamani tahrirlash kerak bo‘lsa —{' '}
          <code className="admin-ai-target-code">ads_management</code>
          ). Token generatsiya qilinganda matnni nusxalab, yuqoridagi «Graph API access token» maydoniga yopishtiring.
        </li>
        <li>
          <strong>Saqlash va tekshirish.</strong> «Ulanish ma’lumotlarini saqlash» tugmasini bosing, keyin «Kampaniyalarni Meta dan yuklash». Agar xato chiqsa — odatda token muddati tugagan, ilova reklama akkauntiga ulanmagan yoki <code className="admin-ai-target-code">ads_read</code> berilmagan.
        </li>
      </ol>
      <p className="admin-meta-howto-note">
        <strong>Qisqa token:</strong> Explorer dagi token ba&apos;zan bir necha soatdan keyin tugaydi. Doimiy ishlatish uchun Meta hujjatlarida «long-lived user access token» yoki Business sozlamalarida System User token sozlang — lekin birinchi sinov uchun Explorer yetadi.
      </p>
      {!inModal ? (
        <p className="admin-meta-howto-note admin-meta-howto-note--muted">
          To‘liq strategiya matni: yuqoridagi <strong>QO‘LLANMA</strong> tugmasi.
        </p>
      ) : null}
    </div>
  );
}

/** AI Target — to‘liq qo‘llanma / prompt (modal ichida) */
function AdminAiTargetGuideBody() {
  return (
    <div className="admin-ai-target-prompt admin-ai-target-prompt--modal" aria-label="AI marketing direktori qo‘llanmasi">
      <AdminMetaConnectionHowto inModal />

      <p className="admin-ai-target-prompt-intro admin-ai-target-prompt-intro--modal">
        Siz MyShop uchun katta e-tijorat platformasining yuqori darajadagi AI marketing direktorisiz. Meta reklamalarini to‘liq boshqarasiz va
        optimallashtirasiz. Avtonom ishlaysiz, lekin Super Admin nazorati ostida.
      </p>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Missiya</h6>
        <p>Foyda, konversiya va samaradorlikni maksimal darajada oshirish; ortiqcha byudjet sarfiga yo‘l qo‘ymaslik.</p>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Asosiy vazifalar</h6>
        <ol className="admin-ai-target-prompt-ol">
          <li>Kirish ma’lumotlarni tahlil qilish: buyurtmalar, mahsulotlar, hudud (viloyatlar), mijoz xatti-harakati.</li>
          <li>Imkoniyatlarni aniqlash: talab yuqori mahsulotlar, trenddagi regionlar, qayta sotib oluvchilar.</li>
          <li>Samarali reklama kampaniyalari yaratish.</li>
          <li>Kampaniyalarni real vaqtga yaqin ravishda doimiy optimallashtirish.</li>
          <li>Byudjetni himoya qilish va zararni oldini olish.</li>
        </ol>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Kampaniya yaratish (har bir tanlangan mahsulot)</h6>
        <p className="admin-ai-target-prompt-kicker">Auditoriya</p>
        <ul className="admin-ai-target-prompt-ul">
          <li>Joylashuv — O‘zbekiston viloyatlari</li>
          <li>Yosh oralig‘i</li>
          <li>Qiziqishlar</li>
          <li>Xulq-atvor</li>
        </ul>
        <p className="admin-ai-target-prompt-kicker">Generatsiya</p>
        <ul className="admin-ai-target-prompt-ul">
          <li>Qisqa, zarbador sarlavha</li>
          <li>Reklama matni — o‘zbekcha, tabiiy, ishontiruvchi</li>
          <li>CTA (harakatga chaqiriq)</li>
        </ul>
        <div className="admin-ai-target-prompt-example">
          <span className="admin-ai-target-prompt-example-label">Namuna</span>
          <p>«MyShop — tez yetkazib berish!» · «Bugun buyurtma bering!»</p>
        </div>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Aqlli qarorlar</h6>
        <ul className="admin-ai-target-prompt-ul">
          <li>Yuqori natija → byudjetni muvozanatli oshirish</li>
          <li>Past natija → kampaniyani pauza qilish</li>
          <li>O‘rta natija → variantlarni sinash (A/B)</li>
        </ul>
        <p>Doimiy A/B test: turli matnlar va turli auditoriyalar.</p>
      </section>

      <section className="admin-ai-target-prompt-section admin-ai-target-prompt-section--highlight">
        <h6 className="admin-ai-target-prompt-h">Super Admin nazorati</h6>
        <p>
          Har qanday kampaniyani ishga tushirishdan oldin so‘rash kerak: <strong>«Ushbu mahsulot uchun targetni ishga tushiraymi?»</strong>
        </p>
        <p>Tasdiq bo‘lmaguncha kutish. Super Admin ni chetlab o‘tmaslik.</p>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Byudjet nazorati</h6>
        <ul className="admin-ai-target-prompt-ul">
          <li>Kunlik limitlarni qat’iy hurmat qilish</li>
          <li>Umumiy byudjetdan oshib ketmaslik</li>
          <li>Limit yaqinlashganda kampaniyalarni sekinlashtirish</li>
        </ul>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Ogohlantirishlar (Super Adminga darhol)</h6>
        <ul className="admin-ai-target-prompt-ul">
          <li>Byudjet limiti oshib ketgan yoki xavfli yaqinlashgan</li>
          <li>Reklama samaradorligi keskin pasaygan</li>
          <li>Kampaniya foyda bermayapti</li>
          <li>Shubhali faollik</li>
        </ul>
        <div className="admin-ai-target-prompt-example admin-ai-target-prompt-example--alert">
          <span className="admin-ai-target-prompt-example-label">Namuna</span>
          <p>Diqqat: Reklama foyda bermayapti, to‘xtatishni tavsiya qilaman.</p>
        </div>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Muloqot uslubi</h6>
        <ul className="admin-ai-target-prompt-ul">
          <li>O‘zbek lotin alifbosi</li>
          <li>Aniq, qisqa, to‘g‘ridan-to‘g‘ri</li>
          <li>Ortiqcha texnik jargon yo‘q</li>
        </ul>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Chiqish formati (hisobot)</h6>
        <pre className="admin-ai-target-prompt-format" tabIndex={0}>
{`Product: [nomi]
Region: [maqsad viloyat]
Audience: [tafsilot]
Budget: [summa]
Ad Text: [o‘zbekcha matn]
Status: [Pending / Active / Paused]`}
        </pre>
      </section>

      <section className="admin-ai-target-prompt-section">
        <h6 className="admin-ai-target-prompt-h">Qat’iy qoidalar</h6>
        <ul className="admin-ai-target-prompt-ul">
          <li>Byudjetni behuda sarf qilmaslik</li>
          <li>Tasdiqsiz ishga tushirmaslik</li>
          <li>Doimiy optimallashtirish</li>
          <li>Aniq hisobot berish</li>
          <li>Foydaga fokus</li>
        </ul>
      </section>

      <section className="admin-ai-target-prompt-section admin-ai-target-prompt-section--final">
        <h6 className="admin-ai-target-prompt-h">Yakun</h6>
        <p>Oddiy yordamchi emassiz — MyShop o‘sishi va daromadiga mas’ul strategik AI marketing direktorisiz.</p>
      </section>
    </div>
  );
}

export default function AdminDashboard() {
  const { request, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSuperuser = user?.role === 'superuser' || user?.role_id === 1;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const darkMode = theme === 'dark';
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState(() => normalizeAdminView(searchParams.get('view')));

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);

  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState(EMPTY_ORDER_STATS);
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerPasswordDrafts, setCustomerPasswordDrafts] = useState({});
  const [customerPasswordVisible, setCustomerPasswordVisible] = useState({});
  const [customerOldPasswordsOpen, setCustomerOldPasswordsOpen] = useState({});
  const [aiCalls, setAiCalls] = useState([]);
  const [pendingAiOrders, setPendingAiOrders] = useState([]);
  const [customerConversationEvents, setCustomerConversationEvents] = useState([]);
  const [aiOperatorMainTab, setAiOperatorMainTab] = useState('audio');
  const [aiOperatorAudioSubTab, setAiOperatorAudioSubTab] = useState('ai');
  const [aiOperatorSmsSubTab, setAiOperatorSmsSubTab] = useState('mijoz');
  const [aiOperatorJalobaSubTab, setAiOperatorJalobaSubTab] = useState('mijoz');
  /** null = uchta asosiy tab; aks holda shu bo‘limning ikki ustunli spliti */
  const [aiOperatorExpanded, setAiOperatorExpanded] = useState(null);

  const [staff, setStaff] = useState([]);
  const [staffForms, setStaffForms] = useState({
    courier: makeStaffForm('courier'),
    operator: makeStaffForm('operator'),
    packer: makeStaffForm('packer'),
    picker: makeStaffForm('picker'),
  });
  const [staffFilters, setStaffFilters] = useState({
    courier: { search: '', status: 'all' },
    operator: { search: '', status: 'all' },
    packer: { search: '', status: 'all' },
    picker: { search: '', status: 'all' },
  });
  const [staffDrafts, setStaffDrafts] = useState({});

  const [regions, setRegions] = useState([]);
  const [regionForm, setRegionForm] = useState({ name: '', delivery_fee: '25000', active: true });
  const [regionDrafts, setRegionDrafts] = useState({});

  const [sellers, setSellers] = useState([]);
  const [sellerFilter, setSellerFilter] = useState({ search: '', status: 'all' });
  const [sellerSearchQuery, setSellerSearchQuery] = useState('');
  const [sellerSearchResults, setSellerSearchResults] = useState([]);
  const [sellerLookup, setSellerLookup] = useState(null);
  const [sellerLookupLoading, setSellerLookupLoading] = useState(false);
  const [sellerProductsList, setSellerProductsList] = useState([]);
  const [sellerProductsLoading, setSellerProductsLoading] = useState(false);
  const [sellerProductsSellerName, setSellerProductsSellerName] = useState('');
  const [sellerForm, setSellerForm] = useState({
    name: '',
    contact_phone: '',
    email: '',
    password: 'Seller123!',
    region_id: '',
    status: 'active',
    balance: '0',
  });
  const [sellerDrafts, setSellerDrafts] = useState({});

  const [accounting, setAccounting] = useState(null);
  const [accountingGlobal, setAccountingGlobal] = useState(null);
  const [accountingSearchInput, setAccountingSearchInput] = useState('');
  const [accountingSearchDebounced, setAccountingSearchDebounced] = useState('');
  const [contestOperatorActive, setContestOperatorActive] = useState(false);
  const [contestCourierActive, setContestCourierActive] = useState(false);
  const [contestOperatorResults, setContestOperatorResults] = useState({ active: false, period: 'day', topByOrdersCreated: [], topByOrdersDelivered: [] });
  const [contestOperatorPeriod, setContestOperatorPeriod] = useState('day');
  const [contestCourierResults, setContestCourierResults] = useState({ active: false, period: 'day', topByDelivered: [] });
  const [contestCourierPeriod, setContestCourierPeriod] = useState('day');
  const [contestNotifyDate, setContestNotifyDate] = useState(() => todayIsoDateInUzbekistan());
  const [contestNotifyTime, setContestNotifyTime] = useState('12:00');
  const [contestNotifyFor, setContestNotifyFor] = useState('courier');
  const [contestNotifyMessage, setContestNotifyMessage] = useState('');
  const [contestNotifySending, setContestNotifySending] = useState(false);
  const [contestNotifyDone, setContestNotifyDone] = useState(null);

  const [workRoles, setWorkRoles] = useState([]);
  const [trashRoles, setTrashRoles] = useState([]);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [roleForm, setRoleForm] = useState(makeRoleForm());
  const [showRoleFormPassword, setShowRoleFormPassword] = useState(false);
  const [roleSearchInput, setRoleSearchInput] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('');
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [trashModalOpen, setTrashModalOpen] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreRole, setRestoreRole] = useState(null);
  const [restoreRoleId, setRestoreRoleId] = useState(null);
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [roleActionAmount, setRoleActionAmount] = useState('50000');
  const [rolePortalDraft, setRolePortalDraft] = useState('');
  const [roleCourierViloyatDraft, setRoleCourierViloyatDraft] = useState('');
  const [roleCourierTumanDraft, setRoleCourierTumanDraft] = useState([]);

  const [orderFilter, setOrderFilter] = useState({ search: '', status: 'all' });
  const [busyKey, setBusyKey] = useState('');
  const [promotionDrafts, setPromotionDrafts] = useState({});
  const [promotionMessage, setPromotionMessage] = useState(null);

  const [couriers, setCouriers] = useState([]);
  const [courierSearchQuery, setCourierSearchQuery] = useState('');
  const [operatorSearchInput, setOperatorSearchInput] = useState('');
  const [operatorSearchDebounced, setOperatorSearchDebounced] = useState('');
  const [packerSearchInput, setPackerSearchInput] = useState('');
  const [packerSearchDebounced, setPackerSearchDebounced] = useState('');
  const [pickerSearchInput, setPickerSearchInput] = useState('');
  const [pickerSearchDebounced, setPickerSearchDebounced] = useState('');
  const [courierEditId, setCourierEditId] = useState(null);
  const [courierEditDraft, setCourierEditDraft] = useState({ login: '', password: '' });
  const [courierFee, setCourierFee] = useState(25000);

  const [pendingWithdrawalsCount, setPendingWithdrawalsCount] = useState(0);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [withdrawalRequestsLoading, setWithdrawalRequestsLoading] = useState(false);
  const [withdrawalNote, setWithdrawalNote] = useState({});
  const [withdrawalActionBusy, setWithdrawalActionBusy] = useState(null);

  const [adminNotifications, setAdminNotifications] = useState([]);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const [adminNotifyApproveBusy, setAdminNotifyApproveBusy] = useState(null);

  const [sellerModerationList, setSellerModerationList] = useState([]);
  const [sellerModerationLoading, setSellerModerationLoading] = useState(false);
  const [sellerModFilter, setSellerModFilter] = useState('all');
  const [sellerProductEdit, setSellerProductEdit] = useState(null);

  const [adSlides, setAdSlides] = useState([]);
  const [adSlidesLoading, setAdSlidesLoading] = useState(false);
  const [adSlideBusy, setAdSlideBusy] = useState(null);
  /** Har bir slot (0–4) uchun alohida belgilash — bir vaqtning o‘zida bir nechtasi */
  const [adSlideSlotSelected, setAdSlideSlotSelected] = useState(() => [true, false, false, false, false]);
  /** 6+ slayd: ro‘yxatdan tahrirlash — slot checkboxlari bilan bog‘lanmagan */
  const [adSlideFormDetached, setAdSlideFormDetached] = useState(false);
  const [adSlideEditingId, setAdSlideEditingId] = useState(null);
  const [adSlideForm, setAdSlideForm] = useState({
    title: '',
    subtitle: '',
    link_path: '',
    image_url: '',
    video_url: '',
    active: true,
  });
  const [adSlideRemoveImage, setAdSlideRemoveImage] = useState(false);

  const [metaAdsSettings, setMetaAdsSettings] = useState({
    connected: false,
    ad_account_id: '',
    pixel_id: '',
    daily_budget_uzs: '',
    note: '',
    active_campaigns: 0,
    pending_approval: 0,
    updated_at: null,
    access_token_configured: false,
  });
  const [metaAccessTokenDraft, setMetaAccessTokenDraft] = useState('');
  const [metaAdsLoading, setMetaAdsLoading] = useState(false);
  const [metaAdsSaving, setMetaAdsSaving] = useState(false);
  const [metaAdsMessage, setMetaAdsMessage] = useState('');
  const [metaCampaigns, setMetaCampaigns] = useState([]);
  const [metaCampaignsLoading, setMetaCampaignsLoading] = useState(false);
  const [metaCampaignsMessage, setMetaCampaignsMessage] = useState('');
  const [metaApiCampaignStats, setMetaApiCampaignStats] = useState(null);
  const [aiTargetGuideOpen, setAiTargetGuideOpen] = useState(false);

  const adSlideSlotFileInputRefs = useRef({});
  const adSlideSlotVideoInputRefs = useRef({});
  const adSlideSlotSelectedRef = useRef(adSlideSlotSelected);
  adSlideSlotSelectedRef.current = adSlideSlotSelected;

  const ensureOk = async (res, fallback) => {
    if (res.ok) return res.json();
    let message = fallback;
    try {
      const d = await res.json();
      if (d?.error) message = d.error;
    } catch {}
    throw new Error(message);
  };

  const loadData = async (withLoader = true) => {
    if (withLoader) setLoading(true);
    setError('');
    try {
      const [
        statsData,
        usersData,
        productsData,
        ordersData,
        orderStatsData,
        staffData,
        regionsData,
        sellersData,
        accountingData,
        rolesData,
        trashData,
        _contest,
        _couriers,
        _courierFee,
        _withdrawals,
        _adminNotif,
      ] = await Promise.all([
        request('/admin/stats').then((r) => ensureOk(r, 'Statistika yuklanmadi')),
        request('/admin/users').then((r) => ensureOk(r, 'Foydalanuvchilar yuklanmadi')),
        request('/products').then((r) => ensureOk(r, 'Mahsulotlar yuklanmadi')),
        request('/admin/portal/orders').then((r) => ensureOk(r, 'Zakazlar yuklanmadi')),
        request('/admin/portal/orders/stats').then((r) => ensureOk(r, 'Zakazlar statistikasi yuklanmadi')),
        request('/admin/portal/staff').then((r) => ensureOk(r, 'Staff ma\'lumotlari yuklanmadi')),
        request('/admin/portal/regions').then((r) => ensureOk(r, 'Viloyatlar yuklanmadi')),
        request('/admin/portal/sellers').then((r) => ensureOk(r, 'Sellerlar yuklanmadi')),
        request('/admin/portal/accounting').then((r) => ensureOk(r, 'Buxgalteriya ma\'lumotlari yuklanmadi')),
        request('/admin/portal/work-roles').then((r) => ensureOk(r, 'Ishchi rollar yuklanmadi')),
        request('/admin/portal/work-roles/trash').then((r) => ensureOk(r, 'O\'chirilgan rollar yuklanmadi')),
        request('/admin/portal/contest').then((r) => (r.ok ? r.json() : {})).then((d) => { setContestOperatorActive(!!d.operatorActive); setContestCourierActive(!!d.courierActive); return null; }),
        request('/admin/couriers').then((r) => (r.ok ? r.json() : { couriers: [] })).then((d) => { setCouriers(d.couriers || []); return null; }),
        request('/admin/courier-fee').then((r) => (r.ok ? r.json() : {})).then((d) => { if (d?.courier_fee_per_order != null) setCourierFee(Number(d.courier_fee_per_order) || 25000); return null; }),
        request('/admin/portal/withdrawal-requests').then((r) => (r.ok ? r.json() : {})).then((d) => { setPendingWithdrawalsCount((d.requests || []).length); return null; }),
        request('/admin/notifications').then((r) => (r.ok ? r.json() : {})).then((d) => { setAdminNotifications(d.notifications || []); return null; }),
      ]);

      setStats(statsData || null);
      setUsers(usersData?.users || []);
      setProducts(productsData?.products || []);

      setOrders(ordersData?.orders || []);
      setOrderStats({ ...EMPTY_ORDER_STATS, ...(orderStatsData || {}) });

      const staffList = staffData?.staff || [];
      setStaff(staffList);
      const nextStaffDrafts = {};
      for (const row of staffList) {
        nextStaffDrafts[row.id] = {
          full_name: row.full_name || '',
          phone: row.phone || '',
          status: row.status || 'active',
          region_id: row.region_id || '',
          orders_handled: row.orders_handled ?? 0,
          rating: row.rating ?? 5,
        };
      }
      setStaffDrafts(nextStaffDrafts);

      const regionList = regionsData?.regions || [];
      setRegions(regionList);
      const nextRegionDrafts = {};
      for (const row of regionList) {
        nextRegionDrafts[row.id] = {
          name: row.name || '',
          delivery_fee: row.delivery_fee ?? 0,
          active: Boolean(row.active),
        };
      }
      setRegionDrafts(nextRegionDrafts);

      const sellerList = sellersData?.sellers || [];
      setSellers(sellerList);
      const nextSellerDrafts = {};
      for (const row of sellerList) {
        nextSellerDrafts[row.id] = {
          name: row.name || '',
          contact_phone: row.contact_phone || '',
          email: row.email || '',
          region_id: row.region_id || '',
          status: row.status || 'active',
          balance: row.balance ?? 0,
        };
      }
      setSellerDrafts(nextSellerDrafts);

      const acc = accountingData || null;
      setAccountingGlobal(acc);
      setAccounting(acc);
      setWorkRoles(rolesData?.roles || []);
      setTrashRoles(trashData?.roles || []);
    } catch (err) {
      setError(err.message || 'Dashboard ma\'lumotlari yuklanmadi');
    } finally {
      if (withLoader) setLoading(false);
    }
  };

  const loadWorkRolesAndTrash = useCallback(async () => {
    try {
      const rolesRes = await request('/admin/portal/work-roles');
      const trashRes = await request('/admin/portal/work-roles/trash');
      if (!rolesRes.ok) throw new Error('Ishchi rollar yuklanmadi');
      if (!trashRes.ok) throw new Error('O\'chirilgan rollar yuklanmadi');
      const rolesData = await rolesRes.json();
      const trashData = await trashRes.json();
      setWorkRoles(rolesData?.roles || []);
      setTrashRoles(trashData?.roles || []);
    } catch (err) {
      setError(err.message || 'Rollar yuklanmadi');
    }
  }, [request]);

  const loadAiOperatorPanel = useCallback(async () => {
    const [callsRes, pendRes, convRes] = await Promise.all([
      request('/admin/ai-calls?limit=200&transcript_detail=1'),
      request('/admin/ai-call/pending-orders'),
      request('/admin/customer-conversations?limit=200'),
    ]);
    const callsData = await ensureOk(callsRes, 'AI qo‘ng‘iroqlar yuklanmadi');
    const pendData = await ensureOk(pendRes, 'Kutilayotgan zakazlar yuklanmadi');
    const convData = await ensureOk(convRes, 'Mijoz suhbatlari yuklanmadi');
    setAiCalls(Array.isArray(callsData.calls) ? callsData.calls : []);
    setPendingAiOrders(Array.isArray(pendData.orders) ? pendData.orders : []);
    setCustomerConversationEvents(Array.isArray(convData.events) ? convData.events : []);
  }, [request]);

  const refreshAiCalls = useCallback(async () => {
    try {
      await loadAiOperatorPanel();
    } catch (err) {
      setError(err.message || 'AI operator ma’lumotlari yuklanmadi');
    }
  }, [loadAiOperatorPanel]);

  const aiRecordingAudioSrc = useCallback((row) => {
    const sid = Number(row?.recordingInternalSample);
    if (sid === 1 || sid === 2) return `/api/admin/ai-call/sample-recording/${sid}`;
    if (row?.recordingUrl) return `/api/admin/ai-call/recording?url=${encodeURIComponent(row.recordingUrl)}`;
    return null;
  }, []);

  const feedRecordingAudioSrc = useCallback((e) => {
    const sid = Number(e?.recording_internal_sample);
    if (sid === 1 || sid === 2) return `/api/admin/ai-call/sample-recording/${sid}`;
    if (e?.recording_url) return `/api/admin/ai-call/recording?url=${encodeURIComponent(e.recording_url)}`;
    return null;
  }, []);

  useEffect(() => {
    if (!user || !isSuperuser) return;
    loadData();
  }, [user, isSuperuser, request]);

  useEffect(() => {
    if (!user || !isSuperuser) return;
    if (activeView !== 'ai_calls') return;
    void refreshAiCalls();
  }, [activeView, user, isSuperuser, refreshAiCalls]);

  useEffect(() => {
    if (activeView !== 'ai_calls') {
      setAiOperatorMainTab('audio');
      setAiOperatorAudioSubTab('ai');
      setAiOperatorSmsSubTab('mijoz');
      setAiOperatorJalobaSubTab('mijoz');
      setAiOperatorExpanded(null);
    }
  }, [activeView]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) {
      document.body.style.overflow = '';
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const t = setTimeout(() => {
      setOperatorSearchDebounced(operatorSearchInput.trim());
      setPackerSearchDebounced(packerSearchInput.trim());
      setPickerSearchDebounced(pickerSearchInput.trim());
      setAccountingSearchDebounced(accountingSearchInput.trim());
    }, 320);
    return () => clearTimeout(t);
  }, [operatorSearchInput, packerSearchInput, pickerSearchInput, accountingSearchInput]);

  useEffect(() => {
    if (activeView !== 'accounting') return undefined;
    const q = accountingSearchDebounced;
    if (!q) {
      setAccounting(accountingGlobal);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await request(`/admin/portal/accounting?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setAccounting(d);
      } catch {
        if (!cancelled) setAccounting(accountingGlobal);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeView, accountingSearchDebounced, accountingGlobal, request]);

  const loadContestOperatorResults = async (period) => {
    try {
      const res = await request(`/admin/portal/contest-operator-results?period=${period || contestOperatorPeriod}`);
      if (res.ok) {
        const d = await res.json();
        setContestOperatorResults({ active: !!d.active, period: d.period || 'day', topByOrdersCreated: d.topByOrdersCreated || [], topByOrdersDelivered: d.topByOrdersDelivered || [] });
      }
    } catch (_) {}
  };
  const loadContestCourierResults = async (period) => {
    try {
      const res = await request(`/admin/portal/contest-courier-results?period=${period || contestCourierPeriod}`);
      if (res.ok) {
        const d = await res.json();
        setContestCourierResults({ active: !!d.active, period: d.period || 'day', topByDelivered: d.topByDelivered || [] });
      }
    } catch (_) {}
  };
  useEffect(() => {
    if (activeView !== 'konkurs') return;
    loadContestOperatorResults(contestOperatorPeriod);
    loadContestCourierResults(contestCourierPeriod);
    const t = setInterval(() => {
      loadContestOperatorResults(contestOperatorPeriod);
      loadContestCourierResults(contestCourierPeriod);
    }, 5000);
    return () => clearInterval(t);
  }, [activeView, contestOperatorPeriod, contestCourierPeriod]);

  useEffect(() => {
    const viewFromUrl = searchParams.get('view');
    const nextView = normalizeAdminView(viewFromUrl ?? '');
    setActiveView((prev) => (prev === nextView ? prev : nextView));
  }, [searchParams]);

  const loadAdminNotifications = useCallback(async () => {
    try {
      const res = await request('/admin/notifications');
      const d = res.ok ? await res.json() : { notifications: [] };
      setAdminNotifications(d.notifications || []);
    } catch (_) {
      setAdminNotifications([]);
    }
  }, [request]);

  const loadWithdrawalRequests = useCallback(async () => {
    setWithdrawalRequestsLoading(true);
    try {
      const res = await request('/admin/portal/withdrawal-requests');
      const d = res.ok ? await res.json() : { requests: [] };
      const list = d.requests || [];
      setWithdrawalRequests(list);
      setPendingWithdrawalsCount(list.length);
    } catch (_) {
      setWithdrawalRequests([]);
    } finally {
      setWithdrawalRequestsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (activeView !== 'withdrawals') return undefined;
    loadWithdrawalRequests();
    return undefined;
  }, [activeView, loadWithdrawalRequests]);

  const loadAdSlides = useCallback(async () => {
    setAdSlidesLoading(true);
    try {
      const res = await request('/admin/portal/ad-slides');
      const d = res.ok ? await res.json() : { slides: [] };
      const list = d.slides || [];
      setAdSlides(list);
      return list;
    } catch {
      setAdSlides([]);
      return [];
    } finally {
      setAdSlidesLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (activeView !== 'reklama') return undefined;
    loadAdSlides();
    return undefined;
  }, [activeView, loadAdSlides]);

  const loadMetaAdsSettings = useCallback(async () => {
    setMetaAdsLoading(true);
    setMetaAdsMessage('');
    try {
      const res = await request('/admin/meta-ads/settings');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Sozlamalar yuklanmadi.');
      setMetaAdsSettings((prev) => ({
        ...prev,
        connected: Boolean(d.connected),
        ad_account_id: String(d.ad_account_id || ''),
        pixel_id: String(d.pixel_id || ''),
        daily_budget_uzs: String(d.daily_budget_uzs || ''),
        note: String(d.note || ''),
        active_campaigns: Math.min(999, Math.max(0, parseInt(String(d.active_campaigns ?? 0), 10) || 0)),
        pending_approval: Math.min(999, Math.max(0, parseInt(String(d.pending_approval ?? 0), 10) || 0)),
        updated_at: d.updated_at || null,
        access_token_configured: Boolean(d.access_token_configured),
      }));
    } catch (e) {
      setMetaAdsMessage(String(e.message || e));
    } finally {
      setMetaAdsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (activeView !== 'ai_target') return undefined;
    void loadMetaAdsSettings();
    return undefined;
  }, [activeView, loadMetaAdsSettings]);

  useEffect(() => {
    if (activeView !== 'ai_target') setAiTargetGuideOpen(false);
  }, [activeView]);

  useEffect(() => {
    if (!aiTargetGuideOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setAiTargetGuideOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [aiTargetGuideOpen]);

  const saveMetaAdsSettings = useCallback(async () => {
    setMetaAdsSaving(true);
    setMetaAdsMessage('');
    try {
      const payload = {
        connected: metaAdsSettings.connected,
        ad_account_id: metaAdsSettings.ad_account_id,
        pixel_id: metaAdsSettings.pixel_id,
        daily_budget_uzs: metaAdsSettings.daily_budget_uzs,
        note: metaAdsSettings.note,
        active_campaigns: metaAdsSettings.active_campaigns,
        pending_approval: metaAdsSettings.pending_approval,
      };
      const tok = metaAccessTokenDraft.trim();
      if (tok) payload.access_token = tok;

      const res = await request('/admin/meta-ads/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Saqlanmadi.');
      const { ok: _ok, ...rest } = d;
      setMetaAdsSettings((prev) => ({ ...prev, ...rest }));
      if (tok) setMetaAccessTokenDraft('');
      setMetaAdsMessage('Saqlandi.');
    } catch (e) {
      setMetaAdsMessage(String(e.message || e));
    } finally {
      setMetaAdsSaving(false);
    }
  }, [request, metaAdsSettings, metaAccessTokenDraft]);

  const clearMetaAccessToken = useCallback(async () => {
    if (!window.confirm('Graph API token serverdan o‘chirilsinmi?')) return;
    setMetaAdsSaving(true);
    setMetaAdsMessage('');
    try {
      const res = await request('/admin/meta-ads/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          connected: metaAdsSettings.connected,
          ad_account_id: metaAdsSettings.ad_account_id,
          pixel_id: metaAdsSettings.pixel_id,
          daily_budget_uzs: metaAdsSettings.daily_budget_uzs,
          note: metaAdsSettings.note,
          active_campaigns: metaAdsSettings.active_campaigns,
          pending_approval: metaAdsSettings.pending_approval,
          access_token: '',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Token olib tashlanmadi.');
      const { ok: _ok, ...rest } = d;
      setMetaAdsSettings((prev) => ({ ...prev, ...rest }));
      setMetaAccessTokenDraft('');
      setMetaCampaigns([]);
      setMetaApiCampaignStats(null);
      setMetaAdsMessage('Token olib tashlandi.');
    } catch (e) {
      setMetaAdsMessage(String(e.message || e));
    } finally {
      setMetaAdsSaving(false);
    }
  }, [request, metaAdsSettings]);

  const loadMetaCampaigns = useCallback(async () => {
    setMetaCampaignsLoading(true);
    setMetaCampaignsMessage('');
    try {
      const res = await request('/admin/meta-ads/campaigns');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Kampaniyalar yuklanmadi.');
      const list = Array.isArray(d.campaigns) ? d.campaigns : [];
      setMetaCampaigns(list);
      const activeN = list.filter((c) => {
        const s = String(c.effective_status || c.status || '').toUpperCase();
        return s === 'ACTIVE';
      }).length;
      setMetaApiCampaignStats({ total: list.length, active: activeN });
    } catch (e) {
      setMetaCampaigns([]);
      setMetaApiCampaignStats(null);
      setMetaCampaignsMessage(String(e.message || e));
    } finally {
      setMetaCampaignsLoading(false);
    }
  }, [request]);

  const applyAdSlideSlotFromList = useCallback((slotIdx, list) => {
    const s = list[slotIdx];
    if (s) {
      setAdSlideEditingId(s.id);
      setAdSlideForm({
        title: s.title || '',
        subtitle: s.subtitle || '',
        link_path: adSlideLinkPathFromStored(s.link_url),
        image_url: s.image_url || '',
        video_url: s.video_url || '',
        active: Boolean(s.active),
      });
    } else {
      setAdSlideEditingId(null);
      setAdSlideForm({ title: '', subtitle: '', link_path: '', image_url: '', video_url: '', active: true });
    }
    setAdSlideRemoveImage(false);
  }, []);

  const resetAdSlideForm = useCallback(
    (slidesOverride) => {
      setAdSlideFormDetached(false);
      const list = slidesOverride ?? adSlides;
      const p = primaryAdSlideSlotIndex(adSlideSlotSelected);
      if (p === null) {
        setAdSlideEditingId(null);
        setAdSlideForm({ title: '', subtitle: '', link_path: '', image_url: '', video_url: '', active: true });
        setAdSlideRemoveImage(false);
        return;
      }
      applyAdSlideSlotFromList(p, list);
    },
    [adSlides, adSlideSlotSelected, applyAdSlideSlotFromList],
  );

  const toggleAdSlideSlotSelected = useCallback((i) => {
    if (adSlideFormDetached) return;
    setAdSlideSlotSelected((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }, [adSlideFormDetached]);

  const adSlideSlotsSig = useMemo(
    () => AD_SLIDE_SLOT_INDEXES.map((i) => adSlides[i]?.id ?? '').join('|'),
    [adSlides],
  );

  useEffect(() => {
    if (activeView !== 'reklama' || adSlidesLoading || adSlideFormDetached) return undefined;
    const p = primaryAdSlideSlotIndex(adSlideSlotSelected);
    if (p === null) {
      setAdSlideEditingId(null);
      setAdSlideForm({ title: '', subtitle: '', link_path: '', image_url: '', video_url: '', active: true });
      setAdSlideRemoveImage(false);
      return undefined;
    }
    applyAdSlideSlotFromList(p, adSlides);
    return undefined;
  }, [activeView, adSlideSlotSelected, adSlidesLoading, adSlideSlotsSig, adSlides, applyAdSlideSlotFromList, adSlideFormDetached]);

  const adSlidePreviewDisplay = adSlideRemoveImage ? null : adSlideForm.image_url || null;
  const adSlidePreviewVideo = (adSlideForm.video_url || '').trim() || null;

  const adSlideSelectedIndices = useMemo(
    () => AD_SLIDE_SLOT_INDEXES.filter((i) => adSlideSlotSelected[i]),
    [adSlideSlotSelected],
  );
  const adSlidePrimaryIdx = useMemo(
    () => primaryAdSlideSlotIndex(adSlideSlotSelected),
    [adSlideSlotSelected],
  );

  const handleAdSlideSlotImagePick = useCallback(
    async (slotIndex, file) => {
      if (!file) return;
      setAdSlideBusy(`slot-img-${slotIndex}`);
      setError('');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const up = await request('/admin/portal/ad-slides/upload', { method: 'POST', body: fd });
        const ud = up.ok ? await up.json().catch(() => ({})) : {};
        if (!up.ok) throw new Error(ud.error || 'Rasm yuklanmadi');
        const imageUrl = String(ud.url || '').trim();
        if (!imageUrl) throw new Error('Rasm URL olinmadi');

        let list = [...adSlides];
        let slideId = list[slotIndex]?.id;

        if (!slideId) {
          const postRes = await request('/admin/portal/ad-slides', {
            method: 'POST',
            body: JSON.stringify({
              title: `Reklama ${slotIndex + 1}`,
              subtitle: '',
              link_url: undefined,
              image_url: imageUrl,
              active: true,
            }),
          });
          const pd = postRes.ok ? await postRes.json().catch(() => ({})) : {};
          if (!postRes.ok) throw new Error(pd.error || 'Slayd yaratilmadi');
          slideId = pd.slide?.id;
          if (!slideId) throw new Error('Slayd ID olinmadi');
          list = await loadAdSlides();
          await moveAdSlideToSlotIndex(request, slideId, slotIndex, list);
          await loadAdSlides();
        } else {
          const patchRes = await request(`/admin/portal/ad-slides/${slideId}`, {
            method: 'PATCH',
            body: JSON.stringify({ image_url: imageUrl }),
          });
          const patchD = patchRes.ok ? await patchRes.json().catch(() => ({})) : {};
          if (!patchRes.ok) throw new Error(patchD.error || 'Rasm saqlanmadi');
          await loadAdSlides();
        }

        const prim = primaryAdSlideSlotIndex(adSlideSlotSelectedRef.current);
        if (prim === slotIndex) {
          setAdSlideForm((p) => ({ ...p, image_url: imageUrl }));
          setAdSlideRemoveImage(false);
          setAdSlideEditingId(slideId);
        }
      } catch (err) {
        setError(err.message || 'Rasm yuklanmadi');
      } finally {
        setAdSlideBusy(null);
        const inp = adSlideSlotFileInputRefs.current[slotIndex];
        if (inp) inp.value = '';
      }
    },
    [request, adSlides, loadAdSlides],
  );

  const handleAdSlideSlotVideoPick = useCallback(
    async (slotIndex, file) => {
      if (!file) return;
      setAdSlideBusy(`slot-vid-${slotIndex}`);
      setError('');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const up = await request('/admin/portal/ad-slides/upload-video', { method: 'POST', body: fd });
        const ud = up.ok ? await up.json().catch(() => ({})) : {};
        if (!up.ok) throw new Error(ud.error || 'Video yuklanmadi');
        const videoUrl = String(ud.url || '').trim();
        if (!videoUrl) throw new Error('Video URL olinmadi');

        let list = [...adSlides];
        let slideId = list[slotIndex]?.id;

        if (!slideId) {
          const postRes = await request('/admin/portal/ad-slides', {
            method: 'POST',
            body: JSON.stringify({
              title: `Reklama ${slotIndex + 1}`,
              subtitle: '',
              link_url: undefined,
              video_url: videoUrl,
              active: true,
            }),
          });
          const pd = postRes.ok ? await postRes.json().catch(() => ({})) : {};
          if (!postRes.ok) throw new Error(pd.error || 'Slayd yaratilmadi');
          slideId = pd.slide?.id;
          if (!slideId) throw new Error('Slayd ID olinmadi');
          list = await loadAdSlides();
          await moveAdSlideToSlotIndex(request, slideId, slotIndex, list);
          await loadAdSlides();
        } else {
          const patchRes = await request(`/admin/portal/ad-slides/${slideId}`, {
            method: 'PATCH',
            body: JSON.stringify({ video_url: videoUrl }),
          });
          const patchD = patchRes.ok ? await patchRes.json().catch(() => ({})) : {};
          if (!patchRes.ok) throw new Error(patchD.error || 'Video saqlanmadi');
          await loadAdSlides();
        }

        const prim = primaryAdSlideSlotIndex(adSlideSlotSelectedRef.current);
        if (prim === slotIndex) {
          setAdSlideForm((p) => ({ ...p, video_url: videoUrl }));
          setAdSlideEditingId(slideId);
        }
      } catch (err) {
        setError(err.message || 'Video yuklanmadi');
      } finally {
        setAdSlideBusy(null);
        const inp = adSlideSlotVideoInputRefs.current[slotIndex];
        if (inp) inp.value = '';
      }
    },
    [request, adSlides, loadAdSlides],
  );

  const handleAdminNotifyApprove = useCallback(async (notif) => {
    if (notif?.link_type !== 'withdrawal' || !notif?.link_id) return;
    setAdminNotifyApproveBusy(notif.id);
    try {
      const res = await request(`/admin/portal/withdrawal-requests/${notif.link_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved', note: '' }),
      });
      if (res.ok) {
        await request(`/admin/notifications/${notif.id}/read`, { method: 'PATCH' });
        await loadAdminNotifications();
        await loadWithdrawalRequests();
      }
    } finally {
      setAdminNotifyApproveBusy(null);
    }
  }, [request, loadAdminNotifications, loadWithdrawalRequests]);

  useEffect(() => {
    if (adminNotificationsOpen) loadAdminNotifications();
  }, [adminNotificationsOpen, loadAdminNotifications]);

  useEffect(() => {
    if (activeView !== 'seller_search') return;
    const q = sellerSearchQuery.trim();
    if (!q) {
      setSellerSearchResults([]);
      setSellerLookup(null);
      return;
    }
    const t = setTimeout(async () => {
      setSellerLookupLoading(true);
      setSellerLookup(null);
      try {
        const res = await request(`/admin/portal/sellers?search=${encodeURIComponent(q)}`);
        const data = res.ok ? await res.json() : { sellers: [] };
        setSellerSearchResults(data.sellers || []);
      } catch (_) {
        setSellerSearchResults([]);
      } finally {
        setSellerLookupLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [activeView, sellerSearchQuery, request]);

  const openSellerDetail = useCallback(async (seller) => {
    if (!seller?.id) return;
    setSellerLookupLoading(true);
    try {
      const res = await request(`/admin/portal/sellers/lookup?q=${encodeURIComponent(seller.id)}`);
      const data = res.ok ? await res.json() : { seller: null };
      setSellerLookup(data.seller);
    } catch (_) {
      setSellerLookup(null);
    } finally {
      setSellerLookupLoading(false);
    }
  }, [request]);

  const loadSellerModerationCatalog = useCallback(async () => {
    setSellerModerationLoading(true);
    try {
      const res = await request('/admin/portal/seller-products-catalog');
      const d = res.ok ? await res.json() : { products: [] };
      setSellerModerationList(d.products || []);
    } catch (_) {
      setSellerModerationList([]);
    } finally {
      setSellerModerationLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (activeView !== 'product_moderation') return;
    loadSellerModerationCatalog();
  }, [activeView, loadSellerModerationCatalog]);

  useEffect(() => {
    if (activeView !== 'seller_products') return;
    const sellerId = searchParams.get('seller_id');
    const id = sellerId != null ? Number.parseInt(sellerId, 10) : null;
    if (!id || !Number.isInteger(id) || id < 1) {
      setSellerProductsList([]);
      return;
    }
    setSellerProductsLoading(true);
    request(`/products?seller_id=${id}`)
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data) => setSellerProductsList(data.products || []))
      .catch(() => setSellerProductsList([]))
      .finally(() => setSellerProductsLoading(false));
  }, [activeView, searchParams, request]);

  async function handleTopbarRefresh() {
    await loadData(true);
    if (!user || !isSuperuser) return;
    const extras = [];
    if (activeView === 'ai_calls') extras.push(refreshAiCalls());
    if (activeView === 'withdrawals') extras.push(loadWithdrawalRequests());
    if (activeView === 'reklama') extras.push(loadAdSlides());
    if (activeView === 'product_moderation') extras.push(loadSellerModerationCatalog());
    if (activeView === 'konkurs') {
      extras.push(loadContestOperatorResults(contestOperatorPeriod));
      extras.push(loadContestCourierResults(contestCourierPeriod));
    }
    if (activeView === 'seller_products') {
      const sellerId = searchParams.get('seller_id');
      const id = sellerId != null ? Number.parseInt(sellerId, 10) : null;
      if (id && Number.isInteger(id) && id >= 1) {
        setSellerProductsLoading(true);
        extras.push(
          request(`/products?seller_id=${id}`)
            .then((res) => (res.ok ? res.json() : { products: [] }))
            .then((data) => setSellerProductsList(data.products || []))
            .catch(() => setSellerProductsList([]))
            .finally(() => setSellerProductsLoading(false)),
        );
      }
    }
    await Promise.all(extras);
  }

  const setActiveViewWithUrl = (nextView) => {
    const normalized = normalizeAdminView(nextView);
    setActiveView(normalized);
    const params = new URLSearchParams(searchParams);
    if (normalized === DEFAULT_ADMIN_VIEW) {
      params.delete('view');
    } else {
      params.set('view', normalized);
    }
    setSearchParams(params, { replace: true });
  };

  const openCustomerDetail = useCallback((customerRow) => {
    const id = Number(customerRow?.id);
    if (!Number.isInteger(id) || id < 1) return;
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('view', 'customer_detail');
        next.set('customer_id', String(id));
        return next;
      },
      { replace: true },
    );
    setActiveView('customer_detail');
    setSidebarOpen(false);
  }, [setSearchParams]);

  const flatMenu = useMemo(() => MENU_GROUPS.flatMap((group) => group.items), []);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MENU_GROUPS;
    return MENU_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [search]);

  const filteredCouriers = useMemo(() => {
    const raw = courierSearchQuery.trim();
    if (!raw) return [];
    const q = raw.toLowerCase();
    const qDigits = raw.replace(/\D/g, '');
    return couriers.filter((row) => {
      const name = String(row.full_name || '').toLowerCase();
      const region = String(row.region_name || '').toLowerCase();
      const login = String(row.login || '').toLowerCase();
      const phoneD = String(row.phone || '').replace(/\D/g, '');
      if (name.includes(q)) return true;
      if (region.includes(q)) return true;
      if (login.includes(q)) return true;
      if (String(row.id) === raw) return true;
      if (qDigits.length >= 2 && phoneD.includes(qDigits)) return true;
      return false;
    });
  }, [couriers, courierSearchQuery]);

  const filteredOperators = useMemo(
    () => staff.filter((row) => row.staff_type === 'operator').filter((row) => matchesStaffSimpleSearch(row, operatorSearchDebounced)),
    [staff, operatorSearchDebounced],
  );

  const filteredPackers = useMemo(
    () => staff.filter((row) => row.staff_type === 'packer').filter((row) => matchesStaffSimpleSearch(row, packerSearchDebounced)),
    [staff, packerSearchDebounced],
  );

  const filteredPickers = useMemo(
    () => staff.filter((row) => row.staff_type === 'picker').filter((row) => matchesStaffSimpleSearch(row, pickerSearchDebounced)),
    [staff, pickerSearchDebounced],
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearchInput.trim().toLowerCase();
    return users
      .filter((u) => isCustomerUserRow(u))
      .filter((u) => {
        if (!q) return true;
        return [
          u.id,
          u.full_name,
          u.email,
          u.login,
          u.phone,
          u.registered_ip,
          u.last_login_ip,
          u.registered_location,
          u.last_login_location,
          u.registered_device,
          u.last_login_device,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ')
          .includes(q);
      });
  }, [users, customerSearchInput]);

  const selectedCustomerId = useMemo(() => {
    const raw = searchParams.get('customer_id');
    const id = raw != null ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return users.find((u) => isCustomerUserRow(u) && Number(u.id) === Number(selectedCustomerId)) || null;
  }, [users, selectedCustomerId]);

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomerId) return [];
    return orders.filter((o) => Number(o.user_id) === Number(selectedCustomerId));
  }, [orders, selectedCustomerId]);

  const selectedCustomerOldPasswords = useMemo(() => {
    const raw = String(selectedCustomer?.password_history_preview || '').trim();
    if (!raw) return [];
    return raw
      .split(' || ')
      .map((entry) => {
        const txt = String(entry || '').trim();
        if (!txt) return null;
        const sep = txt.indexOf('::');
        if (sep < 0) return { id: null, value: txt };
        const id = Number.parseInt(txt.slice(0, sep), 10);
        const value = txt.slice(sep + 2);
        return { id: Number.isInteger(id) && id > 0 ? id : null, value };
      })
      .filter((x) => x && x.value);
  }, [selectedCustomer]);

  useEffect(() => {
    if (activeView !== 'customer_detail') return;
    if (!selectedCustomerId) {
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set('view', 'customers');
          next.delete('customer_id');
          return next;
        },
        { replace: true },
      );
      setActiveView('customers');
    }
  }, [activeView, selectedCustomerId, setSearchParams]);

  const activeMeta = flatMenu.find((item) => item.key === activeView) || ADMIN_HEADER_EXTRA[activeView] || flatMenu[0];

  const salesSeries = useMemo(() => {
    const orders = stats?.orders || 0;
    const baseline = Math.max(12, Math.min(70, Math.round(orders / 3) || 20));
    return [
      baseline,
      Math.min(95, baseline + 8),
      Math.max(20, baseline - 6),
      Math.min(95, baseline + 14),
      Math.min(95, baseline + 4),
      Math.max(20, baseline - 2),
      Math.min(95, baseline + 11),
      Math.min(95, baseline + 16),
    ];
  }, [stats]);

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (b.stock || 0) - (a.stock || 0))
      .slice(0, 5);
  }, [products]);

  const recentActivity = useMemo(() => {
    return [...users]
      .sort(
        (a, b) =>
          (parseServerDateTime(b.created_at)?.getTime() ?? 0) - (parseServerDateTime(a.created_at)?.getTime() ?? 0)
      )
      .slice(0, 6)
      .map((u) => ({
        id: u.id,
        title: `${u.full_name || u.email} tizimga qo'shildi`,
        subtitle: u.email,
        time: u.created_at ? formatDateTimeUz(u.created_at, { empty: '-' }) : 'Hozir',
      }));
  }, [users]);

  const welcomeMessage = useMemo(() => {
    const parts = getDateTimePartsInUzbekistan(new Date());
    const hour = parts ? parseInt(parts.hour, 10) : new Date().getHours();
    const greeting = hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';
    return `${greeting}, ${user?.full_name || 'Admin'}!`;
  }, [user?.full_name]);

  const filteredRoles = useMemo(() => {
    const q = activeRoleFilter.trim().toLowerCase();
    if (!q) return workRoles;
    return workRoles.filter((role) => {
      const source = `${role.id} ${role.role_name || ''} ${role.login || ''} ${role.phone || ''} ${role.email || ''}`.toLowerCase();
      return source.includes(q);
    });
  }, [activeRoleFilter, workRoles]);

  const selectedRoleLive = useMemo(() => {
    if (!selectedRole) return null;
    return workRoles.find((row) => row.id === selectedRole.id) || selectedRole;
  }, [selectedRole, workRoles]);

  const roleStats = useMemo(() => ({
    total: workRoles.length,
    active: workRoles.filter((row) => row.status === 'active').length,
    pending: workRoles.filter((row) => row.status === 'pending').length,
    deleted: trashRoles.length,
  }), [workRoles, trashRoles]);

  const aiOperatorFeedAiOnly = useMemo(
    () => customerConversationEvents.filter((e) => e.source === 'ai_call'),
    [customerConversationEvents],
  );

  const aiOperatorFeedOperatorSide = useMemo(
    () => customerConversationEvents.filter((e) => e.source !== 'ai_call'),
    [customerConversationEvents],
  );

  const aiOperatorSmsMijoz = useMemo(
    () =>
      customerConversationEvents.filter(
        (e) => e.source === 'staff_chat_customer' && /^customer[:_]/i.test(String(e.event_type || '')),
      ),
    [customerConversationEvents],
  );

  const aiOperatorSmsRollardan = useMemo(
    () =>
      customerConversationEvents.filter(
        (e) =>
          e.source === 'courier_call_log'
          || e.source === 'lead_note'
          || (e.source === 'staff_chat_customer' && /^staff[:_]/i.test(String(e.event_type || ''))),
      ),
    [customerConversationEvents],
  );

  const runMutation = async (key, callback, fallbackMessage) => {
    setBusyKey(key);
    setError('');
    try {
      await callback();
      await loadData(false);
    } catch (err) {
      setError(err.message || fallbackMessage || 'Amal bajarilmadi');
    } finally {
      setBusyKey('');
    }
  };

  const startAiCallForOrder = async (orderId) => {
    const id = Number(orderId);
    if (!Number.isFinite(id) || id < 1) return;
    setBusyKey(`ai-call-${id}`);
    setError('');
    try {
      const res = await request('/admin/ai-call/start', {
        method: 'POST',
        body: JSON.stringify({ order_id: id }),
      });
      await ensureOk(res, 'AI qo‘ng‘iroq start xatolik');
      await loadAiOperatorPanel();
    } catch (err) {
      setError(err.message || 'AI qo‘ng‘iroq start xatolik');
    } finally {
      setBusyKey('');
    }
  };

  const handleApproveSellerProduct = async (productId) => {
    if (!productId) return;
    await runMutation(`product-moderate-${productId}`, async () => {
      const res = await request(`/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      await ensureOk(res, 'Mahsulot tasdiqlanmadi');
      await loadSellerModerationCatalog();
    }, 'Mahsulot tasdiqlanmadi');
  };

  const openSellerProductEdit = (p) => {
    if (!p?.id) return;
    setSellerProductEdit({
      id: p.id,
      name_uz: p.name_uz || '',
      name_ru: p.name_ru || '',
      description_uz: p.description_uz || '',
      category: p.category || '',
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      image_url: p.image_url || '',
      video_url: p.video_url || '',
      operator_share_percent: Number(p.operator_share_percent) || 0,
      site_fee_percent: Number(p.site_fee_percent) || 0,
      discount_percent: Number(p.discount_percent) || 0,
      promotion_ends_at: p.promotion_ends_at ? String(p.promotion_ends_at).replace(' ', 'T').slice(0, 16) : '',
      status: p.status || 'pending',
    });
  };

  const handleSaveSellerProductAdmin = async (e) => {
    e.preventDefault();
    const d = sellerProductEdit;
    if (!d?.id) return;
    const op = Number(d.operator_share_percent) || 0;
    const sf = Number(d.site_fee_percent) || 0;
    if (op + sf > 100) {
      setError('Operator va sayt foizi yig‘indisi 100% dan oshmasin.');
      return;
    }
    await runMutation(`product-admin-save-${d.id}`, async () => {
      const res = await request(`/products/${d.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name_uz: String(d.name_uz || '').trim(),
          name_ru: String(d.name_ru || '').trim() || null,
          description_uz: String(d.description_uz || '').trim() || null,
          category: String(d.category || '').trim() || null,
          price: Number(d.price) || 0,
          stock: Number.parseInt(d.stock, 10) || 0,
          image_url: String(d.image_url || '').trim() || null,
          video_url: String(d.video_url || '').trim() || null,
          operator_share_percent: op,
          site_fee_percent: sf,
          discount_percent: Number(d.discount_percent) || 0,
          promotion_ends_at: d.promotion_ends_at && String(d.promotion_ends_at).trim()
            ? String(d.promotion_ends_at).replace('T', ' ').slice(0, 19)
            : null,
          status: d.status || 'pending',
        }),
      });
      await ensureOk(res, 'Mahsulot saqlanmadi');
      await loadSellerModerationCatalog();
      setSellerProductEdit(null);
    }, 'Mahsulot saqlanmadi');
  };

  const filteredSellerModeration = useMemo(() => {
    const rows = sellerModerationList;
    if (sellerModFilter === 'all') return rows;
    if (sellerModFilter === 'pending') return rows.filter((r) => sellerModerationNeedsApprove(r.status));
    if (sellerModFilter === 'active') return rows.filter((r) => String(r.status || '').toLowerCase() === 'active');
    return rows.filter(
      (r) => !sellerModerationNeedsApprove(r.status) && String(r.status || '').toLowerCase() !== 'active'
    );
  }, [sellerModerationList, sellerModFilter]);

  const handleOrderStatusChange = async (id, status) => {
    await runMutation(`order-${id}`, async () => {
      const res = await request(`/admin/portal/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await ensureOk(res, 'Status yangilanmadi');
    }, 'Status yangilanmadi');
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!roleForm.role_name.trim()) return;
    if (roleForm.password !== roleForm.confirmPassword) {
      setError('Parollar mos kelmadi');
      return;
    }
    const loginTrim = (roleForm.login || '').trim().toLowerCase();
    const pwdTrim = (roleForm.password || '').trim();
    if (loginTrim && pwdTrim && loginTrim === pwdTrim.toLowerCase()) {
      setError('Login va parol bir xil bo\'lmasligi kerak. Kamida bitta belgi farq qilishi kerak.');
      return;
    }
    if (roleForm.portal_role === 'courier' && !String(roleForm.courier_viloyat_id || '').trim()) {
      setError('Kuryer uchun yetkazish viloyati tanlang.');
      return;
    }
    await runMutation('role-create', async () => {
      const isCourier = roleForm.portal_role === 'courier';
      const vil = String(roleForm.courier_viloyat_id || '').trim();
      const res = await request('/admin/portal/work-roles', {
        method: 'POST',
        body: JSON.stringify({
          role_name: roleForm.role_name.trim(),
          login: roleForm.login.trim(),
          password: roleForm.password,
          phone: roleForm.phone.trim() || null,
          email: roleForm.email.trim() || null,
          task: roleForm.task.trim() || null,
          description: roleForm.description.trim() || null,
          portal_role: roleForm.portal_role || '',
          courier_viloyat_id: isCourier ? vil : null,
          courier_tuman_ids: isCourier && vil === 'toshkent_sh' ? roleForm.courier_tuman_ids : [],
          permissions: roleForm.permissions,
          status: 'active',
        }),
      });
      await ensureOk(res, 'Rol qo\'shilmadi');
      setRoleForm(makeRoleForm());
      setRoleFormOpen(false);
      setShowRoleFormPassword(false);
    }, 'Rol qo\'shilmadi');
  };

  const toggleRolePermission = (perm) => {
    setRoleForm((prev) => {
      if (prev.permissions.includes(perm)) {
        return { ...prev, permissions: prev.permissions.filter((p) => p !== perm) };
      }
      return { ...prev, permissions: [...prev.permissions, perm] };
    });
  };

  const toggleAllRolePermissions = () => {
    const all = ROLE_PERMISSIONS.map((item) => item.value);
    setRoleForm((prev) => {
      const isAll = all.every((value) => prev.permissions.includes(value));
      return { ...prev, permissions: isAll ? [] : all };
    });
  };

  const openRoleModal = async (role) => {
    setShowModalPassword(false);
    setRoleActionAmount('50000');
    setRolePortalDraft(role.portal_role || '');
    setRoleCourierViloyatDraft(role.courier_viloyat_id || '');
    setRoleCourierTumanDraft(Array.isArray(role.courier_tuman_ids) ? role.courier_tuman_ids : []);
    setSelectedRole(role);
    setRoleModalOpen(true);
  };

  const toggleRoleCourierTumanDraft = (id) => {
    setRoleCourierTumanDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveRolePortal = async () => {
    if (!selectedRoleLive?.id) return;
    if (rolePortalDraft === 'courier' && !String(roleCourierViloyatDraft || '').trim()) {
      window.alert('Kuryer uchun yetkazish viloyatini tanlang.');
      return;
    }
    await runMutation(`role-portal-${selectedRoleLive.id}`, async () => {
      const isC = rolePortalDraft === 'courier';
      const v = String(roleCourierViloyatDraft || '').trim();
      const res = await request(`/admin/portal/work-roles/${selectedRoleLive.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          portal_role: rolePortalDraft || '',
          courier_viloyat_id: isC ? v : null,
          courier_tuman_ids: isC && v === 'toshkent_sh' ? roleCourierTumanDraft : [],
        }),
      });
      await ensureOk(res, 'Panel va hudud yangilanmadi');
    }, 'Panel va hudud yangilanmadi');
  };

  const handleRoleAction = async (action, roleOverride = null) => {
    const role = roleOverride ?? selectedRoleLive;
    if (!role?.id) return;
    const roleId = role.id;
    let amount = null;
    if (action === 'fine' || action === 'reward' || action === 'oylik') {
      amount = Number(roleActionAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        setError('Summani to\'g\'ri kiriting');
        return;
      }
    }
    if (action === 'delete' && !window.confirm('Bu rolni o\'chirasizmi?')) return;

    const key = `role-action-${roleId}-${action}`;
    setBusyKey(key);
    setError('');
    try {
      const payload = { action };
      if (amount != null) payload.amount = amount;
      const res = await request(`/admin/portal/work-roles/${roleId}/actions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const updated = await ensureOk(res, 'Rol action bajarilmadi');
      await loadWorkRolesAndTrash();
      if (updated?.deleted_at) {
        setRoleModalOpen(false);
        setSelectedRole(null);
      }
    } catch (err) {
      const msg = err?.message || 'Rol action bajarilmadi';
      setError(msg);
      alert('Amal bajarilmadi: ' + msg);
    } finally {
      setBusyKey('');
    }
  };

  const handleRestoreRole = async (roleId) => {
    if (!roleId) return;
    setBusyKey(`restore-${roleId}`);
    setError('');
    try {
      const res = await request(`/admin/portal/work-roles/${roleId}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('Tiklash amalga oshmadi');
      await loadWorkRolesAndTrash();
      setRestoreModalOpen(false);
      setTrashModalOpen(false);
      setRestoreRole(null);
      setRestoreRoleId(null);
      } catch (err) {
        setError(err.message);
      alert(err.message);
      } finally {
      setBusyKey('');
    }
  };

  const handlePermanentDeleteRole = async (role) => {
    const roleId = role?.id;
    if (!roleId) return;
    if (!window.confirm(`"${role.role_name}" rolini butunlay o'chirasizmi?`)) return;
    setBusyKey(`delete-${roleId}`);
    setError('');
    try {
      const res = await request(`/admin/portal/work-roles/${roleId}/permanent`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Rol o'chirilmadi");
      await loadWorkRolesAndTrash();
    } catch (err) {
      setError(err.message);
      alert(err.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleClearTrash = async () => {
    if (trashRoles.length === 0) return;
    if (!window.confirm(`Savatdagi ${trashRoles.length} ta rolni butunlay o'chirasizmi?`)) return;
    setBusyKey('clear-trash');
    setError('');
    try {
      const res = await request('/admin/portal/work-roles/trash', { method: 'DELETE' });
      if (!res.ok) throw new Error('Savat tozalanmadi');
      await loadWorkRolesAndTrash();
      setTrashModalOpen(false);
    } catch (err) {
      setError(err.message);
      alert(err.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleCreateStaff = async (type, e) => {
    e.preventDefault();
    const form = staffForms[type];
    if (!form?.full_name?.trim()) return;
    await runMutation(`staff-create-${type}`, async () => {
      const res = await request('/admin/portal/staff', {
        method: 'POST',
        body: JSON.stringify({
          staff_type: type,
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          status: form.status,
          region_id: form.region_id ? Number(form.region_id) : null,
        }),
      });
      await ensureOk(res, 'Xodim qo\'shilmadi');
      setStaffForms((prev) => ({ ...prev, [type]: makeStaffForm(type) }));
    }, 'Xodim qo\'shilmadi');
  };

  const handleSaveStaff = async (id) => {
    const draft = staffDrafts[id];
    if (!draft) return;
    await runMutation(`staff-save-${id}`, async () => {
      const res = await request(`/admin/portal/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: draft.full_name,
          phone: draft.phone,
          status: draft.status,
          region_id: draft.region_id ? Number(draft.region_id) : null,
          orders_handled: Number(draft.orders_handled) || 0,
          rating: Number(draft.rating) || 0,
        }),
      });
      await ensureOk(res, 'Xodim saqlanmadi');
    }, 'Xodim saqlanmadi');
  };

  const handleDeleteStaff = async (id) => {
    if (!window.confirm('Xodimni o\'chirasizmi?')) return;
    await runMutation(`staff-delete-${id}`, async () => {
      const res = await request(`/admin/portal/staff/${id}`, { method: 'DELETE' });
      await ensureOk(res, 'Xodim o\'chirilmadi');
    }, 'Xodim o\'chirilmadi');
  };

  const handleCreateRegion = async (e) => {
    e.preventDefault();
    if (!regionForm.name.trim()) return;
    await runMutation('region-create', async () => {
      const res = await request('/admin/portal/regions', {
        method: 'POST',
        body: JSON.stringify({
          name: regionForm.name.trim(),
          delivery_fee: Number(regionForm.delivery_fee) || 0,
          active: Boolean(regionForm.active),
        }),
      });
      await ensureOk(res, 'Viloyat qo\'shilmadi');
      setRegionForm({ name: '', delivery_fee: '25000', active: true });
    }, 'Viloyat qo\'shilmadi');
  };

  const handleSaveRegion = async (id) => {
    const draft = regionDrafts[id];
    if (!draft) return;
    await runMutation(`region-save-${id}`, async () => {
      const res = await request(`/admin/portal/regions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          delivery_fee: Number(draft.delivery_fee) || 0,
          active: Boolean(draft.active),
        }),
      });
      await ensureOk(res, 'Viloyat saqlanmadi');
    }, 'Viloyat saqlanmadi');
  };

  const handleDeleteRegion = async (id) => {
    if (!window.confirm('Viloyatni o\'chirasizmi?')) return;
    await runMutation(`region-delete-${id}`, async () => {
      const res = await request(`/admin/portal/regions/${id}`, { method: 'DELETE' });
      await ensureOk(res, 'Viloyat o\'chirilmadi');
    }, 'Viloyat o\'chirilmadi');
  };

  const handleCreateSeller = async (e) => {
    e.preventDefault();
    if (!sellerForm.name.trim()) return;
    await runMutation('seller-create', async () => {
      const res = await request('/admin/portal/sellers', {
        method: 'POST',
        body: JSON.stringify({
          name: sellerForm.name.trim(),
          contact_phone: sellerForm.contact_phone.trim() || null,
          email: sellerForm.email.trim() || null,
          password: sellerForm.password,
          region_id: sellerForm.region_id ? Number(sellerForm.region_id) : null,
          status: sellerForm.status,
          balance: Number(sellerForm.balance) || 0,
        }),
      });
      await ensureOk(res, 'Seller qo\'shilmadi');
      setSellerForm({ name: '', contact_phone: '', email: '', password: 'Seller123!', region_id: '', status: 'active', balance: '0' });
    }, 'Seller qo\'shilmadi');
  };

  const handleSaveSeller = async (id) => {
    const draft = sellerDrafts[id];
    if (!draft) return;
    await runMutation(`seller-save-${id}`, async () => {
      const res = await request(`/admin/portal/sellers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          contact_phone: draft.contact_phone,
          email: draft.email,
          region_id: draft.region_id ? Number(draft.region_id) : null,
          status: draft.status,
          balance: Number(draft.balance) || 0,
        }),
      });
      await ensureOk(res, 'Seller saqlanmadi');
    }, 'Seller saqlanmadi');
  };

  const handleDeleteSeller = async (id) => {
    if (!window.confirm('Sellerni o\'chirasizmi?')) return;
    await runMutation(`seller-delete-${id}`, async () => {
      const res = await request(`/admin/portal/sellers/${id}`, { method: 'DELETE' });
      await ensureOk(res, 'Seller o\'chirilmadi');
    }, 'Seller o\'chirilmadi');
  };

  const handleResetCustomerPassword = async (id) => {
    const entered = String(customerPasswordDrafts[id] || '').trim();
    const ask = entered
      ? 'Bu mijoz parolini yangilaysizmi?'
      : 'Yangi vaqtinchalik parol avtomatik yaratiladi. Davom etasizmi?';
    if (!window.confirm(ask)) return;
    await runMutation(`customer-password-${id}`, async () => {
      const res = await request(`/admin/users/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password: entered || null }),
      });
      const data = await ensureOk(res, 'Mijoz paroli yangilanmadi');
      const shown = String(data?.temporary_password || '').trim();
      if (shown) {
        window.alert(`Yangi parol (#${id}): ${shown}`);
      } else {
        window.alert(`Mijoz #${id} paroli yangilandi.`);
      }
      setCustomerPasswordDrafts((prev) => ({ ...prev, [id]: '' }));
    }, 'Mijoz paroli yangilanmadi');
  };

  const handleCustomerStatusToggle = async (row) => {
    const current = String(row?.status || 'active').toLowerCase();
    const next = current === 'blocked' ? 'active' : 'blocked';
    const ask =
      next === 'blocked'
        ? 'Mijoz akkauntini bloklaysizmi? (Login qila olmaydi)'
        : 'Mijoz akkauntini aktiv qilasizmi?';
    if (!window.confirm(ask)) return;
    await runMutation(`customer-status-${row.id}`, async () => {
      const res = await request(`/admin/users/${row.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await ensureOk(res, 'Mijoz statusi yangilanmadi');
    }, 'Mijoz statusi yangilanmadi');
  };

  const handleDeleteOldPassword = async (userId, historyId) => {
    if (!historyId) return;
    if (!window.confirm("Ushbu eski parolni o'chirasizmi?")) return;
    await runMutation(`customer-password-history-delete-${historyId}`, async () => {
      const res = await request(`/admin/users/${userId}/password-history/${historyId}`, {
        method: 'DELETE',
      });
      await ensureOk(res, "Eski parol o'chirilmadi");
    }, "Eski parol o'chirilmadi");
  };

  const handleSaveCourierFee = async () => {
    const num = Number(courierFee);
    if (!Number.isFinite(num) || num < 0) return setError('Kuryer haqqi 0 dan katta son bo\'lishi kerak.');
    await runMutation('courier-fee', async () => {
      const res = await request('/admin/courier-fee', {
        method: 'PATCH',
        body: JSON.stringify({ courier_fee_per_order: num }),
      });
      await ensureOk(res, 'Kuryer haqqi saqlanmadi');
    }, 'Kuryer haqqi saqlanmadi');
  };

  const handleUpdateCourier = async (id) => {
    const draft = courierEditDraft;
    if (!draft.login.trim() || draft.login.trim().length < 3) return setError('Login kamida 3 belgi.');
    if (draft.password && draft.password.length < 5) return setError('Parol kamida 5 belgi.');
    await runMutation(`courier-update-${id}`, async () => {
      const body = { login: draft.login.trim().toLowerCase() };
      if (draft.password) body.password = draft.password;
      const res = await request(`/admin/couriers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await ensureOk(res, 'Kuryer yangilanmadi');
      setCourierEditId(null);
      setCourierEditDraft({ login: '', password: '' });
    }, 'Kuryer yangilanmadi');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (user && !isSuperuser) return null;

  return (
    <div className={`admin-dashboard ${darkMode ? 'admin-dark' : ''}`}>
      <div className={`admin-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden={!sidebarOpen} />

      <aside id="admin-sidebar-nav" className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`} aria-hidden={!sidebarOpen}>
        <div className="sidebar-inner">
          <div className="sidebar-header">
            <div className="logo-wrap">
              <span className="logo-icon"><i className="fas fa-crown" /></span>
              <span className="logo-text">MyShop</span>
        </div>
            <button className="icon-btn" type="button" onClick={() => setSidebarOpen(false)} aria-label="Yopish">
              <i className="fas fa-times" />
            </button>
        </div>

          <div className="sidebar-menu">
            {filteredGroups.map((group) => (
              <div key={group.label} className="menu-group">
                <div className="menu-label">{group.label}</div>
                {group.items.map((item) => {
                  let badge = badgeValue(item, stats, users.length, pendingWithdrawalsCount);
                  if (item.badgeKey === 'orders') badge = orderStats.total;
                  if (item.badgeKey === 'pending') badge = orderStats.hold;
                  if (item.badgeKey === 'atkaz') badge = orderStats.cancelled;
                  if (item.badgeKey === 'pendingWithdrawals') badge = pendingWithdrawalsCount;
                  if (item.badgeKey === 'pendingSellerProducts') {
                    const n = Number(stats?.pendingSellerProducts) || 0;
                    badge = n > 0 ? n : null;
                  }
                  const tone = item.badgeTone || (item.key === 'hold' ? 'warning' : 'default');
                  const warnTone = item.key === 'product_moderation' && badge != null ? 'warning' : tone;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`menu-item ${activeView === item.key ? 'active' : ''}`}
                      onClick={() => {
                        setActiveViewWithUrl(item.key);
                        setSidebarOpen(false);
                      }}
                    >
                      <i className={`fas ${item.icon}`} />
                      <span>{item.label}</span>
                      {badge !== null && <span className={`menu-badge ${warnTone}`}>{badge}</span>}
                    </button>
                  );
                })}
        </div>
            ))}
        </div>

          <div className="sidebar-footer">
            <div className="sidebar-footer-row">
              <img
                className="sidebar-footer-avatar"
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || 'Super Admin')}&background=2563eb&color=fff&size=128`}
                alt=""
              />
              <div className="sidebar-footer-main">
                <div className="sidebar-footer-name-row">
                  <span className="user-name">{user?.full_name || 'SuperAdmin'}</span>
                  <label className="theme-switch theme-switch--sidebar-inline" title={darkMode ? 'Kun rejimi' : 'Tun rejimi'} aria-label={darkMode ? 'Kun rejimiga o‘tish' : 'Tun rejimiga o‘tish'}>
                    <i className="fas fa-sun" aria-hidden />
                    <input type="checkbox" checked={darkMode} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />
                    <span className="slider" />
                    <i className="fas fa-moon" aria-hidden />
                  </label>
                </div>
                <div className="user-role">Administrator</div>
        </div>
      </div>
          </div>
        </div>
      </aside>

      <main className={`admin-main${activeView === 'staff_chat' ? ' admin-main--staff-chat' : ''}`}>
        {activeView !== 'staff_chat' && (
        <header className="topbar-neo">
          <div className="topbar-left">
            <button className="icon-btn strong" type="button" onClick={() => setSidebarOpen((prev) => !prev)} aria-expanded={sidebarOpen} aria-controls="admin-sidebar-nav" id="admin-sidebar-toggle">
              <i className="fas fa-bars" />
            </button>
            <div>
              <h1>{activeMeta.label}</h1>
              <p>{welcomeMessage}</p>
            </div>
          </div>

          <div className="topbar-right">
            <button className="icon-btn strong" type="button" onClick={() => void handleTopbarRefresh()} title="Yangilash">
              <i className="fas fa-sync-alt" />
            </button>

            <div className="admin-bell-wrap">
              <button
                className="icon-btn strong notify"
                type="button"
                title="Bildirishnolar"
                onClick={() => {
                  setProfileOpen(false);
                  setAdminNotificationsOpen((v) => !v);
                }}
                aria-expanded={adminNotificationsOpen}
              >
                <i className="fas fa-bell" />
                {(adminNotifications.filter((n) => !n.read_at).length > 0) && (
                  <span className="dot">{adminNotifications.filter((n) => !n.read_at).length}</span>
                )}
              </button>
              {adminNotificationsOpen && (
                <>
                  <div className="admin-bell-backdrop" onClick={() => setAdminNotificationsOpen(false)} aria-hidden="true" />
                  <div className="admin-bell-dropdown">
                    <div className="admin-bell-head">Bildirishnolar</div>
                    {adminNotifications.length === 0 ? (
                      <p className="admin-bell-empty">Xabar yo&apos;q</p>
                    ) : (
                      <ul className="admin-bell-list">
                        {adminNotifications.map((n) => (
                          <li key={n.id} className={n.read_at ? '' : 'unread'}>
                            <div className="admin-bell-item">
                              <div className="admin-bell-item-title">{n.title}</div>
                              <div className="admin-bell-item-body">{n.body}</div>
                              <div className="admin-bell-item-date">{formatDate(n.created_at)}</div>
                              {n.link_type === 'withdrawal' && n.link_id && (
                                <button
                                  type="button"
                                  className="btn-neo btn-neo-success btn-sm"
                                  disabled={adminNotifyApproveBusy === n.id}
                                  onClick={() => {
                                    handleAdminNotifyApprove(n);
                                    setAdminNotificationsOpen(false);
                                  }}
                                >
                                  {adminNotifyApproveBusy === n.id ? '...' : 'Tasdiqlash'}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="profile-wrap">
              <button
                type="button"
                className="profile-btn"
                onClick={() => {
                  setAdminNotificationsOpen(false);
                  setProfileOpen((v) => !v);
                }}
                aria-expanded={profileOpen}
                aria-haspopup="true"
              >
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || 'Super Admin')}&background=2563eb&color=fff&size=32`}
                  alt="Profile"
                />
                <span>{user?.full_name || 'SuperAdmin'}</span>
                <i className="fas fa-chevron-down" />
              </button>
              {profileOpen && (
                <div className="profile-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      setActiveViewWithUrl('admin_profile');
                    }}
                  >
                    <i className="fas fa-user" /> Profil
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      setActiveViewWithUrl('admin_settings');
                    }}
                  >
                    <i className="fas fa-cog" /> Sozlamalar
                  </button>
                  <button type="button" className="danger" role="menuitem" onClick={handleLogout}><i className="fas fa-sign-out-alt" /> Chiqish</button>
                </div>
              )}
            </div>
          </div>
        </header>
        )}

        {activeView === 'ai_calls' && (
          <div className="topbar-rule">
            {aiOperatorExpanded ? (
              <div className="topbar-rule__band topbar-rule__band--audio-split">
                <button
                  type="button"
                  className="topbar-rule__back"
                  title="Barcha bo‘limlar"
                  aria-label="Barcha bo‘limlar: Audio, SMS, Jalobalar"
                  onClick={() => setAiOperatorExpanded(null)}
                >
                  <i className="fas fa-chevron-left" aria-hidden="true" />
                </button>
                {aiOperatorExpanded === 'audio' && (
                  <>
                    <button
                      type="button"
                      className={`topbar-rule__split${aiOperatorAudioSubTab === 'ai' ? ' is-active' : ''}`}
                      onClick={() => setAiOperatorAudioSubTab('ai')}
                    >
                      Ai Qung&apos;iroqlar
                    </button>
                    <button
                      type="button"
                      className={`topbar-rule__split${aiOperatorAudioSubTab === 'operator' ? ' is-active' : ''}`}
                      onClick={() => setAiOperatorAudioSubTab('operator')}
                    >
                      Operator Qungi&apos;roqlar
                    </button>
                  </>
                )}
                {aiOperatorExpanded === 'sms' && (
                  <>
                    <button
                      type="button"
                      className={`topbar-rule__split${aiOperatorSmsSubTab === 'mijoz' ? ' is-active' : ''}`}
                      onClick={() => setAiOperatorSmsSubTab('mijoz')}
                    >
                      Mijoz smslari
                    </button>
                    <button
                      type="button"
                      className={`topbar-rule__split${aiOperatorSmsSubTab === 'rollar' ? ' is-active' : ''}`}
                      onClick={() => setAiOperatorSmsSubTab('rollar')}
                    >
                      Rollardan kelgan smslar
                    </button>
                  </>
                )}
                {aiOperatorExpanded === 'jalobalar' && (
                  <>
                    <button
                      type="button"
                      className={`topbar-rule__split${aiOperatorJalobaSubTab === 'mijoz' ? ' is-active' : ''}`}
                      onClick={() => setAiOperatorJalobaSubTab('mijoz')}
                    >
                      Mijoz jalobalari
                    </button>
                    <button
                      type="button"
                      className={`topbar-rule__split${aiOperatorJalobaSubTab === 'rollar' ? ' is-active' : ''}`}
                      onClick={() => setAiOperatorJalobaSubTab('rollar')}
                    >
                      Rollardan kelgan jalobalar
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="topbar-rule__band">
                <div className="topbar-rule__seg">
                  <button
                    type="button"
                    className={`topbar-rule__tab${aiOperatorMainTab === 'audio' ? ' is-active' : ''}`}
                    onClick={() => {
                      setAiOperatorMainTab('audio');
                      setAiOperatorExpanded('audio');
                    }}
                  >
                    Audio Qung&apos;iroqlar
                  </button>
                </div>
                <div className="topbar-rule__tickwrap">
                  <span className="topbar-rule__tick" aria-hidden="true" />
                </div>
                <div className="topbar-rule__seg">
                  <button
                    type="button"
                    className={`topbar-rule__tab${aiOperatorMainTab === 'sms' ? ' is-active' : ''}`}
                    onClick={() => {
                      setAiOperatorMainTab('sms');
                      setAiOperatorExpanded('sms');
                    }}
                  >
                    Sms Xabarlar
                  </button>
                </div>
                <div className="topbar-rule__tickwrap">
                  <span className="topbar-rule__tick" aria-hidden="true" />
                </div>
                <div className="topbar-rule__seg">
                  <button
                    type="button"
                    className={`topbar-rule__tab${aiOperatorMainTab === 'jalobalar' ? ' is-active' : ''}`}
                    onClick={() => {
                      setAiOperatorMainTab('jalobalar');
                      setAiOperatorExpanded('jalobalar');
                    }}
                  >
                    Jalobalar
                  </button>
                </div>
              </div>
            )}
            <div className="topbar-rule__line" aria-hidden="true" />
          </div>
        )}

        <section className={`admin-content${activeView === 'staff_chat' ? ' admin-content--staff-chat' : ''}`}>
          {error && <div className="admin-alert">{error}</div>}

          {activeView === 'staff_chat' ? (
            <AdminStaffChat onExitChat={() => setActiveViewWithUrl('dashboard')} />
          ) : loading ? (
            <div className="loading-block">Yuklanmoqda...</div>
          ) : (
            <>
              {activeView === 'dashboard' && (
                <>
                  <div className="stats-grid-neo">
                    <StatCard
                      icon="fa-wallet"
                      tone="blue"
                      label="Umumiy daromad"
                      value={formatCurrency(stats?.totalRevenue)}
                      trend="+12.5%"
                    />
                    <StatCard
                      icon="fa-shopping-cart"
                      tone="cyan"
                      label="Jami zakazlar"
                      value={new Intl.NumberFormat('uz-UZ').format(stats?.orders || 0)}
                      trend="+8.2%"
                    />
                    <StatCard
                      icon="fa-users"
                      tone="purple"
                      label="Faol foydalanuvchilar"
                      value={new Intl.NumberFormat('uz-UZ').format(stats?.users || users.length || 0)}
                      trend="+3"
                    />
                    <StatCard
                      icon="fa-clock"
                      tone="orange"
                      label="Kutilayotgan"
                      value={new Intl.NumberFormat('uz-UZ').format(Math.max(0, Math.round((stats?.orders || 0) * 0.14)))}
                      trend="-5%"
                      negative
                    />
                  </div>

                  <div className="charts-row-neo">
                    <div className="chart-card-neo">
                      <div className="chart-head">
                        <h4>Sotuv statistikasi</h4>
                        <div className="chart-actions">
                          <select>
                            <option>Haftalik</option>
                            <option defaultValue>Oylik</option>
                            <option>Yillik</option>
                          </select>
                        </div>
                      </div>
                      <div className="chart-body">
                        <div className="sales-chart">
                          {salesSeries.map((value, idx) => (
                            <div className="sales-col" key={MONTH_LABELS[idx]}>
                              <div className="sales-bar" style={{ height: `${value}%` }} />
                              <span>{MONTH_LABELS[idx]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mini-stats-col">
                      <div className="mini-stat-card">
                        <i className="fas fa-credit-card" />
                        <div>
                          <span>Plastik</span>
                          <strong>{formatCurrency((stats?.totalRevenue || 0) * 0.55)}</strong>
                        </div>
                        <em>55%</em>
                      </div>
                      <div className="mini-stat-card">
                        <i className="fas fa-money-bill" />
                        <div>
                          <span>Naqd</span>
                          <strong>{formatCurrency((stats?.totalRevenue || 0) * 0.45)}</strong>
                        </div>
                        <em>45%</em>
                      </div>
                      <div className="mini-stat-card">
                        <i className="fas fa-truck" />
                        <div>
                          <span>Yetkazilgan</span>
                          <strong>{Math.max(0, Math.round((stats?.orders || 0) * 0.77))}</strong>
                        </div>
                        <em>77%</em>
                      </div>
                      <div className="mini-stat-card">
                        <i className="fas fa-percent" />
                        <div>
                          <span>O'rtacha chek</span>
                          <strong>{formatCurrency((stats?.orders || 0) > 0 ? (stats?.totalRevenue || 0) / stats.orders : 0)}</strong>
                        </div>
                        <em>+12%</em>
                      </div>
                    </div>
                  </div>

                  <div className="activity-grid-neo">
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4>So'nggi harakatlar</h4>
                        <button type="button">Barchasi</button>
                      </div>
                      <div className="activity-list-neo">
                        {recentActivity.length === 0 && <p className="muted">Hozircha ma'lumot yo'q</p>}
                        {recentActivity.map((item) => (
                          <div className="activity-item" key={item.id}>
                            <div className="activity-icon"><i className="fas fa-user-plus" /></div>
                            <div>
                              <strong>{item.title}</strong>
                              <span>{item.subtitle}</span>
                            </div>
                            <em>{item.time}</em>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="panel-card">
                      <div className="panel-head">
                        <h4>Top mahsulotlar</h4>
                        <button type="button">Barchasi</button>
                      </div>
                      <div className="products-list-neo">
                        {topProducts.length === 0 && <p className="muted">Mahsulot topilmadi</p>}
                        {topProducts.map((p) => (
                          <div className="product-row" key={p.id}>
                            <div>
                              <strong>{p.name_uz || p.name_ru || `Mahsulot #${p.id}`}</strong>
                              <span>{p.category || 'Kategoriya yoq'}</span>
                              <span className={`status-pill ${(p.status || 'pending') === 'active' ? 'active' : 'pending'}`}>
                                {(p.status || 'pending') === 'active' ? 'Sotuvda' : 'Kutilmoqda'}
                              </span>
                            </div>
                            <div className="product-meta">
                              <em>{formatCurrency(p.price)}</em>
                              <small>stock: {p.stock ?? 0}</small>
                              {isSuperuser && (p.status || 'pending') !== 'active' && (
                                <button
                                  type="button"
                                  className="btn-neo btn-neo-success btn-sm"
                                  disabled={busyKey === `product-activate-${p.id}`}
                                  onClick={async () => {
                                    setBusyKey(`product-activate-${p.id}`);
                                    try {
                                      const res = await request(`/products/${p.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ status: 'active' }),
                                      });
                                      if (res.ok) await loadData(false);
                                    } finally {
                                      setBusyKey('');
                                    }
                                  }}
                                >
                                  Sotuvga chiqarish
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="panel-card">
                      <div className="panel-head"><h4>Statistika</h4></div>
                      <div className="bubble-wrap">
                        <div className="bubble-item">
                          <div className="bubble big">{users.length}</div>
                          <span>Operatorlar</span>
                        </div>
                        <div className="bubble-item">
                          <div className="bubble mid">{Math.max(1, Math.round(users.length * 0.5))}</div>
                          <span>Kuryerlar</span>
                        </div>
                        <div className="bubble-item">
                          <div className="bubble small">{stats?.superusers || 1}</div>
                          <span>Adminlar</span>
                        </div>
                      </div>
                      <div className="progress-stack">
                        <div>
                          <div className="progress-head"><span>Bu hafta</span><span>{formatCurrency((stats?.totalRevenue || 0) * 0.38)}</span></div>
                          <div className="progress-line"><span style={{ width: '76%' }} /></div>
                        </div>
                        <div>
                          <div className="progress-head"><span>O'tgan hafta</span><span>{formatCurrency((stats?.totalRevenue || 0) * 0.29)}</span></div>
                          <div className="progress-line"><span style={{ width: '58%' }} /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

                            {activeView === 'roles' && (
                <div className="roles-view">
                  <div className="text-center mb-4">
                    <button className="btn-neo btn-neo-primary" type="button" onClick={() => setRoleFormOpen(true)}>
                      <i className="fas fa-plus-circle" /> + Yangi Rol Qo'shish
                    </button>
                    <button className="btn-neo" type="button" style={{ marginLeft: '0.5rem' }} onClick={() => setTrashModalOpen(true)}>
                      <i className="fas fa-trash-alt" /> Savat ({trashRoles.length})
                    </button>
                  </div>

                  {roleFormOpen && (
                    <div className="modal-overlay-neo" onClick={() => setRoleFormOpen(false)}>
                      <div className="modal-panel modal-lg role-create-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-neo role-create-modal-header">
                          <h4><i className="fas fa-user-plus" /> Yangi rol yaratish</h4>
                          <button type="button" className="icon-btn" onClick={() => setRoleFormOpen(false)} aria-label="Yopish"><i className="fas fa-times" /></button>
                        </div>
                        <form className="role-create-modal-body" onSubmit={handleCreateRole}>
                          <section className="role-create-section">
                            <h5 className="role-create-section-title"><i className="fas fa-id-card" /> Asosiy ma'lumotlar</h5>
                            <div className="role-create-fields">
                              <label className="role-create-label">
                                <span>Rol nomi</span>
                                <input className="role-create-input" type="text" placeholder="Masalan: Operator" value={roleForm.role_name} onChange={(e) => setRoleForm((p) => ({ ...p, role_name: e.target.value, login: normalizeLogin(e.target.value) }))} required />
                              </label>
                              <label className="role-create-label role-create-label-full">
                                <span>Kirish paneli</span>
                                <select
                                  className="role-create-input"
                                  value={roleForm.portal_role}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setRoleForm((p) => ({
                                      ...p,
                                      portal_role: v,
                                      ...(v !== 'courier' ? { courier_viloyat_id: '', courier_tuman_ids: [] } : {}),
                                    }));
                                  }}
                                >
                                  {ROLE_PORTAL_OPTIONS.map((opt) => (
                                    <option key={opt.value || 'auto'} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                <span className="muted" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.85rem' }}>
                                  Agar rol nomida «kuryer», «seller» va shu kabi kalitlar bo‘lmasa, kirish ishlashi uchun panelni aniq tanlang.
                                </span>
                              </label>
                              {roleForm.portal_role === 'courier' ? (
                                <>
                                  <label className="role-create-label role-create-label-full">
                                    <span>Kuryer hududi — viloyat / shahar</span>
                                    <select
                                      className="role-create-input"
                                      value={roleForm.courier_viloyat_id}
                                      onChange={(e) => {
                                        const vid = e.target.value;
                                        setRoleForm((p) => ({
                                          ...p,
                                          courier_viloyat_id: vid,
                                          courier_tuman_ids: vid === 'toshkent_sh' ? p.courier_tuman_ids : [],
                                        }));
                                      }}
                                      required
                                    >
                                      <option value="">— Tanlang —</option>
                                      {PACKER_UZ_VILOYATLAR.map((r) => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                    <span className="muted" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.82rem' }}>
                                      Toshkent shahri tanlansa, keyingi qatorda tuman(lar)ni belgilashingiz mumkin (bir yoki bir nechta).
                                    </span>
                                  </label>
                                  {roleForm.courier_viloyat_id === 'toshkent_sh' ? (
                                    <div className="role-create-label-full">
                                      <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Toshkent shahri — tumanlar</span>
                                      <div className="role-courier-tuman-grid">
                                        {TOSHKENT_SH_TUMANS.map((t) => (
                                          <label key={t.id} className="role-create-chip">
                                            <input
                                              type="checkbox"
                                              checked={roleForm.courier_tuman_ids.includes(t.id)}
                                              onChange={() =>
                                                setRoleForm((p) => ({
                                                  ...p,
                                                  courier_tuman_ids: p.courier_tuman_ids.includes(t.id)
                                                    ? p.courier_tuman_ids.filter((x) => x !== t.id)
                                                    : [...p.courier_tuman_ids, t.id],
                                                }))
                                              }
                                            />
                                            <span>{t.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                      <span className="muted" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem' }}>
                                        Hech biri tanlanmasa — kuryer butun Toshkent shahri deb hisoblanadi.
                                      </span>
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              <label className="role-create-label">
                                <span>Login (har rol uchun boshqa)</span>
                                <input className="role-create-input" type="text" placeholder="Masalan: seller1, kuryer1" value={roleForm.login} onChange={(e) => setRoleForm((p) => ({ ...p, login: normalizeLogin(e.target.value) || (e.target.value || '').trim() }))} required />
                              </label>
                              <label className="role-create-label">
                                <span>Parol</span>
                                <div className="role-create-input-wrap">
                                  <input className="role-create-input" type={showRoleFormPassword ? 'text' : 'password'} placeholder="Kamida 5 belgi" value={roleForm.password} onChange={(e) => setRoleForm((p) => ({ ...p, password: e.target.value }))} required />
                                  <button type="button" className="role-create-toggle-pwd" onClick={() => setShowRoleFormPassword((v) => !v)} title={showRoleFormPassword ? 'Yashirish' : "Ko'rsatish"}><i className={showRoleFormPassword ? 'fas fa-eye-slash' : 'fas fa-eye'} /></button>
                                </div>
                              </label>
                              <label className="role-create-label">
                                <span>Parolni tasdiqlash</span>
                                <input className="role-create-input" type="password" placeholder="Parolni qayta kiriting" value={roleForm.confirmPassword} onChange={(e) => setRoleForm((p) => ({ ...p, confirmPassword: e.target.value }))} required />
                              </label>
                            </div>
                          </section>
                          <section className="role-create-section">
                            <h5 className="role-create-section-title"><i className="fas fa-address-book" /> Aloqa</h5>
                            <div className="role-create-fields">
                              <label className="role-create-label">
                                <span>Telefon</span>
                                <input className="role-create-input" type="text" placeholder="+998 90 123 45 67" value={roleForm.phone} onChange={(e) => setRoleForm((p) => ({ ...p, phone: e.target.value }))} />
                              </label>
                              <label className="role-create-label">
                                <span>Email</span>
                                <input className="role-create-input" type="email" placeholder="email@example.com" value={roleForm.email} onChange={(e) => setRoleForm((p) => ({ ...p, email: e.target.value }))} />
                              </label>
                              <label className="role-create-label role-create-label-full">
                                <span>Vazifa</span>
                                <input className="role-create-input" type="text" placeholder="Qisqa vazifa nomi" value={roleForm.task} onChange={(e) => setRoleForm((p) => ({ ...p, task: e.target.value }))} />
                              </label>
                              <label className="role-create-label role-create-label-full">
                                <span>Izoh</span>
                                <textarea className="role-create-input role-create-textarea" rows={2} placeholder="Ixtiyoriy izoh" value={roleForm.description} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} />
                              </label>
                            </div>
                          </section>
                          <section className="role-create-section">
                            <h5 className="role-create-section-title"><i className="fas fa-key" /> Huquqlar</h5>
                            <div className="role-create-permissions">
                              {ROLE_PERMISSIONS.map((perm) => (
                                <label key={perm.value} className="role-create-chip">
                                  <input type="checkbox" checked={roleForm.permissions.includes(perm.value)} onChange={() => toggleRolePermission(perm.value)} />
                                  <span>{perm.label}</span>
                                </label>
                              ))}
                              <div className="role-create-permissions-actions">
                                <button type="button" className="btn-neo btn-neo-outline" onClick={toggleAllRolePermissions}>Barcha huquqlar</button>
                              </div>
                            </div>
                          </section>
                          <div className="role-create-modal-footer">
                            <button type="button" className="btn-neo" onClick={() => setRoleFormOpen(false)}>Bekor qilish</button>
                            <button type="submit" className="btn-neo btn-neo-primary" disabled={busyKey === 'role-create'}><i className="fas fa-check" /> Rolni saqlash</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  <div className="panel-card">
                    <div className="role-create">
                      <input type="text" className="neo-input" placeholder="Rol ID yoki ism" value={roleSearchInput} onChange={(e) => setRoleSearchInput(e.target.value)} />
                      <button type="button" className="btn-neo btn-neo-primary" onClick={() => setActiveRoleFilter(roleSearchInput.trim())}>Qidirish</button>
                      <button type="button" className="btn-neo" onClick={() => { setRoleSearchInput(''); setActiveRoleFilter(''); }}>Tozalash</button>
                    </div>
                    <div className="stats-mini-grid stats-mini-grid-roles">
                      <div className="mini-stat-card mini-stat-card-simple"><span>Jami</span><strong>{roleStats.total}</strong></div>
                      <div className="mini-stat-card mini-stat-card-simple"><span>Aktiv</span><strong>{roleStats.active}</strong></div>
                      <div className="mini-stat-card mini-stat-card-simple"><span>Kutilmoqda</span><strong>{roleStats.pending}</strong></div>
                      <div className="mini-stat-card mini-stat-card-simple"><span>O'chirilgan</span><strong>{roleStats.deleted}</strong></div>
                    </div>
                    <div className="roles-list">
                      {filteredRoles.map((role) => (
                        <div key={role.id} className="role-card">
                          <div className="role-card-head">
                            <strong>{role.role_name} #{role.id}</strong>
                            <span className={`status-pill ${role.status}`}>{role.status}</span>
                          </div>
                          <div className="role-card-grid">
                            <span>Login: {role.login}</span>
                            <span>Telefon: {role.phone || '-'}</span>
                            <span>Email: {role.email || '-'}</span>
                            <span>Jami: {formatCurrency(role.total_amount)}</span>
                            {role.portal_role === 'courier' ? (
                              <span className="role-card-hudud">
                                Hudud:{' '}
                                {PACKER_UZ_VILOYATLAR.find((v) => v.id === role.courier_viloyat_id)?.name ||
                                  role.courier_viloyat_id ||
                                  '—'}
                                {role.courier_viloyat_id === 'toshkent_sh' && Array.isArray(role.courier_tuman_ids) && role.courier_tuman_ids.length > 0
                                  ? ` · ${role.courier_tuman_ids.map((id) => TOSHKENT_SH_TUMANS.find((t) => t.id === id)?.label || id).join(', ')}`
                                  : null}
                              </span>
                            ) : null}
                          </div>
                          <div className="row-actions">
                            <button type="button" className="btn-neo" onClick={() => openRoleModal(role)}>Ko'rish</button>
                            <button type="button" className="btn-neo btn-neo-success" onClick={() => handleRoleAction('activate', role)} disabled={busyKey === `role-action-${role.id}-activate`}>Aktiv</button>
                            <button type="button" className="btn-neo btn-neo-warning" onClick={() => handleRoleAction('block', role)} disabled={busyKey === `role-action-${role.id}-block`}>Block</button>
                            <button type="button" className="btn-neo btn-neo-danger" onClick={() => handleRoleAction('delete', role)} disabled={busyKey === `role-action-${role.id}-delete`}>O'chirish</button>
                          </div>
                        </div>
                      ))}
                      {filteredRoles.length === 0 && <p className="muted">Rol topilmadi</p>}
                    </div>
                  </div>
                </div>
              )}

                            {activeView === 'couriers' && (
                <div className="panel-card admin-couriers-panel">
                  <div className="panel-head"><h4>Kuryerlar</h4></div>
                  <div className="admin-couriers-fee-row">
                    <span className="admin-couriers-fee-label">Kuryer haqqi (har bir yetkazuv uchun, so&apos;m):</span>
                    <input type="number" className="neo-input" min="0" placeholder="25000" value={courierFee} onChange={(e) => setCourierFee(e.target.value)} />
                    <button type="button" className="btn-neo btn-neo-primary" onClick={handleSaveCourierFee} disabled={busyKey === 'courier-fee'}>Saqlash</button>
                  </div>
                  <div className="admin-couriers-search-block">
                    <input
                      type="search"
                      className="neo-input admin-couriers-search-input"
                      placeholder="Ism, telefon, viloyat yoki ID bo‘yicha qidiring…"
                      value={courierSearchQuery}
                      onChange={(e) => setCourierSearchQuery(e.target.value)}
                      aria-label="Kuryer qidiruv"
                    />
                    <p className="muted admin-couriers-search-hint">
                      Bu yerda kuryer qo‘shilmaydi. Faqat qidiruv: natijada ID, F.I.Sh, login, telefon va buyurtmalar soni ko‘rinadi.
                    </p>
                    <p className="muted admin-couriers-search-hint admin-couriers-search-hint-second">
                      Qidiruvni kiriting — mos kuryerlar ro‘yxati shu yerda ochiladi.
                    </p>
                  </div>
                  {!courierSearchQuery.trim() ? null : filteredCouriers.length === 0 ? (
                    <p className="muted admin-couriers-muted-center">Hech narsa topilmadi. Boshqa ism, telefon yoki viloyat nomini sinab ko‘ring.</p>
                  ) : (
                    <div className="table-wrap admin-couriers-results">
                      <table className="neo-table admin-couriers-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>F.I.Sh</th>
                            <th>Login</th>
                            <th>Telefon</th>
                            <th>Zakaz</th>
                            <th>Amal</th>
                          </tr>
                        </thead>
                      <tbody>
                          {filteredCouriers.map((row) => {
                            return (
                          <tr key={row.id}>
                            <td>{row.id}</td>
                                <td>{row.full_name || '—'}</td>
                                <td><code className="admin-couriers-login-code">{row.login || '—'}</code></td>
                                <td>{row.phone || '—'}</td>
                            <td>{row.orders_handled ?? 0}</td>
                                <td className={courierEditId === row.id ? 'admin-couriers-amal-editing' : undefined}>
                              {courierEditId === row.id ? (
                                    <div className="admin-courier-credential-edit">
                                      <div className="admin-courier-credential-fields">
                                        <label className="admin-courier-credential-field">
                                          <span className="admin-courier-credential-label">Login</span>
                                          <input
                                            type="text"
                                            className="neo-input"
                                            autoComplete="username"
                                            placeholder="Yangi login"
                                            value={courierEditDraft.login}
                                            onChange={(e) => setCourierEditDraft((p) => ({ ...p, login: e.target.value }))}
                                          />
                                        </label>
                                        <label className="admin-courier-credential-field">
                                          <span className="admin-courier-credential-label">Yangi parol</span>
                                          <input
                                            type="password"
                                            className="neo-input"
                                            autoComplete="new-password"
                                            placeholder="Bo'sh = o'zgarmaydi"
                                            value={courierEditDraft.password}
                                            onChange={(e) => setCourierEditDraft((p) => ({ ...p, password: e.target.value }))}
                                          />
                                        </label>
                                      </div>
                                      <div className="admin-courier-credential-actions">
                                        <button type="button" className="btn-neo btn-neo-primary btn-neo-sm" onClick={() => handleUpdateCourier(row.id)} disabled={busyKey === `courier-update-${row.id}`}>Saqlash</button>
                                        <button type="button" className="btn-neo btn-neo-sm" onClick={() => { setCourierEditId(null); setCourierEditDraft({ login: '', password: '' }); }}>Bekor</button>
                                      </div>
                                </div>
                              ) : (
                                <button type="button" className="btn-neo btn-neo-primary" onClick={() => { setCourierEditId(row.id); setCourierEditDraft({ login: row.login || '', password: '' }); }}>Login / parol</button>
                              )}
                            </td>
                          </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              )}

                            {activeView === 'operators' && (
                <div className="panel-card admin-staff-simple-panel">
                  <div className="panel-head"><h4>Operatorlar</h4></div>
                  <div className="admin-couriers-search-block">
                    <input
                      type="search"
                      className="neo-input admin-couriers-search-input"
                      placeholder="ID, ism, telefon yoki email bo‘yicha qidiring…"
                      value={operatorSearchInput}
                      onChange={(e) => setOperatorSearchInput(e.target.value)}
                      aria-label="Operator qidiruv"
                    />
                    <p className="muted admin-couriers-search-hint">
                      Bu yerda operator qo‘shilmaydi. Yozishni to‘xtatgach qisqa tanaffusdan keyin qidiruv avtomatik yangilanadi (taxminan 0,3 s).
                    </p>
                    <p className="muted admin-couriers-search-hint admin-couriers-search-hint-second">
                      Qidiruv matnini kiriting — mos operatorlar ro‘yxati pastda ochiladi.
                    </p>
                    </div>
                  {!operatorSearchDebounced.trim() ? (
                    <p className="muted admin-couriers-muted-center">Qidiruvni kiriting — operatorlar shu yerda ko‘rinadi.</p>
                  ) : filteredOperators.length === 0 ? (
                    <p className="muted admin-couriers-muted-center">Hech narsa topilmadi. Boshqa ism, telefon, email yoki ID bilan sinab ko‘ring.</p>
                  ) : (
                    <AdminStaffSimpleTable
                      rows={filteredOperators}
                      busyKey={busyKey}
                      staffDrafts={staffDrafts}
                      setStaffDrafts={setStaffDrafts}
                      handleSaveStaff={handleSaveStaff}
                      handleDeleteStaff={handleDeleteStaff}
                    />
                  )}
    </div>
              )}

                            {activeView === 'packers' && (
                <div className="panel-card admin-staff-simple-panel">
                  <div className="panel-head"><h4>Packerlar</h4></div>
                  <div className="admin-couriers-search-block">
                    <input
                      type="search"
                      className="neo-input admin-couriers-search-input"
                      placeholder="ID, ism, telefon yoki email bo‘yicha qidiring…"
                      value={packerSearchInput}
                      onChange={(e) => setPackerSearchInput(e.target.value)}
                      aria-label="Packer qidiruv"
                    />
                    <p className="muted admin-couriers-search-hint">
                      Bu yerda packer qo‘shilmaydi. Yozishni to‘xtatgach qisqa tanaffusdan keyin qidiruv avtomatik yangilanadi (taxminan 0,3 s).
                    </p>
                    <p className="muted admin-couriers-search-hint admin-couriers-search-hint-second">
                      Qidiruv matnini kiriting — mos packerlar ro‘yxati pastda ochiladi.
                    </p>
                  </div>
                  {!packerSearchDebounced.trim() ? (
                    <p className="muted admin-couriers-muted-center">Qidiruvni kiriting — packerlar shu yerda ko‘rinadi.</p>
                  ) : filteredPackers.length === 0 ? (
                    <p className="muted admin-couriers-muted-center">Hech narsa topilmadi. Boshqa ism, telefon, email yoki ID bilan sinab ko‘ring.</p>
                  ) : (
                    <AdminStaffSimpleTable
                      rows={filteredPackers}
                      busyKey={busyKey}
                      staffDrafts={staffDrafts}
                      setStaffDrafts={setStaffDrafts}
                      handleSaveStaff={handleSaveStaff}
                      handleDeleteStaff={handleDeleteStaff}
                    />
                  )}
                </div>
              )}

                            {activeView === 'pickers' && (
                <div className="panel-card admin-staff-simple-panel">
                  <div className="panel-head"><h4>Pickerlar</h4></div>
                  <div className="admin-couriers-search-block">
                    <input
                      type="search"
                      className="neo-input admin-couriers-search-input"
                      placeholder="ID, ism, telefon yoki email bo‘yicha qidiring…"
                      value={pickerSearchInput}
                      onChange={(e) => setPickerSearchInput(e.target.value)}
                      aria-label="Picker qidiruv"
                    />
                    <p className="muted admin-couriers-search-hint">
                      Bu yerda picker qo‘shilmaydi. Yozishni to‘xtatgach qisqa tanaffusdan keyin qidiruv avtomatik yangilanadi (taxminan 0,3 s).
                    </p>
                    <p className="muted admin-couriers-search-hint admin-couriers-search-hint-second">
                      Qidiruv matnini kiriting — mos pickerlar ro‘yxati pastda ochiladi.
                    </p>
                  </div>
                  {!pickerSearchDebounced.trim() ? (
                    <p className="muted admin-couriers-muted-center">Qidiruvni kiriting — pickerlar shu yerda ko‘rinadi.</p>
                  ) : filteredPickers.length === 0 ? (
                    <p className="muted admin-couriers-muted-center">Hech narsa topilmadi. Boshqa ism, telefon, email yoki ID bilan sinab ko‘ring.</p>
                  ) : (
                    <AdminStaffSimpleTable
                      rows={filteredPickers}
                      busyKey={busyKey}
                      staffDrafts={staffDrafts}
                      setStaffDrafts={setStaffDrafts}
                      handleSaveStaff={handleSaveStaff}
                      handleDeleteStaff={handleDeleteStaff}
                    />
                  )}
                </div>
              )}

              {['orders', 'hold', 'atkaz', 'arxiv', 'delivery', 'on_the_way'].includes(activeView) && (() => {
                const map = { hold: 'hold', atkaz: 'cancelled', arxiv: 'archived', delivery: 'delivery', on_the_way: 'on_the_way' };
                const fixed = map[activeView] || null;
                const query = orderFilter.search.trim().toLowerCase();
                const rows = orders.filter((row) => {
                  if (fixed && row.status !== fixed) return false;
                  if (!fixed && orderFilter.status !== 'all' && row.status !== orderFilter.status) return false;
                  if (!query) return true;
                  return `${row.id} ${row.full_name || ''} ${row.email || ''} ${row.contact_phone || ''}`.toLowerCase().includes(query);
                });
                return (
                  <div className="panel-card admin-orders-panel">
                    <div className="panel-head"><h4>{activeMeta.label}</h4></div>
                    <div className={`admin-orders-toolbar${fixed ? ' admin-orders-toolbar--single' : ''}`}>
                      <input
                        type="text"
                        className="neo-input admin-orders-search"
                        placeholder="ID yoki mijoz"
                        value={orderFilter.search}
                        onChange={(e) => setOrderFilter((p) => ({ ...p, search: e.target.value }))}
                        aria-label="Buyurtma qidiruv"
                      />
                      {!fixed && (
                        <AdminOptionsDropdown
                          options={ORDER_FILTER_OPTIONS}
                          value={orderFilter.status}
                          onChange={(v) => setOrderFilter((p) => ({ ...p, status: v }))}
                          ariaLabel="Buyurtma holati bo‘yicha filtr"
                          placeholder="Barchasi"
                        />
                      )}
                    </div>
                    <div className="table-wrap admin-orders-table-wrap">
                      <table className="neo-table admin-orders-table">
                        <thead>
                          <tr>
                            <th className="admin-orders-col-id">ID</th>
                            <th className="admin-orders-col-mijoz">Mijoz</th>
                            <th className="admin-orders-col-phone">Telefon</th>
                            <th className="admin-orders-col-num">Element</th>
                            <th className="admin-orders-col-jami">Jami</th>
                            <th className="admin-orders-col-status">Status</th>
                            <th className="admin-orders-col-tez">Tez</th>
                            <th className="admin-orders-col-date">Sana</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const tezValue = row.status === 'delivery' || row.status === 'on_the_way' ? row.status : '';
                            return (
                            <tr key={row.id}>
                                <td className="admin-orders-col-id">#{row.id}</td>
                                <td className="admin-orders-col-mijoz">{row.full_name || row.email || '-'}</td>
                                <td className="admin-orders-col-phone">{row.contact_phone || '-'}</td>
                                <td className="admin-orders-col-num">{row.items_count || 0}</td>
                                <td className="admin-orders-col-jami admin-orders-jami">{formatCurrency(row.total_amount)}</td>
                                <td className="admin-orders-col-status">
                                  <AdminOptionsDropdown
                                    options={ORDER_STATUS_OPTIONS}
                                    value={row.status}
                                    onChange={(v) => handleOrderStatusChange(row.id, v)}
                                    ariaLabel={`Buyurtma #${row.id} holati`}
                                    variant="table-cell"
                                    disabled={busyKey === `order-${row.id}`}
                                  />
                              </td>
                                <td className="admin-orders-col-tez">
                                  <AdminOptionsDropdown
                                    options={ORDER_TEZ_OPTIONS}
                                    value={tezValue}
                                    onChange={(v) => handleOrderStatusChange(row.id, v)}
                                    ariaLabel={`Buyurtma #${row.id} tez holat`}
                                    placeholder="Tanlang"
                                    variant="table-cell"
                                    disabled={busyKey === `order-${row.id}`}
                                  />
                                </td>
                                <td className="admin-orders-col-date">{formatDate(row.created_at)}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {activeView === 'customers' && (
                <div className="panel-card admin-customers-panel">
                  <div className="panel-head"><h4>Mijozlar (ro‘yxatdan o‘tganlar)</h4></div>
                  <div className="admin-customers-toolbar">
                    <input
                      type="search"
                      className="neo-input admin-customers-search"
                      placeholder="ID, ism, login, telefon, IP yoki qurilma bo‘yicha qidiring..."
                      value={customerSearchInput}
                      onChange={(e) => setCustomerSearchInput(e.target.value)}
                      aria-label="Mijozlarni qidirish"
                    />
                  </div>
                  <div className="table-wrap admin-customers-table-wrap">
                    <table className="neo-table admin-customers-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>F.I.Sh</th>
                          <th>Login / Email</th>
                          <th>Telefon</th>
                          <th>Parol</th>
                          <th>Buyurtmalar</th>
                          <th>Holat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomers.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="muted">Mijoz topilmadi.</td>
                          </tr>
                        ) : (
                          filteredCustomers.map((row) => (
                            <tr key={row.id} className="admin-customer-row" onClick={() => openCustomerDetail(row)}>
                              <td>#{row.id}</td>
                              <td>{customerCellValue(row.full_name)}</td>
                              <td>
                                <div className="admin-customers-login-cell">
                                  <strong>{customerCellValue(row.login)}</strong>
                                  <span className="muted">{customerCellValue(row.email)}</span>
                                </div>
                              </td>
                              <td>{customerCellValue(row.phone, 'Kiritilmagan')}</td>
                              <td>
                                <div className="admin-customers-pass-inline">
                                  <span className="admin-customers-pass-chip">
                                    {row.password_plain
                                      ? (customerPasswordVisible[row.id] ? row.password_plain : '••••••••')
                                      : (row.has_password_hash ? "Ma'lum emas" : "O'rnatilmagan")}
                                  </span>
                                  <button
                                    type="button"
                                    className="admin-customers-eye-btn"
                                    aria-label={customerPasswordVisible[row.id] ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCustomerPasswordVisible((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
                                    }}
                                  >
                                    <i className={`fas ${customerPasswordVisible[row.id] ? 'fa-eye-slash' : 'fa-eye'}`} />
                                  </button>
                                </div>
                              </td>
                              <td>{Number(row.orders_count) || 0}</td>
                              <td>
                                <div className="admin-customer-status-wrap">
                                  <span
                                    className={`admin-customer-status-badge ${
                                      String(row.status || '').toLowerCase() === 'blocked' ? 'is-blocked' : 'is-active'
                                    }`}
                                  >
                                    <i aria-hidden />
                                    {String(row.status || '').toLowerCase() === 'blocked' ? 'Blok' : 'Aktiv'}
                                  </span>
                                  <button
                                    type="button"
                                    className={`btn-neo btn-sm ${
                                      String(row.status || '').toLowerCase() === 'blocked' ? 'btn-neo-success' : 'btn-neo-danger'
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCustomerStatusToggle(row);
                                    }}
                                    disabled={busyKey === `customer-status-${row.id}`}
                                  >
                                    {busyKey === `customer-status-${row.id}`
                                      ? 'Saqlanmoqda'
                                      : String(row.status || '').toLowerCase() === 'blocked'
                                        ? 'Aktiv'
                                        : 'Blok'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeView === 'customer_detail' && (
                <div className="panel-card admin-customer-detail-panel">
                  <div className="panel-head admin-customer-detail-head">
                    <button
                      type="button"
                      className="btn-neo seller-shop-back"
                      onClick={() =>
                        setSearchParams(
                          (p) => {
                            const next = new URLSearchParams(p);
                            next.set('view', 'customers');
                            next.delete('customer_id');
                            return next;
                          },
                          { replace: true },
                        )
                      }
                    >
                      <i className="fas fa-arrow-left" /> Mijozlar ro‘yxati
                    </button>
                    <h4>Mijoz profili</h4>
                  </div>

                  {!selectedCustomer ? (
                    <p className="muted">Mijoz topilmadi yoki mavjud emas.</p>
                  ) : (
                    <>
                      <div className="admin-customer-detail-orders">
                        <h5>Monitoring ma’lumotlari</h5>
                        <div className="admin-customer-monitor-table-wrap">
                          <table className="neo-table admin-customer-monitor-table">
                            <thead>
                              <tr>
                                <th className="admin-customer-monitor-pass-th">
                                  <span>Parol</span>
                                  <div className="admin-customers-password-actions">
                                    <input
                                      type="text"
                                      className="neo-input admin-customers-password-input"
                                      placeholder="Yangi parol"
                                      value={customerPasswordDrafts[selectedCustomer.id] || ''}
                                      onChange={(e) =>
                                        setCustomerPasswordDrafts((prev) => ({ ...prev, [selectedCustomer.id]: e.target.value }))
                                      }
                                      aria-label={`Mijoz #${selectedCustomer.id} yangi paroli`}
                                    />
                                    <button
                                      type="button"
                                      className="btn-neo btn-neo-primary admin-customers-password-btn"
                                      disabled={busyKey === `customer-password-${selectedCustomer.id}`}
                                      onClick={() => handleResetCustomerPassword(selectedCustomer.id)}
                                      title="Mijoz uchun yangi parol o‘rnatish"
                                    >
                                      <i
                                        className={`fas ${
                                          busyKey === `customer-password-${selectedCustomer.id}`
                                            ? 'fa-spinner fa-spin'
                                            : 'fa-key admin-password-key-icon'
                                        }`}
                                      />
                                    </button>
                                  </div>
                                </th>
                                <th>Ro‘yxatdan o‘tgan sana</th>
                                <th>Ro‘yxatdan o‘tgan qurilma</th>
                                <th>Ro‘yxatdan o‘tgan manba</th>
                                <th>Oxirgi login vaqti</th>
                                <th>Oxirgi login qurilma</th>
                                <th>Oxirgi login manba</th>
                                <th>Buyurtmalar</th>
                                <th>Oxirgi buyurtma vaqti</th>
                                <th>Oxirgi buyurtma qurilma</th>
                                <th>Oxirgi buyurtma manba</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>
                                  <div className="admin-customer-pass-head">
                                    <strong className="admin-customer-pass-value">
                                      {selectedCustomer.password_plain
                                        ? (customerPasswordVisible[selectedCustomer.id] ? selectedCustomer.password_plain : '••••••••')
                                        : (selectedCustomer.has_password_hash ? "Ma'lum emas" : "O'rnatilmagan")}
                                    </strong>
                                    <button
                                      type="button"
                                      className="admin-customers-eye-btn"
                                      aria-label={customerPasswordVisible[selectedCustomer.id] ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                                      onClick={() =>
                                        setCustomerPasswordVisible((prev) => ({
                                          ...prev,
                                          [selectedCustomer.id]: !prev[selectedCustomer.id],
                                        }))
                                      }
                                    >
                                      <i className={`fas ${customerPasswordVisible[selectedCustomer.id] ? 'fa-eye-slash' : 'fa-eye'}`} />
                                    </button>
                                  </div>
                                  <div className="admin-customers-password-cell">
                                    <small className="admin-customers-password-note">
                                      {selectedCustomer.has_password_hash
                                        ? "Agar bo'sh bo'lsa, eski parol tizimga ochiq saqlanmagan"
                                        : 'Parol o‘rnatilmagan'}
                                    </small>
                                    {selectedCustomerOldPasswords.length > 0 && (
                                      <div className="admin-customers-old-passwords">
                                        <button
                                          type="button"
                                          className="admin-customers-old-passwords-toggle"
                                          onClick={() =>
                                            setCustomerOldPasswordsOpen((prev) => ({
                                              ...prev,
                                              [selectedCustomer.id]: !prev[selectedCustomer.id],
                                            }))
                                          }
                                          aria-expanded={Boolean(customerOldPasswordsOpen[selectedCustomer.id])}
                                        >
                                          Eski parollar ({selectedCustomerOldPasswords.length})
                                          <i
                                            className={`fas ${
                                              customerOldPasswordsOpen[selectedCustomer.id] ? 'fa-chevron-up' : 'fa-chevron-down'
                                            }`}
                                            aria-hidden
                                          />
                                        </button>
                                        {customerOldPasswordsOpen[selectedCustomer.id] && (
                                          <div className="admin-old-passwords-overlay" onClick={() =>
                                            setCustomerOldPasswordsOpen((prev) => ({
                                              ...prev,
                                              [selectedCustomer.id]: false,
                                            }))
                                          }>
                                            <div
                                              className="admin-old-passwords-panel"
                                              onClick={(e) => e.stopPropagation()}
                                              role="dialog"
                                              aria-label="Eski parollar"
                                            >
                                              <div className="admin-old-passwords-panel-head">
                                                <strong>Eski parollar</strong>
                                                <button
                                                  type="button"
                                                  className="admin-old-passwords-close-btn"
                                                  onClick={() =>
                                                    setCustomerOldPasswordsOpen((prev) => ({
                                                      ...prev,
                                                      [selectedCustomer.id]: false,
                                                    }))
                                                  }
                                                >
                                                  ×
                                                </button>
                                              </div>
                                              <ul>
                                                {selectedCustomerOldPasswords.map((pwd, idx) => (
                                                  <li key={`${selectedCustomer.id}-oldpwd-${pwd.id ?? idx}`}>
                                                    <span>{pwd.value}</span>
                                                    {pwd.id ? (
                                                      <button
                                                        type="button"
                                                        className="admin-old-password-remove-btn"
                                                        title="Eski parolni o‘chirish"
                                                        onClick={() => handleDeleteOldPassword(selectedCustomer.id, pwd.id)}
                                                      >
                                                        x
                                                      </button>
                                                    ) : null}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td>{selectedCustomer.created_at ? formatDateTimeUz(selectedCustomer.created_at, { empty: "Ma'lumot kelmagan" }) : "Ma'lumot kelmagan"}</td>
                                <td>{customerCellValue(selectedCustomer.registered_device)}</td>
                                <td>{customerCellValue(selectedCustomer.registered_ip)} | {customerCellValue(selectedCustomer.registered_location)}</td>
                                <td>{selectedCustomer.last_login_at ? formatDateTimeUz(selectedCustomer.last_login_at, { empty: 'Hali login qilmagan' }) : 'Hali login qilmagan'}</td>
                                <td>{customerCellValue(selectedCustomer.last_login_device)}</td>
                                <td>{customerCellValue(selectedCustomer.last_login_ip)} | {customerCellValue(selectedCustomer.last_login_location)}</td>
                                <td>{Number(selectedCustomer.orders_count) || 0}</td>
                                <td>{selectedCustomer.latest_order_at ? formatDateTimeUz(selectedCustomer.latest_order_at, { empty: "Ma'lumot kelmagan" }) : "Buyurtma yo'q"}</td>
                                <td>{customerCellValue(selectedCustomer.latest_order_device, "Buyurtma ma'lumoti yo'q")}</td>
                                <td>{customerCellValue(selectedCustomer.latest_order_ip, "Buyurtma manbasi yo'q")} | {customerCellValue(selectedCustomer.latest_order_location, "Lokatsiya yo'q")}</td>
                              </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                      <div className="admin-customer-detail-orders">
                        <h5>Barcha buyurtmalar (eski va yangi)</h5>
                        {selectedCustomerOrders.length === 0 ? (
                          <p className="muted">Bu mijozda hozircha buyurtma yo‘q.</p>
                        ) : (
                          <div className="table-wrap">
                            <table className="neo-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>Mahsulot soni</th>
                                  <th>Mahsulot nomlari</th>
                                  <th>Holat</th>
                                  <th>Jami</th>
                                  <th>Sana</th>
                                  <th>Telefon</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedCustomerOrders.map((o) => (
                                  <tr key={o.id}>
                                    <td>#{o.id}</td>
                                    <td>{Number(o.items_count) || 0}</td>
                                    <td>{customerCellValue(o.product_names, "Ma'lumot yo'q")}</td>
                                    <td>
                                      <AdminOptionsDropdown
                                        options={ORDER_STATUS_OPTIONS}
                                        value={o.status}
                                        onChange={(v) => handleOrderStatusChange(o.id, v)}
                                        ariaLabel={`Mijoz buyurtmasi #${o.id} holati`}
                                        variant="table-cell"
                                        disabled={busyKey === `order-${o.id}`}
                                      />
                                    </td>
                                    <td>{formatCurrency(o.total_amount)}</td>
                                    <td>{formatDateTimeUz(o.created_at, { empty: "Ma'lumot kelmagan" })}</td>
                                    <td>{customerCellValue(o.contact_phone, 'Kiritilmagan')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeView === 'regions' && (
                <div className="panel-card">
                  <div className="panel-head"><h4>Viloyatlar</h4></div>
                  <form className="role-create" onSubmit={handleCreateRegion}>
                    <input type="text" className="neo-input" placeholder="Viloyat nomi" value={regionForm.name} onChange={(e) => setRegionForm((p) => ({ ...p, name: e.target.value }))} required />
                    <input type="number" className="neo-input" min="0" placeholder="Yetkazish narxi" value={regionForm.delivery_fee} onChange={(e) => setRegionForm((p) => ({ ...p, delivery_fee: e.target.value }))} required />
                    <label className="role-page-chip"><input type="checkbox" checked={regionForm.active} onChange={(e) => setRegionForm((p) => ({ ...p, active: e.target.checked }))} /><span>Aktiv</span></label>
                    <button type="submit" className="btn-neo btn-neo-primary">Qo'shish</button>
                  </form>
                  <div className="table-wrap"><table className="neo-table"><thead><tr><th>ID</th><th>Nomi</th><th>Yetkazish</th><th>Staff</th><th>Seller</th><th>Aktiv</th><th>Amal</th></tr></thead><tbody>{regions.map((row) => { const d = regionDrafts[row.id] || { name: row.name, delivery_fee: row.delivery_fee, active: Boolean(row.active) }; return <tr key={row.id}><td>{row.id}</td><td><input className="neo-input" value={d.name} onChange={(e) => setRegionDrafts((p) => ({ ...p, [row.id]: { ...d, name: e.target.value } }))} /></td><td><input className="neo-input" type="number" min="0" value={d.delivery_fee} onChange={(e) => setRegionDrafts((p) => ({ ...p, [row.id]: { ...d, delivery_fee: e.target.value } }))} /></td><td>{row.staff_count || 0}</td><td>{row.sellers_count || 0}</td><td><label className="role-page-chip"><input type="checkbox" checked={Boolean(d.active)} onChange={(e) => setRegionDrafts((p) => ({ ...p, [row.id]: { ...d, active: e.target.checked } }))} /><span>{d.active ? 'Ha' : 'Yo\'q'}</span></label></td><td><div className="row-actions"><button type="button" className="btn-neo btn-neo-primary" onClick={() => handleSaveRegion(row.id)}>Saqlash</button><button type="button" className="btn-neo btn-neo-danger" onClick={() => handleDeleteRegion(row.id)}>O'chirish</button></div></td></tr>; })}</tbody></table></div>
                </div>
              )}

              {activeView === 'seller_search' && (
                <div className="panel-card seller-search-page">
                  <div className="seller-search-wrap seller-search-wrap-center">
                    <input
                      type="text"
                      className="neo-input seller-search-input"
                      placeholder="Seller ID, ism yoki telefon..."
                      value={sellerSearchQuery}
                      onChange={(e) => setSellerSearchQuery(e.target.value)}
                      autoFocus
                      aria-label="Seller qidirish"
                    />
                    {sellerLookupLoading && <span className="seller-search-loading" aria-hidden="true"><i className="fas fa-spinner fa-spin" /></span>}
                  </div>
                  <div className="seller-search-result">
                    {sellerSearchResults.length > 0 && !sellerLookup && (
                      <ul className="seller-search-list" aria-label="Qidiruv natijalari">
                        {sellerSearchResults.map((s) => (
                          <li key={s.id}>
                            <button type="button" className="seller-search-item" onClick={() => openSellerDetail(s)}>
                              <span className="seller-search-item-id">#{s.id}</span>
                              <span className="seller-search-item-name">{s.name || '—'}</span>
                              <span className="seller-search-item-phone">{s.contact_phone || s.email || '—'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {sellerSearchQuery.trim() && !sellerLookupLoading && sellerSearchResults.length === 0 && !sellerLookup && <p className="seller-search-empty">Seller topilmadi.</p>}
                  </div>
                </div>
              )}

              {activeView === 'product_moderation' && (
                <div className="panel-card product-moderation-page">
                  <div className="panel-head">
                    <h4><i className="fas fa-box-open" /> Mahsulotlar — seller</h4>
                    <div className="row-actions admin-moderation-toolbar">
                      <AdminModerationFilterDropdown value={sellerModFilter} onChange={setSellerModFilter} />
                    </div>
                  </div>
                  <p className="muted" style={{ marginBottom: '1rem' }}>
                    «Tasdiqlash» bosilganda mahsulot darhol sotuvda ochiladi; qatorlar ro‘yxatda qoladi. Barcha maydonlarni «Tahrirlash» orqali o‘zgartirish mumkin.
                  </p>
                  {sellerModerationLoading ? (
                    <p className="muted">Yuklanmoqda</p>
                  ) : filteredSellerModeration.length === 0 ? (
                    <p className="muted">
                      {sellerModerationList.length === 0 ? 'Seller mahsulotlari yo‘q.' : 'Bu filtr bo‘yicha mahsulot topilmadi.'}
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table className="neo-table">
                        <thead>
                          <tr>
                            <th className="product-moderation-th-thumb" />
                            <th>ID</th>
                            <th>Holat</th>
                            <th>Nomi</th>
                            <th>Seller</th>
                            <th>Kategoriya</th>
                            <th>Narx</th>
                            <th>Ombor</th>
                            <th>Qo&apos;shilgan</th>
                            <th>Amal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSellerModeration.map((p) => {
                            const sellerEmail = p.seller_email || p.email;
                            const st = String(p.status || 'pending').toLowerCase();
                            const needAppr = sellerModerationNeedsApprove(p.status);
                            return (
                              <tr key={p.id}>
                                <td>
                                  {p.image_url ? (
                                    <img src={p.image_url} alt="" className="product-moderation-thumb" />
                                  ) : (
                                    <span className="product-moderation-thumb product-moderation-thumb--empty" aria-hidden="true">
                                      <i className="fas fa-image" />
                                    </span>
                                  )}
                                </td>
                                <td>{p.id}</td>
                                <td>
                                  <span className={`status-pill ${st === 'active' ? 'active' : 'pending'}`}>
                                    {productStatusLabelUz(p.status)}
                                  </span>
                                </td>
                                <td>{p.name_uz || p.name_ru || '—'}</td>
                                <td>
                                  <div><strong>{p.seller_name || '—'}</strong> <span className="muted">#{p.seller_id}</span></div>
                                  {p.seller_phone ? (
                                    <div>
                                      <a href={`tel:${String(p.seller_phone).replace(/\s/g, '')}`}>{p.seller_phone}</a>
                                    </div>
                                  ) : null}
                                  {sellerEmail ? (
                                    <div>
                                      <a href={`mailto:${sellerEmail}`}>{sellerEmail}</a>
                                    </div>
                                  ) : null}
                                </td>
                                <td>{p.category || '—'}</td>
                                <td>{formatCurrency(p.price)}</td>
                                <td>{p.stock ?? 0}</td>
                                <td>{formatDate(p.created_at)}</td>
                                <td>
                                  <div className="row-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                                    {needAppr ? (
                                      <button
                                        type="button"
                                        className="btn-neo btn-neo-success btn-sm"
                                        disabled={busyKey === `product-moderate-${p.id}` || !isSuperuser}
                                        onClick={() => handleApproveSellerProduct(p.id)}
                                      >
                                        Tasdiqlash (sotuvga)
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="btn-neo btn-sm"
                                      disabled={!isSuperuser}
                                      onClick={() => openSellerProductEdit(p)}
                                    >
                                      Tahrirlash
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {sellerProductEdit && (
                    <div className="modal-overlay-neo" onClick={() => setSellerProductEdit(null)}>
                      <div className="modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-neo">
                          <h4>Mahsulot #{sellerProductEdit.id} — tahrirlash</h4>
                          <button type="button" className="icon-btn" onClick={() => setSellerProductEdit(null)} aria-label="Yopish">
                            <i className="fas fa-times" />
                          </button>
                        </div>
                        <form className="role-create-modal-body" onSubmit={handleSaveSellerProductAdmin}>
                          <div className="role-create-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                            <label className="role-create-label">
                              <span>Nomi (UZ)</span>
                              <input className="role-create-input" value={sellerProductEdit.name_uz} onChange={(e) => setSellerProductEdit((x) => ({ ...x, name_uz: e.target.value }))} required />
                            </label>
                            <label className="role-create-label">
                              <span>Nomi (RU)</span>
                              <input className="role-create-input" value={sellerProductEdit.name_ru} onChange={(e) => setSellerProductEdit((x) => ({ ...x, name_ru: e.target.value }))} />
                            </label>
                            <label className="role-create-label role-create-label-full">
                              <span>Tavsif</span>
                              <textarea className="role-create-input role-create-textarea" rows={2} value={sellerProductEdit.description_uz} onChange={(e) => setSellerProductEdit((x) => ({ ...x, description_uz: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Kategoriya</span>
                              <input className="role-create-input" value={sellerProductEdit.category} onChange={(e) => setSellerProductEdit((x) => ({ ...x, category: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Narx</span>
                              <input className="role-create-input" type="number" min="0" step="1" value={sellerProductEdit.price} onChange={(e) => setSellerProductEdit((x) => ({ ...x, price: e.target.value }))} required />
                            </label>
                            <label className="role-create-label">
                              <span>Ombor</span>
                              <input className="role-create-input" type="number" min="0" value={sellerProductEdit.stock} onChange={(e) => setSellerProductEdit((x) => ({ ...x, stock: e.target.value }))} required />
                            </label>
                            <label className="role-create-label role-create-label-full">
                              <span>Rasm URL</span>
                              <input className="role-create-input" value={sellerProductEdit.image_url} onChange={(e) => setSellerProductEdit((x) => ({ ...x, image_url: e.target.value }))} />
                            </label>
                            <label className="role-create-label role-create-label-full">
                              <span>Video URL</span>
                              <input className="role-create-input" value={sellerProductEdit.video_url} onChange={(e) => setSellerProductEdit((x) => ({ ...x, video_url: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Operator %</span>
                              <input className="role-create-input" type="number" min="0" max="100" value={sellerProductEdit.operator_share_percent} onChange={(e) => setSellerProductEdit((x) => ({ ...x, operator_share_percent: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Sayt %</span>
                              <input className="role-create-input" type="number" min="0" max="100" value={sellerProductEdit.site_fee_percent} onChange={(e) => setSellerProductEdit((x) => ({ ...x, site_fee_percent: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Chegirma %</span>
                              <input className="role-create-input" type="number" min="0" max="100" value={sellerProductEdit.discount_percent} onChange={(e) => setSellerProductEdit((x) => ({ ...x, discount_percent: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Aksiya tugashi</span>
                              <input className="role-create-input" type="datetime-local" value={sellerProductEdit.promotion_ends_at} onChange={(e) => setSellerProductEdit((x) => ({ ...x, promotion_ends_at: e.target.value }))} />
                            </label>
                            <label className="role-create-label">
                              <span>Holat</span>
                              <select className="role-create-input" value={sellerProductEdit.status} onChange={(e) => setSellerProductEdit((x) => ({ ...x, status: e.target.value }))}>
                                {PRODUCT_STATUS_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="role-create-modal-footer" style={{ marginTop: '1rem' }}>
                            <button type="button" className="btn-neo" onClick={() => setSellerProductEdit(null)}>Bekor</button>
                            <button type="submit" className="btn-neo btn-neo-primary" disabled={String(busyKey || '').startsWith('product-admin-save-')}>
                              Saqlash
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeView === 'seller_products' && (
                <div className="panel-card seller-shop-page">
                  <div className="seller-shop-header">
                    <button type="button" className="btn-neo seller-shop-back" onClick={() => setSearchParams((p) => { const next = new URLSearchParams(p); next.set('view', 'seller_search'); next.delete('seller_id'); return next; }, { replace: true })}>
                      <i className="fas fa-arrow-left" /> Ortga
                    </button>
                    <h4 className="seller-shop-title">Seller do&apos;koni — {sellerProductsSellerName || 'Seller'}</h4>
                  </div>
                  {sellerProductsLoading ? (
                    <p className="muted">Yuklanmoqda...</p>
                  ) : sellerProductsList.length === 0 ? (
                    <p className="muted">Bu sellerda mahsulot yo&apos;q.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="neo-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Nomi</th>
                            <th>Kategoriya</th>
                            <th>Narx</th>
                            <th>Ombordagi</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellerProductsList.map((p) => (
                            <tr key={p.id}>
                              <td>{p.id}</td>
                              <td>{p.name_uz || p.name_ru || '—'}</td>
                              <td>{p.category || '—'}</td>
                              <td>{formatCurrency(p.price)}</td>
                              <td>{p.stock ?? 0}</td>
                              <td>{Number(p.discount_percent) > 0 ? 'Aksiya' : 'Oddiy'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {sellerLookup && (
                <div className="seller-detail-modal-overlay" onClick={() => setSellerLookup(null)} role="dialog" aria-modal="true" aria-labelledby="seller-detail-title">
                  <div className="seller-detail-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="seller-detail-modal-inner">
                      <div className="seller-detail-header">
                        <span className="seller-detail-title" id="seller-detail-title">Seller ma&apos;lumotlari</span>
                        <button type="button" className="seller-detail-back" onClick={() => setSellerLookup(null)} aria-label="Yopish">
                          <i className="fas fa-times" /> Yopish
                        </button>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">ID</span>
                        <strong>#{sellerLookup.id}</strong>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Nomi</span>
                        <strong>{sellerLookup.name || '—'}</strong>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Telefon</span>
                        <span>{sellerLookup.contact_phone ? <a href={`tel:${sellerLookup.contact_phone}`}>{sellerLookup.contact_phone}</a> : '—'}</span>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Email (login)</span>
                        <span>{sellerLookup.login_email || sellerLookup.email || '—'}</span>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Mahsulot turi</span>
                        <span>{(sellerLookup.product_categories && sellerLookup.product_categories.length > 0) ? sellerLookup.product_categories.join(', ') : '—'}</span>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Status</span>
                        <span className={`seller-detail-status status-${sellerLookup.status || 'active'}`}>{sellerLookup.status === 'blocked' ? 'Bloklangan' : sellerLookup.status === 'pending' ? 'Kutilmoqda' : 'Aktiv'}</span>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Balans</span>
                        <strong>{formatCurrency(sellerLookup.balance)}</strong>
                      </div>
                      <div className="seller-detail-row">
                        <span className="seller-detail-label">Mahsulotlar soni</span>
                        <strong>{sellerLookup.products_count ?? 0} ta</strong>
                      </div>
                      <div className="seller-detail-actions">
                        <button
                          type="button"
                          className="btn-neo btn-neo-primary seller-detail-batafsil"
                          onClick={() => {
                            setSellerProductsSellerName(sellerLookup.name || 'Seller');
                            setSearchParams((p) => { const next = new URLSearchParams(p); next.set('view', 'seller_products'); next.set('seller_id', String(sellerLookup.id)); return next; }, { replace: true });
                            setActiveView('seller_products');
                            setSellerLookup(null);
                          }}
                        >
                          <i className="fas fa-store" /> Batafsil — do&apos;konga o&apos;tish
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'konkurs' && (
                <>
                  <div className="panel-card">
                    <div className="panel-head"><h4><i className="fas fa-trophy" /> Konkurs</h4></div>
                    <p className="muted" style={{ marginBottom: '1rem' }}>Operatorlar va kuryerlar uchun alohida konkurslarni yoqing yoki to&apos;xtating. Natijalar ularning panellarida bir xil tizim orqali ko&apos;rsatiladi.</p>
                    <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div className="row-actions" style={{ alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Operatorlar:</span>
                        <button
                          type="button"
                          className={contestOperatorActive ? 'btn-neo btn-neo-danger' : 'btn-neo btn-neo-success'}
                          onClick={async () => {
                            setBusyKey('contest-operator');
                            try {
                              const res = await request('/admin/portal/contest', { method: 'PATCH', body: JSON.stringify({ operator: !contestOperatorActive }) });
                              if (res.ok) {
                                const d = await res.json();
                                setContestOperatorActive(!!d.operatorActive);
                              }
                            } catch (_) {}
                            setBusyKey('');
                          }}
                          disabled={busyKey === 'contest-operator'}
                        >
                          {contestOperatorActive ? "To'xtatish" : "Yoqish"}
                        </button>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{contestOperatorActive ? 'Ochiq' : 'Yopiq'}</span>
                      </div>
                      <div className="row-actions" style={{ alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Kuryerlar:</span>
                        <button
                          type="button"
                          className={contestCourierActive ? 'btn-neo btn-neo-danger' : 'btn-neo btn-neo-success'}
                          onClick={async () => {
                            setBusyKey('contest-courier');
                            try {
                              const res = await request('/admin/portal/contest', { method: 'PATCH', body: JSON.stringify({ courier: !contestCourierActive }) });
                              if (res.ok) {
                                const d = await res.json();
                                setContestCourierActive(!!d.courierActive);
                                loadContestCourierResults(contestCourierPeriod);
                              }
                            } catch (_) {}
                            setBusyKey('');
                          }}
                          disabled={busyKey === 'contest-courier'}
                        >
                          {contestCourierActive ? "To'xtatish" : "Yoqish"}
                        </button>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{contestCourierActive ? 'Ochiq' : 'Yopiq'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="panel-card" style={{ marginTop: '1rem' }}>
                    <div className="panel-head"><h4><i className="fas fa-headset" /> Operatorlar reytingi</h4></div>
                    <p className="muted" style={{ marginBottom: '1rem' }}>Operatorlar uchun konkurs yoqilganda reyting shu yerda va operator panelidagi Konkurs sahifasida bir xil ma&apos;lumotdan ko&apos;rsatiladi (har 5 soniyada yangilanadi).</p>
                    {!contestOperatorResults.active ? (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Konkurs yopiq. Yoqilganda operatorlar panelida reytinglar ko&apos;rinadi.</p>
                    ) : (
                      <>
                        <div className="row-actions" style={{ marginBottom: '0.75rem' }}>
                          <button type="button" className={contestOperatorPeriod === 'day' ? 'btn-neo btn-neo-primary' : 'btn-neo'} onClick={() => { setContestOperatorPeriod('day'); loadContestOperatorResults('day'); }}>Kunlik</button>
                          <button type="button" className={contestOperatorPeriod === 'week' ? 'btn-neo btn-neo-primary' : 'btn-neo'} onClick={() => { setContestOperatorPeriod('week'); loadContestOperatorResults('week'); }}>Haftalik</button>
                          <button type="button" className={contestOperatorPeriod === 'month' ? 'btn-neo btn-neo-primary' : 'btn-neo'} onClick={() => { setContestOperatorPeriod('month'); loadContestOperatorResults('month'); }}>Oylik</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                          <div>
                            <h5 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Ko&apos;p zakaz olgan</h5>
                            <div className="table-wrap">
                              <table className="neo-table">
                                <thead><tr><th>#</th><th>Operator</th><th>Soni</th></tr></thead>
                                <tbody>
                                  {contestOperatorResults.topByOrdersCreated.map((row, i) => (
                                    <tr key={row.id || i}><td>{i + 1}</td><td>{row.name || '—'}</td><td>{row.count} ta</td></tr>
                                  ))}
                                  {contestOperatorResults.topByOrdersCreated.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>—</td></tr>}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div>
                            <h5 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Ko&apos;p zakaz tushirgan</h5>
                            <div className="table-wrap">
                              <table className="neo-table">
                                <thead><tr><th>#</th><th>Operator</th><th>Soni</th></tr></thead>
                                <tbody>
                                  {contestOperatorResults.topByOrdersDelivered.map((row, i) => (
                                    <tr key={row.id || i}><td>{i + 1}</td><td>{row.name || '—'}</td><td>{row.count} ta</td></tr>
                                  ))}
                                  {contestOperatorResults.topByOrdersDelivered.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>—</td></tr>}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="panel-card" style={{ marginTop: '1rem' }}>
                    <div className="panel-head"><h4><i className="fas fa-motorcycle" /> Kuryerlar reytingi</h4></div>
                    <p className="muted" style={{ marginBottom: '1rem' }}>Kuryerlar uchun konkurs yoqilganda reyting shu yerda va kuryer panelidagi Konkurs sahifasida bir xil ma&apos;lumotdan ko&apos;rsatiladi (har 5 soniyada yangilanadi).</p>
                    {!contestCourierResults.active ? (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Konkurs yopiq. Yoqilganda kuryerlar panelida &quot;Ko&apos;p zakaz tushirgan&quot; reytingi ko&apos;rinadi.</p>
                    ) : (
                      <>
                        <div className="row-actions" style={{ marginBottom: '0.75rem' }}>
                          <button type="button" className={contestCourierPeriod === 'day' ? 'btn-neo btn-neo-primary' : 'btn-neo'} onClick={() => { setContestCourierPeriod('day'); loadContestCourierResults('day'); }}>Kunlik</button>
                          <button type="button" className={contestCourierPeriod === 'week' ? 'btn-neo btn-neo-primary' : 'btn-neo'} onClick={() => { setContestCourierPeriod('week'); loadContestCourierResults('week'); }}>Haftalik</button>
                          <button type="button" className={contestCourierPeriod === 'month' ? 'btn-neo btn-neo-primary' : 'btn-neo'} onClick={() => { setContestCourierPeriod('month'); loadContestCourierResults('month'); }}>Oylik</button>
                        </div>
                        <h5 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Ko&apos;p zakaz tushirgan (yetkazgan)</h5>
                        <div className="table-wrap">
                          <table className="neo-table">
                            <thead><tr><th>#</th><th>Kuryer</th><th>Yetkazilgan</th></tr></thead>
                            <tbody>
                              {contestCourierResults.topByDelivered.map((row, i) => (
                                <tr key={row.id || i}><td>{i + 1}</td><td>{row.name || '—'}</td><td>{row.count} ta</td></tr>
                              ))}
                              {contestCourierResults.topByDelivered.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>Hali ma&apos;lumot yo&apos;q</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="panel-card" style={{ marginTop: '1rem' }}>
                    <div className="panel-head"><h4><i className="fas fa-bell" /> Konkurs e&apos;loni — eslatma</h4></div>
                    <p className="muted" style={{ marginBottom: '1rem' }}>Konkurs qachon e&apos;lon qilinishi haqida xabar yuborish. Sana va vaqtni tanlang, kim uchun (kuryer yoki operatorlar) tanlang va &quot;Junatish&quot;ni bosing — barcha tanlanganlarga bir vaqtda xabar yuboriladi.</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sana</span>
                        <input type="date" className="neo-input" value={contestNotifyDate} onChange={(e) => setContestNotifyDate(e.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Vaqt</span>
                        <input type="time" className="neo-input" value={contestNotifyTime} onChange={(e) => setContestNotifyTime(e.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Kim uchun</span>
                        <select className="neo-select" value={contestNotifyFor} onChange={(e) => setContestNotifyFor(e.target.value)}>
                          <option value="courier">Kuryerlar</option>
                          <option value="operator">Operatorlar</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn-neo btn-neo-primary"
                        disabled={contestNotifySending}
                        onClick={async () => {
                          setContestNotifySending(true);
                          setContestNotifyDone(null);
                          try {
                            const res = await request('/admin/portal/contest-notify', {
                              method: 'POST',
                              body: JSON.stringify({
                                date: contestNotifyDate,
                                time: contestNotifyTime,
                                for: contestNotifyFor,
                                message: contestNotifyMessage.trim() || undefined,
                              }),
                            });
                            const d = res.ok ? await res.json() : {};
                            setContestNotifyDone(d.sent ?? 0);
                          } catch (_) {
                            setContestNotifyDone(-1);
                          }
                          setContestNotifySending(false);
                        }}
                      >
                        {contestNotifySending ? 'Yuborilmoqda...' : 'Junatish'}
                      </button>
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '1rem' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Xabar matni (ixtiyoriy — bo&apos;sh qoldirsangiz avtomatik matn ishlatiladi)</span>
                      <textarea className="neo-input" rows={2} placeholder="Konkurs ... da e'lon qilindi" value={contestNotifyMessage} onChange={(e) => setContestNotifyMessage(e.target.value)} />
                    </label>
                    {contestNotifyDone !== null && (
                      <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                        {contestNotifyDone >= 0 ? <strong style={{ color: 'var(--accent)' }}>Yuborildi: {contestNotifyDone} ta foydalanuvchiga.</strong> : <span style={{ color: 'var(--danger, #f87171)' }}>Xatolik yuz berdi.</span>}
                      </p>
                    )}
                  </div>
                </>
              )}

              {activeView === 'promotions' && (
                <div className="panel-card">
                  <div className="panel-head"><h4><i className="fas fa-percent" /> Aksiya — mahsulotlar chegirmasi</h4></div>
                  <p className="muted" style={{ marginBottom: '1rem' }}>Mahsulotlarga foizli chegirma va aksiya tugash sanasini belgilang. Chegirma qo&apos;yilgan mahsulotlar <strong>/aksiya</strong> sahifasida ko&apos;rinadi.</p>
                  <div className="table-wrap">
                    <table className="neo-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Mahsulot</th>
                          <th>Narx</th>
                          <th>Chegirma %</th>
                          <th>Aksiya tugashi</th>
                          <th>Amal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => {
                          const draft = (promotionDrafts && promotionDrafts[p.id]) || { discount_percent: p.discount_percent ?? 0, promotion_ends_at: p.promotion_ends_at ? String(p.promotion_ends_at).replace(' ', 'T').slice(0, 16) : '' };
                          return (
                            <tr key={p.id}>
                              <td>{p.id}</td>
                              <td>{p.name_uz}</td>
                              <td>{formatCurrency(p.price)}</td>
                              <td>
                                <input
                                  type="number"
                                  className="neo-input"
                                  min="0"
                                  max="100"
                                  step="1"
                                  style={{ width: '70px' }}
                                  value={draft.discount_percent}
                                  onChange={(e) => setPromotionDrafts((prev) => ({ ...prev, [p.id]: { ...draft, discount_percent: e.target.value } }))}
                                />
                              </td>
                              <td>
                                <input
                                  type="datetime-local"
                                  className="neo-input"
                                  style={{ minWidth: '160px' }}
                                  value={draft.promotion_ends_at}
                                  onChange={(e) => setPromotionDrafts((prev) => ({ ...prev, [p.id]: { ...draft, promotion_ends_at: e.target.value } }))}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn-neo btn-neo-primary"
                                  disabled={busyKey === `promo-${p.id}`}
                                  onClick={async () => {
                                    setPromotionMessage(null);
                                    setBusyKey(`promo-${p.id}`);
                                    try {
                                      const discountVal = Number(draft.discount_percent);
                                      const discountPercent = Number.isFinite(discountVal) ? Math.min(100, Math.max(0, discountVal)) : 0;
                                      const endsAt = typeof draft.promotion_ends_at === 'string' && draft.promotion_ends_at.trim() ? draft.promotion_ends_at.trim().replace('T', ' ') : null;
                                      const res = await request(`/products/${p.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({
                                          discount_percent: discountPercent,
                                          promotion_ends_at: endsAt,
                                        }),
                                      });
                                      const data = res.ok ? await res.json() : await res.json().catch(() => ({}));
                                      if (res.ok) {
                                        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...data } : x)));
                                        setPromotionDrafts((prev) => ({ ...prev, [p.id]: { discount_percent: data.discount_percent ?? 0, promotion_ends_at: data.promotion_ends_at ? String(data.promotion_ends_at).replace(' ', 'T').slice(0, 16) : '' } }));
                                        setPromotionMessage({ type: 'ok', text: `"${p.name_uz}" aksiyaga qo'yildi.` });
                                      } else {
                                        setPromotionMessage({ type: 'err', text: data.error || 'Saqlash xatosi.' });
                                      }
                                    } catch (err) {
                                      setPromotionMessage({ type: 'err', text: err.message || 'Tarmoq xatosi.' });
                                    } finally {
                                      setBusyKey('');
                                    }
                                  }}
                                >
                                  {busyKey === `promo-${p.id}` ? '...' : 'Saqlash'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {products.length === 0 && <p className="muted">Mahsulotlar yo&apos;q.</p>}
                  {promotionMessage && (
                    <p style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 8, background: promotionMessage.type === 'ok' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: promotionMessage.type === 'ok' ? '#15803d' : '#b91c1c' }}>
                      {promotionMessage.text}
                    </p>
                  )}
                </div>
              )}

              {activeView === 'accounting' && (
                <div className="panel-card admin-accounting-panel">
                  <div className="panel-head panel-head--accounting">
                    <h4>Buxgalteriya</h4>
                    <input
                      type="search"
                      className="neo-input admin-accounting-search"
                      placeholder="Ishchi rol, seller, xodim yoki mijoz — ism, login, ID, telefon, email…"
                      value={accountingSearchInput}
                      onChange={(e) => setAccountingSearchInput(e.target.value)}
                      aria-label="Buxgalteriya bo‘yicha qidiruv"
                    />
                  </div>

                  {accountingSearchDebounced && accounting?.filter?.type === 'none' && (
                    <div className="admin-accounting-result admin-accounting-result--notfound" role="status">
                      <p className="admin-accounting-result-title">
                        <strong>&quot;{accounting.filter.label}&quot;</strong> bo‘yicha hech narsa topilmadi
                      </p>
                      <p className="muted admin-accounting-result-sub">Boshqa ism, login, ID, telefon yoki email bilan sinab ko‘ring.</p>
                    </div>
                  )}

                  {accountingSearchDebounced && accounting?.filter && accounting.filter.type !== 'none' && (
                    <div className="admin-accounting-result" role="region" aria-label="Qidiruv natijasi">
                      <div className="admin-accounting-result-head">
                        <h5 className="admin-accounting-result-name">{accounting.filter.label}</h5>
                        <div className="admin-accounting-result-tags">
                          <span className="admin-accounting-result-badge">
                            {accounting.filter.type === 'work_role' && 'Ishchi rol'}
                            {accounting.filter.type === 'seller' && 'Seller'}
                            {accounting.filter.type === 'staff' && 'Xodim'}
                            {accounting.filter.type === 'user' && 'Mijoz'}
                          </span>
                          <span className="admin-accounting-result-id">ID: {accounting.filter.id}</span>
                        </div>
                      </div>
                      {accounting.filter.type === 'work_role' && (
                        <p className="admin-accounting-result-extra muted">
                          Jarima: <strong>{formatCurrency(accounting.summary?.finesTotal || 0)}</strong>
                          {' · '}
                          Mukofot: <strong>{formatCurrency(accounting.summary?.rewardsTotal || 0)}</strong>
                        </p>
                      )}
                      <div className="admin-accounting-result-stats">
                        <div className="admin-accounting-result-stat">
                          <span>Yalpi daromad</span>
                          <strong>{formatCurrency(accounting.summary?.grossRevenue || 0)}</strong>
                        </div>
                        <div className="admin-accounting-result-stat">
                          <span>Zakaz soni</span>
                          <strong>{accounting.summary?.ordersCount ?? 0}</strong>
                        </div>
                        <div className="admin-accounting-result-stat">
                          <span>O&apos;rtacha chek</span>
                          <strong>{formatCurrency(accounting.summary?.averageCheck || 0)}</strong>
                        </div>
                        <div className="admin-accounting-result-stat">
                          <span>
                            {accounting.filter.type === 'seller' ? 'Seller balansi' : 'Balans'}
                          </span>
                          <strong>{formatCurrency(accounting.summary?.sellerBalance || 0)}</strong>
                        </div>
                      </div>
                      <p className="muted admin-accounting-result-foot">Buyurtma statuslari — quyidagi jadvalda.</p>
                    </div>
                  )}

                  {!accountingSearchDebounced && (
                    <p className="muted admin-accounting-hint admin-accounting-hint--dim">
                      Qidiruv bo‘sh — barcha tizim bo‘yicha umumiy ko‘rsatkichlar. Yozsangiz, natija shu qator ostida ochiladi (taxminan 0,3 s).
                    </p>
                  )}

                  {!(accountingSearchDebounced && accounting?.filter && accounting.filter.type !== 'none') && (
                  <div className="stats-mini-grid">
                      <div className="mini-stat-card mini-stat-card-simple"><span>Yalpi daromad</span><strong>{formatCurrency(accounting?.summary?.grossRevenue || 0)}</strong></div>
                      <div className="mini-stat-card mini-stat-card-simple"><span>Zakaz soni</span><strong>{accounting?.summary?.ordersCount || 0}</strong></div>
                      <div className="mini-stat-card mini-stat-card-simple"><span>O&apos;rtacha chek</span><strong>{formatCurrency(accounting?.summary?.averageCheck || 0)}</strong></div>
                      <div className="mini-stat-card mini-stat-card-simple">
                        <span>
                          {!accounting?.filter ? 'Seller balans (jami)' : accounting.filter.type === 'seller' ? 'Seller balansi' : 'Balans'}
                        </span>
                        <strong>{formatCurrency(accounting?.summary?.sellerBalance || 0)}</strong>
                  </div>
                    </div>
                  )}
                  <div className="table-wrap">
                    <table className="neo-table">
                      <thead><tr><th>Status</th><th>Soni</th><th>Summa</th></tr></thead>
                      <tbody>
                        {(accounting?.statusBreakdown || []).length === 0 ? (
                          <tr><td colSpan={3} className="muted">Status bo‘yicha qatorlar yo‘q</td></tr>
                        ) : (
                          (accounting?.statusBreakdown || []).map((row) => (
                            <tr key={row.status}><td>{statusLabel(row.status)}</td><td>{row.count}</td><td>{formatCurrency(row.amount)}</td></tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeView === 'withdrawals' && (
                <div className="panel-card admin-withdrawals-panel">
                  <div className="panel-head">
                    <h4><i className="fas fa-money-bill-wave" /> Pul yechish so&apos;rovlari</h4>
                  </div>
                  <p className="admin-withdrawals-hint muted">
                    Har qanday ishchi roldan kelgan barcha kutilayotgan so‘rovlar shu yerda navbat tartibida (avval yuborilgan — yuqorida): sana, rol, ID va summa. Tasdiqlang yoki rad eting — login yoki email mos bo‘lsa, foydalanuvchi bildirishnoma oladi.
                  </p>
                  {withdrawalRequestsLoading ? (
                    <p className="admin-withdrawals-empty muted">Yuklanmoqda...</p>
                  ) : withdrawalRequests.length === 0 ? (
                    <p className="admin-withdrawals-empty muted">Kutilayotgan so‘rovlar yo‘q.</p>
                  ) : (
                    <div className="admin-withdrawals-grid">
                      {withdrawalRequests.map((wr, queueIndex) => (
                        <article key={wr.id} className="admin-withdrawal-card">
                          <div className="admin-withdrawal-card__top-row">
                            <div className="admin-withdrawal-card__queue" title="Navbat">
                              {queueIndex + 1}
                            </div>
                            <header className="admin-withdrawal-card__head">
                              <span className="admin-withdrawal-card__role" title={wr.role_name || ''}>
                                {wr.role_name || 'Ishchi rol'}
                              </span>
                              <span className="admin-withdrawal-card__ids">
                                So‘rov #{wr.id}
                                {wr.work_role_id != null ? (
                                  <span className="admin-withdrawal-card__wrid">WR #{wr.work_role_id}</span>
                                ) : null}
                              </span>
                            </header>
                          </div>
                          <div className="admin-withdrawal-card__login">{wr.work_role_login || '—'}</div>
                          <ul className="admin-withdrawal-card__contacts">
                            {wr.work_role_phone ? (
                              <li>
                                <i className="fas fa-phone" aria-hidden />
                                <span>{wr.work_role_phone}</span>
                              </li>
                            ) : null}
                            {wr.work_role_email ? (
                              <li>
                                <i className="fas fa-envelope" aria-hidden />
                                <span>{wr.work_role_email}</span>
                              </li>
                            ) : null}
                            {!wr.work_role_phone && !wr.work_role_email ? (
                              <li className="admin-withdrawal-card__contacts--empty">Telefon / email yo‘q</li>
                            ) : null}
                          </ul>
                          <div className="admin-withdrawal-card__amount">{formatCurrency(wr.amount)}</div>
                          <div className="admin-withdrawal-card__payout muted">
                            {wr.payout_method === 'card' ? 'Karta' : 'Naqd'}
                          </div>
                          <div className="admin-withdrawal-card__date muted">{formatDate(wr.created_at)}</div>
                          <label className="admin-withdrawal-card__note-label">
                            <span className="muted">Izoh (xabar uchun)</span>
                                <input
                                  type="text"
                                  className="neo-input"
                              placeholder="Sabab yoki qisqa izoh"
                                  value={withdrawalNote[wr.id] ?? ''}
                                  onChange={(e) => setWithdrawalNote((prev) => ({ ...prev, [wr.id]: e.target.value }))}
                                />
                          </label>
                          <div className="admin-withdrawal-card__actions">
                                <button
                                  type="button"
                                  className="btn-neo btn-neo-success"
                                  disabled={withdrawalActionBusy === wr.id}
                                  onClick={async () => {
                                    setWithdrawalActionBusy(wr.id);
                                    try {
                                      const res = await request(`/admin/portal/withdrawal-requests/${wr.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ status: 'approved', note: withdrawalNote[wr.id] || undefined }),
                                      });
                                      if (res.ok) {
                                        setWithdrawalNote((prev) => { const n = { ...prev }; delete n[wr.id]; return n; });
                                        await loadWithdrawalRequests();
                                      }
                                    } finally {
                                      setWithdrawalActionBusy(null);
                                    }
                                  }}
                                >
                                  Tasdiqlash
                                </button>
                                <button
                                  type="button"
                                  className="btn-neo btn-neo-danger"
                                  disabled={withdrawalActionBusy === wr.id}
                                  onClick={async () => {
                                    setWithdrawalActionBusy(wr.id);
                                    try {
                                      const res = await request(`/admin/portal/withdrawal-requests/${wr.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ status: 'rejected', note: withdrawalNote[wr.id] || undefined }),
                                      });
                                      if (res.ok) {
                                        setWithdrawalNote((prev) => { const n = { ...prev }; delete n[wr.id]; return n; });
                                        await loadWithdrawalRequests();
                                      }
                                    } finally {
                                      setWithdrawalActionBusy(null);
                                    }
                                  }}
                                >
                                  Rad etish
                                </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeView === 'ai_calls' && (
                <>
                  {aiOperatorExpanded === 'audio' && aiOperatorAudioSubTab === 'ai' && (
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4><i className="fas fa-robot" /> Ai qo‘ng‘iroqlar</h4>
                      </div>
                      <h5 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Kutilayotgan zakazlar (AI Start)</h5>
                      {pendingAiOrders.length === 0 ? (
                        <p className="muted" style={{ marginBottom: '1.25rem' }}>Kutilayotgan zakazlar topilmadi.</p>
                      ) : (
                        <div className="table-wrap" style={{ marginBottom: '1.75rem' }}>
                          <table className="neo-table">
                            <thead>
                              <tr>
                                <th>Zakaz</th>
                                <th>Mijoz</th>
                                <th>Telefon</th>
                                <th>Yetkazish</th>
                                <th>Vaqt</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {pendingAiOrders.map((o) => (
                                <tr key={`pend-${o.id}`}>
                                  <td>#{o.id}</td>
                                  <td>{o.customer_full_name || '—'}</td>
                                  <td>{o.contact_phone || '—'}</td>
                                  <td style={{ maxWidth: 240 }}><span className="muted">{o.shipping_address || '—'}</span></td>
                                  <td>{o.created_at ? formatDateTimeUz(o.created_at, { empty: '-' }) : '-'}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn-neo btn-neo-primary"
                                      onClick={() => startAiCallForOrder(o.id)}
                                      disabled={busyKey === `ai-call-${o.id}`}
                                    >
                                      {busyKey === `ai-call-${o.id}` ? '...' : 'Start'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                      <h5 style={{ marginBottom: '0.5rem' }}>Yozib olingan qo‘ng‘iroq qatorlari (Vapi / webhook)</h5>
                      {aiCalls.length === 0 ? (
                        <p className="muted" style={{ marginBottom: 0 }}>Vapi / webhook bo‘yicha yozuvlar topilmadi.</p>
                      ) : (
                        <div className="table-wrap">
                          <table className="neo-table">
                            <thead>
                              <tr>
                                <th>ID</th>
                                <th>Zakaz</th>
                                <th>Call ID</th>
                                <th>Event</th>
                                <th>Vaqt</th>
                                <th>Kontent</th>
                              </tr>
                            </thead>
                            <tbody>
                              {aiCalls.map((row) => {
                                const audioSrc = aiRecordingAudioSrc(row);
                                return (
                                  <tr key={row.id}>
                                    <td>{row.id}</td>
                                    <td>{row.orderId != null ? `#${row.orderId}` : '—'}</td>
                                    <td><span className="muted" style={{ fontSize: '0.85em' }}>{row.vapiCallId || '—'}</span></td>
                                    <td>{row.eventType || '—'}</td>
                                    <td>{row.createdAt ? formatDateTimeUz(row.createdAt, { empty: '-' }) : '-'}</td>
                                    <td style={{ maxWidth: 520 }}>
                                      <span className="muted">{row.transcriptPreview || '—'}</span>
                                      {audioSrc ? (
                                        <div style={{ marginTop: 8 }}>
                                          <audio controls preload="none" src={audioSrc} style={{ width: '100%' }} />
                                        </div>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                </div>
                      )}
                    </div>
                  )}
                  {aiOperatorExpanded === 'audio' && aiOperatorAudioSubTab === 'operator' && (
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4><i className="fas fa-headset" /> Operator qo‘ng‘iroqlari va boshqa kanallar</h4>
                      </div>
                      <p className="muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.92rem' }}>
                        Kuryer qo‘ng‘iroq izohlari, mijoz bo‘yicha lead eslatmalari va hodimlar tomonidan yuborilgan chat yozuvlari. Ma’lumotlar serverdan yuklanadi.
                      </p>
                      <AdminAiOperatorFeedTable
                        events={aiOperatorFeedOperatorSide}
                        emptyLabel="Yozuvlar topilmadi. Yuqoridagi yangilash tugmasidan foydalaning."
                        resolveFeedAudio={null}
                      />
                    </div>
                  )}
                  {aiOperatorExpanded === 'sms' && aiOperatorSmsSubTab === 'mijoz' && (
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4><i className="fas fa-sms" /> Mijoz smslari</h4>
                      </div>
                      <p className="muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.92rem' }}>
                        Mijoz tomonidan yuborilgan chat xabarlari (mijoz bilan muloqot arxivi). Serverdan real vaqtda yangilanadi.
                      </p>
                      <AdminAiOperatorFeedTable
                        events={aiOperatorSmsMijoz}
                        emptyLabel="Mijoz xabarlari topilmadi."
                        resolveFeedAudio={feedRecordingAudioSrc}
                      />
                    </div>
                  )}
                  {aiOperatorExpanded === 'sms' && aiOperatorSmsSubTab === 'rollar' && (
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4><i className="fas fa-users" /> Rollardan kelgan smslar</h4>
                      </div>
                      <p className="muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.92rem' }}>
                        Rollar bo‘yicha kuryer yozuvlari, lead izohlari va hodimlar tomonidan yuborilgan chat xabarlari. Ma’lumotlar serverdan keladi.
                      </p>
                      <AdminAiOperatorFeedTable
                        events={aiOperatorSmsRollardan}
                        emptyLabel="Rollar tomonidan yozuvlar topilmadi."
                        resolveFeedAudio={feedRecordingAudioSrc}
                      />
                    </div>
                  )}
                  {aiOperatorExpanded === 'jalobalar' && aiOperatorJalobaSubTab === 'mijoz' && (
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4><i className="fas fa-exclamation-circle" /> Mijoz jalobalari</h4>
                      </div>
                      <p className="muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.92rem' }}>
                        Mijozlardan tushgan jalobalar ro‘yxati. Ma’lumotlar serverdan ko‘rsatiladi.
                      </p>
                      <div className="table-wrap">
                        <table className="neo-table">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Mijoz</th>
                              <th>Mavzu</th>
                              <th>Holat</th>
                              <th>Vaqt</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>
                                Jalobalar yozuvlari topilmadi.
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {aiOperatorExpanded === 'jalobalar' && aiOperatorJalobaSubTab === 'rollar' && (
                    <div className="panel-card">
                      <div className="panel-head">
                        <h4><i className="fas fa-users" /> Rollardan kelgan jalobalar</h4>
                      </div>
                      <p className="muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.92rem' }}>
                        Hodimlar va rollar bo‘yicha kelib tushgan jalobalar. Ma’lumotlar serverdan ko‘rsatiladi.
                      </p>
                      <div className="table-wrap">
                        <table className="neo-table">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Rol</th>
                              <th>Mavzu</th>
                              <th>Holat</th>
                              <th>Vaqt</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>
                                Jalobalar yozuvlari topilmadi.
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeView === 'admin_profile' && (
                <div className="panel-card">
                  <div className="panel-head">
                    <h4><i className="fas fa-user" /> Profil</h4>
                  </div>
                  <div className="table-wrap compact">
                    <table className="neo-table compact">
                      <tbody>
                        <tr><th>Ism</th><td>{user?.full_name || '—'}</td></tr>
                        <tr><th>Email</th><td>{user?.email || '—'}</td></tr>
                        <tr><th>Login</th><td>{user?.login || '—'}</td></tr>
                        <tr><th>Rol</th><td>{user?.role || (user?.role_id === 1 ? 'superuser' : '—')}</td></tr>
                        <tr><th>ID</th><td>{user?.id != null ? `#${user.id}` : '—'}</td></tr>
                        </tbody>
                      </table>
                  </div>
                  <p className="muted" style={{ marginTop: '0.75rem' }}>
                    Profilni tahrirlash keyinroq alohida forma orqali qo‘shilishi mumkin. Hozircha ma’lumotlar tizimdan o‘qiladi.
                  </p>
                    </div>
                  )}

              {activeView === 'admin_settings' && (
                <div className="panel-card admin-settings-panel">
                  <div className="panel-head">
                    <h4><i className="fas fa-cog" /> Sozlamalar</h4>
                  </div>
                  <div className="admin-settings-body">
                    <p className="admin-settings-lead muted">
                      Kun rejimida asosiy qism oq, yon panel ko‘k gradient bilan. Tun rejimida sahifa va yon panel qoramtir.
                    </p>
                    <div className="admin-settings-appearance-card">
                      <div className="admin-settings-appearance-icon" aria-hidden="true">
                        <i className="fas fa-adjust" />
                      </div>
                      <div className="admin-settings-appearance-text">
                        <span className="admin-settings-appearance-title">Ko‘rinish</span>
                        <span className="admin-settings-appearance-desc">Kun / tun rejimini almashtiring</span>
                      </div>
                      <div className="admin-settings-toggle-row">
                        <span className={`admin-settings-mode-pill ${!darkMode ? 'is-active' : ''}`}>
                          <i className="fas fa-sun" /> Kun
                        </span>
                        <label className="admin-ios-toggle">
                          <input
                            type="checkbox"
                            checked={darkMode}
                            onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
                            aria-label="Tun rejimiga o‘tish"
                          />
                          <span className="admin-ios-toggle-track" />
                        </label>
                        <span className={`admin-settings-mode-pill ${darkMode ? 'is-active' : ''}`}>
                          <i className="fas fa-moon" /> Tun
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'reklama' && (
                <div className="panel-card admin-reklama-panel">
                  <div className="panel-head">
                    <h4><i className="fas fa-ad" /> Reklama</h4>
                  </div>
                  <p className="admin-reklama-lead muted">
                    Bosh sahifadagi slayder (1–5). + rasm (JPEG/PNG/WebP, tavsiya: kamida 1920px kenglik — tiniq ko‘rinadi), film — MP4 (H.264) yoki WebM; yuklangan fayl avtomatik saqlanadi. YouTube havolasini pastdagi maydonga ham yozish mumkin. Video yuklangandan keyin «Saqlash»ni bosing. Hajm: 80 MB gacha.
                  </p>

                  <form
                    className="admin-reklama-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setAdSlideBusy('save');
                      setError('');
                      try {
                        if (adSlideFormDetached) {
                          if (!adSlideEditingId) throw new Error('Tahrirlash rejimi noto‘g‘ri.');
                          const t0 = adSlideForm.title.trim();
                          if (!t0) throw new Error('Sarlavha kerak.');
                          const img0 = adSlideRemoveImage ? '' : adSlideForm.image_url.trim();
                          const res0 = await request(`/admin/portal/ad-slides/${adSlideEditingId}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              title: t0,
                              subtitle: adSlideForm.subtitle.trim(),
                              link_url: adSlideForm.link_path.trim() ? adSlideForm.link_path.trim() : undefined,
                              active: adSlideForm.active,
                              image_url: img0,
                              video_url: adSlideForm.video_url.trim(),
                            }),
                          });
                          const d0 = res0.ok ? await res0.json().catch(() => ({})) : {};
                          if (!res0.ok) throw new Error(d0.error || 'Saqlanmadi');
                          const list0 = await loadAdSlides();
                          resetAdSlideForm(list0);
                          return;
                        }

                        const selectedIdxs = AD_SLIDE_SLOT_INDEXES.filter((i) => adSlideSlotSelected[i]);
                        if (selectedIdxs.length === 0) {
                          throw new Error('Kamida bitta slotni pastdagi belgi bilan tanlang.');
                        }

                        const empties = selectedIdxs.filter((i) => !adSlides[i]?.id);
                        if (selectedIdxs.length > 1 && empties.length > 0) {
                          throw new Error(
                            'Bir nechta slot belgilangan: avval barchasida slayd bo‘lishi kerak. Yangi slayd uchun faqat bitta bo‘sh slotni tanlang.',
                          );
                        }

                        const title = adSlideForm.title.trim();
                        if (!title) throw new Error('Sarlavha kerak.');

                        const nextImageUrl = adSlideRemoveImage ? '' : adSlideForm.image_url.trim();
                        const nextVideoUrl = adSlideForm.video_url.trim();
                        const bodyBase = {
                          title,
                          subtitle: adSlideForm.subtitle.trim(),
                          link_url: adSlideForm.link_path.trim() ? adSlideForm.link_path.trim() : undefined,
                          active: adSlideForm.active,
                        };

                        if (selectedIdxs.length === 1) {
                          const i = selectedIdxs[0];
                          const slide = adSlides[i];
                          if (slide?.id) {
                            const patchBody = { ...bodyBase, image_url: nextImageUrl, video_url: nextVideoUrl };
                            const res = await request(`/admin/portal/ad-slides/${slide.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify(patchBody),
                            });
                            const d = res.ok ? await res.json().catch(() => ({})) : {};
                            if (!res.ok) throw new Error(d.error || 'Saqlanmadi');
                          } else {
                            const postBody = { ...bodyBase };
                            if (nextImageUrl) postBody.image_url = nextImageUrl;
                            if (nextVideoUrl) postBody.video_url = nextVideoUrl;
                            const res = await request('/admin/portal/ad-slides', {
                              method: 'POST',
                              body: JSON.stringify(postBody),
                            });
                            const d = res.ok ? await res.json().catch(() => ({})) : {};
                            if (!res.ok) throw new Error(d.error || 'Saqlanmadi');
                            const newId = d.slide?.id;
                            let list = await loadAdSlides();
                            if (newId != null) {
                              const at = list.findIndex((s) => s.id === newId);
                              if (at !== i) {
                                await moveAdSlideToSlotIndex(request, newId, i, list);
                                await loadAdSlides();
                              }
                            }
                          }
                          const list = await loadAdSlides();
                          resetAdSlideForm(list);
                          return;
                        }

                        for (const i of selectedIdxs) {
                          const slide = adSlides[i];
                          if (!slide?.id) continue;
                          const res = await request(`/admin/portal/ad-slides/${slide.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(bodyBase),
                          });
                          const d = res.ok ? await res.json().catch(() => ({})) : {};
                          if (!res.ok) throw new Error(d.error || `${i + 1}-slot: saqlanmadi`);
                        }
                        const list = await loadAdSlides();
                        resetAdSlideForm(list);
                      } catch (err) {
                        setError(err.message || 'Saqlanmadi');
                      } finally {
                        setAdSlideBusy(null);
                      }
                    }}
                  >
                    <div className="admin-reklama-form-grid">
                      <div className="admin-reklama-span-2 admin-reklama-title-slot-wrap">
                        <div className="admin-reklama-slot-toolbar">
                          <div className="admin-reklama-slot-row">
                            <div className="admin-reklama-slot-grid" role="group" aria-label="Slayd ustunlari (rasm va tanlov)">
                              {AD_SLIDE_SLOT_INDEXES.map((i) => {
                                const slotSlide = adSlides[i];
                                const checked = adSlideSlotSelected[i];
                                const prim = adSlidePrimaryIdx;
                                const slotHasVideo = Boolean(slotSlide?.video_url);
                                return (
                                  <div
                                    key={`slot-col-${i}`}
                                    className={`admin-reklama-slot-column${!adSlideFormDetached && checked ? ' is-selected' : ''}${!adSlideFormDetached && prim === i ? ' is-primary' : ''}`}
                                  >
                                    <span className="admin-reklama-slot-plus-wrap">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="admin-reklama-slot-file"
                                        ref={(el) => {
                                          if (el) adSlideSlotFileInputRefs.current[i] = el;
                                          else delete adSlideSlotFileInputRefs.current[i];
                                        }}
                                        onChange={(ev) => {
                                          const f = ev.target.files?.[0];
                                          if (f) handleAdSlideSlotImagePick(i, f);
                                        }}
                                        aria-label={`${i + 1}-slayd: galeriya yoki fayldan rasm tanlash`}
                                      />
                                      <input
                                        type="file"
                                        accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg"
                                        className="admin-reklama-slot-file"
                                        ref={(el) => {
                                          if (el) adSlideSlotVideoInputRefs.current[i] = el;
                                          else delete adSlideSlotVideoInputRefs.current[i];
                                        }}
                                        onChange={(ev) => {
                                          const f = ev.target.files?.[0];
                                          if (f) handleAdSlideSlotVideoPick(i, f);
                                        }}
                                        aria-label={`${i + 1}-slayd: video fayl yuklash`}
                                      />
                                      <button
                                        type="button"
                                        className={`admin-reklama-slot-plus${slotSlide?.image_url || slotHasVideo ? ' has-image' : ''}`}
                                        disabled={!!adSlideBusy}
                                        title={`${i + 1}-slayd: rasm qo‘shish (galeriya / fayl)`}
                                        onClick={() => adSlideSlotFileInputRefs.current[i]?.click()}
                                      >
                                        {slotSlide?.image_url ? (
                                          <span
                                            className="admin-reklama-slot-plus-thumb"
                                            style={{ backgroundImage: `url(${slotSlide.image_url})` }}
                                            aria-hidden
                                          />
                                        ) : null}
                                        <span className="admin-reklama-slot-plus-icon" aria-hidden>
                                          {adSlideBusy === `slot-img-${i}` ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-plus" />}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className={`admin-reklama-slot-video-btn${slotHasVideo ? ' has-video' : ''}`}
                                        disabled={!!adSlideBusy}
                                        title={`${i + 1}-slayd: video yuklash (MP4/WebM)`}
                                        onClick={() => adSlideSlotVideoInputRefs.current[i]?.click()}
                                      >
                                        {adSlideBusy === `slot-vid-${i}` ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-film" />}
                                      </button>
                                    </span>
                                    <label className={`admin-reklama-slot-select${checked ? ' is-on' : ''}`}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={adSlideFormDetached}
                                        onChange={() => toggleAdSlideSlotSelected(i)}
                                        aria-label={`${i + 1}-slaydni belgilash`}
                                      />
                                      <span className="admin-reklama-slot-select-face" aria-hidden>
                                        {checked ? <i className="fas fa-check" /> : null}
                                      </span>
                                      <span className="admin-reklama-slot-select-label">{i + 1}</span>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="admin-reklama-title-beside">
                              <label className="admin-reklama-title-label" htmlFor="ad-reklama-slide-title">
                                Sarlavha *
                              </label>
                              <p className="admin-reklama-slot-toolbar-hint muted">
                                + rasm · film — video fayl · pastda YouTube yoki .mp4 havolasi
                              </p>
                              <input
                                id="ad-reklama-slide-title"
                                type="text"
                                className="neo-input admin-reklama-title-input"
                                value={adSlideForm.title}
                                onChange={(ev) => setAdSlideForm((p) => ({ ...p, title: ev.target.value }))}
                                placeholder="Masalan: Chegirmalar"
                                maxLength={200}
                                required
                              />
                </div>
                          </div>
                        </div>
                        {adSlideFormDetached ? (
                          <p className="admin-reklama-detached-hint muted">
                            6-o‘rindan keyingi slayd tahrirlanmoqda. 1–5 slotlar «Saqlash» yoki «Bekor qilish» dan keyin yana ishlaydi.
                          </p>
                        ) : null}
                      </div>
                      <label className="admin-reklama-span-2">
                        <span>Qisqa matn (slayd ostidagi izoh)</span>
                        <input
                          type="text"
                          className="neo-input"
                          value={adSlideForm.subtitle}
                          onChange={(ev) => setAdSlideForm((p) => ({ ...p, subtitle: ev.target.value }))}
                          placeholder="Masalan: Yangi kolleksiya allaqachon do‘konda — ertaga tugashi mumkin. Tez buyurtma qiling!"
                          maxLength={500}
                        />
                      </label>
                      <label className="admin-reklama-span-2">
                        <span>Bosilganda ochiladigan sahifa</span>
                        <select
                          className="neo-select admin-reklama-select"
                          value={adSlideForm.link_path || ''}
                          onChange={(ev) => setAdSlideForm((p) => ({ ...p, link_path: ev.target.value }))}
                          aria-label="Slayd havolasi — sahifa"
                        >
                          {adSlideForm.link_path
                          && !AD_SLIDE_PAGE_OPTIONS.some((o) => o.value === adSlideForm.link_path) ? (
                            <option value={adSlideForm.link_path}>
                              Joriy: {adSlideForm.link_path}
                            </option>
                            ) : null}
                          {AD_SLIDE_PAGE_OPTIONS.map((o) => (
                            <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-reklama-span-2">
                        <span>Video havola (ixtiyoriy): YouTube yoki to‘g‘ridan-to‘g‘ri .mp4 / .webm URL (https://...)</span>
                        <input
                          type="url"
                          className="neo-input"
                          value={adSlideForm.video_url}
                          onChange={(ev) => setAdSlideForm((p) => ({ ...p, video_url: ev.target.value }))}
                          placeholder="https://www.youtube.com/watch?v=... yoki https://.../reklama.mp4"
                          maxLength={1200}
                        />
                      </label>
                      <label className="admin-reklama-span-2">
                        <span>
                          Belgilangan: {adSlideSelectedIndices.length ? adSlideSelectedIndices.map((n) => n + 1).join(', ') : '—'}
                          {adSlidePrimaryIdx !== null ? (
                            <>
                              {' '}
                              · ko‘rinish ({adSlidePrimaryIdx + 1}-slot)
                            </>
                          ) : null}
                          <span className="admin-reklama-rasm-hint muted"> · Rasm: + · Video: film yoki havola</span>
                        </span>
                        {adSlidePreviewVideo ? (
                          <div className="admin-reklama-form-preview admin-reklama-form-preview--video">
                            {adSlideYoutubeVideoId(adSlidePreviewVideo) ? (
                              <iframe
                                title="Video ko‘rinish"
                                className="admin-reklama-preview-video admin-reklama-preview-iframe"
                                src={`https://www.youtube.com/embed/${adSlideYoutubeVideoId(adSlidePreviewVideo)}?rel=0`}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                              />
                            ) : (
                              <video key={adSlidePreviewVideo} src={adSlidePreviewVideo} controls muted playsInline className="admin-reklama-preview-video" />
                            )}
                          </div>
                        ) : null}
                        {adSlidePreviewDisplay ? (
                          <div className="admin-reklama-form-preview">
                            <img src={adSlidePreviewDisplay} alt="" />
                          </div>
                        ) : !adSlidePreviewVideo ? (
                          <p className="admin-reklama-rasm-empty muted">Rasm (+) yoki video (film / havola) qo‘shing</p>
                        ) : null}
                        {(adSlidePreviewDisplay || adSlideForm.image_url) &&
                        adSlideEditingId &&
                        (adSlideFormDetached || adSlideSelectedIndices.length === 1) ? (
                          <button
                            type="button"
                            className="btn-neo btn-sm admin-reklama-remove-img"
                            onClick={() => {
                              setAdSlideRemoveImage(true);
                              setAdSlideForm((p) => ({ ...p, image_url: '' }));
                            }}
                          >
                            Rasmni olib tashlash
                          </button>
                        ) : null}
                        {adSlidePreviewVideo &&
                        adSlideEditingId &&
                        (adSlideFormDetached || adSlideSelectedIndices.length === 1) ? (
                          <button
                            type="button"
                            className="btn-neo btn-sm admin-reklama-remove-img"
                            onClick={() => setAdSlideForm((p) => ({ ...p, video_url: '' }))}
                          >
                            Videoni olib tashlash
                          </button>
                        ) : null}
                      </label>
                      <label className="admin-reklama-check">
                        <input
                          type="checkbox"
                          checked={adSlideForm.active}
                          onChange={(ev) => setAdSlideForm((p) => ({ ...p, active: ev.target.checked }))}
                        />
                        <span>Faol (bosh sahifada ko‘rinadi)</span>
                      </label>
                    </div>
                    <div className="admin-reklama-form-actions">
                      <button
                        type="submit"
                        className="btn-neo btn-neo-primary"
                        disabled={
                          adSlideBusy === 'save' ||
                          (!adSlideFormDetached && !adSlideSlotSelected.some(Boolean))
                        }
                      >
                        {(() => {
                          if (adSlideFormDetached) return 'Saqlash';
                          const s = AD_SLIDE_SLOT_INDEXES.filter((i) => adSlideSlotSelected[i]);
                          if (s.length === 0) return 'Saqlash';
                          if (s.length > 1) return 'Saqlash (tanlanganlar)';
                          return adSlides[s[0]]?.id ? 'Saqlash' : 'Qo‘shish';
                        })()}
                      </button>
                      {adSlideFormDetached || adSlidePrimaryIdx !== null ? (
                        <button type="button" className="btn-neo" onClick={resetAdSlideForm} disabled={adSlideBusy === 'save'}>
                          Bekor qilish
                        </button>
                      ) : null}
                    </div>
                  </form>

                  {adSlidesLoading ? (
                    <p className="muted admin-reklama-empty">Yuklanmoqda...</p>
                  ) : adSlides.length === 0 ? (
                    <p className="muted admin-reklama-empty">Hozircha slayd yo‘q. Yuqoridan birinchi slaydni qo‘shing.</p>
                  ) : (
                    <div className="admin-reklama-list">
                      {adSlides.map((s, idx) => (
                        <div key={s.id} className={`admin-reklama-card ${s.active ? '' : 'is-inactive'}`}>
                          <div className="admin-reklama-card-main">
                            {s.image_url ? (
                              <div className="admin-reklama-thumb">
                                <img src={s.image_url} alt="" onError={(ev) => { ev.target.style.display = 'none'; }} />
                                {s.video_url ? <span className="admin-reklama-thumb-badge" title="Video bor"><i className="fas fa-film" /></span> : null}
                              </div>
                            ) : s.video_url ? (
                              <div className="admin-reklama-thumb admin-reklama-thumb--video" aria-hidden>
                                <i className="fas fa-film" />
                              </div>
                            ) : (
                              <div className="admin-reklama-thumb admin-reklama-thumb--empty" aria-hidden>
                                <i className="fas fa-image" />
                              </div>
                            )}
                            <div className="admin-reklama-card-text">
                              <strong>{s.title}</strong>
                              <p className="muted">{s.subtitle || '—'}</p>
                              {s.link_url ? (
                                <p className="admin-reklama-meta">
                                  <i className="fas fa-link" /> {adSlideLinkLabel(adSlideLinkPathFromStored(s.link_url)) || s.link_url}
                                </p>
                              ) : null}
                              <span className={`admin-reklama-badge ${s.active ? 'is-on' : 'is-off'}`}>
                                {s.active ? 'Faol' : 'O‘chirilgan'}
                              </span>
                            </div>
                          </div>
                          <div className="admin-reklama-card-actions">
                            <button
                              type="button"
                              className="btn-neo btn-sm"
                              disabled={adSlideBusy || idx === 0}
                              title="Yuqoriga"
                              onClick={async () => {
                                setAdSlideBusy(`move-${s.id}`);
                                try {
                                  const res = await request(`/admin/portal/ad-slides/${s.id}/move`, {
                                    method: 'POST',
                                    body: JSON.stringify({ direction: 'up' }),
                                  });
                                  if (res.ok) {
                                    const d = await res.json();
                                    setAdSlides(d.slides || []);
                                  }
                                } finally {
                                  setAdSlideBusy(null);
                                }
                              }}
                            >
                              <i className="fas fa-arrow-up" />
                            </button>
                            <button
                              type="button"
                              className="btn-neo btn-sm"
                              disabled={adSlideBusy || idx >= adSlides.length - 1}
                              title="Pastga"
                              onClick={async () => {
                                setAdSlideBusy(`move-${s.id}`);
                                try {
                                  const res = await request(`/admin/portal/ad-slides/${s.id}/move`, {
                                    method: 'POST',
                                    body: JSON.stringify({ direction: 'down' }),
                                  });
                                  if (res.ok) {
                                    const d = await res.json();
                                    setAdSlides(d.slides || []);
                                  }
                                } finally {
                                  setAdSlideBusy(null);
                                }
                              }}
                            >
                              <i className="fas fa-arrow-down" />
                            </button>
                            <button
                              type="button"
                              className="btn-neo btn-sm"
                              onClick={() => {
                                if (idx < AD_SLIDE_SLOT_COUNT) {
                                  setAdSlideFormDetached(false);
                                  setAdSlideSlotSelected(AD_SLIDE_SLOT_INDEXES.map((j) => j === idx));
                                } else {
                                  setAdSlideFormDetached(true);
                                  setAdSlideEditingId(s.id);
                                  setAdSlideForm({
                                    title: s.title || '',
                                    subtitle: s.subtitle || '',
                                    link_path: adSlideLinkPathFromStored(s.link_url),
                                    image_url: s.image_url || '',
                                    video_url: s.video_url || '',
                                    active: Boolean(s.active),
                                  });
                                  setAdSlideRemoveImage(false);
                                }
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              Tahrirlash
                            </button>
                            <button
                              type="button"
                              className="btn-neo btn-neo-danger btn-sm"
                              disabled={!!adSlideBusy}
                              onClick={async () => {
                                if (!window.confirm('Bu slaydni o‘chirasizmi?')) return;
                                setAdSlideBusy(`del-${s.id}`);
                                try {
                                  const res = await request(`/admin/portal/ad-slides/${s.id}`, { method: 'DELETE' });
                                  if (res.ok) {
                                    const list = await loadAdSlides();
                                    if (adSlideEditingId === s.id) resetAdSlideForm(list);
                                    else {
                                      const p = primaryAdSlideSlotIndex(adSlideSlotSelected);
                                      if (p !== null) applyAdSlideSlotFromList(p, list);
                                    }
                                  }
                                } finally {
                                  setAdSlideBusy(null);
                                }
                              }}
                            >
                              O‘chirish
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeView === 'ai_target' && (
                <>
                <div className="panel-card admin-ai-target-panel">
                  <div className="admin-ai-target-hero">
                    <div className="admin-ai-target-hero-blob admin-ai-target-hero-blob--1" aria-hidden />
                    <div className="admin-ai-target-hero-blob admin-ai-target-hero-blob--2" aria-hidden />
                    <div className="admin-ai-target-hero-blob admin-ai-target-hero-blob--3" aria-hidden />
                    <div className="admin-ai-target-hero-inner">
                      <div className="admin-ai-target-hero-copy">
                        <div className="admin-ai-target-pill-row" role="group" aria-label="AI Target tezkor belgilar">
                          <span className="admin-ai-target-pill">
                            <i className="fab fa-facebook-f" aria-hidden />
                            META
                          </span>
                          <span className="admin-ai-target-pill">
                            <i className="fas fa-bullseye" aria-hidden />
                            AI TARGET
                          </span>
                          <button
                            type="button"
                            className="admin-ai-target-pill"
                            onClick={() => setAiTargetGuideOpen(true)}
                            aria-label="Qo‘llanma: Meta token va AI strategiya"
                          >
                            <i className="fas fa-book-open" aria-hidden />
                            QO‘LLANMA
                          </button>
                        </div>
                        <h2 className="admin-ai-target-hero-title">Strategik marketing direktori</h2>
                        <p className="admin-ai-target-hero-desc">
                          Facebook va Instagram reklamalari uchun markaz. Graph API access token serverda shifrlanmasdan saqlanadi — faqat superuser paneli orqali kiriting; token brauzerga qaytarilmaydi. Reklama akkaunti ID + token bilan kampaniyalar ro‘yxatini shu yerdan yuklang.
                        </p>
                        {metaAdsLoading ? (
                          <p className="admin-ai-target-hero-status muted">Sozlamalar yuklanmoqda…</p>
                        ) : null}
                        {metaAdsMessage ? (
                          <p className={`admin-ai-target-hero-status ${metaAdsMessage === 'Saqlandi.' ? 'admin-ai-target-hero-status--ok' : 'admin-ai-target-hero-status--err'}`}>
                            {metaAdsMessage}
                          </p>
                        ) : null}
                      </div>
                      <div className="admin-ai-target-metrics">
                        <div className="admin-ai-target-metric">
                          <div className="admin-ai-target-metric-icon admin-ai-target-metric-icon--violet" aria-hidden>
                            <i className="fas fa-rocket" />
                          </div>
                          <span className="admin-ai-target-metric-label">Faol kampaniyalar</span>
                          <strong className="admin-ai-target-metric-value">
                            {metaApiCampaignStats ? metaApiCampaignStats.active : metaAdsSettings.active_campaigns}
                          </strong>
                          <span className="admin-ai-target-metric-hint">
                            {metaApiCampaignStats ? 'Meta API (effective_status ACTIVE)' : 'API dan yuklang yoki qo‘lda kiriting'}
                          </span>
                        </div>
                        <div className="admin-ai-target-metric">
                          <div className="admin-ai-target-metric-icon admin-ai-target-metric-icon--amber" aria-hidden>
                            <i className="fas fa-user-shield" />
                          </div>
                          <span className="admin-ai-target-metric-label">Tasdiq kutmoqda</span>
                          <strong className="admin-ai-target-metric-value">{metaAdsSettings.pending_approval}</strong>
                          <span className="admin-ai-target-metric-hint">Super Admin tasdig‘i</span>
                        </div>
                        <div className="admin-ai-target-metric">
                          <div className="admin-ai-target-metric-icon admin-ai-target-metric-icon--cyan" aria-hidden>
                            <i className="fas fa-wallet" />
                          </div>
                          <span className="admin-ai-target-metric-label">Kunlik limit</span>
                          <strong className="admin-ai-target-metric-value">
                            {(() => {
                              const raw = String(metaAdsSettings.daily_budget_uzs || '').replace(/\s/g, '').replace(/,/g, '');
                              const n = parseFloat(raw);
                              if (!Number.isFinite(n) || n <= 0) return '—';
                              return formatCurrency(n);
                            })()}
                          </strong>
                          <span className="admin-ai-target-metric-hint">
                            {metaAdsSettings.connected ? 'Ulangan akkaunt' : 'Avval Meta ulanishni saqlang'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="admin-ai-target-hub">
                    <div className="admin-ai-target-hub-card">
                      <div className="admin-ai-target-hub-card-head">
                        <div className="admin-ai-target-hub-icon-wrap admin-ai-target-hub-icon-wrap--fb">
                          <i className="fab fa-facebook-f" aria-hidden />
                        </div>
                        <div>
                          <h3 className="admin-ai-target-hub-title">Facebook / Meta ulanishi</h3>
                          <p className="admin-ai-target-hub-sub muted">
                            Pastdagi <strong>qadam-baqadam</strong> blokdan ID va token oling; token brauzerga qaytmaydi, faqat server saqlaydi.
                          </p>
                        </div>
                        <span
                          className={`admin-ai-target-live ${
                            metaAdsSettings.access_token_configured && String(metaAdsSettings.ad_account_id || '').trim()
                              ? 'is-on'
                              : 'is-off'
                          }`}
                        >
                          <span className="admin-ai-target-live-dot" aria-hidden />
                          {metaAdsSettings.access_token_configured && String(metaAdsSettings.ad_account_id || '').trim()
                            ? 'API tayyor'
                            : 'Token / akkaunt kerak'}
                        </span>
                      </div>

                      <details className="admin-meta-howto-details" open>
                        <summary className="admin-meta-howto-summary">
                          <i className="fas fa-list-ol" aria-hidden />
                          Token va akkaunt ID — qadam-baqadam (bosib yig‘ish mumkin)
                        </summary>
                        <AdminMetaConnectionHowto showHeading={false} />
                      </details>

                      <div className="admin-ai-target-form-grid">
                        <label className="admin-ai-target-field admin-ai-target-field--span2">
                          <span>
                            Graph API access token
                            {metaAdsSettings.access_token_configured ? (
                              <span className="admin-ai-target-token-badge"> saqlangan</span>
                            ) : null}
                          </span>
                          <input
                            type="password"
                            className="neo-input"
                            placeholder={metaAdsSettings.access_token_configured ? 'Yangi token kiritsangiz, almashtiriladi' : 'EAAG... (yoki long-lived token)'}
                            autoComplete="off"
                            value={metaAccessTokenDraft}
                            onChange={(e) => setMetaAccessTokenDraft(e.target.value)}
                          />
                        </label>
                        <div className="admin-ai-target-token-actions">
                          <a
                            className="admin-ai-target-doc-link"
                            href="https://developers.facebook.com/tools/explorer/"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Graph API Explorer
                          </a>
                          {metaAdsSettings.access_token_configured ? (
                            <button type="button" className="admin-ai-target-link-danger" disabled={metaAdsSaving} onClick={() => void clearMetaAccessToken()}>
                              Tokenni olib tashlash
                            </button>
                          ) : null}
                        </div>
                        <label className="admin-ai-target-field">
                          <span>Reklama akkaunti ID</span>
                          <input
                            type="text"
                            className="neo-input"
                            placeholder="masalan: act_1234567890"
                            autoComplete="off"
                            value={metaAdsSettings.ad_account_id}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, ad_account_id: e.target.value }))}
                          />
                        </label>
                        <label className="admin-ai-target-field">
                          <span>Pixel ID</span>
                          <input
                            type="text"
                            className="neo-input"
                            placeholder="Pixel / Dataset ID"
                            autoComplete="off"
                            value={metaAdsSettings.pixel_id}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, pixel_id: e.target.value }))}
                          />
                        </label>
                        <label className="admin-ai-target-field">
                          <span>Kunlik byujet (so‘m)</span>
                          <input
                            type="text"
                            className="neo-input"
                            placeholder="500000"
                            inputMode="numeric"
                            value={metaAdsSettings.daily_budget_uzs}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, daily_budget_uzs: e.target.value }))}
                          />
                        </label>
                        <label className="admin-ai-target-field admin-ai-target-field--span2">
                          <span>Izoh (ixtiyoriy)</span>
                          <input
                            type="text"
                            className="neo-input"
                            placeholder="Business nomi, vazifa…"
                            value={metaAdsSettings.note}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, note: e.target.value }))}
                          />
                        </label>
                        <label className="admin-ai-target-check">
                          <input
                            type="checkbox"
                            checked={metaAdsSettings.connected}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, connected: e.target.checked }))}
                          />
                          <span>Meta bilan bog‘langan deb belgilash</span>
                        </label>
                      </div>
                      <div className="admin-ai-target-hub-actions">
                        <button type="button" className="btn-neo btn-neo-primary" disabled={metaAdsSaving || metaAdsLoading} onClick={() => void saveMetaAdsSettings()}>
                          {metaAdsSaving ? 'Saqlanmoqda…' : 'Ulanish ma’lumotlarini saqlash'}
                        </button>
                        <a
                          className="btn-neo"
                          href="https://business.facebook.com/latest/settings/ad_accounts"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <i className="fab fa-facebook-f" /> Business Suite
                        </a>
                      </div>
                    </div>
                    <div className="admin-ai-target-hub-card admin-ai-target-hub-card--accent">
                      <div className="admin-ai-target-hub-card-head">
                        <div className="admin-ai-target-hub-icon-wrap admin-ai-target-hub-icon-wrap--ads">
                          <i className="fas fa-chart-line" aria-hidden />
                        </div>
                        <div>
                          <h3 className="admin-ai-target-hub-title">Kampaniyalar (Meta API)</h3>
                          <p className="admin-ai-target-hub-sub muted">
                            {metaApiCampaignStats
                              ? `Yuklandi: ${metaApiCampaignStats.total} ta (ACTIVE: ${metaApiCampaignStats.active})`
                              : 'Token va reklama akkaunti ID dan keyin ro‘yxatni yuklang'}
                          </p>
                        </div>
                      </div>
                      <p className="admin-ai-target-manager-lead">
                        <strong>Ads Manager</strong> da yaratilgan kampaniyalar shu yerda kiritilgan <strong>reklama akkaunti</strong> ostida saqlanadi.
                        Alohida «URL orqali ulanish» bo‘lmaydi: chap ustundagi <strong>akkaunt ID</strong> + <strong>Graph API token</strong> bilan «Kampaniyalarni Meta dan yuklash» bosilsa,
                        shu akkauntidagi kampaniyalar ro‘yxati shu jadvalda ko‘rinadi. Tahrirlash hozircha Ads Manager da; keyinroq statusni bu yerdan o‘zgartirish mumkin.
                      </p>
                      {!String(metaAdsSettings.ad_account_id || '').replace(/\D/g, '') ? (
                        <p className="admin-ai-target-manager-lead admin-ai-target-ads-hint muted">
                          Reklama akkaunti ID kiritilmaguncha Ads Manager havolasi umumiy bosh sahifaga ochiladi. Avval chap kartada ID ni saqlang — keyingi bosishda to‘g‘ridan-to‘g‘ri shu akkaunt kampaniyalariga o‘tasiz.
                        </p>
                      ) : null}
                      {metaCampaignsMessage ? (
                        <p className="admin-ai-target-hero-status admin-ai-target-hero-status--err admin-ai-target-campaigns-msg">
                          {metaCampaignsMessage}
                        </p>
                      ) : null}
                      <div className="admin-meta-campaigns-toolbar">
                        <button
                          type="button"
                          className="btn-neo btn-neo-primary"
                          disabled={metaCampaignsLoading || metaAdsLoading}
                          onClick={() => void loadMetaCampaigns()}
                        >
                          {metaCampaignsLoading ? 'Yuklanmoqda…' : 'Kampaniyalarni Meta dan yuklash'}
                        </button>
                        <a
                          className="btn-neo"
                          href={metaAdsManagerCampaignsUrl(metaAdsSettings.ad_account_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Meta Ads Manager — shu reklama akkaunti kampaniyalari"
                        >
                          <i className="fas fa-external-link-alt" aria-hidden />
                          {String(metaAdsSettings.ad_account_id || '').replace(/\D/g, '')
                            ? 'Ads Manager (shu akkaunt)'
                            : 'Ads Manager'}
                        </a>
                      </div>
                      {metaCampaigns.length > 0 ? (
                        <div className="admin-meta-campaigns-wrap">
                          <table className="admin-meta-campaigns-table">
                            <thead>
                              <tr>
                                <th>ID</th>
                                <th>Nom</th>
                                <th>Holat</th>
                                <th>Maqsad</th>
                              </tr>
                            </thead>
                            <tbody>
                              {metaCampaigns.map((c) => (
                                <tr key={String(c.id)}>
                                  <td className="admin-meta-campaigns-id">{c.id}</td>
                                  <td>{c.name || '—'}</td>
                                  <td>
                                    <span className="admin-meta-campaigns-status">{c.effective_status || c.status || '—'}</span>
                                  </td>
                                  <td className="admin-meta-campaigns-muted">{c.objective || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : !metaCampaignsLoading ? (
                        <p className="admin-ai-target-manager-lead muted">Hozircha jadval bo‘sh — yuqoridagi tugmani bosing.</p>
                      ) : null}
                      <div className="admin-ai-target-manager-quick">
                        <label className="admin-ai-target-field admin-ai-target-field--compact">
                          <span>Faol kampaniya (hisob)</span>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            className="neo-input"
                            value={metaAdsSettings.active_campaigns}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, active_campaigns: Math.min(999, Math.max(0, parseInt(e.target.value, 10) || 0)) }))}
                          />
                        </label>
                        <label className="admin-ai-target-field admin-ai-target-field--compact">
                          <span>Tasdiq navbat</span>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            className="neo-input"
                            value={metaAdsSettings.pending_approval}
                            onChange={(e) => setMetaAdsSettings((p) => ({ ...p, pending_approval: Math.min(999, Math.max(0, parseInt(e.target.value, 10) || 0)) }))}
                          />
                        </label>
                      </div>
                      <div className="admin-ai-target-hub-actions">
                        <a
                          className="btn-neo btn-neo-primary"
                          href={metaAdsManagerCampaignsUrl(metaAdsSettings.ad_account_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <i className="fas fa-external-link-alt" aria-hidden /> Ads Manager — kampaniyalar
                        </a>
                        <button type="button" className="btn-neo" disabled={metaAdsSaving || metaAdsLoading} onClick={() => void saveMetaAdsSettings()}>
                          Ko‘rsatkichlarni saqlash
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {aiTargetGuideOpen ? (
                  <div
                    className="modal-overlay-neo admin-ai-target-guide-overlay"
                    onClick={() => setAiTargetGuideOpen(false)}
                    role="presentation"
                  >
                    <div
                      className="modal-panel modal-lg admin-ai-target-guide-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="ai-target-guide-title"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="modal-header-neo admin-ai-target-guide-header">
                        <h4 id="ai-target-guide-title">
                          <i className="fas fa-book-open" aria-hidden /> Qo‘llanma — AI marketing direktori
                        </h4>
                        <button type="button" className="icon-btn" onClick={() => setAiTargetGuideOpen(false)} aria-label="Yopish">
                          <i className="fas fa-times" />
                        </button>
                      </div>
                      <div className="modal-body-neo admin-ai-target-guide-body">
                        <AdminAiTargetGuideBody />
                      </div>
                    </div>
                  </div>
                ) : null}
                </>
              )}
            </>
          )}
        </section>
      </main>

      {roleModalOpen && selectedRoleLive && (
        <div className="modal-overlay-neo" onClick={() => setRoleModalOpen(false)}>
          <div className="modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-neo">
              <h4><i className="fas fa-user-circle" /> Rol ma'lumotlari</h4>
              <button type="button" className="icon-btn" onClick={() => setRoleModalOpen(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="modal-body-neo">
              <div className="stats-mini-grid">
                <div className="mini-stat-card mini-stat-card-simple"><span>ID</span><strong>#{selectedRoleLive.id}</strong></div>
                <div className="mini-stat-card mini-stat-card-simple"><span>Nomi</span><strong>{selectedRoleLive.role_name}</strong></div>
                <div className="mini-stat-card mini-stat-card-simple"><span>Jami</span><strong>{formatCurrency(selectedRoleLive.total_amount)}</strong></div>
                <div className="mini-stat-card mini-stat-card-simple"><span>Status</span><strong>{selectedRoleLive.status}</strong></div>
              </div>
              <div className="table-wrap compact">
                <table className="neo-table compact"><tbody>
                  <tr><th>Login</th><td>{selectedRoleLive.login}</td></tr>
                  <tr><th>Parol</th><td>{showModalPassword ? selectedRoleLive.password : '••••••••'} <button type="button" className="btn-neo" onClick={() => setShowModalPassword((v) => !v)}>{showModalPassword ? 'Yashirish' : 'Ko\'rsatish'}</button></td></tr>
                  <tr><th>Telefon</th><td>{selectedRoleLive.phone || '-'}</td></tr>
                  <tr><th>Email</th><td>{selectedRoleLive.email || '-'}</td></tr>
                  <tr><th>Vazifa</th><td>{selectedRoleLive.task || '-'}</td></tr>
                  <tr><th>Izoh</th><td>{selectedRoleLive.description || '-'}</td></tr>
                  <tr><th>Mukofot</th><td>{formatCurrency(selectedRoleLive.reward_amount)}</td></tr>
                  <tr><th>Jarima</th><td>{formatCurrency(selectedRoleLive.fine_amount)}</td></tr>
                </tbody></table>
              </div>
              <div className="role-modal-portal-panel" style={{ marginTop: '1rem' }}>
                <h5 className="role-create-section-title" style={{ marginBottom: '0.5rem' }}><i className="fas fa-door-open" /> Kirish paneli va kuryer hududi</h5>
                <div className="role-create-fields">
                  <label className="role-create-label role-create-label-full">
                    <span>Panel turi</span>
                    <select
                      className="role-create-input"
                      value={rolePortalDraft}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRolePortalDraft(v);
                        if (v !== 'courier') {
                          setRoleCourierViloyatDraft('');
                          setRoleCourierTumanDraft([]);
                        }
                      }}
                    >
                      {ROLE_PORTAL_OPTIONS.map((opt) => (
                        <option key={opt.value || 'auto'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  {rolePortalDraft === 'courier' ? (
                    <>
                      <label className="role-create-label role-create-label-full">
                        <span>Viloyat / shahar</span>
                        <select
                          className="role-create-input"
                          value={roleCourierViloyatDraft}
                          onChange={(e) => {
                            const vid = e.target.value;
                            setRoleCourierViloyatDraft(vid);
                            if (vid !== 'toshkent_sh') setRoleCourierTumanDraft([]);
                          }}
                        >
                          <option value="">— Tanlang —</option>
                          {PACKER_UZ_VILOYATLAR.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </label>
                      {roleCourierViloyatDraft === 'toshkent_sh' ? (
                        <div className="role-create-label role-create-label-full">
                          <span>Tumanlar (ixtiyoriy, bir nechta)</span>
                          <div className="role-courier-tuman-grid">
                            {TOSHKENT_SH_TUMANS.map((t) => (
                              <label key={t.id} className="role-create-chip">
                                <input
                                  type="checkbox"
                                  checked={roleCourierTumanDraft.includes(t.id)}
                                  onChange={() => toggleRoleCourierTumanDraft(t.id)}
                                />
                                <span>{t.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div style={{ marginTop: '0.65rem' }}>
                    <button type="button" className="btn-neo btn-neo-primary" onClick={() => void handleSaveRolePortal()} disabled={busyKey === `role-portal-${selectedRoleLive.id}`}>
                      Panel va hududni saqlash
                    </button>
                  </div>
                </div>
              </div>
              <div className="role-create">
                <input type="number" className="neo-input" min="0" value={roleActionAmount} onChange={(e) => setRoleActionAmount(e.target.value)} placeholder="Jarima/Mukofot/Oylik summasi" />
              </div>
              <div className="row-actions">
                <button type="button" className="btn-neo btn-neo-success" onClick={() => handleRoleAction('activate')} disabled={busyKey === `role-action-${selectedRoleLive.id}-activate`}>Aktiv</button>
                <button type="button" className="btn-neo btn-neo-warning" onClick={() => handleRoleAction('block')} disabled={busyKey === `role-action-${selectedRoleLive.id}-block`}>Block</button>
                <button type="button" className="btn-neo btn-neo-primary" onClick={() => handleRoleAction('oylik')} disabled={busyKey === `role-action-${selectedRoleLive.id}-oylik`}>Oylik</button>
                <button type="button" className="btn-neo btn-neo-danger" onClick={() => handleRoleAction('fine')} disabled={busyKey === `role-action-${selectedRoleLive.id}-fine`}>Jarima</button>
                <button type="button" className="btn-neo btn-neo-info" onClick={() => handleRoleAction('reward')} disabled={busyKey === `role-action-${selectedRoleLive.id}-reward`}>Mukofot</button>
                <button type="button" className="btn-neo btn-neo-danger" onClick={() => handleRoleAction('delete')} disabled={busyKey === `role-action-${selectedRoleLive.id}-delete`}>O'chirish</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {trashModalOpen && (
        <div className="modal-overlay-neo" onClick={() => setTrashModalOpen(false)}>
          <div className="modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-neo">
              <h4>Savat — o'chirilgan rollar</h4>
              <div className="modal-header-actions">
                {trashRoles.length > 0 && (
                  <button type="button" className="btn-neo btn-neo-danger" onClick={handleClearTrash} disabled={busyKey === 'clear-trash'}>
                    Savatni tozala
                  </button>
                )}
                <button type="button" className="icon-btn" onClick={() => setTrashModalOpen(false)}><i className="fas fa-times" /></button>
              </div>
            </div>
            <div className="modal-body-neo">
              {trashRoles.length === 0 && <p className="muted">Savat bo'sh</p>}
              {trashRoles.map((row) => (
                <div key={row.id} className="role-card">
                  <div className="role-card-head"><strong>{row.role_name}</strong> #{row.id}</div>
                  <div className="row-actions">
                    <button type="button" className="btn-neo btn-neo-success" onClick={() => handleRestoreRole(row.id)} disabled={busyKey === `restore-${row.id}`}>
                      Tiklash
                    </button>
                    <button type="button" className="btn-neo btn-neo-danger" onClick={() => handlePermanentDeleteRole(row)} disabled={busyKey === `delete-${row.id}`}>
                      O'chirish
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

















