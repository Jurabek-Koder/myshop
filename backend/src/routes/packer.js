import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { createPendingWithdrawalForWorkRole } from '../lib/staffWithdrawalFlow.js';

const router = Router();
router.use(authRequired, requireRole('packer'));

function getPackerByUser(user) {
  if (!user) return null;
  if (user.staff_member_id) {
    const byId = db.prepare('SELECT * FROM staff_members WHERE id = ? AND staff_type = ?').get(user.staff_member_id, 'packer');
    if (byId) return byId;
  }
  return db.prepare('SELECT * FROM staff_members WHERE user_id = ? AND staff_type = ?').get(user.id, 'packer') || null;
}

/** Sklad `work_roles` qatori — login/email bo‘yicha packer; balans `total_amount` */
function getPackerWorkRoleByUserRow(userRow) {
  const login = String(userRow?.login || '').trim();
  const email = String(userRow?.email || '').trim();
  if (!login && !email) return null;
  return db.prepare(`
    SELECT * FROM work_roles
    WHERE deleted_at IS NULL
      AND (lower(login) = lower(?) OR lower(IFNULL(email, '')) = lower(?))
      AND (
        lower(role_name) = 'packer'
        OR lower(role_name) LIKE '%packer%'
        OR lower(role_name) LIKE '%qadoq%'
      )
    LIMIT 1
  `).get(login, email);
}

function getPackerWorkRole(req) {
  return getPackerWorkRoleByUserRow(req.user);
}

/** Faol viloyatlar (buyurtma manzili bo‘yicha filtr uchun) */
router.get('/regions', (req, res) => {
  try {
    const regions = db
      .prepare(`SELECT id, name FROM regions WHERE active = 1 ORDER BY name ASC`)
      .all();
    res.json({ regions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Viloyatlar yuklanmadi.' });
  }
});

/** Umumiy sinov zakazlari: PACKERTEST (navbat/tarix), HOLDTEST (hold sinov) — is_test=1, har qanday packer ko‘radi */
function isSharedPackerSeedOrder(row) {
  if (!row) return false;
  const phone = String(row.contact_phone || '');
  if (Number(row.is_test) !== 1) return false;
  return phone.startsWith('PACKERTEST') || phone.startsWith('HOLDTEST');
}

function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.stock, p.image_url
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(order.id);
  return order;
}

router.get('/orders', (req, res) => {
  const packer = getPackerByUser(req.user);
  const staffId = packer?.id != null && Number.isInteger(packer.id) ? packer.id : -1;
  const orders = db.prepare(`
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at,
           COALESCE(o.is_test, 0) AS is_test
    FROM orders o
    WHERE o.status = 'picked'
      AND (o.packer_id = ?
        OR (COALESCE(o.is_test, 0) = 1 AND (o.contact_phone LIKE 'PACKERTEST%' OR o.contact_phone LIKE 'HOLDTEST%')))
    ORDER BY o.created_at ASC
    LIMIT 100
  `).all(staffId);

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.stock, p.image_url
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ orders });
});

/** Qadoqlangan zakazlar tarixi (shu packer + umumiy sinov PACKERTEST) */
router.get('/orders/history', (req, res) => {
  const packer = getPackerByUser(req.user);
  const staffId = packer?.id != null && Number.isInteger(packer.id) ? packer.id : -1;
  const orders = db
    .prepare(
      `
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at,
           COALESCE(o.is_test, 0) AS is_test
    FROM orders o
    WHERE o.status = 'packaged'
      AND (o.packer_id = ?
      OR (COALESCE(o.is_test, 0) = 1 AND (o.contact_phone LIKE 'PACKERTEST%' OR o.contact_phone LIKE 'HOLDTEST%')))
    ORDER BY datetime(o.created_at) DESC
    LIMIT 100
  `
    )
    .all(staffId);

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.stock, p.image_url
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
  }

  res.json({ orders });
});

/** Hold holatidagi zakazlar (shu packer tayinlangan bo‘lsa) */
router.get('/orders/hold', (req, res) => {
  const packer = getPackerByUser(req.user);
  const staffId = packer?.id != null && Number.isInteger(packer.id) ? packer.id : -1;
  const orders = db
    .prepare(
      `
    SELECT o.id, o.user_id, o.status, o.total_amount, o.currency, o.shipping_address, o.contact_phone, o.created_at,
           COALESCE(o.is_test, 0) AS is_test
    FROM orders o
    WHERE o.status = 'hold'
      AND (o.packer_id = ?
        OR (COALESCE(o.is_test, 0) = 1 AND (o.contact_phone LIKE 'PACKERTEST%' OR o.contact_phone LIKE 'HOLDTEST%')))
    ORDER BY datetime(o.created_at) ASC
    LIMIT 100
  `
    )
    .all(staffId);

  for (const o of orders) {
    o.items = db.prepare(`
      SELECT oi.id, oi.product_id, oi.quantity, oi.price_at_order, p.name_uz, p.stock, p.image_url
      FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
    `).all(o.id);
  }

  res.json({ orders });
});

