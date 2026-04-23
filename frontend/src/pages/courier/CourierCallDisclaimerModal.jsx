import React, { useEffect, useRef, useState } from 'react';

/**
 * Mijoz raqamiga chiqishdan oldin: ogohlantirish + 3 s kutish, qayd yaratish, keyin tel:.
 */
export default function CourierCallDisclaimerModal({ open, orderId, tel, t, request, onClose }) {
  const [secondsLeft, setSecondsLeft] = useState(3);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !orderId || !tel) return undefined;

    setSecondsLeft(3);
    void request('/courier/call-logs', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }).catch(() => {});

    const t1 = window.setTimeout(() => setSecondsLeft(2), 1000);
    const t2 = window.setTimeout(() => setSecondsLeft(1), 2000);
    const t3 = window.setTimeout(() => {
      onCloseRef.current?.();
      window.location.href = `tel:${tel}`;
    }, 3000);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [open, orderId, tel, request]);

  if (!open) return null;

  return (
    <div className="picker-modal-overlay" role="presentation">
      <div
        className="picker-modal courier-call-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="courier-call-modal-title"
      >
        <h2 id="courier-call-modal-title" className="picker-modal-title">
          {t.courierCallModalTitle}
        </h2>
        <p className="picker-modal-hint">{t.courierCallModalBody}</p>
        <p className="courier-call-modal-countdown" aria-live="polite">
          {t.courierCallModalWait.replace('{n}', String(secondsLeft))}
        </p>
      </div>
    </div>
  );
}
