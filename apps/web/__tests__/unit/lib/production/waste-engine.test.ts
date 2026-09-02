/**
 * waste-engine.test.ts — Unit tests for WasteEngine with inventory modes
 * 
 * Tests waste recording behavior across three inventory modes:
 * - none: No validation, waste recording always proceeds
 * - relaxed: Allows waste recording even with negative inventory (reconciliation)
 * - strict: Blocks waste recording if trying to dispose more than exists
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { WasteEngine } from '@/lib/production/waste-engine'
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
        throw new Error(`Insufficient finished goods to waste`)
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
        producedAt: new Date('2024-01-01'),
        costPrice: 100,
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
// Tests: recordWaste() - Strict Mode
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - strict mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('blocks waste recording when trying to dispose more than exists', () => {
    const collections = createMockCollections()

    // Setup: Only 5 units available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
    })

    // Execute: Try to dispose 10 units (more than exists)
    expect(() => {
      WasteEngine.recordWaste(
        {
          variantId: 'variant-1',
          quantity: 10, // Try to dispose 10, but only 5 exist
          unitId: 'unit-pcs',
          reason: 'Spoiled',
          notes: 'Test',
          ctx: { ...mockContext, businessId: 'business-strict' },
        },
        collections.inventoryCollection as any,
        collections.movementCollection as any,
      )
    }).toThrow('Insufficient finished goods to waste')

    // Assert: Inventory not changed
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(5) // Unchanged

    // Assert: No movements created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(0)
  })

  it('allows waste recording when quantity does not exceed available', () => {
    const collections = createMockCollections()

    // Setup: 10 units available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
    })

    // Execute: Dispose 5 units (less than available)
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 5,
        unitId: 'unit-pcs',
        reason: 'Past Shelf Life',
        notes: 'Expired yesterday',
        ctx: { ...mockContext, businessId: 'business-strict' },
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Waste recorded successfully
    expect(result.success).toBe(true)
    expect(result.wastedBatches.length).toBe(1)
    expect(result.wastedBatches[0].quantity).toBe(5)

    // Assert: Inventory deducted
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(5) // 10 - 5 = 5 remaining

    // Assert: WASTE movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
    const movement = movements[0] as any
    expect(movement.type).toBe(MovementType.WASTE)
    expect(movement.quantity).toBe(5)
    expect(movement.reason).toContain('Past Shelf Life')
    expect(movement.reason).toContain('Expired yesterday')
  })
})

// ---------------------------------------------------------------------------
// Tests: recordWaste() - Relaxed Mode
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - relaxed mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('relaxed')
  })

  it('allows waste recording even when inventory is already negative (reconciliation)', () => {
    const collections = createMockCollections()

    // Setup: Inventory is already negative (sold more than prepared)
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: -5, // Already negative from overselling
    })

    // Execute: Dispose 3 more units (reconciliation scenario)
    // Use case: Physical count shows 0, recorded shows -5, dispose 3 to adjust
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 3,
        unitId: 'unit-pcs',
        reason: 'Reconciliation',
        notes: 'Physical count adjustment',
        ctx: { ...mockContext, businessId: 'business-relaxed' },
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Waste recorded successfully (relaxed allows)
    expect(result.success).toBe(true)
    expect(result.wastedBatches.length).toBe(1)

    // Assert: Inventory becomes more negative
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-8) // -5 - 3 = -8

    // Assert: Movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
    const movement = movements[0] as any
    expect(movement.type).toBe(MovementType.WASTE)
    expect(movement.reason).toContain('Reconciliation')
  })

  it('allows disposing more than available (goes negative)', () => {
    const collections = createMockCollections()

    // Setup: 5 units available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
    })

    // Execute: Dispose 10 units (more than available)
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 10,
        unitId: 'unit-pcs',
        reason: 'Spoiled',
        ctx: { ...mockContext, businessId: 'business-relaxed' },
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Successful (relaxed allows negative)
    expect(result.success).toBe(true)

    // Assert: Inventory goes negative
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-5) // 5 - 10 = -5

    // Assert: Movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: recordWaste() - None Mode
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - none mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('none')
  })

  it('allows waste recording without validation (no tracking)', () => {
    const collections = createMockCollections()

    // Setup: Only 2 units available
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 2,
    })

    // Execute: Dispose 100 units (way more than available, but none mode skips validation)
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 100,
        unitId: 'unit-pcs',
        reason: 'Damaged',
        ctx: { ...mockContext, businessId: 'business-none' },
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Successful (none mode skips all validation)
    expect(result.success).toBe(true)

    // Assert: Inventory goes very negative (validation skipped)
    const fg = collections.inventoryCollection.get('fg-1')
    expect(fg.quantity).toBe(-98) // 2 - 100 = -98

    // Assert: Movement created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: recordWaste() - FIFO Behavior
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - FIFO', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('disposes oldest batches first (FIFO)', () => {
    const collections = createMockCollections()

    // Setup: Three batches with different ages
    collections.setupFinishedGoods('fg-old', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      producedAt: new Date('2024-01-01'), // Oldest
    })

    collections.setupFinishedGoods('fg-middle', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      producedAt: new Date('2024-01-15'), // Middle
    })

    collections.setupFinishedGoods('fg-new', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      producedAt: new Date('2024-01-30'), // Newest
    })

    // Execute: Dispose 7 units (should dispose from oldest first)
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 7,
        unitId: 'unit-pcs',
        reason: 'Expired',
        ctx: mockContext,
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Disposed from 2 batches (oldest first)
    expect(result.wastedBatches.length).toBe(2)
    expect(result.wastedBatches[0].inventoryId).toBe('fg-old') // 5 from oldest
    expect(result.wastedBatches[0].quantity).toBe(5)
    expect(result.wastedBatches[1].inventoryId).toBe('fg-middle') // 2 from middle
    expect(result.wastedBatches[1].quantity).toBe(2)

    // Assert: Oldest batch fully disposed
    const fgOld = collections.inventoryCollection.get('fg-old')
    expect(fgOld.quantity).toBe(0) // 5 - 5 = 0

    // Assert: Middle batch partially disposed
    const fgMiddle = collections.inventoryCollection.get('fg-middle')
    expect(fgMiddle.quantity).toBe(3) // 5 - 2 = 3

    // Assert: Newest batch untouched
    const fgNew = collections.inventoryCollection.get('fg-new')
    expect(fgNew.quantity).toBe(5) // Unchanged

    // Assert: Two movements created
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Tests: recordWaste() - Specific Inventory IDs
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - specific batches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('disposes from specific batches when inventoryIds provided', () => {
    const collections = createMockCollections()

    // Setup: Three batches
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      producedAt: new Date('2024-01-01'),
    })

    collections.setupFinishedGoods('fg-2', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      producedAt: new Date('2024-01-02'),
    })

    collections.setupFinishedGoods('fg-3', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      producedAt: new Date('2024-01-03'),
    })

    // Execute: Dispose from specific batch (fg-2 only)
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 5,
        unitId: 'unit-pcs',
        reason: 'Damaged in storage',
        inventoryIds: ['fg-2'], // Target specific batch
        ctx: mockContext,
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Only targeted batch affected
    expect(result.wastedBatches.length).toBe(1)
    expect(result.wastedBatches[0].inventoryId).toBe('fg-2')

    // Assert: fg-1 untouched
    const fg1 = collections.inventoryCollection.get('fg-1')
    expect(fg1.quantity).toBe(10)

    // Assert: fg-2 deducted
    const fg2 = collections.inventoryCollection.get('fg-2')
    expect(fg2.quantity).toBe(5) // 10 - 5 = 5

    // Assert: fg-3 untouched
    const fg3 = collections.inventoryCollection.get('fg-3')
    expect(fg3.quantity).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Tests: recordWaste() - Cost Tracking
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - cost tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('calculates total waste cost correctly', () => {
    const collections = createMockCollections()

    // Setup: Batch with costPrice = 150
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
      costPrice: 150, // Cost per unit
    })

    // Execute: Dispose 5 units
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 5,
        unitId: 'unit-pcs',
        reason: 'Spoiled',
        ctx: mockContext,
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Cost calculated correctly
    expect(result.wastedBatches[0].cost).toBe(750) // 5 units × 150 = 750
  })

  it('aggregates cost across multiple batches', () => {
    const collections = createMockCollections()

    // Setup: Two batches with different costs
    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 100,
      producedAt: new Date('2024-01-01'),
    })

    collections.setupFinishedGoods('fg-2', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 5,
      costPrice: 200,
      producedAt: new Date('2024-01-02'),
    })

    // Execute: Dispose 7 units (5 from first batch @ 100, 2 from second @ 200)
    const result = WasteEngine.recordWaste(
      {
        variantId: 'variant-1',
        quantity: 7,
        unitId: 'unit-pcs',
        reason: 'Expired',
        ctx: mockContext,
      },
      collections.inventoryCollection as any,
      collections.movementCollection as any,
    )

    // Assert: Costs calculated per batch
    expect(result.wastedBatches[0].cost).toBe(500) // 5 × 100
    expect(result.wastedBatches[1].cost).toBe(400) // 2 × 200
  })
})

// ---------------------------------------------------------------------------
// Tests: recordWaste() - Validation
// ---------------------------------------------------------------------------

describe('WasteEngine.recordWaste - validation', () => {
  it('throws error when quantity is zero', () => {
    const collections = createMockCollections()

    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
    })

    expect(() => {
      WasteEngine.recordWaste(
        {
          variantId: 'variant-1',
          quantity: 0, // Invalid
          unitId: 'unit-pcs',
          reason: 'Test',
          ctx: mockContext,
        },
        collections.inventoryCollection as any,
        collections.movementCollection as any,
      )
    }).toThrow('Waste quantity must be greater than 0')
  })

  it('throws error when quantity is negative', () => {
    const collections = createMockCollections()

    collections.setupFinishedGoods('fg-1', {
      variantId: 'variant-1',
      branchId: 'branch-1',
      quantity: 10,
    })

    expect(() => {
      WasteEngine.recordWaste(
        {
          variantId: 'variant-1',
          quantity: -5, // Invalid
          unitId: 'unit-pcs',
          reason: 'Test',
          ctx: mockContext,
        },
        collections.inventoryCollection as any,
        collections.movementCollection as any,
      )
    }).toThrow('Waste quantity must be greater than 0')
  })
})
