/**
 * billing-provider.ts
 *
 * BillingProviderAdapter — provider-agnostic interface for external payment
 * provider operations. All Stripe (or any other provider) specifics live
 * exclusively in `src/lib/billing/adapters/`. No file outside that directory
 * should import from `stripe` directly.
 *
 * Architecture contract (ADR-001, Phase 4 compliance gate):
 *   - This interface is pure TypeScript — zero SDK imports.
 *   - The Application Layer (server functions, webhook handler, jobs) depends
 *     only on this interface, never on a concrete adapter.
 *   - Swapping providers = swapping the adapter file only.
 *
 * Terminology mapping:
 *   "Customer"    — the provider's representation of a Business (externalCustomerId)
 *   "Subscription"— the provider's recurring billing record (BusinessSubscription.externalId)
 *   "Invoice"     — the provider's invoice (BillingInvoice.externalInvoiceId)
 *   "PaymentLink" — a hosted checkout URL for credit package purchases or
 *                   subscription upgrades
 */

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

/**
 * CreateCustomerResult
 * Returned when a new provider Customer record is created for a business.
 */
export type CreateCustomerResult = {
  /** Provider-assigned customer ID (stored as Business.externalCustomerId if needed) */
  externalCustomerId: string
}

/**
 * CreateSubscriptionResult
 * Returned when a provider subscription is created for a business.
 */
export type CreateSubscriptionResult = {
  /** Provider subscription ID — stored in BusinessSubscription.externalId */
  externalSubscriptionId: string
  /** Hosted URL the customer must visit to complete payment setup (if required) */
  checkoutUrl: string | null
  /** ISO timestamp of the start of the first billing period */
  currentPeriodStart: Date
  /** ISO timestamp of the end of the first billing period */
  currentPeriodEnd: Date
}

/**
 * CancelSubscriptionResult
 * Returned when a provider subscription is cancelled.
 */
export type CancelSubscriptionResult = {
  /** ISO timestamp of when the cancellation takes effect (may be period end) */
  cancelledAt: Date
  /** true = access revoked immediately; false = access through current period end */
  immediate: boolean
}

/**
 * CreatePaymentLinkResult
 * A hosted checkout URL for credit package purchase or plan upgrade.
 */
export type CreatePaymentLinkResult = {
  /** URL to redirect the business owner to complete payment */
  url: string
  /** Provider session / payment link ID for idempotency checks */
  externalSessionId: string
  /** ISO timestamp when the link expires */
  expiresAt: Date | null
}

/**
 * ProviderInvoice
 * Lightweight DTO returned from provider invoice lookups.
 * Enough to reconcile against BillingInvoice records.
 */
export type ProviderInvoice = {
  externalInvoiceId: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  amountDue: number // cents
  amountPaid: number // cents
  hostedInvoiceUrl: string | null
  pdfUrl: string | null
  dueAt: Date | null
  paidAt: Date | null
}

// ---------------------------------------------------------------------------
// BillingProviderAdapter interface
// ---------------------------------------------------------------------------

/**
 * BillingProviderAdapter
 *
 * All interactions with an external payment provider go through this interface.
 * The Application Layer (server functions, jobs, webhook handler) depends only
 * on this interface — never on Stripe types directly.
 */
export interface BillingProviderAdapter {
  /**
   * Create a provider Customer record for a new business.
   * Returns the externalCustomerId to store alongside the business.
   */
  createCustomer(params: { businessId: string; businessName: string; email: string }): Promise<CreateCustomerResult>

  /**
   * Create a recurring subscription for a business.
   * May return a checkoutUrl if the provider requires the customer to complete
   * payment setup before the subscription activates (e.g. Stripe Checkout).
   */
  createSubscription(params: {
    externalCustomerId: string
    /** Provider price/product ID for the plan */
    externalPriceId: string
    /** Metadata for idempotency and lookup */
    metadata: Record<string, string>
    /** URL to redirect to after successful payment */
    successUrl: string
    /** URL to redirect to if the user cancels */
    cancelUrl: string
  }): Promise<CreateSubscriptionResult>

  /**
   * Update an existing subscription to a new price (e.g. Monthly → Annual same plan,
   * or plan upgrade/downgrade within the same billing model).
   * Uses Stripe's subscription update API with proration_behavior: 'always_invoice'
   * so the change is charged/credited immediately.
   *
   * Returns a checkoutUrl when the provider requires a new payment method
   * (e.g. switching from a free plan to a paid one). Returns null when the
   * update is applied inline (card already on file).
   */
  updateSubscription(params: {
    externalSubscriptionId: string
    /** New provider price/product ID */
    externalPriceId: string
    /** Metadata to merge onto the subscription */
    metadata: Record<string, string>
    /** URL to redirect to after payment if a new checkout is required */
    successUrl: string
    cancelUrl: string
  }): Promise<{ checkoutUrl: string | null; currentPeriodStart: Date; currentPeriodEnd: Date }>

