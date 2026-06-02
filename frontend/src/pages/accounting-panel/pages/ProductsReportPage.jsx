import React, { useCallback, useEffect, useState } from 'react';
import { useAccountingApp } from '../context/AccountingAppContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProductReportTable from '../components/ProductReportTable.jsx';
import WarehouseLedgerFeed from '../components/WarehouseLedgerFeed.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';

export default function ProductsReportPage() {
  const { api } = useAccountingApp();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/products-report?limit=1000');
      setProducts(data.products || []);
    } catch (e) {
      setError(e?.message || 'Yuklanmadi');
      setProducts([]);
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
        title={uz.nav.productsReport}
        subtitle={uz.productsReport.subtitle}
        actions={
          <button type="button" className="ap-btn" onClick={() => void load()} disabled={loading}>
            {loading ? uz.loading : uz.refresh}
          </button>
        }
      />

      <ApAlert error={error} onDismiss={() => setError('')} />
      <ApSpinner show={loading && !products.length} />

      <section className="ap-panel">
        <ProductReportTable products={products} />
      </section>

      <WarehouseLedgerFeed />
    </div>
  );
}
