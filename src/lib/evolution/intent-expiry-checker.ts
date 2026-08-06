/**
 * intent-expiry-checker.ts — Pure intent field staleness checker (Phase 5)
 *
 * Intent fields in BusinessCharacteristics are stated goals ("I plan to add
 * more staff") rather than observed facts. Unlike usage-based characteristics,
 * they don't expire automatically — but they can go stale if not updated.
 *
 * Phase 5 spec (5.3): passive display only.
 *   - No background job expires intent fields.
 *   - When an intent field's observedAt is more than 12 months ago, the
 *     Business Profile editor shows: "You mentioned this X months ago.
 *     Still accurate? [Yes / No]"
 *   - Clicking Yes refreshes observedAt. Clicking No sets the field to false.
 *
 * This module provides the pure function the Business Profile UI calls to
 * determine which intent fields to annotate with the staleness prompt.
 *
 * Architecture:
 *   - Pure function — no IO. Input: LivingCharacteristics + now.
 *   - Output: array of stale intent field descriptors.
 *   - The UI layer reads this and renders the staleness prompt.
 *   - The mutation that refreshes / clears the field is handled by
 *     CapabilityControl.correctCharacteristic() (Phase 4).
 */

import type { BusinessCharacteristics } from '../onboarding/types'
import type { LivingCharacteristics } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Age threshold in months after which an intent field is considered stale.
 * Phase 5 spec: 12 months.
 */
export const INTENT_STALE_THRESHOLD_MONTHS = 12

// ---------------------------------------------------------------------------
// Intent field registry
// ---------------------------------------------------------------------------

/** All intent field keys on BusinessCharacteristics */
export const INTENT_FIELDS = [
  'intentToAddMoreStaff',
  'intentToTrackInventory',
  'intentToManageSuppliers',
  'intentToOfferDelivery',
  'intentToOpenMoreLocations',
  'intentToIntegrateExternalSystems',
] as const satisfies ReadonlyArray<keyof BusinessCharacteristics>

export type IntentFieldKey = (typeof INTENT_FIELDS)[number]

/** Human-readable label for each intent field — used in the UI prompt */
const INTENT_FIELD_LABELS: Record<IntentFieldKey, string> = {
  intentToAddMoreStaff: 'planning to add more staff',
  intentToTrackInventory: 'planning to start tracking inventory',
  intentToManageSuppliers: 'planning to manage suppliers',
  intentToOfferDelivery: 'planning to offer delivery',
  intentToOpenMoreLocations: 'planning to open more locations',
  intentToIntegrateExternalSystems: 'planning to integrate external systems',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StaleIntentField = {
  /** The characteristic field key */
  field: IntentFieldKey
  /** Human-readable label for the UI prompt */
  label: string
  /** Current value — always true for stale fields (false fields need no prompt) */
  currentValue: true
  /** When the intent was last stated or confirmed */
  observedAt: Date
  /** How many months ago the intent was last stated (rounded down) */
  monthsAgo: number
  /** The UI prompt to display */
  prompt: string
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Returns all intent fields that are both:
 *   1. Currently true (no prompt needed for false fields)
 *   2. Not updated in the last INTENT_STALE_THRESHOLD_MONTHS months
 *
 * @param living - The business's current LivingCharacteristics (from DB JSON)
 * @param now    - Current date (injected for testability)
 * @returns Array of stale intent fields, sorted by staleness (oldest first)
 */
export function getStaleIntentFields(living: LivingCharacteristics, now: Date): StaleIntentField[] {
  const stale: StaleIntentField[] = []

  for (const field of INTENT_FIELDS) {
    const sourced = living[field]

    // No sourced value → field was never explicitly set → not stale (safe default is false)
    if (!sourced) continue

    // Field is false → no staleness prompt needed (false intent needs no confirmation)
    if (sourced.value !== true) continue

    const observedAt = sourced.observedAt
    const monthsAgo = monthsBetween(observedAt, now)

    if (monthsAgo < INTENT_STALE_THRESHOLD_MONTHS) continue

    stale.push({
      field,
      label: INTENT_FIELD_LABELS[field],
      currentValue: true,
      observedAt,
      monthsAgo,
      prompt: buildPrompt(INTENT_FIELD_LABELS[field], monthsAgo),
    })
  }

  // Sort oldest first — most stale fields appear first in the editor
  return stale.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of whole months between two dates.
 * Uses calendar-month distance, not 30-day approximation.
 */
export function monthsBetween(from: Date, to: Date): number {
  const yearDiff = to.getFullYear() - from.getFullYear()
  const monthDiff = to.getMonth() - from.getMonth()
  const totalMonths = yearDiff * 12 + monthDiff

  // Subtract one month if the day-of-month in 'to' hasn't reached 'from's day yet
  if (to.getDate() < from.getDate()) {
    return Math.max(0, totalMonths - 1)
  }

  return Math.max(0, totalMonths)
}

/**
 * Builds the UI prompt string for a stale intent field.
 * Format: "You mentioned you were {label} {N} months ago. Still accurate?"
 */
function buildPrompt(label: string, monthsAgo: number): string {
  return `You mentioned you were ${label} ${monthsAgo} month${monthsAgo === 1 ? '' : 's'} ago. Still accurate?`
}
