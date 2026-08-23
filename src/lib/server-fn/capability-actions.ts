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

import { createServerFn } from '@tanstack/react-start'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requireCapability } from '../better-auth/entitlement-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { Capabilities } from '../entitlement/capability-keys'
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
// Accept (RECOMMENDED → ENABLED)
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
// Enable (HIDDEN|RECOMMENDED → ENABLED)
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
// Pause (ENABLED|CONFIGURED → PAUSED)
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
// Restore (PAUSED → ENABLED)
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
// Dismiss (RECOMMENDED → HIDDEN, 30-day cooldown)
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
// Correct Characteristic (ADMIN_DECISION source — highest priority)
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
