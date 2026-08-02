/**
 * credit-engine.test.ts
 *
 * Unit tests for CreditEngine — the pure engine that manages prepaid credits.
 * No infrastructure deps, fully synchronous, no mocks required.
 *
 * Coverage:
 *  - readBalance(): null snapshot → zero, positive snapshot, negative clamped to 0
 *  - deduct(): happy path (entry shape, new balance, low-balance flag)
 *  - deduct(): zero balance rejection
 *  - deduct(): low-balance flag triggers when newBalance <= threshold
 *  - restore(): builds a REFUNDED entry that adds 1 credit back
 *  - grant(): PROMOTIONAL, PURCHASE, ADJUSTMENT (positive and negative)
 *  - grant(): rejects amount <= 0 for non-ADJUSTMENT events
 *  - isLowBalance(): delegates correctly to CreditBalance value object
 */

import { describe, expect, it } from 'vitest'
import * as CreditBalance from '@/lib/billing/value-objects/credit-balance'
import { CreditEngine, CreditEventType, type CreditLedgerSnapshot } from '@/lib/billing/credit-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BIZ_ID = 'biz-001'
const TX_ID = 'tx-001'

function snapshot(balance: number): CreditLedgerSnapshot {
  return { balanceAfter: balance }
}

// ---------------------------------------------------------------------------
// readBalance
// ---------------------------------------------------------------------------

