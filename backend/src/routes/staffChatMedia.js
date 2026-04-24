/**
 * Sklad chat / lichka media — barcha xodim rollari (picker, kuryer, …) umumiy fayl.
 * GET da <video src> uchun JWT query: ?access_token=…
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authRequired, authRequiredBearerOrQuery, requireStaffChatMediaRole } from '../middleware/auth.js';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'staff-chat');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'application/pdf',
  'application/octet-stream',
]);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
};

const CONTENT_TYPE_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.bin': 'application/octet-stream',
};

function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  return EXT_BY_MIME[m] || '.bin';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const raw = String(file.originalname || '');
    const fromName = path.extname(raw).toLowerCase();
    const safeFromName = fromName && /^\.[a-z0-9]{1,10}$/.test(fromName) ? fromName : null;
    const ext = safeFromName || extForMime(file.mimetype);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 52 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('FILE_TYPE'), false);
  },
});

const router = Router();

router.post(
  '/media',
  authRequired,
  requireStaffChatMediaRole,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Fayl hajmi 52 MB dan oshmasin.' });
          }
          return res.status(400).json({ error: 'Yuklash xatosi.' });
        }
        if (err.message === 'FILE_TYPE') {
          return res.status(400).json({ error: 'Bu fayl turi ruxsat etilmagan.' });
        }
        return res.status(400).json({ error: 'Fayl yuklanmadi.' });
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file?.filename) return res.status(400).json({ error: 'Fayl topilmadi.' });
    const mediaUrl = `/api/staff-chat/media/${req.file.filename}`;
    res.json({ ok: true, mediaUrl });
  }
);

router.get('/media/:fileName', authRequiredBearerOrQuery, requireStaffChatMediaRole, (req, res) => {
  const name = path.basename(String(req.params.fileName || ''));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,12}$/i.test(name)) {
    return res.status(400).end();
  }
  const full = path.join(UPLOAD_ROOT, name);
  if (!full.startsWith(UPLOAD_ROOT)) return res.status(400).end();
  if (!fs.existsSync(full)) return res.status(404).end();
  const ext = path.extname(name).toLowerCase();
  const ct = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(full);
});

export default router;
