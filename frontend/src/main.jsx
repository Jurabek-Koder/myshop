import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  render() {
    const { err } = this.state;
    if (err) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            background: '#f8fafc',
            color: '#0f172a',
            maxWidth: 560,
            margin: '0 auto',
          }}
        >
          <h1 style={{ color: '#b91c1c', fontSize: '1.25rem' }}>Sahifa yuklanmadi</h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.5 }}>{String(err?.message || err)}</p>
          <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
            Brauzerda F12 → Console bo‘limida batafsil xato bo‘lishi mumkin. Backend ishga tushganini ham tekshiring (odatda port 3000).
          </p>
          <button
            type="button"
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
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

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
);
