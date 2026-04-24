import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Backend `npm run dev` (MyShop API) — odatda 3000. Band bo‘lsa server 3001 ga o‘tadi: .env da VITE_API_PROXY_TARGET ni moslang. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
    plugins: [react()],
    build: {
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
