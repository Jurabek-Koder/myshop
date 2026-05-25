import { db } from '../db/database.js';
import { insertFinanceLog } from './financeLogService.js';

const PAYMENT_TYPES = ['advance', 'monthly_balance'];
const STATUSES = ['pending', 'paid', 'overdue'];

/** Foydalanuvchi roli — ish haqi ro‘yxatiga kirmaydi */
const EXCLUDED_SYSTEM_ROLE_KEYS = new Set(['customer']);

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDate(year, month, day) {
  const dim = daysInMonth(year, month);
  const d = Math.min(Math.max(1, day), dim);
  return `${year}-${pad2(month)}-${pad2(d)}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function normalizeRoleKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normField(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

/** Rol + ism + login + email + telefon — kind siz (user/work_role bir shaxs = bitta yozuv) */
export function buildPayrollIdentityHash(parts) {
  return [
    normalizeRoleKey(parts.role_key),
    normField(parts.full_name),
    normField(parts.login),
    normField(parts.email),
    normField(parts.phone),
  ].join('|');
}

function identityFromUserRow(row) {
  return buildPayrollIdentityHash({
    kind: 'user',
    role_key: row.role_name,
    full_name: row.full_name,
    login: row.login,
    email: row.email,
    phone: row.phone,
  });
}

function identityFromWorkRoleRow(row) {
  const displayName = row.user_full_name || row.role_name;
  return buildPayrollIdentityHash({
    kind: 'work_role',
    role_key: row.role_name,
    full_name: displayName,
    login: row.login,
    email: row.email,
    phone: row.phone,
  });
}

function getRoleDefault(roleSource, roleKey) {
  return db
    .prepare(
      `SELECT * FROM payroll_role_defaults WHERE role_source = ? AND role_key = ?`,
    )
    .get(roleSource, normalizeRoleKey(roleKey));
}

/** Sklad `work_roles.total_amount` yoki shu login bilan bog‘langan hisob */
export function getEmployeeAccountBalance(emp) {
  if (!emp) return 0;
  if (emp.employee_type === 'work_role' && emp.work_role_id) {
    const wr = db.prepare(`SELECT total_amount FROM work_roles WHERE id = ?`).get(emp.work_role_id);
    return Number(wr?.total_amount) || 0;
  }
  if (emp.user_id) {
    const u = db.prepare(`SELECT login FROM users WHERE id = ?`).get(emp.user_id);
    const login = normField(u?.login);
    if (login) {
      const wr = db
        .prepare(
          `SELECT total_amount FROM work_roles
           WHERE deleted_at IS NULL AND lower(trim(login)) = ?`,
        )
        .get(login);
      if (wr) return Number(wr.total_amount) || 0;
    }
  }
  return 0;
}

function hasPaidCycleType(employeeId, year, month, paymentType) {
  const row = db
    .prepare(
      `SELECT id FROM payroll_payment_cycles
       WHERE employee_id = ? AND cycle_year = ? AND cycle_month = ? AND payment_type = ? AND status = 'paid'`,
    )
    .get(employeeId, year, month, paymentType);
  return !!row;
}

function getLastPaidMonthlyBalance(employeeId) {
  return db
    .prepare(
      `SELECT cycle_year, cycle_month, paid_at FROM payroll_payment_cycles
       WHERE employee_id = ? AND payment_type = 'monthly_balance' AND status = 'paid'
       ORDER BY cycle_year DESC, cycle_month DESC, id DESC LIMIT 1`,
    )
    .get(employeeId);
}

/** Oylik yozish/to‘lash: hisob balansi 0 va shu oy oyligi hali to‘lanmagan */
export function canAssignMonthlyPayroll(emp, year, month) {
  const balance = getEmployeeAccountBalance(emp);
  if (Math.abs(balance) > 0.01) {
    return { ok: false, reason: 'balance_not_zero', balance };
  }
  if (hasPaidCycleType(emp.id, year, month, 'monthly_balance')) {
    return { ok: false, reason: 'monthly_already_paid', balance };
  }
  return { ok: true, balance: 0 };
}

function enrichEmployeePayrollFlags(row) {
  const balance = getEmployeeAccountBalance(row);
  const lastPaid = getLastPaidMonthlyBalance(row.id);
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const monthlyPaidThisMonth = hasPaidCycleType(row.id, y, m, 'monthly_balance');
  const canMonthly = canAssignMonthlyPayroll(row, y, m);
  return {
    ...row,
    account_balance_uzs: balance,
    last_monthly_paid_year: lastPaid?.cycle_year ?? null,
    last_monthly_paid_month: lastPaid?.cycle_month ?? null,
    last_monthly_paid_at: lastPaid?.paid_at ?? null,
    monthly_paid_this_month: monthlyPaidThisMonth,
    can_assign_monthly: canMonthly.ok,
    payroll_block_reason: canMonthly.ok ? null : canMonthly.reason,
    salary_locked: monthlyPaidThisMonth || Math.abs(balance) > 0.01,
  };
}

function backfillEmployeeIdentity(employeeId) {
  const pe = db.prepare(`SELECT * FROM payroll_employees WHERE id = ?`).get(employeeId);
  if (!pe) return;
  let hash = pe.identity_hash;
  let displayName = pe.display_name;
  if (pe.employee_type === 'user' && pe.user_id) {
    const u = db
      .prepare(
        `SELECT u.full_name, u.login, u.email, u.phone, COALESCE(r.name, u.role) AS role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      )
      .get(pe.user_id);
    if (u) {
      hash = identityFromUserRow(u);
      displayName = u.full_name;
    }
  } else if (pe.work_role_id) {
    const wr = db
      .prepare(
        `SELECT wr.*, u.full_name AS user_full_name
         FROM work_roles wr
         LEFT JOIN users u ON lower(trim(COALESCE(u.login,''))) = lower(trim(wr.login))
         WHERE wr.id = ?`,
      )
      .get(pe.work_role_id);
    if (wr) {
      hash = identityFromWorkRoleRow(wr);
      displayName = wr.user_full_name || wr.login || wr.role_name;
    }
  }
  if (hash) {
    const conflict = db
      .prepare(`SELECT id FROM payroll_employees WHERE identity_hash = ? AND id != ?`)
      .get(hash, employeeId);
    if (conflict) return;
    db.prepare(
      `UPDATE payroll_employees SET identity_hash = ?, display_name = COALESCE(?, display_name) WHERE id = ?`,
    ).run(hash, displayName, employeeId);
  }
}

