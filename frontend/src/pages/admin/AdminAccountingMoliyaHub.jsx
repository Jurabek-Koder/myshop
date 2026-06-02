import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AccountingAppProvider } from '../accounting-panel/context/AccountingAppContext.jsx';
import { ACCOUNTING_NAV_ITEMS } from '../accounting-panel/accountingNav.js';
import '../accounting-panel/AccountingDesign.css';
import '../accounting-panel/KpiCardTheme.css';
import './AdminAccountingMoliyaHub.css';

const DashboardPage = lazy(() => import('../accounting-panel/pages/DashboardPage.jsx'));
const PayrollPage = lazy(() => import('../accounting-panel/pages/PayrollPage.jsx'));
const FinancePage = lazy(() => import('../accounting-panel/pages/FinancePage.jsx'));
const AnalyticsPage = lazy(() => import('../accounting-panel/pages/AnalyticsPage.jsx'));
const ProductsReportPage = lazy(() => import('../accounting-panel/pages/ProductsReportPage.jsx'));
const RoleFinancePage = lazy(() => import('../accounting-panel/pages/RoleFinancePage.jsx'));
const ArchivePage = lazy(() => import('../accounting-panel/pages/ArchivePage.jsx'));

function HubPageLoader() {
  return (
    <div className="admin-accounting-moliya-hub-loading" role="status">
      <i className="fas fa-circle-notch fa-spin" aria-hidden />
      <span>Yuklanmoqda…</span>
    </div>
  );
}

function HubPageBody({ tabKey, role }) {
  const item = ACCOUNTING_NAV_ITEMS.find((x) => x.key === tabKey);
  const page = item?.page || 'dashboard';

  if (page === 'dashboard') {
    return <DashboardPage />;
  }
  if (page === 'payroll') {
    return <PayrollPage />;
  }
  if (page === 'finance') {
    return <FinancePage />;
  }
  if (page === 'analytics') {
    return <AnalyticsPage />;
  }
  if (page === 'products') {
    return <ProductsReportPage />;
  }
  if (page === 'archive') {
    return <ArchivePage />;
  }
  if (page === 'role') {
    return <RoleFinancePage roleOverride={role || item?.role} />;
  }
  return <DashboardPage />;
}

export default function AdminAccountingMoliyaHub({ onBack, initialTab = 'dashboard' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabsScrollRef = useRef(null);
  const tabButtonRefs = useRef({});

  const activeItem = useMemo(
    () => ACCOUNTING_NAV_ITEMS.find((x) => x.key === activeTab) || ACCOUNTING_NAV_ITEMS[0],
    [activeTab],
  );

  useEffect(() => {
    const node = tabButtonRefs.current[activeTab];
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeTab]);

  return (
    <AccountingAppProvider>
      <div data-apanel className="admin-accounting-moliya-hub ap-theme-light">
        <div className="admin-accounting-moliya-hub-bar">
          <button type="button" className="btn-neo admin-accounting-moliya-hub-back" onClick={onBack}>
            <i className="fas fa-arrow-left" aria-hidden />
            <span className="admin-accounting-moliya-hub-back-text">Orqaga</span>
          </button>
          <div className="admin-accounting-moliya-hub-headings">
            <p className="admin-accounting-moliya-hub-title">Buxgalteriya moliyasi</p>
            <p className="admin-accounting-moliya-hub-subtitle">{activeItem.label}</p>
          </div>
        </div>

        <nav className="admin-accounting-moliya-tabs" aria-label="Buxgalteriya bo‘limlari">
          <p className="admin-accounting-moliya-tabs-hint" aria-hidden="true">
            Bo‘limlar — yonga suring
          </p>
          <div className="admin-accounting-moliya-tabs-scroll" ref={tabsScrollRef}>
            {ACCOUNTING_NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                ref={(el) => {
                  tabButtonRefs.current[item.key] = el;
                }}
                type="button"
                className={`admin-accounting-moliya-tab${activeTab === item.key ? ' admin-accounting-moliya-tab--active' : ''}`}
                aria-current={activeTab === item.key ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={() => setActiveTab(item.key)}
              >
                <span className="admin-accounting-moliya-tab-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="admin-accounting-moliya-tab-label">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="admin-accounting-moliya-hub-content">
          <Suspense fallback={<HubPageLoader />} key={activeItem.key}>
            <HubPageBody tabKey={activeItem.key} role={activeItem.role} />
          </Suspense>
        </div>
      </div>
    </AccountingAppProvider>
  );
}
