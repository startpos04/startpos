/**
 * pos-reconcile.test.tsx
 *
 * Tests for POS shift-close reconciliation panels:
 *   src/routes/(private)/pos/-components/reconcile-now.tsx
 *   src/routes/(private)/pos/-components/reconcile-later.tsx
 *
 * Strategy:
 *  - Both components use useAppForm + useLiveQuery + dbTransaction.
 *  - useLiveQuery is mocked to return seeded data (session, members, transactions).
 *  - dbTransaction is mocked to run the fn synchronously and return Ok.
 *  - useAppForm is NOT mocked — the real form runs so branches are hit.
 *  - ReconcileNow has an isAuthenticated gate: we assert the "Authenticate"
 *    button first, then mock showModal(AuthPrompt) to resolve true and assert
 *    the reconciliation form is shown.
 *  - ReconcileLater renders the form immediately (no auth gate).
 *
 * Coverage targets (Task 24):
 *  ReconcileNow:
 *   ✅ Renders "Authenticate" button initially (unauthenticated gate)
 *   ✅ Shows the reconciliation form after authenticate resolves true
 *   ✅ Renders "Actual Cash in Drawer" input
 *   ✅ Renders discrepancy notes textarea
 *   ✅ Renders Opening Cash stat card
 *   ✅ Renders Expected Cash stat card
 *   ✅ Renders "Reconcile Now (Supervisor)" submit button
 *   ✅ Renders warning notice about locking sales
 *
 *  ReconcileLater:
 *   ✅ Renders "Actual Cash in Drawer" input immediately
 *   ✅ Renders "Reconcile Now (Supervisor)" primary button
 *   ✅ Shows "End Shift & Create Task" secondary button when ENABLE_CASH_RECONCILIATION=true
 *   ✅ Hides "End Shift & Create Task" when ENABLE_CASH_RECONCILIATION=false
 *   ✅ Renders warning notice about locking sales
 *
 * Run with: pnpm test pos-reconcile
 */

import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeId, seedMockUser, resetMockUser } from '@/lib/__tests__/helpers'

// ---------------------------------------------------------------------------
// Mock: DB / OPFS
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  membershipCollection: {},
  operationalTaskCollection: { update: vi.fn() },
  vendorSessionCollection: { update: vi.fn(), get: vi.fn(() => null) },
  transactionCollection: {},
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  sessionCollection: {}, notificationCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-db — useLiveQuery returns seeded data
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn() }
})

// ---------------------------------------------------------------------------
// Mock: dbTransaction — run fn synchronously, return Ok
// ---------------------------------------------------------------------------

vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (fn: () => void) => {
    fn()
    return { isErr: () => false, isOk: () => true }
  }),
}))

// ---------------------------------------------------------------------------
// Mock: overlay — showModal resolves true (admin auth passes)
// ---------------------------------------------------------------------------

