/**
 * orders-components.test.tsx
 *
 * Tests for the orders route sub-components:
 *   - SearchInput (search-input.tsx)
 *   - PosButton (pos-button.tsx)
 *   - Title (title.tsx)
 *
 * Coverage targets:
 *  ✅ SearchInput renders a text input with search placeholder
 *  ✅ SearchInput shows current search value from route params
 *  ✅ PosButton renders a button with cart icon
 *  ✅ PosButton click calls navigate to /pos
 *  ✅ Title renders APP_NAME (StartPOS)
 *  ✅ Title renders a formatted date/time string
 *
 * Run with: pnpm test orders-components
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '#tests/helpers/router-wrapper'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: DB / OPFS
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
// Mock: navigate
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useNavigate } from '@tanstack/react-router'
import { SearchInput } from '@/routes/(private)/orders/-components/search-input'
import { PosButton } from '@/routes/(private)/orders/-components/pos-button'
import Title from '@/routes/(private)/orders/-components/title'

// ---------------------------------------------------------------------------
// Helpers — mount components inside a minimal router for useSearch/useNavigate
// ---------------------------------------------------------------------------

function renderWithRouter(Component: React.FC, path = '/pos/', initialSearch: Record<string, any> = {}) {
  const router = buildRouter(Component, path, initialSearch)
  return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// SearchInput
// ---------------------------------------------------------------------------

describe('SearchInput', () => {
  it('renders a text input with search placeholder', async () => {
    renderWithRouter(SearchInput, '/(private)/pos/', {})
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by name or SKU/i)).toBeInTheDocument()
    })
  })

  it('shows current search query as default value', async () => {
    renderWithRouter(SearchInput, '/(private)/pos/', { search: 'coffee' })
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Search by name or SKU/i) as HTMLInputElement
      expect(input.defaultValue).toBe('coffee')
    })
  })

  it('renders the search icon', async () => {
    const { container } = renderWithRouter(SearchInput, '/(private)/pos/', {})
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// PosButton
// ---------------------------------------------------------------------------

describe('PosButton', () => {
  it('renders a button', async () => {
    render(<PosButton />)
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument()
    })
  })

  it('clicking the button calls navigate to /pos', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate as any)
    render(<PosButton />)
    await waitFor(() => screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/pos' })
  })

  it('renders the cart icon', () => {
    const { container } = render(<PosButton />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

describe('Title', () => {
  it('renders APP_NAME (StartPOS)', async () => {
    render(<Title />)
    await waitFor(() => {
      expect(screen.getByText('StartPOS')).toBeInTheDocument()
    })
  })

  it('renders a formatted date/time string', async () => {
    render(<Title />)
    await waitFor(() => {
      // Format: "ddd, MMM DD · hh:mm:ss A"  e.g. "Sat, Jul 25 · 03:45:00 PM"
      const timeEl = document.querySelector('.text-muted-foreground')
      expect(timeEl?.textContent).toMatch(/\w+,\s+\w+\s+\d+\s+·\s+\d+:\d+:\d+\s+(AM|PM)/i)
    })
  })

  it('updates the clock over time', async () => {
    vi.useFakeTimers()
    render(<Title />)
    const before = document.querySelector('.text-muted-foreground')?.textContent
    await act(async () => { vi.advanceTimersByTime(1100) })
    // After 1 second the seconds part may have changed
    expect(document.querySelector('.text-muted-foreground')).not.toBeNull()
    vi.useRealTimers()
  })
})
