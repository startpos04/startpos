/**
 * header.test.tsx
 *
 * Component tests for PosHeader.
 *
 * Strategy:
 *  - Heavy sub-components (ThemeToggle, ProfileDropdown, Title, SearchInput)
 *    are mocked as simple stubs so tests focus purely on PosHeader's own logic:
 *    conditional ActiveOrdersButton rendering based on ENABLE_ORDER flag.
 *  - authStore is seeded via seedMockUser.
 *  - OPFS / DB mocks from the established pattern are included to prevent
 *    transitive OPFS initialization.
 *
 * Coverage targets (Task 4):
 *  ✅ Header renders
 *  ✅ ActiveOrdersButton rendered when ENABLE_ORDER = true
 *  ✅ ActiveOrdersButton NOT rendered when ENABLE_ORDER = false
 *  ✅ SearchInput rendered
 *
 * Run with: pnpm test header
 */

import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-router — preserve all exports, stub hooks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useSearch: vi.fn(() => ({ search: '', page: 1, pageSize: 20 })),
    useNavigate: vi.fn(() => vi.fn()),
  }
})

// ---------------------------------------------------------------------------
// Mock: OPFS / DB — prevent initialization in jsdom
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
// Mock: heavy sub-components — keep tests focused on PosHeader logic
// ---------------------------------------------------------------------------

vi.mock('@/components/custom/theme/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid='theme-toggle' />,
}))

vi.mock('@/routes/(private)/orders/-components/profile-dropdown', () => ({
  ProfileDropdown: () => <div data-testid='profile-dropdown' />,
}))

vi.mock('@/routes/(private)/orders/-components/search-input', () => ({
  SearchInput: () => <input data-testid='search-input' placeholder='Search by name or SKU...' />,
}))

vi.mock('@/routes/(private)/orders/-components/title', () => ({
  default: () => <div data-testid='title' />,
}))

vi.mock('@/lib/overlay', () => ({
  showModal: vi.fn().mockResolvedValue('modal-id'),
  delModal: vi.fn(),
}))

vi.mock('@/routes/(private)/pos/-components/active-orders-btn', () => ({
  ActiveOrdersButton: () => <button data-testid='active-orders-btn'>Orders</button>,
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { PosHeader } from '@/routes/(private)/pos/-components/header'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PosHeader — rendering', () => {
  it('renders the header element', () => {
    render(<PosHeader />)
    expect(document.querySelector('header')).toBeInTheDocument()
  })

  it('renders the SearchInput', () => {
    render(<PosHeader />)
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
  })

  it('renders ThemeToggle', () => {
    render(<PosHeader />)
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
  })

  it('renders ProfileDropdown', () => {
    render(<PosHeader />)
    expect(screen.getByTestId('profile-dropdown')).toBeInTheDocument()
  })

  it('renders Title', () => {
    render(<PosHeader />)
    expect(screen.getByTestId('title')).toBeInTheDocument()
  })
})

describe('PosHeader — conditional ActiveOrdersButton', () => {
  it('renders ActiveOrdersButton when ENABLE_ORDER is true', () => {
    seedMockUser({ systemConfigs: { ENABLE_ORDER: true } } as any)
    render(<PosHeader />)
    expect(screen.getByTestId('active-orders-btn')).toBeInTheDocument()
  })

  it('does NOT render ActiveOrdersButton when ENABLE_ORDER is false', () => {
    seedMockUser({ systemConfigs: { ENABLE_ORDER: false } } as any)
    render(<PosHeader />)
    expect(screen.queryByTestId('active-orders-btn')).not.toBeInTheDocument()
  })
})
