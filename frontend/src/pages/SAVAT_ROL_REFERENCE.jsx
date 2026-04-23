/**
 * SAVAT (o'chirilgan rollar) — AdminDashboard.jsx dan olingan reference.
 * Bu HTML emas, React (JSX). O'zingiz tugirlashingiz uchun barcha savat kodi shu yerda.
 * Asl kod: frontend/src/pages/AdminDashboard.jsx
 */

// ============ 1. STATE (AdminDashboard.jsx da useState lar) ============
// Quyidagilarni AdminDashboard da bor:
//   const [trashModalOpen, setTrashModalOpen] = useState(false);
//   const [restoreModalOpen, setRestoreModalOpen] = useState(false);
//   const [restoreRole, setRestoreRole] = useState(null);
//   const [restoreRoleId, setRestoreRoleId] = useState(null);
//   const [trashRoles, setTrashRoles] = useState([]);      // savatdagi rollar ro'yxati
//   const [workRoles, setWorkRoles] = useState([]);         // asosiy rollar
//   const [busyKey, setBusyKey] = useState('');
//   const [error, setError] = useState('');
//   const { request } = useAuth();  // API so'rovlari uchun

// restoreRoleForModal — savatdagi rolni id bo'yicha topish (modalda ko'rsatish uchun)
// const restoreRoleForModal = restoreRoleId != null ? trashRoles.find((r) => r.id === restoreRoleId) : null;

// ============ 2. YUKLASH (savat va ishchi rollar ro'yxati) ============
/*
const loadWorkRolesAndTrash = useCallback(async () => {
  try {
    const [rolesRes, trashRes] = await Promise.all([
      request('/admin/portal/work-roles'),
      request('/admin/portal/work-roles/trash'),
    ]);
    const rolesData = await ensureOk(rolesRes, 'Ishchi rollar yuklanmadi');
    const trashData = await ensureOk(trashRes, 'O\'chirilgan rollar yuklanmadi');
    setWorkRoles(rolesData?.roles || []);
    setTrashRoles(trashData?.roles || []);
  } catch (err) {
    setError(err.message || 'Rollar yangilanmadi');
  }
}, [request]);
*/

// ============ 3. HANDLERLAR ============

// Tiklash — bitta rolni savatdan asosiy ro'yxatga qaytarish
/*
const handleRestoreRole = async (e, explicitRoleId = null) => {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const rawId = explicitRoleId ?? restoreRoleId ?? restoreRole?.id;
  const roleId = rawId != null ? Number(rawId) : null;
  if (!roleId || !Number.isInteger(roleId) || roleId < 1) return;
  setBusyKey(`role-restore-${roleId}`);
  setError('');
  try {
    const res = await request(`/admin/portal/work-roles/${roleId}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await ensureOk(res, 'Rol tiklanmadi');
    await loadWorkRolesAndTrash();
    setRestoreModalOpen(false);
    setTrashModalOpen(false);
    setRestoreRole(null);
    setRestoreRoleId(null);
  } catch (err) {
    const msg = err?.message || 'Rol tiklanmadi';
    setError(msg);
    alert('Tiklash amalga oshmadi: ' + msg);
  } finally {
    setBusyKey('');
  }
};
*/

// O'chirish — bitta rolni savatdan butunlay o'chirish (qayta tiklash yo'q)
/*
const handlePermanentDeleteRole = async (role, e) => {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const roleId = role?.id != null ? Number(role.id) : null;
  if (!roleId || !Number.isInteger(roleId) || roleId < 1) return;
  if (!window.confirm(`"${role.role_name}" rolini savatdan butunlay o'chirasizmi? Qayta tiklash imkoni bo'lmaydi.`)) return;
  setBusyKey(`role-permanent-delete-${roleId}`);
  setError('');
  try {
    const res = await request(`/admin/portal/work-roles/${roleId}/permanent`, { method: 'DELETE' });
    await ensureOk(res, 'Rol o\'chirilmadi');
    await loadWorkRolesAndTrash();
  } catch (err) {
    const msg = err?.message || 'Rol o\'chirilmadi';
    setError(msg);
    alert('O\'chirish amalga oshmadi: ' + msg);
  } finally {
    setBusyKey('');
  }
};
*/

