import React from 'react';

/** Ranglar AccountingShell (CSS vars) va KpiCardTheme.css orqali boshqariladi */
export default function KpiCard({ title, value, hint, accent = 'brand' }) {
  return (
    <div className={`ap-kpi ap-kpi--${accent}`}>
      <p className="ap-kpi-label">{title}</p>
      <p className="ap-kpi-value">{value}</p>
      {hint ? <p className="ap-kpi-hint">{hint}</p> : null}
    </div>
  );
}
