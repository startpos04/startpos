/**
 * create-pos-transaction.test.ts
 *
 * Integration tests for createPosTransaction using:
 *  - In-memory collection mocks (no OPFS)
 *  - dbTransaction replaced with a simple synchronous Ok-wrapping runner
 *  - fetchStructuredId mocked to return deterministic invoice/order numbers
 *  - authStore seeded with seedMockUser
 *
 * Coverage:
 *  - Happy path: transaction, payment, order, and tax line records are created
 *  - Correct VAT calculation flows through from TaxEngine
 *  - Total cost computed from variant costPrice × quantity
 *  - Compliance data stamped onto the transaction
 *  - Insufficient stock throws and returns error
 *  - Product/variant not found throws and returns error
 *  - Existing orderId reuses and updates the order
 *  - Cash payment change calculated correctly
 *  - SC/PWD discount applied (reduces vatable base)
 *  - General discount applied (reduces total)
 *  - Walk-in default customer reference
 *
 * Run with: pnpm test
 */

import { ok } from 'neverthrow'
import { PaymentMethod, TaxCategory } from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentLine } from '@/routes/(private)/pos/-components/payment-dialog'
import { baseUnit, makeId, makeInventoryRecord, makePosProduct, makePosVariant, resetMockUser, seedMockUser } from '#tests/helpers'
import type { CreateSaleInput } from '@/lib/queries/create-pos-transaction'
import type { posProduct } from '@/lib/queries/fetch-pos-products'

// ---------------------------------------------------------------------------
// Mock: collections → in-memory maps
// ---------------------------------------------------------------------------

import { createMockCollections } from '#tests/helpers/mock-collections'

const mocks = createMockCollections()

vi.mock('@/db/collections', () => mocks)

// ---------------------------------------------------------------------------
// Mock: dbTransaction → sync executor that returns Ok(callbackResult)
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
    if (type === 'INVOICE') return 'SI-2026-000001'
    if (type === 'ORDER') return '#000001'
    return `${type}-000001`
  }),
}))

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function makeVariantWithInventory(variantId: string, price: number, costPrice: number, stock: number) {
  const invId = makeId()
  const inventoryRecord = makeInventoryRecord({ id: invId, variantId, quantity: stock, costPrice })

  // Seed the inventory collection so stock validation passes
  mocks.inventoryCollection.insert(inventoryRecord as any)

  return makePosVariant({
    id: variantId,
    price,
    costPrice,
    taxCategory: TaxCategory.STANDARD,
    components: [],
    inventory: [inventoryRecord as any],
  })
}

function makeSaleProduct(price = 11200, costPrice = 5000, stock = 100) {
  const variantId = makeId()
  const productId = makeId()
  const variant = makeVariantWithInventory(variantId, price, costPrice, stock)

  return makePosProduct({
    id: productId,
    variants: [{ ...variant, productId } as any],
    baseUnit,
    baseUnitId: baseUnit.id,
  })
}

function makeCashPayment(tendered: number, discount = 0, scPwdDiscount = 0): PaymentLine {
  return {
    id: makeId(),
    method: PaymentMethod.CASH,
    platform: 'cash',
    tendered,
    referenceNo: '',
    discount,
    scPwdDiscount,
  }
}

function makeSaleInput(product: posProduct, quantity = 1, overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
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
    payments: [makeCashPayment(variant.price * quantity + 5000)], // tendered with change
    compliance: {},
    customer: {
      customerReference: 'Test Customer',
      customerId: makeId(),
      notes: '',
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  // Clear all in-memory stores between tests
  Object.values(mocks).forEach(col => (col as any)._store?.clear())
  // Reset spy call counts
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

const { createPosTransaction } = await import('@/lib/queries/create-pos-transaction')

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('createPosTransaction — happy path', () => {
  it('returns data with transaction, payments, and order', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product)

    const result = await createPosTransaction(input, [product])

    expect(result.error).toBeUndefined()
    expect(result.data).toBeDefined()
    expect(result.data!.transaction).toBeDefined()
    expect(result.data!.payments).toHaveLength(1)
    expect(result.data!.order).toBeDefined()
  })

  it('transaction has correct invoiceNo from fetchStructuredId', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product)

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.invoiceNo).toBe('SI-2026-000001')
  })

  it('transaction totalAmount matches TaxEngine.summarize output (₱112 inclusive → ₱112)', async () => {
    // price = 11200¢ = ₱112.00 inclusive, VAT 12%
    const product = makeSaleProduct(11200)
    const input = makeSaleInput(product, 1)

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.totalAmount).toBe(11200)
  })

  it('transaction taxAmount equals 12% of vatableSales (₱12 on ₱112 item)', async () => {
    const product = makeSaleProduct(11200)
    const input = makeSaleInput(product, 1)

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.taxAmount).toBe(1200)
  })

  it('totalCost is variant.costPrice × quantity', async () => {
    const product = makeSaleProduct(11200, 5000) // costPrice = 5000¢
    const input = makeSaleInput(product, 2)

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.totalCost).toBe(10000) // 5000 × 2
  })

  it('payment change = tendered - totalAmount', async () => {
    const product = makeSaleProduct(11200)
    // tendered: 20000¢ (₱200), total: 11200¢ (₱112) → change: 8800¢ (₱88)
    const input = makeSaleInput(product, 1, {
      payments: [makeCashPayment(20000)],
    })

    const result = await createPosTransaction(input, [product])

    expect(result.data!.payments[0]!.change).toBe(8800)
    expect(result.data!.payments[0]!.tendered).toBe(20000)
  })

  it('inserts transaction into transactionCollection', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product)

    await createPosTransaction(input, [product])

    expect(mocks.transactionCollection.insert).toHaveBeenCalledOnce()
  })

  it('inserts payment into paymentCollection', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product)

    await createPosTransaction(input, [product])

    expect(mocks.paymentCollection.insert).toHaveBeenCalledOnce()
  })

  it('inserts order into orderCollection for a new orderId', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product)

    await createPosTransaction(input, [product])

    expect(mocks.orderCollection.insert).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Compliance data
