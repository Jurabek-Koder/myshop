/**
 * Istalgan rol (superuser, picker, seller, kuryer, ...) uchun login/parolni o'rnatish.
 * users jadvalidagi foydalanuvchi va work_roles dagi login yangilanadi, shunda login har ikkala yo'l orqali ishlaydi.
 * Foydalanish: node scripts/set-role-password.js <email_yoki_login> <parol>
 * Masalan: node scripts/set-role-password.js picker1 MyPass123!
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const identifier = process.argv[2]?.trim();
const password = process.argv[3]?.trim();

if (!identifier || !password) {
  console.error('Foydalanish: node scripts/set-role-password.js <email_yoki_login> <parol>');
  console.error('Masalan: node scripts/set-role-password.js picker1 MyPass123!');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Parol kamida 6 belgidan iborat bo\'lishi kerak.');
  process.exit(1);
}

const key = identifier.toLowerCase();
const keyBeforeAt = key.includes('@') ? key.split('@')[0] : key;
const hash = bcrypt.hashSync(password, 12);

let updated = false;

const user = db.prepare(`
  SELECT id, email, login, role FROM users
  WHERE lower(email) = ? OR lower(IFNULL(login, '')) = ? OR lower(email) = ? OR lower(IFNULL(login, '')) = ?
  LIMIT 1
`).get(key, key, keyBeforeAt, keyBeforeAt);

if (user) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  console.log('users: parol yangilandi. Login:', user.email || user.login, '| Rol:', user.role);
  updated = true;
}

const workRole = db.prepare(`
  SELECT id, login, email, role_name FROM work_roles
  WHERE deleted_at IS NULL AND (lower(login) = ? OR lower(IFNULL(email, '')) = ? OR lower(login) = ? OR lower(IFNULL(email, '')) = ?)
  LIMIT 1
`).get(key, key, keyBeforeAt, keyBeforeAt);

if (workRole) {
  db.prepare('UPDATE work_roles SET password = ? WHERE id = ?').run(password, workRole.id);
  console.log('work_roles: parol yangilandi. Login:', workRole.login || workRole.email, '| Rol:', workRole.role_name);
  updated = true;
}

if (!updated) {
  console.error('Bunday email yoki login topilmadi (na users, na work_roles da).');
  db.close();
  process.exit(1);
}

console.log('Endi shu login/email va parol bilan kiring.');
db.close();
