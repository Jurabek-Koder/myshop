/**
 * useWebSocket.js — Real-time yangilanishlar uchun WebSocket hook
 *
 * Ishlatish:
 *   const { lastMessage, connected } = useWebSocket({ role: 'courier', token });
 *
 *   useEffect(() => {
 *     if (lastMessage?.type === 'order_update') {
 *       refetchOrders(); // yangilash
 *     }
 *   }, [lastMessage]);
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_BASE = import.meta.env.VITE_WS_URL
  || (typeof window !== 'undefined'
    ? window.location.origin.replace(/^http/, 'ws')
    : 'ws://localhost:3000');

export function useWebSocket({ role, token, onMessage, enabled = true }) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!enabled || !role || !token) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return; // allaqachon ulanmoqda

    const url = `${WS_BASE}/ws?role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`;
    const ws = new window.WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      // Qayta ulanish timerni tozalash
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        onMessage?.(data);
      } catch {
        // JSON bo'lmasa e'tiborsiz
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      wsRef.current = null;
      // 5 soniyadan keyin qayta ulanish
      if (enabled) {
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 5000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [role, token, enabled, onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, lastMessage, send };
}
