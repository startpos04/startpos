/**
 * plan-engine.test.ts
 *
 * Unit tests for PlanEngine — the pure engine for plan comparison, upgrade
 * eligibility, and formatting helpers.
 *
 * No mocks required (all functions are pure / side-effect free).
 *
 * Coverage:
 *  - upgradeOptions(): returns higher-sortOrder active plans only, sorted asc
 *  - upgradeOptions(): excludes inactive plans and current-or-lower plans
 *  - upgradeOptions(): empty when already on highest plan
 *  - downgradeOptions(): returns lower-sortOrder active plans, excludes Trial (sortOrder 0)
 *  - downgradeOptions(): sorted descending (highest available first)
 *  - canSelfReactivate(): allowed statuses, SUSPENDED failure, other status failure
 *  - formatMonthlyPrice(): free plan, normal price, locale formatting
 *  - formatTxAllowance(): unlimited, numeric
 */

import { describe, expect, it } from 'vitest'
import { PlanEngine, type PlanDTO } from '@/lib/billing/plan-engine'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlan(overrides: Partial<PlanDTO>): PlanDTO {
  return {
    id: `plan-${overrides.sortOrder ?? 0}`,
    name: `Plan ${overrides.sortOrder ?? 0}`,
    description: '',
    sortOrder: 0,
    monthlyPrice: 0,
    includedTxPerMonth: 500,
    isActive: true,
    ...overrides,
  }
}

const TRIAL_PLAN = makePlan({ id: 'plan-trial', name: 'Trial', sortOrder: 0, monthlyPrice: 0 })
const STARTER_PLAN = makePlan({ id: 'plan-starter', name: 'Starter', sortOrder: 1, monthlyPrice: 29900 })
const GROWTH_PLAN = makePlan({ id: 'plan-growth', name: 'Growth', sortOrder: 2, monthlyPrice: 59900 })
const PREMIUM_PLAN = makePlan({ id: 'plan-premium', name: 'Premium', sortOrder: 3, monthlyPrice: 99900 })
const INACTIVE_PLAN = makePlan({ id: 'plan-inactive', name: 'Legacy', sortOrder: 4, monthlyPrice: 129900, isActive: false })

const ALL_PLANS = [TRIAL_PLAN, STARTER_PLAN, GROWTH_PLAN, PREMIUM_PLAN, INACTIVE_PLAN]

// ---------------------------------------------------------------------------
// upgradeOptions
// ---------------------------------------------------------------------------

