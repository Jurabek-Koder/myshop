import React, { memo, useEffect, useState } from 'react';
import { PICKER_EMOJI_LIST } from './pickerEmojiList.js';

const CHUNK_SIZE = 64;

/**
 * Emoji paneli — ochilganda birinchi qism darhol, qolgani keyingi kadrda (UI bloklanmasin).
 */
function PickerEmojiPicker({ onPick }) {
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);

  useEffect(() => {
    setVisibleCount(CHUNK_SIZE);
    if (PICKER_EMOJI_LIST.length <= CHUNK_SIZE) return undefined;
    const id = window.requestAnimationFrame(() => {
      setVisibleCount(PICKER_EMOJI_LIST.length);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const slice = PICKER_EMOJI_LIST.slice(0, visibleCount);

  return (
    <div
      className="picker-tg-emoji-picker-grid u-flex-scroll-y"
      role="listbox"
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {slice.map((ch, idx) => (
        <button
          key={`e-${idx}-${ch}`}
          type="button"
          role="option"
          className="picker-tg-emoji-cell"
          title={ch}
          onClick={() => onPick(ch)}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

export default memo(PickerEmojiPicker);
