import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './__tests__/e2e',
  globalSetup: './__tests__/e2e/global-setup.ts',
  fullyParallel: true,
  reporter: 'html',

  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  /* Configure the local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    // ── Auth setup (no storageState — used only by global-setup) ─────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

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
  ],
})
