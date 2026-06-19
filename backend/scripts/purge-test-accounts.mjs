/**
 * Test/demo akkauntlar va bog‘liq ma’lumotlarni bazadan tozalash.
 * Ishlatish: node scripts/purge-test-accounts.mjs
 * Avvalo nusxa: data/backups/pre-purge-<timestamp>.db
 */
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'data', 'myshop.db');
const backupsDir = join(root, 'data', 'backups');

const TEST_LOGINS = new Set([
  'packer01',
  'packer',
  'picker01',
  'operator01',
  'account01',
  'ekspeditor',
  'atkaz',
  'aziz',
  'saman',
  'seller',
  'admin',
  'ombor_admini',
  'ombor_admini2',
  'joratarget',
  'premium',
  'smart',
  'fast',
  'courierlead',
]);

const TEST_STAFF_NAMES = new Set([
  'aziz kuryer',
  'dilshod operator',
  'madina packer',
  'sardor picker',
  'packer',
  'picker',
]);

const TEST_SELLER_NAMES = new Set(['premium tech', 'smart trade', 'fast mobile']);
const TEST_PHONES = new Set(['+998901000101', '+998901000102', '+998901000103', '+998901000104']);

function isTestUser(u) {
  if (!u) return false;
  if (u.role === 'superuser' || Number(u.role_id) === 1) return false;
  const login = String(u.login || '').trim().toLowerCase();
  const email = String(u.email || '').trim().toLowerCase();
  const name = String(u.full_name || '').trim().toLowerCase();
  if (TEST_LOGINS.has(login)) return true;
  if (email.endsWith('@courier.myshop.local')) return true;
  if (name === 'packer' || name === 'picker' || name === 'ekspeditor' || name === 'atkaz' || name === 'buxgalter')
    return true;
  if (name === 'kuryer' && login === 'aziz') return true;
  if (name === 'ombor admini') return true;
  if (login === 'seller' && email === 'seller@myshop.uz') return true;
  return false;
}

function isTestStaff(s) {
  if (!s) return false;
  const name = String(s.full_name || '').trim().toLowerCase();
  if (TEST_STAFF_NAMES.has(name)) return true;
  if (TEST_PHONES.has(String(s.phone || '').trim())) return true;
  return false;
}

if (!existsSync(dbPath)) {
  console.error('Baza topilmadi:', dbPath);
  process.exit(1);
}

if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = join(backupsDir, `pre-purge-${stamp}.db`);
copyFileSync(dbPath, backupPath);
console.log('Nusxa:', backupPath);

const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

const users = db.prepare('SELECT * FROM users').all();
const testUserIds = users.filter(isTestUser).map((u) => u.id);
const staff = db.prepare('SELECT * FROM staff_members').all();
const testStaffIds = staff
  .filter((s) => isTestStaff(s) || (s.user_id && testUserIds.includes(s.user_id)))
  .map((s) => s.id);

const wrRows = db.prepare('SELECT * FROM work_roles').all();
const testWrIds = wrRows
  .filter((r) => {
    const login = String(r.login || '').trim().toLowerCase();
    const pwd = String(r.password || '').trim();
    return TEST_LOGINS.has(login) || pwd === '12345';
  })
  .map((r) => r.id);

const sellers = db.prepare('SELECT * FROM sellers').all();
const testSellerIds = sellers
  .filter((s) => {
    const name = String(s.name || '').trim().toLowerCase();
    const email = String(s.email || '').trim().toLowerCase();
    return (
      TEST_SELLER_NAMES.has(name) ||
      ['premium@myshop.uz', 'smart@myshop.uz', 'fast@myshop.uz'].includes(email) ||
      (s.user_id && testUserIds.includes(s.user_id))
    );
  })
  .map((s) => s.id);

