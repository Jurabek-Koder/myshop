================================================================================
MyShop — Render uchun tayyor papka (D:\Myshop-Render)
================================================================================

Bu papkani GIT repoga qo‘shing (GitHub / GitLab / Bitbucket) — Render faqat Git
orqali deploy qiladi; zip bilan to‘g‘ridan-to‘g‘ri “upload” yo‘q.

Papkada nima bor
----------------
  backend/          — Node API (Express, SQLite)
  frontend/         — Vite + React (build → dist)
  render.yaml       — ikki xizmat: myshop-api + myshop-web
  .gitignore        — node_modules, .env va hokazo
  DEPLOY.md         — umumiy CORS / API URL eslatmalari (VPS uchun ham)

Papkada yo‘q (xavfsizlik / ortiqcha)
------------------------------------
  node_modules, dist  — serverda build paytida yaratiladi
  backend/.env        — Render Dashboard → Environment da yoziladi
  *.db                — SQLite serverda birinchi ishga tushganda yaratiladi

MUHIM: SQLite va fayllar
-------------------------
  Free Web Service diskini deploy/restart bilan yo‘qotishi mumkin (sinov uchun
  OK). Doimiy ma’lumot kerak bo‘lsa — Render Disk (pullik) yoki PostgreSQL.

QADAMLAR (qisqa)
----------------

1) Git repoda bu papka ildiz bo‘lsin YOKI reponing ildizida backend + frontend +
   render.yaml bo‘lsin (hozirgi tuzilma mos).

2) github.com ga push qiling.

3) https://dashboard.render.com → New → Blueprint → reponi tanlang.
   render.yaml ni o‘qiydi.

4) Blueprint yaratishda so‘raladigan o‘zgaruvchilar (sync: false):
   • CORS_ORIGINS — keyinroq to‘ldirish mumkin; qiymat: frontendning HTTPS
     manzili, masalan: https://myshop-web-xxxx.onrender.com
     (vergul bilan bir nechta domen mumkin)
   • VITE_API_BASE_URL — backend URL, masalan: https://myshop-api-xxxx.onrender.com
     Oxirida / bo‘lmasin.

   Agar API URL hali yo‘q bo‘lsa:
   • Avval faqat Web Service (myshop-api) ni qo‘lda yarating yoki Blueprintda
     myshop-web ni keyin qo‘shing.
   • API ishga tushgach URL ni oling → Static (myshop-web) Environment ga
     VITE_API_BASE_URL qo‘ying → qayta Deploy.

5) Tekshiruv:
   Brauzer: https://SIZNING-API.onrender.com/api/health
   Javob: {"status":"ok",...}

6) Superuser parol (bir marta, serverda SSH yoki Render Shell):
   backend katalogida: node scripts/make-superuser.js (hujjat: backend README)

Muhit o‘zgaruvchilari (qo‘shimcha)
----------------------------------
  Barchasi Render Dashboard → myshop-api → Environment.
  Namuna va tavsiflar: backend/.env.example

  AI / Vapi / Redis ishlatmasangiz — o‘sha kalitlarni qo‘ymasangiz ham bo‘ladi
  (Redis yo‘q bo‘lsa navbat ba’zi funksiyalar ishlamaydi).

Havolalar
---------
  Blueprint: https://render.com/docs/blueprint-spec
  Statik sayt: https://render.com/docs/static-sites
  Web Service: https://render.com/docs/web-services

================================================================================
