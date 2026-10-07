import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Paylaşılan paketi derlemeden kaynak koddan kullan
    alias: { '@oneclick/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:4000',
      '/media': 'http://localhost:4000',
    },
  },
});
