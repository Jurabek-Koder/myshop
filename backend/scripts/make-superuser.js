import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const email = process.argv[2]?.trim();

if (!email) {
  console.error('Foydalanish: npm run make-superuser -- <email>');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const user = db.prepare('SELECT id, email, role, role_id FROM users WHERE lower(email) = lower(?)').get(email);
if (!user) {
  console.error(`Foydalanuvchi topilmadi: ${email}`);
  process.exit(1);
}

db.prepare('UPDATE users SET role = ?, role_id = 1 WHERE id = ?').run('superuser', user.id);

console.log(`Superuser qilindi: ${user.email} (id=${user.id})`);
