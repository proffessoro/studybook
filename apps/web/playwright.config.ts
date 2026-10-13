import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests on a phone viewport (NFR-01). Slow-3G throttling and the full
 * core flow come with step 1.8; for now this checks that pages render in FR and EN.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Against `next dev`, the first visit to a page compiles it, which can take
  // several seconds; this is not a measure of the app's speed (NFR-08 is checked in 1.8).
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
