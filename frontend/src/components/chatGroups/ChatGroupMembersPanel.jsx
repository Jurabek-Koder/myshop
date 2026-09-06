import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'Barcha rollar' },
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

/**
 * Guruh a'zolarini boshqarish: ro'yxat, admin/a'zo qilish, chiqarish, yangi taklif qilish.
 * Avtomatik (rol orqali) qo'shilgan a'zolarni chiqarib bo'lmaydi — bu tugma o'chirilgan holda
 * ko'rsatiladi va sabab tushuntiriladi.
 */
export default function ChatGroupMembersPanel({ group, onClose }) {
  const { request } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUserId, setBusyUserId] = useState(0);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [inviting, setInviting] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request(`/chat-groups/${group.id}/members`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Yuklanmadi.');
        return;
      }
      setMembers(Array.isArray(d.members) ? d.members : []);
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setLoading(false);
    }
  }, [request, group.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const q = roleFilter ? `?role=${encodeURIComponent(roleFilter)}` : '';
      const res = await request(`/chat-groups/${group.id}/candidates${q}`);
      const d = await res.json().catch(() => ({}));
      setCandidates(res.ok && Array.isArray(d.candidates) ? d.candidates : []);
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, [request, group.id, roleFilter]);

  useEffect(() => {
    if (inviteOpen) loadCandidates();
  }, [inviteOpen, loadCandidates]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitInvite = async () => {
    if (selectedIds.size === 0) return;
    setInviting(true);
    setError('');
    try {
      const res = await request(`/chat-groups/${group.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: [...selectedIds] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Qo‘shilmadi.');
        return;
      }
      setMembers(Array.isArray(d.members) ? d.members : []);
      setSelectedIds(new Set());
      setInviteOpen(false);
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setInviting(false);
    }
  };

  const promoteOrDemote = async (userId, nextRole) => {
    setBusyUserId(userId);
    setError('');
    try {
      const res = await request(`/chat-groups/${group.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ member_role: nextRole }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'O‘zgartirilmadi.');
        return;
      }
      setMembers(Array.isArray(d.members) ? d.members : []);
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setBusyUserId(0);
    }
  };

  const removeMember = async (userId) => {
    setBusyUserId(userId);
    setError('');
    try {
      const res = await request(`/chat-groups/${group.id}/members/${userId}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Chiqarilmadi.');
        return;
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setBusyUserId(0);
    }
  };

  const candidateRows = useMemo(() => candidates, [candidates]);

  return (
    <>
      <div className="chat-groups-modal-backdrop" onClick={onClose} aria-hidden />
      <div className="chat-groups-modal" role="dialog" aria-modal="true" aria-label="Guruh a'zolari">
        <header className="chat-groups-modal-head">
          <h2 className="chat-groups-modal-title">{group.title} — a’zolar</h2>
          <button type="button" className="chat-groups-modal-close" onClick={onClose} aria-label="Yopish">
            ×
          </button>
        </header>

        {error ? <p className="chat-groups-error">{error}</p> : null}

        {!inviteOpen ? (
          <>
            <div className="chat-groups-modal-actions">
              <button type="button" className="chat-groups-btn chat-groups-btn--primary" onClick={() => setInviteOpen(true)}>
                + Xodim taklif qilish
              </button>
            </div>
            {loading ? (
              <p className="chat-groups-hint">Yuklanmoqda...</p>
            ) : members.length === 0 ? (
              <p className="chat-groups-hint">A’zolar yo‘q.</p>
            ) : (
              <ul className="chat-groups-member-list">
                {members.map((m) => (
                  <li key={m.user_id} className="chat-groups-member-row">
                    <div className="chat-groups-member-info">
                      <span className="chat-groups-member-name">{m.full_name || m.login}</span>
                      <span className="chat-groups-member-sub">
                        {m.role_label}
                        {m.source === 'auto' ? ' · avtomatik' : ' · taklif qilingan'}
                        {m.member_role === 'admin' ? ' · admin' : ''}
                      </span>
                    </div>
                    <div className="chat-groups-member-actions">
                      {m.member_role === 'admin' ? (
                        <button
                          type="button"
                          className="chat-groups-chip-btn"
                          disabled={busyUserId === m.user_id}
                          onClick={() => promoteOrDemote(m.user_id, 'member')}
                        >
                          Admindan olish
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="chat-groups-chip-btn"
                          disabled={busyUserId === m.user_id}
                          onClick={() => promoteOrDemote(m.user_id, 'admin')}
                        >
                          Admin qilish
                        </button>
                      )}
                      <button
                        type="button"
                        className="chat-groups-chip-btn chat-groups-chip-btn--danger"
                        disabled={busyUserId === m.user_id || m.source === 'auto'}
                        title={m.source === 'auto' ? 'Avtomatik a’zoni chiqarib bo‘lmaydi — rolini o‘zgartiring.' : undefined}
                        onClick={() => removeMember(m.user_id)}
                      >
                        Chiqarish
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="chat-groups-modal-actions chat-groups-modal-actions--invite">
              <select
                className="chat-groups-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                {ROLE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" className="chat-groups-btn" onClick={() => setInviteOpen(false)}>
                Bekor
              </button>
            </div>
            {candidatesLoading ? (
              <p className="chat-groups-hint">Yuklanmoqda...</p>
            ) : candidateRows.length === 0 ? (
              <p className="chat-groups-hint">Taklif qilinadigan xodim topilmadi.</p>
            ) : (
              <ul className="chat-groups-member-list">
                {candidateRows.map((c) => (
                  <li key={c.id} className="chat-groups-member-row">
                    <label className="chat-groups-member-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelected(c.id)}
                      />
                      <span className="chat-groups-member-info">
                        <span className="chat-groups-member-name">{c.full_name || c.login}</span>
                        <span className="chat-groups-member-sub">{c.role_label}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="chat-groups-modal-footer">
              <button
                type="button"
                className="chat-groups-btn chat-groups-btn--primary"
                disabled={selectedIds.size === 0 || inviting}
                onClick={submitInvite}
              >
                {inviting ? 'Qo‘shilmoqda...' : `Qo‘shish (${selectedIds.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
