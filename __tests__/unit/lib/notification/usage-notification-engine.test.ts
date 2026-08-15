/**
 * usage-notification-engine.test.ts
 *
 * Coverage:
 *  evaluate() — general:
 *    - unlimited plan (limit = -1) → shouldNotify: false
 *    - below all thresholds → shouldNotify: false
 *    - all thresholds already notified → shouldNotify: false
 *
 *  Threshold detection — each threshold fires at the right boundary:
 *    - 249/500 → shouldNotify: false  (49%)
 *    - 250/500 → shouldNotify: true, threshold=50  (50%)
 *    - 251/500 → no duplicate (50 already notified)
 *    - 399/500 → no 80 notification yet
 *    - 400/500 → shouldNotify: true, threshold=80  (80%)
 *    - 401/500 → no duplicate
 *    - 449/500 → no 90 yet
 *    - 450/500 → shouldNotify: true, threshold=90  (90%)
 *    - 451/500 → no duplicate
 *    - 499/500 → no 100 yet
 *    - 500/500 → shouldNotify: true, threshold=100 (100%)
 *    - 501/500 → no duplicate
 *
 *  Deduplication:
 *    - Same threshold not re-fired when already in alreadyNotifiedThresholds
 *    - updatedNotifiedThresholds adds the new threshold
 *    - updatedNotifiedThresholds is a superset of alreadyNotifiedThresholds
 *
 *  Large jump — lowest unnotified first:
 *    - 0→500 (limit 500): first evaluate returns threshold=50 (not 100)
 *    - After persisting 50, next evaluate returns 80
 *    - After persisting 50+80, next evaluate returns 90
 *    - After persisting 50+80+90, next evaluate returns 100
 *
 *  Trial transactions (periodKind=TRIAL):
 *    - 250/500 → title contains "Halfway"
 *    - 400/500 → title contains "close" (case-insensitive)
 *    - 450/500 → title contains "almost"
 *    - 500/500 → title contains "completed"
 *    - Message at 250 mentions "250" and "500"
 *    - Message at 500 mentions "500" and "Choose a plan"
 *    - Actions at 50%: VIEW_PLANS + TALK_TO_US
 *    - Actions at 90%: CHOOSE_PLAN + TALK_TO_US
 *    - Actions at 100%: CHOOSE_PLAN + TALK_TO_US
 *
 *  Paid subscription transactions (periodKind=MONTHLY):
 *    - 400/500 → title contains "Approaching"
 *    - 450/500 → title contains "Close"
 *    - 500/500 → title contains "reached"
 *    - Actions at 100%: UPGRADE_PLAN + BUY_TX_TOPUP
 *    - Actions at 80%: UPGRADE_PLAN only
 *
 *  Credits (resource=CREDITS):
 *    - 400/500 → shouldNotify: true, threshold=80
 *    - Title contains "Running low" at 80%
 *    - Title contains "Credits exhausted" at 100%
 *    - Actions: BUY_CREDITS
 *
 *  Payload shape:
 *    - payload.resource matches context.resource
 *    - payload.currentUsage matches context.currentUsage
 *    - payload.limit matches context.limit
 *    - payload.percentUsed is correct
 *    - payload.threshold matches result.threshold
 *    - payload.periodKey matches context.periodKey
 *
 *  Period reset:
 *    - New periodKey with empty alreadyNotifiedThresholds re-fires all thresholds
 *    - Old periodKey with full alreadyNotifiedThresholds fires nothing
 *
 *  Severity mapping:
 *    - threshold=50 → severity=info
 *    - threshold=80 → severity=warning
 *    - threshold=90 → severity=critical
 *    - threshold=100 → severity=limit
 */

import { describe, expect, it } from 'vitest'
import { UsageNotificationEngine } from '@/lib/notification/usage-notification-engine'
import {
  ThresholdSeverity,
  UsageNotificationAction,
  UsagePeriodKind,
  UsageResource,
  UsageThreshold,
  type UsageNotificationContext,
} from '@/lib/notification/usage-notification-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BIZ = 'biz-001'
const PERIOD_KEY_TRIAL = `trial:transactions:${BIZ}`
const PERIOD_KEY_MONTHLY = `monthly:transactions:${BIZ}:2026-08-01T00:00:00.000Z`
const PERIOD_KEY_CREDITS = `credits:credits:${BIZ}:2026-08-01T00:00:00.000Z`

