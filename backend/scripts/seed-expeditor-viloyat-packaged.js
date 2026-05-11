/**
 * Ekspeditor viloyat filtri sinovi: barcha viloyatlar + Qoraqalpog‘iston — qadoqlangan,
 * kuryerga berilmagan zakazlar.
 *
 * Default 40 ta (13 hududga taqsimlanadi: 40 = 13×3 + 1).
 * 30 ta: npm run seed-packer-test-orders — EMAS, quyidagini ishlating:
 *       npm run seed-expeditor-viloyat-packaged -- 30
 *
 * O‘chirish: npm run delete-test-orders (EXPEDITORTEST%)
 */
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PACKER_UZ_VILOYATLAR } from '../src/utils/viloyatPacker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const totalArg = parseInt(process.argv[2], 10);
const total =
  Number.isFinite(totalArg) && totalArg >= PACKER_UZ_VILOYATLAR.length && totalArg <= 260
    ? totalArg
    : 40;

const user = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!user) {
  console.error("Bazada foydalanuvchi yo'q.");
  process.exit(1);
}

const product = db.prepare('SELECT id, price FROM products WHERE stock > 10 ORDER BY id LIMIT 1').get();
if (!product) {
  console.error("Mahsulot yo'q yoki zaxira kam (stock > 10).");
  process.exit(1);
}

const oldIds = db.prepare(`SELECT id FROM orders WHERE contact_phone LIKE 'EXPEDITORTEST%'`).all();
for (const { id } of oldIds) {
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}
if (oldIds.length) {
  console.log(`Eski EXPEDITORTEST zakazlar olib tashlandi: ${oldIds.length} ta.`);
}

const regions = PACKER_UZ_VILOYATLAR;
const n = regions.length;
const base = Math.floor(total / n);
let rem = total % n;
const counts = regions.map((_, i) => base + (i < rem ? 1 : 0));

const insOrder = db.prepare(`
  INSERT INTO orders (user_id, status, total_amount, currency, shipping_address, contact_phone, is_test)
  VALUES (?, 'packaged', ?, 'UZS', ?, ?, 1)
`);
const insItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, price_at_order)
  VALUES (?, ?, 1, ?)
`);

let phoneSeq = 1;
const price = Number(product.price) || 10000;

const tx = db.transaction(() => {
  for (let ri = 0; ri < regions.length; ri++) {
    const entry = regions[ri];
    const cnt = counts[ri];
    const addrKey = entry.patterns[0];
    for (let j = 0; j < cnt; j++) {
      const phone = `EXPEDITORTEST${String(phoneSeq).padStart(3, '0')}`;
      phoneSeq += 1;
      const address = `Yetkazish: ${addrKey}, uy ${j + 1} · TEST EXPEDITOR VIL`;
      const ord = insOrder.run(user.id, price, address, phone);
      const orderId = ord.lastInsertRowid;
      insItem.run(orderId, product.id, price);
    }
  }
});

tx();

console.log(`Qo‘shildi: ${total} ta packaged zakaz (${n} hudud: 12 viloyat + Toshkent sh. + Qoraqalpog‘iston).`);
regions.forEach((r, i) => console.log(`  ${r.id}: ${counts[i]} ta`));
console.log('O‘chirish: npm run delete-test-orders');
