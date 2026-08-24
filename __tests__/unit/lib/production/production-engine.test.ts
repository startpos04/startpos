/**
 * production-engine.test.ts — Unit tests for ProductionEngine with inventory modes
 * 
 * Tests production engine behavior across three inventory modes:
 * - none: No validation, production always proceeds
 * - relaxed: Allows production even if materials go negative
 * - strict: Blocks production if insufficient materials
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ProductionEngine } from '@/lib/production/production-engine'
import { InventoryType, MovementType, ProductionStatus } from 'prisma/generated/prisma/enums'
import type { TenantContext } from '@/lib/production/production-engine'

// Mock getInventoryMode to control inventory mode in tests
vi.mock('@/lib/inventory', () => ({
  getInventoryMode: vi.fn((businessId: string) => {
    // Default to strict, tests can override
    return 'strict'
  }),
  InventoryPolicy: {
    validateProductionConsumption: vi.fn((materialId, available, required, mode, name) => {
      if (mode === 'none' || mode === 'relaxed') {
        return // Allow
      }
      // Strict mode
      if (available < required) {
        throw new Error(`Insufficient stock for ${name || materialId}`)
      }
    }),
  },
}))

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createMockCollections() {
  const productionOrderMap = new Map()
  const productionOrderItemMap = new Map()
  const productVariantMap = new Map()
  const inventoryMap = new Map()
  const movementMap = new Map()

  const productionOrderCollection = {
    get: (id: string) => productionOrderMap.get(id),
    insert: (order: any) => productionOrderMap.set(order.id, order),
    update: (id: string, updater: (draft: any) => void) => {
      const item = productionOrderMap.get(id)
      if (item) {
        updater(item)
        productionOrderMap.set(id, item)
      }
    },
    values: () => productionOrderMap.values(),
  }

  const productionOrderItemCollection = {
    insert: (item: any) => productionOrderItemMap.set(item.id, item),
    values: () => productionOrderItemMap.values(),
  }

  const productVariantCollection = {
    get: (id: string) => productVariantMap.get(id),
    values: () => productVariantMap.values(),
  }

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
    productionOrderCollection,
    productionOrderItemCollection,
    productVariantCollection,
    inventoryCollection,
    movementCollection,
    // Helper to setup data
    setupVariant: (id: string, data: any) => {
      productVariantMap.set(id, { id, ...data })
    },
    setupInventory: (id: string, data: any) => {
      inventoryMap.set(id, { id, ...data })
    },
    setupProductionOrder: (id: string, data: any) => {
      productionOrderMap.set(id, { id, ...data })
    },
  }
}

const mockContext: TenantContext = {
  userId: 'user-1',
  branchId: 'branch-1',
  businessId: 'business-strict', // Will be changed per test
}

// ---------------------------------------------------------------------------
// Tests: startProduction() - Strict Mode
// ---------------------------------------------------------------------------

describe('ProductionEngine.startProduction - strict mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('strict')
  })

  it('blocks production when raw materials insufficient', () => {
    const collections = createMockCollections()

    // Setup: Variant with recipe requiring 10 kg flour
    collections.setupVariant('variant-bread', {
      name: 'Bread',
      components: [
        {
          materialId: 'variant-flour',
          quantityUsed: 10,
          unitId: 'unit-kg',
          isAddon: false,
        },
      ],
    })

    // Setup: Material (flour) with only 5 kg available
    collections.setupVariant('variant-flour', {
      name: 'Flour',
    })

    collections.setupInventory('inv-flour-1', {
      variantId: 'variant-flour',
      branchId: 'branch-1',
      inventoryType: InventoryType.RAW_MATERIAL,
      quantity: 5, // Only 5 kg available, need 10 kg
      costPrice: 100,
      unitId: 'unit-kg',
      createdAt: new Date('2024-01-01'),
    })

    // Setup: Production order in DRAFT status
    collections.setupProductionOrder('order-1', {
      orderNumber: 'PROD-001',
      status: ProductionStatus.DRAFT,
      targetVariantId: 'variant-bread',
      targetQuantity: 1,
      targetUnitId: 'unit-kg',
      usesRecipe: true,
      businessId: 'business-strict',
      branchId: 'branch-1',
    })

    // Execute: Try to start production
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      productionOrderCollection: collections.productionOrderCollection as any,
      productionOrderItemCollection: collections.productionOrderItemCollection as any,
      productVariantCollection: collections.productVariantCollection as any,
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-strict' },
    })

    // Assert: Should fail with insufficient stock error
    expect(result.isErr()).toBe(true)
    expect(result.error).toContain('Insufficient')

    // Assert: Inventory not deducted
    const flour = collections.inventoryCollection.get('inv-flour-1')
    expect(flour.quantity).toBe(5) // Unchanged

    // Assert: Production order status unchanged
    const order = collections.productionOrderCollection.get('order-1')
    expect(order.status).toBe(ProductionStatus.DRAFT)
  })

  it('allows production when raw materials sufficient', () => {
    const collections = createMockCollections()

    // Setup: Variant with recipe requiring 10 kg flour
    collections.setupVariant('variant-bread', {
      name: 'Bread',
      components: [
        {
          materialId: 'variant-flour',
          quantityUsed: 10,
          unitId: 'unit-kg',
          isAddon: false,
        },
      ],
    })

    collections.setupVariant('variant-flour', {
      name: 'Flour',
    })

    collections.setupInventory('inv-flour-1', {
      variantId: 'variant-flour',
      branchId: 'branch-1',
      inventoryType: InventoryType.RAW_MATERIAL,
      quantity: 20, // 20 kg available, need 10 kg ✓
      costPrice: 100,
      unitId: 'unit-kg',
      createdAt: new Date('2024-01-01'),
    })

    collections.setupProductionOrder('order-1', {
      orderNumber: 'PROD-001',
      status: ProductionStatus.DRAFT,
      targetVariantId: 'variant-bread',
      targetQuantity: 1,
      targetUnitId: 'unit-kg',
      usesRecipe: true,
      businessId: 'business-strict',
      branchId: 'branch-1',
    })

    // Execute: Start production
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      productionOrderCollection: collections.productionOrderCollection as any,
      productionOrderItemCollection: collections.productionOrderItemCollection as any,
      productVariantCollection: collections.productVariantCollection as any,
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-strict' },
    })

    // Assert: Should succeed
    expect(result.isOk()).toBe(true)

    // Assert: Flour deducted
    const flour = collections.inventoryCollection.get('inv-flour-1')
    expect(flour.quantity).toBe(10) // 20 - 10 = 10 remaining

    // Assert: Production order status updated
    const order = collections.productionOrderCollection.get('order-1')
    expect(order.status).toBe(ProductionStatus.IN_PROGRESS)
    expect(order.startedAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests: startProduction() - Relaxed Mode
// ---------------------------------------------------------------------------

describe('ProductionEngine.startProduction - relaxed mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('relaxed')
  })

  it('allows production when raw materials insufficient (can go negative)', () => {
    const collections = createMockCollections()

    // Setup: Variant requiring 10 kg flour
    collections.setupVariant('variant-bread', {
      name: 'Bread',
      components: [
        {
          materialId: 'variant-flour',
          quantityUsed: 10,
          unitId: 'unit-kg',
          isAddon: false,
        },
      ],
    })

    collections.setupVariant('variant-flour', {
      name: 'Flour',
    })

    collections.setupInventory('inv-flour-1', {
      variantId: 'variant-flour',
      branchId: 'branch-1',
      inventoryType: InventoryType.RAW_MATERIAL,
      quantity: 5, // Only 5 kg available, need 10 kg
      costPrice: 100,
      unitId: 'unit-kg',
      createdAt: new Date('2024-01-01'),
    })

    collections.setupProductionOrder('order-1', {
      orderNumber: 'PROD-001',
      status: ProductionStatus.DRAFT,
      targetVariantId: 'variant-bread',
      targetQuantity: 1,
      targetUnitId: 'unit-kg',
      usesRecipe: true,
      businessId: 'business-relaxed',
      branchId: 'branch-1',
    })

    // Execute: Start production (should succeed in relaxed mode)
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      productionOrderCollection: collections.productionOrderCollection as any,
      productionOrderItemCollection: collections.productionOrderItemCollection as any,
      productVariantCollection: collections.productVariantCollection as any,
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-relaxed' },
    })

    // Assert: Should succeed (relaxed mode allows negative)
    expect(result.isOk()).toBe(true)

    // Assert: Flour goes negative
    const flour = collections.inventoryCollection.get('inv-flour-1')
    expect(flour.quantity).toBe(-5) // 5 - 10 = -5 (negative allowed in relaxed mode)

    // Assert: Production order status updated
    const order = collections.productionOrderCollection.get('order-1')
    expect(order.status).toBe(ProductionStatus.IN_PROGRESS)

    // Assert: PRODUCTION_OUT movement created
    const movements = Array.from(collections.movementCollection.values())
    const prodOutMovement = movements.find((m: any) => m.type === MovementType.PRODUCTION_OUT)
    expect(prodOutMovement).toBeTruthy()
    expect(prodOutMovement.quantity).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Tests: startProduction() - None Mode
// ---------------------------------------------------------------------------

describe('ProductionEngine.startProduction - none mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getInventoryMode } = require('@/lib/inventory')
    getInventoryMode.mockReturnValue('none')
  })

  it('allows production without any validation (no tracking)', () => {
    const collections = createMockCollections()

    // Setup: Variant with recipe
    collections.setupVariant('variant-bread', {
      name: 'Bread',
      components: [
        {
          materialId: 'variant-flour',
          quantityUsed: 100, // Requires 100 kg
          unitId: 'unit-kg',
          isAddon: false,
        },
      ],
    })

    collections.setupVariant('variant-flour', {
      name: 'Flour',
    })

    collections.setupInventory('inv-flour-1', {
      variantId: 'variant-flour',
      branchId: 'branch-1',
      inventoryType: InventoryType.RAW_MATERIAL,
      quantity: 1, // Only 1 kg available, need 100 kg
      costPrice: 100,
      unitId: 'unit-kg',
      createdAt: new Date('2024-01-01'),
    })

    collections.setupProductionOrder('order-1', {
      orderNumber: 'PROD-001',
      status: ProductionStatus.DRAFT,
      targetVariantId: 'variant-bread',
      targetQuantity: 1,
      targetUnitId: 'unit-kg',
      usesRecipe: true,
      businessId: 'business-none',
      branchId: 'branch-1',
    })

    // Execute: Start production (none mode skips validation)
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      productionOrderCollection: collections.productionOrderCollection as any,
      productionOrderItemCollection: collections.productionOrderItemCollection as any,
      productVariantCollection: collections.productVariantCollection as any,
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: { ...mockContext, businessId: 'business-none' },
    })

    // Assert: Should succeed (none mode skips all validation)
    expect(result.isOk()).toBe(true)

    // Assert: Flour goes very negative (validation skipped)
    const flour = collections.inventoryCollection.get('inv-flour-1')
    expect(flour.quantity).toBe(-99) // 1 - 100 = -99

    // Assert: Production order updated
    const order = collections.productionOrderCollection.get('order-1')
    expect(order.status).toBe(ProductionStatus.IN_PROGRESS)
  })
})

// ---------------------------------------------------------------------------
// Tests: startProduction() - Recipe-Free Production
// ---------------------------------------------------------------------------

describe('ProductionEngine.startProduction - recipe-free', () => {
  it('succeeds without consuming materials (all modes)', () => {
    const collections = createMockCollections()

    // Setup: Variant WITHOUT recipe
    collections.setupVariant('variant-bread', {
      name: 'Bread',
      components: [], // No recipe
    })

    collections.setupProductionOrder('order-1', {
      orderNumber: 'PROD-001',
      status: ProductionStatus.DRAFT,
      targetVariantId: 'variant-bread',
      targetQuantity: 10,
      targetUnitId: 'unit-kg',
      usesRecipe: false, // Recipe-free
      businessId: 'business-strict',
      branchId: 'branch-1',
    })

    // Execute: Start production (no materials to validate)
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      productionOrderCollection: collections.productionOrderCollection as any,
      productionOrderItemCollection: collections.productionOrderItemCollection as any,
      productVariantCollection: collections.productVariantCollection as any,
      inventoryCollection: collections.inventoryCollection as any,
      movementCollection: collections.movementCollection as any,
      ctx: mockContext,
    })

    // Assert: Should succeed (no materials to validate)
    expect(result.isOk()).toBe(true)

    // Assert: No inventory movements (recipe-free)
    const movements = Array.from(collections.movementCollection.values())
    expect(movements.length).toBe(0)

    // Assert: Production order updated
    const order = collections.productionOrderCollection.get('order-1')
    expect(order.status).toBe(ProductionStatus.IN_PROGRESS)
    expect(order.totalCost).toBe(0) // No material cost
  })
})
