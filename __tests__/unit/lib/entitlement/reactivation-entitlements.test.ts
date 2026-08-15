/**
 * reactivation-entitlements.test.ts
 *
 * Tests to verify that the EntitlementEngine properly handles reactivated subscriptions
 * and grants full feature access when subscriptions transition from reactivatable statuses
 * (EXPIRED, CANCELLED, LONG_TERM_INACTIVE) to ACTIVE.
 */

import { describe, expect, it } from 'vitest'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { EntitlementEngine } from '@/lib/entitlement/entitlement-engine'
import { EntitlementCode, SubscriptionStatus, type EntitlementContext } from '@/lib/entitlement/entitlement-types'

describe('EntitlementEngine - Reactivated Subscription Handling', () => {
  const baseContext: EntitlementContext = {
    status: SubscriptionStatus.ACTIVE, // Will be overridden in tests
    billingModel: 'MONTHLY_SUBSCRIPTION',
    planFeatures: [
      Capabilities.COMPLETE_CHECKOUT,
      Capabilities.CREATE_ORDER,
      Capabilities.MANAGE_INVENTORY,
      Capabilities.VIEW_ORDER_HISTORY,
    ],
    usageLimits: {},
    currentUsage: {},
    txRemaining: 500,
    overrides: [],
    creditBalance: null,
  }

  describe('ACTIVE status grants full access', () => {
    it('grants all plan features for ACTIVE subscription', () => {
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
      }

      // All operational features should be granted
      expect(EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)).toEqual({
        granted: true,
        code: EntitlementCode.GRANTED,
        remaining: null,
      })

      expect(EntitlementEngine.check(Capabilities.CREATE_ORDER, context)).toEqual({
        granted: true,
        code: EntitlementCode.GRANTED,
        remaining: null,
      })

      expect(EntitlementEngine.check(Capabilities.MANAGE_INVENTORY, context)).toEqual({
        granted: true,
        code: EntitlementCode.GRANTED,
        remaining: null,
      })
    })

    it('grants management features for ACTIVE subscription', () => {
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        planFeatures: [Capabilities.VIEW_BILLING_SETTINGS, Capabilities.MANAGE_BUSINESS_PROFILE],
      }

      expect(EntitlementEngine.check(Capabilities.VIEW_BILLING_SETTINGS, context)).toEqual({
        granted: true,
        code: EntitlementCode.GRANTED,
        remaining: null,
      })

      expect(EntitlementEngine.check(Capabilities.MANAGE_BUSINESS_PROFILE, context)).toEqual({
        granted: true,
        code: EntitlementCode.GRANTED,
        remaining: null,
      })
    })
  })

  describe('Non-ACTIVE statuses block operational features', () => {
    const testCases = [
      { status: SubscriptionStatus.EXPIRED, expectedCode: EntitlementCode.SUBSCRIPTION_EXPIRED },
      { status: SubscriptionStatus.SUSPENDED, expectedCode: EntitlementCode.SUBSCRIPTION_SUSPENDED },
      { status: SubscriptionStatus.LONG_TERM_INACTIVE, expectedCode: EntitlementCode.LONG_TERM_INACTIVE },
    ] as const

    testCases.forEach(({ status, expectedCode }) => {
      it(`blocks operational features for ${status} status`, () => {
        const context: EntitlementContext = {
          ...baseContext,
          status,
        }

        const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
        expect(result.granted).toBe(false)
        expect(result.code).toBe(expectedCode)
        if (status === SubscriptionStatus.EXPIRED) {
          expect(result.reason).toContain('Upgrade your plan')
        } else {
          expect(result.reason).toContain('reactivate')
        }
      })

      it(`still allows management features for ${status} status`, () => {
        const context: EntitlementContext = {
          ...baseContext,
          status,
          planFeatures: [Capabilities.VIEW_BILLING_SETTINGS],
        }

        // Management features should still work even when operational features are blocked
        const result = EntitlementEngine.check(Capabilities.VIEW_BILLING_SETTINGS, context)
        expect(result.granted).toBe(true)
        expect(result.code).toBe(EntitlementCode.GRANTED)
      })
    })
  })

  describe('Reactivation status transitions', () => {
    it('immediately restores access when status changes from EXPIRED to ACTIVE', () => {
      // Before reactivation - EXPIRED blocks operational features
      const expiredContext: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.EXPIRED,
      }

      const blockedResult = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, expiredContext)
      expect(blockedResult.granted).toBe(false)
      expect(blockedResult.code).toBe(EntitlementCode.SUBSCRIPTION_EXPIRED)

      // After reactivation - ACTIVE grants full access
      const activeContext: EntitlementContext = {
        ...expiredContext,
        status: SubscriptionStatus.ACTIVE,
      }

      const grantedResult = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, activeContext)
      expect(grantedResult.granted).toBe(true)
      expect(grantedResult.code).toBe(EntitlementCode.GRANTED)
    })

    it('immediately restores access when status changes from CANCELLED to ACTIVE', () => {
      const cancelledContext: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.CANCELLED,
      }

      // CANCELLED doesn't block operational features by default (falls through to plan check)
      // But let's test a more comprehensive scenario
      const contextWithoutFeature: EntitlementContext = {
        ...cancelledContext,
        planFeatures: [], // No features in cancelled plan
      }

      const blockedResult = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, contextWithoutFeature)
      expect(blockedResult.granted).toBe(false)
      expect(blockedResult.code).toBe(EntitlementCode.FEATURE_NOT_IN_PLAN)

      // After reactivation with proper plan
      const reactivatedContext: EntitlementContext = {
        ...contextWithoutFeature,
        status: SubscriptionStatus.ACTIVE,
        planFeatures: [Capabilities.COMPLETE_CHECKOUT],
      }

      const grantedResult = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, reactivatedContext)
      expect(grantedResult.granted).toBe(true)
      expect(grantedResult.code).toBe(EntitlementCode.GRANTED)
    })

    it('immediately restores access when status changes from LONG_TERM_INACTIVE to ACTIVE', () => {
      const inactiveContext: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.LONG_TERM_INACTIVE,
      }

      const blockedResult = EntitlementEngine.check(Capabilities.CREATE_ORDER, inactiveContext)
      expect(blockedResult.granted).toBe(false)
      expect(blockedResult.code).toBe(EntitlementCode.LONG_TERM_INACTIVE)

      // After reactivation
      const activeContext: EntitlementContext = {
        ...inactiveContext,
        status: SubscriptionStatus.ACTIVE,
      }

      const grantedResult = EntitlementEngine.check(Capabilities.CREATE_ORDER, activeContext)
      expect(grantedResult.granted).toBe(true)
      expect(grantedResult.code).toBe(EntitlementCode.GRANTED)
    })
  })

  describe('Transaction and credit limits after reactivation', () => {
    it('respects transaction limits for reactivated subscription', () => {
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        txRemaining: 0, // No transactions remaining
      }

      const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
      expect(result.granted).toBe(false)
      expect(result.code).toBe(EntitlementCode.TX_ALLOWANCE_EXHAUSTED)
    })

    it('respects credit balance for reactivated prepaid subscription', () => {
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        billingModel: 'PREPAID_CREDITS',
        creditBalance: 0, // No credits remaining
      }

      const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
      expect(result.granted).toBe(false)
      expect(result.code).toBe(EntitlementCode.CREDIT_BALANCE_ZERO)
    })

    it('grants access when reactivated subscription has sufficient resources', () => {
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        billingModel: 'PREPAID_CREDITS',
        txRemaining: null, // Not applicable for prepaid
        creditBalance: 100, // Sufficient credits
      }

      const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
      expect(result.granted).toBe(true)
      expect(result.code).toBe(EntitlementCode.GRANTED)
    })
  })

  describe('Plan feature consistency after reactivation', () => {
    it('grants only features included in the reactivated plan', () => {
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        planFeatures: [Capabilities.COMPLETE_CHECKOUT], // Limited plan
      }

      // Should grant features in the plan
      const grantedResult = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
      expect(grantedResult.granted).toBe(true)

      // Should deny features not in the plan
      const deniedResult = EntitlementEngine.check(Capabilities.CREATE_ORDER, context)
      expect(deniedResult.granted).toBe(false)
      expect(deniedResult.code).toBe(EntitlementCode.FEATURE_NOT_IN_PLAN)
    })

    it('respects entitlement overrides after reactivation', () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 86400000) // 24 hours from now

      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        planFeatures: [], // No features in base plan
        overrides: [
          {
            featureKey: Capabilities.COMPLETE_CHECKOUT,
            granted: true,
            expiresAt: futureDate,
          },
        ],
      }

      // Should grant feature via override even if not in plan
      const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
      expect(result.granted).toBe(true)
      expect(result.code).toBe(EntitlementCode.GRANTED)
    })
  })

  describe('buildSummary for reactivated subscriptions', () => {
    it('includes all granted capabilities in summary', () => {
      const allCapabilities = Object.values(Capabilities)
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        planFeatures: [
          Capabilities.COMPLETE_CHECKOUT,
          Capabilities.CREATE_ORDER,
          Capabilities.MANAGE_INVENTORY,
        ],
      }

      const summary = EntitlementEngine.buildSummary(allCapabilities, context, {
        trialEndsAt: null,
        currentPeriodEnd: new Date(),
        billingModel: 'MONTHLY_SUBSCRIPTION',
        cancelledAt: null,
        txAddonTotal: 0,
        planId: 'plan-pro',
      })

      expect(summary.status).toBe(SubscriptionStatus.ACTIVE)
      expect(summary.capabilities).toContain(Capabilities.COMPLETE_CHECKOUT)
      expect(summary.capabilities).toContain(Capabilities.CREATE_ORDER)
      expect(summary.capabilities).toContain(Capabilities.MANAGE_INVENTORY)
      expect(summary.txRemaining).toBe(500)
      expect(summary.planId).toBe('plan-pro')
    })

    it('excludes blocked capabilities from summary', () => {
      const allCapabilities = Object.values(Capabilities)
      const context: EntitlementContext = {
        ...baseContext,
        status: SubscriptionStatus.ACTIVE,
        planFeatures: [Capabilities.COMPLETE_CHECKOUT], // Limited plan
        txRemaining: 0, // No transactions left
      }

      const summary = EntitlementEngine.buildSummary(allCapabilities, context)

      expect(summary.status).toBe(SubscriptionStatus.ACTIVE)
      // COMPLETE_CHECKOUT should be excluded due to TX_ALLOWANCE_EXHAUSTED
      expect(summary.capabilities).not.toContain(Capabilities.COMPLETE_CHECKOUT)
      expect(summary.txRemaining).toBe(0)
    })
  })
})