/**
 * create-pos-order.test.ts
 *
 * Integration tests for createPosOrder using the same mock strategy as
 * create-pos-transaction.test.ts:
 *  - In-memory collection mocks (no OPFS)
 *  - dbTransaction replaced with a sync Ok-wrapping runner
 *  - fetchStructuredId mocked to return deterministic order numbers
 *  - authStore seeded with seedMockUser
 *
 * Coverage:
 *  - New order: inserted with correct fields (orderNumber, status, customerReference)
 *  - New order: items inserted per cart item (variantId, quantity, unitPrice, unitCost)
 *  - New order: addons inserted when present
 *  - Existing order: customerReference updated, old items+addons deleted, new items inserted
 *  - Walk-in fallback when customerReference is null
 *  - Always returns { data: true } regardless of outcome
 *
 * Run with: pnpm test
 */

import { ok } from 'neverthrow'
import { PaymentMethod, TaxCategory } from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baseUnit, makeId, makePosProduct, makePosVariant, resetMockUser, seedMockUser } from '#tests/helpers'
import { createMockCollections } from '#tests/helpers/mock-collections'
import type { CreateSaleInput } from '@/lib/queries/create-pos-transaction'

// ---------------------------------------------------------------------------
// Mock: collections
// ---------------------------------------------------------------------------

const mocks = createMockCollections()

vi.mock('@/db/collections', () => mocks)

// ---------------------------------------------------------------------------
// Mock: dbTransaction → sync executor
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mock: fetchStructuredId → deterministic values
// ---------------------------------------------------------------------------

