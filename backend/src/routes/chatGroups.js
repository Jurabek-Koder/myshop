import { Router } from 'express';
import { db } from '../db/database.js';
import { authRequired } from '../middleware/auth.js';
import {
  isSuperuser,
  isWarehouseAdmin,
  canAccessGroup,
  canManageGroup,
  getGroupBySlugOrId,
  listGroupsForUser,
  listGroupMembers,
  listInviteCandidates,
  syncGroupAutoMembership,
  CHAT_GROUP_ASSIGNABLE_ROLES,
} from '../services/chatGroupsService.js';

const router = Router();
router.use(authRequired);

function serializeGroup(g) {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    kind: g.kind,
    tasks_description: g.tasks_description || '',
    created_by: g.created_by,
    created_at: g.created_at,
    archived_at: g.archived_at || null,
    my_member_role: g.my_member_role || null,
  };
}

/** Joriy foydalanuvchi a'zo (yoki admin/superuser sifatida ko'ra oladigan) bo'lgan guruhlar. */
router.get('/', (req, res) => {
  try {
    const groups = listGroupsForUser(req.user).map(serializeGroup);
    res.json({ groups });
  } catch (e) {
    console.error('chat-groups list', e);
    res.status(500).json({ error: 'Guruhlar yuklanmadi.' });
  }
});

