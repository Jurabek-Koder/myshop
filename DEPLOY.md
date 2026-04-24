# MyShop — real serverga chiqarish (brauzerda barqaror ishlash)

Bu hujjat lokal `ECONNREFUSED` va productiondagi **CORS / API URL / JWT** xatolarini oldini olish uchun: avvalo **backend `.env`**, keyin **frontend build** (`VITE_*`), so‘ng **Nginx yoki proxy**.

---

## 1. Lokal ishlab chiqish (ikkala servis birga)

```bash
cd Myshop
npm install
npm run dev
```

- **api** — `backend/`, odatda `http://127.0.0.1:3000`
- **web** — `frontend/`, `http://127.0.0.1:5173`

`ECONNREFUSED 127.0.0.1:3000` — odatda faqat Vite ishlab, backend ishlamaganda. Yuqoridagi `npm run dev` ikkalasini bir vaqtda beradi.

---

## 2. Production: ikkita keng tarqalgan sxema

### A) Bir domen (tavsiya — sodda)

Brauzer: `https://shop.example.com`  
- Statik fayllar: `frontend/dist`  
- API: shu domen ostida `https://shop.example.com/api/...` (Nginx `location /api` → Node)

**Frontend build:** `VITE_API_BASE_URL` **qo‘ymang** yoki bo‘sh qoldiring — so‘rovlar **nisbiy** `/api` ga ketadi (xuddi lokal Vite proxy kabi).

### B) Ikki domen (frontend va API alohida)

- Sayt: `https://shop.example.com`  
- API: `https://api.example.com`

**Frontend:** build **oldidan** `frontend/.env.production` yarating:

```env
VITE_API_BASE_URL=https://api.example.com
```

Keyin `npm run build`. **CORS** da ikkala domen ham hisobga olinadi (`backend/.env` → `CORS_ORIGINS`).

---

## 3. Backend: majburiy o‘zgaruvchilar (`backend/.env`)

| O‘zgaruvchi | Nima uchun |
|-------------|------------|
| `NODE_ENV=production` | CORS va boshqa prod xatti-harakat |
| `PORT=3000` | Ichki port (Nginx orqali tashqariga 443) |
| `TZ=Asia/Tashkent` | Vaqt zonasi (tavsiya) |
| `JWT_ACCESS_SECRET` | Kamida ~32 belgi, tasodifiy, **hech qayerda gitga tushmasin** |
| `JWT_REFRESH_SECRET` | Access dan **boshqa** kuchli qiymat |
| `CORS_ORIGINS` | Brauzerdagi **frontend URL**lari, vergul bilan: `https://shop.example.com,https://www.example.com` |

**Xavfsizlik:** default JWT kalitlari (`security.js`dagi `CHANGE_IN_PRODUCTION...`) productionda **ishlatilmaydi** — o‘zingizniki bo‘lsin.

**Ixtiyoriy:** `MYSHOP_APP_SECRET_KEY` — agar operator/AI maxsus endpointlar ishlatilsa; frontendda **bir xil** qiymat `VITE_APP_SECRET_KEY` (faqat build vaqtida `.env.production` orqali).

Batafsil va boshqa modullar: `backend/.env.example`.

**Ma’lumotlar bazasi:** SQLite fayl `backend/data/myshop.db`. Backup: shu faylni muntazam nusxalang. Serverda backend jarayoni **ishchi katalog** `backend/` bo‘lishi kerak (relative `data/` yo‘li uchun).

---

## 4. Frontend build

```bash
cd frontend
npm install
# .env.production — sxema B bo‘lsa VITE_API_BASE_URL ni qo‘ying (namuna: .env.production.example)
npm run build
```

Chiqish: `frontend/dist/`. **Eslatma:** `VITE_*` o‘zgaruvchilari **build vaqtida** kiritiladi; URL o‘zgarganda **qayta** `npm run build` kerak.

---

## 5. Nginx — qisqa namuna (A sxema)

```nginx
server {
    listen 443 ssl http2;
    server_name shop.example.com;

    root /var/www/myshop/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

SSL sertifikatlar (Let’s Encrypt va hokazo) alohida ulansin.

---

## 6. Backend jarayonini ushlab turish

Backend katalogida:

```bash
cd /path/to/Myshop/backend
npm install --omit=dev   # yoki to‘liq install
NODE_ENV=production node src/server.js
```

Doimiy ishlatish uchun **PM2** yoki **systemd** tavsiya etiladi (ishchi katalog `backend/` bo‘lsin).

---

## 7. Tekshiruv (deploydan keyin)

```bash
curl -sS https://shop.example.com/api/health
```

Javob: `{"status":"ok",...}`

Brauzerda: login sahifasi, mahsulotlar ro‘yxati — **Network** yorlig‘ida `/api/...` **200** yoki **401** (login bo‘lmagan) bo‘lishi kerak; **CORS error** bo‘lmasa — `CORS_ORIGINS` to‘g‘ri.

---

## 8. Tez-tez uchraydigan xatolar

| Alomat | Sabab |
|--------|--------|
| CORS policy | `CORS_ORIGINS` da real `https://...` frontend yo‘q |
| Failed to fetch / not localhost | Sxema B da `VITE_API_BASE_URL` buildga kiritilmagan yoki noto‘g‘ri |
| 502 Bad Gateway | Node ishlamayapti yoki `proxy_pass` port noto‘g‘ri |
| Login ishlamaydi | JWT secretlar o‘zgarganda eski tokenlar — brauzerda chiqib qayta kirish |

---

## 9. Fayllar

- `backend/.env.example` — backend barcha opsiyalar  
- `frontend/.env.production.example` — production build uchun `VITE_*` namuna  
- `frontend/.env.development` — faqat lokal Vite (gitga tavsiya etilmaydi)
