/**
 * billing-journey.integration.test.ts  — TYPE 2 (orchestration, mocked DB boundary)
 *
 * Tests the full billing lifecycle by wiring real server function handlers
 * together in sequence against a controlled Prisma mock boundary.
 *
 * Why "integration" and not "unit"?
 *   - Multiple real functions are called in sequence (registration →
 *     grant-credits → cancel → re-grant), exercising their interaction.
 *   - The real SubscriptionEngine, CreditEngine, and InvoiceEngine run
 *     inside each handler — no engine logic is mocked.
 *   - Prisma is mocked at the boundary so tests run without a DB.
 *   - State is carried across calls via the mock store, the same way real
 *     Postgres would carry it between requests.
 *
 * Journeys covered:
 *   Journey 1 — Credit lifecycle: grant → accumulate → deduct → low-balance
 *   Journey 2 — Registration state → grant credits → cancel (immediate)
 *   Journey 3 — Scheduled (non-immediate) cancellation
 *   Journey 4 — cancelSubscription edge cases
 *   Journey 5 — createSubscription orchestration
 *   Journey 6 — Full lifecycle: TRIAL → subscribe → credits → cancel → re-subscribe
 *   Journey 7 — InvoiceEngine wired to subscription state
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { BillingModel } from '@/lib/billing/types'
import { CreditEventType } from '@/lib/billing/credit-engine'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import { CreditEngine } from '@/lib/billing/credit-engine'
import { InvoiceEngine } from '@/lib/billing/invoice-engine'
import { InvoiceStatus } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// createServerFn mock — returns handler fn directly
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: (opts: unknown) => unknown) => fn),
  })),
}))

vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// ---------------------------------------------------------------------------
// Prisma mock — stub only (no implementation in factory).
// Implementations are set in beforeEach via mockImplementation so they always
// close over the current `store` object. This is the only reliable pattern
// because vi.mock factories are hoisted above all variable declarations.
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma-client', () => {
  const mockPrisma = {
    businessSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    subscriptionStatusHistory: { create: vi.fn() },
    creditLedger: { findFirst: vi.fn(), create: vi.fn() },
    subscriptionPlan: { findUnique: vi.fn() },
    business: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  }
  return { prisma: mockPrisma }
})

// ---------------------------------------------------------------------------
// Stripe adapter mock — stable singleton returned by createStripeAdapter
// ---------------------------------------------------------------------------

vi.mock('@/lib/billing/adapters/stripe-adapter', () => {
  const adapter = {
    createCustomer: vi.fn(),
    createSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    createCreditPurchaseLink: vi.fn(),
  }
  return { createStripeAdapter: vi.fn(() => adapter) }
})

// ---------------------------------------------------------------------------
// Import handlers + mocked modules AFTER vi.mock declarations
// ---------------------------------------------------------------------------

const { grantCredits } = await import('@/lib/queries/grant-credits')
const { cancelSubscription } = await import('@/lib/queries/cancel-subscription')
const { createSubscription } = await import('@/lib/queries/create-subscription')
const { prisma: mockPrisma } = await import('@/lib/prisma-client')
// Get the stable stripe adapter singleton
const { createStripeAdapter } = await import('@/lib/billing/adapters/stripe-adapter')
const stripeAdapter = vi.mocked(createStripeAdapter)()

// ---------------------------------------------------------------------------
// In-memory store types
// ---------------------------------------------------------------------------

type StoredSubscription = {
  id: string; businessId: string; planId: string
  status: string; billingModel: string; externalId: string | null
  currentPeriodStart: Date | null; currentPeriodEnd: Date | null
  cancelledAt: Date | null; cancelReason: string | null; updatedAt: Date
}

type StoredLedgerEntry = {
  id: string; businessId: string; eventType: string
  amount: number; balanceAfter: number; transactionId: string | null
  note: string | null; actorId: string | null; createdAt: Date
}

type StoredHistoryEntry = {
  id: string; subscriptionId: string; fromStatus: string | null
  toStatus: string; reason: string | null; triggeredBy: string | null; createdAt: Date
}

type Store = {
  subscriptions: Map<string, StoredSubscription>
  ledger: StoredLedgerEntry[]
  history: StoredHistoryEntry[]
  plans: Map<string, { id: string; name: string; isActive: boolean }>
  businesses: Map<string, { id: string; name: string }>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIZ_ID = 'biz-journey-001'
const USER_ID = 'user-journey-001'
const SUB_ID = 'sub-journey-001'
const PLAN_STARTER_ID = 'plan-starter'

// ---------------------------------------------------------------------------
// Per-test store — declared with let so beforeEach can replace it
// ---------------------------------------------------------------------------

let store: Store

function freshStore(): Store {
  return {
    subscriptions: new Map(),
    ledger: [],
    history: [],
    plans: new Map([
      ['plan-trial', { id: 'plan-trial', name: 'Trial', isActive: true }],
      [PLAN_STARTER_ID, { id: PLAN_STARTER_ID, name: 'Starter', isActive: true }],
      ['plan-growth', { id: 'plan-growth', name: 'Growth', isActive: true }],
    ]),
    businesses: new Map([[BIZ_ID, { id: BIZ_ID, name: 'Test Business' }]]),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bizCtx(overrides: Record<string, unknown> = {}) {
  return { user: { businessId: BIZ_ID, id: USER_ID, email: 'owner@test.com', ...overrides } }
}

function seedSub(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  const sub: StoredSubscription = {
    id: SUB_ID, businessId: BIZ_ID, planId: 'plan-trial',
    status: SubscriptionStatus.TRIAL, billingModel: BillingModel.PREPAID_CREDITS,
    externalId: null, currentPeriodStart: null,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelledAt: null, cancelReason: null, updatedAt: new Date(), ...overrides,
  }
  store.subscriptions.set(sub.id, sub)
  return sub
}

function seedActiveSub(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  return seedSub({
    status: SubscriptionStatus.ACTIVE, billingModel: BillingModel.MONTHLY_SUBSCRIPTION,
    externalId: 'sub_stripe_abc123', currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), ...overrides,
  })
}

function seedLedger(balance: number): StoredLedgerEntry {
  const entry: StoredLedgerEntry = {
    id: `ledger-seed-${Date.now()}`, businessId: BIZ_ID,
    eventType: CreditEventType.PROMOTIONAL, amount: balance, balanceAfter: balance,
    transactionId: null, note: null, actorId: 'system', createdAt: new Date(),
  }
  store.ledger.push(entry)
  return entry
}

function currentBalance(): number {
  const sorted = [...store.ledger]
    .filter(e => e.businessId === BIZ_ID)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return sorted[0]?.balanceAfter ?? 0
}

function historyFor(subscriptionId: string) {
  return store.history.filter(h => h.subscriptionId === subscriptionId)
}

async function call(fn: unknown, data: unknown, ctx: unknown) {
  return (fn as (o: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>)({ data, context: ctx })
}

// ---------------------------------------------------------------------------
// Wire prisma mock implementations against the current store.
// Implementations use a wrapper that calls getStore() at invocation time so
// they always operate on whichever store object beforeEach most recently set.
// ---------------------------------------------------------------------------

function getStore(): Store { return store }

function wirePrismaMocks() {
  const p = vi.mocked(mockPrisma)

  p.businessSubscription.findUnique.mockImplementation((args: { where: { businessId?: string; id?: string } }) => {
    const s = getStore()
    const sub = args.where.businessId
      ? [...s.subscriptions.values()].find(x => x.businessId === args.where.businessId)
      : s.subscriptions.get(args.where.id!)
    return Promise.resolve((sub ?? null) as never)
  })

  p.businessSubscription.update.mockImplementation((args: { where: { id: string }; data: Partial<StoredSubscription> }) => {
    const sub = getStore().subscriptions.get(args.where.id)
    if (!sub) throw new Error(`sub not found: ${args.where.id}`)
    Object.assign(sub, args.data)
    return Promise.resolve(sub as never)
  })

  p.businessSubscription.create.mockImplementation((args: { data: StoredSubscription }) => {
    getStore().subscriptions.set(args.data.id, args.data)
    return Promise.resolve(args.data as never)
  })

  p.subscriptionStatusHistory.create.mockImplementation((args: { data: StoredHistoryEntry }) => {
    const entry = { ...args.data, id: args.data.id ?? `hist-${Date.now()}`, createdAt: new Date() }
    getStore().history.push(entry)
    return Promise.resolve(entry as never)
  })

  p.creditLedger.findFirst.mockImplementation((args: { where: { businessId: string } }) => {
    const entries = [...getStore().ledger]
      .filter(e => e.businessId === args.where.businessId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return Promise.resolve((entries[0] ?? null) as never)
  })

  p.creditLedger.create.mockImplementation((args: { data: StoredLedgerEntry }) => {
    const entry = { ...args.data, id: args.data.id ?? `ledger-${Date.now()}`, createdAt: new Date() }
    getStore().ledger.push(entry)
    return Promise.resolve(entry as never)
  })

  p.subscriptionPlan.findUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve((getStore().plans.get(args.where.id) ?? null) as never),
  )

  p.business.findUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve((getStore().businesses.get(args.where.id) ?? null) as never),
  )

  p.$transaction.mockImplementation(async (ops: unknown[] | ((tx: unknown) => Promise<unknown>)) => {
    if (Array.isArray(ops)) return Promise.all(ops)
    if (typeof ops === 'function') return ops(p)
    return ops
  })
}

// ---------------------------------------------------------------------------
// Stripe adapter — wire defaults from the stable singleton
// ---------------------------------------------------------------------------

function wireStripeMocks() {
  stripeAdapter.createCustomer.mockResolvedValue({ externalCustomerId: 'cus_test_abc' } as never)
  stripeAdapter.createSubscription.mockResolvedValue({
    externalSubscriptionId: 'sub_stripe_new',
    checkoutUrl: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  } as never)
  stripeAdapter.cancelSubscription.mockResolvedValue({ cancelledAt: new Date() } as never)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  store = freshStore()
  // Satisfy the Stripe Price ID guard in createSubscription without needing
  // real env vars. The adapter itself is fully mocked so no real Stripe call
  // is made — we just need the env lookup to return a non-null string.
  process.env['STRIPE_PLAN_STARTER_PRICE_ID'] = 'price_test_starter'
  process.env['STRIPE_PLAN_GROWTH_PRICE_ID'] = 'price_test_growth'
  process.env['STRIPE_PLAN_TRIAL_PRICE_ID'] = 'price_test_trial'
  // Wire prisma mock implementations against the fresh store.
  // Do NOT call vi.clearAllMocks() before this — it would wipe the
  // implementations that are about to be set, leaving stale no-ops.
  wirePrismaMocks()
  // Reset only Stripe call counts (not implementations) so per-test
  // assertions like toHaveBeenCalledTimes(1) start from zero.
  stripeAdapter.createCustomer.mockClear()
  stripeAdapter.createSubscription.mockClear()
  stripeAdapter.cancelSubscription.mockClear()
  wireStripeMocks()
})

afterEach(() => {
  // Clean up the env vars we set — leave no trace for other test files.
  delete process.env['STRIPE_PLAN_STARTER_PRICE_ID']
  delete process.env['STRIPE_PLAN_GROWTH_PRICE_ID']
  delete process.env['STRIPE_PLAN_TRIAL_PRICE_ID']
})

// ===========================================================================
// Journey 1 — Credit lifecycle
// ===========================================================================

describe('Journey 1 — credit lifecycle', () => {
  it('grantCredits writes a PROMOTIONAL ledger entry and returns the new balance', async () => {
    seedSub()
    const result = await call(grantCredits, { amount: 50, eventType: 'PROMOTIONAL', note: 'Welcome' }, bizCtx())
    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(50)
    expect(store.ledger).toHaveLength(1)
    expect(store.ledger[0]!.eventType).toBe(CreditEventType.PROMOTIONAL)
    expect(store.ledger[0]!.amount).toBe(50)
    expect(store.ledger[0]!.balanceAfter).toBe(50)
  })

  it('second grantCredits call accumulates on top of the first balance', async () => {
    seedSub()
    seedLedger(50)
    const result = await call(grantCredits, { amount: 100, eventType: 'PROMOTIONAL', note: null }, bizCtx())
    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(150)
    expect(currentBalance()).toBe(150)
  })

  it('CreditEngine.deduct reflects the running balance after a grant', async () => {
    seedLedger(50)
    const deductResult = CreditEngine.deduct(BIZ_ID, { balanceAfter: 50 }, 'tx-001', 10)
    expect(deductResult.ok).toBe(true)
    if (deductResult.ok) {
      expect(deductResult.value.entry.balanceAfter).toBe(49)
      expect(deductResult.value.isLowBalance).toBe(false)
    }
  })

  it('CreditEngine flags low balance when credits drop to the threshold', async () => {
    seedLedger(11)
    const result = CreditEngine.deduct(BIZ_ID, { balanceAfter: 11 }, 'tx-002', 10)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.newBalance.amount).toBe(10)
      expect(result.value.isLowBalance).toBe(true)
    }
  })

  it('grantCredits rejects amount = 0', async () => {
    seedSub()
    const result = await call(grantCredits, { amount: 0, eventType: 'PROMOTIONAL', note: null }, bizCtx())
    expect(result.success).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(store.ledger).toHaveLength(0)
  })

  it('ADJUSTMENT can reduce a positive balance', async () => {
    seedLedger(50)
    const result = await call(grantCredits, { amount: -20, eventType: 'ADJUSTMENT', note: 'Correction' }, bizCtx())
    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(30)
    expect(currentBalance()).toBe(30)
  })
})

// ===========================================================================
// Journey 2 — Grant credits then cancel immediately
// ===========================================================================

describe('Journey 2 — grant credits then cancel immediately', () => {
  it('50 credits granted, then subscription cancelled, history written', async () => {
    seedSub()
    seedLedger(50)
    expect(currentBalance()).toBe(50)

    const grantResult = await call(grantCredits, { amount: 25, eventType: 'PROMOTIONAL', note: 'Bonus' }, bizCtx())
    expect(grantResult.success).toBe(true)
    expect(currentBalance()).toBe(75)

    const cancelResult = await call(cancelSubscription, { immediate: true, reason: 'No longer needed' }, bizCtx())
    expect(cancelResult.success).toBe(true)
    expect(cancelResult.alreadyCancelled).toBe(false)
    expect(cancelResult.immediate).toBe(true)

    const sub = store.subscriptions.get(SUB_ID)!
    expect(sub.status).toBe(SubscriptionStatus.CANCELLED)
    expect(sub.cancelReason).toBe('No longer needed')

    const history = historyFor(SUB_ID)
    expect(history).toHaveLength(1)
    expect(history[0]!.fromStatus).toBe(SubscriptionStatus.TRIAL)
    expect(history[0]!.toStatus).toBe(SubscriptionStatus.CANCELLED)
    expect(history[0]!.triggeredBy).toBe(USER_ID)

    expect(currentBalance()).toBe(75) // credits unaffected by cancel
  })
})

// ===========================================================================
// Journey 3 — Scheduled cancellation
// ===========================================================================

describe('Journey 3 — scheduled cancellation', () => {
  it('status stays ACTIVE and accessUntil is set to currentPeriodEnd', async () => {
    const periodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    seedActiveSub({ currentPeriodEnd: periodEnd })

    const result = await call(cancelSubscription, { immediate: false, reason: 'Switching provider' }, bizCtx())

    expect(result.success).toBe(true)
    expect(result.immediate).toBe(false)
    expect(result.accessUntil).toBe(periodEnd.toISOString())

    const sub = store.subscriptions.get(SUB_ID)!
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE)
    expect(sub.cancelledAt).not.toBeNull()

    const history = historyFor(SUB_ID)
    expect(history[0]!.toStatus).toBe(SubscriptionStatus.ACTIVE)
    expect(history[0]!.reason).toMatch(/period end/i)
  })

  it('scheduled cancel on GRACE_PERIOD preserves GRACE_PERIOD status', async () => {
    seedSub({
      status: SubscriptionStatus.GRACE_PERIOD,
      externalId: 'sub_stripe_grace',
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    })
    const result = await call(cancelSubscription, { immediate: false }, bizCtx())
    expect(result.success).toBe(true)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.GRACE_PERIOD)
  })
})

// ===========================================================================
// Journey 4 — cancelSubscription edge cases
// ===========================================================================

describe('Journey 4 — cancelSubscription edge cases', () => {
  it('is idempotent: already-CANCELLED returns success without writing history', async () => {
    seedSub({ status: SubscriptionStatus.CANCELLED })
    const result = await call(cancelSubscription, { immediate: true }, bizCtx())
    expect(result.success).toBe(true)
    expect(result.alreadyCancelled).toBe(true)
    expect(historyFor(SUB_ID)).toHaveLength(0)
  })

  it('returns success:false when no subscription exists', async () => {
    const result = await call(cancelSubscription, { immediate: true }, bizCtx())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no subscription/i)
  })

  it('SubscriptionEngine rejects EXPIRED → SUSPENDED (invalid edge)', () => {
    const result = SubscriptionEngine.canTransition(SubscriptionStatus.EXPIRED, SubscriptionStatus.SUSPENDED)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('PRECONDITION_FAILED')
  })

  it('Stripe error surfaces as success:false without changing DB state', async () => {
    seedActiveSub()
    vi.mocked(stripeAdapter.cancelSubscription).mockRejectedValueOnce(new Error('Stripe timeout'))

    const result = await call(cancelSubscription, { immediate: true }, bizCtx())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/billing provider/i)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.ACTIVE)
  })

  it('local-only cancel succeeds when externalId is null (no Stripe call)', async () => {
    seedSub({ status: SubscriptionStatus.ACTIVE, externalId: null })
    const result = await call(cancelSubscription, { immediate: true }, bizCtx())
    expect(result.success).toBe(true)
    expect(vi.mocked(stripeAdapter.cancelSubscription)).not.toHaveBeenCalled()
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.CANCELLED)
  })
})

// ===========================================================================
// Journey 5 — createSubscription orchestration
// ===========================================================================

describe('Journey 5 — createSubscription orchestration', () => {
  it('TRIAL → ACTIVE: transitions status, writes externalId and history', async () => {
    seedSub()
    const result = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())

    expect(result.success).toBe(true)
    expect(result.alreadyActive).toBe(false)
    expect(result.checkoutUrl).toBeNull()
    expect(result.externalSubscriptionId).toBe('sub_stripe_new')

    const sub = store.subscriptions.get(SUB_ID)!
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE)
    expect(sub.externalId).toBe('sub_stripe_new')
    expect(sub.planId).toBe(PLAN_STARTER_ID)

    const history = historyFor(SUB_ID)
    expect(history).toHaveLength(1)
    expect(history[0]!.fromStatus).toBe(SubscriptionStatus.TRIAL)
    expect(history[0]!.toStatus).toBe(SubscriptionStatus.ACTIVE)
    expect(history[0]!.triggeredBy).toBe(USER_ID)
  })

  it('incomplete Stripe checkout puts subscription in GRACE_PERIOD', async () => {
    seedSub()
    vi.mocked(stripeAdapter.createSubscription).mockResolvedValueOnce({
      externalSubscriptionId: 'sub_stripe_incomplete',
      checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_abc',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as never)

    const result = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())
    expect(result.success).toBe(true)
    expect(result.checkoutUrl).toMatch(/stripe/)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.GRACE_PERIOD)
  })

  it('is idempotent when externalId already set', async () => {
    seedActiveSub()
    const result = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())
    expect(result.success).toBe(true)
    expect(result.alreadyActive).toBe(true)
    expect(vi.mocked(stripeAdapter.createSubscription)).not.toHaveBeenCalled()
  })

  it('returns success:false when target plan does not exist', async () => {
    seedSub()
    const result = await call(createSubscription, { planId: 'plan-nonexistent' }, bizCtx())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not available/i)
  })

  it('rolls back the Stripe subscription when state machine rejects the transition', async () => {
    seedSub({ status: SubscriptionStatus.SUSPENDED })
    const result = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())

    expect(result.success).toBe(false)
    expect(vi.mocked(stripeAdapter.cancelSubscription)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(stripeAdapter.cancelSubscription)).toHaveBeenCalledWith(
      expect.objectContaining({ externalSubscriptionId: 'sub_stripe_new', cancelImmediately: true }),
    )
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.SUSPENDED)
  })

  it('returns success:false when no subscription record exists', async () => {
    const result = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no subscription/i)
  })

  it('returns success:false when no business context is present', async () => {
    const result = await call(createSubscription, { planId: PLAN_STARTER_ID }, { user: null })
    expect(result.success).toBe(false)
  })
})

// ===========================================================================
// Journey 6 — Full lifecycle sequence
// ===========================================================================

describe('Journey 6 — full billing lifecycle sequence', () => {
  it('TRIAL → subscribe → grant credits → cancel → re-subscribe', async () => {
    // Post-registration state
    seedSub()
    seedLedger(50)
    expect(currentBalance()).toBe(50)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.TRIAL)

    // Subscribe
    const sub1 = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())
    expect(sub1.success).toBe(true)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.ACTIVE)

    // Grant credits
    const grant = await call(grantCredits, { amount: 100, eventType: 'PROMOTIONAL', note: 'Loyalty' }, bizCtx())
    expect(grant.success).toBe(true)
    expect(currentBalance()).toBe(150)

    // Cancel
    const cancel = await call(cancelSubscription, { immediate: true }, bizCtx())
    expect(cancel.success).toBe(true)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.CANCELLED)
    expect(currentBalance()).toBe(150) // credits intact

    // Re-subscribe
    store.subscriptions.get(SUB_ID)!.externalId = null // clear so idempotency guard doesn't fire
    vi.mocked(stripeAdapter.createSubscription).mockResolvedValueOnce({
      externalSubscriptionId: 'sub_stripe_reactivated',
      checkoutUrl: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } as never)

    const sub2 = await call(createSubscription, { planId: PLAN_STARTER_ID }, bizCtx())
    expect(sub2.success).toBe(true)
    expect(store.subscriptions.get(SUB_ID)!.status).toBe(SubscriptionStatus.ACTIVE)
    expect(store.subscriptions.get(SUB_ID)!.externalId).toBe('sub_stripe_reactivated')

    const history = historyFor(SUB_ID)
    expect(history).toHaveLength(3)
    expect(history.map(h => h.toStatus)).toEqual([
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.ACTIVE,
    ])
  })
})

// ===========================================================================
// Journey 7 — InvoiceEngine wired to subscription state
// ===========================================================================

describe('Journey 7 — InvoiceEngine builds correct invoice from subscription data', () => {
  it('builds a DRAFT invoice for ACTIVE subscription with no overage', () => {
    const invoice = InvoiceEngine.buildMonthlyInvoice(
      BIZ_ID,
      { id: 'c1', businessId: BIZ_ID, billingPeriodStart: new Date('2026-06-01Z'), billingPeriodEnd: new Date('2026-06-30Z'), txCount: 150, overageTxCount: 0, isClosed: true },
      { monthlyPrice: 29900, includedTxPerMonth: 500, overagePerTx: 100, planName: 'Starter' },
      { overageBillingEnabled: true, overageRatePerTx: 100, vatRate: 0.12 },
    )
    expect(invoice.status).toBe(InvoiceStatus.DRAFT)
    expect(invoice.subtotalAmount).toBe(29900)
    expect(invoice.taxAmount).toBe(Math.round(29900 * 0.12))
    expect(invoice.totalAmount).toBe(invoice.subtotalAmount + invoice.taxAmount)
    expect(invoice.items).toHaveLength(1)
  })

  it('adds an overage line when overageTxCount > 0', () => {
    const invoice = InvoiceEngine.buildMonthlyInvoice(
      BIZ_ID,
      { id: 'c2', businessId: BIZ_ID, billingPeriodStart: new Date(), billingPeriodEnd: new Date(), txCount: 600, overageTxCount: 100, isClosed: true },
      { monthlyPrice: 29900, includedTxPerMonth: 500, overagePerTx: 100, planName: 'Starter' },
      { overageBillingEnabled: true, overageRatePerTx: 100, vatRate: 0 },
    )
    expect(invoice.items).toHaveLength(2)
    const overage = invoice.items.find(i => i.type === 'OVERAGE_CHARGE')
    expect(overage!.lineAmount).toBe(10000) // 100 × 100 cents
    expect(invoice.subtotalAmount).toBe(39900)
  })
})
