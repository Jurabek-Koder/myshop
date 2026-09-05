import React from 'react';
import { statusLabel } from '../i18n/uz.js';

const MAP = {
  paid: 'ok',
  pending: 'warn',
  overdue: 'danger',
  draft: 'muted',
  approved: 'info',
};

export default function StatusBadge({ status }) {
  const key = String(status || 'pending').toLowerCase();
  const mod = MAP[key] || 'muted';
  return <span className={`ap-status ap-status--${mod}`}>{statusLabel[key] || key}</span>;
}
