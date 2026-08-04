/**
 * stripe-adapter.ts
 *
 * StripeAdapter — concrete implementation of BillingProviderAdapter backed by
 * the Stripe Node.js SDK.
 *
 * Architecture compliance (Phase 4 gate):
 *   - This is the ONLY file in the codebase that imports from 'stripe'.
 *   - All other files depend on BillingProviderAdapter (the interface) only.
 *   - No Prisma imports — this is a pure infrastructure adapter.
 *
 * Configuration:
 *   STRIPE_SECRET_KEY    — Stripe secret key (sk_live_* or sk_test_*)
 *   STRIPE_WEBHOOK_SECRET — Webhook signing secret (whsec_*)
 *   Both are read from environment variables by the factory function.
 */

import Stripe from 'stripe'
import type {
  BillingProviderAdapter,
  CancelSubscriptionResult,
  CreateCustomerResult,
  CreatePaymentLinkResult,
  CreateSubscriptionResult,
  ProviderInvoice,
  WebhookEvent,
  WebhookEventType,
} from '../billing-provider'

// ---------------------------------------------------------------------------
// Stripe event types we handle
// ---------------------------------------------------------------------------
const HANDLED_STRIPE_EVENT_TYPES: string[] = [
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'checkout.session.completed',
]

// ---------------------------------------------------------------------------
// Helper: map Stripe invoice status → ProviderInvoice status
// ---------------------------------------------------------------------------
function mapStripeInvoiceStatus(status: Stripe.Invoice['status']): 'open' | 'paid' | 'void' | 'uncollectible' {
  switch (status) {
    case 'paid':
      return 'paid'
    case 'void':
      return 'void'
    case 'uncollectible':
      return 'uncollectible'
    default:
      // 'draft' and 'open' both map to 'open' — draft invoices aren't yet
      // sent to the customer, so treating them as open is the safe fallback.
      return 'open'
  }
}

// ---------------------------------------------------------------------------
// Helper: map Stripe subscription status
// ---------------------------------------------------------------------------
function mapStripeSubscriptionStatus(status: Stripe.Subscription['status']): 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' {
  switch (status) {
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'unpaid':
      return 'unpaid'
    case 'trialing':
      return 'trialing'
    default:
      return 'active'
  }
}

// ---------------------------------------------------------------------------
// Helper: safely resolve a Stripe expandable field to its ID string
// ---------------------------------------------------------------------------
function resolveId(field: string | { id: string } | null | undefined): string | null {
  if (!field) return null
  if (typeof field === 'string') return field
  return field.id
}

// ---------------------------------------------------------------------------
// Helper: env var accessor using bracket notation (satisfies exactOptionalPropertyTypes)
// ---------------------------------------------------------------------------
function getEnv(key: string): string | undefined {
  return process.env[key]
}

// ---------------------------------------------------------------------------
// StripeAdapter
// ---------------------------------------------------------------------------

