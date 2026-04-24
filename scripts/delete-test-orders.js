/**
 * Test zakazlarni o'chirish: contact_phone TEST% / PACKERTEST% yoki manzil TEST KURYER% (kuryer sinov zakazi).
 * Ishlatish: node scripts/delete-test-orders.js yoki npm run delete-test-orders
 */
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const ids = db.prepare(
  `SELECT id FROM orders
   WHERE contact_phone LIKE 'TEST%'
      OR contact_phone LIKE 'PACKERTEST%'
      OR contact_phone LIKE 'HOLDTEST%'
      OR shipping_address LIKE 'TEST KURYER%'
      OR shipping_address LIKE 'TEST PACKER%'
      OR shipping_address LIKE 'HOLD TEST%'`
).all();
const orderIds = ids.map((r) => r.id);

if (orderIds.length === 0) {
  console.log('Test zakazlar topilmadi.');
  process.exit(0);
}

db.prepare('DELETE FROM order_items WHERE order_id IN (' + orderIds.map(() => '?').join(',') + ')').run(...orderIds);
db.prepare('DELETE FROM orders WHERE id IN (' + orderIds.map(() => '?').join(',') + ')').run(...orderIds);

console.log(`${orderIds.length} ta test zakaz o'chirildi.`);
process.exit(0);
