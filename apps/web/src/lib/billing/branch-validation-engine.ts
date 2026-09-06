/**
 * branch-validation-engine.ts
 *
 * BranchValidationEngine — validates transactions against branch limits and credits.
 *
 * Responsibilities:
 *   - Check if branch has exceeded its txQuotaLimit
 *   - Validate branch has sufficient credits for transaction
 *   - Deduct credits from branch balance (create CreditLedger entry)
 *   - Handle the "branch limit reached, use credits" flow
 *
 * Architecture:
 *   - Pure functions that work with data snapshots
 *   - Returns OperationResult for consistent error handling
 *   - Integrates with existing UsageEngine validation
 *   - Works with offline-first collections
 */

import { type OperationResult, opFail, opOk } from '@platform/lib/result'
import type { UsageCounterSnapshot } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditLedgerEntryDTO = {
  businessId: string
  branchId: string | null
  eventType: 'PURCHASE' | 'CONSUMED' | 'GRANTED'
  amount: number
  balanceAfter: number
  transactionId: string | null
  note: string | null
  actorId: string | null
  stripeSessionId: string | null
}

export type BranchQuotaSnapshot = {
  branchId: string
  txQuotaLimit: number | null // null = no limit
  currentUsage: number // transactions used this period
}

export type BranchCreditSnapshot = {
  branchId: string
  balance: number
  lastUpdated: Date | null
}

export type BranchValidationInput = {
  businessId: string
  branchId: string
  branchQuota: BranchQuotaSnapshot
  branchCredits: BranchCreditSnapshot
  usageCounter: UsageCounterSnapshot | null
}

export type ValidationResult = {
  allowed: boolean
  requiresCredits: boolean
  reason?: string
  newCreditBalance?: number
}

// ---------------------------------------------------------------------------
// BranchValidationEngine
// ---------------------------------------------------------------------------

export const BranchValidationEngine = {
  /**
   * validateTransaction - Check if branch can process a transaction
   *
   * Logic:
   * 1. If branch has no quota limit → allowed (unlimited)
   * 2. If branch usage < limit → allowed (within quota)
   * 3. If branch usage >= limit BUT has credits → allowed, deduct 1 credit
   * 4. If branch usage >= limit AND no credits → blocked
   */
  validateTransaction(input: BranchValidationInput): OperationResult<ValidationResult> {
    const { branchQuota, branchCredits } = input

    // No quota limit = unlimited for this branch
    if (branchQuota.txQuotaLimit === null) {
      return opOk({
        allowed: true,
        requiresCredits: false,
        reason: 'Branch has no transaction limit',
      })
    }

    // Check if branch is within its quota
    if (branchQuota.currentUsage < branchQuota.txQuotaLimit) {
      return opOk({
        allowed: true,
        requiresCredits: false,
        reason: `Branch usage ${branchQuota.currentUsage}/${branchQuota.txQuotaLimit}`,
      })
    }

    // Branch has reached its limit - check credits
    if (branchCredits.balance <= 0) {
      return opFail(
        'PRECONDITION_FAILED',
        `Branch has reached its transaction limit (${branchQuota.txQuotaLimit}/month) and has no credits remaining. Purchase credits to continue.`,
      )
    }

    // Branch has credits - can proceed with credit deduction
    return opOk({
      allowed: true,
      requiresCredits: true,
      reason: `Branch limit reached, using credits (${branchCredits.balance} available)`,
      newCreditBalance: branchCredits.balance - 1,
    })
  },

  /**
   * buildCreditDeductionEntry - Create CreditLedger entry for transaction
   */
  buildCreditDeductionEntry(businessId: string, branchId: string, transactionId: string, currentBalance: number, actorId?: string): CreditLedgerEntryDTO {
    return {
      businessId,
      branchId,
      eventType: 'CONSUMED' as const,
      amount: -1, // Deduct 1 credit
      balanceAfter: currentBalance - 1,
      transactionId,
      note: `Transaction processed using branch credit`,
      actorId: actorId ?? null,
      stripeSessionId: null,
    }
  },

  /**
   * getCurrentBranchUsage - Get branch usage from collection or snapshot
   */
  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
  getCurrentBranchUsage(businessId: string, branchId: string, usageCounterCollection: Map<string, any>, currentPeriodStart: Date): number {
    // Find the open counter for this branch in the current period
    const branchCounter = [...usageCounterCollection.values()].find(
      c => c.businessId === businessId && c.branchId === branchId && !c.isClosed && new Date(c.billingPeriodStart).getTime() === currentPeriodStart.getTime(),
    )

    return branchCounter?.txCount ?? 0
  },

  /**
   * getBranchQuotaLimit - Get branch limit from branch record
   */
  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
  getBranchQuotaLimit(branchCollection: Map<string, any>, branchId: string): number | null {
    const branch = branchCollection.get(branchId)
    return branch?.txQuotaLimit ?? null
  },

  /**
   * getBranchCreditBalance - Get current credit balance from credit ledger collection
   */
  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
  getBranchCreditBalance(creditLedgerCollection: Map<string, any>, businessId: string, branchId: string): BranchCreditSnapshot {
    // Find the most recent credit ledger entry for this branch
    const branchEntries = [...creditLedgerCollection.values()]
      .filter(entry => entry.businessId === businessId && entry.branchId === branchId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const latestEntry = branchEntries[0]

    return {
      branchId,
      balance: latestEntry?.balanceAfter ?? 0,
      lastUpdated: latestEntry?.createdAt ? new Date(latestEntry.createdAt) : null,
    }
  },
}
