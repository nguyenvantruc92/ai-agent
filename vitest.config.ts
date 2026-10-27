import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { include: ['tests/**/*.test.ts'], env: { LOG_LEVEL: 'silent' } },
});