router.patch('/orders/:id/status', (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const { status } = req.body;
  const statusStr = String(status || '').trim();

  if (isNaN(orderId) || orderId < 1) return res.status(400).json({ error: 'Noto\'g\'ri buyurtma ID.' });

  const packer = getPackerByUser(req.user);
  const order = db
    .prepare(
      `SELECT id, status, packer_id, courier_id, contact_phone, COALESCE(is_test, 0) AS is_test FROM orders WHERE id = ?`
    )
    .get(orderId);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi.' });

  if (!packer && !isSharedPackerSeedOrder(order)) {
    return res.status(404).json({ error: 'Packer profilingiz topilmadi.' });
  }
  const mayAct =
    isSharedPackerSeedOrder(order) || (packer != null && order.packer_id === packer.id);
  if (!mayAct) return res.status(403).json({ error: 'Bu zakaz sizga tegishli emas.' });

  /** packaged → picked (ombor tiklash) yoki hold → picked (asosiy navbat) */
  if (statusStr === 'picked') {
    if (order.status === 'hold') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('picked', orderId);
      return res.json(orderWithItems(orderId));
    }
    if (order.status === 'packaged') {
      if (order.courier_id != null && Number(order.courier_id) > 0) {
        return res.status(400).json({
          error: 'Bu zakaz kuryerga berilgan. Holatni faqat kuryer yoki superuser o‘zgartira oladi.',
        });
      }
      try {
        const runUnpackage = db.transaction(() => {
          const lines = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
          for (const line of lines) {
            const qty = Number(line.quantity) || 0;
            if (qty <= 0) continue;
            db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, line.product_id);
          }
          db.prepare('UPDATE orders SET status = ?, packer_batch_id = NULL WHERE id = ?').run('picked', orderId);
        });
        runUnpackage();
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Bazada xatolik.' });
      }
      return res.json(orderWithItems(orderId));
    }
    return res.status(400).json({
      error: "Faqat hold yoki qadoqlangan zakazni 'picked' (navbat) qilish mumkin.",
    });
  }

  /** Zaxiradan ortiqcha zakazlarni Hold ga */
  if (statusStr === 'hold') {
    if (order.status !== 'picked') {
      return res.status(400).json({ error: 'Faqat yig\'ilgan (picked) zakazni hold qilish mumkin.' });
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('hold', orderId);
    return res.json(orderWithItems(orderId));
  }

  if (statusStr !== 'packaged') {
    return res.status(400).json({ error: 'Faqat status = packaged yoki hold qabul qilinadi.' });
  }
  if (order.status !== 'picked') return res.status(400).json({ error: 'Faqat yig\'ilgan buyurtmani qadoqlash mumkin.' });

  try {
    const runPackaged = db.transaction(() => {
      const lines = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
      for (const line of lines) {
        const qty = Number(line.quantity) || 0;
        if (qty <= 0) continue;
        const upd = db
          .prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
          .run(qty, line.product_id, qty);
        if (upd.changes === 0) {
          throw new Error('STOCK');
        }
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('packaged', orderId);
    });
    runPackaged();
  } catch (e) {
    if (e && e.message === 'STOCK') {
      return res.status(400).json({ error: 'Omborda yetarli mahsulot yo‘q. Hold yoki keyinroq urinib ko‘ring.' });
    }
    throw e;
  }

  const updated = orderWithItems(orderId);
  res.json(updated);
});

/** Qadoqlangan, hali kuryer olmagan zakazlarni bitta «yopilgan ro'yxat»ga birlashtiradi — kuryer «Yangi zakazlar»da ko'radi. */
router.post('/close-batch', (req, res) => {
  const packer = getPackerByUser(req.user);
  if (!packer) return res.status(404).json({ error: 'Packer profilingiz topilmadi.' });

  const rows = db
    .prepare(
      `
    SELECT id FROM orders
    WHERE status = 'packaged' AND courier_id IS NULL
      AND packer_id = ? AND packer_batch_id IS NULL
  `
    )
    .all(packer.id);

  if (!rows.length) {
    return res.status(400).json({ error: 'Yopish uchun tayyor zakaz yo\'q (qadoqlangan va kuryer hali olmagan bo\'lishi kerak).' });
  }

  const ins = db.prepare('INSERT INTO packer_closed_batches (packer_staff_id) VALUES (?)').run(packer.id);
  const batchId = ins.lastInsertRowid;
  const upd = db.prepare('UPDATE orders SET packer_batch_id = ? WHERE id = ?');
  for (const r of rows) upd.run(batchId, r.id);

  res.json({ batch_id: batchId, order_ids: rows.map((x) => x.id), count: rows.length });
});

