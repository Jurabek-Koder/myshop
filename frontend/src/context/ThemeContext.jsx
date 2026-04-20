import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const THEME_KEY = 'myshop-theme';
const NIGHT_START_HOUR = 19;
const DAY_START_HOUR = 7;

const ThemeContext = createContext(null);

function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {}
  const hour = new Date().getHours();
  return hour >= NIGHT_START_HOUR || hour < DAY_START_HOUR ? 'dark' : 'light';
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
