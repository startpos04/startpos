/**
 * test-db.ts
 *
 * Core integration test database utilities.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Design principle: isolation via savepoints                     │
 * │                                                                 │
 * │  Every test wraps its DB work inside a Postgres SAVEPOINT.      │
 * │  After the test (pass or fail) the savepoint is rolled back,    │
 * │  so each test starts from the post-seed state without any       │
 * │  rows written by previous tests.                                │
 * │                                                                 │
 * │  A single persistent pg.Client is used for the whole suite      │
 * │  (singleFork: true in vitest config) so savepoints work         │
 * │  correctly — they only exist within a single connection.        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Exports:
 *   getTestPrisma()      — returns the PrismaClient bound to the test DB
 *   getTestClient()      — returns the raw pg.Client for DDL / raw SQL
 *   withRollback(fn)     — wraps a test body; rolls back after fn resolves/rejects
 *   cleanTables(...names)— truncate specific tables (alternative to savepoints)
 *
 * Usage pattern in test files:
 *
 *   import { getTestPrisma, withRollback } from '#tests/integration/helpers/test-db'
 *
 *   describe('my feature', () => {
 *     it('does something', () => withRollback(async () => {
 *       const prisma = getTestPrisma()
 *       await prisma.business.create({ data: { ... } })
 *       const result = await prisma.business.findMany()
 *       expect(result).toHaveLength(1)
 *     }))
 *   })
 */

import pg from 'pg'
import { PrismaClient } from 'prisma/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// ---------------------------------------------------------------------------
// Module-level singletons — created once per test worker process.
// global-setup.ts ensures TEST_DATABASE_URL is set before any test file runs.
// ---------------------------------------------------------------------------

let _pgClient: pg.Client | null = null
let _prisma: PrismaClient | null = null

/**
 * Lazily initialise and return the raw pg.Client connected to the test DB.
 * Returns null when the DB is unavailable (INTEGRATION_DB_UNAVAILABLE flag set).
 */
export async function getTestClient(): Promise<pg.Client | null> {
  if (process.env['INTEGRATION_DB_UNAVAILABLE']) return null
  if (_pgClient) return _pgClient

  const url = process.env['TEST_DATABASE_URL']
  if (!url) {
    throw new Error(
      '[test-db] TEST_DATABASE_URL is not set. ' +
      'Ensure global-setup.ts ran before the test suite.',
    )
  }

  _pgClient = new pg.Client({ connectionString: url })
  await _pgClient.connect()
  return _pgClient
}

/**
 * Lazily initialise and return the PrismaClient bound to the test DB.
 * Returns null when the DB is unavailable.
 */
export async function getTestPrisma(): Promise<PrismaClient | null> {
  if (process.env['INTEGRATION_DB_UNAVAILABLE']) return null
  if (_prisma) return _prisma

  const url = process.env['TEST_DATABASE_URL']
  if (!url) {
    throw new Error('[test-db] TEST_DATABASE_URL is not set.')
  }

  const pool = new pg.Pool({ connectionString: url, max: 5 })
  const adapter = new PrismaPg(pool)
  _prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])
  return _prisma
}

// ---------------------------------------------------------------------------
// withRollback
// ---------------------------------------------------------------------------

let _savepointCounter = 0

/**
 * Wraps a test body in a Postgres SAVEPOINT / ROLLBACK TO SAVEPOINT so
 * all writes made inside `fn` are undone when it exits — regardless of
 * whether the test passes or throws.
 *
 * Uses a counter-suffixed savepoint name so nested calls are safe.
 *
 * Example:
 *   it('creates a business', () => withRollback(async () => {
 *     const prisma = await getTestPrisma()
 *     await prisma.business.create({ data: { ... } })
 *     // ...assertions...
 *   }))
 */
export async function withRollback<T>(fn: () => Promise<T>): Promise<T> {
  const client = await getTestClient()

  if (!client) {
    throw new Error(
      '[test-db] withRollback: Postgres is unavailable. ' +
      'Start the database and re-run pnpm test:integration.',
    )
  }

  const savepointName = `sp_test_${++_savepointCounter}`

  // Open a transaction block if we're not already inside one.
  // The raw pg.Client does not auto-start transactions, so we begin one.
  await client.query('BEGIN')
  await client.query(`SAVEPOINT ${savepointName}`)

  try {
    const result = await fn()
    await client.query(`RELEASE SAVEPOINT ${savepointName}`)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`)
    await client.query('ROLLBACK')
    throw err
  }
}

// ---------------------------------------------------------------------------
// cleanTables
// ---------------------------------------------------------------------------

/**
 * TRUNCATE the given tables with CASCADE, resetting them to their seeded state.
 * Useful when withRollback is impractical (e.g. testing code that itself
 * uses transactions that prevent nesting).
 *
 * Example:
 *   afterEach(() => cleanTables('businesses', 'branches', 'memberships'))
 */
export async function cleanTables(...tableNames: string[]): Promise<void> {
  const client = await getTestClient()
  if (!client) return // DB unavailable — nothing to clean
  const quoted = tableNames.map(t => `"${t}"`).join(', ')
  await client.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)
}

// ---------------------------------------------------------------------------
// Disconnect helper — called from setup.ts afterAll
// ---------------------------------------------------------------------------

export async function disconnectTestDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect()
    _prisma = null
  }
  if (_pgClient) {
    await _pgClient.end()
    _pgClient = null
  }
}

// ---------------------------------------------------------------------------
// dbDescribe
// A describe() wrapper that skips the entire block when Postgres is
// unavailable. Import and use instead of describe() in all Type 1 test files.
//
// Usage:
//   import { dbDescribe } from '#tests/integration/helpers/test-db'
//
//   dbDescribe('my feature — real DB', () => {
//     it('...', () => withRollback(async () => { ... }))
//   })
// ---------------------------------------------------------------------------

import { describe } from 'vitest'

export const dbDescribe = describe.runIf(!process.env['INTEGRATION_DB_UNAVAILABLE'])
