import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';
import ModalWrapper from '../../../components/ModalWrapper.jsx';

export default function KuryerlarPage() {
  const { request } = useAuth();
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modal State
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [moliyaStats, setMoliyaStats] = useState(null);
  const [moliyaLoading, setMoliyaLoading] = useState(false);

  useEffect(() => {
    fetchCouriers();
  }, []);

  async function fetchCouriers() {
    setLoading(true);
    setError('');
    try {
      const res = await request('/accounting/couriers');
      if (res.ok) {
        const d = await res.json();
        setCouriers(d.couriers || []);
      } else {
        const d = await res.json();
        setError(d.error || uz.errors.failedToLoad);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openMoliya(courier) {
    setSelectedCourier(courier);
    setMoliyaStats(null);
    setMoliyaLoading(true);
    try {
      const res = await request(`/accounting/couriers/${courier.id}/moliya`);
      if (res.ok) {
        const d = await res.json();
        setMoliyaStats(d);
      } else {
        console.error('Failed to load moliya stats');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMoliyaLoading(false);
    }
  }

  function closeMoliya() {
    setSelectedCourier(null);
    setMoliyaStats(null);
  }

  const filteredCouriers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return couriers;
    return couriers.filter(c => 
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.login || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  }, [couriers, search]);

  return (
    <div className="ap-page">
      <PageHeader
        title="Kuryerlar"
        subtitle="Barcha kuryerlar ro'yxati va moliya ma'lumotlari"
        icon="fa-motorcycle"
        onRefresh={fetchCouriers}
      />
      {error && <ApAlert type="error" message={error} onClose={() => setError('')} />}

      <div className="ap-card" style={{ marginBottom: '20px' }}>
        <input 
          type="search" 
          className="ap-input" 
          placeholder="Ism, telefon, login bilan qidiring..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          style={{ width: '100%', maxWidth: '400px' }}
        />
      </div>

      <div className="ap-card">
        {loading ? (
          <ApSpinner />
        ) : filteredCouriers.length === 0 ? (
          <p className="ap-muted" style={{ padding: '20px', textAlign: 'center' }}>Kuryerlar topilmadi.</p>
        ) : (
          <>
            <p className="ap-table-scroll-hint" aria-hidden="true">
              ← Jadvalni yonga suring →
            </p>
            <div className="ap-table-wrap">
              <table className="ap-table ap-table--staff-roles">
              <thead>
                <tr>
                  <th>F.I.Sh / Login</th>
                  <th>Telefon</th>
                  <th>Viloyat</th>
                  <th>Buyurtmalar</th>
                  <th style={{ textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filteredCouriers.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div><strong>{row.full_name || 'Ismsiz'}</strong></div>
                      <div className="ap-muted" style={{ fontSize: '0.85em' }}>{row.login}</div>
                    </td>
                    <td>{row.phone || '-'}</td>
                    <td>{row.region_name || '-'}</td>
                    <td>{row.orders_handled || 0} ta</td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="ap-btn ap-btn--outline" 
                        onClick={() => openMoliya(row)}
                      >
                        <i className="fas fa-coins" /> Moliyani ko'rish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {selectedCourier && (
        <ModalWrapper open={!!selectedCourier} onClose={closeMoliya} title={`${selectedCourier.full_name || selectedCourier.login} moliyasi`} maxWidth="800px">
          {moliyaLoading ? <ApSpinner /> : moliyaStats ? (
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div className="ap-card" style={{ flex: 1, minWidth: '200px', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}>
                  <h4 style={{ color: '#047857', marginBottom: '10px' }}>Kassaga Topshiriladigan (Netto)</h4>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46' }}>
                    {formatUzs(moliyaStats.balance)}
                  </div>
                </div>
              </div>
              
              <h3 style={{ marginBottom: '15px' }}>Kunlik Buyurtmalar Statistikasi</h3>
              <div className="ap-table-wrap" style={{ marginBottom: '30px' }}>
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Soni</th>
                      <th>Jami Summa</th>
                      <th>Kuryer Haqqi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moliyaStats.stats.length === 0 ? (
                      <tr><td colSpan="4" className="ap-muted" style={{ textAlign: 'center' }}>Ma'lumot yo'q</td></tr>
                    ) : moliyaStats.stats.map((st, idx) => (
                      <tr key={idx}>
                        <td>{st.status}</td>
                        <td>{st.count}</td>
                        <td>{formatUzs(st.total_amount)}</td>
                        <td>{formatUzs(st.total_courier_fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ marginBottom: '15px' }}>Pul Yechish Tarixi (Tranzaksiyalar)</h3>
              <div className="ap-table-wrap">
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>Sana</th>
                      <th>Summa</th>
                      <th>Turi</th>
                      <th>Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moliyaStats.withdrawals.length === 0 ? (
                      <tr><td colSpan="4" className="ap-muted" style={{ textAlign: 'center' }}>Tranzaksiyalar yo'q</td></tr>
                    ) : moliyaStats.withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td>{formatDateUz(w.created_at)}</td>
                        <td><strong>{formatUzs(w.amount)}</strong></td>
                        <td>{w.payout_method === 'card' ? 'Karta' : 'Naqd'}</td>
                        <td>
                          {w.status === 'pending' ? <span style={{ color: '#eab308' }}>Kutilmoqda</span> : 
                           w.status === 'paid' ? <span style={{ color: '#22c55e' }}>To'landi</span> : 
                           <span style={{ color: '#ef4444' }}>Rad etildi</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="ap-muted" style={{ padding: '20px', textAlign: 'center' }}>Ma'lumot topilmadi.</p>
          )}
        </ModalWrapper>
      )}
    </div>
  );
}
