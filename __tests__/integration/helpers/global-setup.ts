/**
 * global-setup.ts  (integration test global setup)
 *
 * Runs ONCE before the entire integration suite (not per-file).
 * Responsibilities:
 *   1. Verify a test database URL is configured.
 *   2. Push the current Prisma schema to the test DB (db push --force-reset).
 *      This is safe because TEST_POSTGRES_DB is a throw-away database that
 *      never contains production data.
 *   3. Seed the minimum platform data the tests depend on
 *      (SubscriptionPlan "Trial").
 *
 * The global teardown just disconnects — the DB itself is left intact so
 * failures can be inspected. A fresh push on the next run resets it anyway.
 *
 * Environment variables (set in .env.local for local dev, or in CI secrets):
 *   TEST_POSTGRES_DB   — name of the throw-away test database (default: start-pos-test)
 *   All other POSTGRES_* vars are inherited from the normal dev config.
 *
 * The vitest.integration.config.ts globalSetup array points here.
 */

import { execSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import pg from 'pg'
import { config as loadEnv } from 'dotenv'

// Load .env and .env.local the same way the app does.
loadEnv({ path: '.env', quiet: true })
loadEnv({ path: '.env.local', override: true, quiet: true })

// ---------------------------------------------------------------------------
// Derive the test DB URL from the same POSTGRES_* env vars the app uses,
// but swap the database name for the test-specific one.
// ---------------------------------------------------------------------------

function buildTestUrl(): string {
  const user = process.env['POSTGRES_USER'] ?? 'root'
  const password = process.env['POSTGRES_PASSWORD'] ?? 'password'
  const host = process.env['POSTGRES_HOST'] ?? 'localhost'
  const port = process.env['POSTGRES_HOST_PORT'] ?? process.env['POSTGRES_PORT'] ?? '5432'
  const db = process.env['TEST_POSTGRES_DB'] ?? 'start-pos-test'

  const enc = encodeURIComponent
  return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${db}?schema=public`
}

function isConnectionError(err: unknown): boolean {
  if (err == null) return false
  const code = (err as { code?: string }).code
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return true
  // AggregateError from pg 8.x — check nested errors array
  const errors = (err as { errors?: unknown[] }).errors
  if (Array.isArray(errors)) {
    return errors.some(e => isConnectionError(e))
  }
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
}

// ---------------------------------------------------------------------------
// Prompt the developer when the DB is not reachable.
//
// Behaviour:
//   - Non-TTY / CI (stdin is not interactive):  auto-skips without prompting.
//     Set SKIP_DB_PROMPT=true to force this path in scripts.
//   - Interactive TTY: asks "Continue with Type 2 only? [y/N]"
//     y / Y  → sets INTEGRATION_DB_UNAVAILABLE and continues.
//     n / N / Enter / anything else → exits process with code 0.
// ---------------------------------------------------------------------------

async function promptOnNoDb(): Promise<void> {
  const isCI = process.env['CI'] === 'true'
  const forceSkip = process.env['SKIP_DB_PROMPT'] === 'true'
  // Use stdout.isTTY — more reliable than stdin.isTTY in piped shells.
  const isTTY = Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY)

  console.warn(
    '\n╔══════════════════════════════════════════════════════════════╗\n' +
    '║  ⚠️   Postgres is not reachable                               ║\n' +
    '║                                                               ║\n' +
    '║  Type 1 tests (real DB) require a running Postgres instance. ║\n' +
    '║  To enable them: start Postgres and check your .env.local     ║\n' +
    '║  (POSTGRES_HOST, POSTGRES_HOST_PORT, TEST_POSTGRES_DB).       ║\n' +
    '║                                                               ║\n' +
    '║  Type 2 tests (orchestration, mocked DB) run without a DB.   ║\n' +
    '╚══════════════════════════════════════════════════════════════╝\n',
  )

  if (isCI || forceSkip || !isTTY) {
    // Non-interactive: auto-skip Type 1 and continue with Type 2.
    console.info('[integration] Non-interactive environment — skipping Type 1 tests automatically.\n')
    process.env['INTEGRATION_DB_UNAVAILABLE'] = 'true'
    return
  }

  // Interactive: ask the developer what to do.
  // A 30-second timeout defaults to "no" (abort) so CI/scripts never hang.
  const answer = await Promise.race([
    new Promise<string>(resolve => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question('  Continue with Type 2 (orchestration) tests only? [y/N] ', ans => {
        rl.close()
        resolve(ans.trim().toLowerCase())
      })
    }),
    new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 30_000)),
  ])

  if (answer === 'y' || answer === 'yes') {
    console.info('\n[integration] Continuing — Type 1 tests will be skipped.\n')
    process.env['INTEGRATION_DB_UNAVAILABLE'] = 'true'
  } else if (answer === 'timeout') {
    console.warn('\n[integration] No response after 30 s — aborting. Start Postgres and retry.\n')
    process.exit(0)
  } else {
    console.info('\n[integration] Aborted. Start Postgres and re-run pnpm test:integration.\n')
    process.exit(0)
  }
}

export async function setup() {
  const testUrl = buildTestUrl()
  process.env['TEST_DATABASE_URL'] = testUrl

  const dbName = process.env['TEST_POSTGRES_DB'] ?? 'start-pos-test'
  const adminUrl = testUrl.replace(`/${dbName}?`, '/postgres?')

  // ── 1. Ensure the test database exists ────────────────────────────────────
  const client = new pg.Client({ connectionString: adminUrl })
  try {
    await client.connect()
    await client.query(`CREATE DATABASE "${dbName}"`)
    console.info(`[integration] Created test database: ${dbName}`)
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      await promptOnNoDb()
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('already exists')) throw err
    console.info(`[integration] Test database already exists: ${dbName}`)
  } finally {
    await client.end().catch(() => {})
  }

  // ── 2. Push schema ────────────────────────────────────────────────────────
  console.info('[integration] Pushing schema to test database...')
  try {
    execSync('pnpm exec prisma db push --force-reset --accept-data-loss --skip-generate', {
      stdio: 'inherit',
      env: { ...process.env, POSTGRES_DB: dbName, DATABASE_URL: testUrl },
    })
  } catch {
    console.error('[integration] Schema push failed — Type 1 tests will fail.')
    process.env['INTEGRATION_DB_UNAVAILABLE'] = 'true'
    return
  }
  console.info('[integration] Schema push complete.')

  // ── 3. Seed platform data ─────────────────────────────────────────────────
  await seedPlatformData(testUrl)
  console.info('[integration] Platform seed complete.')
}

export async function teardown() {
  // Nothing to drop — next run's force-reset is sufficient.
  // Just log so CI output is clear.
  console.info('[integration] Global teardown complete (test DB left intact for inspection).')
}

// ---------------------------------------------------------------------------
// Seed the minimum platform data every test depends on.
// Uses raw pg to avoid importing PrismaClient here (keeps global-setup
// free of the app's module graph, which expects .env.local to be loaded
// before the PrismaClient singleton is touched).
// ---------------------------------------------------------------------------

async function seedPlatformData(testUrl: string) {
  const client = new pg.Client({ connectionString: testUrl })
  await client.connect()

  try {
    // Upsert a "Trial" SubscriptionPlan row.  Tests that need other plans
    // (Starter, Growth) can create them inside their own beforeEach via
    // testPrisma directly.
    await client.query(`
      INSERT INTO subscription_plans
        (id, name, description, "isActive", "sortOrder", "monthlyPrice",
         "includedTxPerMonth", "overagePerTx", "createdAt", "updatedAt")
      VALUES
        ('plan-trial', 'Trial', 'Free trial plan', true, 0, 0, 500, 0, now(), now()),
        ('plan-starter', 'Starter', 'Starter plan', true, 1, 29900, 500, 100, now(), now()),
        ('plan-growth', 'Growth', 'Growth plan', true, 2, 59900, 2000, 50, now(), now()),
        ('plan-premium', 'Premium', 'Premium plan', true, 3, 99900, -1, 0, now(), now())
      ON CONFLICT (name) DO NOTHING;
    `)
  } finally {
    await client.end()
  }
}
