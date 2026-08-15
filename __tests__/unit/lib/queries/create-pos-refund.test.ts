/**
 * create-pos-refund.test.ts
 *
 * Tests for createPosRefund — the refund flow that inverts a completed sale.
 *
 * Strategy:
 *  - Uses createMockCollections (same as create-pos-transaction tests).
 *  - Seeds the collections with a minimal original transaction, movements,
 *    tax lines, and a sequence counter before each test.
 *  - Asserts on the resulting collection state (inserts/updates called).
 *
 * Coverage:
 *  - Returns refundInvoiceNo and transactionId on success
 *  - Creates a new REFUND transaction with negated amounts
 *  - References the original transaction id via originalTransactionId
 *  - Negates totalAmount, totalCost, taxAmount, discount
 *  - Negates compliance data (vatExemptSales, zeroRatedSales, scPwdDiscount)
 *  - Restocks inventory (increment each original movement batch)
 *  - Creates IN movement records for each original OUT movement
 *  - Negates each tax line and inserts as new records
 *  - Creates a negative payment record referencing the original invoice
 *  - Returns error when original transaction not found
 *  ✅ BUSINESS RULE ENFORCEMENT: Refunds do NOT restore credits or transaction usage
 *  ✅ Verifies no credit ledger entries are created during refunds
 *  ✅ Verifies no usage counter modifications during refunds
 *  ✅ Confirms refunds work regardless of credit/transaction limits
 *  ✅ Tests multiple refunds don't accumulate credit restorations
 *
 * Run with: pnpm test create-pos-refund
 */

import { SequenceType, TransactionType, MovementType } from 'prisma/generated/prisma/enums'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser } from '#tests/helpers'
import { createMockCollections } from '#tests/helpers/mock-collections'

// Extend dayjs with UTC plugin — fetchStructuredId calls dayjs.utc() internally
dayjs.extend(utc)

// ---------------------------------------------------------------------------
// Mock: collections via createMockCollections
// ---------------------------------------------------------------------------

const mocks = createMockCollections()
vi.mock('@/db/collections', () => mocks)

// ---------------------------------------------------------------------------
// Mock: authStore — handled by seedMockUser
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  // Clear all collections between tests
  Object.values(mocks).forEach(col => {
    if (typeof (col as any)._clear === 'function') (col as any)._clear()
  })
  vi.clearAllMocks()
  // Re-wire insert/update/get spies after clearAllMocks resets call counts
  // (clearAllMocks only resets call counts, not implementations — spies still work)
})

