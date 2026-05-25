import React from 'react';
import { uz } from '../i18n/uz.js';
import { formatUzs, formatDateUz } from '../utils/formatUzs.js';

export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;
  return (
    <div className="ap-modal-bg" role="dialog" aria-modal="true">
      <div className="ap-modal ap-modal--wide">
        <h3>{uz.payroll.receipt}</h3>
        <div className="ap-receipt" id="ap-receipt-print">
          <p className="ap-receipt-brand">MyShop — Buxgalteriya</p>
          <p>
            <strong>Ref:</strong> {receipt.receipt_ref}
          </p>
          <p>
            <strong>Xodim:</strong> {receipt.employee_name} ({receipt.employee_login})
          </p>
          <p>
            <strong>Turi:</strong> {receipt.payment_type_label}
          </p>
          <p>
            <strong>Summa:</strong> {formatUzs(receipt.amount_uzs)}
          </p>
          <p>
            <strong>Muddat:</strong> {formatDateUz(receipt.due_date)}
          </p>
          {receipt.paid_at ? (
            <p>
              <strong>To‘langan:</strong> {new Date(receipt.paid_at).toLocaleString('uz-UZ')}
            </p>
          ) : null}
        </div>
        <div className="ap-modal-actions">
          <button type="button" className="ap-btn" onClick={() => window.print()}>
            {uz.payroll.printReceipt}
          </button>
          <button type="button" className="ap-btn ap-btn--primary" onClick={onClose}>
            {uz.close}
          </button>
        </div>
      </div>
    </div>
  );
}
