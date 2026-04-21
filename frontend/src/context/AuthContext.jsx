 import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const AuthContext = createContext(null);
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
// VITE_API_BASE_URL bo‘sh bo‘lsa — nisbiy /api: Vite devda proxy har qanday host (masalan 192.168...) bilan ishlaydi.
// To‘g‘ridan-to‘g‘ri http://localhost:3000 faqat shu kompyuterda brauzer ochilganda ishlaydi; telefon/LAN — "Failed to fetch".
const API = base ? `${base}/api` : '/api';
const APP_SECRET_KEY = String(import.meta.env.VITE_APP_SECRET_KEY || '').trim();

function mapFetchFailure(err) {
  const msg = String(err?.message || err || '');
  if (err?.name === 'TypeError' || /failed to fetch|load failed|networkerror/i.test(msg)) {
    return new Error(
      "Serverga ulanib bo'lmadi. Backend ishga tushirilganini tekshiring (port 3000). " +
        "Telefon yoki tarmoq manzili orqali kirayotgan bo'lsangiz, frontend/.env da VITE_API_BASE_URL ni bo'sh qiling yoki # bilan o'chirib, so'rovlar /api proxy orqali yuborilishini ta'minlang.",
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

function parseResponseJson(text) {
  const raw = text == null ? '' : String(text).trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function strErr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && typeof v.message === 'string') return v.message.trim();
  return String(v).trim();
}

/** Server JSON yoki status bo‘yicha foydalanuvchiga tushunarli xabar */
function extractHttpErrorMessage(res, data) {
  if (data && typeof data === 'object' && data !== null) {
    if (Array.isArray(data.details)) {
      const parts = data.details.map((d) => strErr(d?.message ?? d?.msg ?? d)).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const e = strErr(data.error);
    if (e) return e;
    const m = strErr(data.message);
    if (m) return m;

    if (Array.isArray(data.errors)) {
      const parts = data.errors.map((d) => strErr(d?.msg ?? d?.message)).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
  }

  const st = res?.status;
  if (st === 401) return "Email, login yoki parol noto'g'ri. Kiritilgan ma'lumotlarni tekshiring.";
  if (st === 429) return "Juda ko'p urinish. Bir ozdan keyin qayta urinib ko'ring.";
  if (st === 502 || st === 503 || st === 504) return "Server vaqtincha javob bermayapti. Backend (port 3000) ishlayotganini tekshiring.";
  if (st === 404) return "Kirish manzili topilmadi. Sayt /api sozlamalari va backend holatini tekshiring.";
  if (st >= 500) return `Server xatosi (${st}). Keyinroq urinib ko'ring yoki administratorga murojaat qiling.`;
  if (st >= 400) return `So'rov bajarilmadi (${st}). Ma'lumotlarni tekshirib qayta urinib ko'ring.`;
  return "Kirish amalga oshmadi. Internet va serverni tekshirib, qayta urinib ko'ring.";
}

/* sessionStorage: har bir oyna/tab o‘z sessiyasini saqlaydi; alohida oynalarda turli rollar (superuser, picker) bir-birini bosib ketmaydi */
function readToken(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToken(key, value) {
  if (!value) return;
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

function removeToken(key) {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => readToken('accessToken'));
  const [authStatus, setAuthStatus] = useState(() => {
    const access = readToken('accessToken');
    const refresh = readToken('refreshToken');
    return access || refresh ? 'bootstrapping' : 'guest';
  });
  const [authMessage, setAuthMessage] = useState('');

  const refreshInFlightRef = useRef(null);
  const accessTokenRef = useRef(null);
  const loading = authStatus === 'bootstrapping';

  useEffect(() => {
    try { localStorage.removeItem('rememberedEmail'); } catch {}
    try { localStorage.removeItem('rememberedPassword'); } catch {}
  }, []);

  const clearSession = useCallback((nextStatus = 'guest', message = '') => {
    setUser(null);
    setAccessToken(null);
    accessTokenRef.current = null;
    setAuthStatus(nextStatus);
    setAuthMessage(message);
    removeToken('accessToken');
    removeToken('refreshToken');
  }, []);

  const persistTokens = useCallback((data) => {
    const access = data?.access ?? data?.accessToken;
    const refresh = data?.refresh ?? data?.refreshToken;
    if (access) {
      setAccessToken(access);
      accessTokenRef.current = access;
      writeToken('accessToken', access);
    }
    if (refresh) writeToken('refreshToken', refresh);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshToken = readToken('refreshToken');
    if (!refreshToken) return { ok: false, reason: 'missing' };

    refreshInFlightRef.current = (async () => {
      try {
        const res = await fetch(`${API}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          persistTokens(data);
          return { ok: true, access: data.access };
        }

        if (res.status === 401) {
          clearSession('expired', 'Sessiya tugagan. Qayta kiring.');
          return { ok: false, reason: 'expired' };
        }

        if (res.status === 429 || res.status >= 500) {
          setAuthMessage('Server vaqtincha band. Qayta urinib ko\'ring.');
          return { ok: false, reason: 'retryable' };
        }

        return { ok: false, reason: 'failed' };
      } catch {
        setAuthMessage('Tarmoq xatosi. Internetni tekshirib qayta urinib ko\'ring.');
        return { ok: false, reason: 'retryable' };
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }, [clearSession, persistTokens]);

  const bootstrapSession = useCallback(async () => {
    const storedAccess = readToken('accessToken');
    const storedRefresh = readToken('refreshToken');

    /* Token yo‘q — darhol mehmon holat; ortiqcha «bootstrapping» chaqnashi bo‘lmasin */
    if (!storedAccess && !storedRefresh) {
      setUser(null);
      setAccessToken(null);
      accessTokenRef.current = null;
      setAuthStatus('guest');
      setAuthMessage('Kirish qilinmagan. Kirish tugmasini bosing.');
      return;
    }

    setAuthStatus('bootstrapping');
    setAuthMessage('');

    if (storedAccess) accessTokenRef.current = storedAccess;
    let token = storedAccess;

    if (!token && storedRefresh) {
      const refreshed = await refreshAccessToken();
      if (!refreshed.ok) {
        if (refreshed.reason === 'expired' || refreshed.reason === 'missing') return;
        setUser(null);
        setAuthStatus('guest');
        setAuthMessage('Sessiyani tekshirib bo\'lmadi. Qayta urinib ko\'ring.');
        return;
      }
      token = refreshed.access;
    }

    if (!token) {
      setUser(null);
      setAuthStatus('guest');
      setAuthMessage('Kirish qilinmagan. Kirish tugmasini bosing.');
      return;
    }

    const callMe = async (access) => fetch(`${API}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access}`,
      },
      credentials: 'include',
    });

    try {
      let meRes = await callMe(token);

      if (meRes.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed.ok) {
          if (refreshed.reason === 'expired' || refreshed.reason === 'missing') return;
          setUser(null);
          setAuthStatus('guest');
          setAuthMessage('Sessiyani tekshirib bo\'lmadi. Qayta urinib ko\'ring.');
          return;
        }
        meRes = await callMe(refreshed.access);
      }

      if (meRes.ok) {
        const data = await meRes.json();
        setUser(data?.user || null);
        setAuthStatus(data?.user ? 'authenticated' : 'guest');
        setAuthMessage(data?.user ? '' : 'Kirish qilinmagan. Kirish tugmasini bosing.');
        return;
      }

      if (meRes.status === 403) {
        setUser(null);
        setAuthStatus('forbidden');
        setAuthMessage('Ruxsat yo\'q.');
        return;
      }

      if (meRes.status === 429 || meRes.status >= 500) {
        setUser(null);
        setAuthStatus('guest');
        setAuthMessage('Server vaqtincha band. Qayta urinib ko\'ring.');
        return;
      }

      clearSession('expired', 'Sessiya tugagan. Qayta kiring.');
    } catch {
      setUser(null);
      setAuthStatus('guest');
      setAuthMessage('Tarmoq xatosi. Internetni tekshirib qayta urinib ko\'ring.');
    }
  }, [refreshAccessToken, clearSession]);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  const request = useCallback(async (path, options = {}) => {
    const headers = { ...options.headers };
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const token = accessTokenRef.current || accessToken || readToken('accessToken');
    if (token) headers.Authorization = `Bearer ${token}`;

    if (APP_SECRET_KEY && !headers['X-App-Secret-Key']) {
      headers['X-App-Secret-Key'] = APP_SECRET_KEY;
    }

    let res;
    try {
      res = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
    } catch (err) {
      setAuthMessage('Tarmoq xatosi. Internetni tekshirib qayta urinib ko\'ring.');
      throw err;
    }

    if (res.status !== 401) return res;

    const refreshToken = readToken('refreshToken');
    if (!refreshToken) {
      clearSession('expired', 'Sessiya tugagan. Qayta kiring.');
      return res;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed.ok) return res;

    const retryHeaders = { ...headers, Authorization: `Bearer ${refreshed.access}` };
    return fetch(`${API}${path}`, { ...options, headers: retryHeaders, credentials: 'include' });
  }, [accessToken, clearSession, refreshAccessToken]);

  const login = async (emailOrLogin, password) => {
    let res;
    try {
      res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(emailOrLogin || '').trim(), password: String(password || '').trim() }),
        credentials: 'include',
      });
    } catch (e) {
      throw mapFetchFailure(e);
    }
    const text = await res.text();
    const data = parseResponseJson(text);
    if (data === null) {
      const low = String(text).slice(0, 120).toLowerCase();
      if (low.includes('<!doctype') || low.includes('<html')) {
        throw new Error(
          "Server HTML sahifa qaytardi — odatda API ishlamayapti yoki /api proxy sozlanmagan. Backend ni ishga tushiring.",
        );
      }
      if (!res.ok) throw new Error(extractHttpErrorMessage(res, {}));
      throw new Error('Server javobi noto\'g\'ri.');
    }
    if (!res.ok) {
      throw new Error(extractHttpErrorMessage(res, data));
    }

    const access = data.access ?? data.accessToken;
    if (!access) throw new Error('Server token qaytarmadi. Qayta urinib ko\'ring.');
    if (!data.user) throw new Error('Server foydalanuvchi ma\'lumotini qaytarmadi.');

    persistTokens(data);
    setUser(data.user);
    setAuthStatus('authenticated');
    setAuthMessage('');
    return data;
  };

  const register = async (email, password, full_name) => {
    let res;
    try {
      res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name }),
        credentials: 'include',
      });
    } catch (e) {
      throw mapFetchFailure(e);
    }
    const text = await res.text();
    const data = parseResponseJson(text);
    if (data === null) {
      const low = String(text).slice(0, 120).toLowerCase();
      if (low.includes('<!doctype') || low.includes('<html')) {
        throw new Error("Server HTML qaytardi. Backend va /api sozlamalarini tekshiring.");
      }
      if (!res.ok) throw new Error(extractHttpErrorMessage(res, {}));
      throw new Error('Server javobi noto\'g\'ri.');
    }
    if (!res.ok) {
      throw new Error(extractHttpErrorMessage(res, data));
    }

    persistTokens(data);
    setUser(data.user);
    setAuthStatus('authenticated');
    setAuthMessage('');
    return data;
  };

  const logout = () => {
    clearSession('guest', '');
  };

  const updateProfile = useCallback(
    async (body) => {
      const res = await request('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const data = parseResponseJson(text);
      if (!res.ok) {
        throw new Error(extractHttpErrorMessage(res, data === null ? {} : data));
      }
      if (data?.user) {
        setUser(data.user);
        return data.user;
      }
      await bootstrapSession();
      return null;
    },
    [request, bootstrapSession]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authStatus,
        authMessage,
        login,
        register,
        logout,
        request,
        updateProfile,
        retrySession: bootstrapSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