function makeTxContext(
  currentUsage: number,
  limit: number,
  periodKind: UsagePeriodKind,
  alreadyNotifiedThresholds: ReadonlySet<UsageThreshold> = new Set(),
  periodKey?: string,
): UsageNotificationContext {
  const key = periodKey ?? (periodKind === UsagePeriodKind.TRIAL ? PERIOD_KEY_TRIAL : PERIOD_KEY_MONTHLY)
  return {
    resource: UsageResource.TRANSACTIONS,
    currentUsage,
    limit,
    periodKind,
    periodKey: key,
    alreadyNotifiedThresholds,
  }
}

function makeCreditContext(
  currentUsage: number,
  limit: number,
  alreadyNotifiedThresholds: ReadonlySet<UsageThreshold> = new Set(),
): UsageNotificationContext {
  return {
    resource: UsageResource.CREDITS,
    currentUsage,
    limit,
    periodKind: UsagePeriodKind.CREDITS,
    periodKey: PERIOD_KEY_CREDITS,
    alreadyNotifiedThresholds,
  }
}

// ---------------------------------------------------------------------------
// General behaviour
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — general', () => {
  it('returns shouldNotify: false for unlimited plan (limit = -1)', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(9999, -1, UsagePeriodKind.MONTHLY))
    expect(result.shouldNotify).toBe(false)
  })

  it('returns shouldNotify: false when below all thresholds (49%)', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(249, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(false)
  })

  it('returns shouldNotify: false when all thresholds already notified', () => {
    const all = new Set([
      UsageThreshold.FIFTY,
      UsageThreshold.EIGHTY,
      UsageThreshold.NINETY,
      UsageThreshold.HUNDRED,
    ])
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, all))
    expect(result.shouldNotify).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Threshold boundary — each threshold fires exactly at boundary
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — threshold boundaries (TRIAL, 500 TX limit)', () => {
  it('249/500 (49%) → shouldNotify: false', () => {
    expect(UsageNotificationEngine.evaluate(makeTxContext(249, 500, UsagePeriodKind.TRIAL)).shouldNotify).toBe(false)
  })

  it('250/500 (50%) → shouldNotify: true, threshold=50', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.threshold).toBe(UsageThreshold.FIFTY)
  })

  it('251/500 (50%) → no duplicate when 50 already notified', () => {
    const result = UsageNotificationEngine.evaluate(
      makeTxContext(251, 500, UsagePeriodKind.TRIAL, new Set([UsageThreshold.FIFTY])),
    )
    expect(result.shouldNotify).toBe(false)
  })

  it('399/500 (79%) → shouldNotify: false', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    expect(UsageNotificationEngine.evaluate(makeTxContext(399, 500, UsagePeriodKind.TRIAL, notified)).shouldNotify).toBe(false)
  })

  it('400/500 (80%) → shouldNotify: true, threshold=80', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(400, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.threshold).toBe(UsageThreshold.EIGHTY)
  })

  it('401/500 (80%) → no duplicate when 80 already notified', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    expect(
      UsageNotificationEngine.evaluate(makeTxContext(401, 500, UsagePeriodKind.TRIAL, notified)).shouldNotify,
    ).toBe(false)
  })

  it('449/500 (89%) → shouldNotify: false', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    expect(UsageNotificationEngine.evaluate(makeTxContext(449, 500, UsagePeriodKind.TRIAL, notified)).shouldNotify).toBe(false)
  })

  it('450/500 (90%) → shouldNotify: true, threshold=90', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(450, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.threshold).toBe(UsageThreshold.NINETY)
  })

  it('451/500 → no duplicate when 90 already notified', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    expect(
      UsageNotificationEngine.evaluate(makeTxContext(451, 500, UsagePeriodKind.TRIAL, notified)).shouldNotify,
    ).toBe(false)
  })

  it('499/500 (99%) → shouldNotify: false', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    expect(UsageNotificationEngine.evaluate(makeTxContext(499, 500, UsagePeriodKind.TRIAL, notified)).shouldNotify).toBe(false)
  })

  it('500/500 (100%) → shouldNotify: true, threshold=100', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.threshold).toBe(UsageThreshold.HUNDRED)
  })

  it('501/500 → no duplicate when 100 already notified', () => {
    const notified = new Set([
      UsageThreshold.FIFTY,
      UsageThreshold.EIGHTY,
      UsageThreshold.NINETY,
      UsageThreshold.HUNDRED,
    ])
    expect(
      UsageNotificationEngine.evaluate(makeTxContext(501, 500, UsagePeriodKind.TRIAL, notified)).shouldNotify,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Deduplication — updatedNotifiedThresholds
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — deduplication', () => {
  it('updatedNotifiedThresholds adds the crossed threshold', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL, new Set()))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.updatedNotifiedThresholds.has(UsageThreshold.FIFTY)).toBe(true)
    }
  })

  it('updatedNotifiedThresholds is a superset of alreadyNotifiedThresholds', () => {
    const existing = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(400, 500, UsagePeriodKind.TRIAL, existing))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.updatedNotifiedThresholds.has(UsageThreshold.FIFTY)).toBe(true)
      expect(result.updatedNotifiedThresholds.has(UsageThreshold.EIGHTY)).toBe(true)
    }
  })

  it('does not mutate the original alreadyNotifiedThresholds set', () => {
    const original = new Set<UsageThreshold>([UsageThreshold.FIFTY])
    UsageNotificationEngine.evaluate(makeTxContext(400, 500, UsagePeriodKind.TRIAL, original))
    // original must remain unchanged
    expect(original.size).toBe(1)
    expect(original.has(UsageThreshold.EIGHTY)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Large jump — lowest unnotified threshold first
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — large usage jump processes thresholds one at a time', () => {
  // Simulates a large import that goes from 0 → 500 in one step.
  // The caller should re-evaluate and persist after each notification.

  it('0→500 on limit 500: first evaluate returns threshold=50', () => {
    const r1 = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, new Set()))
    expect(r1.shouldNotify).toBe(true)
    if (r1.shouldNotify) expect(r1.threshold).toBe(UsageThreshold.FIFTY)
  })

  it('after persisting 50, next evaluate returns 80', () => {
    const r2 = UsageNotificationEngine.evaluate(
      makeTxContext(500, 500, UsagePeriodKind.TRIAL, new Set([UsageThreshold.FIFTY])),
    )
    expect(r2.shouldNotify).toBe(true)
    if (r2.shouldNotify) expect(r2.threshold).toBe(UsageThreshold.EIGHTY)
  })

  it('after persisting 50+80, next evaluate returns 90', () => {
    const r3 = UsageNotificationEngine.evaluate(
      makeTxContext(500, 500, UsagePeriodKind.TRIAL, new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])),
    )
    expect(r3.shouldNotify).toBe(true)
    if (r3.shouldNotify) expect(r3.threshold).toBe(UsageThreshold.NINETY)
  })

  it('after persisting 50+80+90, next evaluate returns 100', () => {
    const r4 = UsageNotificationEngine.evaluate(
      makeTxContext(500, 500, UsagePeriodKind.TRIAL, new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])),
    )
    expect(r4.shouldNotify).toBe(true)
    if (r4.shouldNotify) expect(r4.threshold).toBe(UsageThreshold.HUNDRED)
  })
})

