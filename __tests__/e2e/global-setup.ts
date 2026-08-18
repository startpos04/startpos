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
 *   SKIP_DB_RESET=true        — skips database reset and seed entirely
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
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
  // ── 0. Check if production server is running ──────────────────────────────
  console.info('\n🔍 [E2E Setup] Checking if production server is running...')
  console.info(`   Expected server at: ${BASE_URL}`)
  
  try {
    const response = await fetch(`${BASE_URL}/login`)
    if (response.ok || response.status === 200 || response.status === 404) {
      console.info('✅ [E2E Setup] Production server is running and ready')
      console.info(`   Status: ${response.status}`)
    } else {
      console.warn('⚠️  [E2E Setup] Server responded with unexpected status:', response.status)
    }
  } catch (err) {
    console.error('\n❌ [E2E Setup] PRODUCTION SERVER NOT RUNNING!')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('  The E2E tests require the production build to be running.')
    console.error('  ')
    console.error('  Please start the server FIRST in another terminal:')
    console.error('  ')
    console.error('    pnpm start')
    console.error('  ')
    console.error('  Then run the E2E tests:')
    console.error('  ')
    console.error('    pnpm test:e2e')
    console.error('    pnpm test:e2e:ui')
    console.error('  ')
    console.error('  Or let Playwright build and start automatically (slower):')
    console.error('  Update playwright.config.ts to use:')
    console.error('    reuseExistingServer: !process.env["CI"]')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    throw new Error(`Production server at ${BASE_URL} is not running. Start with: pnpm start`)
  }

  // ── 1. Reset DB ────────────────────────────────────────────────────────────
  // Check if user wants to skip DB reset (for faster test iterations)
  const skipDbReset = process.env['SKIP_DB_RESET'] === 'true'
  
  if (skipDbReset) {
    console.info('⏭️  [E2E Setup] SKIP_DB_RESET=true - Skipping database reset and seed')
    console.info('   Using existing database state')
  } else {
    // Interactive prompt: ask user if they want to reset
    const isInteractive = !process.env['CI'] && process.stdin.isTTY
    
    if (isInteractive) {
      console.info('\n⚠️  [E2E Setup] Database reset will DELETE ALL DATA')
      const answer = await promptUser('Do you want to reset the database? (y/n): ')
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.info('⏭️  [E2E Setup] Database reset skipped by user')
        console.info('   Tip: Set SKIP_DB_RESET=true to skip this prompt')
        console.info('   Example: $env:SKIP_DB_RESET="true"; pnpm test:e2e')
      } else {
        await resetAndSeedDatabase()
      }
    } else {
      // In CI or non-interactive environment, always reset
      console.info('[E2E Setup] Non-interactive mode detected (CI or no TTY), resetting database...')
      await resetAndSeedDatabase()
    }
  }

  // ── 3. Generate auth-state files ──────────────────────────────────────────
  console.info('\n🔐 [E2E Setup] Generating auth state files...')
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  console.info('🚀 [E2E Setup] Launching browser...')
  const browser = await chromium.launch({ headless: true })

  for (const account of TEST_ACCOUNTS) {
    console.info(`\n👤 [E2E Setup] Processing ${account.role}...`)
    
    try {
      const context = await browser.newContext()
      const page    = await context.newPage()

      console.info(`  📍 Navigating to ${BASE_URL}/login...`)
      const response = await page.goto(`${BASE_URL}/login`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      console.info(`  ✓ Navigation complete (status: ${response?.status()})`)

      await page.screenshot({
        path: path.join(AUTH_DIR, `debug-${account.role}.png`),
        fullPage: true,
      })

      // Wait for the email input to be visible and React hydrated
      console.info(`  ⏳ Waiting for email input...`)
      const emailInput = page.locator('[data-testid="email-input"]')
      await emailInput.waitFor({ state: 'visible', timeout: 10000 })
      
      // Additional small wait for React hydration  
      await page.waitForTimeout(500)
      
      console.info(`  📝 Filling login form...`)
      await emailInput.fill(account.email)
      
      const passwordInput = page.locator('[data-testid="password-input"]')
      await passwordInput.fill(PASSWORD)
      
      // Find and click submit button
      const submitButton = page.locator('[data-testid="login-button"]')
      await submitButton.waitFor({ state: 'visible', timeout: 5000 })
      
      console.info(`  🔘 Clicking submit button...`)
      await submitButton.click()

      // Wait until we've navigated away from /login
      console.info(`  ⏳ Waiting for navigation...`)
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })

      // Wait for page to fully load (TanStack Router transitions)
      await page.waitForLoadState('networkidle', { timeout: 10000 })
      console.info(`  ✓ Page loaded`)

      // Check for Terms of Service modal and accept if present
      console.info(`  🔍 Checking for Terms of Service modal...`)
      
      // Wait a bit for React to render the modal if it's going to appear
      await page.waitForTimeout(1000)
      
      const tosModal = page.locator('[data-testid="terms-acceptance-checkbox"]')
      const tosModalVisible = await tosModal.isVisible({ timeout: 3000 }).catch(() => false)
      
      if (tosModalVisible) {
        console.info(`  📜 Terms of Service modal detected - accepting...`)
        
        // Click the checkbox
        await tosModal.click()
        console.info(`  ✓ Checkbox clicked`)
        
        // Wait a bit for the button to be enabled
        await page.waitForTimeout(500)
        
        // Click the accept button and wait for API call
        const [response] = await Promise.all([
          page.waitForResponse(
            res => {
              const url = res.url()
              return url.includes('/_server') || url.includes('accept')
            },
            { timeout: 10000 }
          ),
          page.locator('[data-testid="accept-terms-button"]').click()
        ])
        
        console.info(`  ✓ Accept button clicked, API response: ${response.status()}`)
        
        // Wait for the modal to disappear
        await page.waitForSelector('[data-testid="terms-update-modal"]', { 
          state: 'hidden', 
          timeout: 10000 
        })
        console.info(`  ✅ Terms accepted and modal closed`)
        
        // Extra wait to ensure state is persisted
        await page.waitForTimeout(1000)
      } else {
        console.info(`  ✓ No Terms of Service modal (already accepted)`)
      }

      // IMPORTANT: Save auth state AFTER TOS acceptance so the updated termsVersion is included
      const statePath = path.join(AUTH_DIR, `${account.role}.json`)
      await context.storageState({ path: statePath })
      console.info(`  ✅ ${account.role} auth state saved → ${statePath}`)

      await context.close()
    } catch (error) {
      console.error(`  ❌ Failed to generate auth state for ${account.role}:`)
      console.error(`     ${error}`)
      throw error
    }
  }

  await browser.close()
  console.info('\n✅ [E2E Setup] All auth states generated. Ready to run tests.\n')
}

// ── Helper Functions ────────────────────────────────────────────────────────

/**
 * Prompts the user for input in the terminal
 */
function promptUser(question: string): Promise<string> {
  return new Promise(resolve => {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    
    readline.question(question, (answer: string) => {
      readline.close()
      resolve(answer)
    })
  })
}

/**
 * Resets the database and seeds it with e2e data
 */
async function resetAndSeedDatabase() {
  console.info('\n🔄 [E2E Setup] Resetting database...')
  execSync('pnpm exec prisma db push --force-reset', {
    stdio: 'inherit',
    env: {
      ...process.env,
      RESET_AUTO_CONFIRM: 'true',
    },
  })
  console.info('✅ [E2E Setup] Database schema reset complete.')

  console.info('\n🌱 [E2E Setup] Seeding e2e dataset...')
  execSync('pnpm seed', {
    stdio: 'inherit',
    env: {
      ...process.env,
      SEED_AUTO_CONFIRM: 'true',
      SEED_FOLDER: 'e2e',
    },
  })
  console.info('✅ [E2E Setup] Seed complete.')
}
