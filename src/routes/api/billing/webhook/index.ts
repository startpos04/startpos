/**
 * api/billing/webhook/index.ts
 *
 * Stripe webhook handler — Phase 4.
 *
 * Security contract (Phase 4 compliance gate):
 *   - Signature is ALWAYS verified before any payload is read or acted on.
 *   - Invalid signature → 400 response immediately; no processing.
 *   - Every handler is idempotent — duplicate delivery is safe.
 *
 * Handled event types:
 *   invoice.paid                  → mark BillingInvoice as PAID; transition subscription to ACTIVE
 *   invoice.payment_failed        → transition subscription to GRACE_PERIOD
 *   customer.subscription.deleted → transition subscription to CANCELLED
 *   customer.subscription.updated → sync period dates; handle plan changes
 *   checkout.session.completed    → insert CreditLedger PURCHASE entry
 *
 * Architecture:
 *   - No Stripe SDK imported here — only BillingProviderAdapter + StripeAdapter factory.
 *   - Business logic (state transitions) uses SubscriptionEngine.
 *   - CreditEngine.grant() handles the credit top-up on checkout.session.completed.
 *   - All DB writes use rootPrisma in a single $transaction where possible.
 *
 * Raw body requirement:
 *   Stripe signature verification requires the raw (unparsed) request body.
 *   TanStack Start / Nitro expose the raw body via request.text().
 */

import { createFileRoute } from '@tanstack/react-router'
import type { SubscriptionStatus as SubscriptionStatusEnum } from 'prisma/generated/prisma/enums'
import { createStripeAdapter, getStripeWebhookSecret } from '@/lib/billing/adapters/stripe-adapter'
import type { WebhookEvent } from '@/lib/billing/billing-provider'
import { CreditEngine, CreditEventType } from '@/lib/billing/credit-engine'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import type { WebhookProcessingResult } from '@/lib/billing/types'
import { TransitionTrigger, WebhookOutcome } from '@/lib/billing/types'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { prisma as rootPrisma } from '@/lib/prisma-client'

