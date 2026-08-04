/**
 * entitlement-engine.test.ts
 *
 * Coverage:
 *  EntitlementEngine.check — all 8 evaluation steps:
 *   Step 1: SUSPENDED / LONG_TERM_INACTIVE hard-blocks operational features; management still granted
 *   Step 2: EXPIRED blocks operational features; management still granted
 *   Step 3: Override — non-expired REVOKE, non-expired GRANT, expired override falls through to plan
 *   Step 4: Plan feature check — feature not in plan → FEATURE_NOT_IN_PLAN
 *   Step 5: Usage limit — at/over limit → USAGE_LIMIT_REACHED; under limit → GRANTED with remaining
 *   Step 6: TX allowance exhausted (MONTHLY_SUBSCRIPTION, non-null txRemaining)
 *   Step 7: Credit balance zero (PREPAID_CREDITS, non-null creditBalance)
 *   Step 8: GRANTED — all checks passed
 *
 *  EntitlementEngine.buildSummary — collects granted capabilities, echoes meta fields
 *  EntitlementEngine.buildOpenContext — ACTIVE status, all features granted, no limits
 */

import { describe, expect, it } from 'vitest'
import { Capabilities, type CapabilityKey, OPERATIONAL_CAPABILITIES } from '@/lib/entitlement/capability-keys'
import { EntitlementEngine } from '@/lib/entitlement/entitlement-engine'
import {
  EntitlementCode,
  type EntitlementContext,
  type EntitlementOverrideDTO,
  SubscriptionStatus,
} from '@/lib/entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal ACTIVE context that grants all listed plan features. */
function ctx(overrides: Partial<EntitlementContext> = {}): EntitlementContext {
  return {
    status: SubscriptionStatus.ACTIVE,
    billingModel: 'MONTHLY_SUBSCRIPTION',
    planFeatures: Object.values(Capabilities) as CapabilityKey[],
    usageLimits: {},
    currentUsage: {},
    txRemaining: null,
    overrides: [],
    creditBalance: null,
    ...overrides,
  }
}

function override(featureKey: CapabilityKey, granted: boolean, expiresAt: Date | null = null): EntitlementOverrideDTO {
  return { featureKey, granted, expiresAt }
}

// Pick one operational and one management capability for test clarity
const OP_CAP = Capabilities.COMPLETE_CHECKOUT       // operational
const MGMT_CAP = Capabilities.VIEW_SALES_REPORTS    // management (not in OPERATIONAL_CAPABILITIES)

// ---------------------------------------------------------------------------
// Step 1: SUSPENDED / LONG_TERM_INACTIVE
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 1: SUSPENDED blocks operational features', () => {
  it('denies an operational capability', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx({ status: SubscriptionStatus.SUSPENDED }))
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.SUBSCRIPTION_SUSPENDED)
      expect(result.reason).toMatch(/suspended/i)
    }
  })

  it('still grants a management capability', () => {
    const result = EntitlementEngine.check(MGMT_CAP, ctx({ status: SubscriptionStatus.SUSPENDED }))
    expect(result.granted).toBe(true)
  })
})

