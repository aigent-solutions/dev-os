import { defineConfig, devices } from '@playwright/test';

// 00-foundation.md §12.1. In CI the app runs under `next start` with PROCESSING_MODE=sync
// (no Netlify background runtime) against the OpenAI mock server.
const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8888';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/setup/e2e-global.ts',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }, // nightly only
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: isCI
    ? { command: 'npm run build && npm run start', port: 3000, reuseExistingServer: false, timeout: 240_000 }
    : undefined,
});
