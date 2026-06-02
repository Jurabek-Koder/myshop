import fs from 'fs';
import { google } from 'googleapis';

function loadServiceAccountCredentials() {
  const raw = String(process.env.MYSHOP_GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  const b64 = String(process.env.MYSHOP_GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
  let jsonStr = '';
  if (raw) jsonStr = raw;
  else if (b64) {
    try {
      jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  if (!jsonStr) return null;
  try {
    const j = JSON.parse(jsonStr);
    if (!j.client_email || !j.private_key) return null;
    return j;
  } catch {
    return null;
  }
}

export function getGoogleDriveFolderId() {
  return String(process.env.MYSHOP_GOOGLE_DRIVE_FOLDER_ID || '').trim();
}

/** Avtomatik yuklash uchun folder ID + service account JSON kerak */
export function isGoogleDriveBackupConfigured() {
  return Boolean(getGoogleDriveFolderId() && loadServiceAccountCredentials());
}

export function getDriveBackupStatusSummary() {
  return {
    folderConfigured: Boolean(getGoogleDriveFolderId()),
    serviceAccountConfigured: Boolean(loadServiceAccountCredentials()),
    uploadConfigured: isGoogleDriveBackupConfigured(),
  };
}

function driveClient() {
  const creds = loadServiceAccountCredentials();
  const folderId = getGoogleDriveFolderId();
  if (!creds || !folderId) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
  });
  return { drive: google.drive({ version: 'v3', auth }), folderId };
}

/**
 * Zip faylni ulangan papkaga yuklaydi (papka service account email bilan ulashilgan bo‘lishi kerak).
 */
export async function uploadBackupZipToGoogleDrive(localZipPath, uploadFileName) {
  const ctx = driveClient();
  if (!ctx) {
    return { ok: false, skipped: true, reason: 'MYSHOP_GOOGLE_DRIVE_FOLDER_ID yoki service account JSON yo‘q.' };
  }

  const { drive, folderId } = ctx;
  const name = String(uploadFileName || '').trim() || 'backup.zip';

  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/zip',
      body: fs.createReadStream(localZipPath),
    },
    fields: 'id, name, webViewLink, size, createdTime',
    supportsAllDrives: true,
  });

  return {
    ok: true,
    skipped: false,
    id: res.data.id,
    name: res.data.name,
    webViewLink: res.data.webViewLink || null,
    size: res.data.size,
    createdTime: res.data.createdTime || null,
  };
}

/** Papkadagi zip backup lar (nom bilan filter) */
export async function listGoogleDriveBackups() {
  const ctx = driveClient();
  if (!ctx) {
    return { ok: false, error: 'Drive sozlanmagan.', files: [] };
  }
  const { drive, folderId } = ctx;
  const q = `'${folderId}' in parents and mimeType = 'application/zip' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name, webViewLink, size, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 50,
    supportsAllDrives: true,
  });
  const files = (res.data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    webViewLink: f.webViewLink || null,
    bytes: f.size != null ? Number(f.size) : null,
    createdTime: f.createdTime || null,
  }));
  return { ok: true, files };
}

export async function deleteGoogleDriveBackup(fileId) {
  const id = String(fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length < 8) {
    throw new Error('Noto‘g‘ri fayl ID.');
  }
  const ctx = driveClient();
  if (!ctx) {
    throw new Error('Drive sozlanmagan.');
  }
  await ctx.drive.files.delete({ fileId: id, supportsAllDrives: true });
  return { ok: true };
}
