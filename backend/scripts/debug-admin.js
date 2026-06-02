import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'myshop.db');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%role%' OR name LIKE '%staff%' OR name LIKE '%user%')").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

const wr = db.prepare("SELECT * FROM work_roles WHERE lower(login) LIKE '%admin%' OR lower(IFNULL(email,'')) LIKE '%admin%'").all();
console.log('work_roles matches:', JSON.stringify(wr.map(r => ({id: r.id, login: r.login, email: r.email, password: r.password, portal_role: r.portal_role, role_name: r.role_name})), null, 2));