class StripeAdapter implements BillingProviderAdapter {
  private readonly client: Stripe

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey, {
      // Match the installed SDK's API version
      apiVersion: '2026-07-29.dahlia',
      typescript: true,
    })
  }

  // -------------------------------------------------------------------------
  // createCustomer
  // -------------------------------------------------------------------------
  async createCustomer(params: { businessId: string; businessName: string; email: string }): Promise<CreateCustomerResult> {
    const customer = await this.client.customers.create({
      name: params.businessName,
      email: params.email,
      metadata: { businessId: params.businessId },
    })
    return { externalCustomerId: customer.id }
  }

  // -------------------------------------------------------------------------
  // createSubscription
  // Uses a Stripe Checkout Session (mode: 'subscription') so the customer
  // gets a real hosted payment page. Stripe redirects to successUrl after
  // payment and fires invoice.paid + customer.subscription.updated webhooks.
  // -------------------------------------------------------------------------
  async createSubscription(params: {
    externalCustomerId: string
    externalPriceId: string
    metadata: Record<string, string>
    successUrl: string
    cancelUrl: string
  }): Promise<CreateSubscriptionResult> {
    const session = await this.client.checkout.sessions.create({
      customer: params.externalCustomerId,
      mode: 'subscription',
      line_items: [{ price: params.externalPriceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: { metadata: params.metadata },
    })

    return {
      // The subscription is not yet created at this point — Stripe creates it
      // after payment. We store the session ID temporarily; the webhook handler
      // will receive the real subscription ID via customer.subscription.updated.
      externalSubscriptionId: session.id,
      checkoutUrl: session.url ?? null,
      // Period dates are not known yet — set to epoch; webhook will update them.
      currentPeriodStart: new Date(0),
      currentPeriodEnd: new Date(0),
    }
  }

  // -------------------------------------------------------------------------
  // cancelSubscription
  // -------------------------------------------------------------------------
  async cancelSubscription(params: { externalSubscriptionId: string; cancelImmediately: boolean; reason?: string }): Promise<CancelSubscriptionResult> {
    if (params.cancelImmediately) {
      const cancelParams: Stripe.SubscriptionCancelParams = {}
      if (params.reason) {
        cancelParams.cancellation_details = { comment: params.reason }
      }
      const cancelled = await this.client.subscriptions.cancel(params.externalSubscriptionId, cancelParams)
      // Use the first item's period end as the cancelled-at reference
      const periodEnd = cancelled.items?.data?.[0]?.current_period_end ?? 0
      const cancelledAt = new Date((cancelled.canceled_at ?? periodEnd) * 1000)
      return { cancelledAt, immediate: true }
    }

    const updateParams: Stripe.SubscriptionUpdateParams = {
      cancel_at_period_end: true,
    }
    if (params.reason) {
      updateParams.cancellation_details = { comment: params.reason }
    }
    const updated = await this.client.subscriptions.update(params.externalSubscriptionId, updateParams)
    const periodEnd = updated.items?.data?.[0]?.current_period_end ?? 0
    const cancelledAt = new Date(periodEnd * 1000)
    return { cancelledAt, immediate: false }
  }

  // -------------------------------------------------------------------------
  // createCreditPurchaseLink
  // -------------------------------------------------------------------------
  async createCreditPurchaseLink(params: {
    externalCustomerId: string
    externalPriceId: string
    creditAmount: number
    successUrl: string
    cancelUrl: string
    metadata: Record<string, string>
  }): Promise<CreatePaymentLinkResult> {
    const session = await this.client.checkout.sessions.create({
      customer: params.externalCustomerId,
      mode: 'payment',
      line_items: [{ price: params.externalPriceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        ...params.metadata,
        creditAmount: String(params.creditAmount),
      },
    })

    return {
      url: session.url ?? '',
      externalSessionId: session.id,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    }
  }

  // -------------------------------------------------------------------------
  // createCustomerPortalSession
  // -------------------------------------------------------------------------
  async createCustomerPortalSession(params: { externalCustomerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.client.billingPortal.sessions.create({
      customer: params.externalCustomerId,
      return_url: params.returnUrl,
    })
    return { url: session.url }
  }

  // -------------------------------------------------------------------------
  // getInvoice
  // -------------------------------------------------------------------------
  async getInvoice(externalInvoiceId: string): Promise<ProviderInvoice> {
    const invoice = await this.client.invoices.retrieve(externalInvoiceId)

    return {
      externalInvoiceId: invoice.id,
      status: mapStripeInvoiceStatus(invoice.status),
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
      dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
    }
  }

  // -------------------------------------------------------------------------
  // verifyWebhookSignature
  // -------------------------------------------------------------------------
  async verifyWebhookSignature(params: { rawBody: string | Buffer; signature: string; secret: string }): Promise<WebhookEvent> {
    const stripeEvent = this.client.webhooks.constructEvent(params.rawBody, params.signature, params.secret)
    return this.normaliseStripeEvent(stripeEvent)
  }

  // -------------------------------------------------------------------------
  // normaliseStripeEvent (private)
  // -------------------------------------------------------------------------
  private normaliseStripeEvent(event: Stripe.Event): WebhookEvent {
    const base = {
      id: event.id,
      type: event.type as WebhookEventType,
      createdAt: new Date(event.created * 1000),
    }

    switch (event.type) {
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        // Pull subscription metadata for businessId fallback lookup.
        // subscription_details.metadata is available on newer API versions;
        // fall back to empty object if not present.
        const subMeta = (inv as Stripe.Invoice & { subscription_details?: { metadata?: Record<string, string> } }).subscription_details?.metadata ?? {}
        return {
          ...base,
          invoice: {
            externalInvoiceId: inv.id,
            // subscription field name varies by API version — use safe access
            externalSubscriptionId: resolveId((inv as Stripe.Invoice & { subscription?: string | { id: string } }).subscription ?? null),
            externalCustomerId: resolveId(inv.customer) ?? '',
            amountPaid: inv.amount_paid,
            status: mapStripeInvoiceStatus(inv.status),
            paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : null,
            hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
            pdfUrl: inv.invoice_pdf ?? null,
            metadata: subMeta,
          },
        }
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const firstItem = sub.items?.data?.[0]
        const periodStart = firstItem?.current_period_start ?? 0
        const periodEnd = firstItem?.current_period_end ?? 0
        return {
          ...base,
          subscription: {
            externalSubscriptionId: sub.id,
            externalCustomerId: resolveId(sub.customer) ?? '',
            status: mapStripeSubscriptionStatus(sub.status),
            currentPeriodStart: new Date(periodStart * 1000),
            currentPeriodEnd: new Date(periodEnd * 1000),
            cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
            metadata: (sub.metadata as Record<string, string>) ?? {},
          },
        }
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const paymentStatus = session.payment_status as 'paid' | 'unpaid' | 'no_payment_required'
        return {
          ...base,
          checkoutSession: {
            externalSessionId: session.id,
            externalCustomerId: resolveId(session.customer) ?? '',
            metadata: (session.metadata as Record<string, string>) ?? {},
            amountTotal: session.amount_total ?? 0,
            paymentStatus,
          },
        }
      }

      default:
        return base
    }
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createStripeAdapter(): BillingProviderAdapter {
  const secretKey = getEnv('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error('[StripeAdapter] STRIPE_SECRET_KEY environment variable is not set.')
  }
  return new StripeAdapter(secretKey)
}

export function getStripeWebhookSecret(): string {
  const secret = getEnv('STRIPE_WEBHOOK_SECRET')
  if (!secret) {
    throw new Error('[StripeAdapter] STRIPE_WEBHOOK_SECRET environment variable is not set.')
  }
  return secret
}

export { HANDLED_STRIPE_EVENT_TYPES }
