/**
 * use-capability.ts — Client-side capability access hook
 *
 * Reads from authStore.user.entitlement.capabilities (populated once at
 * session load by EntitlementEngine.buildSummary). No server call on every
 * render — the capability list is already in the session.
 *
 * Usage:
 *   // Check a single capability
 *   const canCreateOrder = useCapability(Capabilities.CREATE_ORDER)
 *   if (!canCreateOrder) return <FeatureDisabled ... />
 *
 *   // Check multiple at once
 *   const { CREATE_ORDER, MANAGE_INVENTORY } = useCapabilities([
 *     Capabilities.CREATE_ORDER,
 *     Capabilities.MANAGE_INVENTORY,
 *   ])
 *
 * Architecture note:
 *   This is UI-layer gating only. It prevents rendering features the user
 *   can't access, but it does NOT replace server-side checks. Server functions
 *   that mutate data must use entitlementMiddleware to enforce access
 *   independently of what the client sends.
 */

import { useStore } from '@tanstack/react-store'
import type { CapabilityKey } from '@/lib/entitlement/capability-keys'
import { authStore } from '@/lib/better-auth/auth-store'

// ---------------------------------------------------------------------------
// Single capability check
// ---------------------------------------------------------------------------

/**
 * Returns true if the current session has the given capability granted.
 *
 * @param capability - A CapabilityKey constant from capability-keys.ts
 *
 * @example
 * const canCheckout = useCapability(Capabilities.COMPLETE_CHECKOUT)
 */
export function useCapability(capability: CapabilityKey): boolean {
  return useStore(authStore, state => state.user?.entitlement?.capabilities?.includes(capability) ?? false)
}

// ---------------------------------------------------------------------------
// Multiple capability check (batch — avoids multiple store subscriptions)
// ---------------------------------------------------------------------------

/**
 * Returns a record of boolean values for each requested capability.
 * Use when you need to check several capabilities in the same component.
 *
 * @param capabilities - Array of CapabilityKey constants
 *
 * @example
 * const { CREATE_ORDER, MANAGE_INVENTORY } = useCapabilities([
 *   Capabilities.CREATE_ORDER,
 *   Capabilities.MANAGE_INVENTORY,
 * ])
 */
export function useCapabilities<T extends CapabilityKey>(capabilities: T[]): Record<T, boolean> {
  const granted = useStore(authStore, state => state.user?.entitlement?.capabilities ?? [])

  return Object.fromEntries(capabilities.map(cap => [cap, granted.includes(cap)])) as Record<T, boolean>
}

// ---------------------------------------------------------------------------
// Subscription status check
// ---------------------------------------------------------------------------

/**
 * Returns the current subscription status string, or undefined if not loaded.
 * Use for displaying banners, upgrade prompts, or blocking entire routes.
 *
 * @example
 * const status = useSubscriptionStatus()
 * if (status === 'EXPIRED') return <RenewBanner />
 */
export function useSubscriptionStatus() {
  return useStore(authStore, state => state.user?.entitlement?.status)
}
