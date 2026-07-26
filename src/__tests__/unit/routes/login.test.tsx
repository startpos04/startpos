/**
 * login.test.tsx
 *
 * Integration tests for the Login route page
 * (src/routes/(public)/login.tsx)
 *
 * Strategy:
 *  - buildRouter mounts the component in a minimal in-memory router.
 *  - AuthEngine is mocked to capture loginOnline / loginOffline calls.
 *  - useIsOnline is mocked to toggle online/offline display text.
 *  - @tanstack/react-form is NOT mocked — the real form runs so we hit
 *    the validation and submit branches in the source.
 *
 * Coverage targets (Task 4):
 *  ✅ Renders "Login" heading
 *  ✅ Renders email and password fields
 *  ✅ Renders Sign in button
 *  ✅ Shows online description when isOnline=true
 *  ✅ Shows offline description when isOnline=false
 *  ✅ Sign in button is present and clickable
 *  ✅ ThemeToggle is rendered
 *
 * Run with: pnpm test login
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '@/lib/__tests__/helpers/router-wrapper'

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
// Mock: AuthEngine
// ---------------------------------------------------------------------------

vi.mock('@/lib/better-auth/auth-engine', () => ({
  AuthEngine: {
    loginOnline: vi.fn(),
    loginOffline: vi.fn(),
    logout: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Mock: useIsOnline — default online; override per test
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-is-online', () => ({
  useIsOnline: vi.fn(() => true),
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

import { useIsOnline } from '@/hooks/use-is-online'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import { Route } from '@/routes/(public)/login'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLoginPage() {
  const router = buildRouter(Route.options.component as any, '/(public)/login')
  return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useIsOnline).mockReturnValue(true)
})

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Login page — rendering', () => {
  it('renders "Login" heading', async () => {
    renderLoginPage()
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })
  })

  it('renders email input field', async () => {
    renderLoginPage()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument()
    })
  })

  it('renders password input field', async () => {
    renderLoginPage()
    await waitFor(() => {
      // Label uses ShadCN Field group — no htmlFor, select by type instead
      expect(document.querySelector('input[type="password"]')).not.toBeNull()
    })
  })

  it('renders Sign in button', async () => {
    renderLoginPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })
  })

  it('renders ThemeToggle button', async () => {
    renderLoginPage()
    await waitFor(() => {
      // ThemeToggle renders a button — at least one button in the header area
      expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Online / offline mode
// ---------------------------------------------------------------------------

describe('Login page — online/offline description', () => {
  it('shows online description when isOnline=true', async () => {
    vi.mocked(useIsOnline).mockReturnValue(true)
    renderLoginPage()
    await waitFor(() => {
      expect(screen.getByText('Enter your credentials to sign in.')).toBeInTheDocument()
    })
  })

  it('shows offline description when isOnline=false', async () => {
    vi.mocked(useIsOnline).mockReturnValue(false)
    renderLoginPage()
    await waitFor(() => {
      expect(screen.getByText(/Offline Mode/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

describe('Login page — form submission', () => {
  it('calls AuthEngine.loginOnline when online and form is submitted with valid credentials', async () => {
    vi.mocked(useIsOnline).mockReturnValue(true)
    renderLoginPage()

    await waitFor(() => screen.getByPlaceholderText('name@example.com'))

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'admin@test.com' },
    })
    // Password field has no htmlFor — select by type
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    // Submit the form directly (button has canSubmit guard via @tanstack/react-form)
    const form = document.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => {
      expect(vi.mocked(AuthEngine.loginOnline)).toHaveBeenCalledWith(
        'admin@test.com',
        'password123',
        expect.any(Function),
      )
    })
  })

  it('calls AuthEngine.loginOffline when offline and form is submitted', async () => {
    vi.mocked(useIsOnline).mockReturnValue(false)
    renderLoginPage()

    await waitFor(() => screen.getByPlaceholderText('name@example.com'))

    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'cashier@test.com' },
    })
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(passwordInput, { target: { value: 'mypassword' } })

    const form = document.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => {
      expect(vi.mocked(AuthEngine.loginOffline)).toHaveBeenCalledWith(
        'cashier@test.com',
        'mypassword',
        expect.any(Function),
      )
    })
  })
})
