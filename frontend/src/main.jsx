import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

function isLikelyStaleChunkError(err) {
  const m = String(err?.message || err?.name || err || '');
  return /dynamically imported module|Loading (?:CSS )?chunk .*failed|ChunkLoadError|import(?:ing)?(?: a)? module script failed/i.test(
    m,
  );
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[MyShop] RootErrorBoundary:', err, info?.componentStack);
    }
  }

  render() {
    const { err } = this.state;
    if (err) {
      const dark =
        typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark');
      const bg = dark ? '#0f172a' : '#f8fafc';
      const fg = dark ? '#e2e8f0' : '#0f172a';
      const muted = dark ? '#94a3b8' : '#475569';
      const stale = isLikelyStaleChunkError(err);
      return (
        <div
          style={{
            minHeight: '100dvh',
            padding: '1.75rem max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
            paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))',
            paddingTop: 'max(1.75rem, env(safe-area-inset-top))',
            fontFamily: 'system-ui, sans-serif',
            background: bg,
            color: fg,
            maxWidth: 560,
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          <h1 style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: '1.25rem', marginTop: 0 }}>
            Sahifa yuklanmadi
          </h1>
          {stale && (
            <p style={{ marginTop: '0.75rem', lineHeight: 1.55, color: fg }}>
              Yangilanishdan keyin brauzer eski sayt bo‘laklarini saqlab qolgan bo‘lishi mumkin — telefonda tepadan tortib
              yangilash aynan shunday holatni keltirib chiqaradi.
            </p>
          )}
          <p style={{ marginTop: '0.75rem', lineHeight: 1.5, fontSize: '0.9rem', color: muted }}>
            {String(err?.message || err)}
          </p>
          <p style={{ marginTop: '0.75rem', fontSize: '0.88rem', lineHeight: 1.5, color: muted }}>
            {stale
              ? '«Qayta yuklash» ni bosing. Agar yana xato chiqsa, brauzer sozlamalaridan ushbu sayt keshini tozalang yoki xavfsiz (inkognito) oynada oching.'
              : "Brauzer konsolida batafsil xato bo'lishi mumkin. Backend ishlayotganini ham tekshiring."}
          </p>
          <button
            type="button"
            style={{
              marginTop: '1.1rem',
              padding: '0.55rem 1.1rem',
              cursor: 'pointer',
              borderRadius: 8,
              border: dark ? '1px solid #334155' : '1px solid #cbd5e1',
              background: dark ? '#1e293b' : '#fff',
              color: fg,
              fontWeight: 600,
            }}
            onClick={() => window.location.reload()}
          >
            Qayta yuklash
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('HTML ichida #root elementi topilmadi.');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
