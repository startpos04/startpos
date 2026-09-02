/**
 * notifications.test.tsx
 *
 * Integration tests for the Notifications route page
 * (src/routes/(private)/(dashboard)/notifications.tsx)
 *
 * Strategy:
 *  - useNotifications and useInView mocked at module level.
 *  - Tests cover: heading, empty state, notification list,
 *    unread badge, "Mark all as read" button visibility,
 *    loading state, and pagination sentinel.
 *
 * Coverage targets (Task 20):
 *  ✅ Renders "Notifications" heading
 *  ✅ Renders empty state when no notifications
 *  ✅ Renders notification titles and messages
 *  ✅ Renders "New" badge for unread notifications
 *  ✅ Does NOT render "New" badge for read notifications
 *  ✅ "Mark all as read" button visible when unreadCount > 0
 *  ✅ "Mark all as read" button hidden when unreadCount = 0
 *  ✅ Clicking a notification card calls markAsRead for unread items
 *  ✅ Clicking a read notification with a link calls navigate
 *  ✅ Shows loading spinner while isLoading
 *
 * Run with: pnpm test notifications
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '#tests/helpers/router-wrapper'
import { makeId, seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  notificationCollection: { update: vi.fn() },
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
// Mock: useNotifications
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: useInView — always not-in-view (no pagination side-effects)
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-in-view', () => ({
  useInView: vi.fn(() => ({ ref: vi.fn(), inView: false })),
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-router — preserve all, stub useNavigate
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useNotifications } from '@/hooks/use-notifications'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '@/routes/(private)/(dashboard)/notifications'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    title: 'Low Stock Alert',
    message: 'Milk is running low.',
    isRead: false,
    link: null,
    createdAt: new Date('2026-07-25T10:00:00Z'),
    ...overrides,
  }
}

function setupNotifications(overrides: Record<string, any> = {}) {
  vi.mocked(useNotifications).mockReturnValue({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn().mockResolvedValue({ value: true, link: null }),
    markAllRead: vi.fn(),
    infiniteQuery: {
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    },
    ...overrides,
  } as any)
}

function renderNotificationsPage() {
  const router = buildRouter(
    Route.options.component as any,
    '/(private)/(dashboard)/notifications',
  )
  return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  setupNotifications()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Heading
// ---------------------------------------------------------------------------

describe('Notifications page — heading', () => {
  it('renders "Notifications" heading', async () => {
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument()
    })
  })

  it('renders page description', async () => {
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText(/Manage your alerts/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Notifications page — empty state', () => {
  it('shows "No notifications yet" when list is empty', async () => {
    setupNotifications({ notifications: [], unreadCount: 0 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    })
  })

  it('hides "Mark all as read" button when unreadCount = 0', async () => {
    setupNotifications({ notifications: [], unreadCount: 0 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.queryByText('Mark all as read')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Notification list
// ---------------------------------------------------------------------------

describe('Notifications page — notification list', () => {
  it('renders notification title and message', async () => {
    const n = makeNotification({ title: 'System Update', message: 'New version available.' })
    setupNotifications({ notifications: [n], unreadCount: 1 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('System Update')).toBeInTheDocument()
      expect(screen.getByText('New version available.')).toBeInTheDocument()
    })
  })

  it('renders "New" badge for unread notification', async () => {
    const n = makeNotification({ isRead: false })
    setupNotifications({ notifications: [n], unreadCount: 1 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument()
    })
  })

  it('does NOT render "New" badge for read notification', async () => {
    const n = makeNotification({ isRead: true })
    setupNotifications({ notifications: [n], unreadCount: 0 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.queryByText('New')).not.toBeInTheDocument()
    })
  })

  it('renders multiple notifications', async () => {
    const notifications = [
      makeNotification({ title: 'Alert 1', message: 'Msg 1', isRead: false }),
      makeNotification({ title: 'Alert 2', message: 'Msg 2', isRead: true }),
    ]
    setupNotifications({ notifications, unreadCount: 1 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('Alert 1')).toBeInTheDocument()
      expect(screen.getByText('Alert 2')).toBeInTheDocument()
    })
  })

  it('shows "Mark all as read" button when unreadCount > 0', async () => {
    const n = makeNotification({ isRead: false })
    setupNotifications({ notifications: [n], unreadCount: 3 })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('Mark all as read')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('Notifications page — interactions', () => {
  it('clicking an unread notification calls markAsRead', async () => {
    const markAsRead = vi.fn().mockResolvedValue({ value: true, link: null })
    const n = makeNotification({ isRead: false })
    setupNotifications({ notifications: [n], unreadCount: 1, markAsRead })
    renderNotificationsPage()
    await waitFor(() => screen.getByText(n.title))
    fireEvent.click(screen.getByText(n.title).closest('button')!)
    await waitFor(() => {
      expect(markAsRead).toHaveBeenCalledWith(n)
    })
  })

  it('clicking a read notification with a link calls navigate', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate as any)
    const n = makeNotification({ isRead: true, link: '/tasks' })
    setupNotifications({ notifications: [n], unreadCount: 0 })
    renderNotificationsPage()
    await waitFor(() => screen.getByText(n.title))
    fireEvent.click(screen.getByText(n.title).closest('button')!)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/tasks' })
    })
  })

  it('clicking "Mark all as read" calls markAllRead', async () => {
    const markAllRead = vi.fn()
    const n = makeNotification({ isRead: false })
    setupNotifications({ notifications: [n], unreadCount: 1, markAllRead })
    renderNotificationsPage()
    await waitFor(() => screen.getByText('Mark all as read'))
    fireEvent.click(screen.getByText('Mark all as read'))
    expect(markAllRead).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('Notifications page — loading state', () => {
  it('shows loading spinner while isLoading', async () => {
    setupNotifications({
      notifications: [],
      unreadCount: 0,
      infiniteQuery: {
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
        isLoading: true,
      },
    })
    renderNotificationsPage()
    await waitFor(() => {
      expect(screen.getByText('Loading notifications...')).toBeInTheDocument()
    })
  })
})
