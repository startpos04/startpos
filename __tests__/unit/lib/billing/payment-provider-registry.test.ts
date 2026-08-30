/**
 * payment-provider-registry.test.ts
 *
 * Unit tests for PaymentProviderRegistry — the central registry for payment provider adapters.
 *
 * All methods are pure / side-effect free except for the registration itself,
 * so no mocks are required.
 *
 * Coverage:
 *  - register: successful registration of provider and config
 *  - getAdapter: enabled provider, disabled provider, non-existent provider
 *  - getEnabledProviders: filtering by enabled status and country availability
 *  - getConfig: existing and non-existent providers
 *  - isProviderEnabled: enabled, disabled, and non-existent providers
 *  - getCapabilities: provider capabilities, non-existent provider
 *  - getDisplayName: valid and invalid provider names
 *  - requiresGracePeriod: grace period requirements
 *  - getGracePeriodDays: default and custom grace period durations
 *  - clear: registry reset functionality
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { PaymentProviderRegistry, type PaymentProviderConfig, type ProviderCapabilities } from '@/lib/billing/payment-provider-registry'
import type { BillingProviderAdapter } from '@/lib/billing/billing-provider'

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

// Mock adapter for testing
const createMockAdapter = (providerId: string, capabilities: ProviderCapabilities): BillingProviderAdapter => ({
  getProviderId: () => providerId as any,
  getProviderName: () => `Mock ${providerId}`,
  getCapabilities: () => capabilities,
  createSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  createCustomerPortal: vi.fn(),
  processWebhook: vi.fn(),
})

// Test configurations
const stripeConfig: PaymentProviderConfig = {
  providerId: 'stripe',
  displayName: 'Credit/Debit Card',
  isEnabled: true,
  requiresApproval: false,
  description: 'Instant activation with automatic monthly renewal',
  badges: ['Instant', 'Automatic'],
  displayOrder: 1,
  config: { setupRoute: '/billing/stripe-setup' }
}

const manualConfig: PaymentProviderConfig = {
  providerId: 'manual',
  displayName: 'Manual Payment',
  isEnabled: true,
  requiresApproval: true,
  gracePeriodDays: 14,
  availableInCountries: ['PH'],
  description: 'Manual payment via GCash, Bank Transfer, or Maya',
  badges: ['Manual Review'],
  displayOrder: 2,
  config: { setupRoute: '/billing/manual-payment' }
}

const disabledConfig: PaymentProviderConfig = {
  providerId: 'paymongo',
  displayName: 'PayMongo',
  isEnabled: false,
  requiresApproval: false,
  displayOrder: 3,
  config: {}
}

const stripeCapabilities: ProviderCapabilities = {
  supportsAutomaticConfirmation: true,
  supportsManualReview: false,
  supportsWebhook: true,
  supportsRefund: true,
  supportsRecurring: true,
  supportsCustomerPortal: true
}

const manualCapabilities: ProviderCapabilities = {
  supportsAutomaticConfirmation: false,
  supportsManualReview: true,
  supportsWebhook: false,
  supportsRefund: false,
  supportsRecurring: false,
  supportsCustomerPortal: false
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentProviderRegistry', () => {
  let registry: PaymentProviderRegistry

  beforeEach(() => {
    registry = new PaymentProviderRegistry()
  })

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('successfully registers a provider with adapter and config', () => {
      const adapter = createMockAdapter('stripe', stripeCapabilities)
      
      // Should not throw
      registry.register('stripe', adapter, stripeConfig)
      
      // Verify registration worked
      expect(registry.getAdapter('stripe')).toBe(adapter)
      expect(registry.getConfig('stripe')).toEqual(stripeConfig)
    })

    it('allows overriding existing provider registration', () => {
      const adapter1 = createMockAdapter('stripe', stripeCapabilities)
      const adapter2 = createMockAdapter('stripe', stripeCapabilities)
      
      registry.register('stripe', adapter1, stripeConfig)
      registry.register('stripe', adapter2, { ...stripeConfig, displayName: 'Updated Stripe' })
      
      expect(registry.getAdapter('stripe')).toBe(adapter2)
      expect(registry.getConfig('stripe')?.displayName).toBe('Updated Stripe')
    })
  })

  // -------------------------------------------------------------------------
  // getAdapter
  // -------------------------------------------------------------------------

  describe('getAdapter', () => {
    it('returns adapter for enabled provider', () => {
      const adapter = createMockAdapter('stripe', stripeCapabilities)
      registry.register('stripe', adapter, stripeConfig)
      
      expect(registry.getAdapter('stripe')).toBe(adapter)
    })

    it('returns null for disabled provider', () => {
      const adapter = createMockAdapter('paymongo', stripeCapabilities)
      registry.register('paymongo', adapter, disabledConfig)
      
      expect(registry.getAdapter('paymongo')).toBeNull()
    })

    it('returns null for non-existent provider', () => {
      expect(registry.getAdapter('nonexistent' as any)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // getEnabledProviders
  // -------------------------------------------------------------------------

  describe('getEnabledProviders', () => {
    beforeEach(() => {
      const stripeAdapter = createMockAdapter('stripe', stripeCapabilities)
      const manualAdapter = createMockAdapter('manual', manualCapabilities)
      const disabledAdapter = createMockAdapter('paymongo', stripeCapabilities)
      
      registry.register('stripe', stripeAdapter, stripeConfig)
      registry.register('manual', manualAdapter, manualConfig)
      registry.register('paymongo', disabledAdapter, disabledConfig)
    })

    it('returns only enabled providers', () => {
      const providers = registry.getEnabledProviders()
      
      expect(providers).toHaveLength(2)
      expect(providers.map(p => p.providerId)).toEqual(['stripe', 'manual'])
    })

    it('filters by country availability', () => {
      const providers = registry.getEnabledProviders('PH')
      
      // Stripe has no country restriction (undefined), Manual is PH-specific
      expect(providers).toHaveLength(2)
      expect(providers.map(p => p.providerId)).toEqual(['stripe', 'manual'])
    })

    it('filters out providers not available in specified country', () => {
      const providers = registry.getEnabledProviders('US')
      
      // Only Stripe should be available (no country restriction)
      expect(providers).toHaveLength(1)
      expect(providers[0].providerId).toBe('stripe')
    })

    it('sorts providers by display order', () => {
      const reversedManualConfig = { ...manualConfig, displayOrder: 0 }
      const manualAdapter = createMockAdapter('manual', manualCapabilities)
      
      // Re-register manual with lower display order
      registry.register('manual', manualAdapter, reversedManualConfig)
      
      const providers = registry.getEnabledProviders()
      expect(providers[0].providerId).toBe('manual') // displayOrder: 0
      expect(providers[1].providerId).toBe('stripe') // displayOrder: 1
    })
  })

  // -------------------------------------------------------------------------
  // getConfig
  // -------------------------------------------------------------------------

  describe('getConfig', () => {
    it('returns config for registered provider', () => {
      const adapter = createMockAdapter('stripe', stripeCapabilities)
      registry.register('stripe', adapter, stripeConfig)
      
      expect(registry.getConfig('stripe')).toEqual(stripeConfig)
    })

    it('returns null for non-existent provider', () => {
      expect(registry.getConfig('nonexistent' as any)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // isProviderEnabled
  // -------------------------------------------------------------------------

  describe('isProviderEnabled', () => {
    beforeEach(() => {
      const stripeAdapter = createMockAdapter('stripe', stripeCapabilities)
      const disabledAdapter = createMockAdapter('paymongo', stripeCapabilities)
      
      registry.register('stripe', stripeAdapter, stripeConfig)
      registry.register('paymongo', disabledAdapter, disabledConfig)
    })

    it('returns true for enabled provider', () => {
      expect(registry.isProviderEnabled('stripe')).toBe(true)
    })

    it('returns false for disabled provider', () => {
      expect(registry.isProviderEnabled('paymongo')).toBe(false)
    })

    it('returns false for non-existent provider', () => {
      expect(registry.isProviderEnabled('nonexistent' as any)).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // getCapabilities
  // -------------------------------------------------------------------------

  describe('getCapabilities', () => {
    it('returns capabilities for enabled provider', () => {
      const adapter = createMockAdapter('stripe', stripeCapabilities)
      registry.register('stripe', adapter, stripeConfig)
      
      expect(registry.getCapabilities('stripe')).toEqual(stripeCapabilities)
    })

    it('returns null for disabled provider', () => {
      const adapter = createMockAdapter('paymongo', stripeCapabilities)
      registry.register('paymongo', adapter, disabledConfig)
      
      expect(registry.getCapabilities('paymongo')).toBeNull()
    })

    it('returns null for non-existent provider', () => {
      expect(registry.getCapabilities('nonexistent' as any)).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // getDisplayName
  // -------------------------------------------------------------------------

  describe('getDisplayName', () => {
    it('returns display name for registered provider', () => {
      const adapter = createMockAdapter('stripe', stripeCapabilities)
      registry.register('stripe', adapter, stripeConfig)
      
      expect(registry.getDisplayName('stripe')).toBe('Credit/Debit Card')
    })

    it('returns "Unknown" for non-existent provider', () => {
      expect(registry.getDisplayName('nonexistent' as any)).toBe('Unknown')
    })
  })

  // -------------------------------------------------------------------------
  // requiresGracePeriod
  // -------------------------------------------------------------------------

  describe('requiresGracePeriod', () => {
    beforeEach(() => {
      const stripeAdapter = createMockAdapter('stripe', stripeCapabilities)
      const manualAdapter = createMockAdapter('manual', manualCapabilities)
      
      registry.register('stripe', stripeAdapter, stripeConfig)
      registry.register('manual', manualAdapter, manualConfig)
    })

    it('returns false for provider that does not require approval', () => {
      expect(registry.requiresGracePeriod('stripe')).toBe(false)
    })

    it('returns true for provider that requires approval', () => {
      expect(registry.requiresGracePeriod('manual')).toBe(true)
    })

    it('returns false for non-existent provider', () => {
      expect(registry.requiresGracePeriod('nonexistent' as any)).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // getGracePeriodDays
  // -------------------------------------------------------------------------

  describe('getGracePeriodDays', () => {
    beforeEach(() => {
      const stripeAdapter = createMockAdapter('stripe', stripeCapabilities)
      const manualAdapter = createMockAdapter('manual', manualCapabilities)
      
      registry.register('stripe', stripeAdapter, stripeConfig)
      registry.register('manual', manualAdapter, manualConfig)
    })

    it('returns custom grace period days when specified', () => {
      expect(registry.getGracePeriodDays('manual')).toBe(14)
    })

    it('returns default grace period days when not specified', () => {
      expect(registry.getGracePeriodDays('stripe')).toBe(7)
    })

    it('returns default for non-existent provider', () => {
      expect(registry.getGracePeriodDays('nonexistent' as any)).toBe(7)
    })
  })

  // -------------------------------------------------------------------------
  // getRegisteredProviderIds
  // -------------------------------------------------------------------------

  describe('getRegisteredProviderIds', () => {
    it('returns empty array for empty registry', () => {
      expect(registry.getRegisteredProviderIds()).toEqual([])
    })

    it('returns all registered provider IDs', () => {
      const stripeAdapter = createMockAdapter('stripe', stripeCapabilities)
      const manualAdapter = createMockAdapter('manual', manualCapabilities)
      
      registry.register('stripe', stripeAdapter, stripeConfig)
      registry.register('manual', manualAdapter, manualConfig)
      
      const providerIds = registry.getRegisteredProviderIds()
      expect(providerIds).toHaveLength(2)
      expect(providerIds).toContain('stripe')
      expect(providerIds).toContain('manual')
    })
  })

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('removes all registered providers and configs', () => {
      const stripeAdapter = createMockAdapter('stripe', stripeCapabilities)
      registry.register('stripe', stripeAdapter, stripeConfig)
      
      // Verify registration
      expect(registry.getAdapter('stripe')).toBe(stripeAdapter)
      
      // Clear registry
      registry.clear()
      
      // Verify cleared
      expect(registry.getAdapter('stripe')).toBeNull()
      expect(registry.getConfig('stripe')).toBeNull()
      expect(registry.getRegisteredProviderIds()).toEqual([])
    })
  })
})