// src/pages/accounting/AccountingHome.jsx
import React from 'react';
import './AccountingDashboard.css';

export default function AccountingHome() {
  return (
    <div className="accounting-wrapper">
      
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="logo">💰 MyShop ERP</div>
        <div className="menu-title">Boshqaruv</div>
        <div className="menu">
          <a href="#" className="active">🏠 Dashboard</a>
          <a href="#">💸 Xarajatlar</a>
          <a href="#">🏦 Kassalar</a>
          <a href="#">📦 Buyurtmalar</a>
          <a href="#">👨‍💼 Seller balans</a>
          <a href="#">🚚 Kuryer hisoboti</a>
          <a href="#">📈 Analitika</a>
          <a href="#">📄 Hisobotlar</a>
          <a href="#">🛡 Audit log</a>
          <a href="#">☁ Backup</a>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <h1>Buxgalteriya Dashboard</h1>
          <div className="profile">👤 Jurabek</div>
        </div>

        {/* CARDS */}
        <div className="cards">
          <div className="card">
            <h3>Bugungi savdo</h3>
            <div className="value blue">12 500 000</div>
          </div>
          <div className="card">
            <h3>Sof foyda</h3>
            <div className="value green">3 200 000</div>
          </div>
          <div className="card">
            <h3>Xarajatlar</h3>
            <div className="value red">1 000 000</div>
          </div>
          <div className="card">
            <h3>Kassadagi pul</h3>
            <div className="value orange">7 800 000</div>
          </div>
        </div>

        {/* CHART */}
        <div className="table-box">
          <div className="table-title">
            <h2>📈 Haftalik statistika</h2>
          </div>
          <div className="chart">
            <div className="bar" style={{ height: '120px' }}><span>Du</span></div>
            <div className="bar" style={{ height: '180px' }}><span>Se</span></div>
            <div className="bar" style={{ height: '140px' }}><span>Cho</span></div>
            <div className="bar" style={{ height: '220px' }}><span>Pa</span></div>
            <div className="bar" style={{ height: '170px' }}><span>Ju</span></div>
            <div className="bar" style={{ height: '240px' }}><span>Sha</span></div>
            <div className="bar" style={{ height: '210px' }}><span>Yak</span></div>
          </div>
        </div>

        {/* TABLE */}
        <div className="table-box">
          <div className="table-title">
            <h2>💸 Oxirgi xarajatlar</h2>
            <button className="btn">+ Xarajat qo‘shish</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nomi</th>
                <th>Kategoriya</th>
                <th>Summa</th>
                <th>Sana</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Facebook reklama</td>
                <td>Marketing</td>
                <td>450 000</td>
                <td>15-May</td>
                <td><span className="status success">To‘langan</span></td>
              </tr>
              <tr>
                <td>Kuryer oyligi</td>
                <td>Oylik</td>
                <td>2 000 000</td>
                <td>14-May</td>
                <td><span className="status success">To‘langan</span></td>
              </tr>
              <tr>
                <td>Server to‘lovi</td>
                <td>Hosting</td>
                <td>350 000</td>
                <td>13-May</td>
                <td><span className="status danger">Kutilmoqda</span></td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
