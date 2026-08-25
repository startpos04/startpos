/**
 * create-pos-refund.integration.test.ts — TYPE 2 (orchestration, mocked DB boundary)
 *
 * Integration tests for createPosRefund query, testing complete refund
 * journeys with credit/transaction limits in real business scenarios.
 *
 * Why "integration" and not "unit"?
 *   - Tests real refund flow with actual business rules and constraints
 *   - Validates interaction between refund logic and billing systems
 *   - Tests business rule enforcement: refunds do NOT restore credits/transactions
 *   - Covers multiple billing models (PREPAID_CREDITS, MONTHLY_SUBSCRIPTION)
 *   - Prisma is mocked at the boundary so tests run without a DB
 *
 * Business Rule Validation:
 *   ✅ Refunds do NOT restore credits regardless of billing model
 *   ✅ Refunds do NOT restore transaction usage counts
 *   ✅ Refunds succeed even when credits/transactions are exhausted
 *   ✅ Multiple refunds don't accumulate credit restorations
 *   ✅ Refunds work independently of billing limits and constraints
 *
 * Test Scenarios:
 *   1. PREPAID_CREDITS model: Refund with zero credit balance
 *   2. MONTHLY_SUBSCRIPTION model: Refund with exhausted transaction limits
 *   3. Multiple refunds of same transaction
 *   4. Refund during billing period rollover
 *   5. Refund with inventory management enabled/disabled
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MovementType, SequenceType, TransactionType, TaxLineType, TaxCategory } from 'prisma/generated/prisma/enums'
import { BillingModel } from '@/lib/billing/types'
import type { TransactionSnapshot } from '@/lib/queries/create-pos-refund'

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: (opts: unknown) => unknown) => fn),
  })),
}))

vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// Mock dayjs with proper extend function
vi.mock('dayjs', () => {
  const mockDayjs = vi.fn(() => ({
    year: () => 2026,
    month: () => 7, // August (0-indexed)
    date: () => 13,
  }))
  mockDayjs.extend = vi.fn()
  mockDayjs.utc = vi.fn(() => ({
    year: () => 2026,
    month: () => 7, // August (0-indexed)
    date: () => 13,
  }))
  return { default: mockDayjs }
})

// Mock dayjs plugins
vi.mock('dayjs/plugin/relativeTime', () => ({ default: {} }))

// Mock authStore with different billing scenarios
const mockAuthStore = {
  state: {
    user: {
      id: 'user-001',
      business: { id: 'biz-001' },
      branch: { id: 'branch-001' },
      configs: {
        VAT_RATE: 0.12,
        PRICE_CONFIGURATION: 'INCLUSIVE',
        IS_VAT_REGISTERED: true,
        BUFFER_RATE: 0.02,
      },
      compliance: {
        BIR_PTU_NUMBER: 'PTU123',
        BIR_PTU_ISSUED_AT: new Date(),
      },
      entitlement: {
        billingModel: BillingModel.PREPAID_CREDITS,
        creditBalance: 0, // Zero balance to test refunds work regardless
        txRemaining: 0, // Exhausted transactions to test refunds work regardless
        capabilities: ['MANAGE_INVENTORY', 'ISSUE_REFUND'],
      },
    },
  },
}

vi.mock('@/store/auth-store', () => ({ authStore: mockAuthStore }))

// Mock collections
const mockStore = new Map()
const mockCollections = {
  transactionCollection: {
    insert: vi.fn(),
    get: vi.fn((id: string) => mockStore.get(`transaction-${id}`)),
    values: vi.fn(() => Array.from(mockStore.values()).filter(v => v._type === 'transaction')),
  },
  inventoryCollection: {
    update: vi.fn(),
    get: vi.fn((id: string) => mockStore.get(`inventory-${id}`)),
  },
  inventoryMovementCollection: {
    insert: vi.fn(),
    values: vi.fn(() => Array.from(mockStore.values()).filter(v => v._type === 'movement')),
  },
  transactionTaxLineCollection: {
    insert: vi.fn(),
  },
  paymentCollection: {
    insert: vi.fn(),
  },
  creditLedgerCollection: {
    insert: vi.fn(),
    values: vi.fn(() => Array.from(mockStore.values()).filter(v => v._type === 'credit')),
  },
  usageCounterCollection: {
    insert: vi.fn(),
    update: vi.fn(),
    values: vi.fn(() => Array.from(mockStore.values()).filter(v => v._type === 'usage')),
  },
  sequenceCounterCollection: {
    get: vi.fn(),
    update: vi.fn(),
  },
}

vi.mock('@/db/collections', () => mockCollections)
vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn((fn: () => any) => ({ isErr: () => false, value: fn() })),
}))
vi.mock('@/lib/queries/write-audit', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTransactionSnapshot(overrides: Partial<TransactionSnapshot> = {}): TransactionSnapshot {
  return {
    id: 'tx-001',
    invoiceNo: 'SI-2026-000001',
    totalAmount: 11200,
    totalCost: 5000,
    taxAmount: 1200,
    discount: 0,
    snapshotBufferRate: 0.02,
    priceConfiguration: 'INCLUSIVE',
    invoiceType: 'SALES_INVOICE',
    cashierId: 'user-001',
    orderId: 'order-001',
    snapshotCustomerName: 'Test Customer',
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
      id: 'payment-001',
      method: 'CASH',
      amount: 11200,
      platform: null,
    }],
    taxLines: [{
      id: 'taxline-001',
      type: TaxLineType.VAT,
      category: TaxCategory.STANDARD,
      rate: 12,
      taxableAmount: 10000,
      taxAmount: 1200,
    }],
    ...overrides,
  }
}

function seedSequenceCounter() {
  const counterId = 'seq-refund-001'
  mockCollections.sequenceCounterCollection.get.mockReturnValue({
    id: counterId,
    type: SequenceType.REFUND,
    lastNumber: 0,
    businessId: 'biz-001',
    branchId: 'branch-001',
    year: 2026,
    month: 8,
    day: 0,
  })
  mockCollections.sequenceCounterCollection.update.mockImplementation((id, fn) => {
    const counter = { id, lastNumber: 0 }
    fn(counter)
    return counter
  })
}

function seedInventoryAndMovements(transactionId: string) {
  // Seed inventory batch
  const inventoryId = 'inv-001'
  mockCollections.inventoryCollection.get.mockReturnValue({
    id: inventoryId,
    variantId: 'variant-001',
    quantity: 0, // Already depleted by original sale
    unitId: 'unit-kg',
  })
  
  // Mock inventory update
  mockCollections.inventoryCollection.update.mockImplementation((id, fn) => {
    const inventory = { id, quantity: 0 }
    fn(inventory)
    mockStore.set(`inventory-${id}`, { ...inventory, _type: 'inventory' })
    return inventory
  })
  
  // Seed original movement
  mockStore.set('movement-001', {
    _type: 'movement',
    id: 'movement-001',
    transactionId,
    inventoryId,
    variantId: 'variant-001',
    type: MovementType.OUT,
    quantity: 2,
    unitId: 'unit-kg',
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockStore.clear()
  vi.clearAllMocks()
  seedSequenceCounter()
})

// Import after mocks are set up
const { createPosRefund } = await import('@/lib/queries/create-pos-refund')

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Integration: createPosRefund with credit/transaction limits', () => {
  describe('PREPAID_CREDITS billing model - business rule enforcement', () => {
    beforeEach(() => {
      mockAuthStore.state.user.entitlement.billingModel = BillingModel.PREPAID_CREDITS
      mockAuthStore.state.user.entitlement.creditBalance = 0 // Zero balance
    })

    it('refund succeeds with zero credit balance (no credit restoration)', async () => {
      const snapshot = createTransactionSnapshot()
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-2026-\d{6}$/)
      expect(result.transactionId).toBeDefined()
      
      // Verify NO credit ledger entries were inserted
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
      
      // Verify refund transaction was created with correct negated amounts
      expect(mockCollections.transactionCollection.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.REFUND,
          totalAmount: -11200,
          totalCost: -5000,
          taxAmount: -1200,
          originalTransactionId: 'tx-001',
        })
      )
    })

    it('multiple refunds do not accumulate credit restorations', async () => {
      const snapshot = createTransactionSnapshot()
      
      // First refund
      await createPosRefund(snapshot)
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
      
      // Reset mocks to track second refund
      vi.clearAllMocks()
      seedSequenceCounter()
      
      // Second refund of same transaction  
      await createPosRefund(snapshot)
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
      
      // Verify still no credit restorations after multiple refunds
      expect(mockCollections.creditLedgerCollection.insert).toHaveBeenCalledTimes(0)
    })

    it('refund works with existing consumed credits in ledger', async () => {
      const snapshot = createTransactionSnapshot()
      
      // Seed existing credit consumption
      mockStore.set('credit-001', {
        _type: 'credit',
        id: 'credit-001',
        businessId: 'biz-001',
        eventType: 'CONSUMED',
        amount: -1,
        balanceAfter: 0, // Balance at zero
        transactionId: 'tx-001',
        createdAt: new Date(),
      })
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-/)
      expect(result.transactionId).toBeDefined()
      
      // Verify existing credit entry remains unchanged
      const existingCredit = mockStore.get('credit-001')
      expect(existingCredit.balanceAfter).toBe(0)
      expect(existingCredit.amount).toBe(-1)
      
      // Verify no new credit entries were created
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
    })
  })

  describe('MONTHLY_SUBSCRIPTION billing model - transaction limits', () => {
    beforeEach(() => {
      mockAuthStore.state.user.entitlement.billingModel = BillingModel.MONTHLY_SUBSCRIPTION
      mockAuthStore.state.user.entitlement.txRemaining = 0 // Exhausted transactions
    })

    it('refund succeeds with exhausted transaction limits (no usage restoration)', async () => {
      const snapshot = createTransactionSnapshot()
      
      // Seed existing usage counter at limit
      mockStore.set('usage-001', {
        _type: 'usage',
        id: 'usage-001',
        businessId: 'biz-001',
        txCount: 500, // At monthly limit
        overageTxCount: 0,
        isClosed: false,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      })
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-/)
      expect(result.transactionId).toBeDefined()
      
      // Verify NO usage counter modifications
      expect(mockCollections.usageCounterCollection.insert).not.toHaveBeenCalled()
      expect(mockCollections.usageCounterCollection.update).not.toHaveBeenCalled()
      
      // Verify existing usage counter remains unchanged
      const existingUsage = mockStore.get('usage-001')
      expect(existingUsage.txCount).toBe(500) // Unchanged
      expect(existingUsage.overageTxCount).toBe(0) // Unchanged
    })

    it('refund creates transaction regardless of billing period state', async () => {
      const snapshot = createTransactionSnapshot()
      
      // Seed closed usage counter (billing period ended)
      mockStore.set('usage-001', {
        _type: 'usage',
        id: 'usage-001',
        businessId: 'biz-001',
        txCount: 500,
        overageTxCount: 50,
        isClosed: true, // Period closed
      })
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-/)
      expect(result.transactionId).toBeDefined()
      
      // Verify refund succeeds regardless of closed billing period
      expect(mockCollections.transactionCollection.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.REFUND,
          originalTransactionId: 'tx-001',
        })
      )
      
      // Verify no usage modifications
      expect(mockCollections.usageCounterCollection.update).not.toHaveBeenCalled()
    })
  })

  describe('Inventory management interaction', () => {
    it('restocks inventory but does not restore credits/transactions', async () => {
      const snapshot = createTransactionSnapshot()
      seedInventoryAndMovements('tx-001')
      
      // Enable inventory management
      mockAuthStore.state.user.entitlement.capabilities = ['MANAGE_INVENTORY']
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-/)
      
      // Verify inventory was restocked
      expect(mockCollections.inventoryCollection.update).toHaveBeenCalledWith(
        'inv-001',
        expect.any(Function)
      )
      
      // Verify IN movement was created
      expect(mockCollections.inventoryMovementCollection.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MovementType.IN,
          quantity: 2,
          reason: expect.stringMatching(/^Refund: RF-/),
        })
      )
      
      // Verify NO credit/usage restoration despite inventory restock
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
      expect(mockCollections.usageCounterCollection.insert).not.toHaveBeenCalled()
      expect(mockCollections.usageCounterCollection.update).not.toHaveBeenCalled()
    })

    it('refund succeeds without inventory management capability', async () => {
      const snapshot = createTransactionSnapshot()
      seedInventoryAndMovements('tx-001')
      
      // Disable inventory management
      mockAuthStore.state.user.entitlement.capabilities = []
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-/)
      
      // Verify inventory was NOT restocked
      expect(mockCollections.inventoryCollection.update).not.toHaveBeenCalled()
      expect(mockCollections.inventoryMovementCollection.insert).not.toHaveBeenCalled()
      
      // Verify still no credit/usage restoration
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
      expect(mockCollections.usageCounterCollection.insert).not.toHaveBeenCalled()
      expect(mockCollections.usageCounterCollection.update).not.toHaveBeenCalled()
    })
  })

  describe('Business rule validation across billing models', () => {
    it.each([
      ['PREPAID_CREDITS', BillingModel.PREPAID_CREDITS],
      ['MONTHLY_SUBSCRIPTION', BillingModel.MONTHLY_SUBSCRIPTION],
    ])('refund with %s model never restores credits/transactions', async (modelName, billingModel) => {
      mockAuthStore.state.user.entitlement.billingModel = billingModel
      
      const snapshot = createTransactionSnapshot()
      
      const result = await createPosRefund(snapshot)
      
      expect(result.data).toMatch(/^RF-/)
      expect(result.transactionId).toBeDefined()
      
      // Universal business rule: NO restoration regardless of billing model
      expect(mockCollections.creditLedgerCollection.insert).not.toHaveBeenCalled()
      expect(mockCollections.usageCounterCollection.insert).not.toHaveBeenCalled() 
      expect(mockCollections.usageCounterCollection.update).not.toHaveBeenCalled()
      
      // Verify core refund functionality still works
      expect(mockCollections.transactionCollection.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.REFUND,
          totalAmount: -snapshot.totalAmount,
          originalTransactionId: snapshot.id,
        })
      )
      expect(mockCollections.paymentCollection.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: -snapshot.totalAmount,
          referenceNo: snapshot.invoiceNo,
        })
      )
    })
  })
})