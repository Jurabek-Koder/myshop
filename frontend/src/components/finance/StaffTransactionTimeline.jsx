import React from 'react';
import { formatDateTimeUzCompact, toIso8601DateTimeAttr } from '../../utils/uzbekistanTime.js';
import './StaffTransactionTimeline.css';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} so'm`;
}

function formatWhen(value) {
  return formatDateTimeUzCompact(value, { empty: '—' });
}

function ledgerKindUz(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'fine') return 'Jarima';
  if (k === 'reward') return 'Mukofot';
  if (k === 'balance_set') return 'Balans / oylik';
  if (k === 'earning') return 'Ish haqi / ulush';
  return k || '—';
}

function withdrawStatusUz(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'To\'langan';
  if (s === 'awaiting_payout') return 'To\'lov kutilmoqda';
  if (s === 'approved') return 'Tasdiqlandi';
  if (s === 'rejected') return 'Rad etildi';
  if (s === 'pending') return 'Superuser tasdiqi kutilmoqda';
  return status || '—';
}

function StaffFinanceTxCard({
  variant,
  kindLabel,
  when,
  dateTime,
  body,
  metaPrimary,
  metaSecondary,
  withdrawStatus,
  amountText,
  amountTone = 'neutral',
}) {
  const cardClass = `staff-finance-tx-card staff-finance-tx-card--${variant}`;
  const sumClass = `staff-finance-tx-sum staff-finance-tx-sum--${amountTone}`;
  const bodyStr = body && String(body).trim() ? String(body).trim() : '—';
  const WhenEl = dateTime ? (
    <time className="staff-finance-tx-when" dateTime={dateTime}>
      {when}
    </time>
  ) : (
    <span className="staff-finance-tx-when">{when}</span>
  );
  const metaPrimaryNode =
    metaPrimary && withdrawStatus ? (
      <span className={`staff-finance-tx-badge staff-finance-tx-badge--${withdrawStatus}`}>{metaPrimary}</span>
    ) : metaPrimary ? (
      <span className="staff-finance-tx-meta">{metaPrimary}</span>
    ) : null;

  return (
    <li className={cardClass}>
      <div className="staff-finance-tx-row">
        <div className="staff-finance-tx-main">
          <span className="staff-finance-tx-kind">{kindLabel}</span>
          <span className="staff-finance-tx-rule" aria-hidden />
          {WhenEl}
          <span className="staff-finance-tx-rule" aria-hidden />
          <span className="staff-finance-tx-body" title={bodyStr}>
            {bodyStr}
          </span>
        </div>
        <div className="staff-finance-tx-trail">
          {metaPrimary || metaSecondary ? (
            <span className="staff-finance-tx-meta-wrap">
              {metaPrimaryNode}
              {metaSecondary ? <span className="staff-finance-tx-meta-secondary">{metaSecondary}</span> : null}
            </span>
          ) : null}
          <span className={sumClass}>{amountText}</span>
        </div>
      </div>
    </li>
  );
}

function mapTransactionRow(row) {
  if (row.category === 'withdrawal') {
    const pm = row.payout_method === 'card' ? 'Karta' : 'Naqd';
    return (
      <StaffFinanceTxCard
        key={`w-${row.id}`}
        variant="withdrawal"
        kindLabel="Pul yechish"
        when={formatWhen(row.created_at)}
        dateTime={toIso8601DateTimeAttr(row.created_at)}
        body={row.note || 'Hisobdan yechish'}
        metaPrimary={withdrawStatusUz(row.status)}
        metaSecondary={pm}
        withdrawStatus={String(row.status || 'pending')}
        amountText={formatCurrency(row.amount)}
        amountTone="neutral"
      />
    );
  }

  if (row.category === 'earning') {
    return (
      <StaffFinanceTxCard
        key={`e-${row.id}`}
        variant="earning"
        kindLabel="Ish haqi / ulush"
        when={formatWhen(row.created_at)}
        dateTime={toIso8601DateTimeAttr(row.created_at)}
        body={row.title || (row.order_id ? `Zakaz #${row.order_id}` : 'Ulush')}
        amountText={`+${formatCurrency(row.amount)}`}
        amountTone="credit"
      />
    );
  }

  const isFine = row.kind === 'fine';
  const isRew = row.kind === 'reward';
  const sign = isFine ? '−' : isRew ? '+' : '';
  const tone = isFine ? 'debit' : isRew ? 'credit' : 'neutral';
  const v = isFine ? 'fine' : isRew ? 'reward' : 'ledger';
  return (
    <StaffFinanceTxCard
      key={`l-${row.id}`}
      variant={v}
      kindLabel={ledgerKindUz(row.kind)}
      when={formatWhen(row.created_at)}
      dateTime={toIso8601DateTimeAttr(row.created_at)}
      body={row.note || row.title || '—'}
      amountText={`${sign}${formatCurrency(row.amount)}`}
      amountTone={tone}
    />
  );
}

export default function StaffTransactionTimeline({
  transactions = [],
  title = 'Tranzaksiyalar tarixi',
  emptyText = 'Hozircha tranzaksiya yo‘q',
  className = '',
}) {
  const list = Array.isArray(transactions) ? transactions : [];

  return (
    <section className={`staff-finance-timeline ${className}`.trim()} aria-labelledby="staff-finance-timeline-title">
      <h4 id="staff-finance-timeline-title" className="staff-finance-timeline-title">
        {title}
      </h4>
      {list.length === 0 ? (
        <div className="staff-finance-tx-empty" role="status">
          {emptyText}
        </div>
      ) : (
        <ul className="staff-finance-tx-list" aria-label={title}>
          {list.map((row) => mapTransactionRow(row))}
        </ul>
      )}
    </section>
  );
}
