import React from 'react';
import { formatUzs } from '../utils/formatUzs.js';

/**
 * Buxgalteriya paneli — barcha rollar (staff/:role) ro‘yxat jadvali.
 * Desktop: to‘liq ustunlar; mobil: yonga scroll.
 */
export default function StaffRolesTable({ rows, onViewFinance }) {
  return (
    <>
      <p className="ap-table-scroll-hint" aria-hidden="true">
        ← Jadvalni yonga suring →
      </p>
      <div className="ap-table-wrap">
        <table className="ap-table ap-table--staff-roles">
          <colgroup>
            <col className="ap-col-staff-name" />
            <col className="ap-col-staff-phone" />
            <col className="ap-col-staff-region" />
            <col className="ap-col-staff-orders" />
            <col className="ap-col-staff-balance" />
            <col className="ap-col-staff-action" />
          </colgroup>
          <thead>
            <tr>
              <th>F.I.Sh / Login</th>
              <th>Telefon</th>
              <th>Viloyat</th>
              <th>Buyurtmalar (Ish)</th>
              <th className="ap-num">Kassa Balansi</th>
              <th className="ap-col-action">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div>
                    <strong>{row.full_name || 'Ismsiz'}</strong>
                  </div>
                  <div className="ap-muted ap-table-sub">{row.login}</div>
                </td>
                <td>{row.phone || '-'}</td>
                <td>{row.region_name || '-'}</td>
                <td className="ap-center">
                  <strong>{row.orders_handled || 0} ta</strong>
                </td>
                <td className={`ap-num${Number(row.balance) > 0 ? ' ap-text-ok' : ''}`}>
                  <strong>{formatUzs(row.balance || 0)}</strong>
                </td>
                <td className="ap-col-action">
                  <button type="button" className="ap-btn ap-btn--outline" onClick={() => onViewFinance(row)}>
                    <i className="fas fa-coins" aria-hidden /> Moliyani ko&apos;rish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
