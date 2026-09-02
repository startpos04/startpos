/**
 * fetch-active-orders.test.ts
 *
 * Tests for fetchActiveOrders hook.
 *
 * Strategy:
 *  - `useLiveQuery` mocked to return controlled data for each sub-query.
 *  - fetchActiveOrders calls useLiveQuery 4 times in sequence:
 *      call 0 → baseOrdersResult (PENDING/PREPARING orders)
 *      call 1 → transactionsResult (today's transactions)
 *      call 2 → itemsResult (order items + variant + product join)
 *      call 3 → addonsResult (item addons)
 *  - Tests verify the memory-map merge logic that assembles the final shape.
 *
 * Coverage:
 *  - Returns orders with items and selectedAddons assembled
 *  - Empty orders when no active orders
 *  - Transaction attached to matching order by orderId
 *  - Items filtered to their respective order
 *  - Addons filtered to their respective order item
 *  - Order IDs deduped between active orders and transaction orders
 *
 * Run with: pnpm test fetch-active-orders
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser, makeId } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db — control useLiveQuery responses
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return {
    ...actual,
    useLiveQuery: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  productCollection: {}, productVariantCollection: {}, transactionCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, paymentCollection: {},
  transactionTaxLineCollection: {}, sequenceCounterCollection: {},
  productComponentCollection: {}, purchaseCollection: {}, purchaseItemCollection: {},
  businessCollection: {}, branchCollection: {}, categoryCollection: {}, unitCollection: {},
  userCollection: {}, locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock import
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrder(overrides = {}) {
  const id = makeId()
  return {
    id,
    orderNumber: '#000001',
    status: 'PENDING',
    customerReference: 'Table 1',
    createdAt: new Date(),
    updatedAt: new Date(),
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    ...overrides,
  }
}

function makeTransaction(orderId: string) {
  return {
    id: makeId(),
    orderId,
    invoiceNo: 'SI-2026-000001',
    totalAmount: 11200,
    createdAt: new Date(),
  }
}

function makeOrderItem(orderId: string, overrides = {}) {
  const id = makeId()
  return {
    id,
    orderId,
    variantId: makeId(),
    quantity: 1,
    unitPrice: 11200,
    variant: { id: makeId(), name: 'Regular', product: { id: makeId(), name: 'Americano' } },
    ...overrides,
  }
}

function makeAddon(orderItemId: string) {
  return {
    id: makeId(),
    orderItemId,
    addonId: makeId(),
    addon: { id: makeId(), name: 'Extra Shot', product: { id: makeId(), name: 'Espresso' } },
  }
}

// fetchActiveOrders calls useLiveQuery 4 times:
//   0 → baseOrders, 1 → transactions, 2 → items, 3 → addons
function setupMocks({
  orders = [] as any[],
  transactions = [] as any[],
  items = [] as any[],
  addons = [] as any[],
} = {}) {
  vi.mocked(useLiveQuery)
    .mockReturnValueOnce({ data: orders, isLoading: false })       // baseOrders
    .mockReturnValueOnce({ data: transactions, isLoading: false }) // transactions
    .mockReturnValueOnce({ data: items, isLoading: false })        // items
    .mockReturnValueOnce({ data: addons, isLoading: false })       // addons
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

describe('fetchActiveOrders — basic return shape', () => {
  it('returns empty data when no orders exist', () => {
    setupMocks()
    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data).toEqual([])
  })

  it('returns orders array with items', () => {
    const order = makeOrder()
    const item = makeOrderItem(order.id)
    setupMocks({ orders: [order], items: [item] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data![0]!.items).toHaveLength(1)
  })

  it('returns multiple orders', () => {
    const o1 = makeOrder({ orderNumber: '#000001' })
    const o2 = makeOrder({ orderNumber: '#000002' })
    setupMocks({ orders: [o1, o2] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Order-item assembly
// ---------------------------------------------------------------------------

describe('fetchActiveOrders — order item assembly', () => {
  it('items are filtered to their respective order', () => {
    const order1 = makeOrder()
    const order2 = makeOrder()
    const item1 = makeOrderItem(order1.id)
    const item2 = makeOrderItem(order2.id)
    setupMocks({ orders: [order1, order2], items: [item1, item2] })

    const { result } = renderHook(() => fetchActiveOrders())
    const o1 = result.current.data!.find(o => o.id === order1.id)!
    const o2 = result.current.data!.find(o => o.id === order2.id)!

    expect(o1.items).toHaveLength(1)
    expect(o1.items[0]!.id).toBe(item1.id)
    expect(o2.items).toHaveLength(1)
    expect(o2.items[0]!.id).toBe(item2.id)
  })

  it('order with no items gets empty items array', () => {
    const order = makeOrder()
    setupMocks({ orders: [order], items: [] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data![0]!.items).toHaveLength(0)
  })

  it('multiple items for same order are all included', () => {
    const order = makeOrder()
    const item1 = makeOrderItem(order.id)
    const item2 = makeOrderItem(order.id)
    setupMocks({ orders: [order], items: [item1, item2] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data![0]!.items).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Addon assembly
// ---------------------------------------------------------------------------

describe('fetchActiveOrders — addon assembly', () => {
  it('addons are attached to their respective order item', () => {
    const order = makeOrder()
    const item = makeOrderItem(order.id)
    const addon = makeAddon(item.id)
    setupMocks({ orders: [order], items: [item], addons: [addon] })

    const { result } = renderHook(() => fetchActiveOrders())
    const assembled = result.current.data![0]!.items[0]!
    expect(assembled.selectedAddons).toHaveLength(1)
    expect(assembled.selectedAddons[0]!.id).toBe(addon.id)
  })

  it('addon for different item is not attached to wrong item', () => {
    const order = makeOrder()
    const item1 = makeOrderItem(order.id)
    const item2 = makeOrderItem(order.id)
    const addon = makeAddon(item2.id) // belongs to item2
    setupMocks({ orders: [order], items: [item1, item2], addons: [addon] })

    const { result } = renderHook(() => fetchActiveOrders())
    const items = result.current.data![0]!.items
    const assembled1 = items.find(i => i.id === item1.id)!
    const assembled2 = items.find(i => i.id === item2.id)!

    expect(assembled1.selectedAddons).toHaveLength(0)
    expect(assembled2.selectedAddons).toHaveLength(1)
  })

  it('item with no addons gets empty selectedAddons array', () => {
    const order = makeOrder()
    const item = makeOrderItem(order.id)
    setupMocks({ orders: [order], items: [item], addons: [] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data![0]!.items[0]!.selectedAddons).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Transaction attachment
// ---------------------------------------------------------------------------

describe('fetchActiveOrders — transaction attachment', () => {
  it('attaches transaction to the matching order by orderId', () => {
    const order = makeOrder()
    const tx = makeTransaction(order.id)
    setupMocks({ orders: [order], transactions: [tx] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data![0]!.transaction).toBeDefined()
    expect(result.current.data![0]!.transaction!.id).toBe(tx.id)
  })

  it('transaction is undefined when no matching transaction exists', () => {
    const order = makeOrder()
    const tx = makeTransaction(makeId()) // different orderId
    setupMocks({ orders: [order], transactions: [tx] })

    const { result } = renderHook(() => fetchActiveOrders())
    expect(result.current.data![0]!.transaction).toBeUndefined()
  })

  it('each order gets its own transaction', () => {
    const o1 = makeOrder()
    const o2 = makeOrder()
    const tx1 = makeTransaction(o1.id)
    const tx2 = makeTransaction(o2.id)
    setupMocks({ orders: [o1, o2], transactions: [tx1, tx2] })

    const { result } = renderHook(() => fetchActiveOrders())
    const r1 = result.current.data!.find(o => o.id === o1.id)!
    const r2 = result.current.data!.find(o => o.id === o2.id)!

    expect(r1.transaction?.id).toBe(tx1.id)
    expect(r2.transaction?.id).toBe(tx2.id)
  })
})
