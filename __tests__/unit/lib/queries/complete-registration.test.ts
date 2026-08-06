/**
 * complete-registration.test.ts
 *
 * Tests for the completeRegistration server function handler (v2 path only).
 *
 * Phase 6 (ADR-004): The v1 businessType-only path was removed. All tests
 * now use the v2 adaptive survey path. Tests that asserted on v1
 * business-type-specific config keys have been replaced with v2 assertions:
 *   - Global configs (LOCALE, CURRENCY, VAT_RATE) always present
 *   - Global branch configs (BUFFER_RATE, LOW_STOCK_THRESHOLD) always present
 *   - BusinessCapabilityState rows written for ENABLED and RECOMMENDED capabilities
 *   - enabledAt / recommendedAt analytics timestamps are stamped at registration
 *
 * Strategy:
 *   completeRegistration is a createServerFn. We test the handler logic by:
 *     1. Mocking rootPrisma so no real DB connection is required.
 *     2. Mocking authMiddleware so context.user is controlled.
 *     3. Mocking createServerFn to expose the handler callback directly.
 *
 * Coverage:
 *  - Happy path: all 8 steps execute atomically in $transaction
 *  - Happy path: subscription is provisioned as TRIAL with PREPAID_CREDITS
 *  - Happy path: 50 complimentary credits are granted
 *  - Happy path: global configs always written (LOCALE, CURRENCY, VAT_RATE, branch)
 *  - Happy path: BusinessCapabilityState rows written with analytics timestamps
 *  - Happy path: user role is promoted to ADMIN
 *  - Idempotency: P2002 unique violation returns existing businessId/branchId
 *  - Error path: missing Trial subscription plan returns success:false
 *  - Error path: unauthenticated user returns success:false
 *  - Error path: unexpected DB error returns success:false
 *  - Slug generation: slug derived from businessName
 *  - Slug generation: collision appends numeric suffix
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { BillingModel, TransitionTrigger } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// Mock: createServerFn
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
  businessCapabilityState: { create: vi.fn() },
  businessSubscription: { create: vi.fn() },
  subscriptionStatusHistory: { create: vi.fn() },
  creditLedger: { create: vi.fn() },
}

const mockPrisma = {
  subscriptionPlan: { findFirst: vi.fn() },
  business: { findFirst: vi.fn(), count: vi.fn() },
  membership: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}

vi.mock('@/lib/prisma-client', () => ({
  prisma: mockPrisma,
}))

// ---------------------------------------------------------------------------
// Import target after mocks
// ---------------------------------------------------------------------------

await import('@/lib/queries/complete-registration')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal valid v2 survey answers.
 * q1_business_type = 'retail' → RETAIL profile → gives a deterministic
 * ConfigurationEngine output with known ENABLED capabilities.
 */
const MINIMAL_SURVEY_ANSWERS = {
  q1_business_type: ['retail'],
  q2_team_size: 'solo',
  q3_payment_timing: 'immediate',
  q4_inventory_tracking: 'no',
  q5_role_separation: 'no',
  q6_vat_registered: 'no',
}

type HandlerOpts = {
  data: {
    displayName: string
    businessName: string
    surveyAnswers: Record<string, string | string[]>
    businessType?: 'RESTAURANT' | 'GROCERY' | 'RETAIL'
  }
  context: { user?: { id: string } } | null
}

function validInput(overrides: Partial<HandlerOpts['data']> = {}): HandlerOpts['data'] {
  return {
    displayName: 'Test Owner',
    businessName: 'Test Biz',
    surveyAnswers: MINIMAL_SURVEY_ANSWERS,
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
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
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
  mockTx.businessCapabilityState.create.mockResolvedValue({})
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

  it('creates the Business with the derived slug and survey answers stored', async () => {
    await runHandler({ data: validInput({ businessName: 'My Shop' }), context: authedContext() })

    expect(mockTx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'My Shop',
          slug: 'my-shop',
          onboardingSurveyAnswers: MINIMAL_SURVEY_ANSWERS,
        }),
      }),
    )
  })

  it('stores onboardingProfile and currentProfile on the Business', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const call = mockTx.business.create.mock.calls[0]?.[0]
    expect(typeof call.data.onboardingProfile).toBe('string')
    expect(call.data.currentProfile).toBe(call.data.onboardingProfile)
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
// SystemConfig defaults (v2 path)
// ---------------------------------------------------------------------------

describe('completeRegistration — SystemConfig defaults (v2 path)', () => {
  it('always includes global LOCALE, CURRENCY, and VAT_RATE configs', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const configCalls = mockTx.systemConfig.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { key: string; value: string; scope: string } }).data)
      .filter((c: { scope: string }) => c.scope === 'BUSINESS')

    const keys = configCalls.map((c: { key: string }) => c.key)
    expect(keys).toContain('LOCALE')
    expect(keys).toContain('CURRENCY')
    expect(keys).toContain('VAT_RATE')
  })

  it('always includes global branch configs (BUFFER_RATE, LOW_STOCK_THRESHOLD)', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const branchCalls = mockTx.systemConfig.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { key: string; scope: string } }).data)
      .filter((c: { scope: string }) => c.scope === 'BRANCH')

    const keys = branchCalls.map((c: { key: string }) => c.key)
    expect(keys).toContain('BUFFER_RATE')
    expect(keys).toContain('LOW_STOCK_THRESHOLD')
  })

  it('writes at least one BUSINESS-scoped SystemConfig from the ConfigurationEngine', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const businessConfigs = mockTx.systemConfig.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { scope: string } }).data)
      .filter((c: { scope: string }) => c.scope === 'BUSINESS')

    expect(businessConfigs.length).toBeGreaterThan(3) // at least the 3 globals + capability configs
  })
})

// ---------------------------------------------------------------------------
// BusinessCapabilityState — analytics timestamps (Phase 6)
// ---------------------------------------------------------------------------

describe('completeRegistration — BusinessCapabilityState (v2 path)', () => {
  it('creates BusinessCapabilityState rows at registration', async () => {
    await runHandler({ data: validInput(), context: authedContext() })
    // The v2 config always creates at least some ENABLED capability states
    expect(mockTx.businessCapabilityState.create).toHaveBeenCalled()
  })

  it('stamps enabledAt on ENABLED capability states', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const enabledCalls = mockTx.businessCapabilityState.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { state: string; enabledAt?: Date; recommendedAt?: Date } }).data)
      .filter((d: { state: string }) => d.state === 'ENABLED')

    expect(enabledCalls.length).toBeGreaterThan(0)
    for (const call of enabledCalls) {
      expect(call.enabledAt).toBeInstanceOf(Date)
    }
  })

  it('stamps recommendedAt on RECOMMENDED capability states', async () => {
    await runHandler({ data: validInput(), context: authedContext() })

    const recommendedCalls = mockTx.businessCapabilityState.create.mock.calls
      .map((c: unknown[]) => (c[0] as { data: { state: string; enabledAt?: Date; recommendedAt?: Date } }).data)
      .filter((d: { state: string }) => d.state === 'RECOMMENDED')

    // Not all survey profiles produce RECOMMENDED states, but if any exist, they must have timestamps
    for (const call of recommendedCalls) {
      expect(call.recommendedAt).toBeInstanceOf(Date)
    }
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
    await runHandler({ data: validInput({ businessName: "María's Bakery & Co." }), context: authedContext() })

    const call = mockTx.business.create.mock.calls[0]?.[0]
    expect(call.data.slug).not.toMatch(/[^a-z0-9-]/)
  })

  it('appends a numeric suffix when the base slug already exists', async () => {
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
// Idempotency
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
