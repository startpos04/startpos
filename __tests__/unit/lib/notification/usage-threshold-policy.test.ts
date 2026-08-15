/**
 * usage-threshold-policy.test.ts
 *
 * Coverage:
 *  computePercent:
 *    - unlimited plan (-1) → null
 *    - zero limit guard → 100
 *    - partial usage → floored integer
 *    - full usage → 100
 *    - over-limit → capped at 100 (floor of >100 = >100 but computePercent floors not caps — verify)
 *
 *  detectCrossedThreshold:
 *    - unlimited → null
 *    - no percent change → null
 *    - each individual threshold crossing (49→50, 79→80, 89→90, 99→100)
 *    - large jump crossing multiple thresholds → returns highest
 *    - already above threshold with no crossing → null
 *
 *  findFirstUnnotifiedThreshold:
 *    - below all thresholds → null
 *    - at 50%, none notified → 50
 *    - at 80%, 50 already notified → 80
 *    - at 100%, 50+80+90 notified → 100
 *    - at 100%, all notified → null
 *
 *  allUnnotifiedReachedThresholds:
 *    - returns all reached + unnotified in ascending order
 *    - empty when all notified
 *    - empty when below all thresholds
 *
 *  buildPeriodKey:
 *    - TRIAL key format
 *    - MONTHLY key format with anchor
 *    - CREDITS key format with anchor
 *    - MONTHLY throws when anchor missing
 *    - CREDITS throws when anchor missing
 *
 *  serializeNotifiedThresholds / deserializeNotifiedThresholds:
 *    - round-trips correctly
 *    - deserialize handles invalid JSON gracefully
 *    - deserialize ignores values not in UsageThreshold
 *    - serialize produces sorted array
 */

import { describe, expect, it } from 'vitest'
import {
  UsageThresholdPolicy,
  computePercent,
  detectCrossedThreshold,
  findFirstUnnotifiedThreshold,
  allUnnotifiedReachedThresholds,
  buildPeriodKey,
  serializeNotifiedThresholds,
  deserializeNotifiedThresholds,
} from '@/lib/notification/usage-threshold-policy'
import { UsagePeriodKind, UsageResource, UsageThreshold } from '@/lib/notification/usage-notification-types'

const BIZ = 'biz-001'
const ANCHOR = '2026-08-01T00:00:00.000Z'

// ---------------------------------------------------------------------------
// computePercent
// ---------------------------------------------------------------------------

describe('computePercent', () => {
  it('returns null for unlimited plan (limit = -1)', () => {
    expect(computePercent(999, -1)).toBeNull()
  })

  it('returns 100 when limit is 0 (guard against division by zero)', () => {
    expect(computePercent(0, 0)).toBe(100)
  })

  it('returns floored integer for partial usage', () => {
    expect(computePercent(499, 1000)).toBe(49)
    expect(computePercent(500, 1000)).toBe(50)
    expect(computePercent(1, 3)).toBe(33) // 33.33... → 33
  })

  it('returns 100 when usage equals limit', () => {
    expect(computePercent(500, 500)).toBe(100)
    expect(computePercent(1000, 1000)).toBe(100)
  })

  it('returns 0 when usage is 0', () => {
    expect(computePercent(0, 500)).toBe(0)
  })

  it('returns > 100 when usage exceeds limit (no cap — engine uses floor not clamp)', () => {
    // The engine does not cap at 100 — that is the responsibility of UsageSummary.percentUsed.
    // detectCrossedThreshold and findFirstUnnotifiedThreshold handle >100 gracefully
    // because threshold values max at 100.
    expect(computePercent(600, 500)).toBe(120)
  })
})

// ---------------------------------------------------------------------------
// detectCrossedThreshold
// ---------------------------------------------------------------------------

