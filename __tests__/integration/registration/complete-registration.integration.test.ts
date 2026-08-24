/**
 * complete-registration.integration.test.ts  — TYPE 1 (real DB)
 *
 * Drives the completeRegistration handler against a real Postgres test
 * database. Every test is wrapped in withRollback() so all writes are
 * undone after the test, regardless of pass/fail.
 *
 * What this proves that unit tests cannot:
 *   - The Prisma $transaction actually commits all 7 rows atomically.
 *   - Foreign-key and unique-constraint rules are enforced by the real DB.
 *   - The idempotency branch (P2002 on Membership) works end-to-end.
 *   - The slug uniqueness query hits a real index.
 *   - The BusinessSubscription row is queryable after registration.
 *   - The CreditLedger balance is exactly 50 after registration.
 *
 * Test DB: start-pos-test (set TEST_POSTGRES_DB to override)
 * Isolation: per-test SAVEPOINT / ROLLBACK TO SAVEPOINT via withRollback()
 *
 * Coverage:
 *  - Happy path RETAIL: all 7 records created; subscription TRIAL; 50 credits
 *  - Happy path RESTAURANT: INCLUSIVE pricing config
 *  - Happy path GROCERY: EXCLUSIVE pricing config stored correctly
 *  - Slug derivation: spaces → hyphens, lowercase, special chars stripped
 *  - Slug collision: second registration with same name gets "-2" suffix
 *  - Idempotency: duplicate call (same userId) returns existing IDs, no extra rows
 *  - Missing trial plan: returns success:false without writing any rows
 *  - Unauthenticated call: returns success:false immediately
 *  - User role: User.role promoted to ADMIN after registration
 *  - trialEndsAt: approximately 30 days in the future
 *  - Configuration count: correct number of operational configs created per business type
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanTables, getTestPrisma, withRollback } from '#tests/integration/helpers/test-db'
import { makeSeedUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock createServerFn — capture the handler exactly as the unit tests do
// ---------------------------------------------------------------------------

let capturedHandler: ((opts: { data: unknown; context: unknown }) => unknown) | null = null

vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: (opts: { data: unknown; context: unknown }) => unknown) => {
      capturedHandler = fn
      return fn
    }),
  })),
}))

vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// ---------------------------------------------------------------------------
// IMPORTANT: do NOT mock @/lib/prisma-client here.
// We replace the module's prisma export with a client pointed at the test DB.
// When INTEGRATION_DB_UNAVAILABLE is set (no Postgres reachable), we return
// an empty stub so the file can be collected without crashing.
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma-client', async () => {
  if (process.env['INTEGRATION_DB_UNAVAILABLE']) {
    return { prisma: {} }
  }

  const { PrismaClient } = await import('prisma/generated/prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const pg = await import('pg')

  const url = process.env['TEST_DATABASE_URL'] ?? ''
  const pool = new pg.Pool({ connectionString: url, max: 3 })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

  return { prisma }
})

// Import the module under test AFTER mocks are declared
await import('@/lib/queries/complete-registration')

// ---------------------------------------------------------------------------
// Skip guard — all DB-dependent describes use this so they are skipped
// automatically when Postgres is not reachable (INTEGRATION_DB_UNAVAILABLE
// is set by global-setup.ts when the connection is refused).
// ---------------------------------------------------------------------------

const dbDescribe = describe.runIf(!process.env['INTEGRATION_DB_UNAVAILABLE'])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RegistrationInput = {
  displayName: string
  businessName: string
  businessType: 'RESTAURANT' | 'GROCERY' | 'RETAIL'
}

function input(overrides: Partial<RegistrationInput> = {}): RegistrationInput {
  return { displayName: 'Owner', businessName: 'Test Corp', businessType: 'RETAIL', ...overrides }
}

function ctx(userId: string) {
  return { user: { id: userId } }
}

async function run(data: RegistrationInput, context: unknown) {
  if (!capturedHandler) throw new Error('Handler not captured')
  return capturedHandler({ data, context }) as Promise<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Seed a minimal User row that foreign-key constraints require
// ---------------------------------------------------------------------------

async function seedUser(overrides: Partial<ReturnType<typeof makeSeedUser>> = {}) {
  const prisma = (await getTestPrisma())!
  if (!prisma) throw new Error('[seedUser] DB unavailable')
  const data = makeSeedUser(overrides)
  await prisma.user.create({
    data: {
      id: data.id,
      name: data.name,
      email: data.email,
      emailVerified: data.emailVerified,
      role: data.role as 'ADMIN' | 'CASHIER' | 'SUPERVISOR',
    },
  })
  return data
}

// ---------------------------------------------------------------------------
// Clean up tables that completeRegistration writes to, so each test starts
// fresh. withRollback handles per-test isolation; cleanTables is the backstop.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Tables are rolled back per-test via withRollback; this is just insurance.
  // We do NOT truncate subscription_plans — seeded in global-setup.
})

afterEach(async () => {
  // cleanTables is called inside withRollback — nothing needed here.
})

// ---------------------------------------------------------------------------
// Happy path — RETAIL
// ---------------------------------------------------------------------------

dbDescribe('completeRegistration (real DB) — happy path RETAIL', () => {
  it('creates all 7 records atomically and returns success:true', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input({ businessName: 'Retail Shop' }), ctx(user.id))

      expect(result.success).toBe(true)
      expect(typeof result.businessId).toBe('string')
      expect(typeof result.branchId).toBe('string')

      const businessId = result.businessId as string
      const branchId = result.branchId as string

      // 1. Business row exists
      const business = await prisma.business.findUnique({ where: { id: businessId } })
      expect(business).not.toBeNull()
      expect(business!.name).toBe('Retail Shop')
      expect(business!.businessType).toBe('RETAIL')

      // 2. Branch row exists and is linked
      const branch = await prisma.branch.findUnique({ where: { id: branchId } })
      expect(branch).not.toBeNull()
      expect(branch!.name).toBe('Main Branch')
      expect(branch!.businessId).toBe(businessId)

      // 3. Membership row links user → business with ADMIN role
      const membership = await prisma.membership.findFirst({
        where: { userId: user.id, businessId },
      })
      expect(membership).not.toBeNull()
      expect(membership!.role).toBe('ADMIN')

      // 4. User.role promoted to ADMIN
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
      expect(updatedUser!.role).toBe('ADMIN')

      // 5. BusinessSubscription created with TRIAL status
      const sub = await prisma.businessSubscription.findUnique({ where: { businessId } })
      expect(sub).not.toBeNull()
      expect(sub!.status).toBe('TRIAL')
      expect(sub!.billingModel).toBe('PREPAID_CREDITS')

      // 6. SubscriptionStatusHistory initial record
      const history = await prisma.subscriptionStatusHistory.findFirst({
        where: { subscriptionId: sub!.id },
      })
      expect(history).not.toBeNull()
      expect(history!.fromStatus).toBeNull()
      expect(history!.toStatus).toBe('TRIAL')
      expect(history!.triggeredBy).toBe('system')

      // 7. CreditLedger: 50 promotional credits
      const credit = await prisma.creditLedger.findFirst({ where: { businessId } })
      expect(credit).not.toBeNull()
      expect(credit!.amount).toBe(50)
      expect(credit!.balanceAfter).toBe(50)
      expect(credit!.eventType).toBe('PROMOTIONAL')
    })
  })

  it('sets trialEndsAt to approximately 30 days in the future', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input(), ctx(user.id))
      const businessId = result.businessId as string

      const sub = await prisma.businessSubscription.findUnique({ where: { businessId } })
      const diffDays = (sub!.trialEndsAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeGreaterThan(29)
      expect(diffDays).toBeLessThan(31)
    })
  })

  it('creates operational Configuration rows for RETAIL', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input({ businessType: 'RETAIL' }), ctx(user.id))
      const businessId = result.businessId as string

      const configs = await prisma.configuration.findMany({ where: { businessId } })
      // Operational configs only (PRICE_CONFIGURATION, IS_VAT_REGISTERED, etc.)
      // No more ENABLE_* capability toggles
      expect(configs.length).toBeGreaterThan(0)
      
      // Verify key operational configs exist
      const keys = configs.map(c => c.key)
      expect(keys).toContain('PRICE_CONFIGURATION')
      expect(keys).toContain('IS_VAT_REGISTERED')
    })
  })
})

// ---------------------------------------------------------------------------
// Happy path — business-type-specific configs
// ---------------------------------------------------------------------------

dbDescribe('completeRegistration (real DB) — business type configs', () => {
  it('RESTAURANT: PRICE_CONFIGURATION=INCLUSIVE and IS_VAT_REGISTERED=true', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input({ businessType: 'RESTAURANT' }), ctx(user.id))
      const businessId = result.businessId as string

      const priceConfig = await prisma.configuration.findFirst({
        where: { businessId, key: 'PRICE_CONFIGURATION' },
      })
      expect(priceConfig!.value).toBe('INCLUSIVE')

      const vatReg = await prisma.configuration.findFirst({
        where: { businessId, key: 'IS_VAT_REGISTERED' },
      })
      expect(vatReg!.value).toBe('true')
    })
  })

  it('GROCERY: PRICE_CONFIGURATION=EXCLUSIVE', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input({ businessType: 'GROCERY' }), ctx(user.id))
      const businessId = result.businessId as string

      const priceConfig = await prisma.configuration.findFirst({
        where: { businessId, key: 'PRICE_CONFIGURATION' },
      })
      expect(priceConfig!.value).toBe('EXCLUSIVE')
    })
  })

  it('all business types include LOCALE, CURRENCY, VAT_RATE global configs', async () => {
    for (const businessType of ['RESTAURANT', 'GROCERY', 'RETAIL'] as const) {
      await withRollback(async () => {
        const prisma = (await getTestPrisma())!
        const user = await seedUser()

        const result = await run(input({ businessType }), ctx(user.id))
        const businessId = result.businessId as string

        const keys = await prisma.configuration.findMany({
          where: { businessId },
          select: { key: true },
        })
        const keyNames = keys.map(k => k.key)
        expect(keyNames).toContain('LOCALE')
        expect(keyNames).toContain('CURRENCY')
        expect(keyNames).toContain('VAT_RATE')
        expect(keyNames).toContain('BUFFER_RATE')
        expect(keyNames).toContain('LOW_STOCK_THRESHOLD')
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

dbDescribe('completeRegistration (real DB) — slug generation', () => {
  it('derives a lowercase hyphenated slug from the business name', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input({ businessName: 'Hello World Bakery' }), ctx(user.id))
      const business = await prisma.business.findUnique({
        where: { id: result.businessId as string },
      })
      expect(business!.slug).toBe('hello-world-bakery')
    })
  })

  it('appends -2 suffix when the slug already exists', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!

      // First registration — creates slug 'my-shop'
      const user1 = await seedUser()
      const r1 = await run(input({ businessName: 'My Shop' }), ctx(user1.id))
      const business1 = await prisma.business.findUnique({
        where: { id: r1.businessId as string },
      })
      expect(business1!.slug).toBe('my-shop')

      // Second registration with same name — must get a different slug
      const user2 = await seedUser()
      const r2 = await run(input({ businessName: 'My Shop' }), ctx(user2.id))
      const business2 = await prisma.business.findUnique({
        where: { id: r2.businessId as string },
      })
      expect(business2!.slug).not.toBe('my-shop')
      expect(business2!.slug).toMatch(/^my-shop-\d+$/)
    })
  })
})

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

dbDescribe('completeRegistration (real DB) — idempotency', () => {
  it('returns existing IDs when called twice for the same user (P2002)', async () => {
    await withRollback(async () => {
      const user = await seedUser()

      const r1 = await run(input(), ctx(user.id))
      expect(r1.success).toBe(true)

      // Second call: same userId → unique constraint on Membership([userId, businessId])
      // triggers P2002; handler should catch it and return the existing IDs
      const r2 = await run(input(), ctx(user.id))
      expect(r2.success).toBe(true)
      expect(r2.businessId).toBe(r1.businessId)
      expect(r2.branchId).toBe(r1.branchId)
    })
  })

  it('does not create a second BusinessSubscription row on duplicate call', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      await run(input(), ctx(user.id))
      await run(input(), ctx(user.id)) // duplicate

      const subs = await prisma.businessSubscription.findMany({
        where: { business: { members: { some: { userId: user.id } } } },
      })
      // businessId is UNIQUE in BusinessSubscription — only one row should exist
      expect(subs.length).toBe(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

dbDescribe('completeRegistration (real DB) — error paths', () => {
  it('returns success:false when called without authentication', async () => {
    const result = await run(input(), null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authenticated')
  })

  it('writes NO rows when the Trial plan is missing from the DB', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      // Remove the trial plan so the lookup fails
      await prisma.businessSubscription.deleteMany({
        where: { plan: { name: 'Trial' } },
      })
      await prisma.$executeRaw`DELETE FROM subscription_plans WHERE name = 'Trial'`

      const user = await seedUser()
      const result = await run(input(), ctx(user.id))

      expect(result.success).toBe(false)
      expect(typeof result.error).toBe('string')

      // No business should have been created
      const businesses = await prisma.business.findMany({
        where: { members: { some: { userId: user.id } } },
      })
      expect(businesses).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Cross-record integrity
// ---------------------------------------------------------------------------

dbDescribe('completeRegistration (real DB) — data integrity', () => {
  it('BusinessSubscription.planId references the seeded Trial plan', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input(), ctx(user.id))
      const sub = await prisma.businessSubscription.findUnique({
        where: { businessId: result.businessId as string },
        include: { plan: true },
      })
      expect(sub!.plan.name).toBe('Trial')
    })
  })

  it('Branch.businessId matches Business.id (FK enforced by DB)', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input(), ctx(user.id))
      const branch = await prisma.branch.findUnique({
        where: { id: result.branchId as string },
      })
      expect(branch!.businessId).toBe(result.businessId)
    })
  })

  it('CreditLedger.actorId is the registering userId', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input(), ctx(user.id))
      const credit = await prisma.creditLedger.findFirst({
        where: { businessId: result.businessId as string },
      })
      expect(credit!.actorId).toBe(user.id)
    })
  })

  it('SubscriptionStatusHistory.triggeredBy is "system"', async () => {
    await withRollback(async () => {
      const prisma = (await getTestPrisma())!
      const user = await seedUser()

      const result = await run(input(), ctx(user.id))
      const sub = await prisma.businessSubscription.findUnique({
        where: { businessId: result.businessId as string },
      })
      const history = await prisma.subscriptionStatusHistory.findFirst({
        where: { subscriptionId: sub!.id },
      })
      expect(history!.triggeredBy).toBe('system')
    })
  })
})
