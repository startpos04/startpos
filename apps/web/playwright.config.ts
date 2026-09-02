import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './__tests__/e2e',
  outputDir: './e2e-results',
  globalSetup: './__tests__/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  timeout: 30000, // 30 seconds per test

  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000, // 10 seconds for each action
  },

  /* Configure the production server for E2E tests
   *
   * IMPORTANT: This config expects the production server to be ALREADY RUNNING!
   *
   * Before running E2E tests, start the server:
   *   pnpm start
   *
   * Then in another terminal:
   *   pnpm test:e2e
   *   pnpm test:e2e:ui
   *
   * If you want Playwright to build and start automatically (slower), change:
   *   reuseExistingServer: true  →  reuseExistingServer: !process.env['CI']
   */
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // Expects server already running - see comment above
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180000, // 3 minutes for build + start (only used if server not running)
  },

  projects: [
    // ── Role-scoped test runners ──────────────────────────────────────────────
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './__tests__/e2e/fixtures/.auth/admin.json',
      },
    },
    {
      name: 'supervisor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './__tests__/e2e/fixtures/.auth/supervisor.json',
      },
    },
    {
      name: 'cashier',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './__tests__/e2e/fixtures/.auth/cashier.json',
      },
    },
    // ── Unauthenticated test runner (for registration/login flows) ────────────
    {
      name: 'unauthenticated',
      use: {
        ...devices['Desktop Chrome'],
        // No storageState - starts with clean browser (no auth cookies)
      },
    },
  ],
})
