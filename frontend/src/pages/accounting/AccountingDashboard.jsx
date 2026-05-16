import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatDateTimeUz } from '../../utils/uzbekistanTime.js';
import './AccountingDashboard.css';

function formatBellDate(value) {
  return formatDateTimeUz(value, { empty: '-' });
}

/** Buxgalteriya paneli — pul yechish va to‘lov bildirishnomalari, tasdiq tugmalari. */
export default function AccountingDashboard() {
  const { user, logout, request } = useAuth();
  const who = String(user?.full_name || user?.login || '').trim();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bellBusyId, setBellBusyId] = useState(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await request('/accounting/portal/notifications');
      const d = res.ok ? await res.json() : { notifications: [] };
      setNotifications(d.notifications || []);
    } catch (_) {
      setNotifications([]);
    }
  }, [request]);

  useEffect(() => {
    if (notificationsOpen) void loadNotifications();
  }, [notificationsOpen, loadNotifications]);

  const handleApproveWithdrawal = useCallback(
    async (notif) => {
      if (notif?.link_type !== 'withdrawal' || !notif?.link_id) return;
      setBellBusyId(notif.id);
      try {
        const res = await request(`/accounting/portal/withdrawal-requests/${notif.link_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved', note: '' }),
        });
        if (res.ok) {
          await request(`/accounting/portal/notifications/${notif.id}/read`, { method: 'PATCH' });
          await loadNotifications();
        }
      } finally {
        setBellBusyId(null);
      }
    },
    [request, loadNotifications],
  );

  const handleMarkPaid = useCallback(
    async (notif) => {
      if (notif?.link_type !== 'withdrawal_payout' || !notif?.link_id) return;
      setBellBusyId(notif.id);
      try {
        const res = await request(`/accounting/portal/withdrawal-requests/${notif.link_id}/mark-paid`, {
          method: 'PATCH',
          body: JSON.stringify({}),
        });
        if (res.ok) {
          await request(`/accounting/portal/notifications/${notif.id}/read`, { method: 'PATCH' });
          await loadNotifications();
        }
      } finally {
        setBellBusyId(null);
      }
    },
    [request, loadNotifications],
  );

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="accounting-shell">
      <header className="accounting-header">
        <div className="accounting-header-main">
          <h1 className="accounting-title">Buxgalteriya paneli</h1>
          <p className="accounting-subtitle muted">
            {who ? `Salom, ${who}. ` : ''}
            Pul yechish va to‘lov xabarlarida «Tasdiqlash» yoki «Pul berildi» tugmasidan foydalaning.
          </p>
        </div>
        <div className="accounting-header-actions">
          <div className="accounting-bell-wrap">
            <button
              type="button"
              className="accounting-icon-btn"
              title="Bildirishnomalar"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((v) => !v)}
            >
              <i className="fas fa-bell" aria-hidden />
              {unreadCount > 0 && <span className="accounting-bell-dot">{unreadCount}</span>}
            </button>
          </div>
          <Link to="/" className="btn btn-outline accounting-btn-link">
            Do‘kon
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => logout()}>
            Chiqish
          </button>
        </div>
      </header>

      {notificationsOpen &&
        createPortal(
          <>
            <div
              className="accounting-bell-backdrop"
              role="presentation"
              aria-hidden="true"
              onClick={() => setNotificationsOpen(false)}
            />
            <div
              className="accounting-bell-dropdown"
              role="dialog"
              aria-modal="true"
              aria-labelledby="accounting-bell-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="accounting-bell-head" id="accounting-bell-title">
                Bildirishnomalar
              </div>
              {notifications.length === 0 ? (
                <p className="accounting-bell-empty">Xabar yo‘q</p>
              ) : (
                <ul className="accounting-bell-list">
                  {notifications.map((n) => (
                    <li key={n.id} className={n.read_at ? '' : 'unread'}>
                      <div className="accounting-bell-item">
                        <div className="accounting-bell-item-title">{n.title}</div>
                        <div className="accounting-bell-item-body">{n.body}</div>
                        <div className="accounting-bell-item-date">{formatBellDate(n.created_at)}</div>
                        {n.link_type === 'withdrawal' && n.link_id && (
                          <button
                            type="button"
                            className="btn btn-success btn-sm accounting-bell-action"
                            disabled={bellBusyId === n.id}
                            onClick={() => {
                              handleApproveWithdrawal(n);
                              setNotificationsOpen(false);
                            }}
                          >
                            {bellBusyId === n.id ? '...' : 'Tasdiqlash'}
                          </button>
                        )}
                        {n.link_type === 'withdrawal_payout' && n.link_id && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm accounting-bell-action"
                            disabled={bellBusyId === n.id}
                            onClick={() => {
                              handleMarkPaid(n);
                              setNotificationsOpen(false);
                            }}
                          >
                            {bellBusyId === n.id ? '...' : 'Pul berildi'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