describe('EntitlementEngine.check — Step 1: LONG_TERM_INACTIVE blocks operational features', () => {
  it('denies an operational capability', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx({ status: SubscriptionStatus.LONG_TERM_INACTIVE }))
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.LONG_TERM_INACTIVE)
      expect(result.reason).toMatch(/inactive/i)
    }
  })

  it('still grants a management capability', () => {
    const result = EntitlementEngine.check(MGMT_CAP, ctx({ status: SubscriptionStatus.LONG_TERM_INACTIVE }))
    expect(result.granted).toBe(true)
  })

  it('blocks every operational capability', () => {
    const blockedCtx = ctx({ status: SubscriptionStatus.LONG_TERM_INACTIVE })
    for (const cap of OPERATIONAL_CAPABILITIES) {
      const result = EntitlementEngine.check(cap, blockedCtx)
      expect(result.granted, `Expected ${cap} to be denied`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Step 2: EXPIRED
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 2: EXPIRED blocks operational features', () => {
  it('denies an operational capability', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx({ status: SubscriptionStatus.EXPIRED }))
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.SUBSCRIPTION_EXPIRED)
      expect(result.reason).toMatch(/expired/i)
    }
  })

  it('still grants a management capability', () => {
    const result = EntitlementEngine.check(MGMT_CAP, ctx({ status: SubscriptionStatus.EXPIRED }))
    expect(result.granted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Step 3: Override — REVOKE
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 3: non-expired REVOKE override', () => {
  it('denies a feature even when the plan includes it', () => {
    const result = EntitlementEngine.check(
      MGMT_CAP,
      ctx({ overrides: [override(MGMT_CAP, false)] }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.OVERRIDE_REVOKED)
    }
  })

  it('denies an operational feature in ACTIVE status', () => {
    const result = EntitlementEngine.check(
      OP_CAP,
      ctx({ overrides: [override(OP_CAP, false)] }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.OVERRIDE_REVOKED)
    }
  })
})

// ---------------------------------------------------------------------------
// Step 3: Override — GRANT (feature not in plan)
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 3: non-expired GRANT override', () => {
  it('grants a feature that is NOT in the plan', () => {
    const result = EntitlementEngine.check(
      MGMT_CAP,
      ctx({
        planFeatures: [], // plan has no features
        overrides: [override(MGMT_CAP, true)],
      }),
    )
    expect(result.granted).toBe(true)
  })

  it('granted override skips to usage checks — returns GRANTED code', () => {
    const result = EntitlementEngine.check(
      MGMT_CAP,
      ctx({
        planFeatures: [],
        overrides: [override(MGMT_CAP, true)],
      }),
    )
    expect(result.granted).toBe(true)
    if (result.granted) {
      expect(result.code).toBe(EntitlementCode.GRANTED)
    }
  })
})

// ---------------------------------------------------------------------------
// Step 3: Override — expired override falls through to plan check
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 3: expired override falls through', () => {
  const PAST = new Date('2020-01-01T00:00:00.000Z')

  it('expired REVOKE override — feature still granted via plan', () => {
    const result = EntitlementEngine.check(
      MGMT_CAP,
      ctx({ overrides: [override(MGMT_CAP, false, PAST)] }),
    )
    // The revoke is expired, plan includes it → should be granted
    expect(result.granted).toBe(true)
  })

  it('expired GRANT override + feature not in plan → FEATURE_NOT_IN_PLAN', () => {
    const result = EntitlementEngine.check(
      MGMT_CAP,
      ctx({
        planFeatures: [],
        overrides: [override(MGMT_CAP, true, PAST)],
      }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.FEATURE_NOT_IN_PLAN)
    }
  })
})

// ---------------------------------------------------------------------------
// Step 4: Feature not in plan
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 4: feature not in plan', () => {
  it('denies when planFeatures is empty', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx({ planFeatures: [] }))
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.FEATURE_NOT_IN_PLAN)
      expect(result.reason).toMatch(/not included in your current plan/i)
    }
  })

  it('denies when the specific capability is absent from planFeatures', () => {
    const result = EntitlementEngine.check(
      Capabilities.ACCESS_API,
      ctx({ planFeatures: [Capabilities.COMPLETE_CHECKOUT] }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.FEATURE_NOT_IN_PLAN)
    }
  })
})

// ---------------------------------------------------------------------------
// Step 5: Usage limit
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 5: usage limit', () => {
  const LIMITED_CAP = Capabilities.MANAGE_EMPLOYEES

  it('denies when currentUsage equals usageLimit', () => {
    const result = EntitlementEngine.check(
      LIMITED_CAP,
      ctx({
        usageLimits: { [LIMITED_CAP]: 5 },
        currentUsage: { [LIMITED_CAP]: 5 },
      }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.USAGE_LIMIT_REACHED)
      expect(result.reason).toMatch(/limit of 5/i)
    }
  })

  it('denies when currentUsage exceeds usageLimit', () => {
    const result = EntitlementEngine.check(
      LIMITED_CAP,
      ctx({
        usageLimits: { [LIMITED_CAP]: 5 },
        currentUsage: { [LIMITED_CAP]: 6 },
      }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.USAGE_LIMIT_REACHED)
    }
  })

  it('grants with remaining count when under the limit', () => {
    const result = EntitlementEngine.check(
      LIMITED_CAP,
      ctx({
        usageLimits: { [LIMITED_CAP]: 5 },
        currentUsage: { [LIMITED_CAP]: 3 },
      }),
    )
    expect(result.granted).toBe(true)
    if (result.granted) {
      expect(result.remaining).toBe(2)
    }
  })

  it('remaining = limit when currentUsage is 0', () => {
    const result = EntitlementEngine.check(
      LIMITED_CAP,
      ctx({
        usageLimits: { [LIMITED_CAP]: 10 },
        currentUsage: {},
      }),
    )
    expect(result.granted).toBe(true)
    if (result.granted) {
      expect(result.remaining).toBe(10)
    }
  })
})

