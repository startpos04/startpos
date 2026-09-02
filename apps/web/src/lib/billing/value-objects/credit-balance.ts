/**
 * credit-balance.ts
 *
 * CreditBalance value object — Phase 3 full implementation.
 *
 * Promoted from the Phase 2 stub. Backed by CreditLedger entries:
 * the Application Layer reads the latest CreditLedger.balanceAfter snapshot
 * and passes it here as a plain number — no Prisma in this file.
 *
 * Architecture contract (ADR-001):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - All inputs arrive as plain numbers from the Application Layer.
 */

// ---------------------------------------------------------------------------
// CreditBalance
// ---------------------------------------------------------------------------

export type CreditBalance = {
  /** Current balance in credit units (not cents). */
  readonly amount: number
  /** Whether the balance is sufficient to cover a given cost. */
  readonly isSufficient: (cost: number) => boolean
  /** Whether the balance has been fully depleted. */
  readonly isZero: boolean
  /** Whether the balance is below the supplied low-balance threshold. */
  readonly isLowBalance: (threshold: number) => boolean
}

/**
 * Construct a CreditBalance from a raw amount.
 *
 * @param amount - Credit balance in units (not cents). Must be >= 0.
 */
export function of(amount: number): CreditBalance {
  if (amount < 0) {
    throw new Error(`CreditBalance: amount must be >= 0, got ${amount}`)
  }

  return {
    amount,
    isSufficient: (cost: number) => amount >= cost,
    isZero: amount === 0,
    isLowBalance: (threshold: number) => amount <= threshold,
  }
}

/**
 * Build a zero-balance CreditBalance.
 * Used when no CreditLedger entries exist for the business.
 */
export function zero(): CreditBalance {
  return of(0)
}

/**
 * Format a credit balance as a human-readable label.
 * e.g. "150 credits" | "1 credit"
 */
export function formatLabel(balance: CreditBalance): string {
  return `${balance.amount.toLocaleString()} credit${balance.amount === 1 ? '' : 's'}`
}

/**
 * Compute the resulting balance after a deduction.
 * Returns null if the balance would go negative (caller should reject).
 */
export function afterDeduction(balance: CreditBalance, cost: number): CreditBalance | null {
  if (!balance.isSufficient(cost)) return null
  return of(balance.amount - cost)
}

/**
 * Compute the resulting balance after a credit addition.
 */
export function afterCredit(balance: CreditBalance, amount: number): CreditBalance {
  if (amount < 0) throw new Error(`CreditBalance: credit amount must be >= 0, got ${amount}`)
  return of(balance.amount + amount)
}
