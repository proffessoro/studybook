import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC instead of the default transform, because NestJS needs emitted decorator metadata for dependency injection.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
