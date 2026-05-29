import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ApAlert, ApSpinner } from '../components/ApAlert.jsx';
import { uz } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';
import ModalWrapper from '../../../components/ModalWrapper.jsx';

const roleTitles = {
  courier: 'Kuryerlar',
  operator: 'Operatorlar',
  packer: 'Qadoqlovchilar (Packers)',
  picker: 'Yig\'uvchilar (Pickers)',
  expeditor: 'Ekspeditorlar',
  seller: 'Sotuvchilar (Sellers)',
  warehouse_admin: 'Ombor Adminlari'
};

const roleIcons = {
  courier: 'fa-motorcycle',
  operator: 'fa-headset',
  packer: 'fa-box',
  picker: 'fa-hand-holding',
  expeditor: 'fa-truck',
  seller: 'fa-store',
  warehouse_admin: 'fa-warehouse'
};

export default function RoleFinancePage() {
  const { role } = useParams();
  const { request } = useAuth();
  
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modal State
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [moliyaStats, setMoliyaStats] = useState(null);
  const [moliyaLoading, setMoliyaLoading] = useState(false);

  useEffect(() => {
    // 100% reset state on role parameter change to prevent mixing of calculations between roles
    setStaffList([]);
    setSearch('');
    setSelectedStaff(null);
    setMoliyaStats(null);
    setError('');
    fetchStaff();
  }, [role]);

  async function fetchStaff() {
    setLoading(true);
    setError('');
    try {
      const res = await request(`/accounting/staff/${role}`);
      if (res.ok) {
        const d = await res.json();
        setStaffList(d.staff || []);
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

  async function openMoliya(staff) {
    setSelectedStaff(staff);
    setMoliyaStats(null);
    setMoliyaLoading(true);
    try {
      const res = await request(`/accounting/staff/${role}/${staff.id}/moliya`);
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
    setSelectedStaff(null);
    setMoliyaStats(null);
  }

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return staffList;
    return staffList.filter(c => 
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.login || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  }, [staffList, search]);

  const pageTitle = roleTitles[role] || 'Xodimlar';
  const pageIcon = roleIcons[role] || 'fa-users';

  return (
    <div className="ap-page">
      <PageHeader
        title={pageTitle}
        subtitle={`${pageTitle} ro'yxati va moliya ma'lumotlari`}
        icon={pageIcon}
        onRefresh={fetchStaff}
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
        ) : filteredStaff.length === 0 ? (
          <p className="ap-muted" style={{ padding: '20px', textAlign: 'center' }}>Xodimlar topilmadi.</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>F.I.Sh / Login</th>
                  <th>Telefon</th>
                  <th>Viloyat</th>
                  <th>Buyurtmalar (Ish)</th>
                  <th>Kassa Balansi</th>
                  <th style={{ textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div><strong>{row.full_name || 'Ismsiz'}</strong></div>
                      <div className="ap-muted" style={{ fontSize: '0.85em' }}>{row.login}</div>
                    </td>
                    <td>{row.phone || '-'}</td>
                    <td>{row.region_name || '-'}</td>
                    <td><strong>{row.orders_handled || 0} ta</strong></td>
                    <td style={{ color: row.balance > 0 ? '#10b981' : undefined, fontWeight: 'bold' }}>
                      {formatUzs(row.balance || 0)}
                    </td>
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
        )}
      </div>

      {selectedStaff && (
        <ModalWrapper open={!!selectedStaff} onClose={closeMoliya} title={`${selectedStaff.full_name || selectedStaff.login} moliyasi`} maxWidth="800px">
          {moliyaLoading ? <ApSpinner /> : moliyaStats ? (
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div className="ap-card" style={{ flex: 1, minWidth: '200px', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}>
                  <h4 style={{ color: '#047857', marginBottom: '10px' }}>Kassaga Topshiriladigan / Qolgan (Netto)</h4>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46' }}>
                    {formatUzs(moliyaStats.balance)}
                  </div>
                </div>
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
                          {w.status === 'awaiting_payout' ? (
                            <span className="ap-badge ap-badge--warning">Kutilmoqda</span>
                          ) : w.status === 'paid' ? (
                            <span className="ap-badge ap-badge--success">To'langan</span>
                          ) : w.status === 'rejected' ? (
                            <span className="ap-badge ap-badge--danger">Rad etilgan</span>
                          ) : (
                            <span className="ap-badge">{w.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Xatolik yuz berdi</div>
          )}
        </ModalWrapper>
      )}
    </div>
  );
}
