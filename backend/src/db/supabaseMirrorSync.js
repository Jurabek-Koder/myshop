/**
 * SQLite → Supabase mirror: mahsulotlar va rollar aks-nusxasi (mahalliy asosiy yozuv SQLite da).
 */

import { getSupabaseServiceClient, isSupabaseMirrorSyncEnabled } from '../config/supabase.js';

const T = {
  PRODUCTS: 'myshop_mirror_products',
  ROLES: 'myshop_mirror_roles',
  ROLE_PAGES: 'myshop_mirror_role_pages',
  WORK_ROLES: 'myshop_mirror_work_roles',
};

const PRODUCT_KEYS = [
  'id',
  'name_uz',
  'name_ru',
  'description_uz',
  'price',
  'currency',
  'image_url',
  'video_url',
  'category',
  'stock',
  'created_at',
  'seller_id',
  'status',
  'operator_share_percent',
  'site_fee_percent',
  'operator_share_amount',
  'site_fee_amount',
  'seller_net_amount',
  'discount_percent',
  'promotion_ends_at',
  'goes_live_at',
  'image_gallery_json',
  'ai_marketing_opt_in',
  'ai_creatives_json',
  'off_sale_variant',
  'brak_qty',
];

/** Mahsulotga boshqa jadvallar bog‘langan bo‘lsa SQLite ga to‘liq DELETE xavflidir. */
function assertSafeForMirrorPull(db) {
  const c = (sql) => Number(db.prepare(sql).get()?.c ?? 0) || 0;
  const oi = c('SELECT COUNT(*) AS c FROM order_items');
  const pl = c('SELECT COUNT(*) AS c FROM product_leads');
  if (oi > 0 || pl > 0) {
    throw new Error(
      `Supabase aksidan SQLite ga tiklash: order_items (${oi}) va product_leads (${pl}) bo‘sh bo‘lishi kerak ` +
        '(mahalliy buyurtma / lidlar mahsulotga bog\'langan).',
    );
  }
}

const WORK_ROLE_KEYS = [
  'id',
  'role_name',
  'login',
  'password',
  'phone',
  'email',
  'task',
  'description',
  'permissions_json',
  'status',
  'orders_count',
  'badges_count',
  'rank_title',
  'fines_count',
  'fine_amount',
  'reward_amount',
  'total_amount',
  'deleted_at',
  'created_at',
  'portal_role',
  'courier_viloyat_id',
  'courier_tuman_ids_json',
];

function nowIsoSync() {
  return new Date().toISOString();
}

function normalizeProduct(row) {
  const o = { synced_at: nowIsoSync() };
  for (const key of PRODUCT_KEYS) {
    let v = row[key];
    v = v === undefined ? null : v;
    if (
      ['id', 'stock', 'seller_id', 'ai_marketing_opt_in', 'brak_qty'].includes(key) &&
      v != null &&
      typeof v !== 'number'
    ) {
      const x = Number(v);
      o[key] = Number.isFinite(x) ? Math.trunc(x) : null;
      continue;
    }
    if (
      [
        'price',
        'operator_share_percent',
        'site_fee_percent',
        'operator_share_amount',
        'site_fee_amount',
        'seller_net_amount',
        'discount_percent',
      ].includes(key) &&
      v != null &&
      typeof v !== 'number'
    ) {
      const x = Number(v);
      o[key] = Number.isFinite(x) ? x : 0;
      continue;
    }
    o[key] = v;
  }
  return o;
}

function normalizeRole(row) {
  const name = row.name;
  const nm = name === undefined || name === '' ? null : String(name);
  return {
    id: Number(row.id),
    name: nm,
    synced_at: nowIsoSync(),
  };
}

function normalizeRolePage(row) {
  return {
    role_id: Number(row.role_id),
    page_path: String(row.page_path ?? ''),
    synced_at: nowIsoSync(),
  };
}

function normalizeWorkRole(row) {
  const o = { synced_at: nowIsoSync() };
  for (const key of WORK_ROLE_KEYS) {
    let v = row[key];
    if (v === undefined) v = null;
    if (['id', 'orders_count', 'badges_count', 'fines_count'].includes(key) && v != null && typeof v !== 'number') {
      const x = Number(v);
      o[key] = Number.isFinite(x) ? Math.trunc(x) : 0;
      continue;
    }
    if (['fine_amount', 'reward_amount', 'total_amount'].includes(key) && v != null && typeof v !== 'number') {
      const x = Number(v);
      o[key] = Number.isFinite(x) ? x : 0;
      continue;
    }
    o[key] = v ?? (key === 'permissions_json' || key === 'courier_tuman_ids_json' ? '[]' : v);
  }
  if (!o.permissions_json) o.permissions_json = '[]';
  if (!o.courier_tuman_ids_json) o.courier_tuman_ids_json = '[]';
  return o;
}