/** Ish haqi balansi (work_roles.total_amount) — picker bilan bir xil mexanizm */
router.get('/balance', (req, res) => {
  const workRole = getPackerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Packer work role topilmadi.', code: 'no_work_role' });
  const balance = Number(workRole.total_amount) || 0;
  res.json({ balance });
});

router.get('/withdrawals', (req, res) => {
  const workRole = getPackerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Packer work role topilmadi.', code: 'no_work_role' });
  const rows = db.prepare(`
    SELECT id, amount, status, payout_method, created_at, reviewed_at, note
    FROM withdrawal_requests
    WHERE work_role_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 50
  `).all(workRole.id);
  res.json({ withdrawals: rows });
});

/** Profil pastki qismi: yig‘ma, jarima/mukofot tarixlari, barcha tranzaksiyalar */
router.get('/finance', (req, res) => {
  const workRole = getPackerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Packer work role topilmadi.', code: 'no_work_role' });

  const wrFresh = db.prepare('SELECT * FROM work_roles WHERE id = ?').get(workRole.id);
  const summary = {
    balance: Number(wrFresh.total_amount) || 0,
    fines_count: Number(wrFresh.fines_count) || 0,
    fine_amount: Number(wrFresh.fine_amount) || 0,
    reward_amount: Number(wrFresh.reward_amount) || 0,
    orders_count: Number(wrFresh.orders_count) || 0,
    badges_count: Number(wrFresh.badges_count) || 0,
    rank_title: wrFresh.rank_title || '',
  };

  const ledgerRows = db
    .prepare(
      `
    SELECT id, kind, amount, title, note, ref_kind, ref_id, created_at
    FROM work_role_ledger_entries
    WHERE work_role_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 500
  `
    )
    .all(workRole.id);

  const fines = ledgerRows.filter((r) => r.kind === 'fine');
  const rewards = ledgerRows.filter((r) => r.kind === 'reward');

  const wrs = db
    .prepare(
      `
    SELECT id, amount, status, payout_method, created_at, reviewed_at, note
    FROM withdrawal_requests
    WHERE work_role_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 100
  `
    )
    .all(workRole.id);

  const transactions = [];
  for (const w of wrs) {
    const pm = w.payout_method === 'card' ? 'card' : 'cash';
    transactions.push({
      category: 'withdrawal',
      id: w.id,
      amount: Number(w.amount) || 0,
      payout_method: pm,
      status: w.status,
      note: w.note,
      created_at: w.created_at,
      reviewed_at: w.reviewed_at,
      sort_at: w.created_at,
    });
  }
  for (const L of ledgerRows) {
    transactions.push({
      category: 'ledger',
      id: L.id,
      kind: L.kind,
      amount: Number(L.amount) || 0,
      title: L.title,
      note: L.note,
      created_at: L.created_at,
      ref_kind: L.ref_kind,
      ref_id: L.ref_id,
      sort_at: L.created_at,
    });
  }

  transactions.sort((a, b) => {
    const ta = new Date(String(a.sort_at || '0').replace(' ', 'T')).getTime();
    const tb = new Date(String(b.sort_at || '0').replace(' ', 'T')).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  res.json({ summary, fines, rewards, transactions });
});

router.post('/withdrawal', (req, res) => {
  const workRole = getPackerWorkRole(req);
  if (!workRole) return res.status(403).json({ error: 'Packer work role topilmadi.', code: 'no_work_role' });
  try {
    const payoutRaw = String(req.body?.payout_method || 'cash').trim().toLowerCase();
    const payoutMethod = payoutRaw === 'card' ? 'card' : 'cash';
    const out = createPendingWithdrawalForWorkRole({ workRoleRow: workRole, amount: req.body?.amount, payoutMethod });
    return res.status(201).json({ ok: true, message: out.message });
  } catch (e) {
    const code = String(e.message || '');
    if (code === 'INVALID_AMOUNT') return res.status(400).json({ error: 'Yaroqli summa kiriting.' });
    if (code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: "Hisobda yetarli mablag' yo'q." });
    console.error('[packer/withdrawal]', e);
    return res.status(500).json({ error: 'Server xatosi.' });
  }
});

export default router;
