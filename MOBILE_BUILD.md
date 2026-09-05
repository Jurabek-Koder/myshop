# MyShop — Mobil ilova (Android / iOS) qo'llanmasi

Capacitor orqali mavjud MyShop veb-ilovasi (React + Vite) Android va iOS uchun
native ilovaga o'raldi. **Laravel backend, database, API'lar, biznes logika —
hech biriga tegilmadi.** Faqat mobil "wrapper" qo'shildi.

## Qanday ishlaydi

- Ilova ochilganda, telefonga **oldindan build qilingan** veb-ilova
  (`frontend/dist`) mahalliy ravishda ko'rsatiladi (internet talab qilmaydi —
  ilova tez ochiladi).
- Barcha `/api/...` so'rovlari to'g'ridan-to'g'ri production backendga
  (`https://myshop-api-4pvv.onrender.com`) yuboriladi — buni frontend allaqachon
  qo'llab-quvvatlaydigan `VITE_API_BASE_URL` orqali sozladik.
- Login — JWT token + `localStorage` orqali (cookie emas), shu sabab
  native ilovada ham muammosiz ishlaydi va ilova qayta ochilganda saqlanadi.

## O'zgargan/qo'shilgan fayllar

| Fayl | Nima uchun |
|---|---|
| `frontend/package.json` | Capacitor paketlari + yangi `build:capacitor` skripti qo'shildi |
| `frontend/.env.capacitor` | **Yangi** — faqat mobil build uchun backend URL |
| `frontend/capacitor.config.json` | **Yangi** — asosiy Capacitor konfiguratsiyasi |
| `frontend/src/lib/capacitorBootstrap.js` | **Yangi** — orqaga tugmasi + tashqi havolalar (faqat native ilovada ishlaydi) |
| `frontend/src/main.jsx` | 2 qatorlik ulash (yuqoridagi faylni chaqiradi) |
| `frontend/android/` | **Yangi** — to'liq Android native loyihasi (Android Studio bilan ochiladi) |
| `frontend/ios/` | **Yangi** — to'liq iOS native loyihasi (Xcode bilan ochiladi) |

**Laravel/Express backend, database, mavjud API route'lar, biznes logika,
veb dizayn — hech biriga tegilmadi.**

## MUHIM: Backendda CORS sozlash kerak

Capacitor ilovasi quyidagi ikkita "domen"dan so'rov yuboradi (native ilova
ekanligi uchun brauzerdagidan farqli maxsus manzillar):

- Android: `https://localhost`
- iOS: `capacitor://localhost`

Backend (`myshop-api-4pvv.onrender.com`) Render paneli → Environment →
`CORS_ORIGINS` o'zgaruvchisiga shu ikkalasini navbatdagi qatorga (yoki
vergul bilan) qo'shing:

```
CORS_ORIGINS=https://myshop-frontend-xsa5.onrender.com,https://localhost,capacitor://localhost
```

(Agar hozir boshqa qiymatlar bo'lsa, ularni o'chirmang — shu ikkitasini
QO'SHING.) Saqlagandan so'ng backendni qayta deploy qiling.

---

## ANDROID — APK/AAB build qilish

**Talab qilinadi:** Android Studio (yoki JDK 21 + Android SDK command-line
tools) — bu operatsion tizimda ushbu vositalar mavjud emas, shu sabab men
build'ni oxirigacha bajara olmadim, lekin loyiha to'liq tayyor.

1. `frontend/android` papkasini Android Studio'da oching (yoki):
   ```bash
   cd frontend
   npx cap open android
   ```
2. Gradle sinxronlanishini kuting (birinchi marta internet orqali
   kutubxonalarni yuklab oladi).
3. **APK (sinov uchun, tez):**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   Natija: `android/app/build/outputs/apk/debug/app-debug.apk`

4. **AAB (Google Play uchun, imzolangan):**
   - Android Studio → Build → Generate Signed Bundle/APK → Android App
     Bundle → yangi keystore yarating (yoki mavjudini tanlang) → Release.
   - Yoki buyruq qatori orqali (avval `android/keystore.properties` va
     imzolash sozlamalarini `android/app/build.gradle`ga qo'shish kerak):
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Natija: `android/app/build/outputs/bundle/release/app-release.aab`

**Agar frontend kodini o'zgartirsangiz**, mobil ilovaga qayta joylash uchun:
```bash
cd frontend
npm run build:capacitor
npx cap sync android
```
(so'ng yuqoridagi gradle buyrug'ini qayta ishga tushiring)

---

## iOS — Xcode orqali build qilish

**Talab qilinadi:** macOS + Xcode (bu operatsion tizimda mavjud emas — iOS
build FAQAT Mac kompyuterda bajarilishi mumkin, bu Apple'ning cheklovi,
loyihaning kamchiligi emas).

1. Mac kompyuterda loyihani oching:
   ```bash
   cd frontend
   npx cap open ios
   ```
   (yoki `ios/App/App.xcodeproj`ni to'g'ridan-to'g'ri Xcode'da oching)

2. Xcode'da:
   - Loyiha sozlamalarida **Signing & Capabilities** → o'z Apple Developer
     hisobingizni (Team) tanlang.
   - `Bundle Identifier` allaqachon `com.myshopgroup.myshop` qilib
     qo'yilgan — kerak bo'lsa o'zgartiring.
3. **Simulyatorda sinash:** Xcode yuqorisida qurilma tanlab ▶ (Run) bosing.
4. **Haqiqiy build (TestFlight/App Store):**
   - Xcode → Product → Archive.
   - Organizer oynasida → Distribute App → App Store Connect (yoki Ad Hoc).

**Agar frontend kodini o'zgartirsangiz**, qayta joylash uchun:
```bash
cd frontend
npm run build:capacitor
npx cap sync ios
```
(so'ng Xcode'da qayta Archive/Run qiling)

---

## Sinab ko'rilgan qismlar (shu muhitda)

- ✅ `npm run build:capacitor` — muvaffaqiyatli, backend URL to'g'ri
  kiritilgani build ichida tasdiqlandi.
- ✅ `npx cap add android` / `npx cap add ios` — ikkalasi ham xatosiz
  qo'shildi.
- ✅ `npx cap sync` — web fayllar va plagin sozlamalari muvaffaqiyatli
  ko'chirildi.
- ✅ Kamera + mikrofon ruxsatlari `AndroidManifest.xml` va `Info.plist`ga
  qo'shildi (barkod skaner va hikoya yozish funksiyalari uchun).

## Sinab ko'RILMAGAN qismlar (bu muhitda vositalar yo'q)

- ❌ Haqiqiy Android APK/AAB compile (Android SDK/Gradle to'liq
  o'rnatilishi kerak — internetdan ~1-2GB yuklab olishni talab qiladi).
- ❌ iOS build umuman (faqat macOS + Xcode'da mumkin — bu texnik cheklov).

Ikkala holatda ham loyiha to'liq, to'g'ri tuzilgan — build faqat mos
vositalar mavjud kompyuterda amalga oshirilishi kerak.
