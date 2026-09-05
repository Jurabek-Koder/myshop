import { io } from 'socket.io-client';

function readToken() {
  try {
    return sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken') || '';
  } catch {
    return '';
  }
}

function socketBaseUrl() {
  const explicit = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (explicit) return explicit;
  const proxyTarget = String(import.meta.env.VITE_API_PROXY_TARGET || '').replace(/\/$/, '');
  if (proxyTarget) return proxyTarget;
  if (import.meta.env.DEV) return 'http://127.0.0.1:3000';
  return window.location.origin;
}

export function connectEnterpriseRealtime({ onEvent, onReady, onError } = {}) {
  const token = readToken();
  if (!token) return null;

  const socket = io(socketBaseUrl(), {
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
  });

  socket.on('enterprise:ready', (payload) => {
    if (typeof onReady === 'function') onReady(payload);
  });
  socket.on('enterprise:event', (event) => {
    if (typeof onEvent === 'function') onEvent(event);
  });
  socket.on('connect_error', (err) => {
    if (typeof onError === 'function') onError(err);
  });

  return socket;
}
