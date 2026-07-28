/**
 * use-pos.test.ts
 *
 * Tests for usePOS hook.
 *
 * Strategy:
 *  - fetchPosProducts and fetchActiveOrders are mocked to return controlled data.
 *  - renderHook from RTL used to invoke the hook and inspect its return value.
 *  - The internal getOrderItems logic is exercised via the hook's orderItems output.
 *
 * Coverage:
 *  - Returns posProducts and activeOrders from their respective fetchers
 *  - orderItems is empty when loading
 *  - orderItems is empty when no active orders
 *  - orderItems built from active orders that are NOT the current orderId
 *  - Current orderId order is excluded from orderItems
 *  - Variant matched to correct product
 *  - Addon components correctly filtered to isAddon=true + matching materialId
 *  - orderItems is empty when product not found for an order item
 *  - orderItems is empty when variant not found for an order item
 *  - isLoading true when either fetcher is loading
 *  - isLoading false when both fetchers complete
 *  - totalItemsPosProducts forwarded from fetchPosProducts
 *
 * Run with: pnpm test use-pos
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser, makePosProduct, makePosVariant, makeInventoryRecord } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: fetchPosProducts and fetchActiveOrders
// ---------------------------------------------------------------------------

vi.mock('@/lib/queries/fetch-pos-products', () => ({
  fetchPosProducts: vi.fn(),
}))

vi.mock('@/lib/queries/fetch-active-orders', () => ({
  fetchActiveOrders: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { fetchPosProducts } from '@/lib/queries/fetch-pos-products'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { usePOS } from '@/hooks/use-pos'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockProducts = vi.mocked(fetchPosProducts)
const mockOrders = vi.mocked(fetchActiveOrders)

function makeProduct(variantOverrides: Record<string, any> = {}) {
  const productId = makeId()
  const variantId = makeId()
  const inv = makeInventoryRecord({ variantId, quantity: 10 })
  const variant = makePosVariant({
    id: variantId,
    productId,
    name: 'Regular',
    price: 11200,
    inventory: [inv as any],
    components: [],
    ...variantOverrides,
  })
  const product = makePosProduct({
    id: productId,
    name: 'Americano',
    variants: [{ ...variant, productId } as any],
  })
  return { product, variant, variantId, productId }
}

function makeOrderWithItem(productId: string, variantId: string, addonId?: string) {
  const orderId = makeId()
  const itemId = makeId()
  return {
    id: orderId,
    orderNumber: '#000001',
    status: 'PENDING',
    transaction: undefined,
    items: [
      {
        id: itemId,
        orderId,
        variantId,
        quantity: 2,
        unitPrice: 11200,
        variant: { id: variantId, productId, product: { id: productId, name: 'Americano' } },
        selectedAddons: addonId ? [{ id: makeId(), addonId }] : [],
      },
    ],
  }
}

function setupMocks({
  products = [] as any[],
  orders = [] as any[],
  isLoadingProducts = false,
  isLoadingOrders = false,
  totalItems = 0,
} = {}) {
  mockProducts.mockReturnValue({ data: products, isLoading: isLoadingProducts, totalItems } as any)
  mockOrders.mockReturnValue({ data: orders, isLoading: isLoadingOrders } as any)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
})

afterEach(() => {
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Basic return shape
// ---------------------------------------------------------------------------

describe('usePOS — basic return shape', () => {
  it('returns posProducts from fetchPosProducts', () => {
    const { product } = makeProduct()
    setupMocks({ products: [product] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.posProducts).toHaveLength(1)
    expect(result.current.posProducts[0]!.name).toBe('Americano')
  })

  it('returns activeOrders from fetchActiveOrders', () => {
    const { productId, variantId } = makeProduct()
    const order = makeOrderWithItem(productId, variantId)
    setupMocks({ orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.activeOrders).toHaveLength(1)
  })

  it('forwards totalItemsPosProducts', () => {
    setupMocks({ totalItems: 42 })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.totalItemsPosProducts).toBe(42)
  })

  it('isLoading true when products are loading', () => {
    setupMocks({ isLoadingProducts: true })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.isLoading).toBe(true)
  })

  it('isLoading true when orders are loading', () => {
    setupMocks({ isLoadingOrders: true })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.isLoading).toBe(true)
  })

  it('isLoading false when both fetchers complete', () => {
    setupMocks()
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// orderItems — loading state
// ---------------------------------------------------------------------------

describe('usePOS — orderItems while loading', () => {
  it('orderItems is empty while products loading', () => {
    const { product, productId, variantId } = makeProduct()
    const order = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order], isLoadingProducts: true })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(0)
  })

  it('orderItems is empty while orders loading', () => {
    const { product, productId, variantId } = makeProduct()
    const order = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order], isLoadingOrders: true })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// orderItems — assembly
// ---------------------------------------------------------------------------

describe('usePOS — orderItems assembly', () => {
  it('returns empty orderItems when no active orders', () => {
    const { product } = makeProduct()
    setupMocks({ products: [product], orders: [] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(0)
  })

  it('builds orderItems from active orders', () => {
    const { product, productId, variantId } = makeProduct()
    const order = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(1)
    expect(result.current.orderItems[0]!.quantity).toBe(2)
  })

  it('correctly matches variant to product', () => {
    const { product, productId, variantId } = makeProduct()
    const order = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems[0]!.variant.id).toBe(variantId)
    expect(result.current.orderItems[0]!.product.id).toBe(productId)
  })

  it('excludes order matching the current orderId', () => {
    const { product, productId, variantId } = makeProduct()
    const order = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order] })
    // Pass the current order's id — it should be excluded
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20, orderId: order.id }))
    expect(result.current.orderItems).toHaveLength(0)
  })

  it('includes orders that do NOT match the current orderId', () => {
    const { product, productId, variantId } = makeProduct()
    const order1 = makeOrderWithItem(productId, variantId)
    const order2 = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order1, order2] })
    // Exclude only order1
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20, orderId: order1.id }))
    expect(result.current.orderItems).toHaveLength(1)
  })

  it('returns empty orderItems when product not found for order item', () => {
    const { product, variantId } = makeProduct()
    // Order references a different productId that doesn't exist in posProducts
    const order = makeOrderWithItem(makeId(), variantId)
    setupMocks({ products: [product], orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(0)
  })

  it('returns empty orderItems when variant not found for order item', () => {
    const { product, productId } = makeProduct()
    // Order references a different variantId that doesn't exist on the product
    const order = makeOrderWithItem(productId, makeId())
    setupMocks({ products: [product], orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(0)
  })

  it('accumulates items from multiple orders', () => {
    const { product, productId, variantId } = makeProduct()
    const order1 = makeOrderWithItem(productId, variantId)
    const order2 = makeOrderWithItem(productId, variantId)
    setupMocks({ products: [product], orders: [order1, order2] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// orderItems — addon matching
// ---------------------------------------------------------------------------

describe('usePOS — orderItems addon matching', () => {
  it('attaches matching addon component to orderItem', () => {
    const addonMaterialId = makeId()
    const { product, productId, variantId } = makeProduct({
      components: [
        {
          id: makeId(),
          materialId: addonMaterialId,
          isAddon: true,
          quantityUsed: 1,
          priceOverride: 2000,
          material: { id: addonMaterialId, name: 'Extra Shot', product: { name: 'Espresso' } },
        },
      ],
    })
    const order = makeOrderWithItem(productId, variantId, addonMaterialId)
    setupMocks({ products: [product], orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems[0]!.addons).toHaveLength(1)
    expect((result.current.orderItems[0]!.addons[0] as any).materialId).toBe(addonMaterialId)
  })

  it('orderItem has empty addons when no matching component found', () => {
    const { product, productId, variantId } = makeProduct({ components: [] })
    const order = makeOrderWithItem(productId, variantId, makeId()) // non-existent addonId
    setupMocks({ products: [product], orders: [order] })
    const { result } = renderHook(() => usePOS({ page: 1, pageSize: 20 }))
    expect(result.current.orderItems[0]!.addons).toHaveLength(0)
  })
})
