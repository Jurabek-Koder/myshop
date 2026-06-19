import { db } from '../db/database.js';

export function ledgerKindLabelUz(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'fine') return 'Jarima';
  if (k === 'reward') return 'Mukofot';
  if (k === 'balance_set') return 'Balans belgilash';
  if (k === 'earning') return 'Ish haqi / ulush';
  if (k === 'withdrawal') return 'Pul yechish';
  return kind || 'Operatsiya';
}

function sortByDateDesc(a, b) {
  const ta = new Date(String(a.sort_at || '0').replace(' ', 'T')).getTime();
  const tb = new Date(String(b.sort_at || '0').replace(' ', 'T')).getTime();
  return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
}

function ledgerSql(workRoleId, { limit = 500, days = null } = {}) {
  if (days != null && Number.isFinite(days) && days > 0) {
    return {
      sql: `
        SELECT id, kind, amount, title, note, ref_kind, ref_id, created_at
        FROM work_role_ledger_entries
        WHERE work_role_id = ?
          AND datetime(replace(trim(created_at), 'T', ' ')) >= datetime('now', '-' || ? || ' days')
        ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
        LIMIT ?
      `,
      params: [workRoleId, String(days), limit],
    };
  }
  return {
    sql: `
      SELECT id, kind, amount, title, note, ref_kind, ref_id, created_at
      FROM work_role_ledger_entries
      WHERE work_role_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `,
    params: [workRoleId, limit],
  };
}

function withdrawalsSql(workRoleId, { limit = 100, days = null } = {}) {
  if (days != null && Number.isFinite(days) && days > 0) {
    return {
      sql: `
        SELECT id, amount, status, payout_method, note, created_at, reviewed_at, paid_out_at
        FROM withdrawal_requests
        WHERE work_role_id = ?
          AND datetime(replace(trim(created_at), 'T', ' ')) >= datetime('now', '-' || ? || ' days')
        ORDER BY datetime(replace(trim(created_at), 'T', ' ')) DESC, id DESC
        LIMIT ?
      `,
      params: [workRoleId, String(days), limit],
    };
  }
  return {
    sql: `
      SELECT id, amount, status, payout_method, note, created_at, reviewed_at, paid_out_at
      FROM withdrawal_requests
      WHERE work_role_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `,
    params: [workRoleId, limit],
  };
}

export function fetchLedgerRows(workRoleId, options = {}) {
  const { sql, params } = ledgerSql(workRoleId, options);
  return db.prepare(sql).all(...params);
}

export function fetchWithdrawalRows(workRoleId, options = {}) {
  const { sql, params } = withdrawalsSql(workRoleId, options);
  return db.prepare(sql).all(...params);
}

export function fetchOperatorEarnings(operatorId, limit = 200) {
  return db
    .prepare(
      `
    SELECT oe.id, oe.order_id, oe.amount, oe.created_at
    FROM operator_earnings oe
    WHERE oe.operator_id = ?
    ORDER BY oe.created_at DESC
    LIMIT ?
  `,
    )
    .all(operatorId, limit);
}

export function buildOperatorEarningTransactions(earnings = []) {
  return earnings.map((e) => ({
    category: 'earning',
    id: e.id,
    kind: 'earning',
    amount: Number(e.amount) || 0,
    order_id: e.order_id,
    title: e.order_id ? `Zakaz #${e.order_id} ulushi` : 'Operator ulushi',
    note: '',
    created_at: e.created_at,
    sort_at: e.created_at,
  }));
}

