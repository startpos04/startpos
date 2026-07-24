/**
 * fetch-pos-products.test.ts
 *
 * Tests for fetchPosProducts hook.
 *
 * Strategy:
 *  - `useLiveQuery` from @tanstack/react-db is mocked to return controlled
 *    data arrays, bypassing OPFS/DB entirely.
 *  - Each call to useLiveQuery in fetchPosProducts maps to a specific
 *    query (inventories, totalCount, result) — we identify them by call order.
 *  - OPFS / DB collections mocked to prevent initialization.
 *  - renderHook from RTL used to execute the hook and inspect its return value.
 *
 * Coverage:
 *  - Returns products with category and baseUnit joined
 *  - Returns products with variants populated
 *  - Inventory correctly attached to variants from inventories query
 *  - totalItems calculation (subtracts 2 when no search query)
 *  - totalItems not subtracted when searchQuery present
 *  - isLoading combines both query loading states
 *  - Returns empty data when no products
 *
 * Run with: pnpm test fetch-pos-products
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser, makeId } from '@/lib/__tests__/helpers'

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
  categoryCollection: {}, inventoryCollection: {}, productCollection: {},
  productComponentCollection: {}, productVariantCollection: {}, unitCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryMovementCollection: {}, transactionCollection: {}, transactionTaxLineCollection: {},
  paymentCollection: {}, sequenceCounterCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  userCollection: {}, locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock import
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { fetchPosProducts } from '@/lib/queries/fetch-pos-products'

// ---------------------------------------------------------------------------
// Helpers — build minimal product/variant/inventory fixtures
// ---------------------------------------------------------------------------

function makeVariant(productId: string, overrides = {}) {
  return {
    id: makeId(),
    productId,
    name: 'Regular',
    price: 11200,
    costPrice: 5000,
    sku: 'SKU-001',
    isAvailable: true,
    taxCategory: 'STANDARD',
    inventory: [],
    components: [],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeProductRow(overrides = {}) {
  const id = makeId()
  return {
    id,
    name: 'Americano',
    type: 'PHYSICAL_GOOD',
    isAvailable: true,
    categoryId: makeId(),
    baseUnitId: 'unit-base',
    category: { id: makeId(), name: 'Coffee' },
    baseUnit: { id: 'unit-base', name: 'Piece', abbreviation: 'pc' },
    variants: [makeVariant(id)],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    ...overrides,
  }
}

function makeInventory(variantId: string) {
  return {
    id: makeId(),
    variantId,
    quantity: 10,
    costPrice: 5000,
    batchNumber: 'DEFAULT',
    unitId: 'unit-base',
    locationId: null,
    expiryDate: null,
    lastRestocked: new Date(),
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// fetchPosProducts calls useLiveQuery 3 times:
//   call 0 → inventories query
//   call 1 → totalCountResult
//   call 2 → result (product list)
function setupMocks({
  products = [] as any[],
  inventories = [] as any[],
  totalCount = 0,
  isLoading = false,
} = {}) {
  vi.mocked(useLiveQuery)
    .mockReturnValueOnce({ data: inventories, isLoading }) // inventories
    .mockReturnValueOnce({ data: [{ total: totalCount }], isLoading }) // totalCount
    .mockReturnValueOnce({ data: products, isLoading }) // product list
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

describe('fetchPosProducts — basic return shape', () => {
  it('returns empty data array when no products exist', () => {
    setupMocks({ products: [], totalCount: 0 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.data).toHaveLength(0)
  })

  it('returns products with category and baseUnit', () => {
    const product = makeProductRow()
    setupMocks({ products: [product], totalCount: 3 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.data[0]?.category?.name).toBe('Coffee')
    expect(result.current.data[0]?.baseUnit?.name).toBe('Piece')
  })

  it('returns variants nested on each product', () => {
    const product = makeProductRow()
    setupMocks({ products: [product], totalCount: 3 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.data[0]?.variants).toHaveLength(1)
  })

  it('returns multiple products', () => {
    const products = [makeProductRow({ name: 'Latte' }), makeProductRow({ name: 'Espresso' })]
    setupMocks({ products, totalCount: 4 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.data).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Inventory attachment
// ---------------------------------------------------------------------------

describe('fetchPosProducts — inventory attachment', () => {
  it('attaches matching inventory records to variant.inventory', () => {
    const product = makeProductRow()
    const variantId = product.variants[0].id
    const inv = makeInventory(variantId)
    setupMocks({ products: [product], inventories: [inv], totalCount: 3 })

    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    const variant = result.current.data[0]?.variants[0]
    expect(variant?.inventory).toHaveLength(1)
    expect(variant?.inventory[0]?.variantId).toBe(variantId)
  })

  it('does not attach inventory from different variant', () => {
    const product = makeProductRow()
    const otherVariantId = makeId()
    const inv = makeInventory(otherVariantId) // belongs to a different variant
    setupMocks({ products: [product], inventories: [inv], totalCount: 3 })

    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    const variant = result.current.data[0]?.variants[0]
    expect(variant?.inventory).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// totalItems calculation
// ---------------------------------------------------------------------------

describe('fetchPosProducts — totalItems', () => {
  it('subtracts 2 from totalCount when no searchQuery', () => {
    setupMocks({ products: [], totalCount: 10 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.totalItems).toBe(8) // 10 - 2
  })

  it('does NOT subtract 2 when searchQuery is provided', () => {
    setupMocks({ products: [], totalCount: 5 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20, searchQuery: 'coffee' }))
    expect(result.current.totalItems).toBe(5) // no subtraction
  })

  it('totalItems is never negative (clamps to 0)', () => {
    setupMocks({ products: [], totalCount: 1 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    // 1 - 2 = -1, but Math.max(0, ...) clamps it
    expect(result.current.totalItems).toBe(0)
  })

  it('totalItems is 0 when totalCount is 0', () => {
    setupMocks({ products: [], totalCount: 0 })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.totalItems).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('fetchPosProducts — isLoading', () => {
  it('isLoading is false when all queries complete', () => {
    setupMocks({ isLoading: false })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.isLoading).toBe(false)
  })

  it('isLoading is true when any query is loading', () => {
    setupMocks({ isLoading: true })
    const { result } = renderHook(() => fetchPosProducts({ page: 1, pageSize: 20 }))
    expect(result.current.isLoading).toBe(true)
  })
})
