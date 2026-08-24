/**
 * finished-goods-engine.test.ts — Unit tests for FinishedGoodsEngine with inventory modes
 * 
 * Tests finished goods consumption behavior across three inventory modes:
 * - none: No validation, consumption always proceeds
 * - relaxed: Allows consumption even if finished goods go negative
 * - strict: Blocks consumption if insufficient finished goods
 * 
 * Also tests optimistic locking (version checking) for concurrency control.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { FinishedGoodsEngine, ConcurrencyError } from '@/lib/production/finished-goods-engine'
import { InventoryType, MovementType } from 'prisma/generated/prisma/enums'

// Mock getInventoryMode to control inventory mode in tests
vi.mock('@/lib/inventory', () => ({
  getInventoryMode: vi.fn((businessId: string) => {
    // Default to strict, tests can override
    return 'strict'
  }),
  InventoryPolicy: {
    validateDeduction: vi.fn((variantId, available, required, mode) => {
      if (mode === 'none' || mode === 'relaxed') {
        return // Allow
      }
      // Strict mode
      if (available < required) {
        throw new Error(`Insufficient stock for ${variantId}`)
      }
    }),
  },
}))

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createMockCollections() {
  const inventoryMap = new Map()
  const movementMap = new Map()

  const inventoryCollection = {
    get: (id: string) => inventoryMap.get(id),
    insert: (item: any) => inventoryMap.set(item.id, item),
    update: (id: string, updater: (draft: any) => void) => {
      const item = inventoryMap.get(id)
      if (item) {
        updater(item)
        inventoryMap.set(id, item)
      }
    },
    values: () => inventoryMap.values(),
  }

  const movementCollection = {
    insert: (item: any) => movementMap.set(item.id, item),
    values: () => movementMap.values(),
  }

  return {
    inventoryCollection,
    movementCollection,
    // Helper to setup finished goods
    setupFinishedGoods: (id: string, data: any) => {
      inventoryMap.set(id, {
        id,
        inventoryType: InventoryType.FINISHED_GOOD,
        version: 1,
        producedAt: new Date('2024-01-01'),
        ...data,
      })
    },
  }
}

const mockContext = {
  userId: 'user-1',
  branchId: 'branch-1',
  businessId: 'business-strict', // Will be changed per test
}

// ---------------------------------------------------------------------------
// Tests: consumeFinishedGoods() - Strict Mode
// ---------------------------------------------------------------------------

describe('FinishedGoodsEngine.consumeFinishedGoods - strict mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('blocks sale when finished goods insufficient', () => {
    const collections = createMockCollections()

    // Setup: Only 5 units of finished goods available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      unitId: 'unit-pcs',
    })

    // Execute: Try to consume 10 units (more than available)
    expect(() => {
      FinishedGoodsEngine.consumeFinishedGoods({
        variantId: 'variant-1',
        quantity: 10, // Need 10, have 5
        unitId: 'unit-pcs',
        transactionId: 'txn-1',
        inventoryCollection: collections.inventoryCollection as any,
        movementCollection: collections.movementCollection as any,
        ctx: { ...mockContext, businessId: 'business-strict' },
      })
    }).toThrow('Insufficient finished goods')

    // Assert: Inventory not deducted
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(5) // Unchanged

    // Assert: No movements created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(0)
  })

  it('allows sale when finished goods sufficient', () => {
    const collections = createMockCollections()

    // Setup: 10 units of finished goods available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      costPrice: 100,
      unitId: 'unit-pcs',
    })

    // Execute: Consume 5 units (less than available)
    const result = FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 5,
      unitId: 'unit-pcs',
      transactionId: 'txn-1',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-strict' },
    })

    // Assert: Consumption successful
    expect(result.consumed.length).toBe(1)
    expect(result.consumed[0].quantity).toBe(5)
    expect(result.totalCost).toBe(500) // 5 units × 100 cost

    // Assert: Inventory deducted
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(5) // 10 - 5 = 5 remaining

    // Assert: Version incremented (optimistic locking)
    expect(fg.version).toBe(2) // 1 → 2

    // Assert: OUT movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
    const movement = movements[0] as any
    expect(movement.type).toBe(MovementType.OUT)
    expect(movement.quantity).toBe(5)
    expect(movement.transactionId).toBe('txn-1')
  })
})

// ---------------------------------------------------------------------------
// Tests: consumeFinishedGoods() - Relaxed Mode
// ---------------------------------------------------------------------------

describe('FinishedGoodsEngine.consumeFinishedGoods - relaxed mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('relaxed')
  })

  it('allows sale when finished goods insufficient (can go negative)', () => {
    const collections = createMockCollections()

    // Setup: Only 5 units available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      unitId: 'unit-pcs',
    })

    // Execute: Consume 10 units (more than available, but relaxed allows)
    const result = FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 10, // Need 10, have 5
      unitId: 'unit-pcs',
      transactionId: 'txn-1',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-relaxed' },
    })

    // Assert: Consumption successful (relaxed mode)
    expect(result.consumed.length).toBe(1)
    expect(result.consumed[0].quantity).toBe(10)
    expect(result.totalCost).toBe(1000) // 10 units × 100 cost

    // Assert: Inventory goes negative
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-5) // 5 - 10 = -5 (negative allowed)

    // Assert: Version incremented
    expect(fg.version).toBe(2)

    // Assert: Movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
  })

  it('allows multiple sales to go increasingly negative', () => {
    const collections = createMockCollections()

    // Setup: 2 units available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 2,
      costPrice: 50,
      unitId: 'unit-pcs',
    })

    // Execute: First sale - 5 units
    FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 5,
      unitId: 'unit-pcs',
      transactionId: 'txn-1',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-relaxed' },
    })

    // Assert: Goes negative
    let fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-3) // 2 - 5 = -3

    // Execute: Second sale - 3 more units
    FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 3,
      unitId: 'unit-pcs',
      transactionId: 'txn-2',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-relaxed' },
    })

    // Assert: Goes more negative
    fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-6) // -3 - 3 = -6

    // Assert: Both movements created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Tests: consumeFinishedGoods() - None Mode
// ---------------------------------------------------------------------------

describe('FinishedGoodsEngine.consumeFinishedGoods - none mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('none')
  })

  it('allows sale without validation (no tracking)', () => {
    const collections = createMockCollections()

    // Setup: Only 1 unit available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 1,
      costPrice: 100,
      unitId: 'unit-pcs',
    })

    // Execute: Consume 100 units (way more than available, but none mode skips validation)
    const result = FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 100,
      unitId: 'unit-pcs',
      transactionId: 'txn-1',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-none' },
    })

    // Assert: Consumption successful (none mode skips all validation)
    expect(result.consumed.length).toBe(1)
    expect(result.consumed[0].quantity).toBe(100)

    // Assert: Inventory goes very negative (validation skipped)
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-99) // 1 - 100 = -99

    // Assert: Movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: consumeFinishedGoods() - FIFO Behavior
// ---------------------------------------------------------------------------

describe('FinishedGoodsEngine.consumeFinishedGoods - FIFO', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('consumes oldest batches first (FIFO)', () => {
    const collections = createMockCollections()

    // Setup: Three batches with different ages
    collections.setupFinishedGoods('fg-old', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      unitId: 'unit-pcs',
      producedAt: new Date('2024-01-01'), // Oldest
    })

    collections.setupFinishedGoods('fg-middle', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      unitId: 'unit-pcs',
      producedAt: new Date('2024-01-15'), // Middle
    })

    collections.setupFinishedGoods('fg-new', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      unitId: 'unit-pcs',
      producedAt: new Date('2024-01-30'), // Newest
    })

    // Execute: Consume 7 units (should consume from oldest first)
    const result = FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 7,
      unitId: 'unit-pcs',
      transactionId: 'txn-1',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: mockContext,
    })

    // Assert: Consumed from 2 batches (oldest first)
    expect(result.consumed.length).toBe(2)
    expect(result.consumed[0].inventoryId).toBe('fg-old') // 5 from oldest
    expect(result.consumed[0].quantity).toBe(5)
    expect(result.consumed[1].inventoryId).toBe('fg-middle') // 2 from middle
    expect(result.consumed[1].quantity).toBe(2)

    // Assert: Oldest batch fully consumed
    const fgOld = collections.inventoryCollection.get('fg-old')
    expect(fgOld.quantity).toBe(0) // 5 - 5 = 0

    // Assert: Middle batch partially consumed
    const fgMiddle = collections.inventoryCollection.get('fg-middle')
    expect(fgMiddle.quantity).toBe(3) // 5 - 2 = 3

    // Assert: Newest batch untouched
    const fgNew = collections.inventoryCollection.get('fg-new')
    expect(fgNew.quantity).toBe(5) // Unchanged
  })
})

// ---------------------------------------------------------------------------
// Tests: consumeFinishedGoods() - Optimistic Locking (Concurrency)
// ---------------------------------------------------------------------------

describe('FinishedGoodsEngine.consumeFinishedGoods - concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('throws ConcurrencyError when version mismatch detected', () => {
    const collections = createMockCollections()

    // Setup: 10 units available, version 1
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      costPrice: 100,
      unitId: 'unit-pcs',
      version: 1,
    })

    // Simulate concurrent modification: another transaction changes version
    // This simulates Terminal B modifying the batch after Terminal A reads it
    const inventoryCollection = collections.inventoryCollection
    const originalUpdate = inventoryCollection.update.bind(inventoryCollection)
    let updateCallCount = 0

    inventoryCollection.update = (id: string, updater: any) => {
      updateCallCount++
      
      // First call: simulate version conflict
      if (updateCallCount === 1) {
        // Simulate another transaction incrementing version before this one
        const item = inventoryCollection.get(id)
        if (item) {
          item.version = 2 // Another transaction changed it
        }
      }
      
      return originalUpdate(id, updater)
    }

    // Execute: Try to consume (should detect version mismatch)
    expect(() => {
      FinishedGoodsEngine.consumeFinishedGoods({
        variantId: 'variant-1',
        quantity: 5,
        unitId: 'unit-pcs',
        transactionId: 'txn-1',
        inventoryCollection: inventoryCollection as any,
        movementCollection: collections.movementCollection as any,
        ctx: mockContext,
      })
    }).toThrow(ConcurrencyError)
  })

  it('increments version on successful consumption', () => {
    const collections = createMockCollections()

    // Setup: Version starts at 1
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      costPrice: 100,
      unitId: 'unit-pcs',
      version: 1,
    })

    // Execute: Consume
    FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 5,
      unitId: 'unit-pcs',
      transactionId: 'txn-1',
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: mockContext,
    })

    // Assert: Version incremented
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.version).toBe(2) // 1 → 2
  })
})

// ---------------------------------------------------------------------------
// Tests: checkAvailability()
// ---------------------------------------------------------------------------

describe('FinishedGoodsEngine.checkAvailability', () => {
  it('returns true when sufficient finished goods exist', () => {
    const collections = createMockCollections()

    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
    })

    const available = FinishedGoodsEngine.checkAvailability(
      'variant-1',
      5,
      'branch-1',
      collections.inventoryCollection as any,
    )

    expect(available).toBe(true)
  })

  it('returns false when insufficient finished goods exist', () => {
    const collections = createMockCollections()

    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
    })

    const available = FinishedGoodsEngine.checkAvailability(
      'variant-1',
      10,
      'branch-1',
      collections.inventoryCollection as any,
    )

    expect(available).toBe(false)
  })

  it('aggregates quantity across multiple batches', () => {
    const collections = createMockCollections()

    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
    })

    collections.setupFinishedGoods('fg-2', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 7,
    })

    // Total: 5 + 7 = 12 units available
    const available = FinishedGoodsEngine.checkAvailability(
      'variant-1',
      10,
      'branch-1',
      collections.inventoryCollection as any,
    )

    expect(available).toBe(true) // 10 ≤ 12
  })
})