describe('detectCrossedThreshold', () => {
  it('returns null for unlimited plan', () => {
    expect(detectCrossedThreshold(400, 500, -1)).toBeNull()
  })

  it('returns null when percent did not change', () => {
    // 400→401 on limit 1000 = 40%→40% (both floor to 40)
    expect(detectCrossedThreshold(400, 401, 1000)).toBeNull()
  })

  it('detects 50% crossing (49→50 equivalent)', () => {
    // 490→500 on limit 1000: prev=49%, curr=50%
    expect(detectCrossedThreshold(490, 500, 1000)).toBe(UsageThreshold.FIFTY)
  })

  it('detects 50% crossing at exact boundary', () => {
    // prev=249, curr=250, limit=500 → prev=49%, curr=50%
    expect(detectCrossedThreshold(249, 250, 500)).toBe(UsageThreshold.FIFTY)
  })

  it('does NOT fire at 50% if already past (50→51)', () => {
    // 500→510 on limit 1000: prev=50%, curr=51% — 50 already crossed
    expect(detectCrossedThreshold(500, 510, 1000)).toBeNull()
  })

  it('detects 80% crossing', () => {
    // 799→800 on limit 1000: prev=79%, curr=80%
    expect(detectCrossedThreshold(799, 800, 1000)).toBe(UsageThreshold.EIGHTY)
  })

  it('detects 90% crossing', () => {
    // 449→450 on limit 500: prev=89%, curr=90%
    expect(detectCrossedThreshold(449, 450, 500)).toBe(UsageThreshold.NINETY)
  })

  it('detects 100% crossing', () => {
    // 499→500 on limit 500: prev=99%, curr=100%
    expect(detectCrossedThreshold(499, 500, 500)).toBe(UsageThreshold.HUNDRED)
  })

  it('returns null when going from 80→81 (already past 80%)', () => {
    expect(detectCrossedThreshold(800, 810, 1000)).toBeNull()
  })

  it('returns null when going from 90→91 (already past 90%)', () => {
    expect(detectCrossedThreshold(900, 910, 1000)).toBeNull()
  })

  it('returns null when going from 100→101 (already past 100%)', () => {
    expect(detectCrossedThreshold(1000, 1010, 1000)).toBeNull()
  })

  it('large jump 0→500 on limit 500 returns 100 (highest crossed)', () => {
    // crosses 50%, 80%, 90%, 100% — returns highest (100)
    expect(detectCrossedThreshold(0, 500, 500)).toBe(UsageThreshold.HUNDRED)
  })

  it('large jump 0→400 on limit 500 returns 80 (highest crossed without 90/100)', () => {
    // 0→80% crosses 50% and 80% — returns 80
    expect(detectCrossedThreshold(0, 400, 500)).toBe(UsageThreshold.EIGHTY)
  })
})

// ---------------------------------------------------------------------------
// findFirstUnnotifiedThreshold
// ---------------------------------------------------------------------------

describe('findFirstUnnotifiedThreshold', () => {
  it('returns null when below all thresholds', () => {
    expect(findFirstUnnotifiedThreshold(49, new Set())).toBeNull()
  })

  it('returns 50 when at 50% with nothing notified', () => {
    expect(findFirstUnnotifiedThreshold(50, new Set())).toBe(UsageThreshold.FIFTY)
  })

  it('returns 80 when at 80% and 50 already notified', () => {
    expect(findFirstUnnotifiedThreshold(80, new Set([UsageThreshold.FIFTY]))).toBe(UsageThreshold.EIGHTY)
  })

  it('returns 90 when at 90% and 50+80 already notified', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    expect(findFirstUnnotifiedThreshold(90, notified)).toBe(UsageThreshold.NINETY)
  })

  it('returns 100 when at 100% and 50+80+90 already notified', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY])
    expect(findFirstUnnotifiedThreshold(100, notified)).toBe(UsageThreshold.HUNDRED)
  })

  it('returns null when at 100% and all thresholds already notified', () => {
    const notified = new Set([
      UsageThreshold.FIFTY,
      UsageThreshold.EIGHTY,
      UsageThreshold.NINETY,
      UsageThreshold.HUNDRED,
    ])
    expect(findFirstUnnotifiedThreshold(100, notified)).toBeNull()
  })

  it('returns lowest unnotified when at 100% with nothing notified (50 first)', () => {
    // Should return 50 (lowest), not 100 — caller re-evaluates for subsequent thresholds
    expect(findFirstUnnotifiedThreshold(100, new Set())).toBe(UsageThreshold.FIFTY)
  })

  it('skips already-notified thresholds and returns the next one', () => {
    // At 90%, 50 notified but 80 not → should return 80
    expect(findFirstUnnotifiedThreshold(90, new Set([UsageThreshold.FIFTY]))).toBe(UsageThreshold.EIGHTY)
  })
})

// ---------------------------------------------------------------------------
// allUnnotifiedReachedThresholds
// ---------------------------------------------------------------------------

