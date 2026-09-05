/**
 * Capacitor mobil ilova uchun "yelim" (glue) kod.
 *
 * MUHIM: bu fayl faqat native ilova ichida (Android/iOS) ishga tushganda
 * biror narsa qiladi. Oddiy brauzerda ochilganda (web versiya) hech narsaga
 * tegmaydi — `Capacitor.isNativePlatform()` false qaytaradi va funksiya
 * darhol to'xtaydi. Shu sabab bu fayl mavjud web ilovaning ishlashiga
 * HECH QANDAY ta'sir qilmaydi.
 *
 * Ikkita vazifasi bor:
 * 1) Android orqaga qaytish tugmasi — WebView tarixida oldingi sahifa
 *    bo'lsa o'sha sahifaga qaytadi, bo'lmasa ilovadan chiqadi.
 * 2) Tashqi havolalar (MyShop domenidan boshqa manzil) tizim brauzerida
 *    ochiladi; ilova ichidagi (bir xil domendagi) havolalar odatdagidek
 *    ilova ichida ochiladi.
 */

let initialized = false;

export async function initCapacitorBootstrap() {
  if (initialized) return;
  initialized = true;

  let Capacitor;
  try {
    ({ Capacitor } = await import('@capacitor/core'));
  } catch {
    return;
  }
  if (!Capacitor?.isNativePlatform?.()) return;

  // --- 1) Android orqaga qaytish tugmasi ---
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch {
    /* @capacitor/app mavjud emas — jim o'tkazib yuboramiz */
  }

  // --- 2) Tashqi havolalarni tizim brauzerida ochish ---
  let Browser;
  try {
    ({ Browser } = await import('@capacitor/browser'));
  } catch {
    Browser = null;
  }

  const appOrigin = window.location.origin;

  function isExternalUrl(rawUrl) {
    if (!rawUrl) return false;
    const url = String(rawUrl).trim();
    if (!url) return false;
    // mailto:, tel:, sms: kabi maxsus sxemalar — WebView o'zi to'g'ri boshqaradi.
    if (/^(mailto:|tel:|sms:|whatsapp:|geo:)/i.test(url)) return false;
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return parsed.origin !== appOrigin;
    } catch {
      return false;
    }
  }

  async function openExternally(url) {
    if (Browser) {
      try {
        await Browser.open({ url });
        return;
      } catch {
        /* pastga tushamiz */
      }
    }
    window.location.href = url;
  }

  // Barcha <a href="..."> bosishlarini kuzatamiz (capture bosqichida —
  // React'ning o'z onClick ishlovchilaridan OLDIN, lekin ularga xalaqit
  // bermaydi: faqat TASHQI havolalarda default navigatsiyani to'xtatamiz).
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented) return;
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!isExternalUrl(href)) return;
      event.preventDefault();
      void openExternally(new URL(href, window.location.href).toString());
    },
    true,
  );

  // Ba'zi joylarda window.open(url, '_blank') ishlatilishi mumkin —
  // shuni ham tashqi manzil bo'lsa tizim brauzeriga yo'naltiramiz.
  const nativeWindowOpen = window.open.bind(window);
  window.open = (url, target, features) => {
    if (typeof url === 'string' && isExternalUrl(url)) {
      void openExternally(url);
      return null;
    }
    return nativeWindowOpen(url, target, features);
  };
}
