import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../../components/picker/PickerLichka';
import StaffNotificationBell from '../../components/notifications/StaffNotificationBell.jsx';
import StaffTopbarProfileMenu from '../../components/staff/StaffTopbarProfileMenu';
import StaffTopbarCenterId from '../../components/staff/StaffTopbarCenterId.jsx';
import StaffAdvanceConfirm from '../../components/StaffAdvanceConfirm.jsx';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat';
import { formatDateTimeUz, UZ_TIMEZONE } from '../../utils/uzbekistanTime.js';
import StaffHomeProductCard from '../../components/staff/StaffHomeProductCard.jsx';
import StaffArchivedOrdersTable from '../../components/staff/StaffArchivedOrdersTable.jsx';
import StaffTransactionTimeline from '../../components/finance/StaffTransactionTimeline.jsx';
import '../picker/PickerDashboard.css';
import './OperatorDashboard.css';

const STATUS_LABELS = {
  pending: 'Yangi',
  contacted: "Bog'landim",
  ordered: 'Zakaz qilingan',
  cancelled: 'Arxiv',
};

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatDateTime(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

function orderStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'packaged':
      return 'Qadoqlangan';
    case 'assigned':
      return 'Kuryerga biriktirilgan';
    case 'picked_up':
      return 'Kuryer oldi';
    case 'on_the_way':
      return 'Yo\'lda';
    case 'delivered':
      return 'Sotildi';
    case 'cancelled':
      return 'Bekor qilindi';
    default:
      return status || '—';
  }
}

const myshopPlaneIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false">
    <defs>
      <linearGradient id="operatorSidebarTelegram" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
        <stop stopColor="#37aee2" />
        <stop offset="1" stopColor="#1e96c8" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="11" fill="url(#operatorSidebarTelegram)" />
    <path
      fill="#fff"
      d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.12-.46-.52-.19l-9.48 5.99-4.1-1.3c-.88-.25-.89-.86.2-1.3L19.81 4.54c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.08-3.08-2.05 1.95c-.23.23-.42.42-.83.42z"
    />
  </svg>
);

const OPERATOR_TAB_KEYS = new Set([
  'home',
  'create_lead',
  'lichka',
  'pending',
  'contacted',
  'packaged',
  'courier',
  'delivered',
  'cancelled',
  'archived_orders',
  'konkurs',
  'finance',
  'profile',
  'settings',
]);

function normalizeOperatorTab(raw) {
  const v = String(raw || '').trim();
  return OPERATOR_TAB_KEYS.has(v) ? v : 'home';
}

function productImageSrc(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return s;
  return `/uploads/${s.replace(/^\/+/, '')}`;
}

