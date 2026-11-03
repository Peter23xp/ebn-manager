import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Config Vitest séparée (fusionnée avec vite.config.ts au runtime de test).
// Le bloc `test` ne peut PAS vivre dans vite.config.ts : vitest 4 embarque
// vite@8 dans ses types, incompatible avec defineConfig de vite@5 (TS2769).
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Les beforeEach qui importent dynamiquement des pages lourdes (graphiques,
    // PDF) dépassaient 10 s à froid quand toute la suite tourne en parallèle.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    alias: {
      '@': resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
