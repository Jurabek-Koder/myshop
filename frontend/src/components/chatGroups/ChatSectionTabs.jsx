import React from 'react';

/**
 * Chat bo'limi ichidagi kichik almashtirgich: "Shaxsiy" (lichka/DM) va "Guruh"
 * (rol-guruhi chati) orasida. Ikkalasi ham BITTA "Chat" menyu bandi ichida —
 * alohida menyu bandlari emas.
 */
export default function ChatSectionTabs({
  active,
  onChange,
  groupLabel = 'Guruh',
  personalLabel = 'Shaxsiy',
  showOversight = false,
  oversightLabel = 'Nazorat',
}) {
  return (
    <div className="chat-section-tabs" role="tablist" aria-label="Chat bo'limlari">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'lichka'}
        className={`chat-section-tab${active === 'lichka' ? ' chat-section-tab--active' : ''}`}
        onClick={() => onChange('lichka')}
      >
        {personalLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'guruh'}
        className={`chat-section-tab${active === 'guruh' ? ' chat-section-tab--active' : ''}`}
        onClick={() => onChange('guruh')}
      >
        {groupLabel}
      </button>
      {showOversight ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === 'oversight'}
          className={`chat-section-tab${active === 'oversight' ? ' chat-section-tab--active' : ''}`}
          onClick={() => onChange('oversight')}
        >
          {oversightLabel}
        </button>
      ) : null}
    </div>
  );
}
