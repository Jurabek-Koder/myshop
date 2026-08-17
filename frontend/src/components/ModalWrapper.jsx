import React from 'react';

export default function ModalWrapper({ open, onClose, title, maxWidth = '600px', children }) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay-neo"
      onClick={onClose}
      style={{ zIndex: 9999 }}
    >
      <div
        className="modal-panel"
        style={{
          maxWidth,
          width: 'calc(100vw - 2rem)',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-neo" style={{ flexShrink: 0 }}>
          <h4 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{title}</h4>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish" style={{ flexShrink: 0 }}>
            <i className="fas fa-times" />
          </button>
        </div>
        <div
          className="modal-body-neo"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1,
            minHeight: 0,
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
