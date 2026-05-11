/**
 * wsService.js — Sodda WebSocket xizmati (real-time yangilanishlar)
 *
 * Qo'llab-quvvatlash:
 *   - Rol bo'yicha kanallar: admin, seller, courier, operator, picker, packer, expeditor, order_receiver
 *   - Buyurtma holati o'zgarganda barcha tegishli rollarga xabar
 *   - Ping/pong (aloqa uzilmaslik uchun)
 */

import { WebSocketServer, WebSocket } from 'ws';

/** role → Set<WebSocket> */
const clients = new Map();

function ensureRole(role) {
  if (!clients.has(role)) clients.set(role, new Set());
}

function addClient(role, ws) {
  ensureRole(role);
  clients.get(role).add(ws);
}

function removeClient(role, ws) {
  clients.get(role)?.delete(ws);
}

function broadcast(roles, data) {
  const msg = JSON.stringify(data);
  for (const role of roles) {
    clients.get(role)?.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });
  }
}

/**
 * Buyurtma holati o'zgarganda barcha tegishli rollarga xabar yuborish.
 * @param {object} order - { id, status, ... }
 */
export function notifyOrderUpdate(order) {
  broadcast(
    ['admin', 'operator', 'picker', 'packer', 'courier', 'expeditor', 'order_receiver'],
    { type: 'order_update', order }
  );
}

/**
 * Ma'lum rollarga xabar yuborish.
 */
export function notifyRoles(roles, data) {
  broadcast(roles, data);
}

/**
 * WebSocket serverini HTTP serverga ulash.
 * @param {import('http').Server} httpServer
 */
export function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // URL: /ws?role=courier&token=<jwt>  — token tekshiruvi
    const url = new URL(req.url, 'http://localhost');
    const role = url.searchParams.get('role') || 'guest';
    // Oddiy token tekshiruvi — JWT ni import qilmaslik uchun faqat mavjudligini tekshiramiz
    // To'liq auth kerak bo'lsa middleware/auth.js dan verifyToken import qiling
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Token kerak');
      return;
    }

    ws._role = role;
    addClient(role, ws);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => removeClient(role, ws));
    ws.on('error', () => removeClient(role, ws));

    // Ulanish tasdiqlash
    ws.send(JSON.stringify({ type: 'connected', role }));
  });

  // Har 30 soniyada ping — o'lik ulanishlarni tozalash
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        removeClient(ws._role, ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  console.log('[WS] WebSocket server /ws da ishga tushdi');
  return wss;
}
