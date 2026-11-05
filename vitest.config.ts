import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  // The DB tests share one database and truncate it, so files must not run at the same time.
  test: { include: ['tests/**/*.test.ts'], globalSetup: ['tests/setup/require-db.ts'], env: { LOG_LEVEL: 'silent', PAYMENT_SIMULATION_ENABLED: 'true' }, fileParallelism: false },
});
