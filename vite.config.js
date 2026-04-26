import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://dashboard.birivibe.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
