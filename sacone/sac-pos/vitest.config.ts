import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The parity test imports the SACONE API's tax function; point it at a scratch DB.
    env: { DATABASE_PATH: '/tmp/sac-pos-vitest.db' },
  },
});
