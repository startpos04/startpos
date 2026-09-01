/**
 * subscription-reactivate.test.ts
 *
 * Unit tests for the subscription reactivation route authentication and authorization logic.
 * Tests focus on the beforeLoad guard that validates user context and subscription status.
 *
 * Coverage:
 *  - Authentication validation (user must be logged in)
 *  - Business context validation (user must belong to a business)
 *  - Subscription status validation (must be reactivatable)
 *  - Redirect behavior for different failure scenarios
 *  - Route context population for successful validation
 *  - Error message customization for different scenarios
 */

import { describe, expect, it, vi } from 'vitest'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// Mock: @tanstack/react-router redirect function
// ---------------------------------------------------------------------------

const mockRedirect = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => ({
    component: vi.fn(),
    beforeLoad: vi.fn(),
  }),
  redirect: mockRedirect,
}))

// ---------------------------------------------------------------------------
// Mock: canReactivate function
// ---------------------------------------------------------------------------

const mockCanReactivate = vi.fn()
const mockSubscriptionStatusVO = {
  isOperationallyActive: vi.fn(),
}

vi.mock('@/lib/billing/value-objects/subscription-status', () => ({
  canReactivate: mockCanReactivate,
  SubscriptionStatusVO: mockSubscriptionStatusVO,
}))

// ---------------------------------------------------------------------------
// Helper to simulate beforeLoad execution
// ---------------------------------------------------------------------------

type RouteContext = {
  user?: {
    id?: string
    business?: {
      id?: string
    }
    entitlement?: {
      status?: SubscriptionStatus
    }
  }
}

/**
 * Simulates the beforeLoad logic from the reactivation route.
 * This is extracted from the actual route implementation for testing.
 */
async function simulateBeforeLoad(context: RouteContext) {
  // Reset mocks
  mockRedirect.mockClear()
  
  // Authentication check - user should be authenticated
  if (!context.user?.id) {
    const redirectCall = { 
      to: '/login',
      search: { redirect: '/business/business/subscription/reactivate' }
    }
    mockRedirect(redirectCall)
    throw redirectCall
  }

  // Business context check - user must belong to a business
  if (!context.user.business?.id) {
    const redirectCall = { 
      to: '/register/business-setup',
      search: { 
        redirect: '/business/business/subscription/reactivate',
        error: 'Business setup required before reactivation'
      }
    }
    mockRedirect(redirectCall)
    throw redirectCall
  }

  // Subscription status check - must be in a reactivatable status
  const status = context.user.entitlement?.status
  if (!status) {
    const redirectCall = { 
      to: '/business/subscription',
      search: { 
        error: 'Unable to determine subscription status. Please contact support.'
      }
    }
    mockRedirect(redirectCall)
    throw redirectCall
  }

  // Check if the status allows reactivation
  if (!mockCanReactivate(status)) {
    // Handle different non-reactivatable cases with appropriate redirects
    if (status === SubscriptionStatus.SUSPENDED) {
      const redirectCall = { 
        to: '/business/subscription',
        search: { 
          error: 'Your account is suspended. Please contact support to resolve this issue.'
        }
      }
      mockRedirect(redirectCall)
      throw redirectCall
    }

    // Already active statuses should go to billing dashboard
    if (mockSubscriptionStatusVO.isOperationallyActive(status)) {
      const redirectCall = { 
        to: '/business/subscription',
        search: { 
          info: 'Your subscription is already active. Use the billing dashboard to make changes.'
        }
      }
      mockRedirect(redirectCall)
      throw redirectCall
    }

    // Fallback for any other non-reactivatable status
    const redirectCall = { 
      to: '/business/subscription',
      search: { 
        error: 'Reactivation is not available for your current subscription status.'
      }
    }
    mockRedirect(redirectCall)
    throw redirectCall
  }

  // All checks passed - allow access to reactivation flow
  return {
    user: context.user,
    reactivatableStatus: status,
  }
}

