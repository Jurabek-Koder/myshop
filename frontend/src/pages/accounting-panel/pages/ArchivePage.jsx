import React, { useCallback, useEffect, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProductReportTable from '../components/ProductReportTable.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';
import { paymentTypeLabel } from '../i18n/uz.js';

export default function ArchivePage() {
  const { api } = useAccountingApp();
  const [tab, setTab] = useState('payroll');
  const [products, setProducts] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prodData, payrollData] = await Promise.all([
        api('/products-report/archive?limit=1000'),
        api('/payroll-archive?limit=300'),
      ]);
      setProducts(prodData.products || []);
      setPayroll(payrollData);
    } catch (e) {
      setError(e?.message || 'Yuklanmadi');
      setProducts([]);
      setPayroll(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="ap-page">
      <PageHeader
        title={uz.nav.payrollArchive}
        subtitle={uz.archive.subtitle}
        actions={
          <button type="button" className="ap-btn" onClick={() => void load()} disabled={loading}>
            {loading ? uz.loading : uz.refresh}
          </button>
        }
      />

      <div className="ap-tabs ap-tabs--archive">
        <button
          type="button"
          className={`ap-tab${tab === 'payroll' ? ' ap-tab--active' : ''}`}
          onClick={() => setTab('payroll')}
        >
          {uz.archive.tabPayroll}
        </button>
        <button
          type="button"
          className={`ap-tab${tab === 'products' ? ' ap-tab--active' : ''}`}
          onClick={() => setTab('products')}
        >
          {uz.archive.tabProducts}
        </button>
      </div>

      <ApAlert error={error} onDismiss={() => setError('')} />
      <ApSpinner show={loading && !payroll && !products.length} />

      {tab === 'products' ? (
        <section className="ap-panel">
          <p className="ap-sub" style={{ marginTop: 0 }}>
            {uz.archive.productsHint}
          </p>
          <ProductReportTable
            products={products}
            showArchiveReason
            emptyText={uz.archive.productsEmpty}
          />
        </section>
      ) : (
        <>
          <section className="ap-panel">
            <h3>{uz.archive.roleDefaultsTitle}</h3>
            <p className="ap-sub">{uz.archive.roleDefaultsHint}</p>
            <div className="ap-table-wrap">
              <table className="ap-table ap-table--wide">
                <thead>
                  <tr>
                    <th>Rol</th>
                    <th>Manba</th>
                    <th className="ap-num">Oylik</th>
                    <th className="ap-center">Avans %</th>
                  </tr>
                </thead>
                <tbody>
                  {(payroll?.role_defaults || []).map((rd) => (
                    <tr key={`${rd.role_source}-${rd.role_key}`}>
                      <td>{rd.role_label || rd.role_key}</td>
                      <td className="ap-sub">{rd.role_source === 'work' ? 'Ish roli' : 'Tizim'}</td>
                      <td className="ap-num">{formatUzs(rd.monthly_salary_uzs)}</td>
                      <td className="ap-center">{Math.round(Number(rd.advance_percent) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!payroll?.role_defaults?.length && !loading ? <p className="ap-empty">{uz.noData}</p> : null}
            </div>
          </section>

          <section className="ap-panel">
            <h3>{uz.archive.paidCyclesTitle}</h3>
            <div className="ap-table-wrap">
              <table className="ap-table ap-table--wide">
                <thead>
                  <tr>
                    <th>Xodim</th>
                    <th>Rol</th>
                    <th>Turi</th>
                    <th>Oy</th>
                    <th className="ap-num">Summa</th>
                    <th>To‘langan</th>
                  </tr>
                </thead>
                <tbody>
                  {(payroll?.paid_cycles || []).map((c) => (
                    <tr key={c.id}>
                      <td>{c.full_name}</td>
                      <td className="ap-sub">{c.role_label}</td>
                      <td>{paymentTypeLabel[c.payment_type] || c.payment_type}</td>
                      <td>
                        {c.cycle_month}-oy {c.cycle_year}
                      </td>
                      <td className="ap-num">{formatUzs(c.amount_uzs)}</td>
                      <td className="ap-sub">{c.paid_at ? formatDateUz(c.paid_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!payroll?.paid_cycles?.length && !loading ? <p className="ap-empty">{uz.noData}</p> : null}
            </div>
          </section>

          <section className="ap-panel">
            <h3>{uz.archive.advancesTitle}</h3>
            <div className="ap-table-wrap">
              <table className="ap-table ap-table--wide">
                <thead>
                  <tr>
                    <th>Xodim</th>
                    <th>Rol</th>
                    <th>Oy</th>
                    <th className="ap-num">Avans</th>
                    <th>Tarqatilgan</th>
                  </tr>
                </thead>
                <tbody>
                  {(payroll?.advance_items || []).map((it) => (
                    <tr key={it.id}>
                      <td>{it.employee_display_name}</td>
                      <td className="ap-sub">{it.role_label}</td>
                      <td>
                        {it.cycle_month}-oy {it.cycle_year}
                      </td>
                      <td className="ap-num">{formatUzs(it.amount_uzs)}</td>
                      <td className="ap-sub">{it.distributed_at ? formatDateUz(it.distributed_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!payroll?.advance_items?.length && !loading ? <p className="ap-empty">{uz.noData}</p> : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