export function syncPayrollRoleDefaults() {
  const systemRoles = db
    .prepare(`SELECT name FROM roles WHERE lower(trim(name)) NOT IN ('customer') ORDER BY name COLLATE NOCASE`)
    .all();
  const workNames = db
    .prepare(
      `SELECT DISTINCT role_name FROM work_roles WHERE deleted_at IS NULL ORDER BY role_name COLLATE NOCASE`,
    )
    .all();

  const ins = db.prepare(
    `INSERT OR IGNORE INTO payroll_role_defaults (role_source, role_key, role_label) VALUES (?,?,?)`,
  );
  let added = 0;
  for (const r of systemRoles) {
    const key = normalizeRoleKey(r.name);
    const ch = ins.run('system', key, String(r.name).trim()).changes;
    if (ch) added += 1;
  }
  for (const r of workNames) {
    const key = normalizeRoleKey(r.role_name);
    const ch = ins.run('work', key, String(r.role_name).trim()).changes;
    if (ch) added += 1;
  }
  return { system_roles: systemRoles.length, work_role_types: workNames.length, added };
}

export function listPayrollRoleDefaults() {
  return db
    .prepare(
      `SELECT * FROM payroll_role_defaults ORDER BY role_source ASC, role_label COLLATE NOCASE ASC`,
    )
    .all();
}

