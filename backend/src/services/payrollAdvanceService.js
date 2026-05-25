import { db, insertWorkRoleLedgerEntry } from '../db/database.js';
import { notifySuperusersBell } from '../lib/superuserBell.js';
import { listPayrollEmployees } from './payrollCycleService.js';

const ADVANCE_PERCENT_DEFAULT = 0.1;
const ADVANCE_DUE_DAY = 15;

const ITEM_STATUSES = [
  'pending_superuser',
  'superuser_approved',
  'assigned',
  'awaiting_worker',
  'worker_confirmed',
  'distributed',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDate(year, month, day) {
  const dim = new Date(year, month, 0).getDate();
  const d = Math.min(Math.max(1, day), dim);
  return `${year}-${pad2(month)}-${pad2(d)}`;
}

function resolveWorkRoleIdForEmployee(emp) {
  if (emp.employee_type === 'work_role' && emp.work_role_id) return Number(emp.work_role_id);
  if (emp.user_id) {
    const u = db.prepare(`SELECT login FROM users WHERE id = ?`).get(emp.user_id);
    const login = String(u?.login || '').trim().toLowerCase();
    if (!login) return null;
    const wr = db
      .prepare(
        `SELECT id FROM work_roles WHERE deleted_at IS NULL AND lower(trim(login)) = ? LIMIT 1`,
      )
      .get(login);
    return wr?.id ?? null;
  }
  return null;
}

export function resolvePayrollEmployeeForUser(user) {
  if (!user?.id) return null;
  let pe = db.prepare(`SELECT * FROM payroll_employees WHERE user_id = ? AND active = 1`).get(user.id);
  if (pe) return pe;
  const login = String(user.login || '').trim().toLowerCase();
  if (!login) return null;
  const wr = db
    .prepare(`SELECT id FROM work_roles WHERE deleted_at IS NULL AND lower(trim(login)) = ?`)
    .get(login);
  if (!wr) return null;
  pe = db.prepare(`SELECT * FROM payroll_employees WHERE work_role_id = ? AND active = 1`).get(wr.id);
  return pe || null;
}

function enrichItem(row) {
  if (!row) return null;
  const labels = {
    pending_superuser: 'Superuser tasdiqi',
    superuser_approved: 'Tasdiqlangan',
    assigned: 'Biriktirilgan',
    awaiting_worker: 'Ishchi tasdiqi kutilmoqda',
    worker_confirmed: 'Ishchi tasdiqladi',
    distributed: "To'langan",
  };
  return { ...row, status_label: labels[row.status] || row.status };
}

function enrichRun(row) {
  if (!row) return null;
  const labels = {
    pending_superuser: 'Superuser tasdiqi kutilmoqda',
    superuser_approved: 'Buxgalter biriktirishi',
    accounting_assigned: 'Tarqatish jarayonida',
    closed: 'Yopilgan',
  };
  return { ...row, status_label: labels[row.status] || row.status };
}

export function listAdvanceRuns({ year, month } = {}) {
  let sql = `SELECT * FROM payroll_advance_runs WHERE 1=1`;
  const params = [];
  if (year) {
    sql += ` AND cycle_year = ?`;
    params.push(Number(year));
  }
  if (month) {
    sql += ` AND cycle_month = ?`;
    params.push(Number(month));
  }
  sql += ` ORDER BY cycle_year DESC, cycle_month DESC, id DESC`;
  return db.prepare(sql).all(...params).map(enrichRun);
}

export function getAdvanceRun(runId) {
  const run = db.prepare(`SELECT * FROM payroll_advance_runs WHERE id = ?`).get(runId);
  if (!run) return null;
  const items = listAdvanceItems({ run_id: runId });
  return { run: enrichRun(run), items };
}

export function listAdvanceItems({ run_id: runId, status, employee_id: employeeId } = {}) {
  let sql = `SELECT i.*, r.cycle_year, r.cycle_month, r.due_date AS run_due_date
             FROM payroll_advance_items i
             JOIN payroll_advance_runs r ON r.id = i.run_id WHERE 1=1`;
  const params = [];
  if (runId) {
    sql += ` AND i.run_id = ?`;
    params.push(Number(runId));
  }
  if (employeeId) {
    sql += ` AND i.employee_id = ?`;
    params.push(Number(employeeId));
  }
  if (status) {
    sql += ` AND i.status = ?`;
    params.push(String(status));
  }
  sql += ` ORDER BY i.role_label COLLATE NOCASE, i.employee_display_name COLLATE NOCASE`;
  return db.prepare(sql).all(...params).map(enrichItem);
}

/** Har oy 15-kuni: barcha xodimlar uchun 10% avans superuserga */
export function createMonthlyAdvanceRun(year, month, actorUserId = null) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const existing = db
    .prepare(`SELECT * FROM payroll_advance_runs WHERE cycle_year = ? AND cycle_month = ?`)
    .get(y, m);
  if (existing) return { run: enrichRun(existing), created: false, items_added: 0 };

  const dueDate = isoDate(y, m, ADVANCE_DUE_DAY);
  const runIns = db
    .prepare(
      `INSERT INTO payroll_advance_runs (cycle_year, cycle_month, due_date, status)
       VALUES (?,?,?, 'pending_superuser')`,
    )
    .run(y, m, dueDate);
  const runId = runIns.lastInsertRowid;

  const employees = listPayrollEmployees().filter((e) => Number(e.monthly_salary_uzs) > 0 && e.active !== 0);
  const insItem = db.prepare(
    `INSERT OR IGNORE INTO payroll_advance_items (
       run_id, employee_id, role_label, employee_display_name, employee_login,
       amount_uzs, advance_percent, status
     ) VALUES (?,?,?,?,?,?,?, 'pending_superuser')`,
  );

  let total = 0;
  let added = 0;
  for (const emp of employees) {
    const pct = Math.min(0.9, Math.max(0.05, Number(emp.advance_percent) || ADVANCE_PERCENT_DEFAULT));
    const amount = Math.round(Number(emp.monthly_salary_uzs) * pct);
    if (amount <= 0) continue;
    const r = insItem.run(
      runId,
      emp.id,
      emp.role_label || '',
      emp.full_name || emp.login || '',
      emp.login || null,
      amount,
      pct,
    );
    if (r.changes) {
      added += 1;
      total += amount;
    }
  }

  db.prepare(
    `UPDATE payroll_advance_runs SET total_amount_uzs = ?, item_count = ? WHERE id = ?`,
  ).run(total, added, runId);

  const monthLabel = `${y}-${pad2(m)}`;
  notifySuperusersBell({
    actorUserId,
    title: `Oylik avans tasdiqi (${monthLabel})`,
    body: `${added} ta xodim uchun jami ${total.toLocaleString('uz-UZ')} so'm avans (10%) superuser tasdiqini kutmoqda.`,
    linkType: 'payroll_advance',
    linkId: runId,
  });

  return {
    run: enrichRun(db.prepare(`SELECT * FROM payroll_advance_runs WHERE id = ?`).get(runId)),
    created: true,
    items_added: added,
    total_amount_uzs: total,
  };
}

