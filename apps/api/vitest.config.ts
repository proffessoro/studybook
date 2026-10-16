import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC instead of the default transform, because NestJS needs emitted decorator metadata for dependency injection.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['src/testing/global-setup.ts'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    env: {
      // Separate from the development data. Needs `pnpm db:up` (see deploy/docker-compose.dev.yml).
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://studybook:studybook@localhost:5432/studybook_test',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
      PUBLIC_URL: 'http://localhost:3000',
    },
  },
});
