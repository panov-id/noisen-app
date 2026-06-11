import { defineConfig } from 'vite';

export default defineConfig({
  root: 'source',
  // Files in source/public/ are copied to dist/ root as-is (no hashing).
  // sw.js and manifest.json live here so they remain at the web root.
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    commonjsOptions: { include: [/qrcode/, /node_modules/] },
  },
  optimizeDeps: {
    include: ['qrcode'],
  },
  server: { port: 3000 },
});