  /**
   * Cancel an existing subscription.
   * @param cancelImmediately - true = cancel now; false = cancel at period end
   */
  cancelSubscription(params: { externalSubscriptionId: string; cancelImmediately: boolean; reason?: string }): Promise<CancelSubscriptionResult>

  /**
   * Create a hosted payment link for a credit package purchase.
   * The provider will send a webhook on completion — the webhook handler
   * inserts the CreditLedger PURCHASE entry.
   */
  createCreditPurchaseLink(params: {
    externalCustomerId: string
    /** Provider price/product ID for this credit package */
    externalPriceId: string
    /** Number of credits being purchased (used in success metadata) */
    creditAmount: number
    /** URL to redirect to after successful payment */
    successUrl: string
    /** URL to redirect to on cancellation */
    cancelUrl: string
    /** Metadata attached to the session for webhook reconciliation */
    metadata: Record<string, string>
  }): Promise<CreatePaymentLinkResult>

  /**
   * Create a monthly recurring addon subscription (Analytics, API, Branch, Employee, TX top-up).
   * Uses Stripe Checkout Session mode: subscription with a fixed price.
   * quantity > 1 is used for per-unit addons (Branch, Employee, TX recurring).
   * The webhook handler grants/revokes capabilities on subscription lifecycle events.
   */
  createAddonSubscription(params: {
    externalCustomerId: string
    /** Provider price/product ID for the addon */
    externalPriceId: string
    /** Quantity of units (1 for feature addons, N for per-unit addons) */
    quantity: number
    /** URL to redirect to after successful checkout */
    successUrl: string
    /** URL to redirect to on cancellation */
    cancelUrl: string
    /** Metadata for webhook reconciliation */
    metadata: Record<string, string>
  }): Promise<CreatePaymentLinkResult>

  /**
   * Retrieve a provider invoice by its external ID.
   * Used by the invoice generation job to attach externalInvoiceId after creation.
   */
  getInvoice(externalInvoiceId: string): Promise<ProviderInvoice>

  /**
   * Create a Stripe Billing Portal session for the customer.
   * Returns a URL that redirects the user to Stripe's hosted portal where
   * they can update their payment method, view invoices, and manage their
   * subscription. The user is redirected back to returnUrl after they finish.
   */
  createCustomerPortalSession(params: { externalCustomerId: string; returnUrl: string }): Promise<{ url: string }>

  /**
   * Verify the signature of an incoming webhook payload.
   * Must be called before processing any webhook event.
   *
   * @returns The parsed event payload if the signature is valid.
   * @throws  An error if the signature is invalid — the webhook handler must
   *          return 400 and not process the payload.
   */
  verifyWebhookSignature(params: { rawBody: string | Buffer; signature: string; secret: string }): Promise<WebhookEvent>
}

// ---------------------------------------------------------------------------
// WebhookEvent — provider-agnostic event wrapper
// The Stripe adapter maps Stripe.Event → WebhookEvent before returning it.
// The webhook handler never touches Stripe types.
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.deleted'
  | 'customer.subscription.updated'
  | 'checkout.session.completed'

export type WebhookEvent = {
  /** Provider event ID — used for idempotency checks */
  id: string
  type: WebhookEventType
  /** ISO timestamp from the provider */
  createdAt: Date

  // -------------------------------------------------------------------------
  // Normalised payload fields — only the fields the webhook handler needs.
  // The adapter extracts these from the provider-specific event object.
  // -------------------------------------------------------------------------

  /** For invoice.paid / invoice.payment_failed */
  invoice?: {
    externalInvoiceId: string
    externalSubscriptionId: string | null
    externalCustomerId: string
    amountPaid: number // cents
    status: 'paid' | 'open' | 'void' | 'uncollectible'
    paidAt: Date | null
    hostedInvoiceUrl: string | null
    pdfUrl: string | null
    /** Metadata from the subscription or invoice — used to look up businessId when externalId is not yet set */
    metadata: Record<string, string>
  }

  /** For customer.subscription.deleted / customer.subscription.updated */
  subscription?: {
    externalSubscriptionId: string
    externalCustomerId: string
    status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing'
    currentPeriodStart: Date
    currentPeriodEnd: Date
    cancelledAt: Date | null
    /** Metadata attached to the subscription — used to link back to businessId on first activation */
    metadata: Record<string, string>
  }

  /** For checkout.session.completed (credit package purchase) */
  checkoutSession?: {
    externalSessionId: string
    externalCustomerId: string
    /** Metadata set when creating the payment link */
    metadata: Record<string, string>
    amountTotal: number // cents
    paymentStatus: 'paid' | 'unpaid' | 'no_payment_required'
  }
}
