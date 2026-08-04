/**
 * register.test.tsx
 *
 * Integration tests for the public registration pages.
 *
 * Strategy:
 *  - Register page: assert fields, OAuth buttons, and sign-in link render.
 *    Do NOT test submit handler (covered by completeRegistration Pattern B test).
 *  - BusinessSetup page: assert form fields and redirect guard render.
 *  - Both pages rendered via buildRouter.
 *
 * Coverage targets (Task 41):
 *  ✅ Register renders "Create your account" heading
 *  ✅ Register renders Full name, Email, Password, Business name fields
 *  ✅ Register renders 3 business type buttons (Restaurant, Grocery, Retail)
 *  ✅ Register renders "Continue with Google" OAuth button
 *  ✅ Register renders "Continue with Facebook" OAuth button
 *  ✅ Register renders "Or register with email" divider
 *  ✅ Register renders "Create account" submit button
 *  ✅ Register renders "Sign in" link
 *  ✅ BusinessSetup renders "One last thing" heading
 *  ✅ BusinessSetup renders Business name input
 *  ✅ BusinessSetup renders business type selector (Restaurant, Grocery, Retail)
 *  ✅ BusinessSetup renders "Let's go →" submit button
 *
 * Run with: pnpm test register
 */

import { RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRouter } from '#tests/helpers/router-wrapper'
import { seedMockUser, resetMockUser } from '#tests/helpers'

// ---------------------------------------------------------------------------
// Mock: OPFS / DB
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({ persistence: null, createSyncableCollection: vi.fn(() => ({})) }))
vi.mock('@/db/local-auth', () => ({ localAuthCollection: {} }))
vi.mock('@/db/collections', () => ({
  categoryCollection: {}, productCollection: {}, unitCollection: {},
  productVariantCollection: {}, productComponentCollection: {},
  businessCollection: {}, branchCollection: {}, userCollection: {},
  membershipCollection: {}, sessionCollection: {}, orderCollection: {},
  orderItemCollection: {}, orderItemAddonCollection: {}, transactionCollection: {},
  transactionTaxLineCollection: {}, paymentCollection: {}, sequenceCounterCollection: {},
  inventoryCollection: {}, inventoryMovementCollection: {}, purchaseCollection: {},
  purchaseItemCollection: {}, customerCollection: {}, supplierCollection: {},
  locationCollection: {}, notificationCollection: {}, operationalTaskCollection: {},
  vendorSessionCollection: {}, goodsReceiptCollection: {}, goodsReceiptItemCollection: {},
  usageCounterCollection: {}, creditLedgerCollection: {}, businessSubscriptionCollection: {},
  featureCollection: {}, featureDependencyCollection: {}, featureBundleCollection: {},
}))

// ---------------------------------------------------------------------------
// Mock: react-db
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-db')>()
  return { ...actual, useLiveQuery: vi.fn(() => ({ data: [], isLoading: false })) }
})

// ---------------------------------------------------------------------------
// Mock: auth client + query hooks
// ---------------------------------------------------------------------------

vi.mock('@/lib/better-auth/auth-client', () => ({
  authClient: {
    signUp: { email: vi.fn().mockResolvedValue({ error: null }) },
    signIn: { social: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}))

vi.mock('@/lib/better-auth/auth-engine', () => ({
  AuthEngine: { loginOnline: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/queries/complete-registration', () => ({
  completeRegistration: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/queries/refresh-session', () => ({
  refreshSession: vi.fn().mockResolvedValue({ success: true, user: null }),
}))

vi.mock('@/hooks/use-is-online', () => ({
  useIsOnline: vi.fn(() => true),
}))

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
    useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  }
})

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import { Route as RegisterRoute } from '@/routes/(public)/register'
import { Route as BusinessSetupRoute } from '@/routes/(public)/register/business-setup'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // BusinessSetup checks authStore for existing business — seed with no business
  seedMockUser({ business: { id: '', name: '' } } as any)
})

afterEach(() => {
  cleanup()
  resetMockUser()
})

// ---------------------------------------------------------------------------
// Register page
// ---------------------------------------------------------------------------

describe('Register page', () => {
  function renderRegister() {
    const router = buildRouter(RegisterRoute.options.component as any, '/(public)/register')
    return render(<RouterProvider router={router} />)
  }

  it('renders "Create your account" heading', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Create your account')).toBeInTheDocument()
    })
  })

  it('renders free trial tagline', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText(/50 free transactions/i)).toBeInTheDocument()
    })
  })

  it('renders Google OAuth button', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    })
  })

  it('renders Facebook OAuth button', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Continue with Facebook')).toBeInTheDocument()
    })
  })

  it('renders "Or register with email" divider', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText(/or register with email/i)).toBeInTheDocument()
    })
  })

  it('renders Full name input field', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Full name')).toBeInTheDocument()
    })
  })

  it('renders Email input field', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Email')).toBeInTheDocument()
    })
  })

  it('renders Password input field', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Password')).toBeInTheDocument()
    })
  })

  it('renders Business name input field', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Business name')).toBeInTheDocument()
    })
  })

  it('renders 3 business type buttons (Restaurant, Grocery, Retail)', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Restaurant')).toBeInTheDocument()
      expect(screen.getByText('Grocery')).toBeInTheDocument()
      expect(screen.getByText('Retail')).toBeInTheDocument()
    })
  })

  it('renders "Create account" submit button', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Create account')).toBeInTheDocument()
    })
  })

  it('renders "Sign in" link to /login', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Sign in')).toBeInTheDocument()
    })
  })

  it('renders "Business type" label', async () => {
    renderRegister()
    await waitFor(() => {
      expect(screen.getByText('Business type')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// BusinessSetup page
// ---------------------------------------------------------------------------

describe('BusinessSetup page', () => {
  function renderBusinessSetup() {
    const router = buildRouter(
      BusinessSetupRoute.options.component as any,
      '/(public)/register/business-setup',
    )
    return render(<RouterProvider router={router} />)
  }

  it('renders "One last thing" heading', async () => {
    renderBusinessSetup()
    await waitFor(() => {
      expect(screen.getByText('One last thing')).toBeInTheDocument()
    })
  })

  it('renders setup description', async () => {
    renderBusinessSetup()
    await waitFor(() => {
      expect(screen.getByText(/tell us about your business/i)).toBeInTheDocument()
    })
  })

  it('renders Business name input', async () => {
    renderBusinessSetup()
    await waitFor(() => {
      expect(screen.getByText('Business name')).toBeInTheDocument()
    })
  })

  it('renders Business type label', async () => {
    renderBusinessSetup()
    await waitFor(() => {
      expect(screen.getByText('Business type')).toBeInTheDocument()
    })
  })

  it('renders 3 business type options (Restaurant, Grocery, Retail)', async () => {
    renderBusinessSetup()
    await waitFor(() => {
      expect(screen.getByText('Restaurant')).toBeInTheDocument()
      expect(screen.getByText('Grocery')).toBeInTheDocument()
      expect(screen.getByText('Retail')).toBeInTheDocument()
    })
  })

  it("renders \"Let's go →\" submit button", async () => {
    renderBusinessSetup()
    await waitFor(() => {
      expect(screen.getByText("Let's go →")).toBeInTheDocument()
    })
  })
})
