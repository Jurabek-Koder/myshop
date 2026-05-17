/**
 * Cron / qo‘lda: npm run backup
 * MYSHOP_DATA_DIR/backups/backup-<ISO>.zip — ichida myshop.db va uploads/
 */
import 'dotenv/config';
import { runMyshopBackup } from '../src/lib/myshopBackup.js';

try {
  const r = await runMyshopBackup();
  console.log('[backup] OK', r.zipPath, `(${r.bytes} bytes)`);
  process.exit(0);
} catch (e) {
  console.error('[backup] XATO', e?.message || e);
  process.exit(1);
}
