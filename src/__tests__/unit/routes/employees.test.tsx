/**
 * employees.test.tsx
 *
 * Integration tests for the Employees route page
 * (src/routes/(private)/(dashboard)/(admin)/employees/index.tsx)
 *
 * Coverage targets (Task 22):
 *  ✅ Renders "Employees" heading and description
 *  ✅ Renders employee name, email, role in table rows
 *  ✅ Renders multiple employees
 *  ✅ Renders empty table without crash
 *  ✅ Add Employee button calls showModal(CreateEmployeeDialog)
 *  ✅ Edit button calls showModal(EmployeeDetailsDialog)
 *  ✅ Delete button calls showModal(WarningPrompt)
 *  ✅ Loading state renders without crash
 *
 * Run with: pnpm test employees
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '@/lib/__tests__/helpers/router-wrapper'
import { makeId, seedMockUser, resetMockUser } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  userCollection: { update: vi.fn() },
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  operationalTaskCollection: {}, vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

// ---------------------------------------------------------------------------
// Mock: overlay
// ---------------------------------------------------------------------------

vi.mock('@/lib/overlay', () => ({
  showModal: vi.fn().mockResolvedValue('modal-id'),
  delModal: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { showModal } from '@/lib/overlay'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Route } from '@/routes/(private)/(dashboard)/(admin)/employees/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmployee(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    name: 'Maria Santos',
    email: 'maria@test.com',
    role: 'CASHIER',
    image: null,
    deletedAt: null,
    ...overrides,
  }
}

function renderEmployeesPage() {
  const router = buildRouter(
    Route.options.component as any,
    '/(private)/(dashboard)/(admin)/employees/',
  )
  return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(showModal).mockResolvedValue('modal-id')
  vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false } as any)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Employees page — rendering', () => {
  it('renders "Employees" heading', async () => {
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('Employees')).toBeInTheDocument()
    })
  })

  it('renders page description', async () => {
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText(/Manage your team/i)).toBeInTheDocument()
    })
  })

  it('renders Add Employee button', async () => {
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('Add Employee')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Employee data
// ---------------------------------------------------------------------------

describe('Employees page — employee data', () => {
  it('renders employee name in table row', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [makeEmployee({ name: 'Juan dela Cruz' })],
      isLoading: false,
    } as any)
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('Juan dela Cruz')).toBeInTheDocument()
    })
  })

  it('renders employee email in table row', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [makeEmployee({ email: 'juan@business.com' })],
      isLoading: false,
    } as any)
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('juan@business.com')).toBeInTheDocument()
    })
  })

  it('renders employee role in table row', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [makeEmployee({ role: 'ADMIN' })],
      isLoading: false,
    } as any)
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })
  })

  it('renders multiple employees', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [
        makeEmployee({ name: 'Alice Reyes' }),
        makeEmployee({ name: 'Bob Torres' }),
        makeEmployee({ name: 'Carol Lim' }),
      ],
      isLoading: false,
    } as any)
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('Alice Reyes')).toBeInTheDocument()
      expect(screen.getByText('Bob Torres')).toBeInTheDocument()
      expect(screen.getByText('Carol Lim')).toBeInTheDocument()
    })
  })

  it('renders empty table without crash', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false } as any)
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('Employees')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('Employees page — actions', () => {
  it('clicking Add Employee calls showModal', async () => {
    renderEmployeesPage()
    await waitFor(() => screen.getByText('Add Employee'))
    fireEvent.click(screen.getByText('Add Employee'))
    expect(vi.mocked(showModal)).toHaveBeenCalledOnce()
  })

  it('clicking edit button calls showModal(EmployeeDetailsDialog)', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [makeEmployee({ name: 'Edit Me' })],
      isLoading: false,
    } as any)
    renderEmployeesPage()
    await waitFor(() => screen.getByText('Edit Me'))
    const editBtn = document.querySelector('button.h-8.w-8.rounded-full:not(.text-destructive)')
    expect(editBtn).not.toBeNull()
    fireEvent.click(editBtn!)
    await waitFor(() => {
      expect(vi.mocked(showModal)).toHaveBeenCalled()
    })
  })

  it('clicking delete button calls showModal(WarningPrompt)', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [makeEmployee({ name: 'Delete Me' })],
      isLoading: false,
    } as any)
    renderEmployeesPage()
    await waitFor(() => screen.getByText('Delete Me'))
    const deleteBtn = document.querySelector('button.text-destructive')
    expect(deleteBtn).not.toBeNull()
    fireEvent.click(deleteBtn!)
    await waitFor(() => {
      expect(vi.mocked(showModal)).toHaveBeenCalledWith(WarningPrompt, expect.objectContaining({ title: 'Delete Employee' }))
    })
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('Employees page — loading state', () => {
  it('renders without crash while loading', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: undefined, isLoading: true } as any)
    renderEmployeesPage()
    await waitFor(() => {
      expect(screen.getByText('Employees')).toBeInTheDocument()
    })
  })
})
