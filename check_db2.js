const Database = require('better-sqlite3');
const db = new Database('backend/myshop.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='expeditor_closed_batches'").get().sql);
