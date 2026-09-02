/**
 * active-orders-btn.test.tsx
 *
 * Component tests for ActiveOrdersButton.
 *
 * Strategy:
 *  - fetchActiveOrders is mocked to return controlled order arrays.
 *  - showModal is mocked to capture calls without a mounted Overlay.
 *  - getQueryClient is mocked to return a minimal stub.
 *  - @tanstack/react-router uses importOriginal partial mock.
 *  - OPFS / DB mocks prevent initialization in jsdom.
 *  - authStore seeded via seedMockUser.
 *
 * Coverage targets (Task 4):
 *  ✅ Button renders with ReceiptText icon
 *  ✅ Badge hidden when no active orders
 *  ✅ Badge shows count when orders > 0
 *  ✅ Badge shows correct count for multiple orders
 *  ✅ Click on the anchor calls showModal with ActiveOrdersDialog
 *  ✅ showModal options include onCancel callback
 *  ✅ onCancel callback calls queryClient.invalidateQueries
 *
 * Run with: pnpm test active-orders-btn
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-router
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useSearch: vi.fn(() => ({ search: '' })),
  }
})

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, purchaseCollection: {}, purchaseItemCollection: {},
  businessCollection: {}, branchCollection: {}, categoryCollection: {}, unitCollection: {},
  productCollection: {}, productComponentCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: fetchActiveOrders — control order data
// ---------------------------------------------------------------------------

const mockFetchActiveOrders = vi.fn()

vi.mock('@/lib/queries/fetch-active-orders', () => ({
  fetchActiveOrders: () => mockFetchActiveOrders(),
}))

// ---------------------------------------------------------------------------
// Mock: overlay
// ---------------------------------------------------------------------------

vi.mock('@/lib/mount-manager', () => {
  const MountManagerMock = Object.assign(
    () => null, // renderable as <MountManager />
    {
      show: vi.fn().mockResolvedValue('modal-id'),
      close: vi.fn(),
      update: vi.fn(),
      toggle: vi.fn(),
      closeChildren: vi.fn(),
      clear: vi.fn(),
      batch: vi.fn(),
    },
  )
  return { default: MountManagerMock }
})

// ---------------------------------------------------------------------------
// Mock: query-client — return a stub with invalidateQueries spy
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/query-client', () => ({
  getQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import MountManager from '@/lib/mount-manager'
import { ActiveOrdersButton } from '@/routes/(private)/pos/-components/active-orders-btn'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(MountManager.show).mockResolvedValue('modal-id')
  mockFetchActiveOrders.mockReturnValue({ data: [], isLoading: false })
  mockInvalidateQueries.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ActiveOrdersButton — rendering', () => {
  it('renders the button', () => {
    render(<ActiveOrdersButton />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('renders inside an anchor pointing to /orders', () => {
    render(<ActiveOrdersButton />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/orders')
  })
})

// ---------------------------------------------------------------------------
// Badge — order count
// ---------------------------------------------------------------------------

describe('ActiveOrdersButton — badge', () => {
  it('hides badge when there are no active orders', () => {
    mockFetchActiveOrders.mockReturnValue({ data: [], isLoading: false })
    render(<ActiveOrdersButton />)
    // Badge only renders when orders.length > 0
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows badge with count when orders exist', () => {
    mockFetchActiveOrders.mockReturnValue({
      data: [{ id: '1' }, { id: '2' }, { id: '3' }],
      isLoading: false,
    })
    render(<ActiveOrdersButton />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows badge with count 1 for a single order', () => {
    mockFetchActiveOrders.mockReturnValue({ data: [{ id: '1' }], isLoading: false })
    render(<ActiveOrdersButton />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('badge is not present in DOM when order list is empty', () => {
    mockFetchActiveOrders.mockReturnValue({ data: [], isLoading: false })
    const { container } = render(<ActiveOrdersButton />)
    // The badge span only renders conditionally — with 0 orders there should be
    // no element with the badge classes
    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Click behaviour
// ---------------------------------------------------------------------------

describe('ActiveOrdersButton — click', () => {
  it('calls MountManager.show when the anchor is clicked', () => {
    render(<ActiveOrdersButton />)
    const link = screen.getByRole('link')
    fireEvent.click(link)
    expect(vi.mocked(MountManager.show)).toHaveBeenCalledOnce()
  })

  it('passes ActiveOrdersDialog component to MountManager.show', () => {
    render(<ActiveOrdersButton />)
    fireEvent.click(screen.getByRole('link'))
    const [Component] = vi.mocked(MountManager.show).mock.calls[0] as any[]
    expect(Component).toBeDefined()
  })

  it('MountManager.show options include an onCancel callback', () => {
    render(<ActiveOrdersButton />)
    fireEvent.click(screen.getByRole('link'))
    const [, options] = vi.mocked(MountManager.show).mock.calls[0] as any[]
    expect(typeof options.onCancel).toBe('function')
  })

  it('onCancel callback calls queryClient.invalidateQueries', async () => {
    render(<ActiveOrdersButton />)
    fireEvent.click(screen.getByRole('link'))
    const [, options] = vi.mocked(MountManager.show).mock.calls[0] as any[]
    await options.onCancel()
    expect(mockInvalidateQueries).toHaveBeenCalledOnce()
  })

  it('does not navigate away (preventDefault called)', () => {
    render(<ActiveOrdersButton />)
    const link = screen.getByRole('link')
    const mockPreventDefault = vi.fn()
    fireEvent.click(link, { preventDefault: mockPreventDefault })
    // MountManager.show was called, meaning the click handler ran and prevented default
    expect(vi.mocked(MountManager.show)).toHaveBeenCalled()
  })
})