function OperatorHomeOrderTable({ items, mode, busyKey, onCreateLeadFromOrder, onContactLead }) {
  if (!items?.length) {
    return (
      <p className="operator-home-order-empty">
        {mode === 'confirmed' ? 'Tasdiqlangan zakaz yo&apos;q.' : 'Tasdiqlanmagan zakaz yo&apos;q.'}
      </p>
    );
  }

  return (
    <>
      <p className="operator-home-order-table-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="operator-home-order-table-wrap">
        <table className="operator-home-order-table">
          <thead>
            <tr>
              <th>Rasm</th>
              <th>Mahsulot</th>
              <th className="operator-home-order-th-num">Soni</th>
              <th>Mijoz manzili</th>
              <th>Mijoz raqami</th>
              <th>Mijoz izohi</th>
              <th className="operator-home-order-th-action">Amal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const rowKey =
                row.row_type === 'order'
                  ? `order-${row.order_id}`
                  : `lead-${row.lead_id}-${row.order_id || 0}`;
              const img = productImageSrc(row.product_image_url);
              const isOrderBusy = busyKey === `home-order-${row.order_id}`;
              const isLeadBusy = busyKey === `home-lead-${row.lead_id}`;
              return (
                <tr key={rowKey}>
                  <td className="operator-home-order-td-img">
                    {img ? (
                      <img src={img} alt={row.product_name || ''} className="operator-home-order-product-img" />
                    ) : (
                      <span className="operator-home-order-product-img operator-home-order-product-img--empty" />
                    )}
                  </td>
                  <td className="operator-home-order-td-name">{row.product_name || '—'}</td>
                  <td className="operator-home-order-td-num">{Number(row.quantity) || 1}</td>
                  <td className="operator-home-order-td-address">{row.shipping_address || '—'}</td>
                  <td className="operator-home-order-td-phone">
                    {row.customer_phone ? (
                      <a href={`tel:${row.customer_phone}`}>{row.customer_phone}</a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="operator-home-order-td-note">{row.customer_note || '—'}</td>
                  <td className="operator-home-order-td-action">
                    {mode === 'confirmed' ? (
                      <span className="operator-home-order-status-ok">Tasdiqlangan</span>
                    ) : row.row_type === 'order' ? (
                      <button
                        type="button"
                        className="operator-home-order-action-btn"
                        onClick={() => void onCreateLeadFromOrder(row.order_id)}
                        disabled={isOrderBusy}
                      >
                        {isOrderBusy ? '…' : 'Lead yaratish'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="operator-home-order-action-btn"
                        onClick={() => void onContactLead(row.lead_id)}
                        disabled={isLeadBusy}
                      >
                        {isLeadBusy ? '…' : 'Lead yaratish'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function buildOperatorPendingRows(pendingOrders, leads) {
  const orderRows = (pendingOrders || []).map((order) => ({
    key: `order-${order.id}`,
    rowType: 'order',
    idLabel: `Zakaz #${order.id}`,
    kindLabel: 'Zakaz',
    status: 'Yangi zakaz',
    statusClass: 'pending',
    phone: order.contact_phone || order.customer_phone || order.customer_email || '—',
    phoneHref: order.contact_phone || order.customer_phone || null,
    product:
      order.items?.length > 0
        ? order.items.map((i) => `${i.name_uz} × ${i.quantity}`).join(', ')
        : '—',
    createdAt: order.created_at,
    orderId: order.id,
    productId: order.items?.[0]?.product_id ?? null,
    contactPhone: order.contact_phone || order.customer_phone || '',
    contactEmail: order.customer_email || order.contact_email || '',
    fullName: order.customer_name || order.full_name || '',
    lead: null,
  }));

  const leadRows = (leads || []).map((lead) => ({
    key: `lead-${lead.id}`,
    rowType: 'lead',
    idLabel: `#${lead.id}`,
    kindLabel: "So'rov",
    status: STATUS_LABELS[lead.status] || lead.status || 'Yangi',
    statusClass: lead.status || 'pending',
    phone: lead.contact_phone || lead.contact_email || '—',
    phoneHref: lead.contact_phone || null,
    product: lead.product_name || '—',
    createdAt: lead.created_at,
    orderId: null,
    lead,
  }));

  return [...orderRows, ...leadRows].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );
}

function OperatorPendingActionPicker({ actions }) {
  const safeActions = useMemo(
    () => (actions || []).filter((a) => a && a.label),
    [actions],
  );
  const [index, setIndex] = useState(0);
  const len = safeActions.length;

  useEffect(() => {
    setIndex(0);
  }, [len, safeActions]);

  const wrapIndex = useCallback(
    (value) => {
      if (len <= 0) return 0;
      return ((value % len) + len) % len;
    },
    [len],
  );

  const goUp = useCallback(() => {
    setIndex((prev) => wrapIndex(prev - 1));
  }, [wrapIndex]);

  const goDown = useCallback(() => {
    setIndex((prev) => wrapIndex(prev + 1));
  }, [wrapIndex]);

  if (!len) return null;

  if (len === 1) {
    const only = safeActions[0];
    return (
      <button
        type="button"
        className={`operator-pending-action-btn operator-pending-action-btn--${only.variant || 'detail'} operator-pending-action-btn--solo`}
        onClick={() => {
          if (!only.disabled) only.onClick?.();
        }}
        disabled={only.disabled}
      >
        {only.label}
      </button>
    );
  }

  const selectedIndex = wrapIndex(index);
  const selected = safeActions[selectedIndex];

  return (
    <div className="operator-pending-action-picker">
      <button
        type="button"
        className="operator-pending-action-picker-nav operator-pending-action-picker-nav--up"
        onClick={goUp}
        aria-label="Oldingi amal"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M12 6l-6 8h12l-6-8z" fill="currentColor" />
        </svg>
      </button>
      <div className="operator-pending-action-picker-slot" aria-live="polite">
        <button
          key={selected.id}
          type="button"
          className={[
            'operator-pending-action-btn',
            'operator-pending-action-btn--selected',
            `operator-pending-action-btn--${selected.variant || 'detail'}`,
          ].join(' ')}
          onClick={() => {
            if (!selected.disabled) selected.onClick?.();
          }}
          disabled={selected.disabled}
          aria-label={selected.hint || selected.label}
        >
          {selected.label}
        </button>
      </div>
      <button
        type="button"
        className="operator-pending-action-picker-nav operator-pending-action-picker-nav--down"
        onClick={goDown}
        aria-label="Keyingi amal"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M12 18l6-8H6l6 8z" fill="currentColor" />
        </svg>
      </button>
      {selected.hint ? (
        <p className="operator-pending-action-picker-hint">{selected.hint}</p>
      ) : null}
    </div>
  );
}

function OperatorPendingTable({
  pendingOrders,
  leads,
  busyId,
  detailLoading,
  onOpenDetail,
  onGoCreateLead,
  onContactLead,
  onArchiveLead,
}) {
  const rows = buildOperatorPendingRows(pendingOrders, leads);

  if (!rows.length) {
    return (
      <div className="picker-empty operator-leads-empty">
        <p>Hozircha yangi zakaz yoki so&apos;rov yo&apos;q.</p>
      </div>
    );
  }

  return (
    <>
      <p className="operator-home-order-table-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="operator-pending-table-wrap operator-home-order-table-wrap">
        <table className="operator-pending-table operator-home-order-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Turi</th>
              <th>Holat</th>
              <th>Telefon</th>
              <th>Mahsulot</th>
              <th>Vaqt</th>
              <th className="operator-home-order-th-action">Amal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isLeadBusy = busyId === row.lead?.id;
              return (
                <tr key={row.key}>
                  <td className="operator-pending-td-id">{row.idLabel}</td>
                  <td className="operator-pending-td-kind">{row.kindLabel}</td>
                  <td className="operator-pending-td-status">
                    <span className={`operator-lead-status status-${row.statusClass}`}>{row.status}</span>
                  </td>
                  <td className="operator-pending-td-phone">
                    {row.phoneHref ? (
                      <a href={`tel:${row.phoneHref}`}>{row.phone}</a>
                    ) : (
                      row.phone
                    )}
                  </td>
                  <td className="operator-pending-td-product">{row.product}</td>
                  <td className="operator-pending-td-time">{formatDateTime(row.createdAt)}</td>
                  <td className="operator-home-order-td-action">
                    {row.rowType === 'order' ? (
                      <OperatorPendingActionPicker
                        actions={[
                          {
                            id: 'create-lead',
                            label: 'Lead yaratish',
                            variant: 'create',
                            hint: 'Lead yaratish sahifasiga o\'tish',
                            onClick: () =>
                              onGoCreateLead({
                                product_id: row.productId,
                                full_name: row.fullName,
                                contact_phone: row.contactPhone,
                                contact_email: row.contactEmail,
                              }),
                          },
                        ]}
                      />
                    ) : (
                      <OperatorPendingActionPicker
                        actions={[
                          {
                            id: 'detail',
                            label: 'Batafsil',
                            variant: 'detail',
                            hint: 'Lead tafsilotlarini ko\'rish',
                            disabled: detailLoading,
                            onClick: () => onOpenDetail(row.lead),
                          },
                          {
                            id: 'contact',
                            label: isLeadBusy ? '…' : "Bog'landim",
                            variant: 'contact',
                            hint: 'Mijoz bilan bog\'landi deb belgilash',
                            disabled: isLeadBusy,
                            onClick: () => void onContactLead(row.lead.id),
                          },
                          {
                            id: 'archive',
                            label: 'Arxivga',
                            variant: 'archive',
                            hint: 'Leadni arxivga o\'tkazish',
                            disabled: isLeadBusy,
                            onClick: () => void onArchiveLead(row.lead.id),
                          },
                          {
                            id: 'create-lead',
                            label: 'Lead yaratish',
                            variant: 'create',
                            hint: 'Lead yaratish sahifasiga o\'tish',
                            onClick: () =>
                              onGoCreateLead({
                                product_id: row.lead.product_id,
                                full_name: row.lead.full_name,
                                contact_phone: row.lead.contact_phone,
                                contact_email: row.lead.contact_email,
                              }),
                          },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const OPERATOR_ORDERS_EMPTY = {
  packaged: 'Hozircha qadoqlangan zakaz yo\'q.',
  courier: 'Hozircha kuryerga biriktirilgan zakaz yo\'q.',
  delivered: 'Hozircha sotilgan zakaz yo\'q.',
  cancelled: 'Hozircha bekor qilingan zakaz yo\'q.',
};

function formatOrderProducts(items) {
  if (!items?.length) return '—';
  return items.map((i) => `${i.name_uz || 'Mahsulot'} × ${i.quantity}`).join(', ');
}

function OperatorOrdersTable({ orders, filter }) {
  if (!orders?.length) {
    return (
      <div className="picker-empty operator-leads-empty">
        <p>{OPERATOR_ORDERS_EMPTY[filter] || 'Hozircha zakaz yo\'q.'}</p>
      </div>
    );
  }

  return (
    <>
      <p className="operator-home-order-table-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="operator-orders-table-wrap operator-home-order-table-wrap">
        <table className="operator-orders-table operator-home-order-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Holat</th>
              <th>Qadoqlovchi</th>
              <th>Kuryer</th>
              <th>Summa</th>
              <th>Telefon</th>
              <th>Manzil</th>
              <th>Mahsulot</th>
              <th>Vaqt</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="operator-orders-td-id">
                  #{order.id}
                  {order.lead?.id ? (
                    <span className="operator-order-lead-ref"> · Lead #{order.lead.id}</span>
                  ) : null}
                </td>
                <td className="operator-orders-td-status">
                  <span className={`operator-lead-status status-${order.status}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                </td>
                <td className="operator-orders-td-staff">
                  {order.packer?.id
                    ? `${order.packer.full_name || '—'} (#${order.packer.id})`
                    : '—'}
                </td>
                <td className="operator-orders-td-staff">
                  {order.courier?.id
                    ? `${order.courier.full_name || '—'} (#${order.courier.id})`
                    : '—'}
                </td>
                <td className="operator-orders-td-amount">{formatCurrency(order.total_amount)}</td>
                <td className="operator-orders-td-phone">
                  {order.contact_phone ? (
                    <a href={`tel:${order.contact_phone}`}>{order.contact_phone}</a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="operator-orders-td-address">{order.shipping_address || '—'}</td>
                <td className="operator-orders-td-product">{formatOrderProducts(order.items)}</td>
                <td className="operator-orders-td-time">
                  {formatDateTime(order.status_updated_at || order.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OperatorHomeProductCard({ product: p, onOpen }) {
  if (!p || p.id == null) return null;
  return (
    <StaffHomeProductCard
      name={p.name_uz}
      price={p.sale_price ?? p.price}
      imageUrl={p.image_url}
      warehouseStock={p.remaining_stock ?? p.stock ?? 0}
      orderCount={p.order_count ?? 0}
      onClick={() => onOpen(p.id)}
      ariaLabel={p.name_uz || 'Mahsulot'}
    />
  );
}

function OperatorHomeProductDetail({
  product: p,
  detail,
  detailLoading,
  orderTab,
  onBack,
  onOrderTab,
  onPrevProduct,
  onNextProduct,
  productNavDisabled,
  onCreateLeadFromOrder,
  onContactLead,
  busyKey,
}) {
  if (!p || p.id == null) return null;
  const confirmedItems = detail?.confirmed?.items || [];
  const unconfirmedItems = detail?.unconfirmed?.items || [];
  const confirmedCount = detail?.confirmed?.count ?? confirmedItems.length;
  const unconfirmedCount = detail?.unconfirmed?.count ?? unconfirmedItems.length;

  return (
    <section className="operator-home-product-detail" aria-label={p.name_uz || 'Mahsulot'}>
      <div className="operator-home-detail-head">
        <button
          type="button"
          className="operator-home-detail-back"
          onClick={() => void onBack()}
          aria-label="Bosh sahifaga qaytish"
        >
          <span className="operator-home-detail-back-icon" aria-hidden="true">
            ←
          </span>
        </button>
        <article className="operator-home-detail-product-card card product-card">
          <div className="operator-home-detail-product-image product-image">
            {p.image_url ? (
              <img src={p.image_url} alt={p.name_uz || ''} />
            ) : (
              <div className="product-placeholder" />
            )}
          </div>
          <div className="operator-home-detail-product-body product-card-body">
            <h3>{p.name_uz}</h3>
            <p className="product-price operator-home-card-price">{formatCurrency(p.sale_price ?? p.price)}</p>
          </div>
          <div className="operator-home-detail-product-nav" aria-label="Mahsulotlar orasida almashish">
            <button
              type="button"
              className="operator-home-detail-product-nav-btn"
              onClick={() => void onPrevProduct()}
              disabled={productNavDisabled || detailLoading}
              aria-label="Oldingi mahsulot"
            >
              ↑
            </button>
            <button
              type="button"
              className="operator-home-detail-product-nav-btn"
              onClick={() => void onNextProduct()}
              disabled={productNavDisabled || detailLoading}
              aria-label="Keyingi mahsulot"
            >
              ↓
            </button>
          </div>
        </article>
      </div>

      {detailLoading ? (
        <p className="operator-home-product-expand-loading">Yuklanmoqda…</p>
      ) : detail ? (
        <>
          <p className="operator-home-warehouse-line" title="Omborda kirim / qolgan son">
            <span className="operator-home-warehouse-kirim">{Number(detail.warehouse?.kirim_qty) || 0}</span>
            <span className="operator-home-warehouse-sep" aria-hidden="true">
              /
            </span>
            <span className="operator-home-warehouse-remain">{Number(detail.warehouse?.remaining_stock) || 0}</span>
          </p>
          <div className="operator-home-order-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`operator-home-order-tab${orderTab === 'confirmed' ? ' is-active' : ''}`}
              aria-selected={orderTab === 'confirmed'}
              onClick={() => onOrderTab('confirmed')}
            >
              Tasdiqlangan zakazlar
              {confirmedCount ? ` (${confirmedCount})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              className={`operator-home-order-tab${orderTab === 'unconfirmed' ? ' is-active' : ''}`}
              aria-selected={orderTab === 'unconfirmed'}
              onClick={() => onOrderTab('unconfirmed')}
            >
              Tasdiqlanmagan zakazlar
              {unconfirmedCount ? ` (${unconfirmedCount})` : ''}
            </button>
          </div>
          <div className="operator-home-order-panel" role="tabpanel">
            {orderTab === 'confirmed' ? (
              <OperatorHomeOrderTable
                items={confirmedItems}
                mode="confirmed"
                busyKey={busyKey}
                onCreateLeadFromOrder={onCreateLeadFromOrder}
                onContactLead={onContactLead}
              />
            ) : (
              <OperatorHomeOrderTable
                items={unconfirmedItems}
                mode="unconfirmed"
                busyKey={busyKey}
                onCreateLeadFromOrder={onCreateLeadFromOrder}
                onContactLead={onContactLead}
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function OperatorDashboard() {
  const { request, user, logout, retrySession, updateProfile } = useAuth();
  const { t: pickerUiT, notificationsEnabled, setNotificationsEnabled, locale, setLocale } = usePickerUiSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => normalizeOperatorTab(searchParams.get('tab')), [searchParams]);
  const [leads, setLeads] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [expandedHomeProductId, setExpandedHomeProductId] = useState(null);
  const [homeProductDetail, setHomeProductDetail] = useState(null);
  const [homeProductDetailLoading, setHomeProductDetailLoading] = useState(false);
  const [homeProductOrderTab, setHomeProductOrderTab] = useState('unconfirmed');
  const [orders, setOrders] = useState([]);
  const [finance, setFinance] = useState({
    earnings: [],
    total: 0,
    summary: null,
    fines: [],
    rewards: [],
    transactions: [],
  });
  const [opFinanceTab, setOpFinanceTab] = useState('balance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [createModal, setCreateModal] = useState(null);
  const [createForm, setCreateForm] = useState({
    quantity: 1,
    shipping_address: '',
    contact_phone: '',
    contact_email: '',
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
  const [opWithdrawBal, setOpWithdrawBal] = useState(null);
  const [opWithdrawNoRole, setOpWithdrawNoRole] = useState(false);
  const [opWithdrawAmount, setOpWithdrawAmount] = useState('');
  const [opWithdrawPayout, setOpWithdrawPayout] = useState('cash');
  const [opWithdrawBusy, setOpWithdrawBusy] = useState(false);
  const [opWithdrawMsg, setOpWithdrawMsg] = useState('');
  const [opWithdrawErr, setOpWithdrawErr] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationDetail, setNotificationDetail] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  const [opProfileForm, setOpProfileForm] = useState({
    full_name: '',
    phone: '',
    avatar_url: '',
    email: '',
    login: '',
    password: '',
    password2: '',
  });
  const [opProfileLoading, setOpProfileLoading] = useState(false);
  const [opProfileSaving, setOpProfileSaving] = useState(false);
  const [opProfileError, setOpProfileError] = useState('');
  const [opProfileOk, setOpProfileOk] = useState('');

  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const operatorName = user?.full_name || 'Operator';
  const unreadNotifCount = notifications.filter((n) => !n.read_at).length;

  const isLeadsFilter = ['pending', 'contacted', 'ordered', 'all'].includes(filter);
  const isOrdersFilter = ['packaged', 'courier', 'delivered', 'cancelled'].includes(filter);
  const isArchivedOrdersFilter = filter === 'archived_orders';
  const isFinanceFilter = filter === 'finance';
  const isKonkursFilter = filter === 'konkurs';
  const isCreateLeadFilter = filter === 'create_lead';
  const isHomeFilter = filter === 'home';
  const isLichkaFilter = filter === 'lichka';
  const isProfileFilter = filter === 'profile';
  const isSettingsFilter = filter === 'settings';

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
    if (isLichkaFilter || isProfileFilter || isSettingsFilter) {
      setLoading(false);
      return;
    }
    if (isArchivedOrdersFilter) {
      setLeads([]);
      setPendingOrders([]);
      setOrders([]);
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
        setPendingOrders([]);
        setOrders([]);
        setLoading(false);
        return;
      }
      if (isHomeFilter) {
        const res = await request('/operator/home-products');
        if (!res.ok) throw new Error('Mahsulotlar yuklanmadi');
        const data = await res.json();
        setProducts(Array.isArray(data.products) ? data.products : []);
        setExpandedHomeProductId(null);
        setHomeProductDetail(null);
        setLeads([]);
        setPendingOrders([]);
        setOrders([]);
        setLoading(false);
        return;
      }
      if (isKonkursFilter) {
        setLeads([]);
        setPendingOrders([]);
        setOrders([]);
        await loadContestResults(contestPeriod);
      } else if (isFinanceFilter) {
        const res = await request('/operator/finance');
        if (!res.ok) throw new Error('Moliya yuklanmadi');
        const data = await res.json();
        setFinance({
          earnings: data.earnings || [],
          total: data.total ?? 0,
          summary: data.summary || null,
          fines: data.fines || [],
          rewards: data.rewards || [],
          transactions: data.transactions || [],
        });
        const summary = data.summary;
        if (summary?.has_work_role) {
          setOpWithdrawNoRole(false);
          setOpWithdrawBal(Number(summary.balance) || 0);
        } else {
          setOpWithdrawNoRole(true);
          setOpWithdrawBal(null);
        }
        setLeads([]);
        setPendingOrders([]);
        setOrders([]);
      } else if (isOrdersFilter) {
        const res = await request(`/operator/orders?filter=${filter}`);
        if (!res.ok) throw new Error('Zakazlar yuklanmadi');
        const data = await res.json();
        setOrders(data.orders || []);
        setLeads([]);
        setPendingOrders([]);
      } else {
        const res = await request(`/operator/leads?status=${filter}`);
        if (!res.ok) throw new Error('Leadlar yuklanmadi');
        const data = await res.json();
        setLeads(data.leads || []);
        setPendingOrders(filter === 'pending' ? data.pending_orders || [] : []);
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
    if (isHomeFilter) return;
    setExpandedHomeProductId(null);
    setHomeProductDetail(null);
    setHomeProductDetailLoading(false);
  }, [isHomeFilter]);

  useEffect(() => {
    if (!isProfileFilter) return undefined;
    let cancelled = false;
    setOpProfileError('');
    setOpProfileOk('');
    (async () => {
      setOpProfileLoading(true);
      try {
        const res = await request('/operator/profile');
        const d = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const p = d.profile || {};
        setOpProfileForm({
          full_name: String(p.full_name || '').trim(),
          phone: String(p.phone || '').trim(),
          avatar_url: String(p.avatar_url || '').trim(),
          email: String(p.email || '').trim(),
          login: String(p.login || '').trim(),
          password: '',
          password2: '',
        });
      } catch {
        if (!cancelled) setOpProfileError('Profil yuklanmadi.');
      } finally {
        if (!cancelled) setOpProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, request, isProfileFilter]);

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const t = setInterval(() => loadNotifications(), 30000);
    return () => clearInterval(t);
  }, [loadNotifications]);

  useEffect(() => {
    if (isOrdersFilter) loadNotifications();
  }, [filter, isOrdersFilter, loadNotifications]);

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

  const handleOpProfileSave = async (e) => {
    e.preventDefault();
    setOpProfileSaving(true);
    setOpProfileError('');
    setOpProfileOk('');
    const pwd = String(opProfileForm.password || '').trim();
    if (pwd && pwd !== String(opProfileForm.password2 || '').trim()) {
      setOpProfileError('Parollar mos kelmayapti.');
      setOpProfileSaving(false);
      return;
    }
    try {
      const updatedUser = await updateProfile({
        full_name: opProfileForm.full_name.trim(),
        email: opProfileForm.email.trim(),
        login: opProfileForm.login.trim(),
        phone: opProfileForm.phone.trim(),
        ...(pwd ? { password: pwd } : {}),
      });
      if (updatedUser) {
        setOpProfileForm((prev) => ({
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
      const res = await request('/operator/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: opProfileForm.full_name.trim(),
          phone: opProfileForm.phone.trim(),
          avatar_url: opProfileForm.avatar_url.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Saqlanmadi');
      setOpProfileOk('Saqlandi.');
      setOpProfileForm((p) => ({ ...p, password: '', password2: '' }));
      await retrySession();
    } catch (err) {
      setOpProfileError(err.message || 'Xatolik');
    } finally {
      setOpProfileSaving(false);
    }
  };

  const goNav = (id) => {
    const next = normalizeOperatorTab(id);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'home') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true }
    );
    setSidePanelOpen(false);
    if (next !== 'lichka') setDmActivePeer(null);
  };

  const openCreateLeadPage = useCallback((prefill = {}) => {
    setLeadCreateForm({
      product_id: prefill.product_id != null && prefill.product_id !== '' ? String(prefill.product_id) : '',
      full_name: String(prefill.full_name || '').trim(),
      contact_phone: String(prefill.contact_phone || '').trim(),
      contact_email: String(prefill.contact_email || '').trim(),
    });
    setLeadCreateMessage('');
    setError('');
    goNav('create_lead');
  }, []);

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
      if (status === 'contacted') {
        goNav('contacted');
      } else {
        await loadData();
      }
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmLead = async (leadId) => {
    setBusyId(leadId);
    setError('');
    try {
      const res = await request(`/operator/leads/${leadId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Tasdiqlash amalga oshmadi');
      await loadData();
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateLeadFromOrder = async (orderId) => {
    setBusyId(`order-${orderId}`);
    setError('');
    try {
      const res = await request(`/operator/orders/${orderId}/create-lead`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Lead yaratilmadi');
      goNav('contacted');
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
          is_test: false,
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
      setLeadCreateMessage(d.message || "Lead yaratildi. «Bog'landim» bo'limida tasdiqlang.");
      setLeadCreateForm({ product_id: '', full_name: '', contact_phone: '', contact_email: '' });
      goNav('contacted');
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setLeadCreateBusy(false);
    }
  };

  const openHomeProduct = useCallback(
    async (productId) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id < 1) return;
      const product = products.find((item) => Number(item.id) === id);
      const warehouseStock = Number(product?.remaining_stock ?? product?.stock ?? 0);
      if (warehouseStock <= 0) return;

      setSidePanelOpen(false);

      setExpandedHomeProductId(id);
      setHomeProductOrderTab('unconfirmed');
      setHomeProductDetail(null);
      setHomeProductDetailLoading(true);
      try {
        const res = await request(`/operator/home-product/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Mahsulot yuklanmadi');
        setHomeProductDetail(data);
      } catch (e) {
        setError(e?.message || 'Mahsulot yuklanmadi');
        setExpandedHomeProductId(null);
        setHomeProductDetail(null);
      } finally {
        setHomeProductDetailLoading(false);
      }
    },
    [request, products],
  );

  const closeHomeProductDetail = useCallback(() => {
    setExpandedHomeProductId(null);
    setHomeProductDetail(null);
    setHomeProductDetailLoading(false);
  }, []);

  const stepHomeProduct = useCallback(
    (direction) => {
      if (!products.length) return;
      const currentIdx = products.findIndex((item) => Number(item.id) === Number(expandedHomeProductId));
      if (currentIdx < 0) return;
      const delta = direction === 'next' ? 1 : -1;
      const nextIdx = (currentIdx + delta + products.length) % products.length;
      void openHomeProduct(products[nextIdx].id);
    },
    [products, expandedHomeProductId, openHomeProduct],
  );

  const reloadHomeProductDetail = useCallback(
    async (productId) => {
      const id = Number(productId ?? expandedHomeProductId);
      if (!Number.isInteger(id) || id < 1) return;
      setHomeProductDetailLoading(true);
      try {
        const res = await request(`/operator/home-product/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Mahsulot yuklanmadi');
        setHomeProductDetail(data);
      } catch (e) {
        setError(e?.message || 'Mahsulot yuklanmadi');
      } finally {
        setHomeProductDetailLoading(false);
      }
    },
    [request, expandedHomeProductId],
  );

  const handleHomeCreateLeadFromOrder = async (orderId) => {
    setBusyId(`home-order-${orderId}`);
    setError('');
    try {
      const res = await request(`/operator/orders/${orderId}/create-lead`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Lead yaratilmadi');
      setExpandedHomeProductId(null);
      setHomeProductDetail(null);
      goNav('contacted');
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const handleHomeContactLead = async (leadId) => {
    setBusyId(`home-lead-${leadId}`);
    setError('');
    try {
      const res = await request(`/operator/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'contacted' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Status yangilanmadi');
      setExpandedHomeProductId(null);
      setHomeProductDetail(null);
      goNav('contacted');
    } catch (e) {
      setError(e.message || 'Xatolik');
    } finally {
      setBusyId(null);
    }
  };

  const expandedHomeProduct = useMemo(
    () => products.find((p) => Number(p.id) === Number(expandedHomeProductId)) || null,
    [products, expandedHomeProductId],
  );

  const sideNavItems = useMemo(
    () => [
      { id: 'pending', label: 'Yangi', icon: '📥' },
      { id: 'create_lead', label: 'Lead yaratish', icon: '➕' },
      { id: 'contacted', label: "Bog'landim", icon: '🔗' },
      { id: 'packaged', label: 'Qadoqlangan', icon: '📦' },
      { id: 'courier', label: 'Kuryerlar', icon: '🚚' },
      { id: 'delivered', label: 'Sotildi', icon: '✅' },
      { id: 'cancelled', label: 'Bekor qilindi', icon: '⛔' },
      { id: 'archived_orders', label: 'Arxiv zakazlar', icon: '🗄️' },
      { id: 'konkurs', label: 'Konkurs', icon: '🏆' },
      { id: 'finance', label: 'Moliya', icon: '💰' },
      { id: 'lichka', label: pickerUiT.navMyShopChat, icon: myshopPlaneIcon },
    ],
    [pickerUiT.navMyShopChat]
  );

  const filterTitle = useMemo(() => {
    if (filter === 'home') return pickerUiT.navHome;
    if (filter === 'profile') return 'Profil';
    if (filter === 'settings') return pickerUiT.settingsTitle;
    const found = sideNavItems.find((n) => n.id === filter);
    if (found) return found.label;
    if (filter === 'finance') return 'Moliya';
    return '';
  }, [filter, sideNavItems, pickerUiT.settingsTitle, pickerUiT.navHome]);

  const badgeText = useMemo(() => {
    if (filter === 'profile' || filter === 'settings') return '';
    if (filter === 'finance') {
      const s = finance.summary;
      if (s?.has_work_role) return `Balans: ${formatCurrency(s.balance)}`;
      if (s) return `Sotilgan: ${formatCurrency(s.sold_total)}`;
      return finance.earnings.length ? `Sotilgan: ${finance.earnings.length}` : '';
    }
    if (isOrdersFilter) {
      const labels = {
        packaged: 'Qadoqlangan',
        courier: 'Kuryerlar',
        delivered: 'Sotildi',
        cancelled: 'Bekor qilindi',
      };
      return orders.length ? `${labels[filter] || 'Zakazlar'}: ${orders.length}` : '';
    }
    if (isArchivedOrdersFilter) return 'Arxiv zakazlar';
    if (isHomeFilter || isCreateLeadFilter) return `Mahsulot: ${products.length}`;
    if (isLichkaFilter) return 'Chat';
    if (filter === 'pending') {
      const total = pendingOrders.length + leads.length;
      return total ? `Yangi: ${total}` : '';
    }
    return `Leadlar: ${leads.length}`;
  }, [filter, finance.earnings.length, isOrdersFilter, isArchivedOrdersFilter, orders.length, isHomeFilter, isCreateLeadFilter, products.length, isLichkaFilter, leads.length, pendingOrders.length]);

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
            <StaffTopbarCenterId />
            <div className="picker-topbar-inner">
              <button
                type="button"
                className="picker-topbar-hamburger operator-shell-menu-btn"
                onClick={() => setSidePanelOpen((v) => !v)}
                aria-label={sidePanelOpen ? pickerUiT.ariaSideClose : pickerUiT.ariaSideOpen}
                aria-expanded={sidePanelOpen}
              >
                <span className="picker-hamburger-icon" aria-hidden />
              </button>
              <span className="picker-topbar-logo">MyShop Operator</span>
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
                    if (n.link_type === 'operator_order_packaged') {
                      setNotificationsOpen(false);
                      goNav('packaged');
                    }
                  }}
                  renderActions={(n) =>
                    n.link_type === 'operator_order_packaged' ? (
                      <button
                        type="button"
                        className="operator-btn operator-btn-primary"
                        onClick={async () => {
                          if (!n.read_at) await markNotificationRead(n.id);
                          setNotificationsOpen(false);
                          goNav('packaged');
                        }}
                      >
                        Qadoqlangan
                      </button>
                    ) : null
                  }
                />
                <div className="picker-topbar-profile-slot">
                  <StaffTopbarProfileMenu
                    name={operatorName}
                    avatarUrl={opProfileForm.avatar_url || undefined}
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
                  🎧
                </span>
                <div className="staff-side-panel-logo-text">
                  <span>MyShop</span>
                  <small>OPERATOR PANELI</small>
                </div>
              </div>
            </div>
            <p className="courier-side-intro staff-side-intro">
              <strong>{operatorName}</strong>{' '}
              <span className="courier-side-meta">{badgeText}</span>
            </p>
            <nav className="picker-side-panel-nav" aria-label="Operator bo'limlari">
              <button
                type="button"
                className={`picker-side-panel-item ${filter === 'home' ? 'picker-side-panel-item-active' : ''}`}
                onClick={() => goNav('home')}
                aria-label={pickerUiT.navHome}
              >
                <span className="picker-side-panel-item-icon" aria-hidden>
                  🏠
                </span>
                <span>{pickerUiT.navHome}</span>
              </button>
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

        <main className={`picker-main operator-picker-main${mainTelegramLayout ? ' picker-main--telegram' : ''}`}>
          <StaffAdvanceConfirm />
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
              {isProfileFilter ? (
                <section className="picker-subpage">
                  <h1 className="picker-title">{pickerUiT.profileTitle}</h1>
                  <p className="picker-profile-intro">{pickerUiT.profileIntro}</p>
                  <div className="picker-profile-card">
                    {opProfileLoading ? (
                      <div className="picker-profile-loading">
                        <span className="picker-spinner" aria-hidden />
                        <span>{pickerUiT.profileLoading}</span>
                      </div>
                    ) : (
                      <form className="picker-profile-form staff-account-touch" onSubmit={handleOpProfileSave}>
                        {opProfileError ? (
                          <div className="picker-profile-alert picker-profile-alert--error" role="alert">
                            {opProfileError}
                          </div>
                        ) : null}
                        {opProfileOk ? (
                          <div className="picker-profile-alert picker-profile-alert--ok" role="status">
                            {opProfileOk}
                          </div>
                        ) : null}
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profileName}</span>
                          <input
                            type="text"
                            className="picker-profile-input"
                            value={opProfileForm.full_name}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, full_name: ev.target.value }))}
                            autoComplete="name"
                            required
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profileEmail}</span>
                          <input
                            type="email"
                            className="picker-profile-input"
                            value={opProfileForm.email}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, email: ev.target.value }))}
                            autoComplete="email"
                            required
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profileLogin}</span>
                          <input
                            type="text"
                            className="picker-profile-input"
                            value={opProfileForm.login}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, login: ev.target.value }))}
                            autoComplete="username"
                            required
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profilePhone}</span>
                          <input
                            type="tel"
                            className="picker-profile-input"
                            value={opProfileForm.phone}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, phone: ev.target.value }))}
                            placeholder="+998901234567"
                            autoComplete="tel"
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">Avatar URL</span>
                          <input
                            type="url"
                            className="picker-profile-input"
                            value={opProfileForm.avatar_url}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, avatar_url: ev.target.value }))}
                            placeholder="https://…"
                            autoComplete="off"
                          />
                        </label>
                        <label className="picker-profile-field">
                          <span className="picker-profile-label">{pickerUiT.profilePassword}</span>
                          <input
                            type="password"
                            className="picker-profile-input"
                            value={opProfileForm.password}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, password: ev.target.value }))}
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
                            value={opProfileForm.password2}
                            onChange={(ev) => setOpProfileForm((p) => ({ ...p, password2: ev.target.value }))}
                            autoComplete="new-password"
                          />
                        </label>
                        <button
                          type="submit"
                          className="picker-btn picker-btn-primary picker-profile-submit"
                          disabled={opProfileSaving}
                        >
                          {opProfileSaving ? pickerUiT.profileSaving : pickerUiT.profileSave}
                        </button>
                      </form>
                    )}
                  </div>
                </section>
              ) : null}
              {isSettingsFilter ? (
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
              ) : null}
              {!isProfileFilter && !isSettingsFilter ? (
              <>
              {!isHomeFilter || !expandedHomeProductId ? (
                <>
                  <h1 className="picker-title operator-main-title">{filterTitle}</h1>
                  <p className="picker-subtitle">{todayLine}</p>
                </>
              ) : null}

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

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isHomeFilter ? (
                <section className="operator-home-catalog" aria-label={pickerUiT.navHome}>
                  {products.length === 0 ? (
                    <div className="picker-empty operator-leads-empty">
                      <p>Hozircha saytda mahsulot yo&apos;q.</p>
                    </div>
                  ) : expandedHomeProduct ? (
                    <OperatorHomeProductDetail
                      product={expandedHomeProduct}
                      detail={homeProductDetail}
                      detailLoading={homeProductDetailLoading}
                      orderTab={homeProductOrderTab}
                      onBack={closeHomeProductDetail}
                      onOrderTab={setHomeProductOrderTab}
                      onPrevProduct={() => stepHomeProduct('prev')}
                      onNextProduct={() => stepHomeProduct('next')}
                      productNavDisabled={products.length <= 1}
                      onCreateLeadFromOrder={handleHomeCreateLeadFromOrder}
                      onContactLead={handleHomeContactLead}
                      busyKey={busyId}
                    />
                  ) : (
                    <div className="product-grid operator-home-product-grid">
                      {products.map((p) => (
                        <OperatorHomeProductCard key={p.id} product={p} onOpen={openHomeProduct} />
                      ))}
                    </div>
                  )}
                </section>
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
                  {finance.summary ? (
                    <>
                      <div className="operator-finance-summary-grid" role="group" aria-label="Moliya balanslari">
                        <button
                          type="button"
                          className={`operator-finance-stat${opFinanceTab === 'balance' ? ' operator-finance-stat--active' : ''}`}
                          aria-pressed={opFinanceTab === 'balance'}
                          onClick={() => setOpFinanceTab('balance')}
                        >
                          <span className="operator-finance-stat-label">Balans</span>
                          <strong className="operator-finance-stat-value">
                            {formatCurrency(finance.summary.balance)}
                          </strong>
                          {!finance.summary.has_work_role ? (
                            <span className="operator-finance-stat-meta">Ish ro‘yi yo‘q</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className={`operator-finance-stat${opFinanceTab === 'sold' ? ' operator-finance-stat--active' : ''}`}
                          aria-pressed={opFinanceTab === 'sold'}
                          onClick={() => setOpFinanceTab('sold')}
                        >
                          <span className="operator-finance-stat-label">Sotilgan ulush</span>
                          <strong className="operator-finance-stat-value operator-finance-stat-value--ok">
                            {formatCurrency(finance.summary.sold_total)}
                          </strong>
                          <span className="operator-finance-stat-meta">{finance.summary.sold_count} ta zakaz</span>
                        </button>
                        <button
                          type="button"
                          className={`operator-finance-stat${opFinanceTab === 'rewards' ? ' operator-finance-stat--active' : ''}`}
                          aria-pressed={opFinanceTab === 'rewards'}
                          onClick={() => setOpFinanceTab('rewards')}
                        >
                          <span className="operator-finance-stat-label">Mukofot</span>
                          <strong className="operator-finance-stat-value operator-finance-stat-value--ok">
                            {formatCurrency(finance.summary.reward_amount)}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={`operator-finance-stat${opFinanceTab === 'fines' ? ' operator-finance-stat--active' : ''}`}
                          aria-pressed={opFinanceTab === 'fines'}
                          onClick={() => setOpFinanceTab('fines')}
                        >
                          <span className="operator-finance-stat-label">Jarima</span>
                          <strong className="operator-finance-stat-value operator-finance-stat-value--warn">
                            {formatCurrency(finance.summary.fine_amount)}
                          </strong>
                          {finance.summary.fines_count > 0 ? (
                            <span className="operator-finance-stat-meta">{finance.summary.fines_count} marta</span>
                          ) : null}
                        </button>
                      </div>

                      {opFinanceTab === 'balance' ? (
                        <div className="operator-finance-panel">
                          <p className="operator-finance-panel-hint">
                            Balans — sotilgan ulush, mukofot va jarimalar hisobidan yig‘ilgan umumiy summa.
                          </p>
                          <div className="operator-finance-balance-breakdown">
                            <div className="operator-finance-breakdown-row">
                              <span>Sotilgan ulush</span>
                              <strong>{formatCurrency(finance.summary.sold_total)}</strong>
                            </div>
                            <div className="operator-finance-breakdown-row">
                              <span>Mukofot</span>
                              <strong className="operator-finance-breakdown-plus">
                                +{formatCurrency(finance.summary.reward_amount)}
                              </strong>
                            </div>
                            <div className="operator-finance-breakdown-row">
                              <span>Jarima</span>
                              <strong className="operator-finance-breakdown-minus">
                                −{formatCurrency(finance.summary.fine_amount)}
                              </strong>
                            </div>
                            <div className="operator-finance-breakdown-row operator-finance-breakdown-total">
                              <span>Jami balans</span>
                              <strong>{formatCurrency(finance.summary.balance)}</strong>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {opFinanceTab === 'sold' ? (
                        <div className="operator-finance-panel">
                          <h3 className="operator-finance-section-title">Sotilgan zakazlar ulushi</h3>
                          {finance.earnings.length === 0 ? (
                            <p className="operator-finance-empty">Hozircha sotilgan zakaz ulushi yo‘q.</p>
                          ) : (
                            <ul className="operator-earnings-list">
                              {finance.earnings.map((e) => (
                                <li key={e.id} className="operator-earning-item">
                                  <span>Zakaz #{e.order_id}</span>
                                  <span>{formatCurrency(e.amount)}</span>
                                  <span>{formatDateTime(e.created_at)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}

                      {opFinanceTab === 'rewards' ? (
                        <div className="operator-finance-panel">
                          <h3 className="operator-finance-section-title">Mukofotlar</h3>
                          {finance.rewards.length === 0 ? (
                            <p className="operator-finance-empty">Hozircha mukofot yozuvi yo‘q.</p>
                          ) : (
                            <ul className="operator-earnings-list">
                              {finance.rewards.map((r) => (
                                <li key={r.id} className="operator-earning-item operator-earning-item--reward">
                                  <span>{r.title || 'Mukofot'}</span>
                                  <span>{formatCurrency(r.amount)}</span>
                                  <span>{formatDateTime(r.created_at)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}

                      {opFinanceTab === 'fines' ? (
                        <div className="operator-finance-panel">
                          <h3 className="operator-finance-section-title">Jarimalar</h3>
                          {finance.fines.length === 0 ? (
                            <p className="operator-finance-empty">Hozircha jarima yozuvi yo‘q.</p>
                          ) : (
                            <ul className="operator-earnings-list">
                              {finance.fines.map((r) => (
                                <li key={r.id} className="operator-earning-item operator-earning-item--fine">
                                  <span>{r.title || 'Jarima'}</span>
                                  <span>{formatCurrency(r.amount)}</span>
                                  <span>{formatDateTime(r.created_at)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="operator-finance-total">
                      <span className="operator-finance-label">Jami operator ulushi</span>
                      <strong className="operator-finance-sum">{formatCurrency(finance.total)}</strong>
                    </div>
                  )}
                  <section className="picker-withdrawal-card operator-finance-withdraw">
                    <h3 className="picker-withdrawal-title">Hisobdan pul chiqarish</h3>
                    <p className="muted operator-finance-withdraw-hint">
                      Ish haqi&nbsp;balansidan (portal&nbsp;ish&nbsp;ro‘yi) — superuser&nbsp;tasdiqlaydi,
                      keyin&nbsp;buxgalteriya tasdiqlaydi.
                    </p>
                    {opWithdrawNoRole ? (
                      <p className="picker-withdrawal-msg error">
                        Ishchi&nbsp;rol topilmadi. Administrator&nbsp;portalda&nbsp;operator&nbsp;ish&nbsp;ro‘yi
                        yarating&nbsp;(login/email).
                      </p>
                    ) : opWithdrawBal != null ? (
                      <p className="picker-withdrawal-balance">
                        Chiqarish&nbsp;mumkin: <strong>{formatCurrency(opWithdrawBal)}</strong>
                      </p>
                    ) : (
                      <p className="picker-withdrawal-msg error">Balans yuklanmadi.</p>
                    )}
                    <form
                      className="picker-withdrawal-row"
                      style={{ flexWrap: 'wrap' }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const raw = String(opWithdrawAmount).replace(/\s/g, '').replace(/,/g, '.');
                        const n = Number(raw);
                        if (!Number.isFinite(n) || n <= 0) {
                          setOpWithdrawMsg('Summani kiriting.');
                          setOpWithdrawErr(true);
                          return;
                        }
                        setOpWithdrawBusy(true);
                        setOpWithdrawMsg('');
                        setOpWithdrawErr(false);
                        try {
                          const res = await request('/operator/withdrawal', {
                            method: 'POST',
                            body: JSON.stringify({ amount: n, payout_method: opWithdrawPayout }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data.error || 'Yuborilmadi');
                          setOpWithdrawMsg(data.message || "So‘rov yuborildi.");
                          setOpWithdrawErr(false);
                          setOpWithdrawAmount('');
                          await loadData();
                        } catch (err) {
                          setOpWithdrawMsg(String(err.message || 'Xatolik'));
                          setOpWithdrawErr(true);
                        } finally {
                          setOpWithdrawBusy(false);
                        }
                      }}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        className="picker-withdrawal-input"
                        placeholder="Summa"
                        value={opWithdrawAmount}
                        onChange={(ev) => setOpWithdrawAmount(ev.target.value)}
                        disabled={opWithdrawBusy || opWithdrawNoRole}
                        aria-label="Pul chiqarish summasi"
                      />
                      <select
                        className="picker-withdrawal-input"
                        value={opWithdrawPayout}
                        onChange={(ev) => setOpWithdrawPayout(ev.target.value)}
                        disabled={opWithdrawBusy || opWithdrawNoRole}
                        aria-label="To‘lov turi"
                      >
                        <option value="cash">Naqd</option>
                        <option value="card">Karta</option>
                      </select>
                      <button
                        type="submit"
                        className="picker-btn picker-btn-primary"
                        disabled={opWithdrawBusy || opWithdrawNoRole}
                      >
                        {opWithdrawBusy ? '...' : 'Yuborish'}
                      </button>
                    </form>
                    {opWithdrawMsg ? (
                      <p className={`picker-withdrawal-msg ${opWithdrawErr ? 'error' : 'success'}`}>{opWithdrawMsg}</p>
                    ) : null}
                  </section>
                  <StaffTransactionTimeline transactions={finance.transactions} />
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isArchivedOrdersFilter ? (
                <div className="operator-leads operator-leads--orders-table">
                  <StaffArchivedOrdersTable
                    request={request}
                    canManage={false}
                    onError={(msg) => setError(msg)}
                  />
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isOrdersFilter ? (
                <div className="operator-leads operator-leads--orders-table">
                  <OperatorOrdersTable orders={orders} filter={filter} />
                </div>
              ) : null}

              {!isCreateLeadFilter && !isLichkaFilter && !loading && isLeadsFilter ? (
                <div className={`operator-leads${filter === 'pending' ? ' operator-leads--pending-table' : ''}`}>
                  {filter === 'pending' ? (
                    <OperatorPendingTable
                      pendingOrders={pendingOrders}
                      leads={leads}
                      busyId={busyId}
                      detailLoading={detailLoading}
                      onOpenDetail={openDetail}
                      onGoCreateLead={openCreateLeadPage}
                      onContactLead={(leadId) => handleStatus(leadId, 'contacted')}
                      onArchiveLead={(leadId) => handleStatus(leadId, 'cancelled')}
                    />
                  ) : leads.length === 0 ? (
                    <div className="picker-empty operator-leads-empty">
                      <p>Hozircha lead yo&apos;q.</p>
                    </div>
                  ) : (
                    leads.map((lead) => (
                      <article key={lead.id} className="operator-lead-card">
                        <div className="operator-lead-head">
                          <span className="operator-lead-id">#{lead.id}</span>
                          <span className={`operator-lead-status status-${lead.status}`}>
                            {STATUS_LABELS[lead.status] || lead.status}
                          </span>
                        </div>
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
                                  onClick={() => handleConfirmLead(lead.id)}
                                  disabled={busyId === lead.id}
                                >
                                  {busyId === lead.id ? '...' : 'Tasdiqlayman'}
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
                      </article>
                    ))
                  )}
                </div>
              ) : null}

              {!isCreateLeadFilter &&
              !isLichkaFilter &&
              !loading &&
              !isLeadsFilter &&
              !isOrdersFilter &&
              !isArchivedOrdersFilter &&
              !isFinanceFilter &&
              !isKonkursFilter &&
              !isHomeFilter ? (
                <div className="picker-empty">
                  <p>Bo&apos;lim tanlang.</p>
                </div>
              ) : null}
            </>
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
                    {detailModal.lead.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="operator-btn"
                          onClick={() => {
                            handleStatus(detailModal.lead.id, 'contacted');
                            setDetailModal(null);
                          }}
                          disabled={busyId === detailModal.lead.id}
                        >
                          Bog&apos;landim
                        </button>
                        <button
                          type="button"
                          className="operator-btn operator-btn-danger"
                          onClick={() => {
                            handleStatus(detailModal.lead.id, 'cancelled');
                            setDetailModal(null);
                          }}
                          disabled={busyId === detailModal.lead.id}
                        >
                          Arxivga
                        </button>
                      </>
                    )}
                    {detailModal.lead.status === 'contacted' && (
                      <>
                        <button
                          type="button"
                          className="operator-btn operator-btn-primary"
                          onClick={() => {
                            handleConfirmLead(detailModal.lead.id);
                            setDetailModal(null);
                          }}
                          disabled={busyId === detailModal.lead.id}
                        >
                          Tasdiqlayman
                        </button>
                        <button
                          type="button"
                          className="operator-btn"
                          onClick={() => {
                            handleStatus(detailModal.lead.id, 'cancelled');
                            setDetailModal(null);
                          }}
                          disabled={busyId === detailModal.lead.id}
                        >
                          Arxivga
                        </button>
                      </>
                    )}
                    {detailModal.lead.status === 'ordered' && detailModal.lead.order_id && (
                      <button
                        type="button"
                        className="operator-btn operator-btn-warning"
                        onClick={() => {
                          handleReturn(detailModal.lead.id);
                          setDetailModal(null);
                        }}
                        disabled={busyId === detailModal.lead.id}
                      >
                        Qaytarish
                      </button>
                    )}
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
