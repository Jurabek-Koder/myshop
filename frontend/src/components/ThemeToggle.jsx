import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '', moonRotate = true, ariaSun, ariaMoon }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle-btn${isDark && moonRotate ? ' theme-toggle-btn--moon' : ''}${className ? ` ${className}` : ''}`}
      onClick={toggleTheme}
      aria-label={isDark ? ariaMoon || 'Kun rejimi' : ariaSun || 'Tun rejimi'}
      title={isDark ? ariaMoon || 'Kun rejimi' : ariaSun || 'Tun rejimi'}
    >
      <span className="theme-toggle-btn__icon" aria-hidden>
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