/** Kunlik tekshiruv: 15-sanadan keyin joriy oy uchun avtomatik yuborish */
export function maybeAutoCreateAdvanceRunForToday() {
  const now = new Date();
  const day = now.getDate();
  if (day < ADVANCE_DUE_DAY) return { skipped: true, reason: 'before_due_day' };
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const existing = db
    .prepare(`SELECT id FROM payroll_advance_runs WHERE cycle_year = ? AND cycle_month = ?`)
    .get(y, m);
  if (existing) return { skipped: true, reason: 'already_exists', run_id: existing.id };
  return createMonthlyAdvanceRun(y, m, null);
}

export function superuserApproveAdvanceRun(runId, actorUserId) {
  const run = db.prepare(`SELECT * FROM payroll_advance_runs WHERE id = ?`).get(runId);
  if (!run) throw new Error('NOT_FOUND');
  if (run.status !== 'pending_superuser') throw new Error('INVALID_STATUS');

  db.prepare(
    `UPDATE payroll_advance_runs SET status = 'superuser_approved', superuser_approved_at = datetime('now'),
      superuser_approved_by = ? WHERE id = ?`,
  ).run(actorUserId, runId);

  db.prepare(
    `UPDATE payroll_advance_items SET status = 'superuser_approved', superuser_approved_at = datetime('now')
     WHERE run_id = ? AND status = 'pending_superuser'`,
  ).run(runId);

  return getAdvanceRun(runId);
}

