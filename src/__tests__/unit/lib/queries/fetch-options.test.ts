/**
 * fetch-options.test.ts
 *
 * Consolidated tests for all *-options fetch hooks:
 *   fetchBranchOptions, fetchCategoryOptions, fetchUnitOptions,
 *   fetchSupplierOptions, fetchLocationOptions, fetchProductVariantOptions
 *
 * Strategy:
 *  - All options hooks follow the same pattern:
 *      useLiveQuery → map raw records to { label, value, data }
 *  - useLiveQuery is mocked via importOriginal partial mock with vi.fn() inline.
 *  - Each test seeds the mock return value, calls renderHook, and asserts:
 *      1. Correct label/value mapping
 *      2. Raw data preserved on the `data` key
 *      3. Empty array when no records
 *      4. Multiple records all mapped
 *      5. isLoading forwarded
 *
 * Run with: pnpm test fetch-options
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser, makeId } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn() }
})

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  branchCollection: {}, categoryCollection: {}, unitCollection: {},
  supplierCollection: {}, locationCollection: {}, productVariantCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productComponentCollection: {}, purchaseCollection: {}, purchaseItemCollection: {},
  businessCollection: {}, productCollection: {}, userCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { fetchBranchOptions } from '@/lib/queries/fetch-branch-options'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { fetchLocationOptions } from '@/lib/queries/fetch-location-options'
import { fetchSupplierOptions } from '@/lib/queries/fetch-supplier-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mock = vi.mocked(useLiveQuery)

function seed(data: any[], isLoading = false) {
  mock.mockReturnValue({ data, isLoading } as any)
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
// fetchBranchOptions
// ---------------------------------------------------------------------------

describe('fetchBranchOptions', () => {
  it('maps branches to { label, value, data }', () => {
    const id = makeId()
    seed([{ id, name: 'Main Branch' }])
    const { result } = renderHook(() => fetchBranchOptions())
    expect(result.current.data![0]).toEqual({ label: 'Main Branch', value: id, data: { id, name: 'Main Branch' } })
  })

  it('returns empty array when no branches', () => {
    seed([])
    const { result } = renderHook(() => fetchBranchOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple branches', () => {
    seed([{ id: makeId(), name: 'Branch A' }, { id: makeId(), name: 'Branch B' }])
    const { result } = renderHook(() => fetchBranchOptions())
    expect(result.current.data).toHaveLength(2)
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchBranchOptions())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchCategoryOptions
// ---------------------------------------------------------------------------

describe('fetchCategoryOptions', () => {
  it('maps categories to { label, value, data }', () => {
    const id = makeId()
    seed([{ id, name: 'Beverages' }])
    const { result } = renderHook(() => fetchCategoryOptions())
    expect(result.current.data![0]).toEqual({ label: 'Beverages', value: id, data: { id, name: 'Beverages' } })
  })

  it('returns empty array when no categories', () => {
    seed([])
    const { result } = renderHook(() => fetchCategoryOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple categories', () => {
    seed([{ id: makeId(), name: 'Food' }, { id: makeId(), name: 'Drinks' }])
    const { result } = renderHook(() => fetchCategoryOptions())
    expect(result.current.data).toHaveLength(2)
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchCategoryOptions())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchUnitOptions
// ---------------------------------------------------------------------------

describe('fetchUnitOptions', () => {
  it('maps units to { label: "name (abbrev)", value, data }', () => {
    const id = makeId()
    seed([{ id, name: 'Kilogram', abbreviation: 'kg' }])
    const { result } = renderHook(() => fetchUnitOptions())
    expect(result.current.data![0]).toEqual({
      label: 'Kilogram (kg)',
      value: id,
      data: { id, name: 'Kilogram', abbreviation: 'kg' },
    })
  })

  it('returns empty array when no units', () => {
    seed([])
    const { result } = renderHook(() => fetchUnitOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple units', () => {
    seed([
      { id: makeId(), name: 'Kilogram', abbreviation: 'kg' },
      { id: makeId(), name: 'Piece', abbreviation: 'pc' },
    ])
    const { result } = renderHook(() => fetchUnitOptions())
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![1]!.label).toBe('Piece (pc)')
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchUnitOptions())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchSupplierOptions
// ---------------------------------------------------------------------------

describe('fetchSupplierOptions', () => {
  it('maps suppliers to { label, value, data }', () => {
    const id = makeId()
    seed([{ id, name: 'Fresh Farms Co.' }])
    const { result } = renderHook(() => fetchSupplierOptions())
    expect(result.current.data![0]).toEqual({
      label: 'Fresh Farms Co.',
      value: id,
      data: { id, name: 'Fresh Farms Co.' },
    })
  })

  it('returns empty array when no suppliers', () => {
    seed([])
    const { result } = renderHook(() => fetchSupplierOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple suppliers', () => {
    seed([{ id: makeId(), name: 'Supplier A' }, { id: makeId(), name: 'Supplier B' }])
    const { result } = renderHook(() => fetchSupplierOptions())
    expect(result.current.data).toHaveLength(2)
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchSupplierOptions())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchLocationOptions
// ---------------------------------------------------------------------------

describe('fetchLocationOptions', () => {
  it('maps locations to { label, value, data }', () => {
    const id = makeId()
    seed([{ id, name: 'Cold Storage' }])
    const { result } = renderHook(() => fetchLocationOptions())
    expect(result.current.data![0]).toEqual({
      label: 'Cold Storage',
      value: id,
      data: { id, name: 'Cold Storage' },
    })
  })

  it('returns empty array when no locations', () => {
    seed([])
    const { result } = renderHook(() => fetchLocationOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple locations', () => {
    seed([{ id: makeId(), name: 'Freezer' }, { id: makeId(), name: 'Pantry' }])
    const { result } = renderHook(() => fetchLocationOptions())
    expect(result.current.data).toHaveLength(2)
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchLocationOptions())
    expect(result.current.isLoading).toBe(true)
  })
})
