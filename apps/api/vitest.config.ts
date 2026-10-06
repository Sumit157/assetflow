import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one database; keep files serial.
    fileParallelism: false,
    // Each file drops the database, so mongoose re-runs autoIndex for every
    // model (~30 index builds) — on Docker-Desktop MongoDB this storm takes
    // 15-30s and blocks the first write, so both timeouts need real headroom.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_MAX: '10000',
      AUTH_RATE_LIMIT_MAX: '1000',
      MONGODB_URI: 'mongodb://localhost:27018/assetflow_test',
    },
  },
});
