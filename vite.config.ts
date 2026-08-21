import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
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
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    css: true,
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