describe('allUnnotifiedReachedThresholds', () => {
  it('returns empty array when below all thresholds', () => {
    expect(allUnnotifiedReachedThresholds(49, new Set())).toEqual([])
  })

  it('returns all four thresholds at 100% with nothing notified', () => {
    expect(allUnnotifiedReachedThresholds(100, new Set())).toEqual([50, 80, 90, 100])
  })

  it('returns only unnotified thresholds', () => {
    const notified = new Set([UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    expect(allUnnotifiedReachedThresholds(100, notified)).toEqual([90, 100])
  })

  it('returns empty when all notified', () => {
    const notified = new Set([
      UsageThreshold.FIFTY,
      UsageThreshold.EIGHTY,
      UsageThreshold.NINETY,
      UsageThreshold.HUNDRED,
    ])
    expect(allUnnotifiedReachedThresholds(100, notified)).toEqual([])
  })

  it('returns [50] when exactly at 50% with nothing notified', () => {
    expect(allUnnotifiedReachedThresholds(50, new Set())).toEqual([50])
  })
})

// ---------------------------------------------------------------------------
// buildPeriodKey
// ---------------------------------------------------------------------------

describe('buildPeriodKey', () => {
  it('builds TRIAL key without anchor', () => {
    const key = buildPeriodKey(UsagePeriodKind.TRIAL, UsageResource.TRANSACTIONS, BIZ)
    expect(key).toBe(`trial:transactions:${BIZ}`)
  })

  it('builds MONTHLY key with anchor', () => {
    const key = buildPeriodKey(UsagePeriodKind.MONTHLY, UsageResource.TRANSACTIONS, BIZ, ANCHOR)
    expect(key).toBe(`monthly:transactions:${BIZ}:${ANCHOR}`)
  })

  it('builds CREDITS key with anchor', () => {
    const key = buildPeriodKey(UsagePeriodKind.CREDITS, UsageResource.CREDITS, BIZ, ANCHOR)
    expect(key).toBe(`credits:credits:${BIZ}:${ANCHOR}`)
  })

  it('builds MONTHLY key for CREDITS resource', () => {
    const key = buildPeriodKey(UsagePeriodKind.MONTHLY, UsageResource.CREDITS, BIZ, ANCHOR)
    expect(key).toBe(`monthly:credits:${BIZ}:${ANCHOR}`)
  })

  it('throws for MONTHLY without anchor', () => {
    expect(() => buildPeriodKey(UsagePeriodKind.MONTHLY, UsageResource.TRANSACTIONS, BIZ)).toThrow()
  })

  it('throws for CREDITS without anchor', () => {
    expect(() => buildPeriodKey(UsagePeriodKind.CREDITS, UsageResource.CREDITS, BIZ)).toThrow()
  })

  it('TRIAL key does not include anchor even if provided', () => {
    const key = buildPeriodKey(UsagePeriodKind.TRIAL, UsageResource.TRANSACTIONS, BIZ, ANCHOR)
    // TRIAL keys are business-scoped only — anchor is ignored
    expect(key).toBe(`trial:transactions:${BIZ}`)
  })

  it('two different billing periods produce different MONTHLY keys', () => {
    const key1 = buildPeriodKey(UsagePeriodKind.MONTHLY, UsageResource.TRANSACTIONS, BIZ, '2026-07-01T00:00:00.000Z')
    const key2 = buildPeriodKey(UsagePeriodKind.MONTHLY, UsageResource.TRANSACTIONS, BIZ, '2026-08-01T00:00:00.000Z')
    expect(key1).not.toBe(key2)
  })
})

// ---------------------------------------------------------------------------
// serializeNotifiedThresholds / deserializeNotifiedThresholds
// ---------------------------------------------------------------------------

describe('serializeNotifiedThresholds / deserializeNotifiedThresholds', () => {
  it('serializes an empty set to "[]"', () => {
    expect(serializeNotifiedThresholds(new Set())).toBe('[]')
  })

  it('serializes thresholds as a sorted JSON array', () => {
    const set = new Set([UsageThreshold.HUNDRED, UsageThreshold.FIFTY, UsageThreshold.EIGHTY])
    const json = serializeNotifiedThresholds(set)
    expect(JSON.parse(json)).toEqual([50, 80, 100])
  })

  it('round-trips through serialize then deserialize', () => {
    const original = new Set([UsageThreshold.FIFTY, UsageThreshold.NINETY])
    const json = serializeNotifiedThresholds(original)
    const restored = deserializeNotifiedThresholds(json)
    expect(restored).toEqual(original)
  })

  it('deserialize handles invalid JSON gracefully (returns empty set)', () => {
    expect(deserializeNotifiedThresholds('not-json')).toEqual(new Set())
    expect(deserializeNotifiedThresholds('')).toEqual(new Set())
  })

  it('deserialize ignores values not in UsageThreshold', () => {
    const json = JSON.stringify([50, 75, 80, 99, 100])
    const result = deserializeNotifiedThresholds(json)
    expect(result).toEqual(new Set([50, 80, 100]))
  })

  it('deserialize handles non-array JSON gracefully', () => {
    expect(deserializeNotifiedThresholds('{"a":1}')).toEqual(new Set())
    expect(deserializeNotifiedThresholds('"string"')).toEqual(new Set())
  })
})

// ---------------------------------------------------------------------------
// Namespace export
// ---------------------------------------------------------------------------

describe('UsageThresholdPolicy namespace', () => {
  it('exposes all policy functions via dot-notation', () => {
    expect(typeof UsageThresholdPolicy.computePercent).toBe('function')
    expect(typeof UsageThresholdPolicy.detectCrossedThreshold).toBe('function')
    expect(typeof UsageThresholdPolicy.findFirstUnnotifiedThreshold).toBe('function')
    expect(typeof UsageThresholdPolicy.allUnnotifiedReachedThresholds).toBe('function')
    expect(typeof UsageThresholdPolicy.buildPeriodKey).toBe('function')
    expect(typeof UsageThresholdPolicy.serializeNotifiedThresholds).toBe('function')
    expect(typeof UsageThresholdPolicy.deserializeNotifiedThresholds).toBe('function')
  })
})