// ---------------------------------------------------------------------------
// Trial messaging
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — trial messaging', () => {
  it('250/500 → title contains "Halfway"', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/halfway/i)
  })

  it('400/500 → title contains "close" or "Getting"', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(400, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title.toLowerCase()).toMatch(/close|getting/i)
  })

  it('450/500 → title contains "almost"', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(450, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/almost/i)
  })

  it('500/500 → title contains "completed"', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/completed/i)
  })

  it('250/500 → message mentions "250" and "500"', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.message).toContain('250')
      expect(result.message).toContain('500')
    }
  })

  it('500/500 → message mentions "500" and "Choose a plan"', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.message).toContain('500')
      expect(result.message).toMatch(/choose a plan/i)
    }
  })

  it('actions at 50% → VIEW_PLANS + TALK_TO_US', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.VIEW_PLANS)
      expect(result.payload.actions).toContain(UsageNotificationAction.TALK_TO_US)
    }
  })

  it('actions at 80% → VIEW_PLANS + TALK_TO_US', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(400, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.VIEW_PLANS)
      expect(result.payload.actions).toContain(UsageNotificationAction.TALK_TO_US)
    }
  })

  it('actions at 90% → CHOOSE_PLAN + TALK_TO_US', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(450, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.CHOOSE_PLAN)
      expect(result.payload.actions).toContain(UsageNotificationAction.TALK_TO_US)
    }
  })

  it('actions at 100% → CHOOSE_PLAN + TALK_TO_US', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.CHOOSE_PLAN)
      expect(result.payload.actions).toContain(UsageNotificationAction.TALK_TO_US)
    }
  })
})