export function accountingAssignAdvanceRun(runId, actorUserId) {
  const run = db.prepare(`SELECT * FROM payroll_advance_runs WHERE id = ?`).get(runId);
  if (!run) throw new Error('NOT_FOUND');
  if (run.status !== 'superuser_approved') throw new Error('INVALID_STATUS');

  db.prepare(
    `UPDATE payroll_advance_runs SET status = 'accounting_assigned', accounting_assigned_at = datetime('now'),
      accounting_assigned_by = ? WHERE id = ?`,
  ).run(actorUserId, runId);

  db.prepare(
    `UPDATE payroll_advance_items SET status = 'awaiting_worker', assigned_at = datetime('now'), assigned_by = ?
     WHERE run_id = ? AND status = 'superuser_approved'`,
  ).run(actorUserId, runId);

  return getAdvanceRun(runId);
}

export function workerConfirmAdvanceItem(itemId, user) {
  const pe = resolvePayrollEmployeeForUser(user);
  if (!pe) throw new Error('NO_PAYROLL_EMPLOYEE');

  const item = db.prepare(`SELECT * FROM payroll_advance_items WHERE id = ?`).get(itemId);
  if (!item) throw new Error('NOT_FOUND');
  if (Number(item.employee_id) !== Number(pe.id)) throw new Error('FORBIDDEN');
  if (item.status !== 'awaiting_worker' && item.status !== 'assigned') {
    throw new Error('INVALID_STATUS');
  }

  db.prepare(
    `UPDATE payroll_advance_items SET status = 'worker_confirmed', worker_confirmed_at = datetime('now') WHERE id = ?`,
  ).run(itemId);

  return enrichItem(db.prepare(`SELECT * FROM payroll_advance_items WHERE id = ?`).get(itemId));
}

export function listPendingAdvancesForUser(user) {
  const pe = resolvePayrollEmployeeForUser(user);
  if (!pe) return [];
  return listAdvanceItems({ employee_id: pe.id, status: 'awaiting_worker' });
}

export function accountingDistributeAdvanceItem(itemId, actorUserId) {
  const item = db.prepare(`SELECT * FROM payroll_advance_items WHERE id = ?`).get(itemId);
  if (!item) throw new Error('NOT_FOUND');
  if (item.status !== 'worker_confirmed') throw new Error('WORKER_NOT_CONFIRMED');

  const emp = db.prepare(`SELECT * FROM payroll_employees WHERE id = ?`).get(item.employee_id);
  if (!emp) throw new Error('EMPLOYEE_NOT_FOUND');

  const wrId = resolveWorkRoleIdForEmployee(emp);
  if (!wrId) throw new Error('NO_WORK_ROLE');

  const amount = Number(item.amount_uzs) || 0;
  if (amount <= 0) throw new Error('INVALID_AMOUNT');

  db.prepare(
    `UPDATE work_roles SET total_amount = total_amount + ?, reward_amount = reward_amount + ? WHERE id = ?`,
  ).run(amount, amount, wrId);

  insertWorkRoleLedgerEntry({
    work_role_id: wrId,
    kind: 'reward',
    amount,
    title: 'Oylik avans',
    note: `${item.role_label} — ${item.employee_display_name}`,
    ref_kind: 'payroll_advance',
    ref_id: itemId,
  });

  db.prepare(
    `UPDATE payroll_advance_items SET status = 'distributed', distributed_at = datetime('now'), distributed_by = ? WHERE id = ?`,
  ).run(actorUserId, itemId);

  const pending = db
    .prepare(
      `SELECT COUNT(*) AS c FROM payroll_advance_items WHERE run_id = ? AND status NOT IN ('distributed')`,
    )
    .get(item.run_id).c;
  if (!pending) {
    db.prepare(`UPDATE payroll_advance_runs SET status = 'closed' WHERE id = ?`).run(item.run_id);
  }

  return enrichItem(db.prepare(`SELECT * FROM payroll_advance_items WHERE id = ?`).get(itemId));
}

export function accountingDistributeAllConfirmed(runId, actorUserId) {
  const items = db
    .prepare(`SELECT id FROM payroll_advance_items WHERE run_id = ? AND status = 'worker_confirmed'`)
    .all(runId);
  let distributed = 0;
  const errors = [];
  for (const it of items) {
    try {
      accountingDistributeAdvanceItem(it.id, actorUserId);
      distributed += 1;
    } catch (e) {
      errors.push({ id: it.id, error: e?.message });
    }
  }
  return { distributed, errors, run: getAdvanceRun(runId) };
}

export { ITEM_STATUSES, ADVANCE_PERCENT_DEFAULT, ADVANCE_DUE_DAY };
