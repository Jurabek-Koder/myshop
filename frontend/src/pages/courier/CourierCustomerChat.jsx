import React, { useEffect, useRef, useState } from 'react';
import CourierCallDisclaimerModal from './CourierCallDisclaimerModal';

/**
 * Kuryer — biriktirilgan buyurtmalar: har biri alohida kartada.
 * Mijoz telefon raqami ko‘rinmaydi; «Mijoz» — modal → 3 s → tel:; «Sotildi» yo‘lda holatda.
 */
export default function CourierCustomerChat({
  t,
  orders,
  loading,
  loadError = '',
  focusOrderId = null,
  busyOrderId = null,
  request,
  onRefresh,
  onMarkBlocked,
  onMarkCancelled,
  onMarkDelivered,
  onReturnTest,
  formatCurrency,
  formatDateTime,
  statusLabels,
}) {
  const list = Array.isArray(orders) ? orders : [];
  const cardRefs = useRef({});
  const [callModal, setCallModal] = useState(null);

  useEffect(() => {
    if (focusOrderId == null || !list.length) return;
    const id = Number(focusOrderId);
    const el = cardRefs.current[id];
    if (!el) return;
    const tmr = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(tmr);
  }, [focusOrderId, list]);

  const closeCallModal = () => setCallModal(null);

  return (
    <section
      className="picker-lichka picker-lichka--flex-mount courier-customer-chat-page"
      aria-label={t.courierCustomerChatRegionAria}
    >
      <CourierCallDisclaimerModal
        open={callModal != null}
        orderId={callModal?.orderId}
        tel={callModal?.tel}
        t={t}
        request={request}
        onClose={closeCallModal}
      />

      {loadError ? (
        <div className="picker-error courier-customer-chat-error" role="alert">
          {loadError}
        </div>
      ) : null}

      {loading && list.length === 0 && !loadError ? (
        <p className="picker-lichka-loading">{t.loading}</p>
      ) : null}

      {!loading && !loadError && list.length === 0 ? (
        <p className="picker-lichka-empty-thread">{t.courierCustomerChatEmpty}</p>
      ) : null}

      {list.length > 0 ? (
        <div className="picker-list courier-customer-orders-list">
          {list.map((o) => {
            const tel = String(o.contact_phone || '').trim();
            const canCall = tel.length > 0;
            const statusLabel = statusLabels[o.status] || o.status;
            const isFocus = focusOrderId != null && Number(focusOrderId) === Number(o.id);
            const canMarkSold = ['assigned', 'picked_up', 'on_the_way'].includes(o.status) && onMarkDelivered;
            const canMarkCancelled =
              ['assigned', 'picked_up', 'on_the_way'].includes(o.status) && typeof onMarkCancelled === 'function';
            const canMarkLater =
              ['assigned', 'picked_up', 'on_the_way'].includes(o.status) && typeof onMarkBlocked === 'function';
            const showReturnTest =
              Number(o.is_test) === 1 &&
              ['assigned', 'picked_up', 'on_the_way'].includes(o.status) &&
              typeof onReturnTest === 'function';
            return (
              <article
                key={String(o.id)}
                ref={(el) => {
                  cardRefs.current[o.id] = el;
                }}
                className={`picker-card courier-customer-order-card${isFocus ? ' courier-customer-order-card--focus' : ''}`}
              >
                <div className="picker-card-header courier-customer-order-card-head">
                  <span className="picker-card-id">
                    #{o.id}
                    {Number(o.is_test) === 1 ? (
                      <span className="courier-test-badge courier-test-badge--inline" title={t.courierTestBadgeHint}>
                        {t.courierTestBadge}
                      </span>
                    ) : null}
                  </span>
                  <span className={`courier-status-pill courier-status-${o.status}`}>{statusLabel}</span>
                  <span className="picker-card-date">{formatCurrency(o.total_amount)}</span>
                </div>
                <div className="picker-card-body">
                  <div className="picker-row">
                    <span className="picker-label">{t.orderAddress}</span>
                    <span className="picker-value picker-address">{o.shipping_address || '—'}</span>
                  </div>
                  <div className="picker-row">
                    <span className="picker-label">{t.courierCustomerChatOrderTime}</span>
                    <span className="picker-value">{formatDateTime(o.created_at)}</span>
                  </div>
                  {o.items?.length > 0 ? (
                    <div className="picker-items-block">
                      <span className="picker-label">{t.courierCustomerChatItemsLabel}</span>
                      <ul className="picker-items">
                        {o.items.map((it) => (
                          <li key={it.id}>
                            {it.name_uz} × {it.quantity}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="picker-card-footer courier-customer-order-footer">
                  <div className="courier-customer-circle-actions">
                    <button
                      type="button"
                      className="courier-circle-btn courier-circle-btn--sold"
                      disabled={busyOrderId === o.id || !canMarkSold}
                      onClick={() => onMarkDelivered?.(o.id)}
                    >
                      {busyOrderId === o.id ? (
                        '…'
                      ) : (
                        <>
                          <span className="courier-circle-btn-icon" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="courier-circle-btn-label">Sotildi</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="courier-circle-btn courier-circle-btn--cancel"
                      disabled={busyOrderId === o.id || !canMarkCancelled}
                      onClick={() => onMarkCancelled?.(o.id)}
                    >
                      {busyOrderId === o.id ? (
                        '…'
                      ) : (
                        <>
                          <span className="courier-circle-btn-icon" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="courier-circle-btn-label">Bekor</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="courier-circle-btn courier-circle-btn--later"
                      disabled={busyOrderId === o.id || !canMarkLater}
                      onClick={() => onMarkBlocked?.(o.id)}
                    >
                      {busyOrderId === o.id ? (
                        '…'
                      ) : (
                        <>
                          <span className="courier-circle-btn-icon" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.3" />
                              <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="courier-circle-btn-label">Keyin</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="courier-circle-btn courier-circle-btn--call"
                      disabled={busyOrderId === o.id || !canCall}
                      aria-label={t.courierCustomerCallAria}
                      onClick={() => setCallModal({ orderId: o.id, tel })}
                    >
                      <span className="courier-circle-btn-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M7.5 4.5h2.6l1.2 4.2-1.8 1.8a14.9 14.9 0 0 0 4 4l1.8-1.8 4.2 1.2v2.6a1.5 1.5 0 0 1-1.5 1.5A13.5 13.5 0 0 1 4.5 6a1.5 1.5 0 0 1 1.5-1.5z"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="courier-circle-btn-label">Qungiroq</span>
                    </button>
                    <button
                      type="button"
                      className="courier-circle-btn courier-circle-btn--warehouse"
                      disabled={busyOrderId === o.id || !showReturnTest}
                      onClick={() => onReturnTest?.(o.id)}
                    >
                      <span className="courier-circle-btn-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M4 7.5V16.5L12 21l8-4.5V7.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M12 12v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span className="courier-circle-btn-label">Skladga</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loadError ? (
        <p className="picker-lichka-empty-thread courier-customer-chat-hint-footer">
          {t.courierOrderBlockHint}
        </p>
      ) : null}
    </section>
  );
}
