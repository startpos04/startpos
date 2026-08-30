/**
 * manual-adapter.ts
 * 
 * ManualPaymentAdapter — concrete implementation of BillingProviderAdapter 
 * for manual payment methods (GCash, Bank Transfer, Maya, etc.)
 * 
 * Design principles:
 * - Generic manual provider (not GCash-specific)
 * - Handles payment submission, admin approval workflow
 * - Creates BillingPayment records in PENDING_APPROVAL status
 * - No external API calls - all state managed in database
 */

import dayjs from '@/lib/dayjs'
import type {
  BillingProviderAdapter,
  CancelSubscriptionResult,
  CreateCustomerResult,
  CreatePaymentLinkResult,
  CreateSubscriptionResult,
  ProviderInvoice,
  WebhookEvent,
  PaymentProviderId,
  ProviderCapabilities,
} from '../billing-provider'
import { paymentProviderRegistry } from '../payment-provider-registry'
import { getProviderConfig } from '../provider-config'
import { prisma } from '@/lib/prisma-client'

export type ManualPaymentProviderConfig = {
  paymentMethod: 'GCASH' | 'BANK_TRANSFER' | 'MAYA'
  accountName: string
  accountNumber: string
  paymentInstructions: string
  gracePeriodDays: number
  autoExpireDays: number
  setupRoute: string
}

/**
 * ManualPaymentAdapter
 * 
 * Handles manual payment flows where users submit payment proof
 * and admin manually approves/rejects the payment.
 */
class ManualPaymentAdapter implements BillingProviderAdapter {
  constructor(private config: ManualPaymentProviderConfig) {}

  // -------------------------------------------------------------------------
  // Provider Identity Methods
  // -------------------------------------------------------------------------

  getCapabilities(): ProviderCapabilities {
    return {
      supportsAutomaticConfirmation: false,
      supportsManualReview: true,
      supportsWebhook: false,
      supportsRefund: false,  // Manual refunds handled outside system
      supportsRecurring: false,
      supportsCustomerPortal: false,
    }
  }

  getProviderId(): PaymentProviderId {
    return 'manual'
  }

  getProviderName(): string {
    return 'Manual Payment'
  }

  // -------------------------------------------------------------------------
  // Customer Management
  // -------------------------------------------------------------------------

  async createCustomer(params: { businessId: string; businessName: string; email: string }): Promise<CreateCustomerResult> {
    // Manual provider doesn't create external customer records
    // Return businessId as synthetic customer ID
    return { externalCustomerId: params.businessId }
  }

  // -------------------------------------------------------------------------
  // Subscription Management
  // -------------------------------------------------------------------------

  async createSubscription(params: {
    externalCustomerId: string
    externalPriceId: string
    metadata: Record<string, string>
    successUrl: string
    cancelUrl: string
  }): Promise<CreateSubscriptionResult> {
    // Manual subscriptions don't use external subscription IDs
    // Create a BillingPayment record in PENDING_APPROVAL status
    // Return synthetic subscription ID based on payment record
    
    const businessId = params.externalCustomerId // For manual, customerId = businessId
    const planId = params.metadata.planId
    const amount = parseInt(params.metadata.amount || '0')
    const referenceNo = params.metadata.referenceNo
    const proofImageUrl = params.metadata.proofImageUrl
    const notes = params.metadata.notes
    const actorId = params.metadata.userId

    if (!planId || !amount) {
      throw new Error('[ManualAdapter] planId and amount are required in metadata')
    }

    const payment = await prisma.billingPayment.create({
      data: {
        businessId,
        provider: 'MANUAL',
        paymentMethod: this.config.paymentMethod as any, // Map to PaymentMethod2 enum
        amount,
        currency: 'PHP',
        status: 'PENDING_APPROVAL',
        requiresApproval: true,
        providerReference: referenceNo,
        proofImageUrl,
        notes,
        actorId,
        providerMetadata: {
          planId,
          paymentMethod: this.config.paymentMethod,
          originalMetadata: params.metadata,
        },
      },
    })

    return {
      externalSubscriptionId: payment.id,  // Use payment ID as synthetic subscription ID
      checkoutUrl: null,  // No external checkout for manual payments
      currentPeriodStart: dayjs().toDate(),
      currentPeriodEnd: dayjs().add(1, 'month').toDate(),
    }
  }

  async updateSubscription(params: {
    externalSubscriptionId: string
    externalPriceId: string
    metadata: Record<string, string>
    successUrl: string
    cancelUrl: string
  }): Promise<{ checkoutUrl: string | null; currentPeriodStart: Date; currentPeriodEnd: Date }> {
    // Manual subscriptions handle updates as new payment submissions
    // The externalSubscriptionId is actually a payment ID from createSubscription
    throw new Error('[ManualAdapter] Manual payment subscriptions cannot be updated directly. Create a new payment submission instead.')
  }

  async cancelSubscription(params: { externalSubscriptionId: string; cancelImmediately: boolean; reason?: string }): Promise<CancelSubscriptionResult> {
    // Manual subscriptions don't have external cancellation
    // Just return immediate cancellation
    return {
      cancelledAt: dayjs().toDate(),
      immediate: true,
    }
  }