// Savatni to'zala — barcha o'chirilgan rollarni butunlay o'chirish
/*
const handleClearTrash = async () => {
  if (trashRoles.length === 0) return;
  if (!window.confirm(`Savatdagi barcha ${trashRoles.length} ta rolni butunlay o'chirasizmi? Qayta tiklash imkoni bo'lmaydi.`)) return;
  setBusyKey('role-clear-trash');
  setError('');
  try {
    const res = await request('/admin/portal/work-roles/trash', { method: 'DELETE' });
    await ensureOk(res, 'Savat tozalanmadi');
    await loadWorkRolesAndTrash();
    setTrashModalOpen(false);
  } catch (err) {
    const msg = err?.message || 'Savat tozalanmadi';
    setError(msg);
    alert('Savat tozalanmadi: ' + msg);
  } finally {
    setBusyKey('');
  }
};
*/

// ============ 4. ROLLAR SAHIFASIDAGI SAVAT TUGMASI (ochish) ============
// Bu tugma Rollar view ichida, "Yangi Rol Qo'shish" yonida:
/*
<button className="btn-neo" type="button" onClick={() => setTrashModalOpen(true)}>
  <i className="fas fa-trash-alt" /> Savat ({trashRoles.length})
</button>
*/

// ============ 5. SAVAT MODALI (JSX) ============
/*
{trashModalOpen && (
  <div className="modal-overlay-neo" onClick={() => setTrashModalOpen(false)}>
    <div className="modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header-neo">
        <h4><i className="fas fa-trash-alt" /> Savat — o'chirilgan rollar</h4>
        <div className="modal-header-actions">
          {trashRoles.length > 0 && (
            <button type="button" className="btn-neo btn-neo-danger" onClick={handleClearTrash} disabled={busyKey === 'role-clear-trash'}>
              <i className="fas fa-broom" /> Savatni tozala
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setTrashModalOpen(false)}><i className="fas fa-times" /></button>
        </div>
      </div>
      <div className="modal-body-neo">
        {(busyKey.startsWith('role-restore-') || busyKey.startsWith('role-permanent-delete-') || busyKey === 'role-clear-trash') && (
          <p className="savat-loading-hint" role="status">Ishlanmoqda...</p>
        )}
        <div className="roles-list">
          {trashRoles.length === 0 && !busyKey && <p className="muted">Savat bo'sh</p>}
          {trashRoles.map((row) => (
            <div key={row.id} className="role-card">
              <div className="role-card-head"><strong>{row.role_name} #{row.id}</strong><span>{row.login}</span></div>
              <div className="row-actions">
                <button type="button" className="btn-neo btn-neo-success" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRestoreRole(row); setRestoreRoleId(row.id); setRestoreModalOpen(true); }}>Tiklash</button>
                <button type="button" className="btn-neo btn-neo-danger" onClick={(e) => handlePermanentDeleteRole(row, e)} disabled={busyKey === `role-permanent-delete-${row.id}`}>O'chirish</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)}
*/

// ============ 6. TIKLASH TASDIQ MODALI (JSX) ============
/*
{restoreModalOpen && restoreRoleId != null && (
  <div className="modal-overlay-neo" onClick={() => { setRestoreModalOpen(false); setRestoreRoleId(null); setRestoreRole(null); }}>
    <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header-neo">
        <h4><i className="fas fa-undo-alt" /> Rolni tiklash</h4>
      </div>
      <div className="modal-body-neo text-center">
        <p><strong>{restoreRoleForModal ? restoreRoleForModal.role_name : 'Rol'}</strong> #{restoreRoleId} rolini tiklaysizmi?</p>
        <div className="row-actions">
          <button type="button" className="btn-neo btn-neo-success" onClick={(e) => handleRestoreRole(e, restoreRoleId)} disabled={!!busyKey && busyKey === `role-restore-${restoreRoleId}`}>Ha, tiklash</button>
          <button type="button" className="btn-neo" onClick={() => { setRestoreModalOpen(false); setRestoreRoleId(null); setRestoreRole(null); }}>Bekor qilish</button>
        </div>
      </div>
    </div>
  </div>
)}
*/

// ============ 7. BACKEND API (portal.js) ============
// GET  /api/admin/portal/work-roles        — ishdagi rollar (deleted_at IS NULL)
// GET  /api/admin/portal/work-roles/trash   — savat (deleted_at IS NOT NULL)
// POST /api/admin/portal/work-roles/:id/restore   — bitta rolni tiklash
// DELETE /api/admin/portal/work-roles/:id/permanent — bitta rolni butunlay o'chirish
// DELETE /api/admin/portal/work-roles/trash      — savatni to'zala (barchasini o'chirish)

export {};
