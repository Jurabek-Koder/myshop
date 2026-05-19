import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const QUICK_LINKS = [
  {
    to: '/accounting/packer',
    icon: '📦',
    title: 'Packer hisoboti',
    desc: 'Faol packerlar: balans, oylik mukofot/jarima va ledger bo‘yicha jadval.',
  },
  {
    to: '/accounting/picker',
    icon: '🛒',
    title: 'Picker',
    desc: 'Picker bo‘yicha buxgalteriya hisobotlari — tez orada shu yerda.',
  },
  {
    to: '/accounting/courier',
    icon: '🛵',
    title: 'Kuryer',
    desc: 'Kuryer bo‘yicha buxgalteriya hisobotlari — tez orada shu yerda.',
  },
  {
    to: '/accounting/operator',
    icon: '💬',
    title: 'Operator',
    desc: 'Operator bo‘yicha buxgalteriya hisobotlari — tez orada shu yerda.',
  },
  {
    to: '/accounting/seller',
    icon: '🏪',
    title: 'Seller',
    desc: 'Seller bo‘yicha buxgalteriya hisobotlari — tez orada shu yerda.',
  },
  {
    to: '/accounting/stats',
    icon: '📈',
    title: 'Sayt statistikasi',
    desc: 'Yig‘ma ko‘rsatkichlar — tez orada shu yerda.',
  },
];

/** Buxgalteriya bosh sahifasi — asosiy topshiriq va tezkor bo‘limlar. */
export default function AccountingHome() {
  const { user } = useAuth();
  const who = String(user?.full_name || user?.login || '').trim();

  return (
    <div className="accounting-surface-page">
      <div className="accounting-surface-card">
        <div className="accounting-surface-card-accent" aria-hidden />
        <div className="accounting-surface-card-inner">
          <h1 className="accounting-title">Buxgalteriya paneli</h1>

          <section className="accounting-unified-toolbar" aria-label="Bosh sahifa boshqaruvi">
            <label className="accounting-unified-field-label" htmlFor="accounting-home-toolbar-static">
              Bosh sahifa
            </label>
            <div
              id="accounting-home-toolbar-static"
              className="accounting-unified-select accounting-unified-select--static"
              role="status"
            >
              Buxgalteriya · tezkor kirish va xabarlar
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm accounting-unified-refresh"
              disabled
              aria-disabled="true"
            >
              Yangilash
            </button>
          </section>

          <h2 className="accounting-unified-section-title">Tezkor bo‘limlar</h2>
          <p className="accounting-unified-section-lead">
            {who ? `Salom, ${who}. ` : ''}
            Pul yechish va to‘lov xabarlarida «Tasdiqlash» yoki «Pul berildi» tugmasidan foydalaning (yuqoridagi
            qo‘ng‘iroqcha).
          </p>

          <nav className="accounting-home-nav" aria-label="Tezkor bo‘limlar">
            {QUICK_LINKS.map((item) => (
              <Link key={item.to} className="accounting-home-card" to={item.to}>
                <span className="accounting-home-card-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="accounting-home-card-body">
                  <span className="accounting-home-card-title">{item.title}</span>
                  <span className="accounting-home-card-desc muted">{item.desc}</span>
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