// TanStack Router requires the route path to match the file path exactly.
// The routeTree.gen.ts is auto-generated — this route will register after the
// next `pnpm dev` / `pnpm build` run.
export const Route = createFileRoute('/api/billing/webhook/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // -----------------------------------------------------------------------
        // 1. Read raw body (required for Stripe signature verification)
        // -----------------------------------------------------------------------
        const rawBody = await request.text()
        const signature = request.headers.get('stripe-signature')

        if (!signature) {
          return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // -----------------------------------------------------------------------
        // 2. Verify signature — throws on invalid signature
        // -----------------------------------------------------------------------
        let event: WebhookEvent
        try {
          const adapter = createStripeAdapter()
          const secret = getStripeWebhookSecret()
          event = await adapter.verifyWebhookSignature({ rawBody, signature, secret })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Signature verification failed'
          console.error('[webhook] Signature verification failed:', message)
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // -----------------------------------------------------------------------
        // 3. Dispatch to the appropriate handler
        // -----------------------------------------------------------------------
        let result: WebhookProcessingResult

        try {
          switch (event.type) {
            case 'invoice.paid':
              result = await handleInvoicePaid(event)
              break
            case 'invoice.payment_failed':
              result = await handleInvoicePaymentFailed(event)
              break
            case 'customer.subscription.deleted':
              result = await handleSubscriptionDeleted(event)
              break
            case 'customer.subscription.updated':
              result = await handleSubscriptionUpdated(event)
              break
            case 'checkout.session.completed':
              result = await handleCheckoutSessionCompleted(event)
              break
            default:
              result = {
                eventId: event.id,
                eventType: event.type,
                outcome: WebhookOutcome.SKIPPED,
                message: `Event type ${event.type} is not handled.`,
              }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[webhook] Handler error for event ${event.id} (${event.type}):`, message)
          result = {
            eventId: event.id,
            eventType: event.type,
            outcome: WebhookOutcome.ERROR,
            message,
          }
          // Return 500 so Stripe retries the delivery
          return new Response(JSON.stringify(result), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})

// ===========================================================================
// Event handlers
// ===========================================================================

// ---------------------------------------------------------------------------
// handleInvoicePaid
// ---------------------------------------------------------------------------
async function handleInvoicePaid(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const inv = event.invoice
  if (!inv) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No invoice payload' }
  }

  const existingInvoice = await rootPrisma.billingInvoice.findFirst({
    where: { externalInvoiceId: inv.externalInvoiceId },
    select: { id: true, status: true },
  })

  if (existingInvoice?.status === 'PAID') {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'Invoice already marked PAID' }
  }

  const subscription = inv.externalSubscriptionId
    ? await rootPrisma.businessSubscription.findFirst({
        where: { externalId: inv.externalSubscriptionId },
        select: { id: true, status: true, businessId: true },
      })
    : null

  const now = new Date()

  await rootPrisma.$transaction(async tx => {
    if (existingInvoice) {
      await tx.billingInvoice.update({
        where: { id: existingInvoice.id },
        data: {
          status: 'PAID',
          paidAt: inv.paidAt ?? now,
          updatedAt: now,
        },
      })
    }

    if (subscription && subscription.status !== SubscriptionStatus.ACTIVE) {
      const canTransition = SubscriptionEngine.canTransition(
        subscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus],
        SubscriptionStatus.ACTIVE,
      )
      if (canTransition.ok) {
        await tx.businessSubscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE as SubscriptionStatusEnum,
            activatedAt: now,
            gracePeriodEndsAt: null,
            expiredAt: null,
            updatedAt: now,
          },
        })
        await tx.subscriptionStatusHistory.create({
          data: {
            subscriptionId: subscription.id,
            fromStatus: subscription.status as SubscriptionStatusEnum,
            toStatus: SubscriptionStatus.ACTIVE as SubscriptionStatusEnum,
            reason: `Payment confirmed via invoice ${inv.externalInvoiceId}.`,
            triggeredBy: TransitionTrigger.PAYMENT,
          },
        })
      }
    }
  })

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}

// ---------------------------------------------------------------------------
// handleInvoicePaymentFailed
// ---------------------------------------------------------------------------
async function handleInvoicePaymentFailed(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const inv = event.invoice
  if (!inv) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No invoice payload' }
  }

  if (!inv.externalSubscriptionId) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No subscription on invoice' }
  }

  const subscription = await rootPrisma.businessSubscription.findFirst({
    where: { externalId: inv.externalSubscriptionId },
    select: { id: true, status: true, businessId: true },
  })

  if (!subscription) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'Subscription not found' }
  }

  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: `Subscription already in ${subscription.status}; no transition needed.`,
    }
  }

  const canTransition = SubscriptionEngine.canTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD)
  if (!canTransition.ok) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: canTransition.reason }
  }

  const now = new Date()
  const gracePeriodEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  await rootPrisma.$transaction([
    rootPrisma.businessSubscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.GRACE_PERIOD as SubscriptionStatusEnum,
        gracePeriodEndsAt,
        expiredAt: now,
        updatedAt: now,
      },
    }),
    rootPrisma.subscriptionStatusHistory.create({
      data: {
        subscriptionId: subscription.id,
        fromStatus: SubscriptionStatus.ACTIVE as SubscriptionStatusEnum,
        toStatus: SubscriptionStatus.GRACE_PERIOD as SubscriptionStatusEnum,
        reason: `Payment failed for invoice ${inv.externalInvoiceId}. Grace period until ${gracePeriodEndsAt.toISOString()}.`,
        triggeredBy: TransitionTrigger.PAYMENT,
      },
    }),
  ])

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}

// ---------------------------------------------------------------------------
// handleSubscriptionDeleted
// ---------------------------------------------------------------------------
async function handleSubscriptionDeleted(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const sub = event.subscription
  if (!sub) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No subscription payload' }
  }

  const subscription = await rootPrisma.businessSubscription.findFirst({
    where: { externalId: sub.externalSubscriptionId },
    select: { id: true, status: true, businessId: true },
  })

  if (!subscription) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'Subscription not found' }
  }

  if (subscription.status === SubscriptionStatus.CANCELLED) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'Subscription already CANCELLED' }
  }

  const canTransition = SubscriptionEngine.canTransition(
    subscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus],
    SubscriptionStatus.CANCELLED,
  )
  if (!canTransition.ok) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: canTransition.reason }
  }

  const cancelledAt = sub.cancelledAt ?? new Date()

  await rootPrisma.$transaction([
    rootPrisma.businessSubscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED as SubscriptionStatusEnum,
        cancelledAt,
        updatedAt: new Date(),
      },
    }),
    rootPrisma.subscriptionStatusHistory.create({
      data: {
        subscriptionId: subscription.id,
        fromStatus: subscription.status as SubscriptionStatusEnum,
        toStatus: SubscriptionStatus.CANCELLED as SubscriptionStatusEnum,
        reason: 'Subscription cancelled by billing provider.',
        triggeredBy: TransitionTrigger.PAYMENT,
      },
    }),
  ])

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}

// ---------------------------------------------------------------------------
// handleSubscriptionUpdated
// Syncs billing period dates; handles status changes from provider.
// Uses a typed update object instead of Record<string, unknown> to satisfy
// Prisma's exactOptionalPropertyTypes constraint.
// ---------------------------------------------------------------------------
async function handleSubscriptionUpdated(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const sub = event.subscription
  if (!sub) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No subscription payload' }
  }

  const subscription = await rootPrisma.businessSubscription.findFirst({
    where: { externalId: sub.externalSubscriptionId },
    select: { id: true, status: true, businessId: true, currentPeriodEnd: true },
  })

  if (!subscription) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'Subscription not found' }
  }

  const now = new Date()

  // Map provider status → our SubscriptionStatus
  const targetStatus = ((): (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus] | null => {
    switch (sub.status) {
      case 'active':
        return SubscriptionStatus.ACTIVE
      case 'past_due':
        return SubscriptionStatus.GRACE_PERIOD
      case 'canceled':
        return SubscriptionStatus.CANCELLED
      default:
        return null
    }
  })()

  // Determine whether a status transition is valid and needed
  let shouldTransition = false
  if (targetStatus && targetStatus !== subscription.status) {
    const canTransition = SubscriptionEngine.canTransition(subscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus], targetStatus)
    shouldTransition = canTransition.ok
  }

  await rootPrisma.$transaction(async tx => {
    if (shouldTransition && targetStatus) {
      // Write status update + date sync in a single update
      await tx.businessSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          status: targetStatus as SubscriptionStatusEnum,
          updatedAt: now,
          ...(targetStatus === SubscriptionStatus.ACTIVE ? { activatedAt: now, gracePeriodEndsAt: null, expiredAt: null } : {}),
        },
      })
      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: subscription.id,
          fromStatus: subscription.status as SubscriptionStatusEnum,
          toStatus: targetStatus as SubscriptionStatusEnum,
          reason: `Subscription updated by provider: ${sub.status}.`,
          triggeredBy: TransitionTrigger.PAYMENT,
        },
      })
    } else {
      // Just sync period dates, no status change
      await tx.businessSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          updatedAt: now,
        },
      })
    }
  })

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}

// ---------------------------------------------------------------------------
// handleCheckoutSessionCompleted
// Inserts a CreditLedger PURCHASE entry when a credit package checkout succeeds.
// ---------------------------------------------------------------------------
async function handleCheckoutSessionCompleted(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const session = event.checkoutSession
  if (!session) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No checkout session payload' }
  }

  // Only handle credit purchase sessions (identified by metadata.source)
  const metaSource = session.metadata['source']
  if (metaSource !== 'credit_purchase') {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Not a credit purchase session.',
    }
  }

  if (session.paymentStatus !== 'paid') {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: `Payment not complete (status: ${session.paymentStatus}).`,
    }
  }

  const businessId = session.metadata['businessId']
  const creditAmount = Number(session.metadata['creditAmount'] ?? '0')

  if (!businessId || creditAmount <= 0) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Missing businessId or creditAmount in session metadata.',
    }
  }

  // Idempotency: check if a PURCHASE ledger entry for this session already exists.
  const sessionTag = `stripe_session:${session.externalSessionId}`
  const existingEntry = await rootPrisma.creditLedger.findFirst({
    where: { businessId, note: sessionTag },
    select: { id: true },
  })

  if (existingEntry) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Credit purchase already processed for this session.',
    }
  }

  // Fetch the current balance snapshot (O(1) read)
  const latestEntry = await rootPrisma.creditLedger.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  })

  const actorId = session.metadata['userId'] ?? 'payment_provider'

  const grantResult = CreditEngine.grant(businessId, latestEntry ?? null, creditAmount, CreditEventType.PURCHASE, sessionTag, actorId)

  if (!grantResult.ok) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.ERROR,
      message: `CreditEngine.grant failed: ${grantResult.reason}`,
    }
  }

  const entry = grantResult.value

  await rootPrisma.creditLedger.create({
    data: {
      businessId: entry.businessId,
      eventType: entry.eventType as import('prisma/generated/prisma/enums').CreditEventType,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      transactionId: null,
      note: entry.note,
      actorId: entry.actorId,
    },
  })

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}
