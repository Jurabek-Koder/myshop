# Deploy qo'llanmasi

Asosiy deploy ko'rsatmalari: **README.md**

---

## Render servislar

| Servis | Turi | Narx |
|--------|------|------|
| myshop-redis | Redis | Bepul |
| myshop-api | Web (Node) | Bepul |
| myshop-web | Static (CDN) | Bepul |
| myshop-db disk | Persistent Disk | $7/oy |

---

## Persistent Disk (SQLite uchun)

`render.yaml` da disk bloki mavjud. Agar $7/oy to'lamasangiz:

1. `render.yaml` dan `disk:` blokini o'chiring
2. `myshop-api` Environment dan `DB_DIR` ni o'chiring

**Ogohlantirish**: disksiz SQLite fayli har deploy/restart da o'chadi.

---

## Custom domen ulash

1. Render Dashboard → `myshop-web` → Settings → Custom Domains
2. DNS da `CNAME` yarating → `myshop-web.onrender.com`
3. `myshop-api` → Environment → `CORS_ORIGINS` ni yangilang

---

## Muhit o'zgaruvchilari to'liq ro'yxati

### Backend (myshop-api)

| Key | Tavsif | Majburiy |
|-----|--------|----------|
| `CORS_ORIGINS` | Frontend URL(lar), vergul bilan | ✅ |
| `JWT_ACCESS_SECRET` | Render avtomatik yaratadi | ✅ |
| `JWT_REFRESH_SECRET` | Render avtomatik yaratadi | ✅ |
| `DB_DIR` | `/data` (Persistent Disk) | Disk bo'lsa |
| `UPLOADS_DIR` | `/data` (Persistent Disk) | Disk bo'lsa |
| `REDIS_URL` | Redis dan avtomatik | ✅ |
| `TZ` | `Asia/Tashkent` | Tavsiya |
| `MYSHOP_VAPI_TOKEN` | AI qo'ng'iroq | Ixtiyoriy |
| `MYSHOP_AI_TRANSCRIPTS_AES_KEY` | Transkirpt shifrlash | Ixtiyoriy |

### Frontend (myshop-web)

| Key | Tavsif | Majburiy |
|-----|--------|----------|
| `VITE_API_BASE_URL` | Backend URL | ✅ |
| `VITE_APP_SECRET_KEY` | Operator endpoint himoyasi | Ixtiyoriy |
