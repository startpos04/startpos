/**
 * usage-summary.ts
 *
 * UsageSummary value object — derived view over a UsageCounter for display
 * and engine evaluation. Immutable; constructed via factory.
 *
 * Contains no infrastructure imports. Receives plain data as input;
 * returns derived, human-readable properties.
 *
 * Architecture contract (ADR-001):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - All inputs arrive as plain numbers/dates from the Application Layer.
 */

// ---------------------------------------------------------------------------
// UsageSummary
// ---------------------------------------------------------------------------

export type UsageSummary = {
  /** Transactions consumed in the current billing period */
  readonly txCount: number
  /** Overage transactions (beyond includedTxPerMonth allowance) */
  readonly overageTxCount: number
  /** Plan allowance for this period. null = unlimited (-1 from plan). */
  readonly includedTxPerMonth: number | null
  /** Remaining transactions. null = unlimited. 0 = exhausted. */
  readonly txRemaining: number | null
  /** Whether the allowance has been fully consumed */
  readonly isExhausted: boolean
  /** Whether overage billing is applicable (plan-limited + overage enabled) */
  readonly hasOverage: boolean
  /** 0–100 percentage of allowance consumed (null when unlimited) */
  readonly percentUsed: number | null
  /** Start of the billing period being tracked */
  readonly billingPeriodStart: Date
  /** End of the billing period being tracked */
  readonly billingPeriodEnd: Date
}

/**
 * Construct a UsageSummary from raw counter and plan data.
 *
 * @param txCount           - Current transaction count from UsageCounter
 * @param overageTxCount    - Overage transaction count from UsageCounter
 * @param includedTxPerMonth - Plan allowance (-1 = unlimited, positive = capped)
 * @param billingPeriodStart - Period start date
 * @param billingPeriodEnd   - Period end date
 */
export function of(txCount: number, overageTxCount: number, includedTxPerMonth: number, billingPeriodStart: Date, billingPeriodEnd: Date): UsageSummary {
  const unlimited = includedTxPerMonth === -1
  const txRemaining = unlimited ? null : Math.max(0, includedTxPerMonth - txCount)
  const isExhausted = !unlimited && txCount >= includedTxPerMonth
  const hasOverage = isExhausted && overageTxCount > 0
  const percentUsed = unlimited ? null : Math.min(100, Math.round((txCount / includedTxPerMonth) * 100))

  return {
    txCount,
    overageTxCount,
    includedTxPerMonth: unlimited ? null : includedTxPerMonth,
    txRemaining,
    isExhausted,
    hasOverage,
    percentUsed,
    billingPeriodStart,
    billingPeriodEnd,
  }
}

/**
 * Build a zero-state UsageSummary for the start of a new billing period,
 * or when no UsageCounter record exists yet for the current period.
 */
export function empty(includedTxPerMonth: number, billingPeriodStart: Date, billingPeriodEnd: Date): UsageSummary {
  return of(0, 0, includedTxPerMonth, billingPeriodStart, billingPeriodEnd)
}

/**
 * Format a human-readable usage label for display.
 * e.g. "1,234 / 5,000 transactions used"  or  "1,234 transactions (unlimited)"
 */
export function formatLabel(summary: UsageSummary): string {
  if (summary.includedTxPerMonth === null) {
    return `${summary.txCount.toLocaleString()} transactions (unlimited)`
  }
  return `${summary.txCount.toLocaleString()} / ${summary.includedTxPerMonth.toLocaleString()} transactions used`
}

/**
 * Format remaining transactions as a display string.
 * e.g. "3,766 remaining"  or  "Unlimited"
 */
export function formatRemaining(summary: UsageSummary): string {
  if (summary.txRemaining === null) return 'Unlimited'
  if (summary.txRemaining === 0) return 'None remaining'
  return `${summary.txRemaining.toLocaleString()} remaining`
}
