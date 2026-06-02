import React, { useEffect, useRef, useState } from 'react';

const LANG_OPTIONS = [
  { value: 'uz', label: 'UZ' },
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
];

export default function AuthLangSelect({ value, onChange, ariaLabel = 'Til', menuPlacement = 'right' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const current = LANG_OPTIONS.find((o) => o.value === value) || LANG_OPTIONS[0];

  return (
    <div
      className={`auth-lang-select${open ? ' is-open' : ''}${menuPlacement === 'left' ? ' auth-lang-select--menu-left' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="auth-lang-select-btn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="auth-lang-select-code">{current.label}</span>
        <span className="auth-lang-select-caret" aria-hidden />
      </button>
      {open ? (
        <ul className="auth-lang-select-menu" role="listbox" aria-label={ariaLabel}>
          {LANG_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={value === opt.value ? 'is-active' : ''}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