// ---------------------------------------------------------------------------
// Step 6: TX allowance exhausted (MONTHLY_SUBSCRIPTION)
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 6: TX allowance exhausted', () => {
  it('denies COMPLETE_CHECKOUT when txRemaining = 0 on monthly plan', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ txRemaining: 0, billingModel: 'MONTHLY_SUBSCRIPTION' }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.TX_ALLOWANCE_EXHAUSTED)
      expect(result.reason).toMatch(/transactions included in your plan/i)
    }
  })

  it('grants COMPLETE_CHECKOUT when txRemaining > 0', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ txRemaining: 50, billingModel: 'MONTHLY_SUBSCRIPTION' }),
    )
    expect(result.granted).toBe(true)
  })

  it('grants COMPLETE_CHECKOUT when txRemaining is null (unlimited)', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ txRemaining: null }),
    )
    expect(result.granted).toBe(true)
  })

  it('does NOT apply TX check to non-checkout capabilities', () => {
    const result = EntitlementEngine.check(
      Capabilities.CREATE_ORDER,
      ctx({ txRemaining: 0, billingModel: 'MONTHLY_SUBSCRIPTION' }),
    )
    // CREATE_ORDER is not subject to TX allowance check
    expect(result.granted).toBe(true)
  })

  it('COMPOSABLE_FEATURES billing model skips TX check even with txRemaining=0', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ txRemaining: 0, billingModel: 'COMPOSABLE_FEATURES' }),
    )
    expect(result.granted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Step 7: Credit balance zero (PREPAID_CREDITS)
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 7: credit balance zero', () => {
  it('denies COMPLETE_CHECKOUT when creditBalance = 0', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ creditBalance: 0 }),
    )
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.code).toBe(EntitlementCode.CREDIT_BALANCE_ZERO)
      expect(result.reason).toMatch(/credit balance is zero/i)
    }
  })

  it('grants COMPLETE_CHECKOUT when creditBalance > 0', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ creditBalance: 10 }),
    )
    expect(result.granted).toBe(true)
  })

  it('grants COMPLETE_CHECKOUT when creditBalance is null (not a prepaid plan)', () => {
    const result = EntitlementEngine.check(
      Capabilities.COMPLETE_CHECKOUT,
      ctx({ creditBalance: null }),
    )
    expect(result.granted).toBe(true)
  })

  it('does NOT apply credit check to non-checkout capabilities', () => {
    const result = EntitlementEngine.check(
      Capabilities.MANAGE_PRODUCTS,
      ctx({ creditBalance: 0 }),
    )
    expect(result.granted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Step 8: GRANTED — all checks passed
// ---------------------------------------------------------------------------

describe('EntitlementEngine.check — Step 8: GRANTED', () => {
  it('returns granted=true and code=GRANTED for a fully eligible context', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx())
    expect(result.granted).toBe(true)
    if (result.granted) {
      expect(result.code).toBe(EntitlementCode.GRANTED)
    }
  })

  it('remaining is null when no usage limit is set', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx())
    expect(result.granted).toBe(true)
    if (result.granted) {
      expect(result.remaining).toBeNull()
    }
  })

  it('TRIAL status grants operational features normally', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx({ status: SubscriptionStatus.TRIAL }))
    expect(result.granted).toBe(true)
  })

  it('GRACE_PERIOD status grants operational features', () => {
    const result = EntitlementEngine.check(OP_CAP, ctx({ status: SubscriptionStatus.GRACE_PERIOD }))
    expect(result.granted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// EntitlementEngine.buildSummary
// ---------------------------------------------------------------------------

describe('EntitlementEngine.buildSummary', () => {
  const ALL_CAPS = Object.values(Capabilities) as CapabilityKey[]

  it('granted capabilities list contains all capabilities for a fully eligible context', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx())
    expect(summary.capabilities.length).toBe(ALL_CAPS.length)
  })

  it('no capabilities granted when SUSPENDED', () => {
    const summary = EntitlementEngine.buildSummary(
      ALL_CAPS,
      ctx({ status: SubscriptionStatus.SUSPENDED }),
    )
    // Management caps are still granted, operational are not
    const operationalGranted = summary.capabilities.filter(c => OPERATIONAL_CAPABILITIES.has(c))
    expect(operationalGranted.length).toBe(0)
  })

  it('echoes status from context', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx({ status: SubscriptionStatus.TRIAL }))
    expect(summary.status).toBe(SubscriptionStatus.TRIAL)
  })

  it('echoes txRemaining from context', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx({ txRemaining: 42 }))
    expect(summary.txRemaining).toBe(42)
  })

  it('echoes creditBalance from context', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx({ creditBalance: 7 }))
    expect(summary.creditBalance).toBe(7)
  })

  it('trialEndsAt is ISO string when meta provided', () => {
    const trialEndsAt = new Date('2026-07-15T00:00:00.000Z')
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx(), { trialEndsAt })
    expect(summary.trialEndsAt).toBe(trialEndsAt.toISOString())
  })

  it('trialEndsAt is null when not provided in meta', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx())
    expect(summary.trialEndsAt).toBeNull()
  })

  it('currentPeriodEnd is ISO string when meta provided', () => {
    const currentPeriodEnd = new Date('2026-07-31T23:59:59.999Z')
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx(), { currentPeriodEnd })
    expect(summary.currentPeriodEnd).toBe(currentPeriodEnd.toISOString())
  })

  it('billingModel is null when not provided in meta', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx())
    expect(summary.billingModel).toBeNull()
  })

  it('billingModel from meta echoed in summary', () => {
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, ctx(), { billingModel: 'PREPAID_CREDITS' })
    expect(summary.billingModel).toBe('PREPAID_CREDITS')
  })

  it('capability denied by plan absence is excluded from summary', () => {
    const limitedCtx = ctx({ planFeatures: [Capabilities.COMPLETE_CHECKOUT] })
    const summary = EntitlementEngine.buildSummary(ALL_CAPS, limitedCtx)
    expect(summary.capabilities).toContain(Capabilities.COMPLETE_CHECKOUT)
    expect(summary.capabilities).not.toContain(Capabilities.ACCESS_API)
  })
})

// ---------------------------------------------------------------------------
// EntitlementEngine.buildOpenContext
// ---------------------------------------------------------------------------

describe('EntitlementEngine.buildOpenContext', () => {
  const features: CapabilityKey[] = [Capabilities.COMPLETE_CHECKOUT, Capabilities.MANAGE_PRODUCTS]

  it('status is ACTIVE', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.status).toBe(SubscriptionStatus.ACTIVE)
  })

  it('planFeatures equals the provided list', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.planFeatures).toEqual(features)
  })

  it('usageLimits is empty (no limits in open context)', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.usageLimits).toEqual({})
  })

  it('currentUsage is empty', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.currentUsage).toEqual({})
  })

  it('txRemaining is null (unlimited)', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.txRemaining).toBeNull()
  })

  it('overrides is empty', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.overrides).toEqual([])
  })

  it('creditBalance is null', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    expect(openCtx.creditBalance).toBeNull()
  })

  it('check() returns GRANTED for every provided feature in open context', () => {
    const openCtx = EntitlementEngine.buildOpenContext(features)
    for (const cap of features) {
      const result = EntitlementEngine.check(cap, openCtx)
      expect(result.granted, `Expected ${cap} to be granted in open context`).toBe(true)
    }
  })
})
