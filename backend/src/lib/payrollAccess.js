import { db } from '../db/database.js';

export function normalizeRoleKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function isAccountingUser(user) {
  return String(user?.role || '').toLowerCase() === 'accounting';
}

export function isSuperuserUser(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'superuser' || Number(user?.role_id) === 1;
}

/** Buxgalter oyligi — superuser belgilay olmaydi */
export const PAYROLL_SELF_MANAGED_ROLE = 'accounting';

export function assertPayrollWriteAccess(user) {
  if (!isAccountingUser(user)) {
    const err = new Error('PAYROLL_WRITE_FORBIDDEN');
    err.code = 'PAYROLL_WRITE_FORBIDDEN';
    throw err;
  }
}

export function resolveUserSystemRoleKey(userId) {
  if (!userId) return null;
  const row = db
    .prepare(
      `SELECT COALESCE(r.name, u.role) AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    )
    .get(Number(userId));
  return row ? normalizeRoleKey(row.role_name) : null;
}

export function assertCanEditPayrollRoleDefault(user, roleKey) {
  assertPayrollWriteAccess(user);
  if (isSuperuserUser(user)) {
    const err = new Error('PAYROLL_WRITE_FORBIDDEN');
    err.code = 'PAYROLL_WRITE_FORBIDDEN';
    throw err;
  }
  if (normalizeRoleKey(roleKey) === PAYROLL_SELF_MANAGED_ROLE && !isAccountingUser(user)) {
    const err = new Error('ACCOUNTING_SALARY_PROTECTED');
    err.code = 'ACCOUNTING_SALARY_PROTECTED';
    throw err;
  }
}

export function assertCanEditPayrollEmployee(user, { user_id: userId, work_role_id: workRoleId } = {}) {
  assertPayrollWriteAccess(user);
  if (isSuperuserUser(user)) {
    const err = new Error('PAYROLL_WRITE_FORBIDDEN');
    err.code = 'PAYROLL_WRITE_FORBIDDEN';
    throw err;
  }
  const uid = userId != null ? Number(userId) : null;
  if (uid) {
    const roleKey = resolveUserSystemRoleKey(uid);
    if (roleKey === PAYROLL_SELF_MANAGED_ROLE && !isAccountingUser(user)) {
      const err = new Error('ACCOUNTING_SALARY_PROTECTED');
      err.code = 'ACCOUNTING_SALARY_PROTECTED';
      throw err;
    }
  }
  if (workRoleId) {
    const wr = db
      .prepare(`SELECT role_name FROM work_roles WHERE id = ? AND deleted_at IS NULL`)
      .get(Number(workRoleId));
    const wrKey = normalizeRoleKey(wr?.role_name);
    if (wrKey === 'buxgalter' || wrKey === 'accounting') {
      /* sklad ish roli «Buxgalter» — superuser taqiqlangan, buxgalter belgilaydi */
      if (isSuperuserUser(user)) {
        const err = new Error('PAYROLL_WRITE_FORBIDDEN');
        err.code = 'PAYROLL_WRITE_FORBIDDEN';
        throw err;
      }
    }
  }
}

export function payrollAccessErrorResponse(res, e) {
  if (e?.code === 'PAYROLL_WRITE_FORBIDDEN' || e?.message === 'PAYROLL_WRITE_FORBIDDEN') {
    return res.status(403).json({ error: 'Ish haqini faqat buxgalter belgilaydi. Superuser faqat kuzatadi.' });
  }
  if (e?.code === 'ACCOUNTING_SALARY_PROTECTED' || e?.message === 'ACCOUNTING_SALARY_PROTECTED') {
    return res.status(403).json({ error: 'Buxgalter oyligini superuser belgilay olmaydi.' });
  }
  return null;
}
