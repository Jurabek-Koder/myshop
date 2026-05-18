import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Vite 5.4 da ba'zi SPA URL lar (masalan `/login`) uchun history fallback
 * to'liq HTML qaytarmaydi — javob bo'sh, brauzerda oq sahifa.
 * Quyidagi plugin: HTML so'rovlarda doimo `index.html` ni o'qib qaytaradi va
 * vite ning transformIndexHtml hook'larini ishga soladi.
 */
function spaIndexHtmlFallback() {
  return {
    name: 'myshop-spa-index-html-fallback',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const url = req.url || '/';
        if (url.startsWith('/@') || url.startsWith('/api') || url.startsWith('/node_modules') || url.startsWith('/src/') || url.startsWith('/public/')) return next();
        if (url === '/' || url === '/index.html') return next();
        const cleanUrl = url.split('?')[0];
        if (path.extname(cleanUrl)) return next();
        try {
          const indexPath = path.resolve(server.config.root, 'index.html');
          const raw = await fs.promises.readFile(indexPath, 'utf-8');
          const html = await server.transformIndexHtml(cleanUrl, raw, req.originalUrl);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(html);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

/** Reklama suratlari: `public/images` — Vite avtomatik `dist/images` ga nusxalaydi, `/images/...` */
/** Backend `npm run dev` (MyShop API) — odatda 3000. Band bo‘lsa server 3001 ga o‘tadi: .env da VITE_API_PROXY_TARGET ni moslang. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
    appType: 'spa',
    plugins: [react(), spaIndexHtmlFallback()],
    build: {
      /** Render / prod da xatoni `Login.jsx:42` ko‘rinishi uchun: build vaqtida VITE_BUILD_SOURCEMAP=1 */
      sourcemap:
        env.VITE_BUILD_SOURCEMAP === '1' || String(env.VITE_BUILD_SOURCEMAP).toLowerCase() === 'true',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) return 'react-vendor';
            if (id.includes('react-router')) return 'router';
            return 'vendor';
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
    server: {
      host: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
