import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { PICKER_I18N } from '../i18n/pickerI18n.js';

const NOTIF_KEY = 'myshop-picker-notifications';
const LANG_KEY = 'myshop-picker-lang';
const NOTIF_TONE_KEY = 'myshop-picker-notif-tone';

export { PICKER_I18N };

function readNotificationsEnabled() {
  try {
    const v = localStorage.getItem(NOTIF_KEY);
    if (v === '0' || v === 'false' || v === 'off') return false;
    return true;
  } catch {
    return true;
  }
}

function readLocale() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'ru' || v === 'en' || v === 'uz') return v;
  } catch {}
  return 'uz';
}

function readNotifTone() {
  try {
    const v = String(localStorage.getItem(NOTIF_TONE_KEY) || '').trim();
    if (v) return v;
  } catch {}
  return 'tomchi';
}

const PickerUiSettingsContext = createContext(null);

export function PickerUiSettingsProvider({ children }) {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(readNotificationsEnabled);
  const [locale, setLocaleState] = useState(readLocale);
  const [notifTone, setNotifToneState] = useState(readNotifTone);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('lang', locale === 'uz' ? 'uz' : locale);
    } catch {}
  }, [locale]);

  const setNotificationsEnabled = useCallback((value) => {
    const next = Boolean(value);
    setNotificationsEnabledState(next);
    try {
      localStorage.setItem(NOTIF_KEY, next ? '1' : '0');
    } catch {}
  }, []);

  const setLocale = useCallback((value) => {
    const next = value === 'ru' || value === 'en' ? value : 'uz';
    setLocaleState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
  }, []);

  const setNotifTone = useCallback((value) => {
    const next = String(value || '').trim() || 'tomchi';
    setNotifToneState(next);
    try {
      localStorage.setItem(NOTIF_TONE_KEY, next);
    } catch {}
  }, []);

  const t = useMemo(() => PICKER_I18N[locale] || PICKER_I18N.uz, [locale]);

  const value = useMemo(
    () => ({
      notificationsEnabled,
      setNotificationsEnabled,
      locale,
      setLocale,
      notifTone,
      setNotifTone,
      t,
    }),
    [notificationsEnabled, setNotificationsEnabled, locale, setLocale, notifTone, setNotifTone, t]
  );

  return (
    <PickerUiSettingsContext.Provider value={value}>{children}</PickerUiSettingsContext.Provider>
  );
}

export function usePickerUiSettings() {
  const ctx = useContext(PickerUiSettingsContext);
  if (!ctx) {
    return {
      notificationsEnabled: true,
      setNotificationsEnabled: () => {},
      locale: 'uz',
      setLocale: () => {},
      notifTone: 'tomchi',
      setNotifTone: () => {},
      t: PICKER_I18N.uz,
    };
  }
  return ctx;
}
