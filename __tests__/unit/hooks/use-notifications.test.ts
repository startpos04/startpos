/**
 * use-notifications.test.ts
 *
 * Tests for useNotifications hook.
 *
 * Strategy:
 *  - useLiveQuery and useLiveInfiniteQuery mocked via importOriginal partial mock.
 *  - notificationCollection mocked to control values() and update() calls.
 *  - renderHook from RTL used to invoke the hook.
 *
 * Coverage:
 *  - unreadCount returns 0 when no unread notifications
 *  - unreadCount returns count from useLiveQuery result
 *  - notifications forwarded from infiniteQuery.data
 *  - markAsRead calls notificationCollection.update with isRead=true
 *  - markAsRead returns { value, link } on success
 *  - markAsRead returns null on error
 *  - markAllRead calls update for each unread notification
 *  - markAllRead does nothing when no unread items
 *
 * Run with: pnpm test use-notifications
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return {
    ...actual,
    useLiveQuery: vi.fn(),
    useLiveInfiniteQuery: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))

// ---------------------------------------------------------------------------
// Mock: notificationCollection with controllable values() and update()
// ---------------------------------------------------------------------------

vi.mock('@/db/collections', () => ({
  notificationCollection: {
    update: vi.fn(),
    values: vi.fn(() => []),
  },
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, operationalTaskCollection: {},
  vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery, useLiveInfiniteQuery } from '@tanstack/react-db'
import { notificationCollection } from '@/db/collections'
import { useNotifications } from '@/hooks/use-notifications'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockQuery = vi.mocked(useLiveQuery)
const mockInfiniteQuery = vi.mocked(useLiveInfiniteQuery)
const mockUpdate = vi.mocked(notificationCollection.update)
const mockValues = vi.mocked(notificationCollection.values as () => any[])

function makeNotification(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    isRead: false,
    title: 'Low Stock Alert',
    message: 'Item is low on stock',
    link: '/ingredients',
    createdAt: new Date(),
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    userId: 'user-001',
    ...overrides,
  }
}

function setupMocks({
  unreadCount = 0,
  notifications = [] as any[],
} = {}) {
  // useLiveQuery is called once for unread count
  mockQuery.mockReturnValue({ data: unreadCount > 0 ? [{ count: unreadCount }] : [] } as any)
  // useLiveInfiniteQuery for the list
  mockInfiniteQuery.mockReturnValue({
    data: notifications,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  } as any)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  mockUpdate.mockResolvedValue(undefined)
  mockValues.mockReturnValue([])
})

afterEach(() => {
  resetMockUser()
})

// ---------------------------------------------------------------------------
// unreadCount
// ---------------------------------------------------------------------------

describe('useNotifications — unreadCount', () => {
  it('returns 0 when no unread notifications', () => {
    setupMocks({ unreadCount: 0 })
    const { result } = renderHook(() => useNotifications())
    expect(result.current.unreadCount).toBe(0)
  })

  it('returns count from useLiveQuery result', () => {
    setupMocks({ unreadCount: 5 })
    const { result } = renderHook(() => useNotifications())
    expect(result.current.unreadCount).toBe(5)
  })

  it('returns 0 when useLiveQuery returns empty array', () => {
    mockQuery.mockReturnValue({ data: [] } as any)
    mockInfiniteQuery.mockReturnValue({ data: [], fetchNextPage: vi.fn(), hasNextPage: false } as any)
    const { result } = renderHook(() => useNotifications())
    expect(result.current.unreadCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// notifications list
// ---------------------------------------------------------------------------

describe('useNotifications — notification list', () => {
  it('forwards notifications from infiniteQuery.data', () => {
    const notif = makeNotification()
    setupMocks({ notifications: [notif] })
    const { result } = renderHook(() => useNotifications())
    expect(result.current.notifications).toEqual([notif])
  })

  it('returns empty array when no notifications', () => {
    setupMocks({ notifications: [] })
    const { result } = renderHook(() => useNotifications())
    expect(result.current.notifications).toHaveLength(0)
  })

  it('exposes infiniteQuery for pagination controls', () => {
    setupMocks()
    const { result } = renderHook(() => useNotifications())
    expect(result.current.infiniteQuery).toBeDefined()
    expect(typeof result.current.infiniteQuery.fetchNextPage).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// markAsRead
// ---------------------------------------------------------------------------

describe('useNotifications — markAsRead', () => {
  it('calls notificationCollection.update with the notification id', async () => {
    setupMocks()
    const { result } = renderHook(() => useNotifications())
    const notif = makeNotification()

    await act(async () => {
      await result.current.markAsRead(notif as any)
    })

    expect(mockUpdate).toHaveBeenCalledWith(notif.id, expect.any(Function))
  })

  it('returns { value, link } on success', async () => {
    setupMocks()
    const { result } = renderHook(() => useNotifications())
    const notif = makeNotification({ link: '/orders' })

    let response: any
    await act(async () => {
      response = await result.current.markAsRead(notif as any)
    })

    expect(response).toEqual({ value: notif, link: '/orders' })
  })

  it('returns null when update throws', async () => {
    setupMocks()
    mockUpdate.mockImplementationOnce(() => { throw new Error('DB error') })
    const { result } = renderHook(() => useNotifications())
    const notif = makeNotification()

    let response: any
    await act(async () => {
      response = await result.current.markAsRead(notif as any)
    })

    expect(response).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

describe('useNotifications — markAllRead', () => {
  it('calls update for each unread notification', async () => {
    const n1 = makeNotification({ isRead: false })
    const n2 = makeNotification({ isRead: false })
    mockValues.mockReturnValue([n1, n2])
    setupMocks()

    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith(n1.id, expect.any(Function))
    expect(mockUpdate).toHaveBeenCalledWith(n2.id, expect.any(Function))
  })

  it('does not call update when all notifications are already read', async () => {
    const n1 = makeNotification({ isRead: true })
    mockValues.mockReturnValue([n1])
    setupMocks()

    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when no notifications exist', async () => {
    mockValues.mockReturnValue([])
    setupMocks()

    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('skips already-read notifications in mixed list', async () => {
    const unread = makeNotification({ isRead: false })
    const read = makeNotification({ isRead: true })
    mockValues.mockReturnValue([unread, read])
    setupMocks()

    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(unread.id, expect.any(Function))
  })
})
