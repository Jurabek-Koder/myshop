/**
 * Superuser parolini o'rnatish yoki yangilash.
 * Agar superuser bo'lmasa — yangi superuser yaratadi.
 * Foydalanish: node scripts/set-superuser-password.js <email> <parol>
 * Masalan: node scripts/set-superuser-password.js admin@myshop.uz Admin123!
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const email = process.argv[2]?.trim();
const password = process.argv[3]?.trim();

if (!email || !password) {
  console.error('Foydalanish: node scripts/set-superuser-password.js <email> <parol>');
  console.error('Masalan: node scripts/set-superuser-password.js admin@myshop.uz Admin123!');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Parol kamida 6 belgidan iborat bo\'lishi kerak.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

const userByEmail = db.prepare('SELECT id, email, role FROM users WHERE lower(email) = lower(?)').get(email);

if (userByEmail) {
  db.prepare('UPDATE users SET password_hash = ?, role = ?, role_id = 1 WHERE id = ?').run(hash, 'superuser', userByEmail.id);
  console.log('Superuser paroli o\'rnatildi (mavjud foydalanuvchi).');
  console.log('Login:', email);
  console.log('Parol: (kiritilgan parol)');
  console.log('Endi shu login va parol bilan kiring.');
} else {
  let superuser = db.prepare('SELECT id FROM users WHERE role = ? OR role_id = 1 LIMIT 1').get('superuser');
  if (superuser) {
    db.prepare('UPDATE users SET password_hash = ?, email = ?, login = ? WHERE id = ?').run(
      hash,
      email,
      email.replace(/@.*$/, '').replace(/[^a-z0-9._-]/gi, '').toLowerCase().slice(0, 40) || 'admin',
      superuser.id
    );
    console.log('Superuser email va parol yangilandi.');
  } else {
    const login = email.replace(/@.*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 40) || 'admin';
    db.prepare(`
      INSERT INTO users (email, login, password_hash, full_name, role, role_id)
      VALUES (?, ?, ?, ?, 'superuser', 1)
    `).run(email, login, hash, 'Superuser');
    console.log('Yangi superuser yaratildi.');
  }
  console.log('Login:', email);
  console.log('Endi shu login va parol bilan kiring.');
}

db.close();
