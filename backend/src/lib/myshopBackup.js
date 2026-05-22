import fs, { createWriteStream } from 'fs';
import path from 'path';
import archiver from 'archiver';
import Database from 'better-sqlite3';
import { getSqlitePath, getUploadsRoot, getBackupsDir } from '../config/dataPaths.js';
import { uploadBackupZipToGoogleDrive, isGoogleDriveBackupConfigured } from './googleDriveBackup.js';

function pruneOldBackups(backupsDir) {
  const days = Math.min(365, Math.max(1, parseInt(String(process.env.MYSHOP_BACKUP_KEEP_DAYS || '14'), 10) || 14));
  const cutoff = Date.now() - days * 86400000;
  let names = [];
  try {
    names = fs.readdirSync(backupsDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (/^backup-.*\.zip$/i.test(name)) {
      const p = path.join(backupsDir, name);
      try {
        const st = fs.statSync(p);
        if (st.mtimeMs < cutoff) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (/^_snapshot-.*\.db$/i.test(name)) {
      const p = path.join(backupsDir, name);
      try {
        const st = fs.statSync(p);
        if (Date.now() - st.mtimeMs > 24 * 3600000) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * SQLite konsistent nusxa + uploads papkasini zip qiladi.
 * Fayllar MYSHOP_DATA_DIR/backups/ ichida (persistent diskda).
 * `myshop.db` ichida barcha moliya jadvallari (finance_logs, payrolls, courier_balances, financial_reports) ham kiradi — alohida eksport shart emas.
 */
export async function runMyshopBackup() {
  const backupsDir = getBackupsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sqlitePath = getSqlitePath();
  const uploadsRoot = getUploadsRoot();
  const snapshotPath = path.join(backupsDir, `_snapshot-${stamp}.db`);
  const zipPath = path.join(backupsDir, `backup-${stamp}.zip`);

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite topilmadi: ${sqlitePath}`);
  }

  const db = new Database(sqlitePath, { readonly: true });
  try {
    await db.backup(snapshotPath);
  } finally {
    db.close();
  }

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 7 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(snapshotPath, { name: 'myshop.db' });
    if (fs.existsSync(uploadsRoot)) {
      archive.directory(uploadsRoot, 'uploads');
    }
    void archive.finalize();
  });

  try {
    fs.unlinkSync(snapshotPath);
  } catch {
    /* ignore */
  }

  pruneOldBackups(backupsDir);

  const bytes = fs.statSync(zipPath).size;
  const zipBaseName = path.basename(zipPath);

  let driveResult = null;
  let driveUploadError = null;
  if (isGoogleDriveBackupConfigured()) {
    try {
      driveResult = await uploadBackupZipToGoogleDrive(zipPath, zipBaseName);
      if (driveResult && driveResult.skipped && driveResult.reason) {
        driveUploadError = driveResult.reason;
      }
    } catch (e) {
      driveUploadError = String(e.message || e);
      console.error('[backup] Google Drive', e);
    }
  }

  return { zipPath, bytes, drive: driveResult, driveUploadError };
}
