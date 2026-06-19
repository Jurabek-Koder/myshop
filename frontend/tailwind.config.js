/** @type {import('tailwindcss').Config} */
export default {
  prefix: 'ac-',
  content: ['./index.html', './src/pages/accounting-panel/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        ac: {
          ink: '#0f172a',
          panel: '#0b1220',
          card: '#111827',
          line: '#1e293b',
          muted: '#94a3b8',
          brand: '#38bdf8',
          brand2: '#818cf8',
          ok: '#34d399',
          warn: '#fbbf24',
        },
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(56, 189, 248, 0.35)',
      },
    },
  },
  plugins: [],
};