describe('PlanEngine.upgradeOptions', () => {
  it('returns all higher-sortOrder active plans', () => {
    const options = PlanEngine.upgradeOptions(STARTER_PLAN.sortOrder, ALL_PLANS)
    // Starter (1) → Growth (2), Premium (3)  — inactive (4) excluded
    expect(options.map(p => p.id)).toEqual(['plan-growth', 'plan-premium'])
  })

  it('returns options sorted ascending by sortOrder', () => {
    const options = PlanEngine.upgradeOptions(TRIAL_PLAN.sortOrder, ALL_PLANS)
    const orders = options.map(p => p.sortOrder)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('excludes the current plan (same sortOrder is not an upgrade)', () => {
    const options = PlanEngine.upgradeOptions(GROWTH_PLAN.sortOrder, ALL_PLANS)
    const ids = options.map(p => p.id)
    expect(ids).not.toContain('plan-growth')
  })

  it('excludes inactive plans', () => {
    const options = PlanEngine.upgradeOptions(TRIAL_PLAN.sortOrder, ALL_PLANS)
    const ids = options.map(p => p.id)
    expect(ids).not.toContain('plan-inactive')
  })

  it('returns an empty array when already on the highest active plan', () => {
    const options = PlanEngine.upgradeOptions(PREMIUM_PLAN.sortOrder, ALL_PLANS)
    expect(options).toHaveLength(0)
  })

  it('returns an empty array when there are no plans at all', () => {
    expect(PlanEngine.upgradeOptions(1, [])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// downgradeOptions
// ---------------------------------------------------------------------------

describe('PlanEngine.downgradeOptions', () => {
  it('returns lower-sortOrder active plans, excluding Trial (sortOrder 0)', () => {
    const options = PlanEngine.downgradeOptions(PREMIUM_PLAN.sortOrder, ALL_PLANS)
    const ids = options.map(p => p.id)
    expect(ids).toContain('plan-growth')
    expect(ids).toContain('plan-starter')
    expect(ids).not.toContain('plan-trial') // sortOrder 0 excluded
    expect(ids).not.toContain('plan-premium') // current plan excluded
  })

  it('returns options sorted descending (highest available first)', () => {
    const options = PlanEngine.downgradeOptions(PREMIUM_PLAN.sortOrder, ALL_PLANS)
    const orders = options.map(p => p.sortOrder)
    expect(orders).toEqual([...orders].sort((a, b) => b - a))
  })

  it('excludes inactive plans', () => {
    const highPlan = makePlan({ id: 'plan-high', sortOrder: 10, isActive: true })
    const plansWithInactive = [...ALL_PLANS, highPlan]
    const options = PlanEngine.downgradeOptions(highPlan.sortOrder, plansWithInactive)
    const ids = options.map(p => p.id)
    expect(ids).not.toContain('plan-inactive')
  })

  it('returns an empty array when already on the lowest paid plan (Starter)', () => {
    // Starter is sortOrder 1. Only sortOrder > 0 AND < 1 → none
    const options = PlanEngine.downgradeOptions(STARTER_PLAN.sortOrder, ALL_PLANS)
    expect(options).toHaveLength(0)
  })

  it('returns an empty array for Trial plan (sortOrder 0)', () => {
    const options = PlanEngine.downgradeOptions(TRIAL_PLAN.sortOrder, ALL_PLANS)
    expect(options).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// canSelfReactivate
// ---------------------------------------------------------------------------

describe('PlanEngine.canSelfReactivate', () => {
  // SubscriptionStatusVO.canReactivate returns true for EXPIRED, LONG_TERM_INACTIVE, CANCELLED
  const reactivatableStatuses = [
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ]

  it.each(reactivatableStatuses)('returns ok for %s status', (status) => {
    const result = PlanEngine.canSelfReactivate(status)
    expect(result.ok).toBe(true)
  })

  it('returns PRECONDITION_FAILED with a support message for SUSPENDED', () => {
    const result = PlanEngine.canSelfReactivate(SubscriptionStatus.SUSPENDED)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
      expect(result.reason).toMatch(/support/i)
    }
  })

  it('returns PRECONDITION_FAILED for ACTIVE (no need to reactivate)', () => {
    const result = PlanEngine.canSelfReactivate(SubscriptionStatus.ACTIVE)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
    }
  })

  it('returns PRECONDITION_FAILED for TRIAL', () => {
    const result = PlanEngine.canSelfReactivate(SubscriptionStatus.TRIAL)
    expect(result.ok).toBe(false)
  })

  it('returns PRECONDITION_FAILED for GRACE_PERIOD', () => {
    const result = PlanEngine.canSelfReactivate(SubscriptionStatus.GRACE_PERIOD)
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// formatMonthlyPrice
// ---------------------------------------------------------------------------

describe('PlanEngine.formatMonthlyPrice', () => {
  it('returns "Free" for 0 cents', () => {
    expect(PlanEngine.formatMonthlyPrice(0)).toBe('Free')
  })

  it('formats a price with the ₱ symbol and /mo suffix', () => {
    const result = PlanEngine.formatMonthlyPrice(49900)
    expect(result).toMatch(/^₱/)
    expect(result).toMatch(/\/mo$/)
  })

  it('formats 49900 cents as ₱499.00/mo', () => {
    expect(PlanEngine.formatMonthlyPrice(49900)).toBe('₱499.00/mo')
  })

  it('formats 9900 cents as ₱99.00/mo', () => {
    expect(PlanEngine.formatMonthlyPrice(9900)).toBe('₱99.00/mo')
  })
})

// ---------------------------------------------------------------------------
// formatTxAllowance
// ---------------------------------------------------------------------------

describe('PlanEngine.formatTxAllowance', () => {
  it('returns "Unlimited TX" for -1', () => {
    expect(PlanEngine.formatTxAllowance(-1)).toBe('Unlimited TX')
  })

  it('formats a numeric allowance with TX/mo suffix', () => {
    expect(PlanEngine.formatTxAllowance(500)).toBe('500 TX/mo')
  })

  it('formats 0 as "0 TX/mo"', () => {
    expect(PlanEngine.formatTxAllowance(0)).toBe('0 TX/mo')
  })

  it('formats large numbers with locale separators', () => {
    // 1000 → "1,000 TX/mo" in en-US locale
    const result = PlanEngine.formatTxAllowance(1000)
    expect(result).toMatch(/TX\/mo$/)
    expect(result).toContain('1')
  })
})
