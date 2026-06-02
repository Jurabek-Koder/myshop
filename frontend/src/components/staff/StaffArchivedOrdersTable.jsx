import React, { useCallback, useEffect, useState } from 'react';
import { formatDateTimeUz } from '../../utils/uzbekistanTime.js';
import './StaffArchivedOrdersTable.css';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatDateTime(value) {
  return formatDateTimeUz(value, { empty: '—' });
}

function orderStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'archived':
      return 'Arxiv';
    case 'pending':
      return 'Kutilmoqda';
    case 'picked':
      return 'Packer navbatida';
    case 'packaged':
      return 'Qadoqlangan';
    case 'cancelled':
      return 'Bekor qilindi';
    default:
      return status || '—';
  }
}

const STATUS_OPTIONS = [
  { value: 'archived', label: 'Arxiv' },
  { value: 'pending', label: 'Qayta chiqarish (kutilmoqda)' },
  { value: 'cancelled', label: 'Bekor qilindi' },
];

export default function StaffArchivedOrdersTable({
  request,
  canManage = false,
  onError,
  className = '',
}) {
  const [orders, setOrders] = useState([]);
  const [packers, setPackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [packerPick, setPackerPick] = useState({});

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const q = searchDebounced ? `?search=${encodeURIComponent(searchDebounced)}` : '';
      const res = await request(`/archived-orders${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Arxiv zakazlar yuklanmadi');
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (e) {
      onError?.(e.message || 'Arxiv zakazlar yuklanmadi');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [request, searchDebounced, onError]);

  const loadPackers = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await request('/archived-orders/packers');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setPackers(Array.isArray(data.packers) ? data.packers : []);
    } catch (_) {}
  }, [request, canManage]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    loadPackers();
  }, [loadPackers]);

  const runMutation = async (key, fn) => {
    setBusyKey(key);
    try {
      await fn();
      await loadOrders();
    } catch (e) {
      onError?.(e.message || 'Xatolik');
    } finally {
      setBusyKey(null);
    }
  };

  const handleStatusChange = (orderId, status) => {
    void runMutation(`status-${orderId}`, async () => {
      const res = await request(`/archived-orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Holat yangilanmadi');
    });
  };

  const handleAssignPacker = (orderId) => {
    const packerId = packerPick[orderId];
    if (!packerId) {
      onError?.('Packer tanlang.');
      return;
    }
    void runMutation(`packer-${orderId}`, async () => {
      const res = await request(`/archived-orders/${orderId}/assign-packer`, {
        method: 'POST',
        body: JSON.stringify({ packer_id: Number(packerId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Packerga yuborilmadi');
    });
  };

  if (loading && !orders.length) {
    return (
      <div className={`staff-archived-orders ${className}`.trim()}>
        <div className="picker-loading">
          <span className="picker-spinner" aria-hidden />
          <span>Yuklanmoqda…</span>
        </div>
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className={`staff-archived-orders ${className}`.trim()}>
        <div className="staff-archived-orders-toolbar">
          <input
            type="search"
            className="staff-archived-orders-search"
            placeholder="ID, telefon yoki mijoz"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Arxiv zakaz qidiruv"
          />
        </div>
        <div className="picker-empty operator-leads-empty">
          <p>{searchDebounced ? 'Qidiruv bo‘yicha arxiv zakaz topilmadi.' : 'Hozircha arxiv zakaz yo‘q.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`staff-archived-orders ${className}`.trim()}>
      <div className="staff-archived-orders-toolbar">
        <input
          type="search"
          className="staff-archived-orders-search"
          placeholder="ID, telefon yoki mijoz"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Arxiv zakaz qidiruv"
        />
      </div>
      <p className="staff-archived-orders-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="staff-archived-orders-wrap">
        <table className="staff-archived-orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Holat</th>
              <th>Operator</th>
              <th>Qadoqlovchi</th>
              <th>Kuryer</th>
              <th>Summa</th>
              <th>Telefon</th>
              <th>Manzil</th>
              <th>Mahsulot</th>
              <th>Vaqt</th>
              {canManage ? <th>Amal</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isBusy = busyKey === `status-${order.id}` || busyKey === `packer-${order.id}`;
              return (
                <tr key={order.id}>
                  <td className="staff-archived-orders-td-id">
                    #{order.id}
                    {order.lead?.id ? (
                      <span className="operator-order-lead-ref"> · Lead #{order.lead.id}</span>
                    ) : null}
                  </td>
                  <td className="staff-archived-orders-td-status">
                    <span className={`operator-lead-status status-${order.status}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="staff-archived-orders-td-operator">{order.operator_name || '—'}</td>
                  <td className="staff-archived-orders-td-staff">
                    {order.packer?.id
                      ? `${order.packer.full_name || '—'} (#${order.packer.id})`
                      : '—'}
                  </td>
                  <td className="staff-archived-orders-td-staff">
                    {order.courier?.id
                      ? `${order.courier.full_name || '—'} (#${order.courier.id})`
                      : '—'}
                  </td>
                  <td className="staff-archived-orders-td-amount">{formatCurrency(order.total_amount)}</td>
                  <td className="staff-archived-orders-td-phone">
                    {order.contact_phone ? (
                      <a href={`tel:${order.contact_phone}`}>{order.contact_phone}</a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="staff-archived-orders-td-address">{order.shipping_address || '—'}</td>
                  <td className="staff-archived-orders-td-product">{order.product_names || '—'}</td>
                  <td className="staff-archived-orders-td-time">
                    {formatDateTime(order.status_updated_at || order.created_at)}
                  </td>
                  {canManage ? (
                    <td className="staff-archived-orders-td-action">
                      <div className="staff-archived-orders-actions">
                        <select
                          className="staff-archived-orders-select"
                          value={order.status}
                          disabled={isBusy}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          aria-label={`Zakaz #${order.id} holati`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="staff-archived-orders-packer-row">
                          <select
                            className="staff-archived-orders-select"
                            value={packerPick[order.id] || ''}
                            disabled={isBusy}
                            onChange={(e) =>
                              setPackerPick((prev) => ({ ...prev, [order.id]: e.target.value }))
                            }
                            aria-label={`Zakaz #${order.id} packer`}
                          >
                            <option value="">Packer tanlang</option>
                            {packers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name || `Packer #${p.id}`}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="staff-archived-orders-btn"
                            disabled={isBusy || !packerPick[order.id]}
                            onClick={() => handleAssignPacker(order.id)}
                          >
                            {isBusy ? '…' : 'Packerga'}
                          </button>
                        </div>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
