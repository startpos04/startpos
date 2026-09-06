/**
 * usage-engine.ts
 *
 * UsageEngine — pure domain engine for transaction usage tracking.
 *
 * Responsibilities:
 *   - Compute txRemaining from a UsageCounterSnapshot and a plan allowance
 *   - Determine whether the TX allowance has been exhausted
 *   - Build an updated counter snapshot after a TX increment
 *   - Determine whether an overage transaction should be billed or blocked
 *
 * Architectural contract (ADR-001):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - All data arrives as plain DTOs from the Application Layer.
 *   - All methods are synchronous — safe to call inside dbTransaction callbacks.
 *   - Returns OperationResult — callers act on the result, never catch exceptions.
 *
 * Usage (inside createPosTransaction → dbTransaction):
 *   const counter = usageCounterCollection.findOpenForPeriod(businessId, periodStart)
 *   const result = UsageEngine.increment(counter, plan.includedTxPerMonth)
 *   if (!result.ok) return result
 *   usageCounterCollection.upsert(result.value)
 */

import { type OperationResult, opFail, opOk } from '@platform/lib/result'
import type { UsageCounterSnapshot } from './types'
import * as UsageSummary from './value-objects/usage-summary'

// ---------------------------------------------------------------------------
// UsageEngine
// ---------------------------------------------------------------------------

export const UsageEngine = {
  // -------------------------------------------------------------------------
  // computeSummary
  // Derives a UsageSummary from a snapshot and the plan's TX allowance.
  // Returns a summary with txRemaining, percentUsed, etc.
  // -------------------------------------------------------------------------
  computeSummary(snapshot: UsageCounterSnapshot, includedTxPerMonth: number): UsageSummary.UsageSummary {
    return UsageSummary.of(snapshot.txCount, snapshot.overageTxCount, includedTxPerMonth, snapshot.billingPeriodStart, snapshot.billingPeriodEnd)
  },

  // -------------------------------------------------------------------------
  // computeRemaining
  // Returns the number of transactions remaining in the period.
  // null = unlimited (plan.includedTxPerMonth = -1).
  // 0    = exhausted.
  // -------------------------------------------------------------------------
  computeRemaining(snapshot: UsageCounterSnapshot, includedTxPerMonth: number): number | null {
    if (includedTxPerMonth === -1) return null
    return Math.max(0, includedTxPerMonth - snapshot.txCount)
  },

  // -------------------------------------------------------------------------
  // isExhausted
  // Returns true when the TX allowance is used up and overage billing is
  // either disabled or not applicable (unlimited plan).
  // -------------------------------------------------------------------------
  isExhausted(snapshot: UsageCounterSnapshot, includedTxPerMonth: number): boolean {
    if (includedTxPerMonth === -1) return false
    return snapshot.txCount >= includedTxPerMonth
  },

  // -------------------------------------------------------------------------
  // increment
  // Returns an updated UsageCounterSnapshot with txCount + 1.
  // If the allowance is exhausted:
  //   - overageBillingEnabled = true  → increment overageTxCount; return updated snapshot
  //   - overageBillingEnabled = false → return opFail (caller should deny the checkout)
  //
  // IMPORTANT: This method is synchronous. It must remain synchronous so it
  // can safely be called inside a dbTransaction callback (which is sync).
  // -------------------------------------------------------------------------
  increment(snapshot: UsageCounterSnapshot, includedTxPerMonth: number, overageBillingEnabled: boolean): OperationResult<UsageCounterSnapshot> {
    if (snapshot.isClosed) {
      return opFail(
        'PRECONDITION_FAILED',
        `UsageCounter ${snapshot.id} is closed for period starting ${snapshot.billingPeriodStart.toISOString()}. Cannot increment a closed counter.`,
      )
    }

    const unlimited = includedTxPerMonth === -1
    const exhausted = !unlimited && snapshot.txCount >= includedTxPerMonth

    if (exhausted && !overageBillingEnabled) {
      return opFail(
        'PRECONDITION_FAILED',
        'Transaction allowance exhausted for this billing period. Upgrade your plan or wait for the next period to continue.',
      )
    }

    if (exhausted && overageBillingEnabled) {
      // Overage billing path — increment overageTxCount, also increment txCount
      // so the total count is always accurate.
      return opOk({
        ...snapshot,
        txCount: snapshot.txCount + 1,
        overageTxCount: snapshot.overageTxCount + 1,
      })
    }

    // Normal path — within allowance
    return opOk({
      ...snapshot,
      txCount: snapshot.txCount + 1,
    })
  },

  // -------------------------------------------------------------------------
  // buildNewCounter
  // Constructs an initial UsageCounterSnapshot for a new billing period.
  // The id is a sentinel ('__NEW__') — the Application Layer replaces it
  // after the DB insert returns the generated id.
  // -------------------------------------------------------------------------
  buildNewCounter(businessId: string, branchId: string, billingPeriodStart: Date, billingPeriodEnd: Date): UsageCounterSnapshot {
    return {
      id: '__NEW__',
      businessId,
      branchId,
      billingPeriodStart,
      billingPeriodEnd,
      txCount: 0,
      overageTxCount: 0,
      isClosed: false,
    }
  },

  // -------------------------------------------------------------------------
  // closeCounter
  // Returns an updated snapshot with isClosed = true.
  // Called by the usage-counter-reset job at the end of a billing period.
  // -------------------------------------------------------------------------
  closeCounter(snapshot: UsageCounterSnapshot): OperationResult<UsageCounterSnapshot> {
    if (snapshot.isClosed) {
      return opFail('CONFLICT', `UsageCounter ${snapshot.id} is already closed.`)
    }
    return opOk({ ...snapshot, isClosed: true })
  },
}
