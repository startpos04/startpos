/**
 * settings.test.tsx
 *
 * Integration tests for the Settings route and its sub-pages:
 *   src/routes/(private)/(dashboard)/settings/index.tsx
 *   -categories/index.tsx, -locations/index.tsx
 *   -suppliers/index.tsx, -units/index.tsx
 *
 * Strategy:
 *  - The settings/index.tsx is a Tab shell that renders sub-page components
 *    directly (not via nested routes) — we mount each sub-page component
 *    individually using buildRouter for the ones that need router context,
 *    and plain render() for stateless sub-pages.
 *  - useLiveQuery is mocked at the module level to return seeded data.
 *  - Collections are mocked to empty objects (no OPFS).
 *
 * Coverage targets (Task 18):
 *  ✅ Settings route renders tab navigation (Units, Categories, Locations, Suppliers, Customers)
 *  ✅ CategoriesPage renders category names
 *  ✅ CategoriesPage renders "Product Categories" heading
 *  ✅ CategoriesPage renders empty table without crash
 *  ✅ LocationsPage renders "Store Locations" heading
 *  ✅ LocationsPage renders location name in row
 *  ✅ LocationsPage renders "—" fallback for null description/contact/address
 *  ✅ SuppliersPage renders "Suppliers" heading
 *  ✅ SuppliersPage renders supplier name in row
 *  ✅ SuppliersPage renders "—" fallback for null taxId/contactNo/email
 *  ✅ UnitsPage renders "Units of Measure" heading
 *  ✅ UnitsPage renders unit name and abbreviation
 *  ✅ UnitsPage renders "Base Unit" badge when isBaseUnit=true
 *  ✅ UnitsPage renders "Derived" badge when isBaseUnit=false
 *  ✅ UnitsPage renders "(Base)" suffix in conversion factor for base unit
 *  ✅ UnitsPage renders "x Base" suffix for derived unit
 *
 * Run with: pnpm test settings
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '@/lib/__tests__/helpers/router-wrapper'
import { makeId, seedMockUser, resetMockUser } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  categoryCollection: {},
  locationCollection: {},
  supplierCollection: {},
  unitCollection: {},
  customerCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  unitCollection2: {}, productCollection: {}, userCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db — useLiveQuery returns seeded data
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { Route } from '@/routes/(private)/(dashboard)/settings/index'
import { CategoriesPage } from '@/routes/(private)/(dashboard)/settings/-categories/index'
import { LocationsPage } from '@/routes/(private)/(dashboard)/settings/-locations/index'
import { SuppliersPage } from '@/routes/(private)/(dashboard)/settings/-suppliers/index'
import { UnitsPage } from '@/routes/(private)/(dashboard)/settings/-units/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSettingsPage() {
  const router = buildRouter(
    Route.options.component as any,
    '/(private)/(dashboard)/settings/',
  )
  return render(<RouterProvider router={router} />)
}

function renderComponent(Component: React.FC) {
  return render(<Component />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false } as any)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Settings tab shell
// ---------------------------------------------------------------------------

describe('Settings page — tab navigation', () => {
  it('renders tab labels: Units, Categories, Locations, Suppliers, Customers', async () => {
    renderSettingsPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Units' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Categories' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Locations' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Suppliers' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Customers' })).toBeInTheDocument()
    })
  })

  it('renders the default "Units" tab content on mount', async () => {
    renderSettingsPage()
    await waitFor(() => {
      expect(screen.getByText('Units of Measure')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// CategoriesPage
// ---------------------------------------------------------------------------

describe('CategoriesPage', () => {
  it('renders "Product Categories" heading', async () => {
    renderComponent(CategoriesPage)
    await waitFor(() => {
      expect(screen.getByText('Product Categories')).toBeInTheDocument()
    })
  })

  it('renders category name from data', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Beverages' }],
      isLoading: false,
    } as any)
    renderComponent(CategoriesPage)
    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument()
    })
  })

  it('renders multiple categories', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [
        { id: makeId(), name: 'Coffee' },
        { id: makeId(), name: 'Pastry' },
      ],
      isLoading: false,
    } as any)
    renderComponent(CategoriesPage)
    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument()
      expect(screen.getByText('Pastry')).toBeInTheDocument()
    })
  })

  it('renders empty table without crash', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false } as any)
    renderComponent(CategoriesPage)
    await waitFor(() => {
      expect(screen.getByText('Product Categories')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// LocationsPage
// ---------------------------------------------------------------------------

describe('LocationsPage', () => {
  it('renders "Store Locations" heading', async () => {
    renderComponent(LocationsPage)
    await waitFor(() => {
      expect(screen.getByText('Store Locations')).toBeInTheDocument()
    })
  })

  it('renders location name from data', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Warehouse A', description: null, contact: null, address: null }],
      isLoading: false,
    } as any)
    renderComponent(LocationsPage)
    await waitFor(() => {
      expect(screen.getByText('Warehouse A')).toBeInTheDocument()
    })
  })

  it('renders "—" fallback for null description, contact, address', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Main Store', description: null, contact: null, address: null }],
      isLoading: false,
    } as any)
    renderComponent(LocationsPage)
    await waitFor(() => {
      // Three "—" cells: description, contact, address
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('renders actual values when not null', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Branch 2', description: 'Near market', contact: '09171234567', address: '123 Main St' }],
      isLoading: false,
    } as any)
    renderComponent(LocationsPage)
    await waitFor(() => {
      expect(screen.getByText('Near market')).toBeInTheDocument()
      expect(screen.getByText('09171234567')).toBeInTheDocument()
      expect(screen.getByText('123 Main St')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// SuppliersPage
// ---------------------------------------------------------------------------

describe('SuppliersPage', () => {
  it('renders "Suppliers" heading', async () => {
    renderComponent(SuppliersPage)
    await waitFor(() => {
      expect(screen.getByText('Suppliers')).toBeInTheDocument()
    })
  })

  it('renders supplier name from data', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Acme Corp', taxId: null, contactNo: null, email: null }],
      isLoading: false,
    } as any)
    renderComponent(SuppliersPage)
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  it('renders "—" for null taxId, contactNo, email', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Nulls Inc', taxId: null, contactNo: null, email: null }],
      isLoading: false,
    } as any)
    renderComponent(SuppliersPage)
    await waitFor(() => {
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('renders actual contact values when provided', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Top Supplier', taxId: '000-111-222', contactNo: '02-8123456', email: 'supply@test.com' }],
      isLoading: false,
    } as any)
    renderComponent(SuppliersPage)
    await waitFor(() => {
      expect(screen.getByText('000-111-222')).toBeInTheDocument()
      expect(screen.getByText('02-8123456')).toBeInTheDocument()
      expect(screen.getByText('supply@test.com')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// UnitsPage
// ---------------------------------------------------------------------------

describe('UnitsPage', () => {
  it('renders "Units of Measure" heading', async () => {
    renderComponent(UnitsPage)
    await waitFor(() => {
      expect(screen.getByText('Units of Measure')).toBeInTheDocument()
    })
  })

  it('renders unit name and abbreviation', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Kilogram', abbreviation: 'kg', type: 'WEIGHT', isBaseUnit: true, conversionFactor: 1 }],
      isLoading: false,
    } as any)
    renderComponent(UnitsPage)
    await waitFor(() => {
      expect(screen.getByText('Kilogram')).toBeInTheDocument()
      expect(screen.getByText('kg')).toBeInTheDocument()
    })
  })

  it('renders "Base Unit" badge when isBaseUnit=true', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Piece', abbreviation: 'pc', type: 'QUANTITY', isBaseUnit: true, conversionFactor: 1 }],
      isLoading: false,
    } as any)
    renderComponent(UnitsPage)
    await waitFor(() => {
      expect(screen.getByText('Base Unit')).toBeInTheDocument()
    })
  })

  it('renders "Derived" badge when isBaseUnit=false', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Dozen', abbreviation: 'dz', type: 'QUANTITY', isBaseUnit: false, conversionFactor: 12 }],
      isLoading: false,
    } as any)
    renderComponent(UnitsPage)
    await waitFor(() => {
      expect(screen.getByText('Derived')).toBeInTheDocument()
    })
  })

  it('renders "(Base)" suffix in conversion factor for base unit', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Piece', abbreviation: 'pc', type: 'QUANTITY', isBaseUnit: true, conversionFactor: 1 }],
      isLoading: false,
    } as any)
    renderComponent(UnitsPage)
    await waitFor(() => {
      expect(screen.getByText('1 (Base)')).toBeInTheDocument()
    })
  })

  it('renders "x Base" suffix for derived unit', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Dozen', abbreviation: 'dz', type: 'QUANTITY', isBaseUnit: false, conversionFactor: 12 }],
      isLoading: false,
    } as any)
    renderComponent(UnitsPage)
    await waitFor(() => {
      expect(screen.getByText('12x Base')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// CustomersPage (bonus — while we have the file)
// ---------------------------------------------------------------------------

import { CustomersPage } from '@/routes/(private)/(dashboard)/settings/-customers/index'

describe('CustomersPage', () => {
  it('renders "Customers" heading', async () => {
    renderComponent(CustomersPage)
    await waitFor(() => {
      expect(screen.getByText('Customers')).toBeInTheDocument()
    })
  })

  it('renders customer name from data', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'Juan dela Cruz', email: null, phone: null }],
      isLoading: false,
    } as any)
    renderComponent(CustomersPage)
    await waitFor(() => {
      expect(screen.getByText('Juan dela Cruz')).toBeInTheDocument()
    })
  })

  it('renders "—" for null email and phone', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [{ id: makeId(), name: 'No Contact', email: null, phone: null }],
      isLoading: false,
    } as any)
    renderComponent(CustomersPage)
    await waitFor(() => {
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })
})
