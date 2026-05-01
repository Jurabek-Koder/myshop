import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __d = path.dirname(fileURLToPath(import.meta.url));

/**
 * Baza fayllari (SQLite) va yuklanmalar — Render kabi muhitda bitta doimiy diskda saqlanishi kerak.
 * Aks holda qayta deploy / «sleep» dan keyin myshop.db yo‘qoladi: login / ro‘yxat qayta talab.
 *
 * Lokal: sukut — `backend/data`
 * Render: Environment → MYSHOP_DATA_DIR = disk o‘rnatilgan mountPath (masalan: /data/myshop)
 */
export function getDataDir() {
  const env = process.env.MYSHOP_DATA_DIR && String(process.env.MYSHOP_DATA_DIR).trim();
  if (env) {
    const root = path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    return root;
  }
  const d = path.join(__d, '..', '..', 'data');
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

export function getSqlitePath() {
  return path.join(getDataDir(), 'myshop.db');
}

/**
 * MYSHOP_DATA_DIR bo‘lsa — barcha yuklanmalar shu tarmoq/diskda (doimiy).
 * Aks holda: `backend/uploads` (process.cwd() = backend/ dan ishga tushganda)
 */
export function getUploadsRoot() {
  if (process.env.MYSHOP_DATA_DIR && String(process.env.MYSHOP_DATA_DIR).trim()) {
    const u = path.join(getDataDir(), 'uploads');
    if (!existsSync(u)) mkdirSync(u, { recursive: true });
    return u;
  }
  const u = path.join(process.cwd(), 'uploads');
  if (!existsSync(u)) mkdirSync(u, { recursive: true });
  return u;
}

export function adSlidesUploadPath() {
  return path.join(getUploadsRoot(), 'ad-slides');
}

export function staffChatUploadPath() {
  return path.join(getUploadsRoot(), 'staff-chat');
}
