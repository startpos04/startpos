/**
 * fetch-ingredients.test.ts
 *
 * Tests for fetchIngredients hook.
 *
 * Strategy:
 *  - `useLiveQuery` mocked to return controlled data.
 *  - fetchIngredients calls useLiveQuery once, returning a fully shaped result.
 *  - Tests verify the return shape and that the optional ingredientId param
 *    is passed as a dependency (re-run key).
 *
 * Coverage:
 *  - Returns empty array when no ingredients
 *  - Returns raw material products with nested variants, inventory, usedIn
 *  - Variants include nested inventory and usedIn relations
 *  - Result passed through as-is (no post-processing transform)
 *  - isLoading forwarded from useLiveQuery
 *
 * Run with: pnpm test fetch-ingredients
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
  categoryCollection: {}, inventoryCollection: {}, locationCollection: {},
  productCollection: {}, productComponentCollection: {}, productVariantCollection: {},
  unitCollection: {}, orderCollection: {}, orderItemCollection: {},
  orderItemAddonCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  purchaseCollection: {}, purchaseItemCollection: {}, businessCollection: {},
  branchCollection: {}, userCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock import
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIngredientProduct(overrides = {}) {
  const id = makeId()
  const variantId = makeId()
  return {
    id,
    name: 'All-Purpose Flour',
    type: 'RAW_MATERIAL',
    isAvailable: true,
    categoryId: makeId(),
    baseUnitId: 'unit-base',
    category: { id: makeId(), name: 'Dry Goods' },
    baseUnit: { id: 'unit-base', name: 'Kilogram', abbreviation: 'kg' },
    variants: [
      {
        id: variantId,
        productId: id,
        name: '1kg Bag',
        price: 0,
        costPrice: 8000,
        sku: 'FLOUR-001',
        inventory: [
          {
            id: makeId(),
            variantId,
            quantity: 25,
            costPrice: 8000,
            batchNumber: 'BN-001',
            unit: { id: 'unit-base', name: 'Kilogram' },
            location: null,
          },
        ],
        usedIn: [
          {
            id: makeId(),
            materialId: variantId,
            hostId: makeId(),
            quantityUsed: 0.5,
            host: {
              id: makeId(),
              name: 'Pastry Dough',
              product: { id: makeId(), name: 'Croissant' },
            },
          },
        ],
        components: [],
      },
    ],
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
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

describe('fetchIngredients — basic return shape', () => {
  it('returns empty array when no ingredients', () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false })
    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.data).toHaveLength(0)
  })

  it('returns ingredient products with name and type', () => {
    const ingredient = makeIngredientProduct()
    vi.mocked(useLiveQuery).mockReturnValue({ data: [ingredient], isLoading: false })

    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.data![0]!.name).toBe('All-Purpose Flour')
    expect(result.current.data![0]!.type).toBe('RAW_MATERIAL')
  })

  it('returns category and baseUnit joined on the product', () => {
    const ingredient = makeIngredientProduct()
    vi.mocked(useLiveQuery).mockReturnValue({ data: [ingredient], isLoading: false })

    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.data![0]!.category?.name).toBe('Dry Goods')
    expect(result.current.data![0]!.baseUnit?.name).toBe('Kilogram')
  })

  it('returns multiple ingredients', () => {
    const i1 = makeIngredientProduct({ name: 'Salt' })
    const i2 = makeIngredientProduct({ name: 'Sugar' })
    vi.mocked(useLiveQuery).mockReturnValue({ data: [i1, i2], isLoading: false })

    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.data).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Nested variants
// ---------------------------------------------------------------------------

describe('fetchIngredients — nested variants', () => {
  it('variants array is populated on each ingredient', () => {
    const ingredient = makeIngredientProduct()
    vi.mocked(useLiveQuery).mockReturnValue({ data: [ingredient], isLoading: false })

    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.data![0]!.variants).toHaveLength(1)
  })

  it('variant inventory is populated with batch records', () => {
    const ingredient = makeIngredientProduct()
    vi.mocked(useLiveQuery).mockReturnValue({ data: [ingredient], isLoading: false })

    const { result } = renderHook(() => fetchIngredients())
    const variant = result.current.data![0]!.variants[0]!
    expect(variant.inventory).toHaveLength(1)
    expect(variant.inventory[0]!.quantity).toBe(25)
  })

  it('variant usedIn lists components that consume this ingredient', () => {
    const ingredient = makeIngredientProduct()
    vi.mocked(useLiveQuery).mockReturnValue({ data: [ingredient], isLoading: false })

    const { result } = renderHook(() => fetchIngredients())
    const variant = result.current.data![0]!.variants[0]!
    expect(variant.usedIn).toHaveLength(1)
    expect(variant.usedIn[0]!.host.product.name).toBe('Croissant')
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('fetchIngredients — loading state', () => {
  it('isLoading is false when query completes', () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false })
    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.isLoading).toBe(false)
  })

  it('isLoading is true while query is pending', () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: true })
    const { result } = renderHook(() => fetchIngredients())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ingredientId dependency
// ---------------------------------------------------------------------------

describe('fetchIngredients — ingredientId parameter', () => {
  it('can be called without ingredientId', () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false })
    expect(() => renderHook(() => fetchIngredients())).not.toThrow()
  })

  it('can be called with an ingredientId', () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false })
    expect(() => renderHook(() => fetchIngredients('some-id'))).not.toThrow()
  })

  it('passes ingredientId as useLiveQuery dependency', () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false })
    const id = makeId()
    renderHook(() => fetchIngredients(id))
    const depsArg = vi.mocked(useLiveQuery).mock.calls[0]![1]
    expect(depsArg).toContain(id)
  })
})