export function buildStaffTransactions(ledgerRows, withdrawalRows, extraRows = []) {
  const transactions = [];

  for (const w of withdrawalRows) {
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
      paid_out_at: w.paid_out_at || null,
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

  for (const row of extraRows) {
    transactions.push(row);
  }

  transactions.sort(sortByDateDesc);
  return transactions;
}

export function buildAccountingTimeline(ledgerRows, withdrawalRows, extraRows = []) {
  const timeline = [];

  for (const L of ledgerRows) {
    const k = String(L.kind || '').toLowerCase();
    const raw = Math.abs(Number(L.amount) || 0);
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

  for (const w of withdrawalRows) {
    const amt = Math.abs(Number(w.amount) || 0);
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

  for (const row of extraRows) {
    const amt = Math.abs(Number(row.amount) || 0);
    timeline.push({
      source: row.category || 'earning',
      id: row.id,
      kind: row.kind || row.category || 'earning',
      kind_label: ledgerKindLabelUz(row.kind || row.category),
      signed_amount: amt,
      title: row.title || '',
      note: row.note || '',
      created_at: row.created_at,
      display_at: row.created_at,
      sort_at: row.sort_at || row.created_at,
      payout_method: null,
      withdrawal_status: null,
      paid_out_at: null,
      order_id: row.order_id ?? null,
    });
  }

  timeline.sort((a, b) => {
    const sa = String(a.sort_at || '');
    const sb = String(b.sort_at || '');
    if (sa !== sb) return sb.localeCompare(sa);
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  return timeline;
}

export function buildWorkRoleSummary(workRoleRow) {
  const wr = workRoleRow || {};
  return {
    balance: Number(wr.total_amount) || 0,
    fines_count: Number(wr.fines_count) || 0,
    fine_amount: Number(wr.fine_amount) || 0,
    reward_amount: Number(wr.reward_amount) || 0,
    orders_count: Number(wr.orders_count) || 0,
    badges_count: Number(wr.badges_count) || 0,
    rank_title: wr.rank_title || '',
  };
}

export function buildWorkRoleFinancePayload(workRole, options = {}) {
  const wrFresh =
    workRole?.id != null
      ? db.prepare('SELECT * FROM work_roles WHERE id = ?').get(workRole.id) || workRole
      : workRole;

  const ledgerRows = fetchLedgerRows(wrFresh.id, options);
  const withdrawalRows = fetchWithdrawalRows(wrFresh.id, options);

  let extraRows = [];
  let earnings = [];
  if (options.operatorId) {
    earnings = fetchOperatorEarnings(options.operatorId, options.earningLimit ?? 200);
    extraRows = buildOperatorEarningTransactions(earnings);
  }

  const fines = ledgerRows.filter((r) => r.kind === 'fine');
  const rewards = ledgerRows.filter((r) => r.kind === 'reward');
  const transactions = buildStaffTransactions(ledgerRows, withdrawalRows, extraRows);
  const timeline = buildAccountingTimeline(ledgerRows, withdrawalRows, extraRows);
  const summary = buildWorkRoleSummary(wrFresh);

  if (options.operatorId) {
    const soldAgg = db
      .prepare(
        `
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
      FROM operator_earnings WHERE operator_id = ?
    `,
      )
      .get(options.operatorId);
    summary.sold_total = Number(soldAgg?.total) || 0;
    summary.sold_count = Number(soldAgg?.cnt) || 0;
    summary.has_work_role = true;
  }

  return {
    summary,
    fines,
    rewards,
    transactions,
    timeline,
    withdrawals: withdrawalRows,
    earnings,
  };
}

/** Buxgalteriya hisobot — `accountingPortal` bilan mos */
export function buildPackerFinancialPayload(workRole, staff, days, daysStr) {
  const ledger = fetchLedgerRows(workRole.id, { days, limit: 5000 });
  const withdrawals = fetchWithdrawalRows(workRole.id, { days, limit: 5000 });

  let rewardTotal = 0;
  let fineTotal = 0;
  const timeline = buildAccountingTimeline(ledger, withdrawals);

  for (const L of ledger) {
    const k = String(L.kind || '').toLowerCase();
    const raw = Math.abs(Number(L.amount) || 0);
    if (k === 'reward') rewardTotal += raw;
    if (k === 'fine') fineTotal += raw;
  }

  let withdrawalPaidTotal = 0;
  for (const w of withdrawals) {
    const amt = Math.abs(Number(w.amount) || 0);
    const paid = w.paid_out_at != null && String(w.paid_out_at).trim() !== '';
    if (paid) withdrawalPaidTotal += amt;
  }

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
      total_amount: totalAmt,
      pending_withdrawal_total: pendingWithdrawals,
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