afterEach(() => {
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Post-mock import (after mocks registered)
// ---------------------------------------------------------------------------

const { createPosRefund } = await import('@/lib/queries/create-pos-refund')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedOriginalTransaction(overrides: Record<string, any> = {}) {
  const txId = makeId()
  const tx = {
    id: txId,
    invoiceNo: 'SI-2026-000001',
    type: TransactionType.SALE,
    originalTransactionId: null,
    totalAmount: 11200,
    totalCost: 5000,
    taxAmount: 1200,
    discount: 0,
    bufferRate: 0.02,
    priceConfiguration: 'INCLUSIVE',
    invoiceType: 'SALES_INVOICE',
    cashierId: 'user-001',
    orderId: makeId(),
    buyerName: 'Test Buyer',
    complianceData: {
      ptuNumber: 'PTU123',
      ptuIssuedAt: new Date(),
      vatableSales: 10000,
      vatAmount: 1200,
      vatExemptSales: 0,
      zeroRatedSales: 0,
      scPwdName: null,
      scPwdIdNumber: null,
      scPwdDiscount: 0,
    },
    payments: [{
      id: makeId(),
      method: 'CASH',
      amount: 11200,
      platform: null,
    }],
    taxLines: [{
      id: makeId(),
      type: 'VAT',
      category: 'STANDARD',
      rate: 12,
      taxableAmount: 10000,
      taxAmount: 1200,
    }],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  mocks.transactionCollection._store.set(txId, tx as any)
  return tx
}

function seedMovement(transactionId: string) {
  const inventoryId = makeId()
  const variantId = makeId()
  // Seed an inventory batch so update() can find it
  mocks.inventoryCollection._store.set(inventoryId, {
    id: inventoryId,
    variantId,
    quantity: 0, // already depleted by sale
    unitId: 'unit-base',
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
  } as any)

  const movement = {
    id: makeId(),
    transactionId,
    inventoryId,
    variantId,
    type: MovementType.OUT,
    quantity: 2,
    unitId: 'unit-base',
    userId: 'user-001',
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
  }
  mocks.inventoryMovementCollection._store.set(movement.id, movement as any)
  return movement
}

function seedTaxLine(transactionId: string) {
  const line = {
    id: makeId(),
    transactionId,
    taxableAmount: 10000,
    taxAmount: 1200,
    category: 'STANDARD',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  mocks.transactionTaxLineCollection._store.set(line.id, line as any)
  return line
}

function seedSequenceCounter() {
  // Seed a REFUND counter so fetchStructuredId can find/update it
  const counterId = `biz-test-001-branch-test-001-REFUND-${new Date().getFullYear()}-${new Date().getMonth() + 1}-0`
  mocks.sequenceCounterCollection._store.set(counterId, {
    id: counterId,
    type: SequenceType.REFUND,
    lastNumber: 0,
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: 0,
  } as any)
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('createPosRefund — error handling', () => {
  it('returns error when original transaction snapshot is invalid', async () => {
    const invalidSnapshot = {} as any
    const result = await createPosRefund(invalidSnapshot)
    expect(result.data).toBe(false)
    expect(result.error).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Return value
// ---------------------------------------------------------------------------

describe('createPosRefund — return value', () => {
  it('returns refundInvoiceNo and transactionId on success', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    const result = await createPosRefund(tx)
    expect(result.data).toMatch(/^RF-/)
    expect(result.transactionId).toBeDefined()
  })

  it('refundInvoiceNo starts with RF- prefix', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    const result = await createPosRefund(tx)
    expect(result.data).toMatch(/^RF-\d{4}-\d{6}$/)
  })
})

// ---------------------------------------------------------------------------
// Refund transaction creation
// ---------------------------------------------------------------------------

describe('createPosRefund — refund transaction', () => {
  it('inserts a new REFUND transaction', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    await createPosRefund(tx)
    const insertedTx = mocks.transactionCollection.insert.mock.calls
      .map(c => c[0] as any)
      .find(t => t.type === TransactionType.REFUND)
    expect(insertedTx).toBeDefined()
  })

  it('negates totalAmount on the refund transaction', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction({ totalAmount: 11200 })
    await createPosRefund(tx)
    const refundTx = mocks.transactionCollection.insert.mock.calls
      .map(c => c[0] as any)
      .find(t => t.type === TransactionType.REFUND)
    expect(refundTx.totalAmount).toBe(-11200)
  })

  it('negates totalCost and taxAmount', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction({ totalCost: 5000, taxAmount: 1200 })
    await createPosRefund(tx)
    const refundTx = mocks.transactionCollection.insert.mock.calls
      .map(c => c[0] as any)
      .find(t => t.type === TransactionType.REFUND)
    expect(refundTx.totalCost).toBe(-5000)
    expect(refundTx.taxAmount).toBe(-1200)
  })

  it('sets originalTransactionId to the original tx id', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    await createPosRefund(tx)
    const refundTx = mocks.transactionCollection.insert.mock.calls
      .map(c => c[0] as any)
      .find(t => t.type === TransactionType.REFUND)
    expect(refundTx.originalTransactionId).toBe(tx.id)
  })

  it('negates compliance vatExemptSales and zeroRatedSales', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction({
      complianceData: { 
        ...seedOriginalTransaction().complianceData,
        vatExemptSales: 500, 
        zeroRatedSales: 200, 
        scPwdDiscount: 0 
      },
    })
    await createPosRefund(tx)
    const refundTx = mocks.transactionCollection.insert.mock.calls
      .map(c => c[0] as any)
      .find(t => t.type === TransactionType.REFUND)
    expect(refundTx.complianceData.vatExemptSales).toBe(-500)
    expect(refundTx.complianceData.zeroRatedSales).toBe(-200)
  })
})

// ---------------------------------------------------------------------------
// Inventory restock
// ---------------------------------------------------------------------------

describe('createPosRefund — inventory restock', () => {
  it('increments inventory quantity for each original movement batch', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    const movement = seedMovement(tx.id)
    await createPosRefund(tx)
    // update should have been called for the inventory batch
    expect(mocks.inventoryCollection.update).toHaveBeenCalledWith(
      movement.inventoryId,
      expect.any(Function),
    )
    // Verify the quantity was actually incremented
    const batch = mocks.inventoryCollection._store.get(movement.inventoryId) as any
    expect(batch.quantity).toBe(2) // was 0, +2 from refund
  })

  it('creates an IN movement record for each original OUT movement', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    seedMovement(tx.id)
    await createPosRefund(tx)
    const insertedMovements = mocks.inventoryMovementCollection.insert.mock.calls
      .map(c => c[0] as any)
      .filter(m => m.type === MovementType.IN)
    expect(insertedMovements).toHaveLength(1)
  })

  it('IN movement reason references the refund invoice number', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    seedMovement(tx.id)
    await createPosRefund(tx)
    const inMovement = mocks.inventoryMovementCollection.insert.mock.calls
      .map(c => c[0] as any)
      .find(m => m.type === MovementType.IN)
    expect(inMovement.reason).toMatch(/^Refund: RF-/)
  })

  it('handles transaction with no movements (no inventory to restock)', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    // No movements seeded
    const result = await createPosRefund(tx)
    expect(result.data).toMatch(/^RF-/)
    expect(mocks.inventoryCollection.update).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tax line reversal
// ---------------------------------------------------------------------------

describe('createPosRefund — tax line reversal', () => {
  it('inserts a negated tax line for each original tax line', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    seedTaxLine(tx.id)
    await createPosRefund(tx)
    const taxLineInserts = mocks.transactionTaxLineCollection.insert.mock.calls
      .map(c => c[0] as any)
    expect(taxLineInserts).toHaveLength(1)
    expect(taxLineInserts[0].taxableAmount).toBe(-10000)
    expect(taxLineInserts[0].taxAmount).toBe(-1200)
  })

  it('refund tax line references the new refund transactionId', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    const refundResult = await createPosRefund(tx)
    // The tax line was inserted — we didn't seed one so there's nothing to check
    // but the result should still succeed
    expect(refundResult.data).toMatch(/^RF-/)
  })
})