// ---------------------------------------------------------------------------

describe('createPosTransaction — compliance data', () => {
  it('stamps PTU number and issued date from complianceRegistry', async () => {
    const product = makeSaleProduct(11200)
    const input = makeSaleInput(product)

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.complianceData.ptuNumber).toBe('PTU-2024-001')
    expect(result.data!.transaction.complianceData.ptuIssuedAt).toBe('2024-01-01')
  })

  it('SC/PWD name and ID stamped into complianceData', async () => {
    const product = makeSaleProduct(11200)
    const input = makeSaleInput(product, 1, {
      compliance: { scPwdName: 'Juan dela Cruz', scPwdIdNumber: 123456 },
    })

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.complianceData.scPwdName).toBe('Juan dela Cruz')
    expect(result.data!.transaction.complianceData.scPwdIdNumber).toBe(123456)
  })

  it('vatableSales and vatAmount are in complianceData', async () => {
    const product = makeSaleProduct(11200) // ₱112 inclusive
    const input = makeSaleInput(product, 1)

    const result = await createPosTransaction(input, [product])

    expect(result.data!.transaction.complianceData.vatableSales).toBe(10000)
    expect(result.data!.transaction.complianceData.vatAmount).toBe(1200)
  })
})

// ---------------------------------------------------------------------------
// Customer reference
// ---------------------------------------------------------------------------

describe('createPosTransaction — customer reference', () => {
  it('uses provided customerReference on the order', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product, 1, {
      customer: { customerReference: 'Table 5', customerId: makeId() },
    })

    const result = await createPosTransaction(input, [product])

    expect(result.data!.order.customerReference).toBe('Table 5')
  })

  it('falls back to Walk-in Guest when customerReference is null', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product, 1, {
      customer: { customerReference: null, customerId: makeId() },
    })

    const result = await createPosTransaction(input, [product])

    expect(result.data!.order.customerReference).toBe('Walk-in Guest')
  })
})

// ---------------------------------------------------------------------------
// Discount handling
// ---------------------------------------------------------------------------

describe('createPosTransaction — discount handling', () => {
  it('general discount reduces totalAmount', async () => {
    const product = makeSaleProduct(11200)
    const input = makeSaleInput(product, 1, {
      payments: [makeCashPayment(20000, 1000)], // ₱10 discount
    })

    const result = await createPosTransaction(input, [product])

    // 11200 - 1000 = 10200
    expect(result.data!.transaction.totalAmount).toBe(10200)
    expect(result.data!.transaction.discount).toBe(1000)
  })

  it('SC/PWD discount reduces vatable base before VAT (RA 9994)', async () => {
    // Item: ₱112 inclusive, net = ₱100. SC/PWD 20% on net = ₱20 (2000¢)
    const product = makeSaleProduct(11200)
    const input = makeSaleInput(product, 1, {
      payments: [makeCashPayment(20000, 0, 2000)],
    })

    const result = await createPosTransaction(input, [product])

    // vatableSales reduced: 10000 - 2000 = 8000, vatAmount = 960
    expect(result.data!.transaction.complianceData.vatableSales).toBe(8000)
    expect(result.data!.transaction.complianceData.vatAmount).toBe(960)
  })
})

// ---------------------------------------------------------------------------
// Existing order update
// ---------------------------------------------------------------------------

describe('createPosTransaction — existing order reuse', () => {
  it('updates existing order instead of creating new one when orderId matches', async () => {
    const product = makeSaleProduct()
    const existingOrderId = makeId()

    // Seed an existing order in the mock collection
    mocks.orderCollection._store.set(existingOrderId, {
      id: existingOrderId,
      customerReference: 'Old Reference',
      businessId: 'biz-test-001',
      branchId: 'branch-test-001',
    } as any)

    const input = makeSaleInput(product, 1, {
      orderId: existingOrderId,
      customer: { customerReference: 'New Reference', customerId: makeId() },
    })

    await createPosTransaction(input, [product])

    expect(mocks.orderCollection.update).toHaveBeenCalledWith(existingOrderId, expect.any(Function))
    // Should NOT insert a new order
    expect(mocks.orderCollection.insert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('createPosTransaction — error handling', () => {
  it('returns error when product is not found in posOrders', async () => {
    const product = makeSaleProduct()
    const input = makeSaleInput(product)

    // Pass empty posOrders — product won't be found
    const result = await createPosTransaction(input, [])

    expect(result.error).toBeDefined()
  })

  it('returns error when stock is insufficient for the variant', async () => {
    // Stock = 1, trying to sell 10
    const product = makeSaleProduct(11200, 5000, 1)
    const input = makeSaleInput(product, 10)

    const result = await createPosTransaction(input, [product])

    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/Insufficient stock/)
  })

  it('insufficient stock error includes product name', async () => {
    const variantId = makeId()
    const productId = makeId()
    const inv = makeInventoryRecord({ variantId, quantity: 2 })
    mocks.inventoryCollection.insert(inv as any)

    const variant = makePosVariant({ id: variantId, name: 'Small Cup', inventory: [inv as any], components: [] })
    const product = makePosProduct({ id: productId, name: 'Coffee', variants: [{ ...variant, productId } as any] })
    const input = makeSaleInput(product, 5)

    const result = await createPosTransaction(input, [product])

    expect(result.error?.message).toContain('Small Cup')
  })
})
