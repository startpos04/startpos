/**
 * credit-engine.ts
 *
 * CreditEngine — pure domain engine for prepaid credit management.
 *
 * Responsibilities:
 *   - Read the current credit balance from a CreditLedgerSnapshot (the latest
 *     `balanceAfter` value — O(1), no SUM query needed).
 *   - Validate that a deduction is possible (balance ≥ cost).
 *   - Build new CreditLedgerEntry DTOs for insert by the Application Layer.
 *   - Check whether the balance after a deduction is below the low-balance
 *     threshold (to trigger the CREDIT_LOW_BALANCE notification).
 *   - Restore credits on a POS refund.
 *
 * Architectural contract (ADR-001):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - All data arrives as plain DTOs from the Application Layer.
 *   - All methods are synchronous — safe to call inside dbTransaction callbacks.
 *   - Returns OperationResult — callers act on the result, never catch exceptions.
 *
 * Known Phase 3 limitation (R2):
 *   Two concurrent checkouts may both pass the balance check before either
 *   deduction commits, allowing the balance to go temporarily negative.
 *   This is auditable via the ledger. A server-side optimistic lock will be
 *   added in a future hardening phase. A code comment is placed on deduct().
 */

import { type OperationResult, opFail, opOk } from '../result'
import * as CreditBalance from './value-objects/credit-balance'

// ---------------------------------------------------------------------------
// CreditLedgerSnapshot
// Plain DTO representing the minimum data CreditEngine needs from a
// CreditLedger row. The Application Layer assembles this from a DB query
// for the most recent CreditLedger entry for the business.
// ---------------------------------------------------------------------------
export type CreditLedgerSnapshot = {
  /** The running balance after this (latest) event was applied. */
  balanceAfter: number
}

// ---------------------------------------------------------------------------
// CreditLedgerEntryDTO
// Plain DTO for a new CreditLedger row to be inserted by the Application Layer.
// ---------------------------------------------------------------------------
export type CreditLedgerEntryDTO = {
  businessId: string
  eventType: CreditEventType
  /** Signed: positive = credit in, negative = credit out. */
  amount: number
  /** Running balance snapshot after this event. */
  balanceAfter: number
  /** POS transaction ID — only set for CONSUMED / REFUNDED events. */
  transactionId: string | null
  /** Optional admin note — required for ADJUSTMENT events. */
  note: string | null
  /** userId of the actor; null = automated / system. */
  actorId: string | null
}

// ---------------------------------------------------------------------------
// CreditEventType (domain mirror of Prisma enum — no Prisma import needed)
// ---------------------------------------------------------------------------
export const CreditEventType = {
  PURCHASE: 'PURCHASE',
  CONSUMED: 'CONSUMED',
  REFUNDED: 'REFUNDED',
  EXPIRED: 'EXPIRED',
  ADJUSTMENT: 'ADJUSTMENT',
  PROMOTIONAL: 'PROMOTIONAL',
} as const

export type CreditEventType = (typeof CreditEventType)[keyof typeof CreditEventType]

// ---------------------------------------------------------------------------
// CreditDeductionResult
// Extended result for deduct() — carries the new entry DTO and a flag
// indicating whether the low-balance threshold was crossed.
// ---------------------------------------------------------------------------
export type CreditDeductionResult = {
  entry: CreditLedgerEntryDTO
  newBalance: CreditBalance.CreditBalance
  /** True if balanceAfter < lowBalanceThreshold (caller should notify). */
  isLowBalance: boolean
}

// ---------------------------------------------------------------------------
// CreditEngine
// ---------------------------------------------------------------------------

