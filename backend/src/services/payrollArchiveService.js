import { db } from '../db/database.js';
import { listPayrollRoleDefaults } from './payrollCycleService.js';

export function listPayrollArchive({ year, month, limit = 200 } = {}) {
  const cap = Math.min(500, Math.max(1, Number(limit) || 200));

  let cycleSql = `
    SELECT c.id, c.cycle_year, c.cycle_month, c.payment_type, c.due_date, c.amount_uzs,
           c.status, c.paid_at, c.receipt_ref,
           COALESCE(pe.display_name, u.full_name, wr.role_name) AS full_name,
           COALESCE(u.login, wr.login) AS login,
           COALESCE(r.name, u.role, wr.role_name) AS role_label
    FROM payroll_payment_cycles c
    JOIN payroll_employees pe ON pe.id = c.employee_id
    LEFT JOIN users u ON u.id = pe.user_id AND pe.employee_type = 'user'
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN work_roles wr ON wr.id = pe.work_role_id AND pe.employee_type = 'work_role'
    WHERE c.status = 'paid'
  `;
  const cycleParams = [];
  if (year) {
    cycleSql += ` AND c.cycle_year = ?`;
    cycleParams.push(Number(year));
  }
  if (month) {
    cycleSql += ` AND c.cycle_month = ?`;
    cycleParams.push(Number(month));
  }
  cycleSql += ` ORDER BY datetime(c.paid_at) DESC, c.id DESC LIMIT ?`;
  cycleParams.push(cap);

  const paid_cycles = db.prepare(cycleSql).all(...cycleParams);

  const advance_items = db
    .prepare(
      `SELECT i.id, i.amount_uzs, i.role_label, i.employee_display_name, i.employee_login,
              i.advance_percent, i.distributed_at, i.status,
              r.cycle_year, r.cycle_month
       FROM payroll_advance_items i
       JOIN payroll_advance_runs r ON r.id = i.run_id
       WHERE i.status = 'distributed'
       ORDER BY datetime(i.distributed_at) DESC, i.id DESC
       LIMIT ?`,
    )
    .all(cap);

  const role_defaults = listPayrollRoleDefaults();

  return {
    role_defaults,
    paid_cycles,
    advance_items,
  };
}
