import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one database; keep files serial.
    fileParallelism: false,
    // Generous enough for a freshly started (cold) MongoDB.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_MAX: '10000',
      AUTH_RATE_LIMIT_MAX: '1000',
      MONGODB_URI: 'mongodb://localhost:27018/assetflow_test',
    },
  },
});
