/**
 * capability-actions.ts — Server function wrappers for BOS capability lifecycle
 *
 * Wraps the pure CapabilityControl methods so UI components can call them
 * as authenticated server functions. Each function validates the session,
 * delegates to capability-control.ts, and returns a structured result.
 *
 * Uses rootPrisma (platform-level) matching capability-control.ts which
 * already uses rootPrisma for BusinessCapabilityState writes.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { requireCapability } from '@/lib/better-auth/entitlement-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import type { ControlResult } from '../evolution/capability-control'
import { accept, correctCharacteristic, dismiss, enable, pause, restore } from '../evolution/capability-control'
import type { BusinessCharacteristics } from '../onboarding/types'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CapabilityActionInput {
  capabilityId: string
}

export interface CorrectCharacteristicInput {
  field: keyof BusinessCharacteristics
  value: BusinessCharacteristics[keyof BusinessCharacteristics]
}

// ---------------------------------------------------------------------------
// Accept (RECOMMENDED â†’ ENABLED)
// ---------------------------------------------------------------------------

export const acceptCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS), requireTenantContext()])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    const { businessId, id } = getTenantContext(context).user
    return accept(businessId, data.capabilityId, id)
  })

// ---------------------------------------------------------------------------
// Enable (HIDDEN|RECOMMENDED â†’ ENABLED)
// ---------------------------------------------------------------------------

export const enableCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS), requireTenantContext()])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    const { businessId, id } = getTenantContext(context).user
    return enable(businessId, data.capabilityId, id)
  })

// ---------------------------------------------------------------------------
// Pause (ENABLED|CONFIGURED â†’ PAUSED)
// ---------------------------------------------------------------------------

export const pauseCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS), requireTenantContext()])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    const { businessId, id } = getTenantContext(context).user
    return pause(businessId, data.capabilityId, id)
  })

// ---------------------------------------------------------------------------
// Restore (PAUSED â†’ ENABLED)
// ---------------------------------------------------------------------------

export const restoreCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS), requireTenantContext()])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    const { businessId, id } = getTenantContext(context).user
    return restore(businessId, data.capabilityId, id)
  })

// ---------------------------------------------------------------------------
// Dismiss (RECOMMENDED â†’ HIDDEN, 30-day cooldown)
// ---------------------------------------------------------------------------

export const dismissCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS), requireTenantContext()])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    const { businessId, id } = getTenantContext(context).user
    return dismiss(businessId, data.capabilityId, id)
  })

// ---------------------------------------------------------------------------
// Correct Characteristic (ADMIN_DECISION source — highest priority)
// ---------------------------------------------------------------------------

export const correctCharacteristicFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_PROFILE), requireTenantContext()])
  .inputValidator((d: CorrectCharacteristicInput) => d)
  .handler(async ({ data, context }) => {
    const { businessId, id } = getTenantContext(context).user
    return correctCharacteristic(businessId, data.field, data.value, id)
  })
