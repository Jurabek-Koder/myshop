import React, { useCallback, useEffect, useState } from 'react';

const API = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api`;

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (id && document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    if (id) s.id = id;
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Skript yuklanmadi: ${src}`));
    document.head.appendChild(s);
  });
}

function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.26-.95 2.33-2.02 3.05l3.26 2.53c1.9-1.75 3-4.33 3-7.41 0-.71-.06-1.39-.19-2.04H12z" />
      <path fill="#34A853" d="M6.5 14.32l-.82.63-2.42 1.89C4.72 20.04 8.02 22 12 22c2.7 0 4.97-.89 6.62-2.42l-3.26-2.53c-.89.6-2.04.95-3.36.95-2.58 0-4.77-1.74-5.55-4.08z" />
      <path fill="#4A90E2" d="M3.26 7.18C2.46 8.86 2 10.79 2 13s.46 4.14 1.26 5.82L6.5 14.32 6.68 13 6.5 11.68 3.26 7.18z" />
      <path fill="#FBBC05" d="M12 5.38c1.47 0 2.79.5 3.83 1.48l2.87-2.87C16.96 2.34 14.7 1.5 12 1.5 8.02 1.5 4.72 3.46 3.26 7.18l3.24 2.5C7.23 7.12 9.42 5.38 12 5.38z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12.07C24 5.73 18.63.36 12.29.36 5.95.36.58 5.73.58 12.07c0 5.87 4.3 10.74 9.92 11.63v-8.23H7.9v-3.4h2.6V9.41c0-2.57 1.53-3.99 3.87-3.99 1.12 0 2.29.2 2.29.2v2.52h-1.29c-1.27 0-1.67.79-1.67 1.6v1.92h2.84l-.45 3.4h-2.39v8.23C19.7 22.81 24 17.94 24 12.07z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FD5949" />
          <stop offset="50%" stopColor="#D6249F" />
          <stop offset="100%" stopColor="#285AEB" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGrad)" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="#fff" />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#26A5E4" />
      <path
        fill="#fff"
        d="M5.5 11.8c3.9-1.7 6.5-2.8 7.8-3.4 3.7-1.5 4.5-1.8 5-1.8.11 0 .37.03.53.17.14.12.18.28.2.4.02.12.04.38.02.58-.18 1.9-.96 6.52-1.36 8.65-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.91-.9-1.06-.7-1.66-1.13-2.69-1.81-1.19-.78-.42-1.21.26-1.91.18-.19 3.28-3.01 3.34-3.27.01-.03.01-.14-.05-.2-.06-.06-.15-.04-.21-.02-.09.03-1.53.97-4.32 2.82-.41.28-.78.42-1.12.41-.37-.01-1.08-.21-1.6-.38-.64-.21-1.15-.33-1.1-.7.02-.19.33-.38.92-.58z"
      />
    </svg>
  );
}

export default function SocialAuthButtons({ onSuccess, onError, rememberDevice = true, disabled = false }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState('');
  const googleClientId =
    String(import.meta.env.VITE_GOOGLE_CLIENT_ID || cfg?.googleClientId || '').trim();
  const facebookAppId =
    String(import.meta.env.VITE_FACEBOOK_APP_ID || cfg?.facebookAppId || '').trim();
  const telegramBotId = String(cfg?.telegramBotId || import.meta.env.VITE_TELEGRAM_BOT_ID || '').trim();

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/auth/oauth/config`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCfg(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTelegramMessage = useCallback(
    async (event) => {
      if (event.origin !== 'https://oauth.telegram.org') return;
      const data = event.data;
      if (!data || data.event !== 'auth_result' || !data.result) return;
      setBusy('telegram');
      try {
        await onSuccess('telegram', data.result);
      } catch (e) {
        onError?.(e.message || 'Telegram xato');
      } finally {
        setBusy('');
      }
    },
    [onSuccess, onError],
  );

  useEffect(() => {
    window.addEventListener('message', handleTelegramMessage);
    return () => window.removeEventListener('message', handleTelegramMessage);
  }, [handleTelegramMessage]);

  const loginGoogle = async () => {
    if (!googleClientId) {
      onError?.('Google OAuth sozlanmagan (VITE_GOOGLE_CLIENT_ID)');
      return;
    }
    setBusy('google');
    try {
      await loadScript('https://accounts.google.com/gsi/client', 'google-gsi');
      await new Promise((resolve, reject) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              reject(new Error(tokenResponse.error));
              return;
            }
            try {
              await onSuccess('google', {
                access_token: tokenResponse.access_token,
                remember_device: rememberDevice,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      });
    } catch (e) {
      onError?.(e.message || 'Google xato');
    } finally {
      setBusy('');
    }
  };

  const loginFacebook = async () => {
    if (!facebookAppId) {
      onError?.('Facebook OAuth sozlanmagan (VITE_FACEBOOK_APP_ID)');
      return;
    }
    setBusy('facebook');
    try {
      await loadScript('https://connect.facebook.net/en_US/sdk.js', 'facebook-jssdk');
      await new Promise((resolve, reject) => {
        window.FB.init({ appId: facebookAppId, cookie: true, xfbml: false, version: 'v19.0' });
        window.FB.login(
          async (response) => {
            if (!response.authResponse?.accessToken) {
              reject(new Error('Facebook bekor qilindi'));
              return;
            }
            try {
              await onSuccess('facebook', {
                access_token: response.authResponse.accessToken,
                remember_device: rememberDevice,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          { scope: 'email,public_profile' },
        );
      });
    } catch (e) {
      onError?.(e.message || 'Facebook xato');
    } finally {
      setBusy('');
    }
  };

  const loginInstagram = () => {
    if (!cfg?.instagramConfigured) {
      onError?.('Instagram OAuth serverda sozlanmagan');
      return;
    }
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') || '';
    const startUrl = `${base}/api/auth/oauth/instagram/start?returnTo=${encodeURIComponent('/register')}`;
    window.location.href = startUrl;
  };

  const loginTelegram = () => {
    if (!telegramBotId) {
      onError?.('Telegram bot sozlanmagan (TELEGRAM_BOT_ID)');
      return;
    }
    setBusy('telegram');
    const origin = encodeURIComponent(window.location.origin);
    const returnTo = encodeURIComponent(window.location.href);
    window.open(
      `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(telegramBotId)}&origin=${origin}&embed=1&request_access=write&return_to=${returnTo}`,
      'telegram_oauth',
      'width=560,height=520,scrollbars=yes',
    );
    window.setTimeout(() => setBusy(''), 8000);
  };

  const items = [
    { id: 'google', label: 'Google orqali', icon: <IconGoogle />, onClick: loginGoogle },
    { id: 'instagram', label: 'Instagram orqali', icon: <IconInstagram />, onClick: loginInstagram },
    { id: 'facebook', label: 'Facebook orqali', icon: <IconFacebook />, onClick: loginFacebook },
    { id: 'telegram', label: 'Telegram orqali', icon: <IconTelegram />, onClick: loginTelegram },
  ];

  return (
    <div className="auth-social-row" role="group" aria-label="Ijtimoiy tarmoqlar orqali ro‘yxatdan o‘tish">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="auth-social-btn"
          aria-label={item.label}
          title={item.label}
          disabled={disabled || Boolean(busy)}
          onClick={item.onClick}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
