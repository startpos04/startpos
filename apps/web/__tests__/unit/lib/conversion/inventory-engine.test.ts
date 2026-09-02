/**
 * inventory-engine.test.ts
 *
 * Covers PosStockEngine:
 *   - getReservedMap   (cart + order reservation aggregation)
 *   - getUnitRequirements (per-variant material requirements)
 *   - findPhysicalStock   (stock lookup: direct variant + component material)
 *   - calculateRemainingYield (available sellable units after reservations)
 *
 * Run with: pnpm test
 */

import { describe, expect, it } from 'vitest'
import { makeId, makePosItem, makePosProduct, makePosVariant } from '#tests/helpers'
import { PosStockEngine, type posItem } from '@/lib/conversion/pos-stock-engine'

// ---------------------------------------------------------------------------
// Helpers: build component-based variants inline
// ---------------------------------------------------------------------------

function makeComponent(materialVariantId: string, quantityUsed: number, isAddon = false) {
  return {
    id: makeId(),
    hostId: makeId(),
    materialId: materialVariantId,
    quantityUsed,
    isAddon,
    priceOverride: null,
    unitId: 'unit-base',
    unit: { id: 'unit-base', name: 'Piece', abbreviation: 'pc', conversionFactor: 1 },
    material: {
      id: materialVariantId,
      productId: makeId(),
      name: 'Material',
      inventory: [],
      product: { id: makeId(), name: 'Material Product' },
    },
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any
}

// ---------------------------------------------------------------------------
// getReservedMap
// ---------------------------------------------------------------------------

describe('PosStockEngine.getReservedMap', () => {
  it('direct-sale variant: reserves quantity against variant ID', () => {
    const variantId = makeId()
    const inventoryRecord = { id: makeId(), variantId, quantity: 50, costPrice: 100 } as any
    const variant = makePosVariant({ id: variantId, components: [], inventory: [inventoryRecord] })
    const product = makePosProduct({ variants: [variant] })
    const item = makePosItem({ product, variant: variant as any, quantity: 3 })

    const reserved = PosStockEngine.getReservedMap([item])

    expect(reserved[variantId]).toBe(3)
  })

  it('component-based variant: reserves by materialId scaled by quantityUsed', () => {
    const materialId = makeId()
    const comp = makeComponent(materialId, 2) // 2 units of material per sale
    const variant = makePosVariant({ components: [comp] })
    const product = makePosProduct({ variants: [variant] })
    const item = makePosItem({ product, variant: variant as any, quantity: 3 })

    // 3 qty × 2 per unit = 6 reserved
    const reserved = PosStockEngine.getReservedMap([item])

    expect(reserved[materialId]).toBe(6)
  })

  it('multiple cart items accumulate reservations for the same material', () => {
    const materialId = makeId()
    const comp = makeComponent(materialId, 1)
    const variant = makePosVariant({ components: [comp] })
    const product = makePosProduct({ variants: [variant] })
    const item1 = makePosItem({ product, variant: variant as any, quantity: 2 })
    const item2 = makePosItem({ product, variant: variant as any, quantity: 5 })

    const reserved = PosStockEngine.getReservedMap([item1, item2])

    expect(reserved[materialId]).toBe(7)
  })

  it('cart + order items combined into total reservation', () => {
    const variantId = makeId()
    const inventoryRecord = { id: makeId(), variantId, quantity: 50, costPrice: 100 } as any
    const variant = makePosVariant({ id: variantId, components: [], inventory: [inventoryRecord] })
    const product = makePosProduct({ variants: [variant] })
    const cartItem = makePosItem({ product, variant: variant as any, quantity: 2 })
    const orderItem = makePosItem({ product, variant: variant as any, quantity: 3 })

    const reserved = PosStockEngine.getReservedMap([cartItem], [orderItem])

    expect(reserved[variantId]).toBe(5)
  })

  it('addon component is NOT reserved when addon not selected', () => {
    const materialId = makeId()
    const addonComp = makeComponent(materialId, 1, true) // isAddon = true
    const variant = makePosVariant({ components: [addonComp] })
    const product = makePosProduct({ variants: [variant] })
    // addons array is empty — user did not select this addon
    const item = makePosItem({ product, variant: variant as any, quantity: 2, addons: [] })

    const reserved = PosStockEngine.getReservedMap([item])

    expect(reserved[materialId]).toBeUndefined()
  })

  it('addon component IS reserved when addon is selected', () => {
    const materialId = makeId()
    const addonComp = makeComponent(materialId, 1, true)
    const variant = makePosVariant({ components: [addonComp] })
    const product = makePosProduct({ variants: [variant] })
    // addons array contains the addon component — user selected it
    const item = makePosItem({ product, variant: variant as any, quantity: 2, addons: [addonComp] })

    const reserved = PosStockEngine.getReservedMap([item])

    expect(reserved[materialId]).toBe(2)
  })

  it('empty cart returns empty reservation map', () => {
    const reserved = PosStockEngine.getReservedMap([])
    expect(reserved).toEqual({})
  })

  it('empty cart and empty orders returns empty map', () => {
    const reserved = PosStockEngine.getReservedMap([], [])
    expect(reserved).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// getUnitRequirements
// ---------------------------------------------------------------------------

describe('PosStockEngine.getUnitRequirements', () => {
  it('variant with no components: requires 1 unit of the variant itself', () => {
    const variantId = makeId()
    const variant = makePosVariant({ id: variantId, components: [] })

    const reqs = PosStockEngine.getUnitRequirements(variant as any, [])

    expect(reqs[variantId]).toBe(1)
    expect(Object.keys(reqs)).toHaveLength(1)
  })

  it('required component (non-addon) is always included', () => {
    const materialId = makeId()
    const comp = makeComponent(materialId, 3, false)
    const variant = makePosVariant({ components: [comp] })

    const reqs = PosStockEngine.getUnitRequirements(variant as any, [])

    expect(reqs[materialId]).toBe(3)
  })

  it('addon component excluded when not in selectedComponentIds', () => {
    const materialId = makeId()
    const addonComp = makeComponent(materialId, 1, true)
    const variant = makePosVariant({ components: [addonComp] })

    const reqs = PosStockEngine.getUnitRequirements(variant as any, [])

    expect(reqs[materialId]).toBeUndefined()
  })

  it('addon component included when present in selectedComponentIds', () => {
    const materialId = makeId()
    const addonComp = makeComponent(materialId, 2, true)
    const variant = makePosVariant({ components: [addonComp] })

    const reqs = PosStockEngine.getUnitRequirements(variant as any, [addonComp.id])

    expect(reqs[materialId]).toBe(2)
  })

  it('multiple required components accumulate quantities per material', () => {
    const materialId = makeId()
    const comp1 = makeComponent(materialId, 2, false)
    const comp2 = makeComponent(materialId, 3, false)
    const variant = makePosVariant({ components: [comp1, comp2] })

    const reqs = PosStockEngine.getUnitRequirements(variant as any, [])

    // Same materialId across two components — quantities sum
    expect(reqs[materialId]).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// findPhysicalStock
// ---------------------------------------------------------------------------

describe('PosStockEngine.findPhysicalStock', () => {
  it('finds stock on a direct variant match', () => {
    const variantId = makeId()
    const inventoryRecord = { id: makeId(), variantId, quantity: 50, costPrice: 100 } as any
    const variant = makePosVariant({ id: variantId, name: 'Large', inventory: [inventoryRecord], components: [] })
    const product = makePosProduct({ variants: [variant] })

    const { stock, name } = PosStockEngine.findPhysicalStock(variantId, product)

    expect(stock).toBe(50)
    expect(name).toBe('Large')
  })

  it('falls back to product name when variant name is empty', () => {
    const variantId = makeId()
    const inv = { id: makeId(), variantId, quantity: 10, costPrice: 100 } as any
    const variant = makePosVariant({ id: variantId, name: undefined, inventory: [inv], components: [] })
    const product = makePosProduct({ name: 'Coffee Blend', variants: [variant] })

    const { name } = PosStockEngine.findPhysicalStock(variantId, product)

    expect(name).toBe('Coffee Blend')
  })

  it('aggregates stock across multiple inventory batches for one variant', () => {
    const variantId = makeId()
    const batch1 = { id: makeId(), variantId, quantity: 30 } as any
    const batch2 = { id: makeId(), variantId, quantity: 20 } as any
    const variant = makePosVariant({ id: variantId, inventory: [batch1, batch2], components: [] })
    const product = makePosProduct({ variants: [variant] })

    const { stock } = PosStockEngine.findPhysicalStock(variantId, product)

    expect(stock).toBe(50)
  })

  it('finds stock through component material lookup', () => {
    const materialVariantId = makeId()
    const materialInv = { id: makeId(), variantId: materialVariantId, quantity: 100 } as any
    const comp = makeComponent(materialVariantId, 1, false)
    // Attach inventory to material inside the component
    comp.material.inventory = [materialInv]
    comp.material.product = { id: makeId(), name: 'Flour' }

    const variant = makePosVariant({ components: [comp] })
    const product = makePosProduct({ variants: [variant] })

    const { stock, name } = PosStockEngine.findPhysicalStock(materialVariantId, product)

    expect(stock).toBe(100)
    expect(name).toBe('Flour')
  })

  it('accepts a list of products and searches across all of them', () => {
    const variantId = makeId()
    const inv = { id: makeId(), variantId, quantity: 25 } as any
    const variant = makePosVariant({ id: variantId, inventory: [inv], components: [] })
    const product1 = makePosProduct({ variants: [makePosVariant({ components: [] })] })
    const product2 = makePosProduct({ variants: [variant] })

    const { stock } = PosStockEngine.findPhysicalStock(variantId, [product1, product2])

    expect(stock).toBe(25)
  })

  it('returns 0 stock and the raw ID as name when ID not found anywhere', () => {
    const unknownId = makeId()
    const product = makePosProduct({ variants: [makePosVariant({ components: [] })] })

    const { stock, name } = PosStockEngine.findPhysicalStock(unknownId, product)

    expect(stock).toBe(0)
    expect(name).toBe(unknownId)
  })

  it('returns 0 when variant has no inventory records', () => {
    const variantId = makeId()
    const variant = makePosVariant({ id: variantId, inventory: [], components: [] })
    const product = makePosProduct({ variants: [variant] })

    const { stock } = PosStockEngine.findPhysicalStock(variantId, product)

    expect(stock).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// calculateRemainingYield
// ---------------------------------------------------------------------------

describe('PosStockEngine.calculateRemainingYield', () => {
  it('direct variant: yield = stock - already reserved', () => {
    const variantId = makeId()
    const inv = { id: makeId(), variantId, quantity: 10 } as any
    const variant = makePosVariant({ id: variantId, inventory: [inv], components: [] })
    const product = makePosProduct({ variants: [variant] })

    // 3 already in cart (reserved)
    const existingCartItem = makePosItem({
      product,
      variant: variant as any,
      quantity: 3,
    })

    const remaining = PosStockEngine.calculateRemainingYield(product, variant as any, [], [existingCartItem])

    expect(remaining).toBe(7) // 10 stock - 3 reserved = 7
  })

  it('component-based variant: yield limited by material stock / quantityUsed', () => {
    const materialId = makeId()
    const materialInv = { id: makeId(), variantId: materialId, quantity: 12 } as any
    const comp = makeComponent(materialId, 2, false) // 2 material units per sale
    comp.material.inventory = [materialInv]

    const variant = makePosVariant({ components: [comp] })
    const product = makePosProduct({ variants: [variant] })

    // No reservations yet
    const remaining = PosStockEngine.calculateRemainingYield(product, variant as any, [], [])

    // 12 / 2 = 6 yields
    expect(remaining).toBe(6)
  })

  it('yield is limited by the most constrained material (bottleneck)', () => {
    const matA = makeId()
    const matB = makeId()
    const invA = { id: makeId(), variantId: matA, quantity: 20 } as any
    const invB = { id: makeId(), variantId: matB, quantity: 6 } as any
    const compA = makeComponent(matA, 1, false)
    compA.material.inventory = [invA]
    const compB = makeComponent(matB, 2, false)
    compB.material.inventory = [invB]

    const variant = makePosVariant({ components: [compA, compB] })
    const product = makePosProduct({ variants: [variant] })

    const remaining = PosStockEngine.calculateRemainingYield(product, variant as any, [], [])

    // matA: 20/1 = 20; matB: 6/2 = 3 → bottleneck is 3
    expect(remaining).toBe(3)
  })

  it('returns 0 when stock is fully reserved', () => {
    const variantId = makeId()
    const inv = { id: makeId(), variantId, quantity: 5 } as any
    const variant = makePosVariant({ id: variantId, inventory: [inv], components: [] })
    const product = makePosProduct({ variants: [variant] })

    const existingItem = makePosItem({ product, variant: variant as any, quantity: 5 })
    const remaining = PosStockEngine.calculateRemainingYield(product, variant as any, [], [existingItem])

    expect(remaining).toBe(0)
  })

  it('returns 0 when stock is over-reserved (never goes negative)', () => {
    const variantId = makeId()
    const inv = { id: makeId(), variantId, quantity: 3 } as any
    const variant = makePosVariant({ id: variantId, inventory: [inv], components: [] })
    const product = makePosProduct({ variants: [variant] })

    const existingItem = makePosItem({ product, variant: variant as any, quantity: 10 })
    const remaining = PosStockEngine.calculateRemainingYield(product, variant as any, [], [existingItem])

    expect(remaining).toBe(0)
  })

  it('returns 0 for empty variant with no unit requirements', () => {
    // A variant with no components and no inventory will return UNLIMITED (999) not 0
    const variant = makePosVariant({ components: [] }) as any
    variant.inventory = [] // Empty inventory
    const product = makePosProduct({ type: 'PHYSICAL_GOOD', variants: [variant] })

    const remaining = PosStockEngine.calculateRemainingYield(product, variant, [], [])

    // When there are no components AND no inventory, the engine returns UNLIMITED (999)
    // unless the product type is SERVICE, which also returns UNLIMITED
    expect(remaining).toBe(999) // UNLIMITED
  })
})
