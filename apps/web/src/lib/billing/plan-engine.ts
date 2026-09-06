/**
 * plan-engine.ts
 *
 * PlanEngine — pure domain engine for plan comparison, upgrade eligibility,
 * and upgrade path resolution.
 *
 * Architectural contract (ADR-001):
 *   - No Prisma imports, no DB calls, no side effects.
 *   - All plan data arrives as DTOs from the Application Layer.
 *   - Returns plain values or OperationResult — no exceptions.
 *
 * Usage:
 *   const plans = await rootPrisma.subscriptionPlan.findMany(...)
 *   const eligible = PlanEngine.upgradeOptions(currentPlanSortOrder, plans)
 */

import { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import { type OperationResult, opFail, opOk } from '@platform/lib/result'
import { SubscriptionStatusVO } from './value-objects/subscription-status'

// ---------------------------------------------------------------------------
// PlanDTO
// Plain representation of a SubscriptionPlan — safe to use in the domain layer.
// ---------------------------------------------------------------------------
export type PlanDTO = {
  id: string
  name: string
  description: string
  sortOrder: number
  monthlyPrice: number // cents
  /** Annual fee in cents. null = no annual discount set; use monthlyPrice × 12. */
  annualPrice: number | null
  includedTxPerMonth: number // -1 = unlimited
  isActive: boolean
}

// ---------------------------------------------------------------------------
// PlanEngine
// ---------------------------------------------------------------------------

export const PlanEngine = {
  /**
   * Returns all plans the business can upgrade to from their current plan.
   * Upgrade = a plan with a higher sortOrder.
   * Only active plans are included.
   *
   * @param currentSortOrder - The sortOrder of the business's current plan
   * @param allPlans - All available SubscriptionPlan records as DTOs
   */
  upgradeOptions(currentSortOrder: number, allPlans: PlanDTO[]): PlanDTO[] {
    return allPlans.filter(p => p.isActive && p.sortOrder > currentSortOrder).sort((a, b) => a.sortOrder - b.sortOrder)
  },

  /**
   * Returns all plans the business can downgrade to from their current plan.
   * Downgrade = a plan with a lower sortOrder that is not the Trial plan (sortOrder 0).
   */
  downgradeOptions(currentSortOrder: number, allPlans: PlanDTO[]): PlanDTO[] {
    return allPlans.filter(p => p.isActive && p.sortOrder > 0 && p.sortOrder < currentSortOrder).sort((a, b) => b.sortOrder - a.sortOrder)
  },

  /**
   * Returns whether a business is eligible to self-service reactivate their
   * subscription. Reactivation is available when the business is in a blocked
   * state but has not been suspended by an admin.
   */
  canSelfReactivate(status: SubscriptionStatus): OperationResult<void> {
    if (SubscriptionStatusVO.canReactivate(status)) {
      return opOk()
    }

    if (status === SubscriptionStatus.SUSPENDED) {
      return opFail('PRECONDITION_FAILED', 'Your account has been suspended. Please contact support to reactivate.')
    }

    return opFail('PRECONDITION_FAILED', `Reactivation is not available from ${SubscriptionStatusVO.toLabel(status)} status.`)
  },

  /**
   * Formats a monthly price in cents to a human-readable string.
   * e.g., 49900 → "₱499.00/mo"
   */
  formatMonthlyPrice(cents: number): string {
    if (cents === 0) return 'Free'
    const formatted = (cents / 100).toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${formatted}/mo`
  },

  /**
   * Formats an annual price in cents to a human-readable string.
   * Falls back to monthlyPrice × 12 when annualPrice is null.
   * e.g., 479040 → "₱4,790.40/yr"
   */
  formatAnnualPrice(monthlyPrice: number, annualPrice: number | null): string {
    if (monthlyPrice === 0) return 'Free'
    const total = annualPrice ?? monthlyPrice * 12
    const formatted = (total / 100).toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${formatted}/yr`
  },

  /**
   * Returns the effective per-month equivalent of the annual price (for display).
   * e.g., annualPrice=479040 → 39920 cents/mo → "₱399.20/mo"
   */
  formatAnnualMonthlyEquivalent(monthlyPrice: number, annualPrice: number | null): string {
    if (monthlyPrice === 0) return 'Free'
    const annual = annualPrice ?? monthlyPrice * 12
    const perMonth = Math.round(annual / 12)
    const formatted = (perMonth / 100).toLocaleString('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${formatted}/mo`
  },

  /**
   * Returns a short human-readable TX allowance string.
   * e.g., 500 → "500 TX/mo", -1 → "Unlimited TX"
   */
  formatTxAllowance(includedTxPerMonth: number): string {
    if (includedTxPerMonth === -1) return 'Unlimited TX'
    return `${includedTxPerMonth.toLocaleString()} TX/mo`
  },
}
