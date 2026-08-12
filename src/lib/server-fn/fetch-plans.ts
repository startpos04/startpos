/**
 * fetch-plans.ts
 *
 * Returns all active subscription plans with their entitlements, used by
 * /billing/plans to render the tier selection page.
 *
 * Public — no auth required. Uses coreAPI (platform-level, no tenant scope).
 */

import { coreAPI } from '@/lib/prisma-client/core-api'

export type PlanWithEntitlements = {
  id: string
  name: string
  description: string
  sortOrder: number
  monthlyPrice: number
  /** Annual fee in cents. null = no annual discount configured; compute as monthlyPrice × 12 in the UI. */
  annualPrice: number | null
  includedTxPerMonth: number
  entitlements: Array<{
    featureKey: string
    usageLimit: number | null
  }>
}

export const fetchPlans = async (): Promise<PlanWithEntitlements[]> => {
  const result = await coreAPI.subscriptionPlan('findMany', {
    where: {
      isActive: true,
      NOT: { name: 'Trial' },
    },
    include: {
      entitlements: {
        select: { featureKey: true, usageLimit: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  if (result.isErr()) throw new Error(result.error)

  return result.value.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    sortOrder: p.sortOrder,
    monthlyPrice: p.monthlyPrice,
    annualPrice: p.annualPrice ?? null,
    includedTxPerMonth: p.includedTxPerMonth,
    entitlements: (p.entitlements ?? []).map(e => ({
      featureKey: e.featureKey,
      usageLimit: e.usageLimit,
    })),
  }))
}
