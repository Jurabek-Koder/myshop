/** Target panel — Qo'llanma bo'limlari (har bir sahifa uchun batafsil matn). */

export const TARGET_GUIDE_INTRO = {
  title: "Target panel qo'llanmasi",
  subtitle:
    'MyShop Target paneli — affiliate (oqim) sotuvchilari uchun ishchi kabinet. Hisob-kitob faqat har oyning 15-kuni va oxirgi kunida ochiladi.',
  points: [
    'Har bir bo\'lim o\'z vazifasiga ega — pastdagi ro\'yxatdan kerakli sahifani tanlang.',
    'Hisob qulfi: qolgan kunlarda panel ko\'rinadi, lekin ish faol emas — keyingi ochilish sanasini ekranda ko\'rasiz.',
    'Qo\'ng\'iroqcha orqali pul yechish, tasdiqlash va boshqa tizim xabarlari keladi (faol kunlarda).',
  ],
};

export const TARGET_GUIDE_SECTIONS = [
  {
    id: 'cabinet',
    viewKey: 'cabinet',
    icon: 'fa-user',
    title: 'Mening kabinetim',
    summary: 'Asosiy boshqaruv markazi — balans, API kalit va tez o\'tish tugmalari.',
    related: [
      'Seller hisobingiz balansi va tangalar',
      'API Key — tashqi integratsiyalar uchun',
      'Boshqa bo\'limlarga tez o\'tish plitkalari',
      'To\'lov, Market, Statistika va boshqalar bilan bog\'langan',
    ],
    howItWorks: [
      'Kirish qilgach Market ochiladi; kabinetga yon menyu yoki mobil pastki «Kabinet» tugmasi orqali o\'tasiz.',
      '«Asosiy Balans» — yechish mumkin bo\'lgan mablag\'; «Yo\'ldagi Pul» — yetkazilishi kutilayotgan buyurtmalardan komissiya; «Tangalar» — referal va yetkazilgan buyurtmalar uchun bonus ball.',
      'API Key ni ko\'rish/yashirish va nusxa olish tugmalari orqali integratsiya uchun ishlating.',
      'Pastdagi plitkalar orqali Market, Havolalar, So\'rovnomalar va boshqa bo\'limlarga bir bosishda o\'ting.',
    ],
  },
  {
    id: 'market',
    viewKey: 'market',
    icon: 'fa-shopping-cart',
    title: 'Market',
    summary: 'Sotuvdagi mahsulotlar katalogi — oqim yaratish va saralanganlarga qo\'shish.',
    related: [
      'Mahsulot katalogi (do\'kon bazasi)',
      'Havolalar — «Oqim yaratish» shu yerdan boshlanadi',
      'Saralanganlar — yurak belgisi bilan bog\'langan',
      'Statistika — yaratilgan oqimlar bo\'yicha hisobot',
    ],
    howItWorks: [
      'Kategoriya tugmalari orqali mahsulotlarni filtrlang; «Barchasi» barcha mahsulotlarni ko\'rsatadi.',
      'Qidiruv maydoniga mahsulot nomini yozib qidiring.',
      'Har bir kartada narx, sizga tushadigan to\'lov (komissiya) va ombordagi qoldiq ko\'rsatiladi.',
      '«Oqim yaratish» tugmasi bosilganda mahsulot uchun shaxsiy havola yaratiladi va Havolalar bo\'limiga tushadi.',
      'Yurak belgisini bosib mahsulotni Saralanganlar ro\'yxatiga qo\'shing yoki olib tashlang.',
    ],
  },
  {
    id: 'surveys',
    viewKey: 'surveys',
    icon: 'fa-clipboard-list',
    title: "So'rovnomalar",
    summary: 'Sizning oqimlaringiz orqali kelgan buyurtmalar va ularning holati.',
    related: [
      'Buyurtmalar bazasi (orders)',
      'Operator va oqim nomi',
      'Yetkazib berish jarayoni holatlari',
      'Statistika — buyurtmalar soni va holatlar bilan bog\'liq',
    ],
    howItWorks: [
      'Jadvalda har bir qator — bitta buyurtma: ID, operator, sana, oqim, xaridor, viloyat, telefon, holat, izoh.',
      'Holat: Kutilmoqda, Yig\'ilmoqda, Qadoqlangan, Kuryerga, Yo\'lda, Yetkazildi, Bekor qilingan va boshqalar.',
      'Ma\'lumotlar avtomatik yangilanadi — sahifani qayta ochganda so\'nggi holat ko\'rinadi.',
      'Muammo bo\'lsa izoh ustunida qo\'shimcha ma\'lumot bo\'lishi mumkin.',
    ],
  },
  {
    id: 'links',
    viewKey: 'links',
    icon: 'fa-link',
    title: 'Havolalar',
    summary: 'Yaratilgan barcha oqim (affiliate) havolalaringiz ro\'yxati.',
    related: [
      'Market — yangi oqim yaratish',
      'Statistika — har bir oqim bo\'yicha tashrif va sotuvlar',
      "So'rovnomalar — havola orqali kelgan buyurtmalar",
      'Referal parametri (?ref=seller_id) — havolada avtomatik qo\'shiladi',
    ],
    howItWorks: [
      'Marketdan «Oqim yaratish» bosilganda yangi havola shu yerda paydo bo\'ladi.',
      'Qidiruv orqali oqim nomi yoki ID bo\'yicha toping.',
      'Har bir karta: oqim nomi, mahsulot, narx, to\'liq URL va yaratilgan sana.',
      '«Nusxa olish» tugmasi havolani clipboard ga nusxalaydi — ijtimoiy tarmoqlarda ulashing.',
      'Sahifalar orasida pastki raqamlar bilan harakatlaning.',
    ],
  },
  {
    id: 'stats',
    viewKey: 'stats',
    icon: 'fa-chart-bar',
    title: 'Statistika',
    summary: 'Oqim yoki sana bo\'yicha batafsil tahlil jadvali.',
    related: [
      'Havolalar — oqim nomlari',
      'Buyurtmalar va yetkazish holatlari',
      'Konkurs — sotilganlar soni reytingga ta\'sir qiladi',
    ],
    howItWorks: [
      '«Oqim» rejimi — har bir oqim alohida qator; «Sana» rejimi — kunlik jamlanma.',
      'Ustunlar: Tashrif, Yangi, Dostavka (Bugun/Keyin), Qadoqlash, Yetkazilmoqda, Yetkazildi, Keyin oladi, Qaytib keldi.',
      '«JAMI» qatori barcha ko\'rsatkichlar yig\'indisini beradi.',
      'Pastki strelkalar bilan sahifalar bo\'ylab harakatlaning.',
    ],
  },
  {
    id: 'contest',
    viewKey: 'contest',
    icon: 'fa-trophy',
    title: 'Konkurs',
    summary: 'Target sotuvchilar o\'rtasidagi reyting va konkurs natijalari.',
    related: [
      'Statistika — sotilgan mahsulotlar soni',
      'Market va Havolalar — savdo hajmini oshirish',
      'Admin panel — konkurs shartlari va sanalar',
    ],
    howItWorks: [
      'Konkurs boshlanish va tugash sanalari yuqorida ko\'rsatiladi.',
      'Natijalar jadvalida o\'rin, sotuvchi nomi va sotilganlar soni beriladi.',
      'Ma\'lumotlar taxminan har 12 soatda yangilanadi.',
      'Ko\'proq sotuv qilgan targetlar yuqori o\'rinlarda ko\'rinadi.',
    ],
  },
  {
    id: 'payment',
    viewKey: 'payment',
    icon: 'fa-wallet',
    title: "To'lov",
    summary: 'Balansni ko\'rish, pul yechish, tanga yechish va o\'tkazmalar tarixi.',
    related: [
      'Kabinet — Asosiy balans, Yo\'ldagi pul va Tangalar ko\'rsatkichlari',
      'Referal — tanga mukofoti uchun',
      "So'rovnomalar — buyurtma yetkazilganda tanga va komissiya",
      'Buxgalteriya — so\'rovni tasdiqlash/rad etish',
      'Bildirishnomalar — har bir bosqichda xabar',
    ],
    howItWorks: [
      '«Mening hisobim» kartasida joriy pul balansi (so\'m) ko\'rsatiladi.',
      'Ikkita yechish turi bor: «Pul» (asosiy balansdan) va «Tanga» (bonus tangalardan).',
      '«O\'tkazmalar tarixi» jadvalida barcha yuborilgan so\'rovlar, holati va xabarlari saqlanadi.',
      'Har bir holat o\'zgarishida (yuborildi, tasdiqlandi, rad etildi, pul berildi) qo\'ng\'iroqcha orqali xabar keladi.',
    ],
    guides: [
      {
        title: 'Tangaga qayerdan tushadi?',
        icon: 'fa-coins',
        intro:
          'Tangalar — alohida bonus hisob. Ular avtomatik qo\'shiladi; qo\'lda kiritish shart emas. Asosiy pul balansidan farq qiladi.',
        items: [
          {
            label: 'Referal orqali ro\'yxatdan o\'tish',
            text:
              'Referal bo\'limidagi shaxsiy havolangiz orqali yangi foydalanuvchi ro\'yxatdan o\'tganda +50 tanga (standart qiymat) hisobingizga tushadi. Referallar ro\'yxatida yangi odam paydo bo\'lganda tanga ham yangilanadi.',
          },
          {
            label: 'Yetkazilgan buyurtma',
            text:
              'Sizning oqimingiz orqali kelgan buyurtma kuryer tomonidan «Yetkazildi» deb belgilanganda +10 tanga (standart qiymat) qo\'shiladi. Bir buyurtma — bir marta tanga (takrorlanmaydi).',
          },
          {
            label: 'Asosiy balansga komissiya (tanga emas)',
            text:
              'Buyurtma yetkazilganda mahsulot kartasidagi «To\'lov» (operator ulushi) miqdori Asosiy balansga so\'m sifatida tushadi. Bu tangalar emas — kartaga yechish mumkin bo\'lgan haqiqiy pul.',
          },
          {
            label: 'Yo\'ldagi pul (kutilayotgan daromad)',
            text:
              'Buyurtma hali yo\'lda bo\'lsa, komissiya «Yo\'ldagi pul»da ko\'rinadi. Kuryer yetkazgach, summa Asosiy balansga o\'tadi va shu paytda tanga ham beriladi.',
          },
        ],
      },
      {
        title: 'Tangadan pul qanday chiqariladi?',
        icon: 'fa-hand-holding-usd',
        intro:
          'Tangalarni to\'g\'ridan-to\'g\'ri bank kartaga emas, balki tanga yechish so\'rovi orqali so\'mga aylantirasiz. Buxgalteriya tasdiqlagach to\'lov amalga oshiriladi.',
        steps: [
          'Yon menyu yoki «Boshqa» → «To\'lov» bo\'limiga o\'ting.',
          '«Tanga Yechish» sarlavhasi ostidagi «Tanga» tabini tanlang.',
          'Yuqorida «Mavjud tangalar» soni va kurs ko\'rsatiladi (masalan: 1 tanga = 100 so\'m).',
          '«TANGA SONI» maydoniga yechmoqchi bo\'lgan tangalar sonini kiriting (kamida 10 ta).',
          '«Tasdiqlash» tugmasini bosing — so\'rov buxgalteriyaga yuboriladi, tangalar vaqtincha hisobdan yechiladi.',
          'Holatlar: Kutilmoqda → Tasdiqlangan → Pul berildi. Rad etilsa tangalar avtomatik qaytariladi.',
          'Natijani qo\'ng\'iroqcha va «O\'tkazmalar tarixi» jadvalidan kuzatib boring.',
        ],
        note:
          'Misol: 100 tanga × 100 so\'m = 10 000 so\'m yechish so\'rovi. Kurs va minimal miqdor tizim sozlamalaridan kelib chiqadi.',
      },
      {
        title: 'Asosiy balansdan pul yechish',
        icon: 'fa-credit-card',
        intro:
          'Yetkazilgan buyurtmalardan tushgan komissiyani (so\'m) kartangizga yechish uchun «Pul» tabidan foydalaning.',
        steps: [
          'To\'lov bo\'limida «Pul» tabini tanlang.',
          'Karta raqamingizni kiriting.',
          'Yechmoqchi bo\'lgan summani so\'m da yozing (balansdan oshmasligi kerak).',
          '«Tasdiqlash» bilan so\'rov yuboring.',
          'Buxgalteriya tasdiqlagach va «Pul berildi» deb belgilangach mablag\' kartangizga o\'tkaziladi.',
        ],
      },
    ],
  },
  {
    id: 'referral',
    viewKey: 'referral',
    icon: 'fa-users',
    title: 'Referal',
    summary: 'Yangi target/sotuvchilarni jalb qilish uchun shaxsiy referal havola.',
    related: [
      'Ro\'yxatdan o\'tish sahifasi (/register)',
      'Foydalanuvchilar bazasi — sizning ID ingiz bilan bog\'langanlar',
    ],
    howItWorks: [
      'Referal havolangizni «Nusxa olish» bilan oling va tarqating.',
      'Ushbu havola orqali ro\'yxatdan o\'tganlar «Referallar ro\'yxati»da ko\'rinadi.',
      'Jami referallar soni yuqorida badge sifatida chiqadi.',
      'Har bir referal: ism, email, telefon va ro\'yxatdan o\'tgan sana.',
    ],
  },
  {
    id: 'favorites',
    viewKey: 'favorites',
    icon: 'fa-heart',
    title: 'Saralanganlar',
    summary: 'Yoqtirgan mahsulotlaringiz — tez topish va oqim yaratish uchun.',
    related: [
      'Market — yurak belgisi orqali qo\'shish/olib tashlash',
      'Havolalar — saralangan mahsulotdan oqim yaratish mumkin',
    ],
    howItWorks: [
      'Marketda mahsulot kartasidagi yurak belgisini bosing — mahsulot shu ro\'yxatga tushadi.',
      '«Meni yoqtirganlarim» sahifasida barcha saralangan mahsulotlar grid ko\'rinishida.',
      '«Oldingi» / «Keyingi» tugmalari bilan sahifalar bo\'ylab harakatlaning.',
      'Yurakni qayta bosib mahsulotni ro\'yxatdan olib tashlang.',
    ],
  },
  {
    id: 'settings',
    viewKey: 'settings',
    icon: 'fa-cog',
    title: 'Sozlamalar',
    summary: 'Profil ma\'lumotlari, viloyat/tuman, Telegram va parol.',
    related: [
      'Foydalanuvchi profili (users jadvali)',
      'Viloyat/tuman — yetkazish va operator bilan bog\'liq',
      'Telegram ID — kelajakda bildirishnomalar uchun',
    ],
    howItWorks: [
      'Ism, familiya, viloyat, tuman, Telegram ID va «O\'zingiz haqingizda» maydonlarini to\'ldiring.',
      'Viloyat tanlangach tuman ro\'yxati avtomatik ochiladi.',
      '«Saqlash» profilni serverga yuboradi.',
      'Parol bo\'limida yangi parol va tasdiqlashni kiriting, «Parolni o\'zgartirish» bosing (kamida 6 belgi).',
    ],
  },
  {
    id: 'billing-window',
    viewKey: null,
    icon: 'fa-lock',
    title: 'Hisob qulfi (ish kunlari)',
    summary: 'Target hisob-kitobi faqat oyning 15-kuni va oxirgi kunida ochiq.',
    related: [
      'Barcha target xodimlar — yangi ro\'yxatdan o\'tganlar ham',
      'O\'zbekiston vaqti (Toshkent) bo\'yicha kalendar kun',
      'To\'lov va pul yechish — faqat ochiq kunlarda',
    ],
    howItWorks: [
      'Har oyning 15-sanasi: hisob to\'liq faol, barcha bo\'limlar ishlaydi.',
      'Har oyning oxirgi kuni: yana bir faol kun (28/29/30/31 — oyga qarab).',
      'Qolgan barcha kunlar: hisob qulflangan — panelda qulf ekrani chiqadi.',
      'Keyingi ochilish sanasi qulf ekranida ko\'rsatiladi.',
      '«Holatni yangilash» tugmasi bilan kun o\'zgarganda (masalan, tunda) holatni tekshiring.',
    ],
  },
  {
    id: 'topbar',
    viewKey: null,
    icon: 'fa-window-maximize',
    title: 'Yuqori panel (Topbar)',
    summary: 'Desktop va mobilda tez navigatsiya, qidiruv va hisob menyusi.',
    related: [
      'Do\'kon bosh sahifasi (/)',
      'Kategoriyalar menyusi',
      'Bildirishnomalar qo\'ng\'irog\'i',
      'Profil menyusi',
    ],
    howItWorks: [
      'Desktop: MyShop logosi, Bosh sahifa, Kategoriyalar, Do\'kon, qidiruv, tun/kun rejimi, profil.',
      'Mobil: menyu (☰), Kategoriyalar, qo\'ng\'iroqcha, qidiruv, profil avatar.',
      'Qidiruv tugmasi bosilganda qidiruv maydoni ochiladi; mahsulot nomi bo\'yicha Market filtrlanadi.',
      'Profil ustiga bosganda: Bosh sahifa, Profil (Kabinet), Sozlamalar, Chiqish menyusi ochiladi.',
      'Tun/kun rejimi desktop topbar va mobil yon menyu pastida (Chiqish yonida).',
    ],
  },
  {
    id: 'notifications',
    viewKey: 'payment',
    icon: 'fa-bell',
    title: 'Bildirishnomalar',
    summary: 'Pul yechish, tasdiqlash va tizim xabarlari qo\'ng\'iroqcha orqali.',
    related: [
      "To'lov — pul yechish so'rovlari",
      'Buxgalteriya jarayoni — tasdiqlash/rad etish',
      'seller_notifications va user_notifications',
    ],
    howItWorks: [
      'Mobil topbar dagi qo\'ng\'iroqcha belgisini bosing — xabarlar ro\'yxati ochiladi.',
      'O\'qilmagan xabarlar soni qizil badge da ko\'rsatiladi.',
      'Pul yechish yuborilganda, tasdiqlanganda, rad etilganda yoki berilganda xabar keladi.',
      'Ba\'zi xabarlarda «Ko\'rish» tugmasi — tegishli bo\'limga (masalan, To\'lov) o\'tadi.',
      'Xabarlar har 15 soniyada avtomatik yangilanadi.',
    ],
  },
  {
    id: 'mobile-nav',
    viewKey: null,
    icon: 'fa-mobile-alt',
    title: 'Mobil navigatsiya',
    summary: 'Pastki tab bar va «Boshqa» varaqasi.',
    related: [
      'Kabinet, Market, So\'rovlar, Statistika — pastki tab',
      'Havolalar, Konkurs, To\'lov, Referal, Saralanganlar, Sozlamalar, Qo\'llanma — «Boshqa» ichida',
    ],
    howItWorks: [
      'Pastki 5 ta tab: Kabinet, Market, So\'rovlar, Statistika, Boshqa.',
      '«Boshqa» bosilganda pastdan varaq ochiladi — qolgan bo\'limlar grid ko\'rinishida.',
      'Yon menyu (☰) ochilganda pastki tab yashirinadi; MyShop logosi va Chiqish + tun/kun pastda.',
      'Har bir bo\'limga o\'tganda yon menyu avtomatik yopiladi.',
    ],
  },
];
