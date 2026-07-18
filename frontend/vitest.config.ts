import { defineConfig } from 'vitest/config';

// Headless CSG/logic tests only. They import app modules directly (no bundler-only `?url`
// imports outside the worker), so the default node environment is enough -- no jsdom.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000, // WASM load + full-res CSG across the matrix is not instant
  },
});
