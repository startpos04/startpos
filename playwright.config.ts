import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    // TanStack Start default port is usually 3000
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  /* Configure the local dev server before starting the tests */
  webServer: {
    command: 'npm run dev', // Ensure this is your Start dev command
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