  // -------------------------------------------------------------------------
  // Payment Link Creation
  // -------------------------------------------------------------------------

  async createCreditPurchaseLink(params: {
    externalCustomerId: string
    externalPriceId: string
    creditAmount: number
    successUrl: string
    cancelUrl: string
    metadata: Record<string, string>
  }): Promise<CreatePaymentLinkResult> {
    // Create a BillingPayment record in PENDING_APPROVAL status for credit purchase
    // Return a URL to the manual payment submission page
    
    const businessId = params.externalCustomerId
    const amount = parseInt(params.metadata.amount || '0')

    if (!amount) {
      throw new Error('[ManualAdapter] amount is required in metadata for credit purchase')
    }

    const payment = await prisma.billingPayment.create({
      data: {
        businessId,
        provider: 'MANUAL',
        paymentMethod: this.config.paymentMethod as any,
        amount,
        currency: 'PHP',
        status: 'PENDING_APPROVAL',
        requiresApproval: true,
        actorId: params.metadata.userId,
        providerMetadata: {
          type: 'credit_purchase',
          creditAmount: params.creditAmount,
          originalMetadata: params.metadata,
        },
      },
    })

    return {
      url: `/billing/manual-payment/${payment.id}`,
      externalSessionId: payment.id,
      expiresAt: dayjs().add(this.config.autoExpireDays, 'day').toDate(),
    }
  }

  async createAddonSubscription(params: {
    externalCustomerId: string
    externalPriceId: string
    quantity: number
    successUrl: string
    cancelUrl: string
    metadata: Record<string, string>
  }): Promise<CreatePaymentLinkResult> {
    // Similar to credit purchase but for addon subscriptions
    const businessId = params.externalCustomerId
    const amount = parseInt(params.metadata.amount || '0')

    if (!amount) {
      throw new Error('[ManualAdapter] amount is required in metadata for addon subscription')
    }

    const payment = await prisma.billingPayment.create({
      data: {
        businessId,
        provider: 'MANUAL',
        paymentMethod: this.config.paymentMethod as any,
        amount,
        currency: 'PHP',
        status: 'PENDING_APPROVAL',
        requiresApproval: true,
        actorId: params.metadata.userId,
        providerMetadata: {
          type: 'addon_subscription',
          quantity: params.quantity,
          addonType: params.metadata.addonType,
          originalMetadata: params.metadata,
        },
      },
    })

    return {
      url: `/billing/manual-payment/${payment.id}`,
      externalSessionId: payment.id,
      expiresAt: dayjs().add(this.config.autoExpireDays, 'day').toDate(),
    }
  }

  // -------------------------------------------------------------------------
  // Customer Portal (Not Supported)
  // -------------------------------------------------------------------------

  async createCustomerPortalSession(params: { externalCustomerId: string; returnUrl: string }): Promise<{ url: string }> {
    // Manual providers don't have customer portals
    // Redirect to billing dashboard instead
    return { url: '/billing' }
  }

  // -------------------------------------------------------------------------
  // Invoice Management (Not Supported)
  // -------------------------------------------------------------------------

  async getInvoice(externalInvoiceId: string): Promise<ProviderInvoice> {
    // Manual providers don't have external invoices
    throw new Error('[ManualAdapter] Manual payment provider does not support external invoices')
  }

  // -------------------------------------------------------------------------
  // Webhook Handling (Not Supported)
  // -------------------------------------------------------------------------

  async verifyWebhookSignature(params: { rawBody: string | Buffer; signature: string; secret: string }): Promise<WebhookEvent> {
    // Manual providers don't have webhooks
    throw new Error('[ManualAdapter] Manual payment provider does not support webhooks')
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

export function createManualPaymentAdapter(config?: ManualPaymentProviderConfig): BillingProviderAdapter {
  // Use provided config or load from environment
  const providerConfig = config || getProviderConfig('manual')
  
  if (!providerConfig) {
    throw new Error('[ManualAdapter] Manual payment provider configuration not found')
  }

  return new ManualPaymentAdapter(providerConfig as ManualPaymentProviderConfig)
}

// ---------------------------------------------------------------------------
// Provider Registration
// Register Manual adapter with the payment provider registry
// ---------------------------------------------------------------------------

// Auto-register Manual provider (always enabled)
const manualConfig = getProviderConfig('manual')
if (manualConfig) {
  paymentProviderRegistry.register('manual', createManualPaymentAdapter(), {
    providerId: 'manual',
    displayName: 'Manual Payment',
    description: `Pay via ${manualConfig.paymentMethod} transfer. Admin approval within 24 hours.`,
    isEnabled: true,
    availableInCountries: ['PH'], // Configure based on payment method
    requiresApproval: true,
    gracePeriodDays: manualConfig.gracePeriodDays,
    badges: ['Popular in Philippines', 'Manual Review'],
    displayOrder: 2,
    config: {
      ...manualConfig,
      setupRoute: manualConfig.setupRoute,
    },
  })
}