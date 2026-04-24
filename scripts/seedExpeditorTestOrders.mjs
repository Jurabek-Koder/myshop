import Database from 'better-sqlite3';

const db = new Database('./data/myshop.db');
const count = Math.max(1, Math.min(400, Number(process.argv[2] || 40)));

const user = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!user) {
  console.error('No users found. Create at least one user first.');
  process.exit(1);
}

const viloyatlar = [
  ['andijon', 'Andijon viloyati, Andijon shahri'],
  ['buxoro', 'Buxoro viloyati, Buxoro shahri'],
  ['fargona', 'Fargona viloyati, Fargona shahri'],
  ['jizzax', 'Jizzax viloyati, Jizzax shahri'],
  ['xorazm', 'Xorazm viloyati, Urganch shahri'],
  ['namangan', 'Namangan viloyati, Namangan shahri'],
  ['navoiy', 'Navoiy viloyati, Navoiy shahri'],
  ['qashqadaryo', 'Qashqadaryo viloyati, Qarshi shahri'],
  ['samarqand', 'Samarqand viloyati, Samarqand shahri'],
  ['sirdaryo', 'Sirdaryo viloyati, Guliston shahri'],
  ['surxondaryo', 'Surxondaryo viloyati, Termiz shahri'],
  ['toshkent_v', 'Toshkent viloyati, Bekobod shahri'],
  ['toshkent_sh', 'Toshkent shahri, Chilonzor tumani'],
  ['qoraqalpoq', "Qoraqalpog'iston Respublikasi, Nukus shahri"],
];

function fmtSqlDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

const insertOrder = db.prepare(`
  INSERT INTO orders (
    user_id,
    status,
    total_amount,
    currency,
    shipping_address,
    contact_phone,
    is_test,
    courier_id,
    packer_id,
    packer_batch_id,
    courier_assigned_via,
    status_updated_at,
    created_at
  ) VALUES (?, 'packaged', ?, 'UZS', ?, ?, 1, NULL, NULL, NULL, NULL, ?, ?)
`);

const now = Date.now();
const tx = db.transaction(() => {
  for (let i = 0; i < count; i += 1) {
    const [vId, address] = viloyatlar[i % viloyatlar.length];
    const d = new Date(now - i * 75 * 1000);
    const at = fmtSqlDate(d);
    const amount = 120000 + ((i * 17000) % 280000);
    insertOrder.run(
      user.id,
      amount,
      `${address} · TEST-${vId.toUpperCase()}-${i + 1}`,
      `PACKERTEST${10000 + i}`,
      at,
      at
    );
  }
});

tx();

const total = db
  .prepare(
    "SELECT COUNT(*) AS c FROM orders WHERE status = 'packaged' AND (courier_id IS NULL OR courier_id = 0) AND contact_phone LIKE 'PACKERTEST%'"
  )
  .get().c;

const byRegion = {};
for (const [id] of viloyatlar) byRegion[id] = 0;
const rows = db
  .prepare("SELECT shipping_address FROM orders WHERE status='packaged' AND contact_phone LIKE 'PACKERTEST%'")
  .all();
for (const r of rows) {
  const s = String(r.shipping_address || '').toLowerCase();
  const found = viloyatlar.find(([id]) => s.includes(id === 'qoraqalpoq' ? 'qoraqalpog' : id.split('_')[0]));
  if (found) byRegion[found[0]] += 1;
}

console.log(`Seeded ${count} test packaged orders.`);
console.log(`Total packaged test orders now: ${total}`);
console.log(byRegion);
