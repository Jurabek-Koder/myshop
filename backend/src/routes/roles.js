import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired, requireRole('superuser'));

router.get('/', (req, res) => {
  const roles = db.prepare('SELECT id, name FROM roles ORDER BY id').all();
  const withPages = roles.map((r) => {
    const pages = db.prepare('SELECT page_path FROM role_pages WHERE role_id = ?').all(r.id);
    return { ...r, pages: pages.map((p) => p.page_path) };
  });
  res.json({ roles: withPages });
});

router.get('/pages', (req, res) => {
  const pages = db.prepare('SELECT path, label_uz FROM pages ORDER BY path').all();
  res.json({ pages });
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Role nomi kerak.' });
  }
  try {
    const result = db.prepare('INSERT INTO roles (name) VALUES (?)').run(name.trim());
    const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...role, pages: [] });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Bu role nomi mavjud.' });
    }
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  if (id <= 2) return res.status(403).json({ error: 'superuser va customer rollarini o\'zgartirish mumkin emas.' });
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Role nomi kerak.' });
  }
  const existing = db.prepare('SELECT id FROM roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Role topilmadi.' });
  db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(name.trim(), id);
  const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(id);
  res.json(role);
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  if (id <= 2) return res.status(403).json({ error: 'superuser va customer rollarini o\'chirish mumkin emas.' });
  const existing = db.prepare('SELECT id FROM roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Role topilmadi.' });
  const usersWithRole = db.prepare('SELECT COUNT(*) as c FROM users WHERE role_id = ?').get(id);
  if (usersWithRole.c > 0) {
    return res.status(400).json({ error: 'Bu rolda foydalanuvchilar bor. Avval ularning rolini o\'zgartiring.' });
  }
  db.prepare('DELETE FROM role_pages WHERE role_id = ?').run(id);
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.put('/:id/pages', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Noto\'g\'ri ID.' });
  const { pages } = req.body;
  if (!Array.isArray(pages)) return res.status(400).json({ error: 'pages massiv bo\'lishi kerak.' });
  const existing = db.prepare('SELECT id FROM roles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Role topilmadi.' });
  db.prepare('DELETE FROM role_pages WHERE role_id = ?').run(id);
  const ins = db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)');
  for (const p of pages) {
    if (typeof p === 'string' && p.trim()) ins.run(id, p.trim());
  }
  const rolePages = db.prepare('SELECT page_path FROM role_pages WHERE role_id = ?').all(id);
  res.json({ pages: rolePages.map((r) => r.page_path) });
});

router.post('/pages', (req, res) => {
  const { path, label_uz } = req.body;
  if (!path || typeof path !== 'string' || !path.trim()) {
    return res.status(400).json({ error: 'path kerak.' });
  }
  try {
    db.prepare('INSERT OR REPLACE INTO pages (path, label_uz) VALUES (?, ?)').run(path.trim(), (label_uz || path).trim());
    const page = db.prepare('SELECT path, label_uz FROM pages WHERE path = ?').get(path.trim());
    res.status(201).json(page);
  } catch (e) {
    throw e;
  }
});

export default router;