vi.mock('@/lib/overlay', () => ({
  showModal: vi.fn().mockImplementation((_Component: any, opts: any) => {
    // Defer so React isn't in a render when setState fires
    Promise.resolve().then(() => opts?.onConfirm?.({ role: 'ADMIN' }))
    return Promise.resolve('modal-id')
  }),
  delModal: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: AuthEngine
// ---------------------------------------------------------------------------

vi.mock('@/lib/better-auth/auth-engine', () => ({
  AuthEngine: { logout: vi.fn(), loginOnline: vi.fn(), loginOffline: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock: NotificationEngine
// ---------------------------------------------------------------------------

vi.mock('@/lib/notification/notification-engine', () => ({
  NotificationEngine: { send: vi.fn(), checkLowStock: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock: router
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Mock: PriceEngine — avoids any authStore.systemConfigs dependency on re-render
// ---------------------------------------------------------------------------

vi.mock('@/lib/conversion/price-engine', () => ({
  PriceEngine: {
    format: vi.fn((cents: number) => `₱${(Number(cents) / 100).toFixed(2)}`),
    calculateLineTotal: vi.fn(() => 0),
    convertToExclusive: vi.fn((cents: number) => cents),
  },
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { useLiveQuery } from '@tanstack/react-db'
import { showModal } from '@/lib/overlay'
import { ReconcileNow } from '@/routes/(private)/pos/-components/reconcile-now'
import { ReconcileLater } from '@/routes/(private)/pos/-components/reconcile-later'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    userId: 'user-test-001',
    status: 'OPEN',
    openingCash: 50000,
    closingCash: null,
    expectedCash: null,
    verifiedCash: null,
    startTime: new Date(),
    endTime: null,
    notes: null,
    operationalTaskId: makeId(),
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    operationalTask: null,
    ...overrides,
  }
}

function makeMember(overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    userId: makeId(),
    role: 'ADMIN',
    ...overrides,
  }
}

function setupDefaultLiveQuery() {
  vi.mocked(useLiveQuery).mockImplementation((fn: any) => {
    // Return different data based on query content (heuristic: check fn string)
    const fnStr = fn?.toString() || ''
    if (fnStr.includes('membershipCollection')) {
      return { data: [makeMember()], isLoading: false } as any
    }
    if (fnStr.includes('vendorSessionCollection')) {
      return { data: [makeSession()], isLoading: false } as any
    }
    if (fnStr.includes('transactionCollection')) {
      return { data: [{ totalSales: 150000, totalTransactions: 5 }], isLoading: false } as any
    }
    return { data: [], isLoading: false } as any
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser({
    vendorSession: makeSession(),
    systemConfigs: { ENABLE_CASH_RECONCILIATION: true },
  } as any)
  // Reset call history without wiping implementations
  vi.clearAllMocks()
  // Re-apply showModal implementation after clearAllMocks wipes it
  vi.mocked(showModal).mockImplementation((_Component: any, opts: any) => {
    // Defer onConfirm to avoid calling setState inside render
    Promise.resolve().then(() => opts?.onConfirm?.({ role: 'ADMIN' }))
    return Promise.resolve('modal-id')
  })
  setupDefaultLiveQuery()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// ReconcileNow
// ---------------------------------------------------------------------------

describe('ReconcileNow — unauthenticated gate', () => {
  it('renders "Authenticate" button initially', () => {
    render(<ReconcileNow open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Authenticate')
  })

  it('does NOT render the cash form before authentication', () => {
    render(<ReconcileNow open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).not.toContain('Actual Cash in Drawer')
  })
})

describe('ReconcileNow — authenticated form', () => {
  async function renderAuthenticated() {
    render(<ReconcileNow open={true} onClose={vi.fn()} />)
    // Click authenticate — showModal mock calls onConfirm(ADMIN) immediately
    await act(async () => {
      fireEvent.click(screen.getByText('Authenticate'))
    })
  }

  it('shows the reconciliation form after authentication', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Actual Cash in Drawer')
    })
  })

  it('renders the discrepancy notes textarea', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Discrepancy Notes')
    })
  })

  it('renders the Opening Cash stat card', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Opening Cash')
    })
  })

  it('renders the Expected Cash stat card', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Expected Cash')
    })
  })

  it('renders "Reconcile Now (Supervisor)" submit button', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Reconcile Now (Supervisor)')
    })
  })

  it('renders warning notice about locking sales', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('lock your sales for this shift')
    })
  })

  it('renders Transactions stat card', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Transactions')
    })
  })

  it('renders Total Sales stat card', async () => {
    await renderAuthenticated()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Total Sales')
    })
  })
})

// ---------------------------------------------------------------------------
// ReconcileLater
// ---------------------------------------------------------------------------

describe('ReconcileLater — form renders immediately', () => {
  it('renders "Actual Cash in Drawer" input without auth gate', () => {
    render(<ReconcileLater open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Actual Cash in Drawer')
  })

  it('renders discrepancy notes textarea', () => {
    render(<ReconcileLater open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Discrepancy Notes')
  })

  it('renders "Reconcile Now (Supervisor)" primary button', () => {
    render(<ReconcileLater open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Reconcile Now (Supervisor)')
  })

  it('renders warning notice about locking sales', () => {
    render(<ReconcileLater open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('lock your sales for this shift')
  })
})

describe('ReconcileLater — ENABLE_CASH_RECONCILIATION flag', () => {
  it('shows "End Shift & Create Task" button when ENABLE_CASH_RECONCILIATION=true', () => {
    seedMockUser({
      vendorSession: makeSession(),
      systemConfigs: { ENABLE_CASH_RECONCILIATION: true },
    } as any)
    render(<ReconcileLater open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('End Shift & Create Task')
  })

  it('hides "End Shift & Create Task" when ENABLE_CASH_RECONCILIATION=false', () => {
    seedMockUser({
      vendorSession: makeSession(),
      systemConfigs: { ENABLE_CASH_RECONCILIATION: false },
    } as any)
    render(<ReconcileLater open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).not.toContain('End Shift & Create Task')
  })
})