const run = db.transaction(() => {
  const del = (sql, params = []) => db.prepare(sql).run(...params);

  // Test buyurtmalar
  const testOrderIds = [];
  if (testUserIds.length) {
    const ph = testUserIds.map(() => '?').join(',');
    testOrderIds.push(
      ...db
        .prepare(
          `SELECT id FROM orders
           WHERE COALESCE(is_test, 0) = 1
              OR contact_phone LIKE 'PACKERTEST%'
              OR contact_phone LIKE 'HOLDTEST%'
              OR user_id IN (${ph})`,
        )
        .all(...testUserIds)
        .map((r) => r.id),
    );
  } else {
    testOrderIds.push(
      ...db
        .prepare(
          `SELECT id FROM orders
           WHERE COALESCE(is_test, 0) = 1
              OR contact_phone LIKE 'PACKERTEST%'
              OR contact_phone LIKE 'HOLDTEST%'`,
        )
        .all()
        .map((r) => r.id),
    );
  }

  if (testOrderIds.length) {
    const ph = testOrderIds.map(() => '?').join(',');
    del(`DELETE FROM order_items WHERE order_id IN (${ph})`, testOrderIds);
    del(`DELETE FROM user_device_events WHERE order_id IN (${ph})`, testOrderIds);
    del(`DELETE FROM orders WHERE id IN (${ph})`, testOrderIds);
  }

  if (testStaffIds.length) {
    const ph = testStaffIds.map(() => '?').join(',');
    del(`UPDATE orders SET packer_id = NULL WHERE packer_id IN (${ph})`, testStaffIds);
    del(`UPDATE orders SET courier_id = NULL WHERE courier_id IN (${ph})`, testStaffIds);
  }

  if (testSellerIds.length) {
    const ph = testSellerIds.map(() => '?').join(',');
    del(`DELETE FROM seller_notifications WHERE seller_id IN (${ph})`, testSellerIds);
    del(`DELETE FROM target_favorites WHERE product_id IN (SELECT id FROM products WHERE seller_id IN (${ph}))`, testSellerIds);
    del(`DELETE FROM products WHERE seller_id IN (${ph})`, testSellerIds);
    del(`DELETE FROM sellers WHERE id IN (${ph})`, testSellerIds);
  }

  if (testUserIds.length) {
    const ph = testUserIds.map(() => '?').join(',');
    const tablesWithUserId = [
      'user_password_history',
      'target_favorites',
      'target_affiliate_streams',
      'target_notifications',
      'staff_chat_dm_messages',
      'staff_chat_presence',
      'staff_chat_call_logs',
    ];
    for (const table of tablesWithUserId) {
      try {
        del(`DELETE FROM ${table} WHERE user_id IN (${ph})`, testUserIds);
      } catch {
        /* jadval bo‘lmasa */
      }
    }
    try {
      del(
        `DELETE FROM staff_chat_dm_messages WHERE sender_user_id IN (${ph}) OR peer_user_id IN (${ph})`,
        [...testUserIds, ...testUserIds],
      );
    } catch {
      /* */
    }
    del(`DELETE FROM users WHERE id IN (${ph})`, testUserIds);
  }

  if (testWrIds.length) {
    const ph = testWrIds.map(() => '?').join(',');
    try {
      del(`DELETE FROM work_role_ledger_entries WHERE work_role_id IN (${ph})`, testWrIds);
    } catch {
      /* */
    }
    try {
      del(`DELETE FROM staff_withdrawal_requests WHERE work_role_id IN (${ph})`, testWrIds);
    } catch {
      /* */
    }
    del(`DELETE FROM work_roles WHERE id IN (${ph})`, testWrIds);
  }

  if (testStaffIds.length) {
    const ph = testStaffIds.map(() => '?').join(',');
    del(`UPDATE users SET staff_member_id = NULL WHERE staff_member_id IN (${ph})`, testStaffIds);
    del(`DELETE FROM staff_members WHERE id IN (${ph})`, testStaffIds);
  }
});

run();

db.pragma('foreign_keys = ON');
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

console.log('O‘chirildi:');
console.log('  users:', testUserIds.length);
console.log('  staff_members:', testStaffIds.length);
console.log('  work_roles:', testWrIds.length);
console.log('  sellers:', testSellerIds.length);
console.log('Tayyor.');
