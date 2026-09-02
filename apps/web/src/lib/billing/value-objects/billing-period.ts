/**
 * billing-period.ts
 *
 * BillingPeriod value object — immutable representation of a billing period
 * with boundary calculations and period arithmetic.
 *
 * Follows the same value object pattern as Money, Quantity, TaxBreakdown.
 * Immutable; constructed via factory; contains domain behavior.
 */

// ---------------------------------------------------------------------------
// BillingPeriod
// ---------------------------------------------------------------------------

export type BillingPeriod = {
  readonly start: Date
  readonly end: Date
}

/**
 * Create a BillingPeriod from start and end dates.
 * Validates that start < end.
 */
export function of(start: Date, end: Date): BillingPeriod {
  if (start >= end) {
    throw new Error(`BillingPeriod: start (${start.toISOString()}) must be before end (${end.toISOString()})`)
  }
  return { start, end }
}

/**
 * Check if a date falls within this billing period (inclusive boundaries).
 */
export function contains(period: BillingPeriod, date: Date): boolean {
  return date >= period.start && date <= period.end
}

/**
 * Calculate the next billing period — advances start and end by the same duration.
 * For monthly billing: advances start and end by 1 calendar month.
 * For other billing models: calculates the duration in milliseconds and advances.
 */
export function next(period: BillingPeriod): BillingPeriod {
  const durationMs = period.end.getTime() - period.start.getTime()
  const nextStart = new Date(period.end.getTime() + 1) // Start the next period 1ms after the previous ends
  const nextEnd = new Date(nextStart.getTime() + durationMs)
  return { start: nextStart, end: nextEnd }
}

/**
 * Check if two billing periods overlap (inclusive boundaries).
 */
export function overlaps(a: BillingPeriod, b: BillingPeriod): boolean {
  return a.start <= b.end && b.start <= a.end
}

/**
 * Create a billing period representing the current month starting from a given anchor day.
 * e.g., currentMonth(now, 15) → period from the 15th of this month to the 14th of next month.
 *
 * @param now - The current date/time
 * @param anchorDay - The day of the month the period starts (1-31)
 */
export function currentMonth(now: Date, anchorDay: number): BillingPeriod {
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  let periodStart: Date
  let periodEnd: Date

  if (day >= anchorDay) {
    // We're past the anchor day this month — period started this month
    periodStart = new Date(year, month, anchorDay, 0, 0, 0, 0)
    periodEnd = new Date(year, month + 1, anchorDay - 1, 23, 59, 59, 999)
  } else {
    // We haven't reached the anchor day yet — period started last month
    periodStart = new Date(year, month - 1, anchorDay, 0, 0, 0, 0)
    periodEnd = new Date(year, month, anchorDay - 1, 23, 59, 59, 999)
  }

  return { start: periodStart, end: periodEnd }
}

/**
 * Calculate the duration of the period in the specified unit.
 * Supported units: 'days', 'hours', 'minutes', 'ms'
 */
export function duration(period: BillingPeriod, unit: 'days' | 'hours' | 'minutes' | 'ms'): number {
  const ms = period.end.getTime() - period.start.getTime()
  switch (unit) {
    case 'days':
      return ms / (1000 * 60 * 60 * 24)
    case 'hours':
      return ms / (1000 * 60 * 60)
    case 'minutes':
      return ms / (1000 * 60)
    case 'ms':
      return ms
  }
}

/**
 * Convert the period to ISO date strings for use in Prisma where clauses.
 * Returns { start: ISO string, end: ISO string }.
 */
export function toISOStrings(period: BillingPeriod): { start: string; end: string } {
  return {
    start: period.start.toISOString(),
    end: period.end.toISOString(),
  }
}

// Export a namespace for dot-notation access (optional, for consistency with other VOs)
export const BillingPeriod = {
  of,
  contains,
  next,
  overlaps,
  currentMonth,
  duration,
  toISOStrings,
}
