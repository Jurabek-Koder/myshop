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

**Ma’lumotlar bazasi:** SQLite fayl `backend/data/myshop.db` (lokal). **Render / PaaS:** fayl tizimi ko‘pincha **vaqtinchalik** — qayta deploy yoki xizmat «uxlaganda» `myshop.db` **yo‘qoladi**, shuning uchun login «parol noto‘g‘ri», har kuni qayta ro‘yxatdan o‘tish va barcha ma’lumot yo‘qolishi. **Tuzatish:** doimiy disk o‘rnatib, environment `MYSHOP_DATA_DIR` ni shu disklarning **mountPath** qilib qo‘yish (masalan `/data/myshop`). Bitta yo‘lga SQLite va `uploads/` ham o‘tadi. Render’da: *Service → Disks → Add disk* (odatda pullan reja; Free rejada disk bo‘lmasa — muhim ma’lumotlar uchun to‘plangan reja yoki alohida PostgreSQL ko‘rish tavsiya etiladi). Batafsil: `backend/src/config/dataPaths.js`.

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

---

## 10. GitHub + test deploy (Render yoki bitta domen PaaS)

1. **Repozitoriy** GitHub’ga yuklang (`.env` fayllar **tushirmang**; faqat `.env.example`).

2. **Bitta Web Service (tavsiya, test):** `npm run build` loyihaning `frontend/dist` + API bir hostda. `backend/src/server.js` production rejimda `../frontend/dist` ni avtomatik xizmat qiladi; `CORS` bilan jang qilmaysiz, chunki domen bitta.

3. **Render** (loyihada `render.yaml`):
   - [Render](https://render.com) → *New* → *Blueprint* yoki *Web Service* (GitHub orqali repo tanlang)
   - **Build:** `cd frontend && npm ci && npm run build && cd ../backend && npm ci`  
   - **Start:** `cd backend && NODE_ENV=production node src/server.js`  
   - **Health check path:** `/api/health`  
   - **Environment:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS` (o‘z Render URLlaringiz, masalan `https://myshop.onrender.com` — bitta domen orqali kirilsa, baribir `CORS_ORIGINS`ga shu domen qo‘yish tavsiya etiladi)  
   - *Eslatma:* Render barmoqli *Root Directory* bo‘lmasa, buyruqlarda `cd` saqlanadi. `MYSHOP_SERVE_SPA=0` — agar Nginx yoki alohida front statik yuklash kerak bo‘lsa (funktsiyani o‘chirish).

4. **GitHub Actions:** `.github/workflows/ci.yml` — push/PR’da `frontend` build va `backend` `npm ci` ishlatiladi, deploy o‘zi Render’dagi **Auto-Deploy** orqali (yoki siz to‘g‘ri sozlamani tanlaysiz).

5. **SQLite:** `backend/data/myshop.db` fayl restaffda yoki muntazam deployda qayta yaratilishi yoki tozalashi mumkin. Test uchun odatda to‘g‘ri; muhim ma’lumotlar uchun fayl diskda **to‘g‘ri tomi** saqlanishini (Render: persistent disk) qo‘shing yoki muntazam backup oling.

6. **Bir nechta qurilma (telefon + noutbuk):** akkauntlar **server bazasida** — `MYSHOP_DATA_DIR` bilan. Har qurilmada **bir xil email va parol** bilan kirasiz. *«Bu qurilmada eslab qol»* faqat **shu brauzer**da autokirish uchun; boshqa qurilma maxfiy tarzda internet orqali tokenlarni «yubormaydi» — telefonda qayta kirish — baza bitta bo‘lsa, xuddi o‘sha hisob.
