import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const ROLE_OPTIONS = [
  { value: 'operator', label: 'Operator' },
  { value: 'courier', label: 'Kuryer' },
  { value: 'picker', label: 'Picker' },
  { value: 'packer', label: 'Packer' },
  { value: 'expeditor', label: 'Ekspeditor' },
  { value: 'order_receiver', label: 'Buyurtma qabul qiluvchi' },
  { value: 'seller', label: 'Seller' },
  { value: 'superuser', label: 'Superuser' },
];

/**
 * Superuser chat: yangi guruh — qaysi rol, vazifalar matni, guruh adminlari.
 */
export default function AdminStaffGroupWizard({ onClose }) {
  const { request } = useAuth();
  const [title, setTitle] = useState('');
  const [targetRole, setTargetRole] = useState('operator');
  const [tasks, setTasks] = useState('');
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ target_role: targetRole });
        const res = await request(`/admin/staff-group-admin-candidates?${q}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        setPeers(Array.isArray(d.peers) ? d.peers : []);
      } catch {
        if (!cancelled) setPeers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, targetRole]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (peers.some((p) => p.id === id)) next.add(id);
      }
      return next;
    });
  }, [targetRole, peers]);

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!String(title).trim()) {
      setError('Guruh nomini kiriting.');
      return;
    }
    if (selected.size === 0) {
      setError('Kamida bitta guruh admini tanlang.');
      return;
    }
    setSaving(true);
    try {
      const res = await request('/admin/staff-groups', {
        method: 'POST',
        body: JSON.stringify({
          title: String(title).trim(),
          target_role: targetRole,
          tasks_description: tasks,
          admin_user_ids: [...selected],
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Saqlanmadi.');
        return;
      }
      onClose();
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-staff-group-wizard">
      <header className="admin-staff-group-wizard__head">
        <button type="button" className="admin-staff-group-wizard__back" onClick={onClose} aria-label="Orqaga">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="admin-staff-group-wizard__title">Yangi guruh</h1>
      </header>

      <form className="admin-staff-group-wizard__form" onSubmit={submit}>
        {error ? <div className="admin-staff-group-wizard__err">{error}</div> : null}

        <label className="admin-staff-group-wizard__field">
          <span>Guruh nomi</span>
          <input
            className="admin-staff-group-wizard__input"
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder="Masalan: Sotuv bo‘limi chatlari"
            autoComplete="off"
            maxLength={200}
          />
        </label>

        <label className="admin-staff-group-wizard__field">
          <span>Qaysi rol uchun</span>
          <select
            className="admin-staff-group-wizard__select"
            value={targetRole}
            onChange={(ev) => setTargetRole(ev.target.value)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-staff-group-wizard__field">
          <span>Vazifalar va maqsadlar</span>
          <textarea
            className="admin-staff-group-wizard__textarea"
            value={tasks}
            onChange={(ev) => setTasks(ev.target.value)}
            placeholder="Guruh nima uchun, kimlar uchun, qanday jarayonlar..."
            rows={5}
          />
        </label>

        <div className="admin-staff-group-wizard__field">
          <span>Guruh adminlari (tanlangan rol bo‘yicha)</span>
          <p className="admin-staff-group-wizard__hint">
            Ro‘yxat tanlangan rol uchun: seller — seller akkauntlari, kuryer — kuryerlar, operator — operatorlar va hokazo.
            Kimlar admin bo‘lishi va qanday huquqlar berilishini superuser hal qiladi.
          </p>
          {loading ? (
            <p className="admin-staff-group-wizard__muted">Yuklanmoqda...</p>
          ) : peers.length === 0 ? (
            <p className="admin-staff-group-wizard__muted">Bu rol bo‘yicha foydalanuvchi topilmadi.</p>
          ) : (
            <ul className="admin-staff-group-wizard__checks">
              {peers.map((p) => (
                <li key={p.id}>
                  <label className="admin-staff-group-wizard__check">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span>
                      {String(p.full_name || p.displayName || p.login || `#${p.id}`).trim()}{' '}
                      <em className="admin-staff-group-wizard__rolehint">
                        {String(p.role_label || p.system_role || '').trim()}
                      </em>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-staff-group-wizard__actions">
          <button type="button" className="admin-staff-group-wizard__btn admin-staff-group-wizard__btn--ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button type="submit" className="admin-staff-group-wizard__btn admin-staff-group-wizard__btn--primary" disabled={saving}>
            {saving ? 'Saqlanmoqda...' : 'Guruhni yaratish'}
          </button>
        </div>
      </form>
    </div>
  );
}