// ---------------------------------------------------------------------------
// Paid subscription messaging (MONTHLY)
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — paid subscription (MONTHLY, 1000 TX limit)', () => {
  it('800/1000 (80%) → title contains "Approaching"', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(800, 1000, UsagePeriodKind.MONTHLY, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/approaching/i)
  })

  it('900/1000 (90%) → title contains "Close"', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(900, 1000, UsagePeriodKind.MONTHLY, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/close/i)
  })

  it('1000/1000 (100%) → title contains "reached"', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(1000, 1000, UsagePeriodKind.MONTHLY, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/reached/i)
  })

  it('actions at 100% → UPGRADE_PLAN + BUY_TX_TOPUP', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(1000, 1000, UsagePeriodKind.MONTHLY, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.UPGRADE_PLAN)
      expect(result.payload.actions).toContain(UsageNotificationAction.BUY_TX_TOPUP)
    }
  })

  it('actions at 80% → UPGRADE_PLAN only (no topup prompt yet)', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(800, 1000, UsagePeriodKind.MONTHLY, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.UPGRADE_PLAN)
      expect(result.payload.actions).not.toContain(UsageNotificationAction.BUY_TX_TOPUP)
    }
  })

  it('paid subscription message does NOT mention "trial"', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 1000, UsagePeriodKind.MONTHLY))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.message.toLowerCase()).not.toContain('trial')
  })
})

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — credits', () => {
  it('400/500 (80%) credits → shouldNotify: true, threshold=80', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeCreditContext(400, 500, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.threshold).toBe(UsageThreshold.EIGHTY)
  })

  it('250/500 (50%) credits → title contains "50%"', () => {
    const result = UsageNotificationEngine.evaluate(makeCreditContext(250, 500))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toContain('50%')
  })

  it('400/500 (80%) credits → title contains "Running low"', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeCreditContext(400, 500, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/running low/i)
  })

  it('500/500 (100%) credits → title contains "exhausted"', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeCreditContext(500, 500, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.title).toMatch(/exhausted/i)
  })

  it('actions at 80% credits → BUY_CREDITS', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeCreditContext(400, 500, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) {
      expect(result.payload.actions).toContain(UsageNotificationAction.BUY_CREDITS)
    }
  })

  it('credits use CREDITS resource, not TRANSACTIONS', () => {
    const result = UsageNotificationEngine.evaluate(makeCreditContext(250, 500))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.resource).toBe(UsageResource.CREDITS)
  })
})

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — payload shape', () => {
  it('payload.resource matches context.resource', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.resource).toBe(UsageResource.TRANSACTIONS)
  })

  it('payload.currentUsage matches context.currentUsage', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.currentUsage).toBe(250)
  })

  it('payload.limit matches context.limit', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.limit).toBe(500)
  })

  it('payload.percentUsed is correct integer', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.percentUsed).toBe(50)
  })

  it('payload.threshold matches result.threshold', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.threshold).toBe(result.threshold)
  })

  it('payload.periodKey matches context.periodKey', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.periodKey).toBe(PERIOD_KEY_TRIAL)
  })

  it('payload.periodKind matches context.periodKind', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.payload.periodKind).toBe(UsagePeriodKind.TRIAL)
  })
})

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — severity mapping', () => {
  it('threshold=50 → severity=info', () => {
    const result = UsageNotificationEngine.evaluate(makeTxContext(250, 500, UsagePeriodKind.TRIAL))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.severity).toBe(ThresholdSeverity.info)
  })

  it('threshold=80 → severity=warning', () => {
    const notified = new Set([UsageThreshold.FIFTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(400, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.severity).toBe(ThresholdSeverity.warning)
  })

  it('threshold=90 → severity=critical', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(450, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.severity).toBe(ThresholdSeverity.critical)
  })

  it('threshold=100 → severity=limit', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    const result = UsageNotificationEngine.evaluate(makeTxContext(500, 500, UsagePeriodKind.TRIAL, notified))
    expect(result.shouldNotify).toBe(true)
    if (result.shouldNotify) expect(result.severity).toBe(ThresholdSeverity.limit)
  })
})

