import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { applyWithdrawalMarkPaid, applyWithdrawalReview } from '../lib/withdrawalRequestActions.js';

const router = Router();
router.use(authRequired, requireRole('accounting'));

/** Sklad `work_roles` jadvalida packer — `alias` = `wr` / `wr2` … */
function sqlIsPackerWorkRole(alias) {
  return `(
      lower(trim(ifnull(${alias}.portal_role, ''))) = 'packer'
      OR lower(trim(${alias}.role_name)) = 'packer'
      OR lower(trim(${alias}.role_name)) LIKE '%packer%'
      OR lower(trim(${alias}.role_name)) LIKE '%qadoq%'
    )`;
}

function isPackerWorkRoleRow(wr) {
  if (!wr) return false;
  const pr = String(wr.portal_role ?? '').trim().toLowerCase();
  if (pr === 'packer') return true;
  const n = String(wr.role_name ?? '').trim().toLowerCase();
  return n === 'packer' || n.includes('packer') || n.includes('qadoq');
}

const ACCOUNTING_PORTAL_WORK_KINDS = new Set(['picker', 'courier', 'operator', 'seller']);

/** SQL: `kind` whitelist dan keyin interpolyatsiya — faqat shu to‘plam. */
function sqlMatchWorkRoleKind(alias, kind) {
  const a = String(alias);
  if (kind === 'picker') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) = 'picker'
      OR lower(trim(${a}.role_name)) LIKE '%picker%'
      OR lower(trim(${a}.role_name)) LIKE '%yig%uv%'
    )`;
  }
  if (kind === 'courier') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) IN ('courier', 'kuryer')
      OR lower(trim(${a}.role_name)) LIKE '%courier%'
      OR lower(trim(${a}.role_name)) LIKE '%kuryer%'
    )`;
  }
  if (kind === 'operator') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) = 'operator'
      OR lower(trim(${a}.role_name)) LIKE '%operator%'
      OR lower(trim(${a}.role_name)) LIKE '%operat%'
    )`;
  }
  if (kind === 'seller') {
    return `(
      lower(trim(ifnull(${a}.portal_role, ''))) = 'seller'
      OR lower(trim(${a}.role_name)) LIKE '%seller%'
      OR lower(trim(${a}.role_name)) LIKE '%sotuv%'
    )`;
  }
  return '0 = 1';
}

function rowMatchesPortalWorkKind(workRole, kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (!workRole || !ACCOUNTING_PORTAL_WORK_KINDS.has(k)) return false;
  const pr = String(workRole.portal_role ?? '').trim().toLowerCase();
  const rn = String(workRole.role_name ?? '').trim().toLowerCase();
  if (k === 'picker') {
    return pr === 'picker' || rn.includes('picker') || rn.includes('yig') || rn.includes('yiguv');
  }
  if (k === 'courier') {
    return pr === 'courier' || pr === 'kuryer' || rn.includes('courier') || rn.includes('kuryer');
  }
  if (k === 'operator') {
    return pr === 'operator' || rn.includes('operator') || rn.includes('operat');
  }
  if (k === 'seller') {
    return pr === 'seller' || rn.includes('seller') || rn.includes('sotuv');
  }
  return false;
}

/**
 * Buxgalteriya packer ro‘yxati:
 * 1) Faol staff packer + user + mos `work_roles` (ledger bilan bir xil bog‘lanish)
 * 2) Qo‘shimcha: sklad `work_roles` packer qatorlari + `users` (login/email), hatto `staff_members` yo‘q bo‘lsa ham
 *    (superuser bazasida faqat ish rollari ko‘rinishi mumkin).
 * Har bir qator: `list_key` = `wr-<work_role_id>` (noyob), `work_role_id` majburiy.
 */
router.get('/packers', (req, res) => {
  try {
    const staffLinked = db
      .prepare(
        `
      SELECT sm.id AS staff_member_id,
             sm.full_name,
             sm.phone,
             sm.status,
             sm.orders_handled,
             sm.user_id,
             sm.balance,
             sm.created_at,
             u.login AS user_login,
             wr.id AS work_role_id,
             wr.login AS work_role_login,
             wr.role_name AS work_role_name
      FROM staff_members sm
      INNER JOIN users u ON u.id = (
        CASE
          WHEN sm.user_id IS NOT NULL AND sm.user_id > 0 THEN sm.user_id
          ELSE (SELECT u2.id FROM users u2 WHERE u2.staff_member_id = sm.id ORDER BY u2.id DESC LIMIT 1)
        END
      )
      INNER JOIN work_roles wr ON wr.id = (
        SELECT wr2.id
        FROM work_roles wr2
        WHERE wr2.deleted_at IS NULL
          AND (
            (length(trim(ifnull(u.login, ''))) > 0 AND lower(trim(wr2.login)) = lower(trim(u.login)))
            OR (length(trim(ifnull(u.email, ''))) > 0
                AND lower(trim(ifnull(wr2.email, ''))) = lower(trim(ifnull(u.email, ''))))
          )
          AND ${sqlIsPackerWorkRole('wr2')}
      )
      WHERE lower(trim(sm.staff_type)) = 'packer'
        AND lower(trim(COALESCE(sm.status, ''))) = 'active'
    `,
      )
      .all();

    const fromWorkRoles = db
      .prepare(
        `
      SELECT wr.id AS work_role_id,
             wr.login AS work_role_login,
             wr.role_name AS work_role_name,
             u.id AS user_id,
             u.login AS user_login,
             u.full_name AS user_full_name,
             sm.id AS staff_member_id,
             sm.full_name AS staff_full_name,
             sm.phone AS staff_phone,
             sm.status AS staff_status,
             sm.orders_handled AS staff_orders_handled,
             sm.balance AS staff_balance,
             sm.created_at AS staff_created_at
      FROM work_roles wr
      INNER JOIN users u ON (
        (length(trim(ifnull(wr.login, ''))) > 0 AND lower(trim(u.login)) = lower(trim(wr.login)))
        OR (length(trim(ifnull(wr.email, ''))) > 0
            AND lower(trim(ifnull(u.email, ''))) = lower(trim(ifnull(wr.email, ''))))
      )
      LEFT JOIN staff_members sm ON lower(trim(sm.staff_type)) = 'packer'
        AND (sm.user_id = u.id OR u.staff_member_id = sm.id)
      WHERE wr.deleted_at IS NULL
        AND ${sqlIsPackerWorkRole('wr')}
    `,
      )
      .all();

    const seenWr = new Set(staffLinked.map((r) => r.work_role_id));
    const packers = staffLinked.map((r) => ({
      list_key: `wr-${r.work_role_id}`,
      staff_member_id: r.staff_member_id,
      work_role_id: r.work_role_id,
      full_name: r.full_name,
      phone: r.phone,
      status: r.status,
      orders_handled: r.orders_handled,
      balance: r.balance,
      created_at: r.created_at,
      user_id: r.user_id,
      user_login: r.user_login,
      work_role_login: r.work_role_login,
      work_role_name: r.work_role_name,
    }));

    for (const x of fromWorkRoles) {
      if (seenWr.has(x.work_role_id)) continue;
      seenWr.add(x.work_role_id);
      packers.push({
        list_key: `wr-${x.work_role_id}`,
        staff_member_id: x.staff_member_id ?? null,
        work_role_id: x.work_role_id,
        full_name: x.staff_full_name || x.user_full_name || x.work_role_login,
        phone: x.staff_phone || '',
        status: x.staff_status || '—',
        orders_handled: x.staff_orders_handled ?? 0,
        balance: x.staff_balance ?? 0,
        created_at: x.staff_created_at ?? null,
        user_id: x.user_id,
        user_login: x.user_login,
        work_role_login: x.work_role_login,
        work_role_name: x.work_role_name,
      });
    }

    packers.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'uz', { sensitivity: 'base' }));
    res.json({ packers });
  } catch (e) {
    console.error('accounting portal packers', e);
    res.status(500).json({ error: 'Packerlar ro‘yxati yuklanmadi.' });
  }
});

/** Picker / kuryer / operator / seller — sklad `work_roles` + `users` (packerga o‘xshash ro‘yxat). */
router.get('/work-roles/list', (req, res) => {
  const kind = String(req.query.kind || '').trim().toLowerCase();
  if (!ACCOUNTING_PORTAL_WORK_KINDS.has(kind)) {
    return res.status(400).json({ error: 'Noto‘g‘ri kind: picker, courier, operator, seller.' });
  }
  const staffTypeParam = kind === 'courier' ? 'courier' : kind;
  const cond = sqlMatchWorkRoleKind('wr', kind);
  try {
    const rows = db
      .prepare(
        `
      SELECT wr.id AS work_role_id,
             wr.login AS work_role_login,
             wr.role_name AS work_role_name,
             u.id AS user_id,
             u.login AS user_login,
             u.full_name AS user_full_name,
             sm.id AS staff_member_id,
             sm.full_name AS staff_full_name,
             sm.phone AS staff_phone,
             sm.status AS staff_status,
             sm.orders_handled AS staff_orders_handled,
             sm.balance AS staff_balance,
             sm.created_at AS staff_created_at
      FROM work_roles wr
      INNER JOIN users u ON (
        (length(trim(ifnull(wr.login, ''))) > 0 AND lower(trim(u.login)) = lower(trim(wr.login)))
        OR (length(trim(ifnull(wr.email, ''))) > 0
            AND lower(trim(ifnull(u.email, ''))) = lower(trim(ifnull(wr.email, ''))))
      )
      LEFT JOIN staff_members sm ON (
        (sm.user_id = u.id OR u.staff_member_id = sm.id)
        AND lower(trim(sm.staff_type)) = lower(?)
      )
      WHERE wr.deleted_at IS NULL
        AND (${cond})
    `,
      )
      .all(staffTypeParam);

    const workers = rows.map((x) => ({
      list_key: `wr-${x.work_role_id}`,
      staff_member_id: x.staff_member_id ?? null,
      work_role_id: x.work_role_id,
      full_name: x.staff_full_name || x.user_full_name || x.work_role_login,
      phone: x.staff_phone || '',
      status: x.staff_status || '—',
      orders_handled: x.staff_orders_handled ?? 0,
      balance: x.staff_balance ?? 0,
      created_at: x.staff_created_at ?? null,
      user_id: x.user_id,
      user_login: x.user_login,
      work_role_login: x.work_role_login,
      work_role_name: x.work_role_name,
    }));
    workers.sort((a, b) =>
      String(a.full_name || '').localeCompare(String(b.full_name || ''), 'uz', { sensitivity: 'base' }),
    );
    res.json({ workers });
  } catch (e) {
    console.error('accounting portal work-roles list', e);
    res.status(500).json({ error: 'Ro‘yxat yuklanmadi.' });
  }
});

/** Hisobot: `work_role_id` + bo‘lim `kind` (ledger / yechishlar packer bilan bir xil mexanizm). */
router.get('/work-roles/report', (req, res) => {
  const kind = String(req.query.kind || '').trim().toLowerCase();
  if (!ACCOUNTING_PORTAL_WORK_KINDS.has(kind)) {
    return res.status(400).json({ error: 'Noto‘g‘ri kind.' });
  }
  const workRoleId = Number.parseInt(String(req.query.work_role_id ?? ''), 10);
  if (!Number.isFinite(workRoleId) || workRoleId < 1) {
    return res.status(400).json({ error: '`work_role_id` kerak (musbat butun son).' });
  }
  const { days, daysStr } = parseReportDays(req);
  try {
    const workRole = db.prepare(`SELECT * FROM work_roles WHERE id = ? AND deleted_at IS NULL`).get(workRoleId);
    if (!workRole) {
      return res.status(404).json({ error: 'Ish roli topilmadi yoki o‘chirilgan.' });
    }
    if (!rowMatchesPortalWorkKind(workRole, kind)) {
      return res.status(400).json({ error: 'Bu ish roli tanlangan bo‘limga tegishli emas.' });
    }
    res.json(buildPackerFinancialPayload(workRole, null, days, daysStr));
  } catch (e) {
    console.error('accounting portal work-roles report', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

/** Packer `staff_members` → `users` (`user_id` yoki `staff_member_id`) → `work_roles`. */
function resolvePackerWorkRoleForStaffMemberId(staffMemberId) {
  const sm = db
    .prepare(`SELECT * FROM staff_members WHERE id = ? AND lower(trim(staff_type)) = 'packer'`)
    .get(staffMemberId);
  if (!sm) return { error: 'Packer topilmadi.', status: 404 };

  let user = null;
  if (sm.user_id != null && Number(sm.user_id) > 0) {
    user = db.prepare(`SELECT id, login, email FROM users WHERE id = ?`).get(sm.user_id);
  }
  if (!user) {
    user = db.prepare(`SELECT id, login, email FROM users WHERE staff_member_id = ? ORDER BY id DESC LIMIT 1`).get(
      staffMemberId,
    );
  }
  if (!user) return { staff: sm, workRole: null, linkedUser: null };

  const login = String(user.login || '').trim();
  const email = String(user.email || '').trim();
  if (!login && !email) return { staff: sm, workRole: null, linkedUser: user };
  const wr = db
    .prepare(
      `
    SELECT * FROM work_roles
    WHERE deleted_at IS NULL
      AND (lower(trim(login)) = lower(trim(?)) OR lower(trim(ifnull(email, ''))) = lower(trim(?)))
      AND (
        lower(trim(ifnull(portal_role, ''))) = 'packer'
        OR lower(trim(role_name)) = 'packer'
        OR lower(trim(role_name)) LIKE '%packer%'
        OR lower(trim(role_name)) LIKE '%qadoq%'
      )
    ORDER BY id DESC
    LIMIT 1
  `,
    )
    .get(login, email || '');
  return { staff: sm, workRole: wr || null, linkedUser: user };
}

function ledgerKindLabelUz(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'fine') return 'Jarima';
  if (k === 'reward') return 'Mukofot';
  if (k === 'balance_set') return 'Balans belgilash';
  return kind || 'Operatsiya';
}

function buildPackerFinancialPayload(workRole, staff, days, daysStr) {
  const ledger = db
    .prepare(
      `
      SELECT id, kind, amount, title, note, ref_kind, ref_id, created_at
      FROM work_role_ledger_entries
      WHERE work_role_id = ?
        AND datetime(replace(trim(created_at), 'T', ' ')) >= datetime('now', '-' || ? || ' days')
      ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
    `,
    )
    .all(workRole.id, daysStr);

  const withdrawals = db
    .prepare(
      `
      SELECT id, amount, status, payout_method, note, created_at, reviewed_at, paid_out_at
      FROM withdrawal_requests
      WHERE work_role_id = ?
        AND datetime(replace(trim(created_at), 'T', ' ')) >= datetime('now', '-' || ? || ' days')
      ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
    `,
    )
    .all(workRole.id, daysStr);

  let rewardTotal = 0;
  let fineTotal = 0;
  const timeline = [];

  for (const L of ledger) {
    const k = String(L.kind || '').toLowerCase();
    const raw = Math.abs(Number(L.amount) || 0);
    if (k === 'reward') rewardTotal += raw;
    if (k === 'fine') fineTotal += raw;
    let signed = Number(L.amount) || 0;
    if (k === 'fine') signed = -Math.abs(signed);
    if (k === 'reward') signed = Math.abs(signed);
    timeline.push({
      source: 'ledger',
      id: L.id,
      kind: L.kind,
      kind_label: ledgerKindLabelUz(L.kind),
      signed_amount: signed,
      title: L.title || '',
      note: L.note || '',
      created_at: L.created_at,
      display_at: L.created_at,
      sort_at: L.created_at,
      payout_method: null,
      withdrawal_status: null,
      paid_out_at: null,
    });
  }

  let withdrawalPaidTotal = 0;
  for (const w of withdrawals) {
    const amt = Math.abs(Number(w.amount) || 0);
    const paid = w.paid_out_at != null && String(w.paid_out_at).trim() !== '';
    if (paid) withdrawalPaidTotal += amt;
    const sortAt = w.paid_out_at || w.reviewed_at || w.created_at;
    const displayAt = w.paid_out_at || w.reviewed_at || w.created_at;
    timeline.push({
      source: 'withdrawal',
      id: w.id,
      kind: 'withdrawal',
      kind_label: 'Pul yechish',
      signed_amount: -amt,
      title: 'Pul yechish so‘rovi',
      note: w.note || '',
      created_at: w.created_at,
      display_at: displayAt,
      sort_at: sortAt,
      payout_method: w.payout_method || '',
      withdrawal_status: w.status,
      paid_out_at: w.paid_out_at || null,
    });
  }

  timeline.sort((a, b) => {
    const sa = String(a.sort_at || '');
    const sb = String(b.sort_at || '');
    if (sa !== sb) return sb.localeCompare(sa);
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  const pendingRow = db
    .prepare(
      `
    SELECT COALESCE(SUM(ABS(amount)), 0) AS s
    FROM withdrawal_requests
    WHERE work_role_id = ?
      AND lower(trim(COALESCE(status, ''))) = 'pending'
  `,
    )
    .get(workRole.id);
  const pendingWithdrawals = Number(pendingRow?.s) || 0;
  const totalAmt = Number(workRole.total_amount) || 0;

  return {
    staff: staff || null,
    work_role: {
      id: workRole.id,
      login: workRole.login,
      email: workRole.email,
      total_amount: workRole.total_amount,
      role_name: workRole.role_name,
      reward_amount: workRole.reward_amount,
      fine_amount: workRole.fine_amount,
    },
    period_days: days,
    timeline,
    balances: {
      /** Sklad `work_roles.total_amount` — hozirgi jami balans */
      total_amount: totalAmt,
      /** Tasdiqlanmagan yechishlar (pending) */
      pending_withdrawal_total: pendingWithdrawals,
      /** Kutilayotgan yechishlar chiqarilgach taxminiy qolgan */
      remaining_after_pending: totalAmt - pendingWithdrawals,
    },
    summary: {
      reward_total: rewardTotal,
      fine_total: fineTotal,
      withdrawal_paid_total: withdrawalPaidTotal,
      ledger_rows: ledger.length,
      withdrawal_rows: withdrawals.length,
    },
  };
}

function parseReportDays(req) {
  let days = Number.parseInt(String(req.query.days ?? '30'), 10);
  if (!Number.isFinite(days) || days < 1) days = 30;
  if (days > 366) days = 366;
  return { days, daysStr: String(days) };
}

/** Hisobot: to‘g‘ridan-to‘g‘ri `work_role_id` (sklad packer roli) — staff bo‘lmasa ham ishlaydi. */
router.get('/packers/report', (req, res) => {
  const workRoleId = Number.parseInt(String(req.query.work_role_id ?? ''), 10);
  if (!Number.isFinite(workRoleId) || workRoleId < 1) {
    return res.status(400).json({ error: '`work_role_id` kerak (musbat butun son).' });
  }
  const { days, daysStr } = parseReportDays(req);

  try {
    const workRole = db.prepare(`SELECT * FROM work_roles WHERE id = ? AND deleted_at IS NULL`).get(workRoleId);
    if (!workRole) {
      return res.status(404).json({ error: 'Ish roli topilmadi yoki o‘chirilgan.' });
    }
    if (!isPackerWorkRoleRow(workRole)) {
      return res.status(400).json({ error: 'Bu qator packer ish roli emas.' });
    }

    const user = db
      .prepare(
        `
      SELECT id, login, email, full_name, staff_member_id
      FROM users
      WHERE
        (length(trim(ifnull(?, ''))) > 0 AND lower(trim(login)) = lower(trim(?)))
        OR (length(trim(ifnull(?, ''))) > 0 AND lower(trim(ifnull(email, ''))) = lower(trim(?)))
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get(
        workRole.login,
        workRole.login,
        workRole.email || '',
        workRole.email || '',
      );

    let staff = null;
    if (user?.id) {
      const sid = user.staff_member_id != null && Number(user.staff_member_id) > 0 ? user.staff_member_id : null;
      if (sid != null) {
        staff =
          db
            .prepare(
              `
        SELECT * FROM staff_members
        WHERE lower(trim(staff_type)) = 'packer'
          AND (user_id = ? OR id = ?)
        ORDER BY CASE WHEN lower(trim(COALESCE(status, ''))) = 'active' THEN 0 ELSE 1 END, id DESC
        LIMIT 1
      `,
            )
            .get(user.id, sid) || null;
      } else {
        staff =
          db
            .prepare(
              `
        SELECT * FROM staff_members
        WHERE lower(trim(staff_type)) = 'packer' AND user_id = ?
        ORDER BY CASE WHEN lower(trim(COALESCE(status, ''))) = 'active' THEN 0 ELSE 1 END, id DESC
        LIMIT 1
      `,
            )
            .get(user.id) || null;
      }
    }

    res.json(buildPackerFinancialPayload(workRole, staff, days, daysStr));
  } catch (e) {
    console.error('accounting portal packer report (work_role_id)', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

/**
 * Hisobot: `staff_members.id` (oldingi API) — ichida `work_role_id` aniqlanadi.
 * Yangi klientlar: `GET /packers/report?work_role_id=…`.
 */
router.get('/packers/:staffId/report', (req, res) => {
  const staffId = Number.parseInt(req.params.staffId, 10);
  if (!Number.isFinite(staffId) || staffId < 1) {
    return res.status(400).json({ error: 'Noto‘g‘ri packer ID.' });
  }
  const { days, daysStr } = parseReportDays(req);

  try {
    const resolved = resolvePackerWorkRoleForStaffMemberId(staffId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { staff, workRole, linkedUser } = resolved;

    if (String(staff.status || '').trim().toLowerCase() !== 'active') {
      return res.status(404).json({
        error:
          'Bu packer faol emas. Faqat faol va sklad «packer» ish roli bilan biriktirilgan xodimlar hisoboti ko‘rinadi.',
      });
    }
    if (!linkedUser) {
      return res.status(404).json({
        error:
          'Packer akkaunti topilmadi. Admin panelida `staff_members.user_id` yoki `users.staff_member_id` orqali packer biriktiring.',
      });
    }
    if (!workRole) {
      return res.status(404).json({
        error:
          'Sklad «packer» ish roli (work_roles) topilmadi: user login/email bilan mos qator va `portal_role`/nom bo‘yicha packer belgilangan bo‘lishi kerak.',
      });
    }

    res.json(buildPackerFinancialPayload(workRole, staff, days, daysStr));
  } catch (e) {
    console.error('accounting portal packer report', e);
    res.status(500).json({ error: 'Hisobot yuklanmadi.' });
  }
});

router.get('/notifications', (req, res) => {
  const list = db
    .prepare(
      `
    SELECT id, title, body, created_at, read_at, link_type, link_id
    FROM user_notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `,
    )
    .all(req.user.id);
  res.json({ notifications: list });
});

router.patch('/notifications/:id/read', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  db.prepare(`
    UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);
  res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String(req.body?.status || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim();
  const result = applyWithdrawalReview({
    reviewerUserId: req.user.id,
    withdrawalId: id,
    status,
    note,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

router.patch('/withdrawal-requests/:id/mark-paid', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = applyWithdrawalMarkPaid({ payerUserId: req.user.id, withdrawalId: id });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