/** Yangi guruh yaratish — faqat superuser. */
router.post('/', (req, res) => {
  if (!isSuperuser(req.user)) return res.status(403).json({ error: 'Faqat superuser guruh yarata oladi.' });
  const title = String(req.body?.title ?? '').trim().slice(0, 200);
  const tasksDescription = String(req.body?.tasks_description ?? '').slice(0, 8000);
  const rawRoles = Array.isArray(req.body?.roles) ? req.body.roles : [];
  const roles = [...new Set(rawRoles.map((r) => String(r || '').trim().toLowerCase()))].filter((r) =>
    CHAT_GROUP_ASSIGNABLE_ROLES.includes(r),
  );
  if (!title) return res.status(400).json({ error: 'Guruh nomini kiriting.' });
  if (roles.length === 0) return res.status(400).json({ error: 'Kamida bitta rol tanlang.' });

  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9а-яёʻʼ\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || `guruh-${Date.now()}`;
  let slug = slugBase;
  let n = 1;
  while (db.prepare('SELECT 1 FROM chat_groups WHERE slug = ?').get(slug)) {
    slug = `${slugBase}-${++n}`;
  }

  try {
    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO chat_groups (slug, title, kind, tasks_description, created_by) VALUES (?, ?, 'custom', ?, ?)`,
        )
        .run(slug, title, tasksDescription, req.user.id);
      const groupId = result.lastInsertRowid;
      const insRole = db.prepare(
        `INSERT OR IGNORE INTO chat_group_roles (group_id, role, member_role) VALUES (?, ?, 'member')`,
      );
      for (const role of roles) insRole.run(groupId, role);
      return groupId;
    });
    const groupId = tx();
    syncGroupAutoMembership(groupId);
    const created = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
    res.status(201).json({ group: serializeGroup({ ...created, my_member_role: 'admin' }) });
  } catch (e) {
    console.error('chat-groups create', e);
    res.status(500).json({ error: 'Guruh yaratilmadi.' });
  }
});

/** Guruh nomi/tavsifini tahrirlash yoki arxivlash — faqat superuser. */
router.patch('/:id', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!isSuperuser(req.user)) return res.status(403).json({ error: 'Faqat superuser tahrirlay oladi.' });

  const fields = [];
  const params = [];
  if (req.body?.title != null) {
    fields.push('title = ?');
    params.push(String(req.body.title).trim().slice(0, 200));
  }
  if (req.body?.tasks_description != null) {
    fields.push('tasks_description = ?');
    params.push(String(req.body.tasks_description).slice(0, 8000));
  }
  if (req.body?.archived === true) {
    if (group.kind === 'default') {
      return res.status(400).json({ error: 'Standart guruhlarni arxivlab bo‘lmaydi.' });
    }
    fields.push('archived_at = datetime(\'now\')');
  } else if (req.body?.archived === false) {
    fields.push('archived_at = NULL');
  }
  if (fields.length === 0) return res.status(400).json({ error: 'O‘zgartiriladigan maydon yo‘q.' });
  db.prepare(`UPDATE chat_groups SET ${fields.join(', ')} WHERE id = ?`).run(...params, group.id);
  const updated = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(group.id);
  res.json({ group: serializeGroup(updated) });
});

/** Guruh a'zolari ro'yxati. */
router.get('/:id/members', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canAccessGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });
  try {
    res.json({ members: listGroupMembers(group.id) });
  } catch (e) {
    console.error('chat-groups members', e);
    res.status(500).json({ error: 'A’zolar yuklanmadi.' });
  }
});

/** Taklif qilish uchun nomzodlar (hali a'zo bo'lmagan xodimlar). */
router.get('/:id/candidates', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canManageGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });
  try {
    const candidates = listInviteCandidates(group.id, req.query.role);
    res.json({ candidates });
  } catch (e) {
    console.error('chat-groups candidates', e);
    res.status(500).json({ error: 'Ro‘yxat yuklanmadi.' });
  }
});

/** Xodimni guruhga qo'lda taklif qilish/qo'shish. */
router.post('/:id/members', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canManageGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });

  const rawIds = Array.isArray(req.body?.user_ids)
    ? req.body.user_ids
    : req.body?.user_id != null
      ? [req.body.user_id]
      : [];
  const ids = [...new Set(rawIds.map((x) => Number.parseInt(String(x), 10)).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return res.status(400).json({ error: 'Foydalanuvchi tanlanmagan.' });

  const placeholders = ids.map(() => '?').join(',');
  const found = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).all(...ids);
  if (found.length !== ids.length) return res.status(400).json({ error: 'Ba’zi foydalanuvchilar topilmadi.' });

  const upsert = db.prepare(
    `INSERT INTO chat_group_members (group_id, user_id, member_role, source, added_by, joined_at)
     VALUES (?, ?, 'member', 'invited', ?, datetime('now'))
     ON CONFLICT(group_id, user_id) DO NOTHING`,
  );
  const tx = db.transaction(() => {
    for (const uid of ids) upsert.run(group.id, uid, req.user.id);
  });
  tx();
  res.status(201).json({ members: listGroupMembers(group.id) });
});

/** A'zoni admin/oddiy a'zo qilib belgilash. */
router.patch('/:id/members/:userId', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canManageGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });
  const userId = Number.parseInt(req.params.userId, 10);
  const memberRole = String(req.body?.member_role || '').trim().toLowerCase();
  if (!['admin', 'member'].includes(memberRole)) {
    return res.status(400).json({ error: "member_role 'admin' yoki 'member' bo‘lishi kerak." });
  }
  const row = db
    .prepare('SELECT 1 FROM chat_group_members WHERE group_id = ? AND user_id = ?')
    .get(group.id, userId);
  if (!row) return res.status(404).json({ error: 'Bu foydalanuvchi guruh a’zosi emas.' });
  db.prepare('UPDATE chat_group_members SET member_role = ? WHERE group_id = ? AND user_id = ?').run(
    memberRole,
    group.id,
    userId,
  );
  res.json({ members: listGroupMembers(group.id) });
});

/** A'zoni guruhdan chiqarish (avtomatik/rolga asoslangan a'zoni chiqarib bo'lmaydi — rolini o'zgartirish kerak). */
router.delete('/:id/members/:userId', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canManageGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });
  const userId = Number.parseInt(req.params.userId, 10);
  const row = db
    .prepare('SELECT source FROM chat_group_members WHERE group_id = ? AND user_id = ?')
    .get(group.id, userId);
  if (!row) return res.status(404).json({ error: 'Bu foydalanuvchi guruh a’zosi emas.' });
  if (row.source === 'auto') {
    return res.status(400).json({
      error: 'Bu xodim o‘z roli orqali avtomatik a’zo. Chiqarish uchun uning rolini o‘zgartiring.',
    });
  }
  db.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?').run(group.id, userId);
  res.json({ ok: true });
});

/** Guruh yozishmalari. */
router.get('/:id/messages', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canAccessGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });
  const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || '150'), 10) || 150));
  const rows = db
    .prepare(
      `SELECT m.id, m.client_message_id, m.sender_user_id, m.message_type, m.body, m.payload_json, m.created_at,
              u.full_name AS sender_full_name, u.login AS sender_login, u.role AS sender_role
       FROM chat_group_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.group_id = ?
       ORDER BY m.id DESC
       LIMIT ?`,
    )
    .all(group.id, limit);
  res.json({ messages: rows.reverse() });
});

/** Guruhga yozish. */
router.post('/:id/messages', (req, res) => {
  const group = getGroupBySlugOrId(req.params.id);
  if (!group) return res.status(404).json({ error: 'Guruh topilmadi.' });
  if (!canAccessGroup(group, req.user)) return res.status(403).json({ error: 'Ruxsat yo‘q.' });

  const cid = String(req.body?.clientMessageId || `cg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    .trim()
    .slice(0, 128);
  const type = String(req.body?.messageType || 'text').trim().slice(0, 32) || 'text';
  const text = String(req.body?.text ?? '').slice(0, 8000);
  let payloadJson = null;
  if (req.body?.payload != null && typeof req.body.payload === 'object') {
    try {
      payloadJson = JSON.stringify(req.body.payload);
    } catch {
      payloadJson = null;
    }
  }
  if (!text && type === 'text') return res.status(400).json({ error: 'Matn kiriting.' });

  try {
    db.prepare(
      `INSERT OR IGNORE INTO chat_group_messages (group_id, client_message_id, sender_user_id, message_type, body, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(group.id, cid, req.user.id, type, text || null, payloadJson);
  } catch (e) {
    console.error('chat-groups send', e);
    return res.status(500).json({ error: 'Yuborilmadi.' });
  }
  res.status(201).json({ ok: true, clientMessageId: cid });
});

export default router;
