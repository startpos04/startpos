/**
 * usage-threshold-policy.ts
 *
 * UsageThresholdPolicy — pure helper functions that answer policy questions
 * about usage thresholds. No side effects, no infrastructure dependencies.
 *
 * Responsibilities:
 *   - Compute the percentage used from currentUsage + limit
 *   - Determine which threshold (if any) was just crossed on an increment
 *   - Build stable period keys that the Application Layer uses for deduplication
 *   - Serialize / deserialize the notified-threshold set to/from a JSON string
 *     (for persistence in a SystemConfig or metadata field)
 *
 * Architecture contract (ADR-001):
 *   - Zero infrastructure imports.
 *   - All inputs arrive as plain values.
 *   - Returns plain values — callers persist results.
 *
 * Threshold-crossing semantics:
 *   A threshold T is "crossed" on a usage event when:
 *     floor(previousPercent) < T  AND  floor(currentPercent) >= T
 *   This guarantees that each threshold fires at most once per period,
 *   regardless of how many events are processed.
 */

import { USAGE_THRESHOLDS_ASC, UsagePeriodKind, type UsageResource, type UsageThreshold } from './usage-notification-types'

// ---------------------------------------------------------------------------
// computePercent
// Returns 0–100 (integer, rounded down) representing how much of the limit
// has been consumed. Returns null for unlimited plans (limit = -1).
// ---------------------------------------------------------------------------
export function computePercent(currentUsage: number, limit: number): number | null {
  if (limit === -1) return null
  if (limit === 0) return 100 // guard: avoid division by zero
  return Math.floor((currentUsage / limit) * 100)
}

// ---------------------------------------------------------------------------
// detectCrossedThreshold
// Given the PREVIOUS usage count and the CURRENT usage count (after the
// latest event), returns the HIGHEST threshold that was just crossed, or
// null if no threshold crossing occurred.
//
// "Highest" because a single large increment could jump multiple thresholds
// (e.g. 0 → 500 on a 500-limit plan crosses 50% and 100%). We return only
// the highest so the caller notifies once per event at the most impactful level.
// Additional notifications for skipped thresholds are handled separately
// via evaluateAll() which checks all thresholds not yet notified.
// ---------------------------------------------------------------------------
export function detectCrossedThreshold(previousUsage: number, currentUsage: number, limit: number): UsageThreshold | null {
  const prevPercent = computePercent(previousUsage, limit)
  const currPercent = computePercent(currentUsage, limit)

  if (prevPercent === null || currPercent === null) return null // unlimited
  if (currPercent === prevPercent) return null // no change in percent bucket

  // Find the highest threshold that was crossed (prevPercent < T <= currPercent)
  let crossed: UsageThreshold | null = null
  for (const t of USAGE_THRESHOLDS_ASC) {
    if (prevPercent < t && currPercent >= t) {
      crossed = t
    }
  }
  return crossed
}

// ---------------------------------------------------------------------------
// findFirstUnnotifiedThreshold
// Scans all thresholds in ascending order and returns the lowest one that:
//   1. Has been reached (percentUsed >= threshold)
//   2. Has NOT already been notified this period
//
// Used by UsageNotificationEngine.evaluate() to catch thresholds that were
// skipped by large usage jumps or missed on a previous evaluation.
// ---------------------------------------------------------------------------
export function findFirstUnnotifiedThreshold(percentUsed: number, alreadyNotified: ReadonlySet<UsageThreshold>): UsageThreshold | null {
  for (const t of USAGE_THRESHOLDS_ASC) {
    if (percentUsed >= t && !alreadyNotified.has(t)) {
      return t
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// allUnnotifiedReachedThresholds
// Returns every threshold that has been reached and not yet notified, in
// ascending order. Used when the caller wants to catch up on all missed
// thresholds (e.g. after a large batch import or a bulk usage credit).
// ---------------------------------------------------------------------------
export function allUnnotifiedReachedThresholds(percentUsed: number, alreadyNotified: ReadonlySet<UsageThreshold>): UsageThreshold[] {
  return USAGE_THRESHOLDS_ASC.filter(t => percentUsed >= t && !alreadyNotified.has(t))
}

// ---------------------------------------------------------------------------
// buildPeriodKey
// Assembles the stable string key used for deduplication. The Application
// Layer passes this into UsageNotificationContext.periodKey.
//
// Conventions:
//   TRIAL:   `trial:{businessId}`
//   MONTHLY: `monthly:{businessId}:{billingPeriodStart.toISOString()}`
//   CREDITS: `credits:{businessId}:{periodAnchor}` (ISO string of grant/reset date)
// ---------------------------------------------------------------------------
export function buildPeriodKey(periodKind: UsagePeriodKind, resource: UsageResource, businessId: string, periodAnchor?: string): string {
  switch (periodKind) {
    case UsagePeriodKind.TRIAL:
      return `trial:${resource.toLowerCase()}:${businessId}`

    case UsagePeriodKind.MONTHLY:
      if (!periodAnchor) {
        throw new Error('buildPeriodKey: periodAnchor (billingPeriodStart ISO string) is required for MONTHLY periods')
      }
      return `monthly:${resource.toLowerCase()}:${businessId}:${periodAnchor}`

    case UsagePeriodKind.CREDITS:
      if (!periodAnchor) {
        throw new Error('buildPeriodKey: periodAnchor (credit period ISO string) is required for CREDITS periods')
      }
      return `credits:${resource.toLowerCase()}:${businessId}:${periodAnchor}`
  }
}

// ---------------------------------------------------------------------------
// serializeNotifiedThresholds / deserializeNotifiedThresholds
// Helpers for persisting the notified-threshold set to a JSON-serialisable
// format (e.g. a SystemConfig value or a JSON metadata field).
//
// Format: JSON array of numbers, e.g. [50, 80]
// ---------------------------------------------------------------------------

export function serializeNotifiedThresholds(thresholds: ReadonlySet<UsageThreshold>): string {
  return JSON.stringify([...thresholds].sort((a, b) => a - b))
}

export function deserializeNotifiedThresholds(json: string): Set<UsageThreshold> {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return new Set()
    const valid = USAGE_THRESHOLDS_ASC as number[]
    return new Set(parsed.filter((v): v is UsageThreshold => valid.includes(v)))
  } catch {
    return new Set()
  }
}

// Namespace export for dot-notation access
export const UsageThresholdPolicy = {
  computePercent,
  detectCrossedThreshold,
  findFirstUnnotifiedThreshold,
  allUnnotifiedReachedThresholds,
  buildPeriodKey,
  serializeNotifiedThresholds,
  deserializeNotifiedThresholds,
}
