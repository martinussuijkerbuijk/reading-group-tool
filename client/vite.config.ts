import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Allow connections from other devices on the local network
    host: true,
    proxy: {
      // WebSocket endpoint — must be proxied with ws:true so realtime
      // connections reach the backend instead of hitting Vite's raw server.
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
        configure(proxy) {
          // A client disconnecting abruptly (ECONNRESET) must not crash the
          // dev server — swallow proxy socket errors.
          proxy.on('error', (err: any) => {
            console.warn('[proxy/ws]', err?.code || err?.message);
          });
        },
      },
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
