/**
 * Brauzer / qurilma bildirishnomalari (Web Notifications API).
 * HTTPS yoki localhost da ishlaydi; ruxsat foydalanuvchi tasdig‘i bilan.
 */

export function systemNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

export function getSystemNotificationPermission() {
  if (!systemNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestSystemNotificationPermission() {
  if (!systemNotificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.body]
 * @param {string} [p.tag] — bir xil tag yangi bildirishnomani almashtiradi
 */
export function showIncomingChatSystemNotification({ title, body, tag }) {
  if (!systemNotificationsSupported()) return null;
  if (Notification.permission !== 'granted') return null;
  const t = String(title || 'MyShop').trim() || 'MyShop';
  const b = String(body || '').trim().slice(0, 220);
  try {
    const n = new Notification(t, {
      body: b || undefined,
      tag: String(tag || 'myshop-chat').slice(0, 64),
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      try {
        n.close();
      } catch {
        /* ignore */
      }
    };
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(140);
      }
    } catch {
      /* ignore */
    }
    return n;
  } catch {
    return null;
  }
}
