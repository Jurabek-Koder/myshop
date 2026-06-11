/**
 * Prod build tekshiruvi: eski «vendor + react-vendor» bo‘laklari qolmasin
 * (ular forwardRef / oq ekran xatosiga olib keladi).
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('[verify-prod-build] dist/index.html topilmadi — avval npm run build');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const assetsDir = path.join(distDir, 'assets');
const jsFiles = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  : [];

const badVendor = jsFiles.filter((f) => /^vendor-/.test(f));
if (badVendor.length > 0) {
  console.error(
    '[verify-prod-build] Eski vendor chunk(lar) topildi:',
    badVendor.join(', '),
    '\n→ vite.config.js da alohida "vendor" bo‘lagi bo‘lmasin. npm run build qayta ishga tushiring.',
  );
  process.exit(1);
}

if (/vendor-[A-Za-z0-9_-]+\.js/.test(html)) {
  console.error('[verify-prod-build] index.html hali vendor-*.js ga ishora qiladi — build noto‘g‘ri.');
  process.exit(1);
}

console.log('[verify-prod-build] OK —', jsFiles.length, 'ta JS, vendor chunk yo‘q');
