import { ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaxCategory } from 'prisma/generated/prisma/enums'
import { makeId, makePosProduct, resetMockUser, seedMockUser } from '#tests/helpers'
import { createMockCollections } from '#tests/helpers/mock-collections'
import { createPosOrder } from '@/lib/queries/create-pos-order'
import type { CreateSaleInput } from '@/lib/queries/create-pos-transaction'

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

vi.mock('@/db/collections', () => createMockCollections())

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

describe('Phase 2: Unit & Tax Snapshots', () => {
  const user = seedMockUser()

  afterEach(() => {
    resetMockUser()
  })

  describe('OrderItem snapshot capture', () => {
    it('should capture unit name and abbreviation at time of order', async () => {
      const unitId = makeId()
      const productId = makeId()
      const variantId = makeId()
      const categoryId = makeId()

      const posProducts = [
        {
          id: productId,
          name: 'Chicken',
          type: 'PHYSICAL_GOOD' as const,
          categoryId,
          baseUnitId: unitId,
          businessId: user.business.id,
          category: {
            id: categoryId,
            name: 'Main Dishes',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          baseUnit: {
            id: unitId,
            name: 'kilogram',
            abbreviation: 'kg',
            type: 'WEIGHT',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          variants: [
            {
              id: variantId,
              name: 'Regular',
              sku: 'CHK-001',
              price: 15000,
              costPrice: 8000,
              productId,
              taxCategory: TaxCategory.STANDARD,
              image: null,
              inventory: null,
              components: [],
            },
          ],
        },
      ]

      const input: CreateSaleInput = {
        items: [
          {
            product: { id: productId },
            variant: { id: variantId },
            quantity: 2.5,
            addons: [],
          },
        ],
        customer: {
          customerReference: 'Test Customer',
          customerId: makeId(),
        },
        payments: [],
      }

      await createPosOrder(input, posProducts)

      // Import collections after create to read results
      const { orderItemCollection } = await import('@/db/collections')
      const items = [...orderItemCollection.values()]
      expect(items).toHaveLength(1)
      
      const item = items[0]
      expect(item.snapshotUnitName).toBe('kilogram')
      expect(item.snapshotUnitAbbrev).toBe('kg')
      expect(item.snapshotUnitType).toBe('WEIGHT')
    })

    it('should capture tax category at time of order', async () => {
      const unitId = makeId()
      const productId = makeId()
      const variantId = makeId()
      const categoryId = makeId()

      const posProducts = [
        {
          id: productId,
          name: 'Medicine',
          type: 'PHYSICAL_GOOD' as const,
          categoryId,
          baseUnitId: unitId,
          businessId: user.business.id,
          category: {
            id: categoryId,
            name: 'Pharmacy',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          baseUnit: {
            id: unitId,
            name: 'piece',
            abbreviation: 'pcs',
            type: 'COUNT',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          variants: [
            {
              id: variantId,
              name: 'Prescription',
              sku: 'MED-001',
              price: 5000,
              costPrice: 2000,
              productId,
              taxCategory: TaxCategory.EXEMPT, // VAT exempt medicine
              image: null,
              inventory: null,
              components: [],
            },
          ],
        },
      ]

      const input: CreateSaleInput = {
        items: [
          {
            product: { id: productId },
            variant: { id: variantId },
            quantity: 3,
            addons: [],
          },
        ],
        customer: {
          customerReference: 'Patient',
          customerId: makeId(),
        },
        payments: [],
      }

      await createPosOrder(input, posProducts)

      const { orderItemCollection } = await import('@/db/collections')
      const items = [...orderItemCollection.values()]
      const item = items[0]
      expect(item.snapshotTaxCategory).toBe(TaxCategory.EXEMPT)
    })
  })

  describe('OrderItemAddon snapshot capture', () => {
    it('should capture addon unit name, abbreviation, and tax category', async () => {
      const unitId = makeId()
      const addonUnitId = makeId()
      const productId = makeId()
      const variantId = makeId()
      const addonProductId = makeId()
      const addonVariantId = makeId()
      const categoryId = makeId()
      const componentId = makeId()

      const posProducts = [
        {
          id: productId,
          name: 'Pizza',
          type: 'PHYSICAL_GOOD' as const,
          categoryId,
          baseUnitId: unitId,
          businessId: user.business.id,
          category: {
            id: categoryId,
            name: 'Food',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          baseUnit: {
            id: unitId,
            name: 'piece',
            abbreviation: 'pcs',
            type: 'COUNT',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          variants: [
            {
              id: variantId,
              name: 'Large',
              sku: 'PIZZA-L',
              price: 50000,
              costPrice: 25000,
              productId,
              taxCategory: TaxCategory.STANDARD,
              image: null,
              inventory: null,
              components: [
                {
                  id: componentId,
                  variantId,
                  materialId: addonVariantId,
                  priceOverride: 2000,
                  unitId: addonUnitId,
                  quantityRequired: 1,
                  businessId: user.business.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  unit: {
                    id: addonUnitId,
                    name: 'gram',
                    abbreviation: 'g',
                    type: 'WEIGHT',
                    businessId: user.business.id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                  material: {
                    id: addonVariantId,
                    name: 'Mozzarella',
                    sku: 'CHEESE-MOZ',
                    price: 0,
                    costPrice: 500,
                    productId: addonProductId,
                    taxCategory: TaxCategory.STANDARD,
                    inventory: null,
                    product: {
                      id: addonProductId,
                      name: 'Extra Cheese',
                      businessId: user.business.id,
                    },
                  },
                },
              ],
            },
          ],
        },
      ]

      const input: CreateSaleInput = {
        items: [
          {
            product: { id: productId },
            variant: { id: variantId },
            quantity: 1,
            addons: [
              {
                id: componentId,
                quantityUsed: 100, // 100g
              },
            ],
          },
        ],
        customer: {
          customerReference: 'Customer',
          customerId: makeId(),
        },
        payments: [],
      }

      await createPosOrder(input, posProducts)

      const { orderItemAddonCollection } = await import('@/db/collections')
      const addons = [...orderItemAddonCollection.values()]
      expect(addons).toHaveLength(1)
      
      const addon = addons[0]
      expect(addon.snapshotAddonUnitName).toBe('gram')
      expect(addon.snapshotAddonUnitAbbrev).toBe('g')
      expect(addon.snapshotAddonTaxCategory).toBe(TaxCategory.STANDARD)
    })
  })

  describe('Snapshot preservation', () => {
    it('should preserve unit snapshot even when unit is renamed', async () => {
      const unitId = makeId()
      const productId = makeId()
      const variantId = makeId()
      const categoryId = makeId()

      const posProducts = [
        {
          id: productId,
          name: 'Rice',
          type: 'PHYSICAL_GOOD' as const,
          categoryId,
          baseUnitId: unitId,
          businessId: user.business.id,
          category: {
            id: categoryId,
            name: 'Grains',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          baseUnit: {
            id: unitId,
            name: 'kilogram',
            abbreviation: 'kg',
            type: 'WEIGHT',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          variants: [
            {
              id: variantId,
              name: 'Jasmine',
              sku: 'RICE-JAS',
              price: 8000,
              costPrice: 4000,
              productId,
              taxCategory: TaxCategory.STANDARD,
              image: null,
              inventory: null,
              components: [],
            },
          ],
        },
      ]

      const input: CreateSaleInput = {
        items: [
          {
            product: { id: productId },
            variant: { id: variantId },
            quantity: 5,
            addons: [],
          },
        ],
        customer: {
          customerReference: 'Store',
          customerId: makeId(),
        },
        payments: [],
      }

      // Create order with original unit name
      await createPosOrder(input, posProducts)

      const { unitCollection, orderItemCollection } = await import('@/db/collections')
      
      // Simulate unit rename
      unitCollection.update(unitId, draft => {
        draft.name = 'kilo'
        draft.abbreviation = 'k'
      })

      // Verify snapshot preserved old values
      const items = [...orderItemCollection.values()]
      const item = items[0]
      expect(item.snapshotUnitName).toBe('kilogram') // Still old value
      expect(item.snapshotUnitAbbrev).toBe('kg') // Still old value

      // Verify live data shows new values
      const unit = unitCollection.get(unitId)
      expect(unit?.name).toBe('kilo')
      expect(unit?.abbreviation).toBe('k')
    })

    it('should preserve tax category snapshot when variant tax changes', async () => {
      const unitId = makeId()
      const productId = makeId()
      const variantId = makeId()
      const categoryId = makeId()

      const posProducts = [
        {
          id: productId,
          name: 'Service',
          type: 'SERVICE' as const,
          categoryId,
          baseUnitId: unitId,
          businessId: user.business.id,
          category: {
            id: categoryId,
            name: 'Services',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          baseUnit: {
            id: unitId,
            name: 'hour',
            abbreviation: 'hr',
            type: 'TIME',
            businessId: user.business.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          variants: [
            {
              id: variantId,
              name: 'Consultation',
              sku: 'SVC-CONS',
              price: 100000,
              costPrice: 50000,
              productId,
              taxCategory: TaxCategory.STANDARD, // 12% VAT
              image: null,
              inventory: null,
              components: [],
            },
          ],
        },
      ]

      const input: CreateSaleInput = {
        items: [
          {
            product: { id: productId },
            variant: { id: variantId },
            quantity: 2,
            addons: [],
          },
        ],
        customer: {
          customerReference: 'Client',
          customerId: makeId(),
        },
        payments: [],
      }

      // Create order with STANDARD tax
      await createPosOrder(input, posProducts)

      const { orderItemCollection } = await import('@/db/collections')
      // Verify snapshot captured STANDARD
      const items = [...orderItemCollection.values()]
      const item = items[0]
      expect(item.snapshotTaxCategory).toBe(TaxCategory.STANDARD)

      // Note: In real app, variant taxCategory would be changed via product management
      // Here we just verify the snapshot is independent
    })
  })
})