describe('CreditEngine.readBalance', () => {
  it('returns a zero balance when snapshot is null (no ledger entries yet)', () => {
    const balance = CreditEngine.readBalance(null)
    expect(balance.amount).toBe(0)
    expect(balance.isZero).toBe(true)
  })

  it('returns the balance from the snapshot', () => {
    const balance = CreditEngine.readBalance(snapshot(50))
    expect(balance.amount).toBe(50)
  })

  it('clamps a negative balanceAfter to 0 (data integrity guard)', () => {
    // balanceAfter should never be negative in production, but guard anyway
    const balance = CreditEngine.readBalance(snapshot(-10))
    expect(balance.amount).toBe(0)
  })

  it('returns exact balance for a single remaining credit', () => {
    const balance = CreditEngine.readBalance(snapshot(1))
    expect(balance.amount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deduct
// ---------------------------------------------------------------------------

describe('CreditEngine.deduct', () => {
  const LOW_BALANCE_THRESHOLD = 10

  it('returns a CONSUMED ledger entry with the correct shape', () => {
    const result = CreditEngine.deduct(BIZ_ID, snapshot(50), TX_ID, LOW_BALANCE_THRESHOLD)

    expect(result.ok).toBe(true)
    if (result.ok) {
      const { entry, newBalance } = result.value
      expect(entry.businessId).toBe(BIZ_ID)
      expect(entry.eventType).toBe(CreditEventType.CONSUMED)
      expect(entry.amount).toBe(-1) // always costs 1 credit
      expect(entry.balanceAfter).toBe(49)
      expect(entry.transactionId).toBe(TX_ID)
      expect(entry.note).toBeNull()
      expect(entry.actorId).toBeNull()
      expect(newBalance.amount).toBe(49)
    }
  })

  it('rejects when balance is zero', () => {
    const result = CreditEngine.deduct(BIZ_ID, snapshot(0), TX_ID, LOW_BALANCE_THRESHOLD)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
      expect(result.reason).toMatch(/zero/i)
    }
  })

  it('rejects when snapshot is null (zero balance)', () => {
    const result = CreditEngine.deduct(BIZ_ID, null, TX_ID, LOW_BALANCE_THRESHOLD)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
    }
  })

  it('sets isLowBalance = false when new balance is above the threshold', () => {
    const result = CreditEngine.deduct(BIZ_ID, snapshot(50), TX_ID, LOW_BALANCE_THRESHOLD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isLowBalance).toBe(false) // 49 > 10
    }
  })

  it('sets isLowBalance = true when new balance is at the threshold', () => {
    // balance = 11, after deduction = 10, threshold = 10 → isLowBalance
    const result = CreditEngine.deduct(BIZ_ID, snapshot(11), TX_ID, LOW_BALANCE_THRESHOLD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isLowBalance).toBe(true) // 10 <= 10
    }
  })

  it('sets isLowBalance = true when new balance drops below the threshold', () => {
    const result = CreditEngine.deduct(BIZ_ID, snapshot(5), TX_ID, LOW_BALANCE_THRESHOLD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isLowBalance).toBe(true) // 4 <= 10
    }
  })

  it('succeeds when exactly 1 credit remains', () => {
    const result = CreditEngine.deduct(BIZ_ID, snapshot(1), TX_ID, LOW_BALANCE_THRESHOLD)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.entry.balanceAfter).toBe(0)
      expect(result.value.newBalance.isZero).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

describe('CreditEngine.restore', () => {
  it('returns a REFUNDED entry that adds 1 credit back', () => {
    const result = CreditEngine.restore(BIZ_ID, snapshot(20), TX_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const entry = result.value
      expect(entry.businessId).toBe(BIZ_ID)
      expect(entry.eventType).toBe(CreditEventType.REFUNDED)
      expect(entry.amount).toBe(1)
      expect(entry.balanceAfter).toBe(21)
      expect(entry.transactionId).toBe(TX_ID)
    }
  })

  it('restores from a null snapshot (previously zero balance)', () => {
    const result = CreditEngine.restore(BIZ_ID, null, TX_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.amount).toBe(1)
      expect(result.value.balanceAfter).toBe(1)
    }
  })

  it('correctly computes balanceAfter when restoring from a zero balance', () => {
    const result = CreditEngine.restore(BIZ_ID, snapshot(0), TX_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.balanceAfter).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// grant
// ---------------------------------------------------------------------------

describe('CreditEngine.grant', () => {
  const ACTOR = 'admin-001'

  it('creates a PROMOTIONAL entry with the correct shape', () => {
    const result = CreditEngine.grant(BIZ_ID, snapshot(50), 100, CreditEventType.PROMOTIONAL, 'Welcome credits', ACTOR)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const entry = result.value
      expect(entry.businessId).toBe(BIZ_ID)
      expect(entry.eventType).toBe(CreditEventType.PROMOTIONAL)
      expect(entry.amount).toBe(100)
      expect(entry.balanceAfter).toBe(150)
      expect(entry.note).toBe('Welcome credits')
      expect(entry.actorId).toBe(ACTOR)
      expect(entry.transactionId).toBeNull()
    }
  })

  it('creates a PURCHASE entry', () => {
    const result = CreditEngine.grant(BIZ_ID, snapshot(0), 500, CreditEventType.PURCHASE, null, ACTOR)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.eventType).toBe(CreditEventType.PURCHASE)
      expect(result.value.amount).toBe(500)
      expect(result.value.balanceAfter).toBe(500)
    }
  })

  it('creates a grant from a null snapshot (first credit purchase)', () => {
    const result = CreditEngine.grant(BIZ_ID, null, 50, CreditEventType.PROMOTIONAL, 'Complimentary', ACTOR)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.balanceAfter).toBe(50)
    }
  })

  it('rejects amount = 0 for PROMOTIONAL', () => {
    const result = CreditEngine.grant(BIZ_ID, snapshot(50), 0, CreditEventType.PROMOTIONAL, null, ACTOR)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_FAILED')
    }
  })

  it('rejects negative amount for PURCHASE', () => {
    const result = CreditEngine.grant(BIZ_ID, snapshot(50), -10, CreditEventType.PURCHASE, null, ACTOR)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_FAILED')
    }
  })

  it('allows negative ADJUSTMENT (reduces balance)', () => {
    const result = CreditEngine.grant(BIZ_ID, snapshot(50), -20, CreditEventType.ADJUSTMENT, 'Correction', ACTOR)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.amount).toBe(-20)
      expect(result.value.balanceAfter).toBe(30)
    }
  })

  it('clamps ADJUSTMENT to 0 when it would make balance negative', () => {
    // balance = 10, adjust -50 → newAmount = -40, clamped to 0
    const result = CreditEngine.grant(BIZ_ID, snapshot(10), -50, CreditEventType.ADJUSTMENT, 'Over-correction', ACTOR)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.balanceAfter).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// isLowBalance
// ---------------------------------------------------------------------------

describe('CreditEngine.isLowBalance', () => {
  it('returns true when balance is at or below the threshold', () => {
    const b = CreditBalance.of(5)
    expect(CreditEngine.isLowBalance(b, 10)).toBe(true)
    expect(CreditEngine.isLowBalance(b, 5)).toBe(true)
  })

  it('returns false when balance is above the threshold', () => {
    const b = CreditBalance.of(11)
    expect(CreditEngine.isLowBalance(b, 10)).toBe(false)
  })
})
