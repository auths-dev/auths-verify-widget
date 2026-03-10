import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    globals: true,
  },
  resolve: {
    alias: {
      '@auths/verifier': resolve(__dirname, '../auths/packages/auths-verifier-ts/src'),
      'auths-verifier-wasm': resolve(__dirname, 'wasm/auths_verifier.js'),
    },
  },
});
