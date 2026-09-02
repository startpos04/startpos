/**
 * capability-actions.ts â€” Server function wrappers for BOS capability lifecycle
 *
 * Wraps the pure CapabilityControl methods so UI components can call them
 * as authenticated server functions. Each function validates the session,
 * delegates to capability-control.ts, and returns a structured result.
 *
 * Uses rootPrisma (platform-level) matching capability-control.ts which
 * already uses rootPrisma for BusinessCapabilityState writes.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { requireCapability } from '@platform/lib/better-auth/entitlement-middleware'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { createServerFn } from '@tanstack/react-start'
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
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS)])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    if (!context?.user?.id || !context?.user?.businessId) {
      return { ok: false, code: 'INTERNAL_ERROR', reason: 'Not authenticated' }
    }
    return accept(context.user.businessId, data.capabilityId, context.user.id)
  })

// ---------------------------------------------------------------------------
// Enable (HIDDEN|RECOMMENDED â†’ ENABLED)
// ---------------------------------------------------------------------------

export const enableCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS)])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    if (!context?.user?.id || !context?.user?.businessId) {
      return { ok: false, code: 'INTERNAL_ERROR', reason: 'Not authenticated' }
    }
    return enable(context.user.businessId, data.capabilityId, context.user.id)
  })

// ---------------------------------------------------------------------------
// Pause (ENABLED|CONFIGURED â†’ PAUSED)
// ---------------------------------------------------------------------------

export const pauseCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS)])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    if (!context?.user?.id || !context?.user?.businessId) {
      return { ok: false, code: 'INTERNAL_ERROR', reason: 'Not authenticated' }
    }
    return pause(context.user.businessId, data.capabilityId, context.user.id)
  })

// ---------------------------------------------------------------------------
// Restore (PAUSED â†’ ENABLED)
// ---------------------------------------------------------------------------

export const restoreCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS)])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    if (!context?.user?.id || !context?.user?.businessId) {
      return { ok: false, code: 'INTERNAL_ERROR', reason: 'Not authenticated' }
    }
    return restore(context.user.businessId, data.capabilityId, context.user.id)
  })

// ---------------------------------------------------------------------------
// Dismiss (RECOMMENDED â†’ HIDDEN, 30-day cooldown)
// ---------------------------------------------------------------------------

export const dismissCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.MANAGE_SETTINGS)])
  .inputValidator((d: CapabilityActionInput) => d)
  .handler(async ({ data, context }): Promise<ControlResult> => {
    if (!context?.user?.id || !context?.user?.businessId) {
      return { ok: false, code: 'INTERNAL_ERROR', reason: 'Not authenticated' }
    }
    return dismiss(context.user.businessId, data.capabilityId, context.user.id)
  })

// ---------------------------------------------------------------------------
// Correct Characteristic (ADMIN_DECISION source â€” highest priority)
// ---------------------------------------------------------------------------

export const correctCharacteristicFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_PROFILE)])
  .inputValidator((d: CorrectCharacteristicInput) => d)
  .handler(async ({ data, context }) => {
    if (!context?.user?.id || !context?.user?.businessId) {
      return { ok: false as const, reason: 'Not authenticated' }
    }
    return correctCharacteristic(context.user.businessId, data.field, data.value, context.user.id)
  })
