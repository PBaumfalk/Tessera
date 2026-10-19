import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  publicDir: path.resolve(__dirname, 'assets'),
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: { exclude: ['zxing-wasm'] },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3111', '/r/': 'http://localhost:3111', '/healthz': 'http://localhost:3111' },
  },
});
