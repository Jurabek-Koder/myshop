/**
 * Kuryer «suhbati» sinovi: har bir tizimga kirgan kuryer (staff + user bog‘langan) uchun
 * alohida 1 ta TEST KURYER buyurtma (o‘chiriladi-qayta yaratiladi).
 *
 * Ishlatish: npm run seed-one-courier-order
 * Faqat bitta staff id: npm run seed-one-courier-order -- 10
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

const product = db.prepare('SELECT id, price FROM products ORDER BY id LIMIT 1').get();
if (!product) {
  console.error("Bazada mahsulot yo'q.");
  process.exit(1);
}

const argvCourierId = parseInt(process.argv[2], 10);
let courierRows;
if (Number.isFinite(argvCourierId) && argvCourierId > 0) {
  const one = db.prepare('SELECT id, full_name FROM staff_members WHERE id = ? AND staff_type = ?').get(argvCourierId, 'courier');
  courierRows = one ? [one] : [];
  if (!courierRows.length) {
    console.error(`Kuryer staff id=${argvCourierId} topilmadi.`);
    process.exit(1);
  }
} else {
  courierRows = db
    .prepare(
      `
    SELECT sm.id, sm.full_name
    FROM staff_members sm
    WHERE sm.staff_type = 'courier' AND sm.user_id IS NOT NULL
    ORDER BY sm.id
  `
    )
    .all();
  if (!courierRows.length) {
    const fallback = db.prepare("SELECT id, full_name FROM staff_members WHERE staff_type = 'courier' ORDER BY id LIMIT 1").get();
    courierRows = fallback ? [fallback] : [];
  }
}

if (!courierRows.length) {
  console.error("Bazada kuryer (staff_members, staff_type='courier') yo'q.");
  process.exit(1);
}

const oldIds = db.prepare("SELECT id FROM orders WHERE shipping_address LIKE 'TEST KURYER%'").all();
for (const { id } of oldIds) {
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}
if (oldIds.length) console.log(`Olib tashlandi: ${oldIds.length} ta eski TEST KURYER buyurtma.`);

const qty = 1;
const total = Number(product.price) * qty;
const phone = '+998901112233';

const insOrder = db.prepare(`
  INSERT INTO orders (user_id, status, total_amount, currency, shipping_address, contact_phone, courier_id)
  VALUES (?, 'on_the_way', ?, 'UZS', ?, ?, ?)
`);
const insItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, price_at_order)
  VALUES (?, ?, ?, ?)
`);

let n = 0;
for (const courier of courierRows) {
  const shipping = `TEST KURYER — ${courier.full_name || 'Kuryer'} (sinov)`;
  insOrder.run(user.id, total, shipping, phone, courier.id);
  const orderId = db.prepare('SELECT last_insert_rowid() as id').get().id;
  insItem.run(orderId, product.id, qty, product.price);
  const loginRow = db.prepare('SELECT login FROM users WHERE staff_member_id = ? LIMIT 1').get(courier.id);
  console.log(`#${orderId} → staff ${courier.id} (${courier.full_name || '—'})${loginRow?.login ? `, login «${loginRow.login}»` : ''}`);
  n++;
}

console.log(`Jami ${n} ta test buyurtma yaratildi. Holat: on_the_way`);
console.log('Kuryer panelida «Kuryer suhbati» → Yangilash.');
console.log("O'chirish: npm run delete-test-orders");
process.exit(0);
