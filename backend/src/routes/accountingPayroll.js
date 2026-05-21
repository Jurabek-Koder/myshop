import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { db } from '../db/database.js';

const router = Router();
router.use(authRequired, requireRole('accounting', 'superuser'));

function auditLog(userId, action, entityType, entityId, details, ip) {
  db.prepare(
    'INSERT INTO acc_audit_log (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip || null);
}

// ===== DASHBOARD ANALYTICS =====

router.get('/dashboard/stats', (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

    const totalIncome = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM acc_transactions WHERE type = 'income' AND date >= ? AND date <= ?`
    ).get(startOfMonth, endStr);

    const totalExpense = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM acc_transactions WHERE type = 'expense' AND date >= ? AND date <= ?`
    ).get(startOfMonth, endStr);

    const totalPayroll = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM acc_salary_payments WHERE paid_at >= ? AND paid_at <= ?`
    ).get(startOfMonth, endStr + ' 23:59:59');

    const netProfit = (totalIncome.total || 0) - (totalExpense.total || 0);

    const employeeCount = db.prepare(`SELECT COUNT(*) as cnt FROM acc_employees WHERE status = 'active'`).get();
    const pendingPayrolls = db.prepare(`SELECT COUNT(*) as cnt FROM acc_payroll_cycles WHERE status IN ('pending', 'overdue')`).get();
    const overduePayrolls = db.prepare(`SELECT COUNT(*) as cnt FROM acc_payroll_cycles WHERE status = 'overdue'`).get();

    res.json({
      total_income: totalIncome.total || 0,
      total_expense: totalExpense.total || 0,
      net_profit: netProfit,
      total_payroll: totalPayroll.total || 0,
      employee_count: employeeCount.cnt || 0,
      pending_payrolls: pendingPayrolls.cnt || 0,
      overdue_payrolls: overduePayrolls.cnt || 0,
      period: { start: startOfMonth, end: endStr },
    });
  } catch (e) {
    console.error('dashboard stats error:', e);
    res.status(500).json({ error: 'Statistika yuklanmadi.' });
  }
});

router.get('/dashboard/chart-data', (req, res) => {
  try {
    const months = parseInt(req.query.months || '6', 10);
    const data = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

      const income = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM acc_transactions WHERE type = 'income' AND date >= ? AND date <= ?`
      ).get(startDate, endDate);

      const expense = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM acc_transactions WHERE type = 'expense' AND date >= ? AND date <= ?`
      ).get(startDate, endDate);

      const payroll = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM acc_salary_payments WHERE paid_at >= ? AND paid_at <= ?`
      ).get(startDate, endDate + ' 23:59:59');

      const monthNames = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
      data.push({
        month: monthNames[month - 1],
        year,
        income: income.total || 0,
        expense: expense.total || 0,
        payroll: payroll.total || 0,
        profit: (income.total || 0) - (expense.total || 0),
      });
    }

    res.json({ chart_data: data });
  } catch (e) {
    console.error('chart data error:', e);
    res.status(500).json({ error: 'Grafik ma\'lumotlari yuklanmadi.' });
  }
});

router.get('/dashboard/recent-activity', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);

    const transactions = db.prepare(`
      SELECT t.*, ec.name as category_name
      FROM acc_transactions t
      LEFT JOIN acc_expense_categories ec ON t.type = 'expense' AND t.category_id = ec.id
      LEFT JOIN acc_income_categories ic ON t.type = 'income' AND t.category_id = ic.id
      ORDER BY t.created_at DESC
      LIMIT ?
    `).all(limit);

    const payments = db.prepare(`
      SELECT sp.*, e.full_name as employee_name
      FROM acc_salary_payments sp
      LEFT JOIN acc_employees e ON sp.employee_id = e.id
      ORDER BY sp.paid_at DESC
      LIMIT ?
    `).all(limit);

    res.json({ transactions, payments });
  } catch (e) {
    console.error('recent activity error:', e);
    res.status(500).json({ error: 'Faoliyat yuklanmadi.' });
  }
});

