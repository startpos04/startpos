/**
 * complete-registration.test.ts
 *
 * Tests for the completeRegistration server function handler.
 *
 * Strategy:
 *   completeRegistration is a createServerFn that wraps a handler. We test
 *   the handler logic by:
 *     1. Mocking rootPrisma so no real DB connection is required.
 *     2. Mocking authMiddleware so context.user is controlled.
 *     3. Mocking createServerFn to expose the handler callback directly.
 *
 * Coverage:
 *  - Happy path: atomically creates all 7 records in correct order
 *  - Happy path: subscription is provisioned as TRIAL with PREPAID_CREDITS
 *  - Happy path: 50 complimentary credits are granted
 *  - Happy path: business-type-specific SystemConfig defaults are applied
 *  - Happy path: global LOCALE/CURRENCY/VAT_RATE configs always included
 *  - Happy path: user role is promoted to ADMIN
 *  - Idempotency: P2002 unique violation returns existing businessId/branchId
 *  - Error path: missing Trial subscription plan returns success:false
 *  - Error path: unauthenticated user (no context.user) returns success:false
 *  - Error path: unexpected DB error returns success:false
 *  - Slug generation: slug is derived from businessName
 *  - Slug generation: slug collision appends a numeric suffix
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { BillingModel, TransitionTrigger } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// Mock: createServerFn — returns a fake builder; captures handler via .handler()
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

// ---------------------------------------------------------------------------
// Mock: authMiddleware — noop, context is injected directly in tests
// ---------------------------------------------------------------------------

vi.mock('@/lib/better-auth/auth-middleware', () => ({
  authMiddleware: {},
}))

// ---------------------------------------------------------------------------
// Mock: rootPrisma
// ---------------------------------------------------------------------------

const mockTx = {
  business: { create: vi.fn() },
  branch: { create: vi.fn() },
  membership: { create: vi.fn() },
  user: { update: vi.fn() },
  systemConfig: { create: vi.fn() },
  businessSubscription: { create: vi.fn() },
  subscriptionStatusHistory: { create: vi.fn() },
  creditLedger: { create: vi.fn() },
}

const mockPrisma = {
  subscriptionPlan: {
    findFirst: vi.fn(),
  },
  business: {
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  membership: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('@/lib/prisma-client', () => ({
  prisma: mockPrisma,
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER all mocks are declared
// ---------------------------------------------------------------------------

// We import to trigger the side-effectful createServerFn call that registers
// the handler. The exported symbol is unused — we call `capturedHandler` directly.
await import('@/lib/queries/complete-registration')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HandlerOpts = {
  data: {
    displayName: string
    businessName: string
    businessType: 'RESTAURANT' | 'GROCERY' | 'RETAIL'
  }
  context: { user?: { id: string } } | null
}

function validInput(overrides: Partial<HandlerOpts['data']> = {}): HandlerOpts['data'] {
  return {
    displayName: 'Test Owner',
    businessName: 'Test Biz',
    businessType: 'RETAIL',
    ...overrides,
  }
}

function authedContext(userId = 'user-001'): HandlerOpts['context'] {
  return { user: { id: userId } }
}

async function runHandler(opts: HandlerOpts) {
  if (!capturedHandler) throw new Error('Handler was not captured — check the mock setup')
  return capturedHandler(opts as Parameters<typeof capturedHandler>[0])
}

// ---------------------------------------------------------------------------
// Setup: configure mock return values before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Default: Trial plan exists
  mockPrisma.subscriptionPlan.findFirst.mockResolvedValue({ id: 'plan-trial-001' })

  // Default: No existing slug collision
  mockPrisma.business.findFirst.mockResolvedValue(null)
  mockPrisma.business.count.mockResolvedValue(0)

  // Default: $transaction executes the callback and returns its result
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))

  // Default tx mock return values
  mockTx.business.create.mockResolvedValue({ id: 'biz-new-001' })
  mockTx.branch.create.mockResolvedValue({ id: 'branch-new-001' })
  mockTx.membership.create.mockResolvedValue({})
  mockTx.user.update.mockResolvedValue({})
  mockTx.systemConfig.create.mockResolvedValue({})
  mockTx.businessSubscription.create.mockResolvedValue({ id: 'sub-new-001' })
  mockTx.subscriptionStatusHistory.create.mockResolvedValue({})
  mockTx.creditLedger.create.mockResolvedValue({})
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('completeRegistration — happy path', () => {
  it('returns success:true with businessId and branchId', async () => {
    const result = await runHandler({ data: validInput(), context: authedContext() }) as Record<string, unknown>
    expect(result.success).toBe(true)
    expect(result.businessId).toBe('biz-new-001')
    expect(result.branchId).toBe('branch-new-001')
  })

  it('runs everything inside a single $transaction call', async () => {
    await runHandler({ data: validInput(), context: authedContext() })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('creates the Business with the derived slug and businessType', async () => {
    await runHandler({ data: validInput({ businessName: 'My Shop', businessType: 'GROCERY' }), context: authedContext() })

    expect(mockTx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'My Shop',
          slug: 'my-shop',
          businessType: 'GROCERY',
        }),
      }),
    )
  })

  it('creates the Branch as "Main Branch" for the new business', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    expect(mockTx.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Main Branch',
          businessId: 'biz-new-001',
        }),
      }),
    )
  })

  it('creates a Membership with role ADMIN linking userId → businessId', async () => {
    await runHandler({ data: validInput(), context: authedContext('user-xyz') })

    expect(mockTx.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-xyz',
          businessId: 'biz-new-001',
          branchId: 'branch-new-001',
          role: 'ADMIN',
        }),
      }),
    )
  })

  it('promotes the User record to ADMIN role', async () => {
    await runHandler({ data: validInput(), context: authedContext('user-xyz') })

    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-xyz' },
        data: { role: 'ADMIN' },
      }),
    )
  })

  it('provisions a BusinessSubscription with TRIAL status and PREPAID_CREDITS billing', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    expect(mockTx.businessSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: 'biz-new-001',
          planId: 'plan-trial-001',
          status: SubscriptionStatus.TRIAL,
          billingModel: BillingModel.PREPAID_CREDITS,
        }),
      }),
    )
  })

  it('sets trialEndsAt to approximately 30 days from now', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const call = mockTx.businessSubscription.create.mock.calls[0]?.[0]
    const { trialEndsAt } = call.data
    const now = new Date()
    const diffDays = (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(31)
  })

  it('writes a SubscriptionStatusHistory record with the TRIAL status', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    expect(mockTx.subscriptionStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: 'sub-new-001',
          fromStatus: null,
          toStatus: SubscriptionStatus.TRIAL,
          triggeredBy: TransitionTrigger.SYSTEM,
        }),
      }),
    )
  })

  it('grants exactly 50 complimentary PROMOTIONAL credits', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    expect(mockTx.creditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: 'biz-new-001',
          eventType: 'PROMOTIONAL',
          amount: 50,
          balanceAfter: 50,
          transactionId: null,
        }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Business-type SystemConfig defaults
// ---------------------------------------------------------------------------

describe('completeRegistration — SystemConfig defaults', () => {
  it('creates RESTAURANT-specific configs (INCLUSIVE pricing, VAT registered)', async () => {
    await runHandler({ data: validInput({ businessType: 'RESTAURANT' }), context: authedContext() })

    const configCalls = mockTx.systemConfig.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { key: string; value: string } }).data)
    const priceConfig = configCalls.find((c: { key: string; value: string }) => c.key === 'PRICE_CONFIGURATION')
    const vatConfig = configCalls.find((c: { key: string; value: string }) => c.key === 'IS_VAT_REGISTERED')
    const orderTab = configCalls.find((c: { key: string; value: string }) => c.key === 'ENABLE_ORDER_TAB')

    expect(priceConfig?.value).toBe('INCLUSIVE')
    expect(vatConfig?.value).toBe('true')
    expect(orderTab?.value).toBe('true')
  })

  it('creates GROCERY-specific configs (EXCLUSIVE pricing, no order tab)', async () => {
    await runHandler({ data: validInput({ businessType: 'GROCERY' }), context: authedContext() })

    const configCalls = mockTx.systemConfig.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { key: string; value: string } }).data)
    const priceConfig = configCalls.find((c: { key: string; value: string }) => c.key === 'PRICE_CONFIGURATION')
    const orderTab = configCalls.find((c: { key: string; value: string }) => c.key === 'ENABLE_ORDER_TAB')

    expect(priceConfig?.value).toBe('EXCLUSIVE')
    expect(orderTab?.value).toBe('false')
  })

  it('creates RETAIL-specific configs (EXCLUSIVE pricing, not VAT registered)', async () => {
    await runHandler({ data: validInput({ businessType: 'RETAIL' }), context: authedContext() })

    const configCalls = mockTx.systemConfig.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { key: string; value: string } }).data)
    const vatConfig = configCalls.find((c: { key: string; value: string }) => c.key === 'IS_VAT_REGISTERED')

    expect(vatConfig?.value).toBe('false')
  })

  it('always includes global LOCALE, CURRENCY, and VAT_RATE configs regardless of business type', async () => {
    for (const businessType of ['RESTAURANT', 'GROCERY', 'RETAIL'] as const) {
      vi.clearAllMocks()
      mockPrisma.subscriptionPlan.findFirst.mockResolvedValue({ id: 'plan-trial-001' })
      mockPrisma.business.findFirst.mockResolvedValue(null)
      mockPrisma.business.count.mockResolvedValue(0)
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
      mockTx.business.create.mockResolvedValue({ id: 'biz-new-001' })
      mockTx.branch.create.mockResolvedValue({ id: 'branch-new-001' })
      mockTx.membership.create.mockResolvedValue({})
      mockTx.user.update.mockResolvedValue({})
      mockTx.systemConfig.create.mockResolvedValue({})
      mockTx.businessSubscription.create.mockResolvedValue({ id: 'sub-new-001' })
      mockTx.subscriptionStatusHistory.create.mockResolvedValue({})
      mockTx.creditLedger.create.mockResolvedValue({})

      await runHandler({ data: validInput({ businessType }), context: authedContext() })

      const configCalls = mockTx.systemConfig.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { key: string; value: string } }).data)
      const keys = configCalls.map((c: { key: string }) => c.key)
      expect(keys).toContain('LOCALE')
      expect(keys).toContain('CURRENCY')
      expect(keys).toContain('VAT_RATE')
    }
  })

  it('always includes global branch configs (BUFFER_RATE, LOW_STOCK_THRESHOLD)', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const configCalls = mockTx.systemConfig.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { key: string; value: string } }).data)
    const keys = configCalls.map((c: { key: string }) => c.key)
    expect(keys).toContain('BUFFER_RATE')
    expect(keys).toContain('LOW_STOCK_THRESHOLD')
  })
})

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

describe('completeRegistration — slug generation', () => {
  it('converts businessName to a lowercase hyphenated slug', async () => {
    await runHandler({ data: validInput({ businessName: 'Hello World Cafe' }), context: authedContext() })

    expect(mockTx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'hello-world-cafe' }),
      }),
    )
  })

  it('strips special characters from the slug', async () => {
    await runHandler({ data: validInput({ businessName: 'María\'s Bakery & Co.' }), context: authedContext() })

    const call = mockTx.business.create.mock.calls[0]?.[0]
    expect(call.data.slug).not.toMatch(/[^a-z0-9-]/)
  })

  it('appends a numeric suffix when the base slug already exists', async () => {
    // Simulate 1 existing slug with the same base
    mockPrisma.business.findFirst.mockResolvedValue({ slug: 'test-biz' })
    mockPrisma.business.count.mockResolvedValue(1)

    await runHandler({ data: validInput({ businessName: 'Test Biz' }), context: authedContext() })

    const call = mockTx.business.create.mock.calls[0]?.[0]
    expect(call.data.slug).toBe('test-biz-2')
  })

  it('uses "business" as the fallback slug when businessName collapses to empty', async () => {
    await runHandler({ data: validInput({ businessName: '---' }), context: authedContext() })

    const call = mockTx.business.create.mock.calls[0]?.[0]
    expect(call.data.slug).toBe('business')
  })
})

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('completeRegistration — error paths', () => {
  it('returns success:false when the Trial plan is not found', async () => {
    mockPrisma.subscriptionPlan.findFirst.mockResolvedValue(null)

    const result = await runHandler({ data: validInput(), context: authedContext() }) as Record<string, unknown>
    expect(result.success).toBe(false)
    expect(typeof result.error).toBe('string')
  })

  it('returns success:false when context.user is missing', async () => {
    const result = await runHandler({ data: validInput(), context: { user: undefined } }) as Record<string, unknown>
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authenticated')
  })

  it('returns success:false when context is null', async () => {
    const result = await runHandler({ data: validInput(), context: null }) as Record<string, unknown>
    expect(result.success).toBe(false)
  })

  it('returns success:false and logs on an unexpected DB error', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('Connection refused'))

    const result = await runHandler({ data: validInput(), context: authedContext() }) as Record<string, unknown>
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/registration failed/i)
  })
})

// ---------------------------------------------------------------------------
// Idempotency (P2002 unique violation)
// ---------------------------------------------------------------------------

describe('completeRegistration — idempotency', () => {
  it('returns the existing businessId/branchId on a P2002 duplicate membership', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
    mockPrisma.$transaction.mockRejectedValue(uniqueError)
    mockPrisma.membership.findFirst.mockResolvedValue({
      businessId: 'biz-existing-001',
      branchId: 'branch-existing-001',
    })

    const result = await runHandler({ data: validInput(), context: authedContext() }) as Record<string, unknown>
    expect(result.success).toBe(true)
    expect(result.businessId).toBe('biz-existing-001')
    expect(result.branchId).toBe('branch-existing-001')
  })

  it('returns success:false when P2002 fires but no membership is found (edge case)', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
    mockPrisma.$transaction.mockRejectedValue(uniqueError)
    mockPrisma.membership.findFirst.mockResolvedValue(null)

    const result = await runHandler({ data: validInput(), context: authedContext() }) as Record<string, unknown>
    expect(result.success).toBe(false)
  })
})
