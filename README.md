# MyShop

O'zbekiston bozori uchun to'liq e-commerce tizimi.

**Texnologiyalar:** React 18 + Vite (frontend) · Node.js + Express + SQLite (backend) · Render.com (hosting)

---

## GitHub → Render deploy (5 qadam)

### 1. GitHub ga yuklash
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/SIZNING_USERNAME/myshop.git
git push -u origin main
```

### 2. Render da Blueprint yaratish
1. [render.com](https://render.com) ga kiring
2. **New → Blueprint**
3. GitHub reponi tanlang
4. Render avtomatik 3 ta servis yaratadi:
   - `myshop-redis` — Redis (bepul)
   - `myshop-api` — Backend API
   - `myshop-web` — Frontend (CDN)

### 3. Env o'zgaruvchilarni to'ldirish

Deploy tugagandan keyin **2 ta env** ni to'ldirish kerak:

**`myshop-api` servisida** (Environment tab):
```
CORS_ORIGINS = https://myshop-web.onrender.com
```
> myshop-web servisining URL manzili

**`myshop-web` servisida** (Environment tab):
```
VITE_API_BASE_URL = https://myshop-api.onrender.com
```
> myshop-api servisining URL manzili

### 4. Manual deploy
Env o'zgartirgandan keyin har ikkala servisda **Manual Deploy → Deploy latest commit** bosing.

### 5. Superuser yaratish
Backend servis konsolida (`myshop-api → Shell`):
```bash
npm run make-superuser
```
Ko'rsatmaga amal qiling — email va parol kiriting.

---

## Lokal ishga tushirish

```bash
# Backend
cd backend
cp .env.example .env   # kerakli env larni to'ldiring
npm install
npm run dev            # http://localhost:3000

# Frontend (yangi terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

---

## Foydalanuvchi rollari

| Rol | Dashboard |
|-----|-----------|
| superuser | Admin panel |
| seller | Sotuvchi panel |
| operator | Operator panel |
| courier | Kuryer panel |
| packer | Qadoqlovchi panel |
| picker | Picker panel |
| expeditor | Expeditor panel |
| order_receiver | Buyurtma qabul |
| customer | Do'kon (mijoz) |

---

## Muhim eslatmalar

- **SQLite + Persistent Disk**: `render.yaml` da `/data` diskiga ulanadi ($7/oy). Bepul ishlatsangiz disk bloklarini o'chirib tashlang — lekin deploy da ma'lumotlar yo'qoladi.
- **Render Free**: backend 15 daqiqa faolsizlikdan keyin uxlaydi. Birinchi so'rov 30-60 soniya kechikishi mumkin.
- **Payme/Click**: to'lov tanlash UI mavjud, lekin haqiqiy to'lov integratsiyasi keyingi bosqich.
