import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './StaffTopbarCenterId.css';

/** Joriy rol profili ID — backend `role_profile_id` (seller yoki staff_members) */
export function getStaffTopbarDisplayId(user) {
  if (!user) return null;
  const profileId = Number(user.role_profile_id);
  if (Number.isInteger(profileId) && profileId > 0) return profileId;

  if (String(user.role || '').toLowerCase() === 'seller') {
    const sid = Number(user.seller_id);
    if (Number.isInteger(sid) && sid > 0) return sid;
  }

  const staffId = Number(user.staff_member_id);
  if (Number.isInteger(staffId) && staffId > 0) return staffId;

  return null;
}

/** Ishchi panel topbar o‘rtasida rol profil ID (#) — oddiy mijozlarda ko‘rinmaydi */
export default function StaffTopbarCenterId({ className = '' }) {
  const { user } = useAuth();
  const id = getStaffTopbarDisplayId(user);
  if (id == null) return null;

  const kind = user?.role_profile_kind === 'seller' ? 'Seller' : 'Staff';

  return (
    <span
      className={`staff-topbar-center-id${className ? ` ${className}` : ''}`}
      aria-label={`${kind} ID ${id}`}
      title={`${kind} ID: ${id}`}
    >
      #{id}
    </span>
  );
}