// ===== EMPLOYEES =====

router.get('/employees', (req, res) => {
  try {
    const status = req.query.status || 'active';
    const employees = db.prepare(`
      SELECT e.*,
        (SELECT COALESCE(SUM(sp.amount), 0) FROM acc_salary_payments sp WHERE sp.employee_id = e.id) as total_paid,
        (SELECT sp.paid_at FROM acc_salary_payments sp WHERE sp.employee_id = e.id ORDER BY sp.paid_at DESC LIMIT 1) as last_payment_date,
        (SELECT pc.due_date FROM acc_payroll_cycles pc WHERE pc.employee_id = e.id AND pc.status IN ('pending', 'overdue') ORDER BY pc.due_date ASC LIMIT 1) as next_payment_date,
        (SELECT pc.status FROM acc_payroll_cycles pc WHERE pc.employee_id = e.id AND pc.status IN ('pending', 'overdue') ORDER BY pc.due_date ASC LIMIT 1) as next_payment_status
      FROM acc_employees e
      WHERE e.status = ?
      ORDER BY e.full_name ASC
    `).all(status);
    res.json({ employees });
  } catch (e) {
    console.error('employees list error:', e);
    res.status(500).json({ error: 'Xodimlar ro\'yxati yuklanmadi.' });
  }
});

