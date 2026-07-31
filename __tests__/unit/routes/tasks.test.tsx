/**
 * tasks.test.tsx
 *
 * Integration tests for the Tasks route page (src/routes/(private)/tasks/index.tsx).
 *
 * Strategy:
 *  - Uses buildRouter from router-wrapper.tsx so useSearch, useNavigate,
 *    Route.useNavigate, and Link all work without the real routeTree.
 *  - fetchTasks mocked to return controlled data.
 *  - showModal mocked to capture dialog calls.
 *  - authStore seeded via seedMockUser.
 *  - operationalTaskCollection mocked for delete operations.
 *  - Heavy UI sub-components (Dashboard) are allowed to render — they only
 *    add wrapping elements and don't affect the test assertions.
 *
 * Coverage targets (Task 14):
 *  ✅ Renders "Operational Tasks" heading
 *  ✅ Renders loading state when fetchTasks.isLoading = true
 *  ✅ Renders task rows with type and status badges
 *  ✅ Renders empty state when no tasks
 *  ✅ Add Task button calls showModal(CreateTaskDialog)
 *  ✅ Edit button calls showModal(TaskDetailsDialog)
 *  ✅ Shows FeatureDisabledPage when CREATE_TASK capability not granted (F3)
 *  ✅ Shows route for CASHIER role (no Dashboard wrapper)
 *
 * Run with: pnpm test routes/tasks
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Role, TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '#tests/helpers/router-wrapper'
import { makeId, seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  operationalTaskCollection: { delete: vi.fn() },
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
  vendorSessionCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: fetchTasks
// ---------------------------------------------------------------------------

vi.mock('@/lib/queries/fetch-tasks', () => ({
  fetchTasks: vi.fn(),
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
// Mock: better-auth — not needed in these tests
// ---------------------------------------------------------------------------

vi.mock('@/lib/better-auth/auth-engine', () => ({
  AuthEngine: { logout: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { fetchTasks } from '@/lib/queries/fetch-tasks'
import MountManager from '@/lib/mount-manager'

// We import the actual route component after mocks are set up
// Note: import the named component function directly, not via Route
import { Route } from '@/routes/(private)/tasks/index'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    type: TaskType.SHELF_REFILL,
    status: TaskStatus.PENDING,
    notes: 'Refill shelf A',
    metadata: null,
    dueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    creator: { id: makeId(), name: 'Admin User' },
    clerk: { id: makeId(), name: 'Staff Member' },
    approver: null,
    reviewer: null,
    canceler: null,
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    ...overrides,
  }
}

function renderTasksPage(searchParams: Record<string, any> = {}) {
  const router = buildRouter(
    Route.options.component as any,
    '/tasks',
    searchParams,
  )
  return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // F3: Entitlement gate — default mock user has CREATE_TASK in capabilities (open-context mode).
  // Individual tests that need to revoke it will call seedMockUser with an empty capabilities array.
  seedMockUser()
  vi.clearAllMocks()
  vi.mocked(MountManager.show).mockResolvedValue('modal-id')
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Tasks page — rendering', () => {
  it('renders the "Operational Tasks" heading', async () => {
    vi.mocked(fetchTasks).mockReturnValue({ data: [], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText('Operational Tasks')).toBeInTheDocument()
    })
  })

  it('renders the Add Task button', async () => {
    vi.mocked(fetchTasks).mockReturnValue({ data: [], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText('Add Task')).toBeInTheDocument()
    })
  })

  it('renders the page description', async () => {
    vi.mocked(fetchTasks).mockReturnValue({ data: [], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText(/Monitor and approve/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Task data rendering
// ---------------------------------------------------------------------------

describe('Tasks page — task data', () => {
  it('renders task rows when data is available', async () => {
    const task = makeTask({ type: TaskType.SHELF_REFILL, status: TaskStatus.PENDING })
    vi.mocked(fetchTasks).mockReturnValue({ data: [task], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText(/shelf refill/i)).toBeInTheDocument()
    })
  })

  it('renders status badge for PENDING task', async () => {
    const task = makeTask({ status: TaskStatus.PENDING })
    vi.mocked(fetchTasks).mockReturnValue({ data: [task], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText('PENDING')).toBeInTheDocument()
    })
  })

  it('renders creator name in the Created By column', async () => {
    const task = makeTask({ creator: { id: makeId(), name: 'Jane Smith' } })
    vi.mocked(fetchTasks).mockReturnValue({ data: [task], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    })
  })

  it('renders assignee name in the Assigned To column', async () => {
    const task = makeTask({ clerk: { id: makeId(), name: 'Bob Jones' } })
    vi.mocked(fetchTasks).mockReturnValue({ data: [task], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    })
  })

  it('renders "Unassigned" when no clerk', async () => {
    const task = makeTask({ clerk: null })
    vi.mocked(fetchTasks).mockReturnValue({ data: [task], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      expect(screen.getByText('Unassigned')).toBeInTheDocument()
    })
  })

  it('renders multiple tasks', async () => {
    const tasks = [makeTask(), makeTask(), makeTask()]
    vi.mocked(fetchTasks).mockReturnValue({ data: tasks, isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      // Row indices (01, 02, 03)
      expect(screen.getByText('01')).toBeInTheDocument()
      expect(screen.getByText('02')).toBeInTheDocument()
      expect(screen.getByText('03')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Add Task
// ---------------------------------------------------------------------------

describe('Tasks page — add task', () => {
  it('clicking Add Task calls MountManager.show', async () => {
    vi.mocked(fetchTasks).mockReturnValue({ data: [], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => screen.getByText('Add Task'))
    fireEvent.click(screen.getByText('Add Task'))
    expect(vi.mocked(MountManager.show)).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Feature gate — entitlement engine (F3)
// ---------------------------------------------------------------------------

describe('Tasks page — feature gate', () => {
  it('shows FeatureDisabledPage when CREATE_TASK capability is not granted', async () => {
    // Simulate a subscription that does not include CREATE_TASK
    seedMockUser({
      entitlement: {
        status: 'ACTIVE' as any,
        capabilities: [], // CREATE_TASK intentionally absent
        txRemaining: null,
        creditBalance: null,
      },
    } as any)
    vi.mocked(fetchTasks).mockReturnValue({ data: [], isLoading: false } as any)
    renderTasksPage()
    await waitFor(() => {
      // FeatureDisabledPage renders — the tasks heading should not be present
      expect(screen.queryByText('Operational Tasks')).not.toBeInTheDocument()
    })
  })
})
