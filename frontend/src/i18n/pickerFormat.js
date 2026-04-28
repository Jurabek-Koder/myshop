/** Picker ilovasi — summa va sana formati (til bo‘yicha) */
export function formatPickerCurrency(value, locale) {
  const loc = locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-US' : 'uz-UZ';
  const n = new Intl.NumberFormat(loc).format(Number(value || 0));
  if (locale === 'en') return `${n} UZS`;
  if (locale === 'ru') return `${n} сум`;
  return `${n} so'm`;
}

import { parseServerDateTime, UZ_TIMEZONE } from '../utils/uzbekistanTime.js';

export function formatPickerDateTime(value, locale) {
  if (!value) return '—';
  const d = value instanceof Date ? value : parseServerDateTime(value);
  if (!d) return String(value);
  const loc = locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-GB' : 'uz-UZ';
  return d.toLocaleString(loc, {
    timeZone: UZ_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPickerDateTimeFull(value, locale) {
  if (!value) return '';
  let d = value instanceof Date ? value : parseServerDateTime(value);
  if (!d || Number.isNaN(d.getTime())) {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return String(value);
  const loc = locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-GB' : 'uz-UZ';
  return d.toLocaleString(loc, { timeZone: UZ_TIMEZONE });
}

/** Sklad chat sarlavha osti: ism + yozmoqda / media */
export function formatSkladPresenceSubtitle(peers, tr) {
  if (!peers?.length) return '';
  const parts = peers.slice(0, 4).map((p) => {
    const name = String(p.displayName || p.login || `#${p.userId}`).trim() || '?';
    let tail = tr.presenceTyping;
    switch (p.state) {
      case 'typing':
        tail = tr.presenceTyping;
        break;
      case 'recording_audio':
        tail = tr.presenceRecordingAudio;
        break;
      case 'recording_video':
        tail = tr.presenceRecordingVideo;
        break;
      case 'choosing_attachment':
        tail = tr.presenceChoosingAttach;
        break;
      case 'preview_media':
        tail = tr.presencePreviewMedia;
        break;
      default:
        tail = tr.presenceTyping;
    }
    return `${name} ${tail}`;
  });
  let out = parts.join(' · ');
  if (peers.length > 4) out += ` · ${tr.presenceMore}`;
  return out;
}
