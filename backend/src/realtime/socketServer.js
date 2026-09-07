import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { security } from '../config/security.js';
import { eventBus, EVENT_BUS_ALL } from '../events/eventBus.js';
import { isUserLoginAllowed } from '../lib/portalAccess.js';
import { registerCallSignaling } from './callSignaling.js';

let io = null;

/** userId -> Set<socketId> — bir foydalanuvchi bir nechta oynada onlayn bo'lishi mumkin. */
export const onlineUsers = new Map();

export function isUserOnline(userId) {
  const set = onlineUsers.get(Number(userId));
  return Boolean(set && set.size > 0);
}

export function getOnlineUserIds(userIds) {
  return userIds.filter((id) => isUserOnline(id));
}

function loadUser(userId) {
  return db
    .prepare('SELECT id, email, login, full_name, role, role_id, status FROM users WHERE id = ?')
    .get(userId);
}

function tokenFromSocket(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, '').trim();
  const queryToken = socket.handshake?.query?.access_token;
  if (queryToken) return String(queryToken).trim();
  return '';
}

function canUseEnterpriseRealtime(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'superuser' || role === 'admin' || Number(user?.role_id) === 1;
}

/** Umumiy (chat/qo'ng'iroq) realtime — mijoz (customer) bo'lmagan har qanday xodim rol. */
function canUseGeneralRealtime(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return Boolean(role) && role !== 'customer';
}

export function initializeRealtimeServer(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: security.cors.origins,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = tokenFromSocket(socket);
      if (!token) return next(new Error('Kirish talab qilinadi.'));
      const payload = jwt.verify(token, security.jwt.accessSecret, {
        issuer: security.jwt.issuer,
        audience: security.jwt.audience,
      });
      const user = loadUser(payload.sub);
      if (!user || !isUserLoginAllowed(user) || !canUseGeneralRealtime(user)) {
        return next(new Error('Ruxsat yo\'q.'));
      }
      socket.user = user;
      return next();
    } catch {
      return next(new Error('Token yaroqsiz yoki muddati tugagan.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = Number(socket.user?.id);

    if (canUseEnterpriseRealtime(socket.user)) {
      socket.join('enterprise-command-center');
      socket.emit('enterprise:ready', {
        ok: true,
        user_id: socket.user?.id ?? null,
        connected_at: new Date().toISOString(),
      });
    }

    // --- Umumiy onlayn holat kuzatuvi (chat/qo'ng'iroq uchun) ---
    if (Number.isInteger(userId) && userId > 0) {
      if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
      const wasOffline = onlineUsers.get(userId).size === 0;
      onlineUsers.get(userId).add(socket.id);
      socket.join(`user:${userId}`);
      if (wasOffline) {
        io.emit('presence:update', { userId, online: true });
      }

      socket.on('disconnect', () => {
        const set = onlineUsers.get(userId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) {
            onlineUsers.delete(userId);
            io.emit('presence:update', { userId, online: false });
          }
        }
      });
    }

    registerCallSignaling(io, socket);
  });

  eventBus.on(EVENT_BUS_ALL, (event) => {
    io.to('enterprise-command-center').emit('enterprise:event', event);
  });

  return io;
}

export function getRealtimeServer() {
  return io;
}

