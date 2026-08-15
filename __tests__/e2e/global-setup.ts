/**
 * Playwright Global Setup
 *
 * Runs once before the entire test session. Does three things:
 *   1. Wipes and rebuilds the DB schema (prisma db push --force-reset)
 *   2. Seeds the DB with the e2e dataset (SEED_FOLDER=e2e)
 *   3. Generates saved auth-state files for each role (admin / supervisor / cashier)
 *
 * The auth-state files are written to __tests__/e2e/fixtures/.auth/ and
 * referenced by individual spec files via `use: { storageState: '...' }`.
 *
 * Environment variables used:
 *   RESET_AUTO_CONFIRM=true   — skips the interactive reset confirmation
 *   SEED_AUTO_CONFIRM=true    — skips the interactive seed confirmation
 *   SEED_FOLDER=e2e           — targets the e2e CSV dataset
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL   = process.env['BASE_URL'] ?? 'http://localhost:3000'
const AUTH_DIR   = path.join(__dirname, 'fixtures', '.auth')
const PASSWORD   = '123qwe123!1'

// Accounts defined in prisma/seeders/csv/e2e/accounts.csv
const TEST_ACCOUNTS = [
  { email: 'e2e.admin@test.com',      role: 'admin'      },
  { email: 'e2e.supervisor@test.com', role: 'supervisor' },
  { email: 'e2e.cashier@test.com',    role: 'cashier'    },
] as const

export default async function globalSetup() {
  // ── 1. Reset DB ────────────────────────────────────────────────────────────
  console.info('\n🔄 [E2E Setup] Resetting database...')
  execSync('pnpm exec prisma db push --force-reset', {
    stdio: 'inherit',
    env: {
      ...process.env,
      RESET_AUTO_CONFIRM: 'true',
    },
  })
  console.info('✅ [E2E Setup] Database schema reset complete.')

  // ── 2. Seed with e2e dataset ───────────────────────────────────────────────
  console.info('\n🌱 [E2E Setup] Seeding e2e dataset...')
  execSync('pnpm seed', {
    stdio: 'inherit',
    env: {
      ...process.env,
      SEED_AUTO_CONFIRM: 'true',
      SEED_FOLDER:       'e2e',
    },
  })
  console.info('✅ [E2E Setup] Seed complete.')

  // ── 3. Generate auth-state files ──────────────────────────────────────────
  console.info('\n🔐 [E2E Setup] Generating auth state files...')
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  const browser = await chromium.launch()

  for (const account of TEST_ACCOUNTS) {
    const context = await browser.newContext()
    const page    = await context.newPage()

    const response = await page.goto(`${BASE_URL}/login`)

    console.info(`  URL: ${page.url()}`)
    console.info(`  Status: ${response?.status()}`)
    console.info(`  Content-Type: ${response?.headers()['content-type']}`)

    console.info(`  Title: ${await page.title()}`)
    console.info(`  Body: ${(await page.locator('body').innerText()).slice(0, 1000)}`)

    await page.screenshot({
      path: path.join(AUTH_DIR, `debug-${account.role}.png`),
      fullPage: true,
    })

    await page.getByLabel(/email/i).fill(account.email)
    await page.getByLabel(/password/i).fill(PASSWORD)
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    // Wait until we've navigated away from /login
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })

    const statePath = path.join(AUTH_DIR, `${account.role}.json`)
    await context.storageState({ path: statePath })
    console.info(`  ✓ ${account.role} auth state saved → ${statePath}`)

    await context.close()
  }

  await browser.close()
  console.info('\n✅ [E2E Setup] All auth states generated. Ready to run tests.\n')
}
