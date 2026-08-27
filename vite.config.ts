import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // strictPort, because the backend allows exactly one CORS origin. Without
  // it Vite silently moves to 5174 when 5173 is taken, and every API call is
  // then blocked by CORS with an error that reads like the server is down.
  // Failing to start is the far easier problem to diagnose.
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // exceljs faqat Excel import sahifasida kerak — umumiy vendor’ga
          // qo‘shilmasin, aks holda har sahifada ~900 KB ortiqcha yuklanadi.
          if (/[\\/]node_modules[\\/](exceljs|unzipper|archiver|jszip|saxes)/.test(id))
            return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-vendor)/.test(id))
            return 'vendor-charts';
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@tanstack)/.test(
              id,
            )
          )
            return 'vendor-react';
          if (/[\\/]node_modules[\\/](@hookform|react-hook-form|zod)/.test(id))
            return 'vendor-forms';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // backend/ has its own Vitest suite and its own node_modules; without this
    // the frontend run picks up both and fails on server-only imports.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'backend/**'],
    css: true,
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
