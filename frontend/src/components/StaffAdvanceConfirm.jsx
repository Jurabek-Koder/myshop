import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { formatUzs } from '../pages/accounting-panel/utils/formatUzs.js';

/**
 * Ishchi paneli: avans balansga tushganini tasdiqlash (buxgalter tarqatishdan oldin).
 */
export default function StaffAdvanceConfirm() {
  const { request } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request('/staff/payroll-advances/pending');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems(data.items || []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirm(id) {
    setBusyId(id);
    try {
      const res = await request(`/staff/payroll-advances/${id}/confirm`, { method: 'POST', body: '{}' });
      if (res.ok) await load();
    } finally {
      setBusyId(0);
    }
  }

  if (loading || !items.length) return null;

  return (
    <div
      className="staff-advance-confirm"
      style={{
        margin: '0.75rem 0',
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        border: '1px solid rgba(212, 168, 75, 0.45)',
        background: 'rgba(212, 168, 75, 0.12)',
      }}
    >
      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Oylik avans</strong>
      {items.map((it) => (
        <div key={it.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem' }}>
          <span>
            {it.employee_display_name || it.role_label}: <strong>{formatUzs(it.amount_uzs)}</strong> ({Math.round(Number(it.advance_percent) * 100)}%)
          </span>
          <button
            type="button"
            className="ap-btn ap-btn--sm ap-btn--primary"
            disabled={busyId === it.id}
            onClick={() => confirm(it.id)}
          >
            Balansimga tushdi — tasdiqlayman
          </button>
        </div>
      ))}
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', opacity: 0.85 }}>
        Tasdiqlamasangiz avans «kutilmoqda» holatida qoladi.
      </p>
    </div>
  );
}
