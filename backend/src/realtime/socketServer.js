import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { security } from '../config/security.js';
import { eventBus, EVENT_BUS_ALL } from '../events/eventBus.js';
import { isUserLoginAllowed } from '../lib/portalAccess.js';

let io = null;

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
      if (!user || !isUserLoginAllowed(user) || !canUseEnterpriseRealtime(user)) {
        return next(new Error('Ruxsat yo\'q.'));
      }
      socket.user = user;
      return next();
    } catch {
      return next(new Error('Token yaroqsiz yoki muddati tugagan.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('enterprise-command-center');
    socket.emit('enterprise:ready', {
      ok: true,
      user_id: socket.user?.id ?? null,
      connected_at: new Date().toISOString(),
    });
  });

  eventBus.on(EVENT_BUS_ALL, (event) => {
    io.to('enterprise-command-center').emit('enterprise:event', event);
  });

  return io;
}

export function getRealtimeServer() {
  return io;
}
