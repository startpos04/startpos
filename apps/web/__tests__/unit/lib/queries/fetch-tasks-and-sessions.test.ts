/**
 * fetch-tasks-and-sessions.test.ts
 *
 * Consolidated tests for Task 8:
 *   fetchTasks, fetchVendorSessionOptions, fetchUserOptions
 *
 * Strategy:
 *  - useLiveQuery mocked via importOriginal partial mock (vi.fn() inline).
 *  - All three hooks call useLiveQuery and return its data with optional mapping.
 *  - fetchTasks additionally accepts an optional taskId dependency.
 *  - renderHook from RTL used to invoke each hook.
 *
 * Coverage:
 *  fetchTasks:
 *    - Returns empty array when no tasks
 *    - Returns tasks with user relations (clerk, creator, reviewer, approver, canceler)
 *    - Returns multiple tasks
 *    - isLoading forwarded
 *    - taskId passed as useLiveQuery dependency
 *    - Works without taskId
 *
 *  fetchVendorSessionOptions:
 *    - Maps vendor sessions to { label: user.name, value: id, data }
 *    - Handles user.name being null/empty → empty string label
 *    - Returns empty array when no sessions
 *    - Multiple sessions all mapped
 *    - isLoading forwarded
 *
 *  fetchUserOptions:
 *    - Maps users to { label: name, value: id, data }
 *    - Returns empty array when no users
 *    - Multiple users all mapped
 *    - isLoading forwarded
 *
 * Run with: pnpm test fetch-tasks-and-sessions
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser, makeId } from '#tests/helpers'

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
  operationalTaskCollection: {}, userCollection: {}, vendorSessionCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { fetchTasks } from '@/lib/queries/fetch-tasks'
import { fetchVendorSessionOptions } from '@/lib/queries/fetch-vendor-session-options'
import { fetchUserOptions } from '@/lib/queries/fetch-user-options'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mock = vi.mocked(useLiveQuery)

function seed(data: any[], isLoading = false) {
  mock.mockReturnValue({ data, isLoading } as any)
}

function makeUser(overrides = {}) {
  return { id: makeId(), name: 'Jane Doe', email: 'jane@test.com', ...overrides }
}

function makeTask(overrides = {}) {
  const id = makeId()
  const user = makeUser()
  return {
    id,
    title: 'Restock Flour',
    status: 'PENDING',
    clerkId: user.id,
    creatorId: user.id,
    reviewerId: null,
    approverId: null,
    cancelerId: null,
    clerk: user,
    creator: user,
    reviewer: null,
    approver: null,
    canceler: null,
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeVendorSession(overrides = {}) {
  const id = makeId()
  const user = makeUser()
  return { id, userId: user.id, user, createdAt: new Date(), ...overrides }
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
// fetchTasks
// ---------------------------------------------------------------------------

describe('fetchTasks — basic return shape', () => {
  it('returns empty array when no tasks', () => {
    seed([])
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.data).toHaveLength(0)
  })

  it('returns task with user relations attached', () => {
    const task = makeTask()
    seed([task])
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.data![0]!.title).toBe('Restock Flour')
    expect(result.current.data![0]!.clerk).toBeDefined()
    expect(result.current.data![0]!.creator).toBeDefined()
  })

  it('returns multiple tasks', () => {
    seed([makeTask({ title: 'Task A' }), makeTask({ title: 'Task B' })])
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.data).toHaveLength(2)
  })

  it('task with no clerk/approver has null for those relations', () => {
    const task = makeTask({ clerk: null, approver: null, reviewer: null })
    seed([task])
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.data![0]!.clerk).toBeNull()
    expect(result.current.data![0]!.approver).toBeNull()
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.isLoading).toBe(true)
  })

  it('isLoading false when complete', () => {
    seed([])
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.isLoading).toBe(false)
  })
})

describe('fetchTasks — taskId parameter', () => {
  it('works without taskId (returns all tasks)', () => {
    seed([makeTask(), makeTask()])
    const { result } = renderHook(() => fetchTasks())
    expect(result.current.data).toHaveLength(2)
  })

  it('works with a specific taskId', () => {
    const id = makeId()
    const task = makeTask({ id })
    seed([task])
    const { result } = renderHook(() => fetchTasks(id))
    expect(result.current.data![0]!.id).toBe(id)
  })

  it('passes taskId as useLiveQuery dependency', () => {
    seed([])
    const id = makeId()
    renderHook(() => fetchTasks(id))
    const depsArg = mock.mock.calls[0]![1]
    expect(depsArg).toContain(id)
  })

  it('passes [undefined] as dependency when no taskId given', () => {
    seed([])
    renderHook(() => fetchTasks())
    const depsArg = mock.mock.calls[0]![1]
    expect(Array.isArray(depsArg)).toBe(true)
    expect(depsArg[0]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// fetchVendorSessionOptions
// ---------------------------------------------------------------------------

describe('fetchVendorSessionOptions — mapping', () => {
  it('maps sessions to { label: user.name, value: id, data }', () => {
    const session = makeVendorSession()
    seed([session])
    const { result } = renderHook(() => fetchVendorSessionOptions())
    expect(result.current.data![0]!.label).toBe('Jane Doe')
    expect(result.current.data![0]!.value).toBe(session.id)
    expect(result.current.data![0]!.data).toMatchObject({ id: session.id })
  })

  it('label is empty string when user.name is null', () => {
    const session = makeVendorSession({ user: { id: makeId(), name: null } })
    seed([session])
    const { result } = renderHook(() => fetchVendorSessionOptions())
    expect(result.current.data![0]!.label).toBe('')
  })

  it('returns empty array when no vendor sessions', () => {
    seed([])
    const { result } = renderHook(() => fetchVendorSessionOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple sessions', () => {
    seed([makeVendorSession(), makeVendorSession()])
    const { result } = renderHook(() => fetchVendorSessionOptions())
    expect(result.current.data).toHaveLength(2)
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchVendorSessionOptions())
    expect(result.current.isLoading).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchUserOptions
// ---------------------------------------------------------------------------

describe('fetchUserOptions — mapping', () => {
  it('maps users to { label: name, value: id, data }', () => {
    const user = makeUser()
    seed([user])
    const { result } = renderHook(() => fetchUserOptions())
    expect(result.current.data![0]!.label).toBe('Jane Doe')
    expect(result.current.data![0]!.value).toBe(user.id)
    expect(result.current.data![0]!.data).toMatchObject({ id: user.id })
  })

  it('returns empty array when no users', () => {
    seed([])
    const { result } = renderHook(() => fetchUserOptions())
    expect(result.current.data).toHaveLength(0)
  })

  it('maps multiple users', () => {
    seed([makeUser({ name: 'Alice' }), makeUser({ name: 'Bob' })])
    const { result } = renderHook(() => fetchUserOptions())
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data!.map(u => u.label)).toEqual(['Alice', 'Bob'])
  })

  it('forwards isLoading', () => {
    seed([], true)
    const { result } = renderHook(() => fetchUserOptions())
    expect(result.current.isLoading).toBe(true)
  })

  it('isLoading false when complete', () => {
    seed([])
    const { result } = renderHook(() => fetchUserOptions())
    expect(result.current.isLoading).toBe(false)
  })
})
