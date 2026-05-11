/**
 * Hold sinovi: 1 ta mahsulot, 2 ta hold zakaz, ombor = 0.
 * Telefon: HOLDTEST01 / HOLDTEST02 (is_test=1) — har qanday packer Hold sahifasida ko‘radi.
 *
 * Ishlatish: npm run seed-packer-hold-test
 * Ma’lum packer: npm run seed-packer-hold-test -- 7
 *
 * O‘chirish: npm run delete-test-orders (HOLDTEST% ham qamrab oladi)
 */
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const user = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!user) {
  console.error("Bazada foydalanuvchi yo'q.");
  process.exit(1);
}

const argvPackerId = parseInt(process.argv[2], 10);
let packer;
if (Number.isFinite(argvPackerId) && argvPackerId > 0) {
  packer = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ? AND staff_type = ?').get(argvPackerId, 'packer');
  if (!packer) {
    console.error(`Packer staff id=${argvPackerId} topilmadi.`);
    process.exit(1);
  }
} else {
  packer = db.prepare("SELECT id, full_name FROM staff_members WHERE staff_type = 'packer' ORDER BY id LIMIT 1").get();
}

if (!packer) {
  console.error("Bazada packer yo'q (staff_members, staff_type='packer').");
  process.exit(1);
}

const oldIds = db.prepare("SELECT id FROM orders WHERE contact_phone LIKE 'HOLDTEST%'").all();
for (const { id } of oldIds) {
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}
if (oldIds.length) {
  console.log(`Oldingi HOLD test zakazlari olib tashlandi: ${oldIds.length} ta.`);
}

let product = db.prepare("SELECT id, price FROM products WHERE category = 'hold_test_seed' LIMIT 1").get();
if (!product) {
  const ins = db.prepare(`
    INSERT INTO products (name_uz, name_ru, description_uz, price, currency, category, stock)
    VALUES (?, ?, ?, ?, 'UZS', 'hold_test_seed', 0)
  `);
  const r = ins.run(
    'HOLD TEST — bitta mahsulot',
    'hold test product',
    'Hold sinov: 2 zakaz, ombor 0',
    19990
  );
  product = { id: Number(r.lastInsertRowid), price: 19990 };
}

const price = Number(product.price) || 19990;
db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(product.id);

const insOrder = db.prepare(`
  INSERT INTO orders (user_id, status, total_amount, currency, shipping_address, contact_phone, packer_id, is_test)
  VALUES (?, 'hold', ?, 'UZS', ?, ?, ?, 1)
`);
const insItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, price_at_order)
  VALUES (?, ?, ?, ?)
`);

const tx = db.transaction(() => {
  for (let n = 1; n <= 2; n++) {
    const qty = n === 1 ? 1 : 2;
    const total = price * qty;
    const phone = `HOLDTEST${String(n).padStart(2, '0')}`;
    const address = `HOLD TEST manzil · zakaz ${n}/2 · ombor 0`;
    const result = insOrder.run(user.id, total, address, phone, packer.id);
    const orderId = Number(result.lastInsertRowid);
    insItem.run(orderId, product.id, qty, price);
  }
});

tx();

console.log('Qo‘shildi: 2 ta hold zakaz (1 mahsulot, stock=0).');
console.log(`  Packer: #${packer.id} ${packer.full_name || ''}`.trim());
console.log(`  Mahsulot #${product.id} — ${price} so'm (1 dona + 2 dona zakazlar)`);
console.log('  Packer UI: Hold bo‘limi.');
console.log("  O‘chirish: npm run delete-test-orders");