export const CreditEngine = {
  // -------------------------------------------------------------------------
  // readBalance
  // Returns the current CreditBalance from the latest ledger snapshot.
  // If no snapshot exists (no ledger entries yet), returns a zero balance.
  // -------------------------------------------------------------------------
  readBalance(snapshot: CreditLedgerSnapshot | null): CreditBalance.CreditBalance {
    if (!snapshot) return CreditBalance.zero()
    // Guard: balanceAfter should never be negative in normal operation;
    // clamp to 0 for the balance object to stay invariant-safe.
    return CreditBalance.of(Math.max(0, snapshot.balanceAfter))
  },

  // -------------------------------------------------------------------------
  // deduct
  // Validates that the balance is sufficient for a cost-of-1 deduction
  // (one credit per POS transaction in the current model).
  // Returns opFail if the balance is zero.
  // Returns opOk with a CreditDeductionResult that includes the new ledger
  // entry DTO and a low-balance flag.
  //
  // NOTE (R2 — Phase 3 known limitation):
  //   This check is optimistic. Two concurrent checkouts on different devices
  //   may both pass this check before either insert commits, allowing the
  //   balance to go temporarily negative. This is acceptable for Phase 3 and
  //   will be hardened with a server-side optimistic lock in a later phase.
  // -------------------------------------------------------------------------
  deduct(
    businessId: string,
    snapshot: CreditLedgerSnapshot | null,
    transactionId: string,
    lowBalanceThreshold: number,
  ): OperationResult<CreditDeductionResult> {
    const balance = CreditEngine.readBalance(snapshot)
    const COST_PER_TX = 1

    if (!balance.isSufficient(COST_PER_TX)) {
      return opFail('PRECONDITION_FAILED', 'Credit balance is zero. Top up your credits to continue processing transactions.')
    }

    const newBalance = CreditBalance.afterDeduction(balance, COST_PER_TX)!
    const entry: CreditLedgerEntryDTO = {
      businessId,
      eventType: CreditEventType.CONSUMED,
      amount: -COST_PER_TX,
      balanceAfter: newBalance.amount,
      transactionId,
      note: null,
      actorId: null,
    }

    return opOk({
      entry,
      newBalance,
      isLowBalance: newBalance.isLowBalance(lowBalanceThreshold),
    })
  },

  // -------------------------------------------------------------------------
  // restore
  // Called on POS refund. Adds back the credit that was consumed by the
  // original transaction. Returns a REFUNDED ledger entry DTO.
  // -------------------------------------------------------------------------
  restore(businessId: string, snapshot: CreditLedgerSnapshot | null, transactionId: string): OperationResult<CreditLedgerEntryDTO> {
    const balance = CreditEngine.readBalance(snapshot)
    const RESTORE_AMOUNT = 1

    const newBalance = CreditBalance.afterCredit(balance, RESTORE_AMOUNT)
    const entry: CreditLedgerEntryDTO = {
      businessId,
      eventType: CreditEventType.REFUNDED,
      amount: RESTORE_AMOUNT,
      balanceAfter: newBalance.amount,
      transactionId,
      note: null,
      actorId: null,
    }

    return opOk(entry)
  },

  // -------------------------------------------------------------------------
  // grant
  // Admin-initiated credit grant (PROMOTIONAL or PURCHASE).
  // Used by the grant-credits server function.
  // -------------------------------------------------------------------------
  grant(
    businessId: string,
    snapshot: CreditLedgerSnapshot | null,
    amount: number,
    eventType: typeof CreditEventType.PROMOTIONAL | typeof CreditEventType.PURCHASE | typeof CreditEventType.ADJUSTMENT,
    note: string | null,
    actorId: string,
  ): OperationResult<CreditLedgerEntryDTO> {
    if (amount <= 0 && eventType !== CreditEventType.ADJUSTMENT) {
      return opFail('VALIDATION_FAILED', `Credit grant amount must be > 0, got ${amount}`)
    }

    const balance = CreditEngine.readBalance(snapshot)
    const newAmount = balance.amount + amount // may be negative for ADJUSTMENT
    const newBalance = newAmount >= 0 ? CreditBalance.of(newAmount) : CreditBalance.zero()

    const entry: CreditLedgerEntryDTO = {
      businessId,
      eventType,
      amount,
      balanceAfter: newBalance.amount,
      transactionId: null,
      note,
      actorId,
    }

    return opOk(entry)
  },

  // -------------------------------------------------------------------------
  // isLowBalance
  // Standalone check — used in places that already have the balance and need
  // to check the threshold without building a full deduction result.
  // -------------------------------------------------------------------------
  isLowBalance(balance: CreditBalance.CreditBalance, threshold: number): boolean {
    return balance.isLowBalance(threshold)
  },
}