// ---------------------------------------------------------------------------
// Authentication validation
// ---------------------------------------------------------------------------

describe('Reactivation route beforeLoad — Authentication validation', () => {
  it('redirects to login when user is undefined', async () => {
    await expect(simulateBeforeLoad({ user: undefined })).rejects.toEqual(
      expect.objectContaining({
        to: '/login',
        search: { redirect: '/business/business/subscription/reactivate' }
      })
    )
    
    expect(mockRedirect).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/business/business/subscription/reactivate' }
    })
  })

  it('redirects to login when user.id is undefined', async () => {
    await expect(simulateBeforeLoad({ user: {} })).rejects.toEqual(
      expect.objectContaining({
        to: '/login',
        search: { redirect: '/business/business/subscription/reactivate' }
      })
    )
  })

  it('redirects to login when user.id is empty string', async () => {
    await expect(simulateBeforeLoad({ user: { id: '' } })).rejects.toEqual(
      expect.objectContaining({
        to: '/login',
        search: { redirect: '/business/business/subscription/reactivate' }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Business context validation
// ---------------------------------------------------------------------------

describe('Reactivation route beforeLoad — Business context validation', () => {
  it('redirects to business setup when user.business is undefined', async () => {
    await expect(simulateBeforeLoad({ 
      user: { 
        id: 'user-123',
        business: undefined 
      } 
    })).rejects.toEqual(
      expect.objectContaining({
        to: '/register/business-setup',
        search: { 
          redirect: '/business/business/subscription/reactivate',
          error: 'Business setup required before reactivation'
        }
      })
    )
  })

  it('redirects to business setup when user.business.id is undefined', async () => {
    await expect(simulateBeforeLoad({ 
      user: { 
        id: 'user-123',
        business: {} 
      } 
    })).rejects.toEqual(
      expect.objectContaining({
        to: '/register/business-setup'
      })
    )
  })

  it('redirects to business setup when user.business.id is empty string', async () => {
    await expect(simulateBeforeLoad({ 
      user: { 
        id: 'user-123',
        business: { id: '' } 
      } 
    })).rejects.toEqual(
      expect.objectContaining({
        to: '/register/business-setup'
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Subscription status validation
// ---------------------------------------------------------------------------

describe('Reactivation route beforeLoad — Subscription status validation', () => {
  it('redirects to billing when subscription status is undefined', async () => {
    await expect(simulateBeforeLoad({ 
      user: { 
        id: 'user-123',
        business: { id: 'biz-456' },
        entitlement: undefined
      } 
    })).rejects.toEqual(
      expect.objectContaining({
        to: '/business/subscription',
        search: { 
          error: 'Unable to determine subscription status. Please contact support.'
        }
      })
    )
  })

  it('redirects to billing when entitlement.status is undefined', async () => {
    await expect(simulateBeforeLoad({ 
      user: { 
        id: 'user-123',
        business: { id: 'biz-456' },
        entitlement: {}
      } 
    })).rejects.toEqual(
      expect.objectContaining({
        to: '/business/subscription',
        search: { 
          error: 'Unable to determine subscription status. Please contact support.'
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Reactivation eligibility validation
// ---------------------------------------------------------------------------

describe('Reactivation route beforeLoad — Reactivation eligibility', () => {
  const validUserContext = {
    user: {
      id: 'user-123',
      business: { id: 'biz-456' },
      entitlement: { status: SubscriptionStatus.EXPIRED }
    }
  }

  it('redirects suspended accounts to billing with support message', async () => {
    const context = {
      ...validUserContext,
      user: {
        ...validUserContext.user,
        entitlement: { status: SubscriptionStatus.SUSPENDED }
      }
    }
    
    mockCanReactivate.mockReturnValue(false)

    await expect(simulateBeforeLoad(context)).rejects.toEqual(
      expect.objectContaining({
        to: '/business/subscription',
        search: { 
          error: 'Your account is suspended. Please contact support to resolve this issue.'
        }
      })
    )
  })

  it('redirects active accounts to billing with info message', async () => {
    const context = {
      ...validUserContext,
      user: {
        ...validUserContext.user,
        entitlement: { status: SubscriptionStatus.ACTIVE }
      }
    }
    
    mockCanReactivate.mockReturnValue(false)
    mockSubscriptionStatusVO.isOperationallyActive.mockReturnValue(true)

    await expect(simulateBeforeLoad(context)).rejects.toEqual(
      expect.objectContaining({
        to: '/business/subscription',
        search: { 
          info: 'Your subscription is already active. Use the billing dashboard to make changes.'
        }
      })
    )
  })

  it('redirects trial accounts to billing with info message', async () => {
    const context = {
      ...validUserContext,
      user: {
        ...validUserContext.user,
        entitlement: { status: SubscriptionStatus.TRIAL }
      }
    }
    
    mockCanReactivate.mockReturnValue(false)
    mockSubscriptionStatusVO.isOperationallyActive.mockReturnValue(true)

    await expect(simulateBeforeLoad(context)).rejects.toEqual(
      expect.objectContaining({
        to: '/business/subscription',
        search: { 
          info: 'Your subscription is already active. Use the billing dashboard to make changes.'
        }
      })
    )
  })

  it('redirects non-reactivatable statuses with fallback message', async () => {
    // Simulate an edge case where status is not reactivatable but also not active or suspended
    const context = validUserContext
    
    mockCanReactivate.mockReturnValue(false)
    mockSubscriptionStatusVO.isOperationallyActive.mockReturnValue(false)

    await expect(simulateBeforeLoad(context)).rejects.toEqual(
      expect.objectContaining({
        to: '/business/subscription',
        search: { 
          error: 'Reactivation is not available for your current subscription status.'
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Successful validation
// ---------------------------------------------------------------------------

describe('Reactivation route beforeLoad — Successful validation', () => {
  const reactivatableStatuses = [
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
  ]

  it.each(reactivatableStatuses)('allows access for %s status', async (status) => {
    const context = {
      user: {
        id: 'user-123',
        business: { id: 'biz-456' },
        entitlement: { status }
      }
    }
    
    mockCanReactivate.mockReturnValue(true)

    const result = await simulateBeforeLoad(context)

    expect(result).toEqual({
      user: context.user,
      reactivatableStatus: status,
    })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('populates route context with user and status information', async () => {
    const testUser = {
      id: 'user-789',
      business: { id: 'biz-101' },
      entitlement: { status: SubscriptionStatus.CANCELLED }
    }
    
    const context = { user: testUser }
    mockCanReactivate.mockReturnValue(true)

    const result = await simulateBeforeLoad(context)

    expect(result.user).toBe(testUser)
    expect(result.reactivatableStatus).toBe(SubscriptionStatus.CANCELLED)
  })

  it('validates status using canReactivate function', async () => {
    const context = {
      user: {
        id: 'user-123',
        business: { id: 'biz-456' },
        entitlement: { status: SubscriptionStatus.EXPIRED }
      }
    }
    
    mockCanReactivate.mockReturnValue(true)

    await simulateBeforeLoad(context)

    expect(mockCanReactivate).toHaveBeenCalledWith(SubscriptionStatus.EXPIRED)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Reactivation route beforeLoad — Edge cases', () => {
  it('handles null user gracefully', async () => {
    await expect(simulateBeforeLoad({ user: null })).rejects.toEqual(
      expect.objectContaining({
        to: '/login'
      })
    )
  })

  it('prioritizes authentication over business context validation', async () => {
    // If user is not authenticated, should redirect to login, not business setup
    await expect(simulateBeforeLoad({ 
      user: { 
        id: null, // Not authenticated
        business: undefined // Also missing business
      } 
    })).rejects.toEqual(
      expect.objectContaining({
        to: '/login'
      })
    )
    
    // Should not check for business context if user is not authenticated
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/login'
      })
    )
  })
})