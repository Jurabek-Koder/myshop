import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import { uz } from '../i18n/uz.js';

const POLL_MS = 4000;

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function typeClass(type) {
  if (type === 'kirim') return 'ap-ledger-type ap-ledger-type--in';
  if (type === 'chiqim') return 'ap-ledger-type ap-ledger-type--out';
  return 'ap-ledger-type ap-ledger-type--revoke';
}

function qtyLabel(row) {
  const q = Number(row.qty) || 0;
  if (row.event_type === 'chiqim') return `−${Math.abs(q)}`;
  if (q > 0) return `+${q}`;
  return String(q);
}

export default function WarehouseLedgerFeed() {
  const { api } = useAccountingApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  const maxIdRef = useRef(0);
  const mountedRef = useRef(true);

  const mergeEvents = useCallback((incoming, replace = false) => {
    if (!incoming?.length) {
      if (replace) setEvents([]);
      return;
    }
    setEvents((prev) => {
      const base = replace ? [] : prev;
      const map = new Map(base.map((e) => [e.id, e]));
      for (const e of incoming) {
        map.set(e.id, e);
        if (e.id > maxIdRef.current) maxIdRef.current = e.id;
      }
      return Array.from(map.values()).sort((a, b) => b.id - a.id);
    });
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/warehouse-ledger/feed?limit=80');
      const list = data.events || [];
      maxIdRef.current = list.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
      mergeEvents(list, true);
    } catch (e) {
      if (mountedRef.current) setError(e?.message || 'Yuklanmadi');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [api, mergeEvents]);

  const pollNew = useCallback(async () => {
    try {
      const data = await api(`/warehouse-ledger/events?since_id=${maxIdRef.current}&limit=100`);
      const list = data.events || [];
      if (list.length) mergeEvents(list, false);
      if (mountedRef.current) {
        setLive(true);
        setError('');
      }
    } catch (e) {
      if (mountedRef.current) {
        setLive(false);
        setError(e?.message || 'Jonli yangilanish uzildi');
      }
    }
  }, [api, mergeEvents]);

  useEffect(() => {
    mountedRef.current = true;
    void loadInitial();
    const timer = window.setInterval(() => void pollNew(), POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [loadInitial, pollNew]);

  return (
    <section className="ap-panel ap-panel--ledger-feed">
      <div className="ap-panel-head-row">
        <div>
          <h3 className="ap-panel-title">{uz.warehouseLedger.title}</h3>
          <p className="ap-sub">{uz.warehouseLedger.subtitle}</p>
        </div>
        <div className="ap-ledger-feed-meta">
          <span className={`ap-live-dot${live ? ' ap-live-dot--on' : ''}`} aria-hidden="true" />
          <span className="ap-sub">{live ? uz.warehouseLedger.liveOn : uz.warehouseLedger.liveOff}</span>
          <button type="button" className="ap-btn ap-btn--sm" onClick={() => void loadInitial()} disabled={loading}>
            {loading ? uz.loading : uz.refresh}
          </button>
        </div>
      </div>

      {error ? <p className="ap-alert ap-alert--warn">{error}</p> : null}

      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="ap-table-wrap">
        <table className="ap-table ap-table--wide ap-table--ledger-feed">
          <thead>
            <tr>
              <th>{uz.warehouseLedger.colTime}</th>
              <th>{uz.warehouseLedger.colType}</th>
              <th>{uz.warehouseLedger.colProduct}</th>
              <th>{uz.warehouseLedger.colSeller}</th>
              <th className="ap-num">{uz.warehouseLedger.colQty}</th>
              <th className="ap-num">{uz.warehouseLedger.colStockBefore}</th>
              <th className="ap-num">{uz.warehouseLedger.colStockAfter}</th>
              <th>{uz.warehouseLedger.colActor}</th>
            </tr>
          </thead>
          <tbody>
            {!events.length && !loading ? (
              <tr>
                <td colSpan={8} className="ap-empty">
                  {uz.warehouseLedger.empty}
                </td>
              </tr>
            ) : null}
            {events.map((row) => (
              <tr key={row.id} className="ap-ledger-row">
                <td className="ap-ledger-time">{formatTime(row.created_at)}</td>
                <td>
                  <span className={typeClass(row.event_type)}>{row.event_label || row.event_type}</span>
                </td>
                <td>{row.product_name || `#${row.product_id}`}</td>
                <td>{row.seller_name || '—'}</td>
                <td className="ap-num ap-ledger-qty">{qtyLabel(row)}</td>
                <td className="ap-num">{row.stock_before}</td>
                <td className="ap-num">{row.stock_after}</td>
                <td>{row.actor_label || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
