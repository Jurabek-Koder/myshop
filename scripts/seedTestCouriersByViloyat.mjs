import Database from 'better-sqlite3';
import { PACKER_UZ_VILOYATLAR, buildCourierRegionServiceText } from '../src/utils/viloyatPacker.js';

const db = new Database('./data/myshop.db');

const insertCourier = db.prepare(`
  INSERT INTO staff_members (
    staff_type,
    full_name,
    phone,
    status,
    region_id,
    region_service_text,
    orders_handled,
    rating,
    balance
  ) VALUES ('courier', ?, ?, 'active', NULL, ?, 0, 5, 0)
`);

const existsCourierByName = db.prepare(`
  SELECT id, full_name, region_service_text
  FROM staff_members
  WHERE staff_type = 'courier' AND full_name = ?
  LIMIT 1
`);

const created = [];
const existing = [];

const tx = db.transaction(() => {
  for (const [idx, entry] of PACKER_UZ_VILOYATLAR.entries()) {
    const idx1 = idx + 1;
    const name = `[TEST] ${entry.id.toUpperCase()} Kuryer`;
    const phone = `+99890000${String(idx1).padStart(4, '0')}`;
    const regionService = buildCourierRegionServiceText(entry.id, []);
    const found = existsCourierByName.get(name);
    if (found) {
      existing.push({ id: found.id, name: found.full_name, region: found.region_service_text || regionService });
      continue;
    }
    const r = insertCourier.run(name, phone, regionService);
    created.push({ id: Number(r.lastInsertRowid), name, region: regionService });
  }
});

tx();

const totalCouriers = db.prepare(`SELECT COUNT(*) AS c FROM staff_members WHERE staff_type = 'courier'`).get().c;

console.log(`Created test couriers: ${created.length}`);
console.log(`Already existed: ${existing.length}`);
console.log(`Total couriers in DB: ${totalCouriers}`);

if (created.length) {
  console.log('--- Newly created ---');
  for (const c of created) {
    console.log(`#${c.id} | ${c.name} | ${c.region}`);
  }
}
