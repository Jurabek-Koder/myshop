/**
 * Sklad chat media: serverga yuklash va <video>/<img> uchun JWT (query) bilan URL.
 */

function getApiOrigin() {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (base) return base.replace(/\/api$/i, '');
  if (import.meta.env.DEV) return 'http://localhost:3000';
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/**
 * Saqlangan mediaUrl → brauzer ochishi mumkin bo‘lgan to‘liq URL (staff-chat uchun access_token).
 */
export function resolveStaffChatMediaUrl(mediaUrl) {
  if (mediaUrl == null || typeof mediaUrl !== 'string') return mediaUrl;
  const s = mediaUrl.trim();
  if (!s || s.startsWith('blob:') || s.startsWith('data:')) return s;
  const origin = getApiOrigin();
  const abs =
    s.startsWith('http://') || s.startsWith('https://')
      ? s
      : `${origin}${s.startsWith('/') ? '' : '/'}${s}`;
  if (!abs.includes('/staff-chat/media/')) return abs;
  let token = null;
  try {
    token = sessionStorage.getItem('accessToken');
  } catch {
    token = null;
  }
  if (!token) return abs;
  try {
    const u = new URL(abs);
    if (u.searchParams.has('access_token')) return abs;
    u.searchParams.set('access_token', token);
    return u.toString();
  } catch {
    const sep = abs.includes('?') ? '&' : '?';
    return `${abs}${sep}access_token=${encodeURIComponent(token)}`;
  }
}

/**
 * @param {Function} request - AuthContext request(path, opts)
 * @param {File|Blob} fileOrBlob
 * @param {string} [filename] - Blob uchun nom
 */
export async function uploadStaffChatMedia(request, fileOrBlob, filename) {
  let file = fileOrBlob;
  if (fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
    const name =
      filename ||
      (fileOrBlob.type?.startsWith('video')
        ? 'clip.webm'
        : fileOrBlob.type?.startsWith('audio')
          ? 'voice.webm'
          : 'file.bin');
    file = new File([fileOrBlob], name, { type: fileOrBlob.type || 'application/octet-stream' });
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await request('/staff-chat/media', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Media yuklanmadi.');
  }
  if (!data.mediaUrl) throw new Error('Server media manzil qaytarmadi.');
  return String(data.mediaUrl);
}

export async function uploadStaffChatMediaFromBlobUrl(request, blobUrl, filenameHint) {
  const r = await fetch(blobUrl);
  const blob = await r.blob();
  const name =
    filenameHint ||
    (blob.type?.includes('video') ? 'video.webm' : blob.type?.includes('audio') ? 'audio.webm' : 'attach.bin');
  return uploadStaffChatMedia(request, blob, name);
}
