/**
 * fetch-capability-states.ts — Fetches BusinessCapabilityState rows for the
 * current business along with the matching registry definition for each.
 *
 * Uses crudAPI (Priority 2) — server-authoritative read with deep select.
 * Returns a merged shape ready for the Capabilities settings page.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { isAlwaysOn } from '../evolution/capability-lifecycle'
import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import type { CapabilityLifecycleState } from '../onboarding/types'

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type CapabilityStateRow = {
  capabilityId: string
  state: CapabilityLifecycleState
  recommendationReason: string | null
  recommendationScore: number | null
  dismissedAt: Date | null
  dismissalCount: number
  permanentlyIgnored: boolean
  enteredAt: Date
  // From CAPABILITY_REGISTRY
  label: string
  description: string
  category: string
  businessValue: string
  estimatedSetupMinutes: number
  isComplex: boolean
  /** Always-on capabilities (core platform features) cannot be paused */
  canBePaused: boolean
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const fetchCapabilityStates = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_CAPABILITIES), requireTenantContext()])
  .handler(async ({ context }): Promise<CapabilityStateRow[]> => {
    const { businessId } = getTenantContext(context).user

    const result = await crudAPI.businessCapabilityState('findMany', {
      where: { businessId },
      select: {
        capabilityId: true,
        state: true,
        recommendationReason: true,
        recommendationScore: true,
        dismissedAt: true,
        dismissalCount: true,
        permanentlyIgnored: true,
        enteredAt: true,
      },
      orderBy: { capabilityId: 'asc' },
    })

    if (result.isErr()) return []

    const rows = result.value as Array<{
      capabilityId: string
      state: string
      recommendationReason: string | null
      recommendationScore: number | null
      dismissedAt: Date | null
      dismissalCount: number
      permanentlyIgnored: boolean
      enteredAt: Date
    }>

    // Build a map of DB rows by capabilityId
    const rowMap = new Map(rows.map(r => [r.capabilityId, r]))

    // Only surface capabilities that are user-configurable:
    //   - Skip always-on caps (checkout, products, settings, etc.) — always enabled, no action available.
    //   - Skip future caps (not yet built) — confusing to show something users can't use.
    //   - Skip auto-managed caps that follow a parent — VIEW_INVENTORY_REPORTS follows MANAGE_INVENTORY,
    //     VIEW_ORDER_HISTORY follows CREATE_ORDER. Users can't configure these independently.
    const FUTURE_IDS = new Set(['LOYALTY_POINTS', 'KITCHEN_DISPLAY', 'DELIVERY_MANAGEMENT'])
    const AUTO_MANAGED_IDS = new Set(['VIEW_INVENTORY_REPORTS', 'VIEW_ORDER_HISTORY'])

    return CAPABILITY_REGISTRY.flatMap(def => {
      const isAlwaysOnCap = !def.deferrable && def.boosters.length === 0 && def.threshold === 0
      if (isAlwaysOnCap || FUTURE_IDS.has(def.id) || AUTO_MANAGED_IDS.has(def.id)) return []

      const row = rowMap.get(def.id)

      // Determine the effective state for capabilities with no DB row yet.
      // These show as HIDDEN — the "Show hidden" toggle makes them available to enable manually.
      const state: CapabilityLifecycleState = row ? (row.state as CapabilityLifecycleState) : 'HIDDEN'

      return [
        {
          capabilityId: def.id,
          state,
          recommendationReason: row?.recommendationReason ?? null,
          recommendationScore: row?.recommendationScore ?? null,
          dismissedAt: row?.dismissedAt ?? null,
          dismissalCount: row?.dismissalCount ?? 0,
          permanentlyIgnored: row?.permanentlyIgnored ?? false,
          enteredAt: row?.enteredAt ?? new Date(),
          label: def.label,
          description: def.description,
          category: def.category,
          businessValue: def.businessValue,
          estimatedSetupMinutes: def.estimatedSetupMinutes,
          isComplex: def.isComplex,
          canBePaused: !isAlwaysOn(def),
        },
      ]
    })
  })
