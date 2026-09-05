import React from 'react';
import { formatDateTimeUz } from '../../utils/uzbekistanTime.js';

const ORDER_COLUMNS = [
  { key: 'id', label: 'ID', narrow: true },
  { key: 'operator', label: 'Operator' },
  { key: 'date', label: 'Sana' },
  { key: 'stream', label: 'Oqim' },
  { key: 'product', label: 'Mahsulot' },
  { key: 'customer', label: 'Haridor' },
  { key: 'region', label: 'Viloyat', narrow: true },
  { key: 'phone', label: 'Telefon' },
  { key: 'status', label: 'Holati', narrow: true },
  { key: 'note', label: 'Izoh' },
];

export default function TargetOrdersView({
  title,
  icon = 'fa-clipboard-list',
  subtitle,
  rows,
  loading,
  emptyText,
}) {
  return (
    <div className="target-surveys-card target-orders-card">
      <div className="target-surveys-head">
        <i className={`fas ${icon}`} aria-hidden />
        <div className="target-orders-head-text">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>

      <div className="target-surveys-table-wrap">
        <div className="target-surveys-grid target-orders-grid" role="table" aria-label={title}>
          <div className="target-surveys-colhead" role="row">
            {ORDER_COLUMNS.map((col) => (
              <div
                key={col.key}
                className={`target-surveys-colhead-cell${col.narrow ? ' is-narrow' : ''}`}
                role="columnheader"
              >
                {col.label}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="target-surveys-empty" role="row">
              <div className="target-surveys-empty-inner" role="cell">
                <i className="fas fa-spinner fa-spin" aria-hidden />
                <p>Yuklanmoqda…</p>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="target-surveys-empty" role="row">
              <div className="target-surveys-empty-inner" role="cell">
                <i className={`fas ${icon}`} aria-hidden />
                <p>{emptyText}</p>
              </div>
            </div>
          ) : (
            rows.map((row) => (
              <div key={`order-${row.id}-${row.date}`} className="target-surveys-row" role="row">
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
                <div className="target-surveys-cell" role="cell" title={row.product}>
                  {row.product}
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
  );
}
