import React from 'react';
import { uz } from '../i18n/uz.js';
import { formatUzs } from '../utils/formatUzs.js';

export function productImageSrc(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (s.startsWith('http') || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return s;
  return `/uploads/${s.replace(/^\/+/, '')}`;
}

function lossCell(row) {
  if (!row.has_loss || !row.unit_loss_uzs) return '—';
  return formatUzs(row.unit_loss_uzs);
}

function headerLines(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

function ReportTh({ label, className = '' }) {
  const lines = headerLines(label);
  return (
    <th className={`ap-th-stack ${className}`.trim()}>
      {lines.map((line) => (
        <span key={line} className="ap-th-stack-line">
          {line}
        </span>
      ))}
    </th>
  );
}

function promotionCell(row) {
  if (!row.promotion_label || row.promotion_label === '—') return '—';
  return (
    <span className={`ap-promo-badge${row.promotion_active ? ' ap-promo-badge--active' : ''}`}>
      {row.promotion_label}
      {row.promotion_active && row.promotion_ends_label ? (
        <span className="ap-sub ap-promo-until">{row.promotion_ends_label}</span>
      ) : null}
    </span>
  );
}

export default function ProductReportTable({ products, showArchiveReason = false, emptyText }) {
  return (
    <>
      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="ap-table-wrap">
        <table className="ap-table ap-table--wide ap-table--products-report">
          <colgroup>
            <col className="ap-col-id" />
            <col className="ap-col-img" />
            <col className="ap-col-name" />
            {showArchiveReason ? <col className="ap-col-archive" /> : null}
            <col className="ap-col-promo" />
            <col className="ap-col-money" />
            <col className="ap-col-money" />
            <col className="ap-col-money" />
            <col className="ap-col-money-sm" />
            <col className="ap-col-money" />
            <col className="ap-col-money" />
            <col className="ap-col-money" />
            <col className="ap-col-sold" />
            <col className="ap-col-sold" />
          </colgroup>
          <thead>
            <tr>
              <ReportTh label={uz.productsReport.colId} />
              <ReportTh label={uz.productsReport.colImage} className="ap-center" />
              <ReportTh label={uz.productsReport.colName} />
              {showArchiveReason ? <ReportTh label={uz.productsReport.colArchiveReason} /> : null}
              <ReportTh label={uz.productsReport.colPromotion} className="ap-center" />
              <ReportTh label={uz.productsReport.colListedPrice} className="ap-num" />
              <ReportTh label={uz.productsReport.colSellingPrice} className="ap-num" />
              <ReportTh label={uz.productsReport.colUnitRemainder} className="ap-num" />
              <ReportTh label={uz.productsReport.colUnitLoss} className="ap-num" />
              <ReportTh label={uz.productsReport.colAdminShare} className="ap-num" />
              <ReportTh label={uz.productsReport.colSiteFee} className="ap-num" />
              <ReportTh label={uz.productsReport.colSellerShare} className="ap-num" />
              <ReportTh label={uz.productsReport.colUnitsSold} className="ap-num" />
              <ReportTh label={uz.productsReport.colTotalSold} className="ap-num" />
            </tr>
          </thead>
          <tbody>
            {products.map((row) => {
              const img = productImageSrc(row.image_url);
              const showTotals = row.units_sold > 0;
              return (
                <tr key={row.id} className={row.tracking_active ? 'ap-row-tracking' : undefined}>
                  <td className="ap-sub">{row.id}</td>
                  <td className="ap-center ap-td-image">
                    {img ? (
                      <img className="ap-product-thumb" src={img} alt="" loading="lazy" />
                    ) : (
                      <span className="ap-product-thumb ap-product-thumb--empty" aria-hidden>
                        <i className="fas fa-image" />
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="ap-product-name">{row.name}</span>
                    {row.seller_name ? <span className="ap-sub ap-product-seller">{row.seller_name}</span> : null}
                    {row.tracking_active ? (
                      <span className="ap-sub ap-product-tracking">{row.sale_days} kun sotuvda</span>
                    ) : null}
                  </td>
                  {showArchiveReason ? (
                    <td className="ap-sub">{row.archive_reason_label || '—'}</td>
                  ) : null}
                  <td className="ap-center">{promotionCell(row)}</td>
                  <td className="ap-num">{formatUzs(row.listed_price_uzs)}</td>
                  <td className="ap-num">{formatUzs(row.selling_price_uzs)}</td>
                  <td className="ap-num">{formatUzs(row.unit_remainder_uzs)}</td>
                  <td className={`ap-num${row.has_loss ? ' ap-loss' : ''}`}>{lossCell(row)}</td>
                  <td className="ap-num">
                    <span>{formatUzs(row.admin_share_uzs)}</span>
                    <span className="ap-sub ap-cell-pct">{row.admin_share_percent}%</span>
                  </td>
                  <td className="ap-num">
                    <span>{formatUzs(row.site_fee_uzs)}</span>
                    <span className="ap-sub ap-cell-pct">{row.site_fee_percent}%</span>
                  </td>
                  <td className="ap-num">{formatUzs(row.seller_share_uzs)}</td>
                  <td className="ap-num">{showTotals ? row.units_sold : '—'}</td>
                  <td className="ap-num">
                    {showTotals ? (
                      <>
                        <span>{formatUzs(row.gross_sold_uzs)}</span>
                        <span className="ap-sub ap-cell-pct">
                          A:{formatUzs(row.total_admin_uzs, '')} · S:{formatUzs(row.total_seller_uzs, '')}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!products.length ? <p className="ap-empty">{emptyText || uz.noData}</p> : null}
      </div>
    </>
  );
}
