import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget =
    process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: ['src/test/setup.ts'],
      env: {
        VITE_API_BASE_URL: 'http://api.test',
      },
    },
  };
});
