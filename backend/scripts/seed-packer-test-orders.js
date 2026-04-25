/**
 * Packer sinovi: 5 ta picked buyurtma — 5 xil mahsulot kartochkasi (asosiy sahifa).
 * Oxirgi (5-) mahsulotning ombor qoldig‘i 0 ga tushiriladi.
 *
 * Talab: kamida 5 ta mahsulot, bitta packer (staff_members).
 * Ishlatish: npm run seed-packer-test-orders
 * Ma’lum packer staff id: npm run seed-packer-test-orders -- 7
 *
 * O‘chirish: npm run delete-test-orders
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
  console.error("Bazada packer yo'q (staff_members, staff_type='packer'). Avval admin orqali qo'shing.");
  process.exit(1);
}

function ensureMinProductCount(min) {
  const ins = db.prepare(`
    INSERT INTO products (name_uz, name_ru, description_uz, price, currency, category, stock)
    VALUES (?, ?, ?, ?, 'UZS', 'packer_seed', ?)
  `);
  let count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  let i = 0;
  while (count < min) {
    i += 1;
    ins.run(`PACKER SEED ${i}`, `seed ${i}`, 'Avtomatik sinov (packer)', 11000 + i * 400, 70);
    count += 1;
  }
  if (i > 0) console.log(`Qo‘shildi: ${i} ta mahsulot (jami kamida ${min} ta bo‘lishi uchun).`);
}

ensureMinProductCount(5);

const pickedFive = db.prepare('SELECT id, price, name_uz, stock FROM products ORDER BY id ASC LIMIT 5').all();
const zeroStockProduct = pickedFive[4];

const oldIds = db.prepare("SELECT id FROM orders WHERE contact_phone LIKE 'PACKERTEST%'").all();
for (const { id } of oldIds) {
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}
if (oldIds.length) {
  console.log(`Oldingi packer test zakazlari olib tashlandi: ${oldIds.length} ta.`);
}

/** 1–4 kartochkalar uchun ombor soni */
for (let i = 0; i < 4; i++) {
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(60 + i * 15, pickedFive[i].id);
}

const insOrder = db.prepare(`
  INSERT INTO orders (user_id, status, total_amount, currency, shipping_address, contact_phone, packer_id, is_test)
  VALUES (?, 'picked', ?, 'UZS', ?, ?, ?, 1)
`);
const insItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, price_at_order)
  VALUES (?, ?, ?, ?)
`);

const tx = db.transaction(() => {
  for (let i = 0; i < 5; i++) {
    const p = pickedFive[i];
    const qty = 1 + (i % 3);
    const price = Number(p.price) || 0;
    const total = price * qty;
    const n = i + 1;
    const phone = `PACKERTEST${String(n).padStart(2, '0')}`;
    const address = `TEST PACKER — Kartochka #${n}${i === 4 ? ' (ombor 0)' : ''}`;
    const result = insOrder.run(user.id, total, address, phone, packer.id);
    const orderId = Number(result.lastInsertRowid);
    insItem.run(orderId, p.id, qty, price);
  }
  db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(zeroStockProduct.id);
});

tx();

console.log('Qo‘shildi: 5 ta picked buyurtma (5 ta mahsulot kartochkasi, asosiy sahifa).');
console.log(`  Packer: #${packer.id} ${packer.full_name || ''}`.trim());
pickedFive.forEach((p, i) => {
  const stockNote = i === 4 ? ' ← ombor 0' : '';
  console.log(`    ${i + 1}. #${p.id} ${p.name_uz}${stockNote}`);
});
console.log("O‘chirish: npm run delete-test-orders");
