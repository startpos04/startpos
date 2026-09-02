/**
 * reactivation-logic.test.ts
 *
 * Unit tests for subscription reactivation domain logic and edge cases.
 * Tests the pure business logic functions that support the reactivation flow.
 *
 * Coverage:
 *  - Status transition validation for reactivation scenarios
 *  - Reactivation eligibility rules
 *  - Error message generation for different failure scenarios
 *  - Integration with SubscriptionEngine transition rules
 *  - Edge cases and boundary conditions
 */

import { describe, expect, it } from 'vitest'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import { canReactivate, SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// Reactivation status validation
// ---------------------------------------------------------------------------

describe('Reactivation domain logic — Status validation', () => {
  it('canReactivate returns true for reactivatable statuses', () => {
    const reactivatableStatuses = [
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.LONG_TERM_INACTIVE,
    ]

    reactivatableStatuses.forEach(status => {
      expect(canReactivate(status)).toBe(true)
    })
  })

  it('canReactivate returns false for non-reactivatable statuses', () => {
    const nonReactivatableStatuses = [
      SubscriptionStatus.SUSPENDED,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.GRACE_PERIOD,
    ]

    nonReactivatableStatuses.forEach(status => {
      expect(canReactivate(status)).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// SubscriptionEngine integration for reactivation
// ---------------------------------------------------------------------------

describe('Reactivation domain logic — SubscriptionEngine integration', () => {
  it('validates that SubscriptionEngine allows reactivatable transitions', () => {
    // EXPIRED → ACTIVE (direct reactivation)
    const expiredToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.ACTIVE
    )
    expect(expiredToActive.ok).toBe(true)

    // CANCELLED → ACTIVE (resubscription)
    const cancelledToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.ACTIVE
    )
    expect(cancelledToActive.ok).toBe(true)

    // CANCELLED → GRACE_PERIOD (resubscription with payment)
    const cancelledToGrace = SubscriptionEngine.canTransition(
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.GRACE_PERIOD
    )
    expect(cancelledToGrace.ok).toBe(true)

    // LONG_TERM_INACTIVE → ACTIVE (reactivation after extended period)
    const longTermToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.LONG_TERM_INACTIVE,
      SubscriptionStatus.ACTIVE
    )
    expect(longTermToActive.ok).toBe(true)
  })

  it('validates that non-reactivatable statuses have appropriate restrictions', () => {
    // SUSPENDED can only go to ACTIVE or CANCELLED (admin-controlled)
    const suspendedStates = SubscriptionEngine.getValidNextStates(SubscriptionStatus.SUSPENDED)
    expect(suspendedStates).toEqual(
      expect.arrayContaining([SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED])
    )
    expect(suspendedStates).toHaveLength(2)

    // ACTIVE cannot transition back to reactivatable states
    const activeToExpired = SubscriptionEngine.canTransition(
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.EXPIRED
    )
    expect(activeToExpired.ok).toBe(true) // This is valid (subscription expiring)

    const activeToLongTerm = SubscriptionEngine.canTransition(
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.LONG_TERM_INACTIVE
    )
    expect(activeToLongTerm.ok).toBe(false) // This should be invalid (skips states)
  })

  it('validates transition record creation for reactivation scenarios', () => {
    const mockSnapshot = {
      id: 'sub-001',
      businessId: 'biz-001',
      status: SubscriptionStatus.EXPIRED,
      billingModel: 'MONTHLY_SUBSCRIPTION' as const,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      expiredAt: new Date(),
      longTermInactiveAt: null,
      activatedAt: null,
      cancelledAt: null,
      suspendedAt: null,
    }

    const record = SubscriptionEngine.buildTransitionRecord(
      mockSnapshot,
      SubscriptionStatus.ACTIVE,
      'Subscription reactivated via payment',
      'user-123'
    )

    expect(record.ok).toBe(true)
    if (record.ok) {
      expect(record.value.subscriptionId).toBe('sub-001')
      expect(record.value.fromStatus).toBe(SubscriptionStatus.EXPIRED)
      expect(record.value.toStatus).toBe(SubscriptionStatus.ACTIVE)
      expect(record.value.reason).toBe('Subscription reactivated via payment')
      expect(record.value.triggeredBy).toBe('user-123')
    }
  })
})

// ---------------------------------------------------------------------------
// Status classification helpers
// ---------------------------------------------------------------------------

describe('Reactivation domain logic — Status classification', () => {
  it('correctly identifies operationally blocked vs active statuses', () => {
    // Reactivatable statuses should all be operationally blocked
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.EXPIRED)).toBe(true)
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.CANCELLED)).toBe(true)
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.LONG_TERM_INACTIVE)).toBe(true)
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.SUSPENDED)).toBe(true)

    // Non-reactivatable active statuses should not be blocked
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.ACTIVE)).toBe(false)
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.TRIAL)).toBe(false)
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.GRACE_PERIOD)).toBe(false)

    // Active statuses should be operationally active
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.ACTIVE)).toBe(true)
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.TRIAL)).toBe(true)
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.GRACE_PERIOD)).toBe(true)

    // Blocked statuses should not be operationally active
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.EXPIRED)).toBe(false)
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.CANCELLED)).toBe(false)
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.SUSPENDED)).toBe(false)
    expect(SubscriptionStatusVO.isOperationallyActive(SubscriptionStatus.LONG_TERM_INACTIVE)).toBe(false)
  })

  it('provides appropriate banner severity for reactivation flow', () => {
    // Reactivatable statuses should show error banners
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.EXPIRED)).toBe('error')
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.CANCELLED)).toBe('error')
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.LONG_TERM_INACTIVE)).toBe('error')
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.SUSPENDED)).toBe('error')

    // Active statuses should not need banners or show warnings
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.ACTIVE)).toBe('none')
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.TRIAL)).toBe('none')
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.GRACE_PERIOD)).toBe('warning')
  })

  it('provides user-friendly labels for reactivation scenarios', () => {
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.EXPIRED)).toBe('Expired')
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.CANCELLED)).toBe('Cancelled')
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.LONG_TERM_INACTIVE)).toBe('Inactive')
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.SUSPENDED)).toBe('Suspended')
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.ACTIVE)).toBe('Active')
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.TRIAL)).toBe('Free Trial')
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.GRACE_PERIOD)).toBe('Grace Period')
  })
})

