/**
 * phase1-snapshots.test.ts
 *
 * Unit tests for Phase 1: OrderItem Core Snapshots
 *
 * Tests that product/variant/category names are captured as snapshots
 * at the time of sale, and that historical data remains accurate even
 * when master data changes.
 *
 * Coverage:
 *  - OrderItem snapshot fields are populated on creation
 *  - OrderItemAddon snapshot fields are populated on creation
 *  - Snapshots preserve original names when products are renamed
 *  - Reports use snapshot fields with fallback to live data
 */

import { ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceType, TaxCategory } from 'prisma/generated/prisma/enums'
import { baseUnit, makeId, makePosProduct, makePosVariant, resetMockUser, seedMockUser } from '#tests/helpers'
import { createMockCollections } from '#tests/helpers/mock-collections'
import type { CreateSaleInput } from '@/lib/queries/create-pos-transaction'

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mocks = createMockCollections()

vi.mock('@/db/collections', () => mocks)

vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (callback: () => unknown) => {
    try {
      const result = callback()
      return ok(result)
    } catch (e) {
      const { err } = await import('neverthrow')
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }),
}))

vi.mock('@/lib/queries/fetch-structured-id', () => ({
  fetchStructuredId: vi.fn((type: string) => `${type}-000001`),
}))

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Phase 1: OrderItem Snapshots', () => {
  beforeEach(() => {
    mocks.orderCollection._clear()
    mocks.orderItemCollection._clear()
    mocks.orderItemAddonCollection._clear()
    seedMockUser()
  })

  afterEach(() => {
    resetMockUser()
    vi.clearAllMocks()
  })

  describe('OrderItem snapshot capture', () => {
    it('should capture product name snapshot when creating OrderItem', async () => {
      const { createPosOrder } = await import('@/lib/queries/create-pos-order')

      const variant = makePosVariant({
        name: 'Large',
        sku: 'FC-LARGE-001',
        image: '/images/chicken.jpg',
        price: 15000,
        costPrice: 8000,
        taxCategory: TaxCategory.STANDARD,
      })

      const product = makePosProduct({
        name: 'Fried Chicken',
        type: ResourceType.PHYSICAL_GOOD,
        variants: [variant as any],
        baseUnit,
        baseUnitId: baseUnit.id,
        category: {
          id: 'cat-001',
          name: 'Main Dishes',
          businessId: 'biz-test-001',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      })

      const input: CreateSaleInput = {
        items: [
          {
            cartId: 'cart-1',
            product,
            variant: product.variants[0]!,
            quantity: 2,
            addons: [],
          } as any,
        ],
        payments: [],
        compliance: {},
        customer: { customerReference: null, customerId: 'cust-001' },
      }

      await createPosOrder(input, [product])

      const createdItems = [...mocks.orderItemCollection.values()]
      expect(createdItems).toHaveLength(1)

      const item = createdItems[0]!
      expect(item.snapshotProductName).toBe('Fried Chicken')
      expect(item.snapshotVariantName).toBe('Large')
      expect(item.snapshotCategoryName).toBe('Main Dishes')
      expect(item.snapshotSku).toBe('FC-LARGE-001')
      expect(item.snapshotProductType).toBe(ResourceType.PHYSICAL_GOOD)
      expect(item.snapshotProductImage).toBe('/images/chicken.jpg')
    })

    it('should use variant image over product image when both exist', async () => {
      const { createPosOrder } = await import('@/lib/queries/create-pos-order')

      const variant = makePosVariant({
        name: 'Large Latte',
        image: '/images/latte-large.jpg',
      })

      const product = makePosProduct({
        name: 'Coffee',
        image: '/images/coffee-generic.jpg',
        variants: [variant as any],
        baseUnit,
        baseUnitId: baseUnit.id,
      })

      const input: CreateSaleInput = {
        items: [{ cartId: 'cart-1', product, variant: product.variants[0]!, quantity: 1, addons: [] } as any],
        payments: [],
        compliance: {},
        customer: { customerReference: null, customerId: 'cust-001' },
      }

      await createPosOrder(input, [product])

      const item = [...mocks.orderItemCollection.values()][0]!
      expect(item.snapshotProductImage).toBe('/images/latte-large.jpg')
    })

    it('should fallback to product image when variant has no image', async () => {
      const { createPosOrder } = await import('@/lib/queries/create-pos-order')

      const variant = makePosVariant({
        name: 'Regular',
        image: null,
      })

      const product = makePosProduct({
        name: 'Burger',
        image: '/images/burger.jpg',
        variants: [variant as any],
        baseUnit,
        baseUnitId: baseUnit.id,
      })

      const input: CreateSaleInput = {
        items: [{ cartId: 'cart-1', product, variant: product.variants[0]!, quantity: 1, addons: [] } as any],
        payments: [],
        compliance: {},
        customer: { customerReference: null, customerId: 'cust-001' },
      }

      await createPosOrder(input, [product])

      const item = [...mocks.orderItemCollection.values()][0]!
      expect(item.snapshotProductImage).toBe('/images/burger.jpg')
    })
  })

  describe('OrderItemAddon snapshot capture', () => {
    it('should capture addon snapshots when creating OrderItemAddon', async () => {
      const { createPosOrder } = await import('@/lib/queries/create-pos-order')

      const addonVariant = makePosVariant({
        id: 'addon-variant-001',
        name: 'Large',
        sku: 'CHEESE-LARGE',
      })

      const variant = makePosVariant({
        components: [
          {
            id: 'comp-001',
            hostId: makeId(),
            materialId: 'addon-variant-001',
            quantityUsed: 1,
            isAddon: true,
            priceOverride: 5000,
            unitId: baseUnit.id,
            unit: baseUnit,
            material: {
              ...addonVariant,
              product: {
                id: 'addon-product-001',
                name: 'Extra Cheese',
              },
            },
          } as any,
        ],
      })

      const product = makePosProduct({
        name: 'Pizza',
        variants: [variant as any],
        baseUnit,
        baseUnitId: baseUnit.id,
      })

      const input: CreateSaleInput = {
        items: [
          {
            cartId: 'cart-1',
            product,
            variant: product.variants[0]!,
            quantity: 1,
            addons: [{ id: 'comp-001', quantityUsed: 1 }],
          } as any,
        ],
        payments: [],
        compliance: {},
        customer: { customerReference: null, customerId: 'cust-001' },
      }

      await createPosOrder(input, [product])

      const createdAddons = [...mocks.orderItemAddonCollection.values()]
      expect(createdAddons).toHaveLength(1)

      const addon = createdAddons[0]!
      expect(addon.snapshotAddonProductName).toBe('Extra Cheese')
      expect(addon.snapshotAddonVariantName).toBe('Large')
      expect(addon.snapshotAddonSku).toBe('CHEESE-LARGE')
    })
  })

  describe('Snapshot preservation', () => {
    it('should preserve snapshot even when product is renamed', async () => {
      const { createPosOrder } = await import('@/lib/queries/create-pos-order')

      // Create first order with original product name
      const variant1 = makePosVariant({
        id: 'var-001',
        name: 'Original Variant',
      })

      const product1 = makePosProduct({
        id: 'prod-001',
        name: 'Original Name',
        variants: [variant1 as any],
        baseUnit,
        baseUnitId: baseUnit.id,
      })

      const input1: CreateSaleInput = {
        items: [{ cartId: 'cart-1', product: product1, variant: product1.variants[0]!, quantity: 1, addons: [] } as any],
        payments: [],
        compliance: {},
        customer: { customerReference: null, customerId: 'cust-001' },
      }

      await createPosOrder(input1, [product1])

      // Create second order with renamed product
      const variant2 = makePosVariant({
        id: 'var-002',
        name: 'New Variant',
      })

      const product2 = makePosProduct({
        id: 'prod-002',
        name: 'New Name',
        variants: [variant2 as any],
        baseUnit,
        baseUnitId: baseUnit.id,
      })

      const input2: CreateSaleInput = {
        orderId: 'order-002', // Different order
        items: [{ cartId: 'cart-2', product: product2, variant: product2.variants[0]!, quantity: 1, addons: [] } as any],
        payments: [],
        compliance: {},
        customer: { customerReference: null, customerId: 'cust-001' },
      }

      await createPosOrder(input2, [product2])

      const items = [...mocks.orderItemCollection.values()]
      expect(items).toHaveLength(2)

      // First item still has original name
      expect(items[0]!.snapshotProductName).toBe('Original Name')
      expect(items[0]!.snapshotVariantName).toBe('Original Variant')

      // Second item has new name
      expect(items[1]!.snapshotProductName).toBe('New Name')
      expect(items[1]!.snapshotVariantName).toBe('New Variant')
    })
  })

  describe('Report integration', () => {
    it('should use snapshot fields in stats calculation', async () => {
      const { calculateStats } = await import('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-utils/calculate-stats')

      // Mock transaction with OrderItems that have snapshots
      const mockTransactions = [
        {
          id: 'tx-001',
          invoiceNo: 'INV-001',
          totalAmount: 10000,
          totalCost: 5000,
          cashierId: 'cashier-001',
          cashier: { name: 'John Doe' },
          createdAt: new Date(),
          orderItems: [
            {
              id: 'item-001',
              variantId: 'var-001',
              quantity: 2,
              unitPrice: 5000,
              snapshotProductName: 'Snapshot Product', // Should use this
              variant: {
                product: { name: 'Live Product Name' }, // Should NOT use this
              },
            },
          ],
        },
      ] as any

      const stats = calculateStats(mockTransactions)

      // Verify that the snapshot name is used
      expect(stats.topProducts).toHaveLength(1)
      expect(stats.topProducts[0]!.name).toBe('Snapshot Product')
    })

    it('should fallback to live data when snapshot is null', async () => {
      const { calculateStats } = await import('@/routes/(private)/(dashboard)/(supervisor)/sales-reports/-utils/calculate-stats')

      // Mock old transaction without snapshots
      const mockTransactions = [
        {
          id: 'tx-001',
          invoiceNo: 'INV-001',
          totalAmount: 10000,
          totalCost: 5000,
          cashierId: 'cashier-001',
          cashier: { name: 'John Doe' },
          createdAt: new Date(),
          orderItems: [
            {
              id: 'item-001',
              variantId: 'var-001',
              quantity: 2,
              unitPrice: 5000,
              snapshotProductName: null, // No snapshot
              variant: {
                product: { name: 'Live Product Name' }, // Should use this as fallback
              },
            },
          ],
        },
      ] as any

      const stats = calculateStats(mockTransactions)

      // Verify that live data is used as fallback
      expect(stats.topProducts).toHaveLength(1)
      expect(stats.topProducts[0]!.name).toBe('Live Product Name')
    })
  })
})

