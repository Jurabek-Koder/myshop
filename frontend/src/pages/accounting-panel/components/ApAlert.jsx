import React from 'react';
import { uz } from '../i18n/uz.js';

export function ApAlert({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="ap-error" role="alert">
      <span>{error}</span>
      {onDismiss ? (
        <button type="button" className="ap-btn ap-btn--sm" onClick={onDismiss}>
          {uz.close}
        </button>
      ) : null}
    </div>
  );
}

export function ApSpinner({ show }) {
  if (!show) return null;
  return <p className="ap-loading">{uz.loading}</p>;
}