async function upsertChunks(client, table, rows, onConflict, chunkSize = 180) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(slice, { onConflict });
    if (error) throw error;
  }
}

async function fetchAllProductsRemote(client) {
  const rows = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(T.PRODUCTS)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchAllRows(client, table, orderCol = 'id') {
  const rows = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(orderCol, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchRolePagesRemote(client) {
  const rows = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await client.from(T.ROLE_PAGES).select('role_id, page_path').range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/**
 * Lokaldan Supabase aks-jadvalga yoziladi.
 */
export async function pushMirrorToSupabase(db) {
  const client = getSupabaseServiceClient();
  if (!client) return false;

  const products = db.prepare('SELECT * FROM products').all().map(normalizeProduct);
  const roles = db.prepare('SELECT id, name FROM roles').all().map(normalizeRole);
  const rolePages = db.prepare('SELECT role_id, page_path FROM role_pages').all().map(normalizeRolePage);
  const workRoles = db.prepare('SELECT * FROM work_roles').all().map(normalizeWorkRole);

  await upsertChunks(client, T.PRODUCTS, products, 'id');
  await upsertChunks(client, T.ROLES, roles, 'id');
  await upsertChunks(client, T.ROLE_PAGES, rolePages, 'role_id,page_path');
  await upsertChunks(client, T.WORK_ROLES, workRoles, 'id');

  const remoteProductIds = new Set(products.map((p) => p.id));
  const remoteIds = [];
  let rFrom = 0;
  const rPage = 800;
  for (;;) {
    const { data, error } = await client
      .from(T.PRODUCTS)
      .select('id')
      .order('id', { ascending: true })
      .range(rFrom, rFrom + rPage - 1);
    if (error) throw error;
    if (!data?.length) break;
    remoteIds.push(...data.map((x) => x.id));
    if (data.length < rPage) break;
    rFrom += rPage;
  }
  const stale = remoteIds.filter((id) => !remoteProductIds.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200);
    const { error } = await client.from(T.PRODUCTS).delete().in('id', chunk);
    if (error) throw error;
  }

  console.log(
    `[MyShop][Supabase mirror] yozildi: mahsulot ${products.length}, rollar ${roles.length}, sahifalar ${rolePages.length}, ish rollari ${workRoles.length}`,
  );
  return true;
}

/** DR: Supabase aksidan SQLite ga tiklash — buyurtmalar/lidlar bo‘lmasligi kerak. */
export async function pullMirrorFromSupabase(db) {
  assertSafeForMirrorPull(db);

  const client = getSupabaseServiceClient();
  if (!client) throw new Error('SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY topilmadi.');

  const remoteProducts = await fetchAllProductsRemote(client);
  const remoteRoles = await fetchAllRows(client, T.ROLES, 'id');
  const remoteRolePages = await fetchRolePagesRemote(client);
  const remoteWorkRoles = await fetchAllRows(client, T.WORK_ROLES, 'id');

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM role_pages').run();
    for (const row of remoteRoles) {
      db.prepare(`INSERT INTO roles (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name`).run(
        row.id,
        row.name,
      );
    }
    for (const row of remoteRolePages) {
      db.prepare('INSERT INTO role_pages (role_id, page_path) VALUES (?, ?)').run(row.role_id, row.page_path);
    }
    db.prepare('DELETE FROM work_roles').run();
    const insWr = db.prepare(`
      INSERT INTO work_roles (
        id, role_name, login, password, phone, email, task, description, permissions_json, status,
        orders_count, badges_count, rank_title, fines_count, fine_amount, reward_amount, total_amount,
        deleted_at, created_at, portal_role, courier_viloyat_id, courier_tuman_ids_json
      ) VALUES (
        @id, @role_name, @login, @password, @phone, @email, @task, @description, @permissions_json, @status,
        @orders_count, @badges_count, @rank_title, @fines_count, @fine_amount, @reward_amount, @total_amount,
        @deleted_at, @created_at, @portal_role, @courier_viloyat_id, @courier_tuman_ids_json
      )
    `);
    for (const raw of remoteWorkRoles) {
      const r = normalizeWorkRole(raw);
      insWr.run({
        id: r.id,
        role_name: r.role_name ?? '',
        login: r.login ?? '',
        password: r.password ?? '',
        phone: r.phone ?? null,
        email: r.email ?? null,
        task: r.task ?? null,
        description: r.description ?? null,
        permissions_json: r.permissions_json ?? '[]',
        status: r.status ?? 'active',
        orders_count: r.orders_count ?? 0,
        badges_count: r.badges_count ?? 0,
        rank_title: r.rank_title ?? 'Junior',
        fines_count: r.fines_count ?? 0,
        fine_amount: r.fine_amount ?? 0,
        reward_amount: r.reward_amount ?? 0,
        total_amount: r.total_amount ?? 0,
        deleted_at: r.deleted_at ?? null,
        created_at: r.created_at ?? null,
        portal_role: r.portal_role ?? null,
        courier_viloyat_id: r.courier_viloyat_id ?? null,
        courier_tuman_ids_json: r.courier_tuman_ids_json ?? '[]',
      });
    }

    db.prepare('DELETE FROM products').run();

    const insProd = db.prepare(`
      INSERT INTO products (
        id, name_uz, name_ru, description_uz, price, currency, image_url, video_url, category, stock,
        created_at, seller_id, status, operator_share_percent, site_fee_percent, operator_share_amount,
        site_fee_amount, seller_net_amount, discount_percent, promotion_ends_at, goes_live_at,
        image_gallery_json, ai_marketing_opt_in, ai_creatives_json
      ) VALUES (
        @id, @name_uz, @name_ru, @description_uz, @price, @currency, @image_url, @video_url, @category, @stock,
        @created_at, @seller_id, @status, @operator_share_percent, @site_fee_percent, @operator_share_amount,
        @site_fee_amount, @seller_net_amount, @discount_percent, @promotion_ends_at, @goes_live_at,
        @image_gallery_json, @ai_marketing_opt_in, @ai_creatives_json
      )
    `);

    for (const p of remoteProducts) {
      const row = normalizeProduct(p);
      insProd.run({
        id: row.id,
        name_uz: row.name_uz ?? '',
        name_ru: row.name_ru ?? null,
        description_uz: row.description_uz ?? null,
        price: row.price ?? 0,
        currency: row.currency ?? 'UZS',
        image_url: row.image_url ?? null,
        video_url: row.video_url ?? null,
        category: row.category ?? null,
        stock: row.stock ?? 0,
        created_at: row.created_at ?? null,
        seller_id: row.seller_id ?? null,
        status: row.status ?? 'pending',
        operator_share_percent: row.operator_share_percent ?? 0,
        site_fee_percent: row.site_fee_percent ?? 0,
        operator_share_amount: row.operator_share_amount ?? 0,
        site_fee_amount: row.site_fee_amount ?? 0,
        seller_net_amount: row.seller_net_amount ?? 0,
        discount_percent: row.discount_percent ?? 0,
        promotion_ends_at: row.promotion_ends_at ?? null,
        goes_live_at: row.goes_live_at ?? null,
        image_gallery_json: row.image_gallery_json ?? null,
        ai_marketing_opt_in: row.ai_marketing_opt_in ?? 0,
        ai_creatives_json: row.ai_creatives_json ?? null,
      });
      if (row.off_sale_variant != null || (row.brak_qty != null && row.brak_qty !== 0)) {
        db.prepare(`UPDATE products SET off_sale_variant = ?, brak_qty = ? WHERE id = ?`).run(
          row.off_sale_variant ?? null,
          row.brak_qty ?? 0,
          row.id,
        );
      }
    }
  });

  tx();

  console.log(
    `[MyShop][Supabase mirror] Tiklandi: mahsulot ${remoteProducts.length}, rollar ${remoteRoles.length}, sahifalar ${remoteRolePages.length}, ish rollari ${remoteWorkRoles.length}`,
  );

  return {
    products: remoteProducts.length,
    roles: remoteRoles.length,
    rolePages: remoteRolePages.length,
    workRoles: remoteWorkRoles.length,
  };
}

let _scheduled = false;
let _busy = false;

export function scheduleSupabaseMirrorSync(db) {
  if (_scheduled) return;
  if (!isSupabaseMirrorSyncEnabled()) {
    console.log('[MyShop][Supabase mirror] Env yo‘q yoki SYNC o‘chiq — aks-nusxa ishlamaydi.');
    return;
  }
  _scheduled = true;

  const ms = Number.parseInt(String(process.env.SUPABASE_SYNC_INTERVAL_MS || '').trim(), 10);
  const intervalMs = Number.isFinite(ms) && ms >= 15000 ? ms : 120000;

  const run = async () => {
    if (_busy) return;
    _busy = true;
    try {
      await pushMirrorToSupabase(db);
    } catch (e) {
      console.error('[MyShop][Supabase mirror] Xato:', e?.message || e);
    } finally {
      _busy = false;
    }
  };

  setTimeout(() => void run(), 7000);
  setInterval(() => void run(), intervalMs);

  console.log(`[MyShop][Supabase mirror] Aktiv (${intervalMs} ms interval — birinchi yuborilish ~7 soniyadan keyin).`);
}