// ---------------------------------------------------------------------------
// Period reset — new periodKey re-fires thresholds
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — period reset', () => {
  it('new periodKey with empty alreadyNotifiedThresholds fires threshold again', () => {
    // August period — all notified
    const augustKey = `monthly:transactions:${BIZ}:2026-08-01T00:00:00.000Z`
    const allNotified = new Set([
      UsageThreshold.FIFTY,
      UsageThreshold.EIGHTY,
      UsageThreshold.NINETY,
      UsageThreshold.HUNDRED,
    ])
    const augustResult = UsageNotificationEngine.evaluate({
      resource: UsageResource.TRANSACTIONS,
      currentUsage: 1000,
      limit: 1000,
      periodKind: UsagePeriodKind.MONTHLY,
      periodKey: augustKey,
      alreadyNotifiedThresholds: allNotified,
    })
    expect(augustResult.shouldNotify).toBe(false)

    // September period — fresh state (empty alreadyNotifiedThresholds)
    const septemberKey = `monthly:transactions:${BIZ}:2026-09-01T00:00:00.000Z`
    const septemberResult = UsageNotificationEngine.evaluate({
      resource: UsageResource.TRANSACTIONS,
      currentUsage: 500,
      limit: 1000,
      periodKind: UsagePeriodKind.MONTHLY,
      periodKey: septemberKey,
      alreadyNotifiedThresholds: new Set(),
    })
    expect(septemberResult.shouldNotify).toBe(true)
    if (septemberResult.shouldNotify) expect(septemberResult.threshold).toBe(UsageThreshold.FIFTY)
  })

  it('same periodKey with all thresholds notified produces no notifications', () => {
    const allNotified = new Set([
      UsageThreshold.FIFTY,
      UsageThreshold.EIGHTY,
      UsageThreshold.NINETY,
      UsageThreshold.HUNDRED,
    ])
    const result = UsageNotificationEngine.evaluate(
      makeTxContext(1000, 1000, UsagePeriodKind.MONTHLY, allNotified),
    )
    expect(result.shouldNotify).toBe(false)
  })

  it('trial period key does not reset — same key throughout trial lifecycle', () => {
    // Both calls use PERIOD_KEY_TRIAL — after 50 is notified, it should not fire again
    const afterFirst = UsageNotificationEngine.evaluate(
      makeTxContext(260, 500, UsagePeriodKind.TRIAL, new Set([UsageThreshold.FIFTY])),
    )
    // Still 50% territory but 50 already notified — next unnotified is 80, not reached yet
    expect(afterFirst.shouldNotify).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Idempotency — processing the same usage event twice
// ---------------------------------------------------------------------------

describe('UsageNotificationEngine.evaluate — idempotency', () => {
  it('evaluating the same context twice produces identical results', () => {
    const ctx = makeTxContext(250, 500, UsagePeriodKind.TRIAL)
    const r1 = UsageNotificationEngine.evaluate(ctx)
    const r2 = UsageNotificationEngine.evaluate(ctx)
    expect(r1.shouldNotify).toBe(r2.shouldNotify)
    if (r1.shouldNotify && r2.shouldNotify) {
      expect(r1.threshold).toBe(r2.threshold)
      expect(r1.title).toBe(r2.title)
    }
  })

  it('persisting updatedNotifiedThresholds and re-evaluating prevents duplicate notification', () => {
    const ctx = makeTxContext(250, 500, UsagePeriodKind.TRIAL)
    const first = UsageNotificationEngine.evaluate(ctx)
    expect(first.shouldNotify).toBe(true)
    if (!first.shouldNotify) return

    // Simulate persisting — pass updatedNotifiedThresholds on next call
    const second = UsageNotificationEngine.evaluate({
      ...ctx,
      alreadyNotifiedThresholds: first.updatedNotifiedThresholds,
    })
    expect(second.shouldNotify).toBe(false)
  })
})
