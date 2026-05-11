/**
 * Test zakazlarni qo'shish — Picker Zakazlar sahifasi uchun.
 * Ishlatish: node scripts/seed-test-orders.js yoki npm run seed-test-orders
 */
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const user = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!user) {
  console.error('Bazada foydalanuvchi yo\'q. Avval backend ishga tushiring.');
  process.exit(1);
}

const products = db.prepare('SELECT id, price FROM products ORDER BY id LIMIT 10').all();
if (products.length === 0) {
  console.error('Bazada mahsulot yo\'q. Avval backend ishga tushiring.');
  process.exit(1);
}

const insOrder = db.prepare(`
  INSERT INTO orders (user_id, status, total_amount, currency, shipping_address, contact_phone)
  VALUES (?, 'pending', ?, 'UZS', ?, ?)
`);
const insItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, price_at_order)
  VALUES (?, ?, ?, ?)
`);

const count = parseInt(process.argv[2], 10) || 5;
const rounds = parseInt(process.argv[3], 10) || 1;
let created = 0;
let globalIndex = 0;

for (let r = 0; r < rounds; r++) {
  for (let i = 0; i < count; i++) {
    globalIndex++;
    const product = products[globalIndex % products.length];
    const qty = 1 + (globalIndex % 3);
    const total = product.price * qty;
    insOrder.run(
      user.id,
      total,
      `TEST — Manzil ${globalIndex}, Toshkent`,
      `TEST${String(globalIndex).padStart(3, '0')}`
    );
    const orderId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    insItem.run(orderId, product.id, qty, product.price);
    created++;
  }
}

console.log(`${created} ta test zakaz qo'shildi (${rounds} aylanish × ${count} ta). Zakazlar sahifasida Yangilash bosing.`);
console.log('O\'chirish: npm run delete-test-orders');
