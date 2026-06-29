const NOTIF_KEY = 'myshop-target-notifications';
const ACCENT_LIGHT_KEY = 'myshop-target-accent-light';
const ACCENT_DARK_KEY = 'myshop-target-accent-dark';

export const TARGET_DEFAULT_ACCENT_LIGHT = '#2563eb';
export const TARGET_DEFAULT_ACCENT_DARK = '#3b82f6';

export const TARGET_ACCENT_PRESETS = [
  { id: 'blue', light: '#2563eb', dark: '#3b82f6', label: 'Ko\'k' },
  { id: 'indigo', light: '#4f46e5', dark: '#6366f1', label: 'Indigo' },
  { id: 'violet', light: '#7c3aed', dark: '#8b5cf6', label: 'Binafsha' },
  { id: 'emerald', light: '#059669', dark: '#10b981', label: 'Yashil' },
  { id: 'rose', light: '#e11d48', dark: '#fb7185', label: 'Qizil' },
  { id: 'amber', light: '#d97706', dark: '#fbbf24', label: 'Oltin' },
];

function readBool(key, defaultValue = true) {
  try {
    const v = localStorage.getItem(key);
    if (v === '0' || v === 'false' || v === 'off') return false;
    if (v === '1' || v === 'true' || v === 'on') return true;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

function readColor(key, fallback) {
  try {
    const v = String(localStorage.getItem(key) || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  } catch {
    /* ignore */
  }
  return fallback;
}

export function readTargetNotificationsEnabled() {
  return readBool(NOTIF_KEY, true);
}

export function writeTargetNotificationsEnabled(value) {
  try {
    localStorage.setItem(NOTIF_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function readTargetAccentLight() {
  return readColor(ACCENT_LIGHT_KEY, TARGET_DEFAULT_ACCENT_LIGHT);
}

export function readTargetAccentDark() {
  return readColor(ACCENT_DARK_KEY, TARGET_DEFAULT_ACCENT_DARK);
}

export function writeTargetAccentLight(color) {
  const next = String(color || '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(next)) return;
  try {
    localStorage.setItem(ACCENT_LIGHT_KEY, next);
  } catch {
    /* ignore */
  }
}

export function writeTargetAccentDark(color) {
  const next = String(color || '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(next)) return;
  try {
    localStorage.setItem(ACCENT_DARK_KEY, next);
  } catch {
    /* ignore */
  }
}

/** Saqlanmagan draft ranglar — mavzu almashtirganda ham ko‘rinadi */
let runtimeAccentLight = null;
let runtimeAccentDark = null;

function getEffectiveAccentLight() {
  return runtimeAccentLight ?? readTargetAccentLight();
}

function getEffectiveAccentDark() {
  return runtimeAccentDark ?? readTargetAccentDark();
}

export function setTargetAccentRuntime(lightColor, darkColor) {
  runtimeAccentLight = String(lightColor || '').trim().toLowerCase();
  runtimeAccentDark = String(darkColor || '').trim().toLowerCase();
}

export function commitTargetAccentColors(lightColor, darkColor) {
  writeTargetAccentLight(lightColor);
  writeTargetAccentDark(darkColor);
  setTargetAccentRuntime(lightColor, darkColor);
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = amount >= 0 ? 255 : 0;
  const p = Math.abs(amount);
  return rgbToHex(
    rgb.r + (t - rgb.r) * p,
    rgb.g + (t - rgb.g) * p,
    rgb.b + (t - rgb.b) * p,
  );
}

/** Joriy mavzu bo‘yicha accent CSS o‘zgaruvchilarini qo‘llash */
export function applyTargetAccentColors(theme, lightColor, darkColor) {
  const light = String(lightColor || TARGET_DEFAULT_ACCENT_LIGHT).toLowerCase();
  const dark = String(darkColor || TARGET_DEFAULT_ACCENT_DARK).toLowerCase();
  const base = theme === 'dark' ? dark : light;
  const root = document.documentElement;
  root.style.setProperty('--target-accent-light', light);
  root.style.setProperty('--target-accent-dark', dark);
  root.style.setProperty('--accent', base);
  root.style.setProperty('--accent-dark', mixHex(base, -0.18));
  root.style.setProperty('--accent-light', mixHex(base, 0.22));
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : base);
  } catch {
    /* ignore */
  }
}

/** localStorage / runtime dagi kun-tun ranglarini joriy mavzuga qo‘llash */
export function applySavedTargetAccentColors(theme) {
  applyTargetAccentColors(theme, getEffectiveAccentLight(), getEffectiveAccentDark());
}

export function saveTargetAccentColors(lightColor, darkColor) {
  commitTargetAccentColors(lightColor, darkColor);
}

export function playTargetIphoneSmsTone() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime + 0.02;
  const seq = [1320, 1760];
  seq.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const start = now + idx * 0.13;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.12);
  });
  window.setTimeout(() => void ctx.close().catch(() => {}), 1000);
}

export function vibrateTargetNotification() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([120, 60, 120, 60, 180]);
    }
  } catch {
    /* ignore */
  }
}

/** Qung‘iroq yoqilgan — iPhone SMS ovozi; o‘chirilgan — faqat vibratsiya */
export function alertTargetNotification(soundEnabled) {
  if (soundEnabled) {
    playTargetIphoneSmsTone();
  } else {
    vibrateTargetNotification();
  }
}
