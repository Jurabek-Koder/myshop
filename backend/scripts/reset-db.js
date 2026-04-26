/**
 * Bazani tozalash — barcha foydalanuvchilar va ma'lumotlar o'chiriladi.
 * Keyingi backend ishga tushganda yangi bazadan boshlanadi.
 * Ishlatish: node scripts/reset-db.js yoki npm run reset-db
 */
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');

if (existsSync(dbPath)) {
  unlinkSync(dbPath);
  console.log('Baza tozalandi: myshop.db o\'chirildi. Backend qayta ishga tushganda yangi baza yaratiladi.');
} else {
  console.log('Baza fayli topilmadi. Allaqachon toza.');
}
