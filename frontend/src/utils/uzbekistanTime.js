/**
 * Loyiha bo‘yicha barcha ko‘rinadigan sana/vaqt: O‘zbekiston (Asia/Tashkent, UTC+5).
 * Serverdan kelgan vaqtlar mintaqasiz bo‘lsa, UTC deb qabul qilinadi (Node toISOString / SQLite UTC).
 */

export const UZ_TIMEZONE = 'Asia/Tashkent';

const HAS_TZ = /[zZ]|[+-]\d{2}:?\d{2}$/;

/**
 * @param {string|Date|number|null|undefined} value
 * @returns {Date|null}
 */
export function parseServerDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (HAS_TZ.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string|Date|null|undefined} value
 * @returns {{ date: string, time: string, year: string, month: string, day: string, hour: string, minute: string } | null}
 */
export function getDateTimePartsInUzbekistan(value) {
  const d = value instanceof Date ? value : parseServerDateTime(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  for (const { type, value: v } of parts) {
    if (type !== 'literal') map[type] = v;
  }
  const date = `${map.year}-${map.month}-${map.day}`;
  const time = `${map.hour}:${map.minute}`;
  return { date, time, year: map.year, month: map.month, day: map.day, hour: map.hour, minute: map.minute };
}

/** Jonli soat: O‘zbekiston, soniyalar bilan (UI soati uchun). */
export function getLiveClockInUzbekistan() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const m = {};
  for (const { type, value } of parts) {
    if (type !== 'literal') m[type] = value;
  }
  const dateLabel = `${m.day}.${m.month}.${m.year}`;
  const timeLabel = `${m.hour}:${m.minute}:${m.second}`;
  const dateTimeAttr = `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}`;
  return { dateLabel, timeLabel, dateTimeAttr };
}

/** Bugungi sana YYYY-MM-DD (O‘zbekiston) */
export function todayIsoDateInUzbekistan() {
  return getDateTimePartsInUzbekistan(new Date())?.date ?? '';
}

/** Hozirgi vaqt HH:mm (O‘zbekiston) */
export function nowTimeHHMMInUzbekistan() {
  const p = getDateTimePartsInUzbekistan(new Date());
  return p ? p.time : '';
}

/**
 * @param {string|Date|null|undefined} value
 * @param {{ empty?: string }} [opts]
 */
export function formatDateTimeUz(value, opts = {}) {
  const empty = opts.empty ?? '-';
  const d = parseServerDateTime(value);
  if (!d) return value == null || value === '' ? empty : String(value);
  return d.toLocaleString('uz-UZ', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @param {string|Date|null|undefined} value
 * @param {{ empty?: string }} [opts]
 */
export function formatDateTimeUzFull(value, opts = {}) {
  const empty = opts.empty ?? '';
  const d = parseServerDateTime(value);
  if (!d) return value == null || value === '' ? empty : String(value);
  return d.toLocaleString('uz-UZ', { timeZone: UZ_TIMEZONE });
}

/** YYYY-MM-DD | HH:mm (O‘zbekiston) */
export function formatDateTimeUzPipe(value, opts = {}) {
  const empty = opts.empty ?? '—';
  const p = getDateTimePartsInUzbekistan(value);
  if (!p) return value == null || value === '' ? empty : String(value);
  return `${p.date} | ${p.time}`;
}

/** YYYY-MM-DD HH:mm (O‘zbekiston) */
export function formatDateTimeUzCompact(value, opts = {}) {
  const empty = opts.empty ?? '-';
  const p = getDateTimePartsInUzbekistan(value);
  if (!p) return value == null || value === '' ? empty : String(value);
  return `${p.date} ${p.time}`;
}

/**
 * Kalendar sanasi (YYYY-MM-DD) uchun uzun yozuv — kiritilgan kun O‘zbekiston kalendarida shu kun.
 * @param {string} iso YYYY-MM-DD
 */
/** `<time datetime>` uchun ISO 8601 (UTC). */
export function toIso8601DateTimeAttr(value) {
  const d = parseServerDateTime(value);
  return d ? d.toISOString() : undefined;
}

export function formatIsoDateLabelUz(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  const inst = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return inst.toLocaleDateString('uz-UZ', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