export function upsertPayrollRoleDefault(payload, actorUserId) {
  const roleSource = String(payload.role_source || '').toLowerCase();
  if (roleSource !== 'system' && roleSource !== 'work') throw new Error('INVALID_ROLE_SOURCE');
  const roleKey = normalizeRoleKey(payload.role_key || payload.role_label);
  if (!roleKey) throw new Error('INVALID_ROLE_KEY');

  const monthly = Math.max(0, Math.round(Number(payload.monthly_salary_uzs) || 0));
  const advancePercent = Math.min(0.9, Math.max(0.05, Number(payload.advance_percent) || 0.1));
  const advanceDay = Math.min(28, Math.max(1, Math.round(Number(payload.advance_due_day) || 15)));
  const balanceDay = Math.min(28, Math.max(0, Math.round(Number(payload.balance_due_day) || 0)));
  const roleLabel = String(payload.role_label || payload.role_key || roleKey).trim();

  const existing = db
    .prepare(`SELECT id FROM payroll_role_defaults WHERE role_source = ? AND role_key = ?`)
    .get(roleSource, roleKey);

  if (existing) {
    db.prepare(
      `UPDATE payroll_role_defaults SET role_label = ?, monthly_salary_uzs = ?, advance_percent = ?,
        advance_due_day = ?, balance_due_day = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(roleLabel, monthly, advancePercent, advanceDay, balanceDay, existing.id);
    const row = db.prepare(`SELECT * FROM payroll_role_defaults WHERE id = ?`).get(existing.id);
    if (actorUserId) {
      insertFinanceLog(db, {
        actorUserId,
        action: 'update',
        entityType: 'payroll_role_default',
        entityId: existing.id,
        payload: { role_source: roleSource, role_key: roleKey, monthly_salary_uzs: monthly, advance_percent: advancePercent },
      });
    }
    return row;
  }

  const r = db
    .prepare(
      `INSERT INTO payroll_role_defaults (role_source, role_key, role_label, monthly_salary_uzs, advance_percent, advance_due_day, balance_due_day)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(roleSource, roleKey, roleLabel, monthly, advancePercent, advanceDay, balanceDay);
  const row = db.prepare(`SELECT * FROM payroll_role_defaults WHERE id = ?`).get(r.lastInsertRowid);
  if (actorUserId) {
    insertFinanceLog(db, {
      actorUserId,
      action: 'create',
      entityType: 'payroll_role_default',
      entityId: row.id,
      payload: { role_source: roleSource, role_key: roleKey, monthly_salary_uzs: monthly, advance_percent: advancePercent },
    });
  }
  return row;
}

function isUserPayrollEligible(userRow) {
  const roleKey = normalizeRoleKey(userRow.role_name);
  return roleKey && !EXCLUDED_SYSTEM_ROLE_KEYS.has(roleKey);
}

export function resolveCycleStatus(row) {
  if (String(row.status) === 'paid') return 'paid';
  const due = String(row.due_date || '').slice(0, 10);
  if (due && due < todayIso()) return 'overdue';
  return 'pending';
}

function enrichCycle(row) {
  const status = resolveCycleStatus(row);
  if (status === 'overdue' && row.status === 'pending') {
    db.prepare(`UPDATE payroll_payment_cycles SET status = 'overdue' WHERE id = ? AND status = 'pending'`).run(row.id);
  }
  return { ...row, status };
}

const EMPLOYEE_LIST_SQL = `
  SELECT pe.*,
    COALESCE(pe.display_name, u.full_name, wr.role_name) AS full_name,
    COALESCE(u.login, wr.login) AS login,
    COALESCE(u.email, wr.email) AS email,
    COALESCE(u.phone, wr.phone) AS phone,
    COALESCE(r.name, u.role, wr.role_name) AS role_label,
    COALESCE(r.name, u.role) AS system_role,
    wr.role_name AS work_role_name,
    COALESCE(wr.total_amount, 0) AS work_role_balance
  FROM payroll_employees pe
  LEFT JOIN users u ON u.id = pe.user_id AND pe.employee_type = 'user'
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN work_roles wr ON wr.id = pe.work_role_id AND pe.employee_type = 'work_role'
`;

export function listPayrollEmployees() {
  const rows = db.prepare(`${EMPLOYEE_LIST_SQL} ORDER BY full_name COLLATE NOCASE ASC`).all();
  return rows.map(enrichEmployeePayrollFlags);
}

export function syncAllPayrollEmployees(actorUserId) {
  const roleSync = syncPayrollRoleDefaults();

  const removedByLogin = dedupePayrollEmployeesByLogin();
  const dedupeBefore = dedupePayrollEmployeesByIdentity();

  for (const pe of db.prepare(`SELECT id FROM payroll_employees`).all()) {
    backfillEmployeeIdentity(pe.id);
  }

  const identitySeen = new Set(
    db
      .prepare(`SELECT identity_hash FROM payroll_employees WHERE identity_hash IS NOT NULL`)
      .all()
      .map((r) => r.identity_hash),
  );

  const eligibleUsers = db
    .prepare(
      `SELECT u.id, u.full_name, u.login, u.email, u.phone, COALESCE(r.name, u.role) AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE lower(trim(COALESCE(u.status,''))) = 'active'`,
    )
    .all()
    .filter(isUserPayrollEligible);

  const insUser = db.prepare(
    `INSERT OR IGNORE INTO payroll_employees (
       employee_type, user_id, identity_hash, display_name,
       monthly_salary_uzs, advance_percent, advance_due_day, balance_due_day, active, updated_by
     ) VALUES ('user', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );

  let usersAdded = 0;
  let usersSkippedIdentity = 0;
  for (const u of eligibleUsers) {
    const hash = identityFromUserRow(u);
    if (identitySeen.has(hash)) {
      usersSkippedIdentity += 1;
      continue;
    }
    const def = getRoleDefault('system', u.role_name);
    const r = insUser.run(
      u.id,
      hash,
      u.full_name,
      def?.monthly_salary_uzs ?? 0,
      def?.advance_percent ?? 0.1,
      def?.advance_due_day ?? 15,
      def?.balance_due_day ?? 0,
      actorUserId ?? null,
    );
    if (r.changes) {
      usersAdded += 1;
      identitySeen.add(hash);
    }
  }

  const workRoles = db
    .prepare(
      `SELECT wr.id, wr.role_name, wr.login, wr.email, wr.phone, u.full_name AS user_full_name
       FROM work_roles wr
       LEFT JOIN users u ON lower(trim(COALESCE(u.login,''))) = lower(trim(wr.login))
       WHERE wr.deleted_at IS NULL AND lower(trim(COALESCE(wr.status,''))) = 'active'`,
    )
    .all();

  const insWr = db.prepare(
    `INSERT OR IGNORE INTO payroll_employees (
       employee_type, work_role_id, identity_hash, display_name,
       monthly_salary_uzs, advance_percent, advance_due_day, balance_due_day, active, updated_by
     ) VALUES ('work_role', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );

  let workAdded = 0;
  let workSkippedIdentity = 0;
  let workSkippedLogin = 0;
  for (const wr of workRoles) {
    const loginKey = normField(wr.login);
    if (loginKey) {
      const userWithLogin = db
        .prepare(
          `SELECT pe.id FROM payroll_employees pe
           JOIN users u ON u.id = pe.user_id AND pe.employee_type = 'user'
           WHERE lower(trim(COALESCE(u.login,''))) = ?`,
        )
        .get(loginKey);
      if (userWithLogin) {
        workSkippedLogin += 1;
        continue;
      }
    }

    const hash = identityFromWorkRoleRow(wr);
    if (identitySeen.has(hash)) {
      workSkippedIdentity += 1;
      continue;
    }
    const def = getRoleDefault('work', wr.role_name);
    const displayName = wr.user_full_name || wr.login || wr.role_name;
    const r = insWr.run(
      wr.id,
      hash,
      displayName,
      def?.monthly_salary_uzs ?? 0,
      def?.advance_percent ?? 0.1,
      def?.advance_due_day ?? 15,
      def?.balance_due_day ?? 0,
      actorUserId ?? null,
    );
    if (r.changes) {
      workAdded += 1;
      identitySeen.add(hash);
    }
  }

  const deduped = dedupePayrollEmployeesByIdentity();

  return {
    role_defaults: roleSync,
    users: { eligible: eligibleUsers.length, added: usersAdded, skipped_same_identity: usersSkippedIdentity },
    work_roles: {
      eligible: workRoles.length,
      added: workAdded,
      skipped_same_identity: workSkippedIdentity,
      skipped_same_login_as_user: workSkippedLogin,
    },
    deduped: { before: dedupeBefore, after: deduped, removed_by_login: removedByLogin },
    added: usersAdded + workAdded,
  };
}

/** Bir xil login — user yozuvi ustun, work_role dublikati o‘chiriladi */
function dedupePayrollEmployeesByLogin() {
  const rows = db
    .prepare(
      `SELECT pe_wr.id AS drop_id
       FROM payroll_employees pe_wr
       JOIN work_roles wr ON wr.id = pe_wr.work_role_id AND pe_wr.employee_type = 'work_role'
       JOIN users u ON lower(trim(COALESCE(u.login,''))) = lower(trim(wr.login)) AND trim(COALESCE(u.login,'')) != ''
       JOIN payroll_employees pe_u ON pe_u.user_id = u.id AND pe_u.employee_type = 'user'`,
    )
    .all();

  let removed = 0;
  for (const r of rows) {
    const hasPaid = db
      .prepare(
        `SELECT id FROM payroll_payment_cycles WHERE employee_id = ? AND status = 'paid' LIMIT 1`,
      )
      .get(r.drop_id);
    if (hasPaid) continue;
    db.prepare(`DELETE FROM payroll_employees WHERE id = ?`).run(r.drop_id);
    removed += 1;
  }
  return removed;
}

/** Bir xil identity_hash — user yozuvi qoladi, dublikat (odatda work_role) o‘chiriladi */
function dedupePayrollEmployeesByIdentity() {
  const groups = db
    .prepare(
      `SELECT identity_hash, COUNT(*) AS c FROM payroll_employees
       WHERE identity_hash IS NOT NULL GROUP BY identity_hash HAVING c > 1`,
    )
    .all();

  let removed = 0;
  for (const g of groups) {
    const rows = db
      .prepare(
        `SELECT * FROM payroll_employees WHERE identity_hash = ? ORDER BY
         CASE employee_type WHEN 'user' THEN 0 ELSE 1 END, id ASC`,
      )
      .all(g.identity_hash);

    for (let i = 1; i < rows.length; i += 1) {
      const drop = rows[i];
      const hasPaid = db
        .prepare(
          `SELECT id FROM payroll_payment_cycles WHERE employee_id = ? AND status = 'paid' LIMIT 1`,
        )
        .get(drop.id);
      if (hasPaid) continue;
      db.prepare(`DELETE FROM payroll_employees WHERE id = ?`).run(drop.id);
      removed += 1;
    }
  }
  return { duplicate_groups: groups.length, removed };
}

export function syncSuperuserEmployees(actorUserId) {
  return syncAllPayrollEmployees(actorUserId);
}

export function upsertPayrollEmployee(payload, actorUserId) {
  const userId = payload.user_id != null ? Number(payload.user_id) : null;
  const workRoleId = payload.work_role_id != null ? Number(payload.work_role_id) : null;

  if ((userId && workRoleId) || (!userId && !workRoleId)) throw new Error('INVALID_EMPLOYEE_REF');

  const monthly = Math.max(0, Math.round(Number(payload.monthly_salary_uzs) || 0));
  const advancePercent = Math.min(0.9, Math.max(0.05, Number(payload.advance_percent) || 0.1));
  const advanceDay = Math.min(28, Math.max(1, Math.round(Number(payload.advance_due_day) || 15)));
  const balanceDay = Math.min(28, Math.max(0, Math.round(Number(payload.balance_due_day) || 0)));
  const active = payload.active != null ? (payload.active ? 1 : 0) : 1;
  const notes = payload.notes != null ? String(payload.notes).trim() || null : null;

  if (userId) {
    const user = db
      .prepare(
        `SELECT u.id, u.full_name, u.login, u.email, u.phone, COALESCE(r.name, u.role) AS role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      )
      .get(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!isUserPayrollEligible(user)) throw new Error('NOT_PAYROLL_ELIGIBLE');

    const hash = identityFromUserRow(user);
    const dup = db
      .prepare(`SELECT id FROM payroll_employees WHERE identity_hash = ? AND user_id IS NOT ?`)
      .get(hash, userId);
    if (dup) throw new Error('DUPLICATE_IDENTITY');

    const existing = db.prepare(`SELECT * FROM payroll_employees WHERE user_id = ?`).get(userId);
    if (existing) {
      db.prepare(
        `UPDATE payroll_employees SET monthly_salary_uzs = ?, advance_percent = ?, advance_due_day = ?,
          balance_due_day = ?, active = ?, notes = ?, identity_hash = ?, display_name = ?,
          updated_at = datetime('now'), updated_by = ?
         WHERE user_id = ?`,
      ).run(
        monthly,
        advancePercent,
        advanceDay,
        balanceDay,
        active,
        notes,
        hash,
        user.full_name,
        actorUserId ?? null,
        userId,
      );
      const row = db.prepare(`SELECT * FROM payroll_employees WHERE user_id = ?`).get(userId);
      if (actorUserId) {
        insertFinanceLog(db, {
          actorUserId,
          action: 'update',
          entityType: 'payroll_employee',
          entityId: row.id,
          payload: { user_id: userId, monthly_salary_uzs: monthly, advance_percent: advancePercent, role: user.role_name },
        });
      }
      return row;
    }

    const r = db
      .prepare(
        `INSERT INTO payroll_employees (
          employee_type, user_id, identity_hash, display_name,
          monthly_salary_uzs, advance_percent, advance_due_day, balance_due_day, active, notes, updated_by
        ) VALUES ('user',?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        userId,
        hash,
        user.full_name,
        monthly,
        advancePercent,
        advanceDay,
        balanceDay,
        active,
        notes,
        actorUserId ?? null,
      );
    const row = db.prepare(`SELECT * FROM payroll_employees WHERE id = ?`).get(r.lastInsertRowid);
    if (actorUserId) {
      insertFinanceLog(db, {
        actorUserId,
        action: 'create',
        entityType: 'payroll_employee',
        entityId: row.id,
        payload: { user_id: userId, monthly_salary_uzs: monthly, advance_percent: advancePercent, role: user.role_name },
      });
    }
    return row;
  }

  const wr = db
    .prepare(
      `SELECT wr.*, u.full_name AS user_full_name
       FROM work_roles wr
       LEFT JOIN users u ON lower(trim(COALESCE(u.login,''))) = lower(trim(wr.login))
       WHERE wr.id = ? AND wr.deleted_at IS NULL`,
    )
    .get(workRoleId);
  if (!wr) throw new Error('WORK_ROLE_NOT_FOUND');

  const hash = identityFromWorkRoleRow(wr);
  const dup = db
    .prepare(`SELECT id FROM payroll_employees WHERE identity_hash = ? AND work_role_id IS NOT ?`)
    .get(hash, workRoleId);
  if (dup) throw new Error('DUPLICATE_IDENTITY');

  const displayName = wr.user_full_name || wr.login || wr.role_name;
  const existing = db.prepare(`SELECT * FROM payroll_employees WHERE work_role_id = ?`).get(workRoleId);
  if (existing) {
    db.prepare(
      `UPDATE payroll_employees SET monthly_salary_uzs = ?, advance_percent = ?, advance_due_day = ?,
        balance_due_day = ?, active = ?, notes = ?, identity_hash = ?, display_name = ?,
        updated_at = datetime('now'), updated_by = ?
       WHERE work_role_id = ?`,
    ).run(
      monthly,
      advancePercent,
      advanceDay,
      balanceDay,
      active,
      notes,
      hash,
      displayName,
      actorUserId ?? null,
      workRoleId,
    );
    const row = db.prepare(`SELECT * FROM payroll_employees WHERE work_role_id = ?`).get(workRoleId);
    if (actorUserId) {
      insertFinanceLog(db, {
        actorUserId,
        action: 'update',
        entityType: 'payroll_employee',
        entityId: row.id,
        payload: { work_role_id: workRoleId, monthly_salary_uzs: monthly, advance_percent: advancePercent, role: wr.role_name },
      });
    }
    return row;
  }

  const r = db
    .prepare(
      `INSERT INTO payroll_employees (
        employee_type, work_role_id, identity_hash, display_name,
        monthly_salary_uzs, advance_percent, advance_due_day, balance_due_day, active, notes, updated_by
      ) VALUES ('work_role',?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      workRoleId,
      hash,
      displayName,
      monthly,
      advancePercent,
      advanceDay,
      balanceDay,
      active,
      notes,
      actorUserId ?? null,
    );
  const row = db.prepare(`SELECT * FROM payroll_employees WHERE id = ?`).get(r.lastInsertRowid);
  if (actorUserId) {
    insertFinanceLog(db, {
      actorUserId,
      action: 'create',
      entityType: 'payroll_employee',
      entityId: row.id,
      payload: { work_role_id: workRoleId, monthly_salary_uzs: monthly, advance_percent: advancePercent, role: wr.role_name },
    });
  }
  return row;
}

export function generateCyclesForMonth(year, month, actorUserId) {
  const y = Number(year);
  const m = Number(month);
  if (!y || m < 1 || m > 12) throw new Error('INVALID_MONTH');

  const employees = db.prepare(`SELECT * FROM payroll_employees WHERE active = 1`).all();
  let created = 0;
  const skipped = {
    zero_salary: 0,
    balance_not_zero: 0,
    monthly_already_paid: 0,
    advance_already_paid: 0,
  };

  const ins = db.prepare(
    `INSERT OR IGNORE INTO payroll_payment_cycles
      (employee_id, cycle_year, cycle_month, payment_type, due_date, amount_uzs, status)
     VALUES (?,?,?,?,?,?, 'pending')`,
  );

  for (const emp of employees) {
    const monthly = Number(emp.monthly_salary_uzs) || 0;
    if (monthly <= 0) {
      skipped.zero_salary += 1;
      continue;
    }

    const canMonthly = canAssignMonthlyPayroll(emp, y, m);
    const balance = getEmployeeAccountBalance(emp);
    const pct = Number(emp.advance_percent) || 0.1;
    const advanceAmt = Math.round(monthly * pct);
    const balanceAmt = Math.round(monthly - advanceAmt);
    const advanceDue = isoDate(y, m, Number(emp.advance_due_day) || 15);
    const balanceDay = Number(emp.balance_due_day) || 0;
    const balanceDue = balanceDay > 0 ? isoDate(y, m, balanceDay) : isoDate(y, m, daysInMonth(y, m));

    if (Math.abs(balance) <= 0.01 && !hasPaidCycleType(emp.id, y, m, 'advance')) {
      const r1 = ins.run(emp.id, y, m, 'advance', advanceDue, advanceAmt);
      created += r1.changes ? 1 : 0;
    } else if (hasPaidCycleType(emp.id, y, m, 'advance')) {
      skipped.advance_already_paid += 1;
    } else {
      skipped.balance_not_zero += 1;
    }

    if (canMonthly.ok) {
      const r2 = ins.run(emp.id, y, m, 'monthly_balance', balanceDue, balanceAmt);
      created += r2.changes ? 1 : 0;
    } else if (canMonthly.reason === 'monthly_already_paid') {
      skipped.monthly_already_paid += 1;
    } else if (canMonthly.reason === 'balance_not_zero') {
      skipped.balance_not_zero += 1;
    }
  }

  markOverdueCycles();
  if (actorUserId) {
    insertFinanceLog(db, {
      actorUserId,
      action: 'create',
      entityType: 'payroll_cycle_batch',
      entityId: y * 100 + m,
      payload: { year: y, month: m, created, skipped },
    });
  }
  return { year: y, month: m, created, skipped };
}

function markOverdueCycles() {
  db.prepare(
    `UPDATE payroll_payment_cycles SET status = 'overdue'
     WHERE status = 'pending' AND date(due_date) < date('now')`,
  ).run();
}

export function listCycles({ year, month, status, employeeId } = {}) {
  markOverdueCycles();
  let sql = `SELECT c.*, pe.user_id, pe.work_role_id, pe.employee_type, pe.monthly_salary_uzs,
             COALESCE(pe.display_name, u.full_name, wr.role_name) AS full_name,
             COALESCE(u.login, wr.login) AS login,
             COALESCE(r.name, u.role, wr.role_name) AS role_label
             FROM payroll_payment_cycles c
             JOIN payroll_employees pe ON pe.id = c.employee_id
             LEFT JOIN users u ON u.id = pe.user_id AND pe.employee_type = 'user'
             LEFT JOIN roles r ON r.id = u.role_id
             LEFT JOIN work_roles wr ON wr.id = pe.work_role_id AND pe.employee_type = 'work_role'
             WHERE 1=1`;
  const params = [];
  if (year) {
    sql += ` AND c.cycle_year = ?`;
    params.push(Number(year));
  }
  if (month) {
    sql += ` AND c.cycle_month = ?`;
    params.push(Number(month));
  }
  if (employeeId) {
    sql += ` AND c.employee_id = ?`;
    params.push(Number(employeeId));
  }
  if (status && STATUSES.includes(String(status))) {
    sql += ` AND c.status = ?`;
    params.push(String(status));
  }
  sql += ` ORDER BY c.due_date ASC, full_name COLLATE NOCASE ASC`;
  const rows = db.prepare(sql).all(...params);
  return rows.map(enrichCycle);
}

export function markCyclePaid(cycleId, actorUserId, { receipt_ref: receiptRef, notes } = {}) {
  const row = db
    .prepare(
      `SELECT c.*, pe.employee_type, pe.user_id, pe.work_role_id
       FROM payroll_payment_cycles c
       JOIN payroll_employees pe ON pe.id = c.employee_id
       WHERE c.id = ?`,
    )
    .get(cycleId);
  if (!row) throw new Error('NOT_FOUND');
  if (String(row.status) === 'paid') throw new Error('ALREADY_PAID');

  const empRef = {
    id: row.employee_id,
    employee_type: row.employee_type,
    user_id: row.user_id,
    work_role_id: row.work_role_id,
  };

  if (row.payment_type === 'monthly_balance') {
    const can = canAssignMonthlyPayroll(empRef, row.cycle_year, row.cycle_month);
    if (!can.ok && can.reason === 'monthly_already_paid') throw new Error('MONTHLY_ALREADY_PAID');
    if (!can.ok && can.reason === 'balance_not_zero') throw new Error('BALANCE_NOT_ZERO');
  } else if (row.payment_type === 'advance') {
    const balance = getEmployeeAccountBalance(empRef);
    if (Math.abs(balance) > 0.01) throw new Error('BALANCE_NOT_ZERO');
  }

  db.prepare(
    `UPDATE payroll_payment_cycles SET status = 'paid', paid_at = datetime('now'), paid_by = ?,
      receipt_ref = ?, notes = COALESCE(?, notes) WHERE id = ?`,
  ).run(actorUserId, receiptRef ? String(receiptRef).trim() : null, notes != null ? String(notes).trim() : null, cycleId);

  insertFinanceLog(db, {
    actorUserId,
    action: 'update',
    entityType: 'payroll_payment_cycle',
    entityId: cycleId,
    payload: { status: 'paid', amount_uzs: row.amount_uzs, payment_type: row.payment_type },
  });

  return enrichCycle(db.prepare(`SELECT * FROM payroll_payment_cycles WHERE id = ?`).get(cycleId));
}

export function getCycleReceipt(cycleId) {
  const row = db
    .prepare(
      `SELECT c.*, pe.monthly_salary_uzs, pe.employee_type,
        COALESCE(pe.display_name, u.full_name, wr.role_name) AS full_name,
        COALESCE(u.login, wr.login) AS login,
        COALESCE(u.email, wr.email) AS email,
        COALESCE(r.name, u.role, wr.role_name) AS role_label
       FROM payroll_payment_cycles c
       JOIN payroll_employees pe ON pe.id = c.employee_id
       LEFT JOIN users u ON u.id = pe.user_id AND pe.employee_type = 'user'
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN work_roles wr ON wr.id = pe.work_role_id AND pe.employee_type = 'work_role'
       WHERE c.id = ?`,
    )
    .get(cycleId);
  if (!row) throw new Error('NOT_FOUND');
  const typeLabel = row.payment_type === 'advance' ? 'Avans (har 15 kunda)' : 'Oylik ish haqi';
  const status = resolveCycleStatus(row);
  return {
    receipt_ref: row.receipt_ref || `MSH-${row.id}-${Date.now().toString(36)}`,
    employee_name: row.full_name,
    employee_login: row.login,
    role_label: row.role_label,
    payment_type: row.payment_type,
    payment_type_label: typeLabel,
    amount_uzs: row.amount_uzs,
    due_date: row.due_date,
    paid_at: row.paid_at,
    status,
    cycle_year: row.cycle_year,
    cycle_month: row.cycle_month,
    monthly_salary_uzs: row.monthly_salary_uzs,
  };
}

export function getPayrollSummary(year, month) {
  markOverdueCycles();
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;

  const counts = db
    .prepare(
      `SELECT status, COUNT(*) AS c, COALESCE(SUM(amount_uzs), 0) AS total
       FROM payroll_payment_cycles
       WHERE cycle_year = ? AND cycle_month = ?
       GROUP BY status`,
    )
    .all(y, m);

  const byStatus = { pending: 0, paid: 0, overdue: 0 };
  const totals = { pending: 0, paid: 0, overdue: 0 };
  for (const r of counts) {
    const st = String(r.status);
    if (byStatus[st] != null) {
      byStatus[st] = Number(r.c) || 0;
      totals[st] = Number(r.total) || 0;
    }
  }

  return {
    year: y,
    month: m,
    counts: byStatus,
    amounts: totals,
    total_payroll_month: totals.pending + totals.paid + totals.overdue,
  };
}

export { PAYMENT_TYPES, STATUSES };