vi.mock('@/lib/queries/fetch-structured-id', () => ({
  fetchStructuredId: vi.fn((type: string) => {
    if (type === 'ORDER') return '#000001'
    return `${type}-000001`
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrderProduct(price = 11200, costPrice = 5000) {
  const variantId = makeId()
  const productId = makeId()
  const variant = makePosVariant({
    id: variantId,
    productId,
    price,
    costPrice,
    taxCategory: TaxCategory.STANDARD,
    components: [],
    inventory: [],
  })

  return makePosProduct({
    id: productId,
    variants: [{ ...variant, productId } as any],
    baseUnit,
    baseUnitId: baseUnit.id,
  })
}

function makeComponent(materialVariantId: string, quantityUsed: number, costPrice = 200) {
  return {
    id: makeId(),
    hostId: makeId(),
    materialId: materialVariantId,
    quantityUsed,
    isAddon: true,
    priceOverride: 500,
    unitId: baseUnit.id,
    unit: baseUnit,
    material: {
      id: materialVariantId,
      productId: makeId(),
      name: 'Addon Material',
      costPrice,
      inventory: [],
      product: { id: makeId(), name: 'Addon Product' },
    },
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any
}

function makeOrderInput(product: ReturnType<typeof makeOrderProduct>, quantity = 1, overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  const variant = product.variants[0]!
  return {
    items: [
      {
        cartId: makeId(),
        product,
        variant: variant as any,
        quantity,
        addons: [],
      },
    ],
    payments: [
      {
        id: makeId(),
        method: PaymentMethod.CASH,
        platform: 'cash',
        tendered: 20000,
        referenceNo: '',
      },
    ],
    compliance: {},
    customer: {
      customerReference: 'Table 3',
      customerId: makeId(),
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  Object.values(mocks).forEach(col => (col as any)._store?.clear())
  Object.values(mocks).forEach(col => {
    Object.values(col).forEach(fn => typeof fn === 'function' && 'mockClear' in fn && (fn as any).mockClear())
  })
})

afterEach(() => {
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { createPosOrder } = await import('@/lib/queries/create-pos-order')

// ---------------------------------------------------------------------------
// New order creation
// ---------------------------------------------------------------------------

describe('createPosOrder — new order', () => {
  it('always returns { data: true }', async () => {
    const product = makeOrderProduct()
    const input = makeOrderInput(product)

    const result = await createPosOrder(input, [product])

    expect(result).toEqual({ data: true })
  })

  it('inserts order into orderCollection with correct fields', async () => {
    const product = makeOrderProduct()
    const input = makeOrderInput(product)

    await createPosOrder(input, [product])

    expect(mocks.orderCollection.insert).toHaveBeenCalledOnce()
    const inserted = mocks.orderCollection.insert.mock.calls[0]![0] as any
    expect(inserted.orderNumber).toBe('#000001')
    expect(inserted.status).toBe('PENDING')
    expect(inserted.orderType).toBe('DINE_IN')
    expect(inserted.customerReference).toBe('Table 3')
    expect(inserted.businessId).toBe('biz-test-001')
    expect(inserted.branchId).toBe('branch-test-001')
  })

  it('falls back to Walk-in Guest when customerReference is null', async () => {
    const product = makeOrderProduct()
    const input = makeOrderInput(product, 1, {
      customer: { customerReference: null, customerId: makeId() },
    })

    await createPosOrder(input, [product])

    const inserted = mocks.orderCollection.insert.mock.calls[0]![0] as any
    expect(inserted.customerReference).toBe('Walk-in Guest')
  })

  it('inserts an order item for each cart item', async () => {
    const product = makeOrderProduct(11200, 5000)
    const input = makeOrderInput(product, 3)

    await createPosOrder(input, [product])

    expect(mocks.orderItemCollection.insert).toHaveBeenCalledOnce()
    const item = mocks.orderItemCollection.insert.mock.calls[0]![0] as any
    expect(item.quantity).toBe(3)
    expect(item.unitPrice).toBe(11200)
    expect(item.unitCost).toBe(5000)
    expect(item.variantId).toBe(product.variants[0]!.id)
  })

  it('inserts multiple order items for multiple cart items', async () => {
    const product1 = makeOrderProduct(11200)
    const product2 = makeOrderProduct(5000)
    const input: CreateSaleInput = {
      items: [
        { cartId: makeId(), product: product1, variant: product1.variants[0] as any, quantity: 1, addons: [] },
        { cartId: makeId(), product: product2, variant: product2.variants[0] as any, quantity: 2, addons: [] },
      ],
      payments: [{ id: makeId(), method: PaymentMethod.CASH, platform: 'cash', tendered: 30000, referenceNo: '' }],
      compliance: {},
      customer: { customerReference: 'Table 5', customerId: makeId() },
    }

    await createPosOrder(input, [product1, product2])

    expect(mocks.orderItemCollection.insert).toHaveBeenCalledTimes(2)
  })

  it('does not call orderItemAddonCollection.insert when no addons', async () => {
    const product = makeOrderProduct()
    const input = makeOrderInput(product, 1)

    await createPosOrder(input, [product])

    expect(mocks.orderItemAddonCollection.insert).not.toHaveBeenCalled()
  })

  it('inserts addons into orderItemAddonCollection when addons are present', async () => {
    const materialId = makeId()
    const comp = makeComponent(materialId, 1)

    const variantId = makeId()
    const productId = makeId()
    const variant = makePosVariant({
      id: variantId,
      productId,
      components: [comp],
      inventory: [],
    })
    const product = makePosProduct({
      id: productId,
      variants: [{ ...variant, productId } as any],
    })

    const input: CreateSaleInput = {
      items: [
        {
          cartId: makeId(),
          product,
          variant: { ...variant, productId } as any,
          quantity: 1,
          addons: [comp],
        },
      ],
      payments: [{ id: makeId(), method: PaymentMethod.CASH, platform: 'cash', tendered: 20000, referenceNo: '' }],
      compliance: {},
      customer: { customerReference: 'Dine In', customerId: makeId() },
    }

    await createPosOrder(input, [product])

    expect(mocks.orderItemAddonCollection.insert).toHaveBeenCalledOnce()
    const addonBatch = mocks.orderItemAddonCollection.insert.mock.calls[0]![0] as any[]
    expect(addonBatch).toHaveLength(1)
    expect(addonBatch[0]).toMatchObject({
      addonId: materialId,
      quantity: 1,
      snapshotUnitPrice: 500,
      snapshotUnitCost: 200,
    })
  })

  it('order item unitId is taken from product.baseUnitId', async () => {
    const product = makeOrderProduct()
    const input = makeOrderInput(product)

    await createPosOrder(input, [product])

    const item = mocks.orderItemCollection.insert.mock.calls[0]![0] as any
    expect(item.unitId).toBe(baseUnit.id)
  })
})

// ---------------------------------------------------------------------------
// Existing order update
// ---------------------------------------------------------------------------

describe('createPosOrder — existing order update', () => {
  it('updates customerReference on existing order', async () => {
    const product = makeOrderProduct()
    const existingOrderId = makeId()

    // Seed existing order in the mock
    mocks.orderCollection._store.set(existingOrderId, {
      id: existingOrderId,
      customerReference: 'Old Table',
    } as any)

    const input = makeOrderInput(product, 1, {
      orderId: existingOrderId,
      customer: { customerReference: 'New Table', customerId: makeId() },
    })

    await createPosOrder(input, [product])

    expect(mocks.orderCollection.update).toHaveBeenCalledWith(existingOrderId, expect.any(Function))
    // Must not insert a new order
    expect(mocks.orderCollection.insert).not.toHaveBeenCalled()
  })

  it('deletes existing order items before re-inserting', async () => {
    const product = makeOrderProduct()
    const existingOrderId = makeId()
    const existingItemId = makeId()

    mocks.orderCollection._store.set(existingOrderId, { id: existingOrderId, customerReference: 'Old' } as any)
    mocks.orderItemCollection._store.set(existingItemId, { id: existingItemId, orderId: existingOrderId } as any)

    const input = makeOrderInput(product, 1, { orderId: existingOrderId })

    await createPosOrder(input, [product])

    expect(mocks.orderItemCollection.delete).toHaveBeenCalledWith([existingItemId])
  })

  it('deletes addons belonging to existing items before re-inserting', async () => {
    const product = makeOrderProduct()
    const existingOrderId = makeId()
    const existingItemId = makeId()
    const existingAddonId = makeId()

    mocks.orderCollection._store.set(existingOrderId, { id: existingOrderId } as any)
    mocks.orderItemCollection._store.set(existingItemId, { id: existingItemId, orderId: existingOrderId } as any)
    mocks.orderItemAddonCollection._store.set(existingAddonId, { id: existingAddonId, orderItemId: existingItemId } as any)

    const input = makeOrderInput(product, 1, { orderId: existingOrderId })

    await createPosOrder(input, [product])

    expect(mocks.orderItemAddonCollection.delete).toHaveBeenCalledWith([existingAddonId])
  })

  it('inserts fresh items after deleting old ones', async () => {
    const product = makeOrderProduct()
    const existingOrderId = makeId()
    const existingItemId = makeId()

    mocks.orderCollection._store.set(existingOrderId, { id: existingOrderId } as any)
    mocks.orderItemCollection._store.set(existingItemId, { id: existingItemId, orderId: existingOrderId } as any)

    const input = makeOrderInput(product, 2, { orderId: existingOrderId })

    await createPosOrder(input, [product])

    // delete called for old items, insert called for new items
    expect(mocks.orderItemCollection.delete).toHaveBeenCalledWith([existingItemId])
    expect(mocks.orderItemCollection.insert).toHaveBeenCalledOnce()
    const newItem = mocks.orderItemCollection.insert.mock.calls[0]![0] as any
    expect(newItem.quantity).toBe(2)
  })
})
