/**
 * Data factories for unit and integration tests.
 * Uses @faker-js/faker for realistic but deterministic test data.
 * Seeded with a fixed value so snapshots stay stable — change the seed
 * if you need a fresh dataset.
 */

import { faker } from '@faker-js/faker'
import type { Inventory, Unit } from 'prisma/generated/prisma/browser'
import { ResourceType, TaxCategory, UnitType } from 'prisma/generated/prisma/enums'
import type { posProduct } from '@/lib/queries/fetch-pos-products'
import type { posItem } from '../../../lib/conversion/inventory-engine'
import type { LineItem, TaxEngineConfig } from '../../../lib/conversion/tax-engine'
import type { InventoryBatchDTO } from '../../../lib/costing/types'

faker.seed(42) // Fixed seed for reproducible tests

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export function makeId(): string {
  return faker.string.uuid()
}

// ---------------------------------------------------------------------------
// Unit factory
// ---------------------------------------------------------------------------

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: makeId(),
    name: 'Piece',
    abbreviation: 'pc',
    conversionFactor: 1,
    type: UnitType.QUANTITY,
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}

export const baseUnit = makeUnit({ id: 'unit-base', name: 'Piece', abbreviation: 'pc', conversionFactor: 1 })
export const dozenUnit = makeUnit({ id: 'unit-dozen', name: 'Dozen', abbreviation: 'dz', conversionFactor: 12 })
export const gramUnit = makeUnit({ id: 'unit-gram', name: 'Gram', abbreviation: 'g', conversionFactor: 1, type: UnitType.WEIGHT })
export const kiloUnit = makeUnit({ id: 'unit-kilo', name: 'Kilogram', abbreviation: 'kg', conversionFactor: 1000, type: UnitType.WEIGHT })

// ---------------------------------------------------------------------------
// Inventory batch factory
// ---------------------------------------------------------------------------

export function makeInventoryBatch(overrides: Partial<InventoryBatchDTO> = {}): InventoryBatchDTO {
  return {
    id: makeId(),
    quantity: faker.number.int({ min: 10, max: 100 }),
    costPrice: faker.number.int({ min: 100, max: 5000 }), // in cents
    ...overrides,
  }
}

export function makeInventoryRecord(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: makeId(),
    variantId: makeId(),
    quantity: faker.number.int({ min: 10, max: 100 }),
    costPrice: faker.number.int({ min: 100, max: 5000 }),
    unitId: baseUnit.id,
    batchNumber: 'DEFAULT',
    locationId: null,
    expiryDate: null,
    lastRestocked: new Date(),
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Product/Variant factory (simplified posProduct shape)
// ---------------------------------------------------------------------------

export function makePosVariant(overrides: Partial<posProduct['variants'][number]> = {}): posProduct['variants'][number] {
  const variantId = makeId()
  return {
    id: variantId,
    productId: makeId(),
    name: faker.commerce.productAdjective(),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    price: faker.number.int({ min: 500, max: 50000 }), // in cents
    costPrice: faker.number.int({ min: 100, max: 10000 }), // in cents
    taxCategory: TaxCategory.STANDARD,
    isAvailable: true,
    inventory: [],
    components: [],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  } as unknown as posProduct['variants'][number]
}

export function makePosProduct(overrides: Partial<posProduct> = {}): posProduct {
  const productId = makeId()
  const variant = makePosVariant({ productId })

  return {
    id: productId,
    name: faker.commerce.productName(),
    type: ResourceType.PHYSICAL_GOOD,
    baseUnitId: baseUnit.id,
    baseUnit,
    categoryId: makeId(),
    category: {
      id: makeId(),
      name: faker.commerce.department(),
      businessId: 'biz-test-001',
      branchId: 'branch-test-001',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    isAvailable: true,
    variants: [variant],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  } as unknown as posProduct
}

// ---------------------------------------------------------------------------
// TaxEngine fixtures
// ---------------------------------------------------------------------------

export const vatInclusiveConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'INCLUSIVE' as any,
  isVatRegistered: true,
}

export const vatExclusiveConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'EXCLUSIVE' as any,
  isVatRegistered: true,
}

export const nonVatConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'INCLUSIVE' as any,
  isVatRegistered: false,
}

export function makeLineItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    grossAmount: 11200, // ₱112.00 in cents
    taxCategory: TaxCategory.STANDARD,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// posItem factory (for InventoryEngine / TaxEngine)
// ---------------------------------------------------------------------------

export function makePosItem(overrides: Partial<posItem> = {}): posItem {
  const product = makePosProduct()
  const variant = product.variants[0]!

  return {
    cartId: makeId(),
    product,
    variant: variant as any,
    quantity: 1,
    addons: [],
    ...overrides,
  }
}