router.get('/employees/:id', (req, res) => {
  try {
    const emp = db.prepare('SELECT * FROM acc_employees WHERE id = ?').get(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Xodim topilmadi.' });

    const payments = db.prepare(`
      SELECT * FROM acc_salary_payments WHERE employee_id = ? ORDER BY paid_at DESC LIMIT 50
    `).all(emp.id);

    const cycles = db.prepare(`
      SELECT * FROM acc_payroll_cycles WHERE employee_id = ? ORDER BY due_date DESC LIMIT 24
    `).all(emp.id);

    const totalPaid = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM acc_salary_payments WHERE employee_id = ?`
    ).get(emp.id);

    res.json({ employee: emp, payments, cycles, total_paid: totalPaid.total || 0 });
  } catch (e) {
    console.error('employee detail error:', e);
    res.status(500).json({ error: 'Xodim ma\'lumotlari yuklanmadi.' });
  }
});

router.post('/employees', (req, res) => {
  try {
    const { full_name, phone, position, monthly_salary, hire_date, card_number, notes, user_id } = req.body;
    if (!full_name || !monthly_salary) {
      return res.status(400).json({ error: 'Ism va oylik maosh majburiy.' });
    }

    const result = db.prepare(`
      INSERT INTO acc_employees (full_name, phone, position, monthly_salary, hire_date, card_number, notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      full_name.trim(),
      phone || null,
      position || null,
      parseFloat(monthly_salary),
      hire_date || new Date().toISOString().split('T')[0],
      card_number || null,
      notes || null,
      user_id || null
    );

    auditLog(req.user.id, 'employee_created', 'acc_employees', result.lastInsertRowid, { full_name }, req.ip);
    res.json({ id: result.lastInsertRowid, message: 'Xodim qo\'shildi.' });
  } catch (e) {
    console.error('create employee error:', e);
    res.status(500).json({ error: 'Xodim qo\'shib bo\'lmadi.' });
  }
});

router.patch('/employees/:id', (req, res) => {
  try {
    const emp = db.prepare('SELECT * FROM acc_employees WHERE id = ?').get(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Xodim topilmadi.' });

    const { full_name, phone, position, monthly_salary, hire_date, card_number, notes, status } = req.body;

    db.prepare(`
      UPDATE acc_employees SET
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        position = COALESCE(?, position),
        monthly_salary = COALESCE(?, monthly_salary),
        hire_date = COALESCE(?, hire_date),
        card_number = COALESCE(?, card_number),
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      full_name || null, phone || null, position || null,
      monthly_salary ? parseFloat(monthly_salary) : null,
      hire_date || null, card_number || null, notes || null, status || null,
      req.params.id
    );

    auditLog(req.user.id, 'employee_updated', 'acc_employees', emp.id, req.body, req.ip);
    res.json({ message: 'Xodim yangilandi.' });
  } catch (e) {
    console.error('update employee error:', e);
    res.status(500).json({ error: 'Xodim yangilanmadi.' });
  }
});

// ===== PAYROLL CYCLES =====

router.post('/payroll/generate-cycles', (req, res) => {
  try {
    const { month, year } = req.body;
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!m || !y || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Oy va yil majburiy.' });
    }

    const employees = db.prepare(`SELECT * FROM acc_employees WHERE status = 'active'`).all();
    const existing = db.prepare(
      `SELECT employee_id, cycle_type FROM acc_payroll_cycles WHERE cycle_month = ? AND cycle_year = ?`
    ).all(m, y);

    const existingSet = new Set(existing.map(r => `${r.employee_id}-${r.cycle_type}`));
    let created = 0;

    const advanceDueDate = `${y}-${String(m).padStart(2, '0')}-15`;
    const lastDay = new Date(y, m, 0).getDate();
    const salaryDueDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const insert = db.prepare(`
      INSERT INTO acc_payroll_cycles (employee_id, cycle_month, cycle_year, cycle_type, amount, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const today = new Date().toISOString().split('T')[0];

    for (const emp of employees) {
      const advanceAmount = Math.round(emp.monthly_salary * 0.4);
      const salaryAmount = emp.monthly_salary - advanceAmount;

      if (!existingSet.has(`${emp.id}-advance`)) {
        const status = today > advanceDueDate ? 'overdue' : 'pending';
        insert.run(emp.id, m, y, 'advance', advanceAmount, advanceDueDate, status);
        created++;
      }

      if (!existingSet.has(`${emp.id}-salary`)) {
        const status = today > salaryDueDate ? 'overdue' : 'pending';
        insert.run(emp.id, m, y, 'salary', salaryAmount, salaryDueDate, status);
        created++;
      }
    }

    auditLog(req.user.id, 'payroll_cycles_generated', 'acc_payroll_cycles', null, { month: m, year: y, created }, req.ip);
    res.json({ message: `${created} ta sikl yaratildi.`, created });
  } catch (e) {
    console.error('generate cycles error:', e);
    res.status(500).json({ error: 'Sikllar yaratilmadi.' });
  }
});

router.get('/payroll/cycles', (req, res) => {
  try {
    const { month, year, status, employee_id } = req.query;
    let sql = `
      SELECT pc.*, e.full_name as employee_name, e.position, e.monthly_salary
      FROM acc_payroll_cycles pc
      JOIN acc_employees e ON pc.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (month && year) {
      sql += ' AND pc.cycle_month = ? AND pc.cycle_year = ?';
      params.push(parseInt(month, 10), parseInt(year, 10));
    }
    if (status) {
      sql += ' AND pc.status = ?';
      params.push(status);
    }
    if (employee_id) {
      sql += ' AND pc.employee_id = ?';
      params.push(parseInt(employee_id, 10));
    }

    sql += ' ORDER BY pc.due_date DESC, e.full_name ASC';
    const cycles = db.prepare(sql).all(...params);
    res.json({ cycles });
  } catch (e) {
    console.error('payroll cycles error:', e);
    res.status(500).json({ error: 'Sikllar yuklanmadi.' });
  }
});

router.post('/payroll/pay', (req, res) => {
  try {
    const { cycle_id, amount, payment_method, description } = req.body;
    if (!cycle_id) return res.status(400).json({ error: 'Sikl ID majburiy.' });

    const cycle = db.prepare('SELECT * FROM acc_payroll_cycles WHERE id = ?').get(cycle_id);
    if (!cycle) return res.status(404).json({ error: 'Sikl topilmadi.' });
    if (cycle.status === 'paid') return res.status(400).json({ error: 'Bu sikl allaqachon to\'langan.' });

    const payAmount = amount ? parseFloat(amount) : cycle.amount;
    const now = new Date().toISOString();

    const paymentResult = db.prepare(`
      INSERT INTO acc_salary_payments (employee_id, payroll_cycle_id, amount, payment_type, payment_method, description, paid_by, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cycle.employee_id, cycle.id, payAmount,
      cycle.cycle_type, payment_method || 'cash',
      description || null, req.user.id, now
    );

    db.prepare(`
      UPDATE acc_payroll_cycles SET status = 'paid', paid_date = ?, paid_by = ?, updated_at = datetime('now') WHERE id = ?
    `).run(now, req.user.id, cycle.id);

    db.prepare(`
      INSERT INTO acc_transactions (type, category_id, amount, description, date, reference_type, reference_id, created_by)
      VALUES ('expense', (SELECT id FROM acc_expense_categories WHERE name = 'Xodimlar oyligi' LIMIT 1), ?, ?, date('now'), 'salary_payment', ?, ?)
    `).run(
      payAmount,
      `${cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik'} - xodim #${cycle.employee_id}`,
      paymentResult.lastInsertRowid,
      req.user.id
    );

    auditLog(req.user.id, 'salary_paid', 'acc_salary_payments', paymentResult.lastInsertRowid, {
      employee_id: cycle.employee_id, amount: payAmount, cycle_type: cycle.cycle_type
    }, req.ip);

    res.json({ message: 'To\'lov amalga oshirildi.', payment_id: paymentResult.lastInsertRowid });
  } catch (e) {
    console.error('pay salary error:', e);
    res.status(500).json({ error: 'To\'lov amalga oshirilmadi.' });
  }
});

// ===== TRANSACTIONS (Income & Expense) =====

router.get('/transactions', (req, res) => {
  try {
    const { type, start_date, end_date, category_id, limit: lim } = req.query;
    let sql = `
      SELECT t.*,
        CASE WHEN t.type = 'expense' THEN ec.name ELSE ic.name END as category_name,
        CASE WHEN t.type = 'expense' THEN ec.icon ELSE ic.icon END as category_icon,
        CASE WHEN t.type = 'expense' THEN ec.color ELSE ic.color END as category_color
      FROM acc_transactions t
      LEFT JOIN acc_expense_categories ec ON t.type = 'expense' AND t.category_id = ec.id
      LEFT JOIN acc_income_categories ic ON t.type = 'income' AND t.category_id = ic.id
      WHERE 1=1
    `;
    const params = [];

    if (type) { sql += ' AND t.type = ?'; params.push(type); }
    if (start_date) { sql += ' AND t.date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND t.date <= ?'; params.push(end_date); }
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(parseInt(category_id, 10)); }

    sql += ' ORDER BY t.date DESC, t.created_at DESC';
    sql += ` LIMIT ${Math.min(parseInt(lim || '100', 10), 500)}`;

    const transactions = db.prepare(sql).all(...params);
    res.json({ transactions });
  } catch (e) {
    console.error('transactions list error:', e);
    res.status(500).json({ error: 'Tranzaksiyalar yuklanmadi.' });
  }
});

router.post('/transactions', (req, res) => {
  try {
    const { type, category_id, amount, description, date } = req.body;
    if (!type || !amount) return res.status(400).json({ error: 'Turi va summa majburiy.' });
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Noto\'g\'ri tur.' });

    const result = db.prepare(`
      INSERT INTO acc_transactions (type, category_id, amount, description, date, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      type, category_id || null, parseFloat(amount),
      description || null, date || new Date().toISOString().split('T')[0], req.user.id
    );

    auditLog(req.user.id, `transaction_${type}_created`, 'acc_transactions', result.lastInsertRowid, { amount, type }, req.ip);
    res.json({ id: result.lastInsertRowid, message: 'Tranzaksiya qo\'shildi.' });
  } catch (e) {
    console.error('create transaction error:', e);
    res.status(500).json({ error: 'Tranzaksiya qo\'shilmadi.' });
  }
});

router.delete('/transactions/:id', (req, res) => {
  try {
    const tx = db.prepare('SELECT * FROM acc_transactions WHERE id = ?').get(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Tranzaksiya topilmadi.' });

    db.prepare('DELETE FROM acc_transactions WHERE id = ?').run(req.params.id);
    auditLog(req.user.id, 'transaction_deleted', 'acc_transactions', tx.id, tx, req.ip);
    res.json({ message: 'Tranzaksiya o\'chirildi.' });
  } catch (e) {
    console.error('delete transaction error:', e);
    res.status(500).json({ error: 'Tranzaksiya o\'chirilmadi.' });
  }
});

// ===== CATEGORIES =====

router.get('/categories/expense', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM acc_expense_categories ORDER BY name').all();
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: 'Kategoriyalar yuklanmadi.' });
  }
});

router.get('/categories/income', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM acc_income_categories ORDER BY name').all();
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: 'Kategoriyalar yuklanmadi.' });
  }
});

// ===== REPORTS =====

router.get('/reports/monthly', (req, res) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month || (new Date().getMonth() + 1), 10);
    const y = parseInt(year || new Date().getFullYear(), 10);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const incomeByCategory = db.prepare(`
      SELECT ic.name, ic.color, COALESCE(SUM(t.amount), 0) as total
      FROM acc_income_categories ic
      LEFT JOIN acc_transactions t ON t.category_id = ic.id AND t.type = 'income' AND t.date >= ? AND t.date <= ?
      GROUP BY ic.id ORDER BY total DESC
    `).all(startDate, endDate);

    const expenseByCategory = db.prepare(`
      SELECT ec.name, ec.color, COALESCE(SUM(t.amount), 0) as total
      FROM acc_expense_categories ec
      LEFT JOIN acc_transactions t ON t.category_id = ec.id AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
      GROUP BY ec.id ORDER BY total DESC
    `).all(startDate, endDate);

    const totalIncome = incomeByCategory.reduce((s, r) => s + r.total, 0);
    const totalExpense = expenseByCategory.reduce((s, r) => s + r.total, 0);

    const payrollSummary = db.prepare(`
      SELECT
        COUNT(*) as total_cycles,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as paid_total
      FROM acc_payroll_cycles
      WHERE cycle_month = ? AND cycle_year = ?
    `).get(m, y);

    res.json({
      period: { month: m, year: y, start: startDate, end: endDate },
      income: { total: totalIncome, by_category: incomeByCategory },
      expense: { total: totalExpense, by_category: expenseByCategory },
      net_profit: totalIncome - totalExpense,
      payroll: payrollSummary,
    });
  } catch (e) {
    console.error('monthly report error:', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

// ===== OVERDUE DETECTION =====

router.post('/payroll/check-overdue', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(`
      UPDATE acc_payroll_cycles SET status = 'overdue', updated_at = datetime('now')
      WHERE status = 'pending' AND due_date < ?
    `).run(today);

    res.json({ updated: result.changes, message: `${result.changes} ta sikl kechikkan deb belgilandi.` });
  } catch (e) {
    console.error('check overdue error:', e);
    res.status(500).json({ error: 'Tekshiruv amalga oshirilmadi.' });
  }
});

// ===== AUDIT LOG =====

router.get('/audit-log', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const logs = db.prepare(`
      SELECT al.*, u.full_name as user_name
      FROM acc_audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: 'Audit log yuklanmadi.' });
  }
});

export default router;
