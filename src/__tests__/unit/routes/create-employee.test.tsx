/**
 * create-employee.test.tsx
 *
 * Tests for:
 *   src/routes/(private)/(dashboard)/(admin)/employees/create/index.tsx  (CreateEmployeeDialog)
 *   src/routes/(private)/(dashboard)/(admin)/employees/create/-create-account.tsx (CreateAccount form)
 *   src/routes/(private)/(dashboard)/(admin)/employees/$employeeId/index.tsx (EmployeeDetailsDialog)
 *
 * Run with: pnpm test create-employee
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  userCollection: { insert: vi.fn(), values: vi.fn(() => []) },
  sessionCollection: { values: vi.fn(() => []), delete: vi.fn() },
  membershipCollection: {},
  branchCollection: {},
  businessCollection: {},
  transactionCollection: {},
  inventoryMovementCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, categoryCollection: {}, unitCollection: {}, productCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  notificationCollection: {}, operationalTaskCollection: {}, vendorSessionCollection: {},
  transactionTaxLineCollection: {},
}))

vi.mock('@/components/custom/image-uploader', () => ({
  ImageUploader: ({ label }: { label: string }) => <div data-testid='image-uploader'>{label}</div>,
}))

vi.mock('@/lib/overlay', () => ({
  showModal: vi.fn().mockResolvedValue('modal-id'),
  delModal: vi.fn(),
}))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return {
    ...actual,
    useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })),
    eq: vi.fn(), count: vi.fn(), toArray: vi.fn(() => []),
  }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { CreateEmployeeDialog } from '@/routes/(private)/(dashboard)/(admin)/employees/create/index'
import { EmployeeDetailsDialog } from '@/routes/(private)/(dashboard)/(admin)/employees/$employeeId/index'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => { seedMockUser(); vi.clearAllMocks() })
afterEach(() => { cleanup(); resetMockUser() })

// ---------------------------------------------------------------------------
// CreateEmployeeDialog
// ---------------------------------------------------------------------------

describe('CreateEmployeeDialog', () => {
  it('renders "Add Employee" heading', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Add Employee')
    })
  })

  it('renders Full Name field label', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Full Name')
    })
  })

  it('renders Email Address field label', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Email Address')
    })
  })

  it('renders Job Role select label', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Job Role')
    })
  })

  it('renders Personal Details card heading', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Personal Details')
    })
  })

  it('renders Access Control card heading', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Access Control')
    })
  })

  it('renders Add Employee submit button', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Add Employee')
    })
  })

  it('renders Employee Avatar image uploader', async () => {
    render(<CreateEmployeeDialog open={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('image-uploader')).toBeInTheDocument()
    })
  })

  it('does not render when open=false', () => {
    render(<CreateEmployeeDialog open={false} onClose={vi.fn()} />)
    expect(document.body.textContent).not.toContain('Personal Details')
  })
})

// ---------------------------------------------------------------------------
// EmployeeDetailsDialog
// ---------------------------------------------------------------------------

describe('EmployeeDetailsDialog — loading state', () => {
  it('renders pulse skeleton while loading', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: true } as any)
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId={makeId()} />)
    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).not.toBeNull()
    })
  })

  it('renders "Employee not found." when data is empty', async () => {
    vi.mocked(useLiveQuery).mockReturnValue({ data: [], isLoading: false } as any)
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId={makeId()} />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Employee not found.')
    })
  })
})

describe('EmployeeDetailsDialog — with employee data', () => {
  function makeEmployee(overrides: Record<string, any> = {}) {
    return {
      id: makeId(),
      name: 'Maria Santos',
      email: 'maria@test.com',
      role: 'CASHIER',
      image: null,
      emailVerified: true,
      createdAt: new Date('2026-01-01'),
      deletedAt: null,
      memberships: [],
      sessions: [],
      processedSalesHistory: [],
      processedSales: [],
      performedServices: [],
      inventoryMovements: [],
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.mocked(useLiveQuery).mockReturnValue({
      data: [makeEmployee()],
      isLoading: false,
    } as any)
  })

  it('renders employee name', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Maria Santos')
    })
  })

  it('renders employee role badge', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('CASHIER')
    })
  })

  it('renders Edit Profile button', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit Profile')
    })
  })

  it('renders Overview tab', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Overview')
    })
  })

  it('renders Performance tab', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Performance')
    })
  })

  it('renders Contact Details section', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Contact Details')
    })
  })

  it('renders Revoke All Sessions button in danger zone', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Sign Out Everywhere')
    })
  })

  it('renders employee email', async () => {
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('maria@test.com')
    })
  })

  it('clicking Edit Profile calls showModal', async () => {
    const { showModal } = await import('@/lib/overlay')
    render(<EmployeeDetailsDialog open={true} onClose={vi.fn()} employeeId='emp-001' />)
    await waitFor(() => screen.getByText('Edit Profile'))
    fireEvent.click(screen.getByText('Edit Profile'))
    await waitFor(() => {
      expect(vi.mocked(showModal)).toHaveBeenCalled()
    })
  })
})
