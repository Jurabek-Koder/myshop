import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const ROLE_OPTIONS = [
  { value: 'courier', label: 'Kuryer' },
  { value: 'seller', label: 'Seller' },
  { value: 'operator', label: 'Operator' },
  { value: 'target', label: 'Targetolog' },
  { value: 'picker', label: 'Picker' },
  { value: 'packer', label: 'Packer' },
  { value: 'expeditor', label: 'Ekspeditor' },
  { value: 'order_receiver', label: 'Qabul qiluvchi' },
  { value: 'warehouse_admin', label: 'Ombor admin' },
  { value: 'superuser', label: 'Superuser' },
];

/** Superuser: yangi maxsus guruh — nomi, bir yoki bir nechta rol, tavsif. */
export default function ChatGroupCreateModal({ onClose, onCreated }) {
  const { request } = useAuth();
  const [title, setTitle] = useState('');
  const [tasksDescription, setTasksDescription] = useState('');
  const [roles, setRoles] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleRole = (value) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Guruh nomini kiriting.');
      return;
    }
    if (roles.size === 0) {
      setError('Kamida bitta rol tanlang.');
      return;
    }
    setSaving(true);
    try {
      const res = await request('/chat-groups', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          roles: [...roles],
          tasks_description: tasksDescription,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Yaratilmadi.');
        return;
      }
      onCreated?.(d.group);
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="chat-groups-modal-backdrop" onClick={onClose} aria-hidden />
      <div className="chat-groups-modal" role="dialog" aria-modal="true" aria-label="Yangi guruh">
        <header className="chat-groups-modal-head">
          <h2 className="chat-groups-modal-title">Yangi guruh</h2>
          <button type="button" className="chat-groups-modal-close" onClick={onClose} aria-label="Yopish">
            ×
          </button>
        </header>
        <form className="chat-groups-form" onSubmit={submit}>
          {error ? <p className="chat-groups-error">{error}</p> : null}
          <label className="chat-groups-field">
            <span>Guruh nomi</span>
            <input
              className="chat-groups-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masalan: Sotuv bo‘limi"
              maxLength={200}
            />
          </label>
          <div className="chat-groups-field">
            <span>Qaysi rollar avtomatik a’zo bo‘lsin</span>
            <ul className="chat-groups-role-checks">
              {ROLE_OPTIONS.map((o) => (
                <li key={o.value}>
                  <label className="chat-groups-role-check">
                    <input type="checkbox" checked={roles.has(o.value)} onChange={() => toggleRole(o.value)} />
                    <span>{o.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <label className="chat-groups-field">
            <span>Vazifalar va maqsad (ixtiyoriy)</span>
            <textarea
              className="chat-groups-textarea"
              value={tasksDescription}
              onChange={(e) => setTasksDescription(e.target.value)}
              rows={4}
              placeholder="Guruh nima uchun, qanday jarayonlar uchun..."
            />
          </label>
          <div className="chat-groups-modal-footer">
            <button type="button" className="chat-groups-btn" onClick={onClose}>
              Bekor qilish
            </button>
            <button type="submit" className="chat-groups-btn chat-groups-btn--primary" disabled={saving}>
              {saving ? 'Yaratilmoqda...' : 'Guruhni yaratish'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