// ---------------------------------------------------------------------------
// Edge cases and boundary conditions
// ---------------------------------------------------------------------------

describe('Reactivation domain logic — Edge cases', () => {
  it('handles all possible status enum values', () => {
    // Ensure our reactivation logic covers all possible subscription statuses
    const allStatuses = Object.values(SubscriptionStatus)
    
    allStatuses.forEach(status => {
      // Should not throw errors
      expect(() => canReactivate(status)).not.toThrow()
      expect(() => SubscriptionStatusVO.isOperationallyBlocked(status)).not.toThrow()
      expect(() => SubscriptionStatusVO.isOperationallyActive(status)).not.toThrow()
      expect(() => SubscriptionStatusVO.toBannerSeverity(status)).not.toThrow()
      expect(() => SubscriptionStatusVO.toLabel(status)).not.toThrow()
      
      // Each status should have exactly one classification
      const isReactivatable = canReactivate(status)
      const isBlocked = SubscriptionStatusVO.isOperationallyBlocked(status)
      const isActive = SubscriptionStatusVO.isOperationallyActive(status)
      
      // A status cannot be both active and blocked
      expect(isBlocked && isActive).toBe(false)
      
      // Every status should be classified as either blocked or active
      expect(isBlocked || isActive).toBe(true)
      
      // Reactivatable statuses must be blocked (cannot reactivate an active subscription)
      if (isReactivatable) {
        expect(isBlocked).toBe(true)
        expect(isActive).toBe(false)
      }
    })
  })

  it('maintains consistency between canReactivate and transition rules', () => {
    // Every status that canReactivate returns true for should have valid transitions to ACTIVE
    const allStatuses = Object.values(SubscriptionStatus)
    
    allStatuses.forEach(status => {
      const isReactivatable = canReactivate(status)
      const canTransitionToActive = SubscriptionEngine.canTransition(status, SubscriptionStatus.ACTIVE)
      
      if (isReactivatable) {
        // If a status is reactivatable, there must be a valid transition to ACTIVE
        expect(canTransitionToActive.ok).toBe(true)
      }
    })
  })

  it('validates that suspended status has special handling', () => {
    // SUSPENDED is blocked but not self-service reactivatable
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.SUSPENDED)).toBe(true)
    expect(canReactivate(SubscriptionStatus.SUSPENDED)).toBe(false)
    
    // SUSPENDED should still allow transition to ACTIVE (for admin reactivation)
    const suspendedToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.SUSPENDED,
      SubscriptionStatus.ACTIVE
    )
    expect(suspendedToActive.ok).toBe(true)
  })

  it('validates complete reactivation flow state transitions', () => {
    // Test direct reactivation: EXPIRED → ACTIVE 
    const expiredToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.ACTIVE
    )
    expect(expiredToActive.ok).toBe(true)

    // Test resubscription flow: CANCELLED → GRACE_PERIOD → ACTIVE
    const cancelledToGrace = SubscriptionEngine.canTransition(
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.GRACE_PERIOD
    )
    expect(cancelledToGrace.ok).toBe(true)

    const graceToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.GRACE_PERIOD,
      SubscriptionStatus.ACTIVE
    )
    expect(graceToActive.ok).toBe(true)

    // Test direct reactivation: CANCELLED → ACTIVE
    const cancelledToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.ACTIVE
    )
    expect(cancelledToActive.ok).toBe(true)

    // Test long-term reactivation: LONG_TERM_INACTIVE → ACTIVE
    const longTermToActive = SubscriptionEngine.canTransition(
      SubscriptionStatus.LONG_TERM_INACTIVE,
      SubscriptionStatus.ACTIVE
    )
    expect(longTermToActive.ok).toBe(true)
  })
})