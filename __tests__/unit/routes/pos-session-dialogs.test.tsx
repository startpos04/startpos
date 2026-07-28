/**
 * pos-session-dialogs.test.tsx
 *
 * Tests for POS session management dialogs:
 *   - OpenSessionDialog (open-session-dialog.tsx)
 *   - CloseSessionDialog (close-session-dialog.tsx)
 *
 * Coverage targets:
 *  ✅ OpenSessionDialog renders "Start Your Shift" heading
 *  ✅ OpenSessionDialog renders Starting Cash input and Notes textarea
 *  ✅ OpenSessionDialog renders "Start Shift" submit button
 *  ✅ OpenSessionDialog renders Logout button for CASHIER role
 *  ✅ OpenSessionDialog renders "Go to Dashboard" button for ADMIN role
 *  ✅ OpenSessionDialog Logout button calls AuthEngine.logout for CASHIER
 *  ✅ CloseSessionDialog renders "End Shift" heading
 *  ✅ CloseSessionDialog renders "Reconcile Now" tab
 *  ✅ CloseSessionDialog shows "Create a Task" tab when ENABLE_CASH_RECONCILIATION=true
 *  ✅ CloseSessionDialog hides "Create a Task" tab when ENABLE_CASH_RECONCILIATION=false
 *
 * Run with: pnpm test pos-session
 */

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from 'prisma/generated/prisma/enums'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: DB / OPFS
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  operationalTaskCollection: { insert: vi.fn() },
  vendorSessionCollection: { insert: vi.fn(), values: vi.fn(() => []) },
  orderCollection: {}, orderItemCollection: {}, orderItemAddonCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  productVariantCollection: {}, productComponentCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, businessCollection: {}, branchCollection: {},
  categoryCollection: {}, unitCollection: {}, productCollection: {}, userCollection: {},
  locationCollection: {}, supplierCollection: {}, customerCollection: {},
  membershipCollection: {}, sessionCollection: {}, notificationCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: dbTransaction
// ---------------------------------------------------------------------------

vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (fn: () => void) => {
    fn()
    return { isErr: () => false }
  }),
}))

// ---------------------------------------------------------------------------
// Mock: AuthEngine
// ---------------------------------------------------------------------------

vi.mock('@/lib/better-auth/auth-engine', () => ({
  AuthEngine: { logout: vi.fn(), loginOnline: vi.fn(), loginOffline: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock: router
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) }
})

// ---------------------------------------------------------------------------
// Mock: ReconcileNow and ReconcileLater — deep form wiring, not under test
// ---------------------------------------------------------------------------

vi.mock('@/routes/(private)/pos/-components/reconcile-now', () => ({
  ReconcileNow: () => <div data-testid='reconcile-now'>ReconcileNow</div>,
}))

vi.mock('@/routes/(private)/pos/-components/reconcile-later', () => ({
  ReconcileLater: () => <div data-testid='reconcile-later'>ReconcileLater</div>,
}))

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { AuthEngine } from '@/lib/better-auth/auth-engine'
import { OpenSessionDialog } from '@/routes/(private)/pos/-components/open-session-dialog'
import { CloseSessionDialog } from '@/routes/(private)/pos/-components/close-session-dialog'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser({ role: Role.CASHIER } as any)
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// OpenSessionDialog
// ---------------------------------------------------------------------------

describe('OpenSessionDialog', () => {
  it('renders "Start Your Shift" heading when open', () => {
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Start Your Shift')).toBeInTheDocument()
  })

  it('renders Starting Cash label', () => {
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Starting Cash')
  })

  it('renders Optional Notes label', () => {
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Optional Notes')).toBeInTheDocument()
  })

  it('renders "Start Shift" submit button', () => {
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Start Shift')
  })

  it('renders Logout button for CASHIER', () => {
    seedMockUser({ role: Role.CASHIER } as any)
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Logout')
  })

  it('renders "Go to Dashboard" button for ADMIN', () => {
    seedMockUser({ role: Role.ADMIN } as any)
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).toContain('Go to Dashboard')
  })

  it('Logout button calls AuthEngine.logout for CASHIER', async () => {
    seedMockUser({ role: Role.CASHIER } as any)
    render(<OpenSessionDialog open={true} onClose={vi.fn()} />)
    const allBtns = Array.from(document.querySelectorAll('button[type="button"]'))
    const logoutBtn = allBtns.find(b => b.textContent?.includes('Logout'))
    expect(logoutBtn).not.toBeNull()
    fireEvent.click(logoutBtn!)
    await waitFor(() => {
      expect(vi.mocked(AuthEngine.logout)).toHaveBeenCalled()
    })
  })

  it('does not render when open=false', () => {
    render(<OpenSessionDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('Start Your Shift')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// CloseSessionDialog
// ---------------------------------------------------------------------------

describe('CloseSessionDialog', () => {
  it('renders "End Shift" heading when open', () => {
    render(<CloseSessionDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText('End Shift')).toBeInTheDocument()
  })

  it('renders "Reconcile Now" tab (or sentinel) always', () => {
    render(<CloseSessionDialog open={true} onClose={vi.fn()} />)
    // With 1 tab, Tab component renders content directly (no TabsList).
    // With 2 tabs, both labels are in TabsList. Either way the sentinel is present.
    expect(screen.getByTestId('reconcile-now')).toBeInTheDocument()
  })

  it('renders "Create a Task" tab label when ENABLE_CASH_RECONCILIATION=true', () => {
    seedMockUser({ role: Role.CASHIER, systemConfigs: { ENABLE_CASH_RECONCILIATION: true } } as any)
    render(<CloseSessionDialog open={true} onClose={vi.fn()} />)
    // With 2 tabs, the TabsList renders both labels
    expect(document.body.textContent).toContain('Create a Task')
  })

  it('hides "Create a Task" tab when ENABLE_CASH_RECONCILIATION=false', () => {
    seedMockUser({ role: Role.CASHIER, systemConfigs: { ENABLE_CASH_RECONCILIATION: false } } as any)
    render(<CloseSessionDialog open={true} onClose={vi.fn()} />)
    expect(document.body.textContent).not.toContain('Create a Task')
  })

  it('renders ReconcileNow sentinel inside the tab', () => {
    render(<CloseSessionDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByTestId('reconcile-now')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(<CloseSessionDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('End Shift')).not.toBeInTheDocument()
  })
})
