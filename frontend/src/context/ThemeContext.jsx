import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const THEME_KEY = 'myshop-theme';

const ThemeContext = createContext(null);

/** Saqlangan tanlov bo‘lmasa — barcha rollar va mehmon uchun standart kun (yorug‘); tunni foydalanuvchi o‘zi yoqadi. */
function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {}
  return 'light';
}

function applyTheme(mode) {
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light');
  if (mode === 'dark') {
    root.classList.add('theme-dark');
  } else {
    root.classList.add('theme-light');
  }
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((value) => {
    const next = value === 'dark' ? 'dark' : 'light';
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx || { theme: 'light', setTheme: () => {}, toggleTheme: () => {} };
}