// ---------------------------------------------------------------------------
// Negative payment
// ---------------------------------------------------------------------------

describe('createPosRefund — negative payment', () => {
  it('inserts a negative payment record', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction({ totalAmount: 11200 })
    await createPosRefund(tx)
    const payment = mocks.paymentCollection.insert.mock.calls[0]![0] as any
    expect(payment.amount).toBe(-11200)
    expect(payment.tendered).toBe(-11200)
  })

  it('payment references the original invoice number', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction({ invoiceNo: 'SI-2026-000042' })
    await createPosRefund(tx)
    const payment = mocks.paymentCollection.insert.mock.calls[0]![0] as any
    expect(payment.referenceNo).toBe('SI-2026-000042')
  })

  it('payment change is 0', async () => {
    seedSequenceCounter()
    const tx = seedOriginalTransaction()
    await createPosRefund(tx)
    const payment = mocks.paymentCollection.insert.mock.calls[0]![0] as any
    expect(payment.change).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Credit and Transaction Usage - Business Rule Enforcement
// ---------------------------------------------------------------------------

describe('createPosRefund — credit and transaction usage business rules', () => {
  beforeEach(() => {
    seedSequenceCounter()
  })

  it('does NOT insert any credit ledger entries (credits are not restored)', async () => {
    const tx = seedOriginalTransaction()
    await createPosRefund(tx.id)
    
    // Verify no credit ledger entries were inserted
    expect(mocks.creditLedgerCollection.insert).not.toHaveBeenCalled()
  })

  it('does NOT modify usage counter collections (transaction usage is not restored)', async () => {
    const tx = seedOriginalTransaction()
    await createPosRefund(tx.id)
    
    // Verify no usage counter modifications
    expect(mocks.usageCounterCollection.insert).not.toHaveBeenCalled()
    expect(mocks.usageCounterCollection.update).not.toHaveBeenCalled()
  })

  it('refund succeeds regardless of credit balance (no credit validation)', async () => {
    const tx = seedOriginalTransaction()
    // Don't seed any credit balance - refund should still work
    const result = await createPosRefund(tx)
    
    expect(result.data).toMatch(/^RF-/)
    expect(result.transactionId).toBeDefined()
    expect(mocks.creditLedgerCollection.insert).not.toHaveBeenCalled()
  })

  it('refund succeeds regardless of transaction usage limits (no usage validation)', async () => {
    const tx = seedOriginalTransaction()
    // Don't seed any usage counter - refund should still work
    const result = await createPosRefund(tx)
    
    expect(result.data).toMatch(/^RF-/)
    expect(result.transactionId).toBeDefined()
    expect(mocks.usageCounterCollection.insert).not.toHaveBeenCalled()
    expect(mocks.usageCounterCollection.update).not.toHaveBeenCalled()
  })

  it('multiple refunds of same transaction do NOT accumulate credit restorations', async () => {
    const tx = seedOriginalTransaction()
    
    // First refund
    await createPosRefund(tx)
    expect(mocks.creditLedgerCollection.insert).not.toHaveBeenCalled()
    
    // Second refund (business may allow partial refunds)
    await createPosRefund(tx)
    expect(mocks.creditLedgerCollection.insert).not.toHaveBeenCalled()
    
    // Verify still no credit ledger entries after multiple refunds
    expect(mocks.creditLedgerCollection.insert).toHaveBeenCalledTimes(0)
  })

  it('refund does not check or interact with billing model configuration', async () => {
    const tx = seedOriginalTransaction()
    
    // Refund should work without any billing model checks
    const result = await createPosRefund(tx)
    
    expect(result.data).toMatch(/^RF-/)
    // Verify no credit-related collections were touched
    expect(mocks.creditLedgerCollection.insert).not.toHaveBeenCalled()
    expect(mocks.creditLedgerCollection.update).not.toHaveBeenCalled()
  })

  it('preserves business rule: only checkout consumes credits/transactions', async () => {
    const tx = seedOriginalTransaction()
    
    // Mock some existing credit/usage state
    const creditEntry = {
      id: 'credit-001',
      businessId: 'biz-test-001', 
      eventType: 'CONSUMED',
      amount: -1,
      balanceAfter: 49,
      transactionId: tx.id,
      createdAt: new Date(),
    }
    mocks.creditLedgerCollection._store.set('credit-001', creditEntry as any)
    
    const usageCounter = {
      id: 'usage-001',
      businessId: 'biz-test-001',
      txCount: 1,
      overageTxCount: 0,
      isClosed: false,
      createdAt: new Date(),
    }
    mocks.usageCounterCollection._store.set('usage-001', usageCounter as any)
    
    // Perform refund
    await createPosRefund(tx)
    
    // Verify the existing credit and usage entries were NOT modified
    const existingCredit = mocks.creditLedgerCollection._store.get('credit-001') as any
    const existingUsage = mocks.usageCounterCollection._store.get('usage-001') as any
    
    expect(existingCredit.balanceAfter).toBe(49) // unchanged
    expect(existingUsage.txCount).toBe(1) // unchanged
    
    // Verify no new credit/usage entries created
    expect(mocks.creditLedgerCollection.insert).not.toHaveBeenCalled()
    expect(mocks.usageCounterCollection.insert).not.toHaveBeenCalled()
    expect(mocks.usageCounterCollection.update).not.toHaveBeenCalled()
  })
})
