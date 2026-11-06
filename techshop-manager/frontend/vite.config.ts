import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Le build SSR (pré-rendu des pages publiques, scripts/prerender.mjs)
    // laisse les dépendances à Node : pas de découpage manuel.
    rollupOptions: isSsrBuild ? {} : {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['chart.js', 'react-chartjs-2'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
}));
