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

  // Fallback: externalId may not be set yet if customer.subscription.created
  // hasn't been processed before invoice.paid fires. Look up by businessId
  // from the invoice metadata if available.
  const resolvedSubscription =
    subscription ??
    (inv.metadata?.['businessId']
      ? await rootPrisma.businessSubscription.findFirst({
          where: { businessId: inv.metadata['businessId'] },
          select: { id: true, status: true, businessId: true },
        })
      : null)

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

    if (resolvedSubscription && resolvedSubscription.status !== SubscriptionStatus.ACTIVE) {
      const canTransition = SubscriptionEngine.canTransition(
        resolvedSubscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus],
        SubscriptionStatus.ACTIVE,
      )
      if (canTransition.ok) {
        await tx.businessSubscription.update({
          where: { id: resolvedSubscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE as SubscriptionStatusEnum,
            // Write externalId now if it wasn't set yet
            ...(inv.externalSubscriptionId ? { externalId: inv.externalSubscriptionId } : {}),
            activatedAt: now,
            gracePeriodEndsAt: null,
            expiredAt: null,
            updatedAt: now,
          },
        })
        await tx.subscriptionStatusHistory.create({
          data: {
            subscriptionId: resolvedSubscription.id,
            fromStatus: resolvedSubscription.status as SubscriptionStatusEnum,
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

  // Route addon subscription cancellations before plan subscription lookup.
  const addonRow = await rootPrisma.businessSubscriptionAddon.findFirst({
    where: { externalSubscriptionId: sub.externalSubscriptionId },
    select: { id: true, businessId: true, addonType: true },
  })
  if (addonRow) {
    return handleAddonSubscriptionCancelled(event, sub, addonRow)
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
// Also handles first-time activation: when a hosted checkout session completes,
// Stripe creates the real subscription and fires this event. At that point
// BusinessSubscription.externalId is still null, so we look up by businessId
// from the subscription metadata and write externalId for the first time.
// Routes addon subscription events to handleAddonSubscriptionActivated.
// ---------------------------------------------------------------------------
async function handleSubscriptionUpdated(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const sub = event.subscription
  if (!sub) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No subscription payload' }
  }

  // Check if this is an addon subscription before doing plan subscription lookup.
  const addonRow = await rootPrisma.businessSubscriptionAddon.findFirst({
    where: { externalSubscriptionId: sub.externalSubscriptionId },
    select: { id: true, businessId: true, addonType: true, quantity: true },
  })
  if (addonRow) {
    return handleAddonSubscriptionUpdated(event, sub, addonRow)
  }

  // Check if metadata identifies this as a new addon activation (first time —
  // externalSubscriptionId not yet written to BusinessSubscriptionAddon).
  if (sub.metadata['source'] === 'addon_subscription') {
    return handleAddonSubscriptionUpdated(event, sub, null)
  }

  // Primary lookup: find by the real Stripe subscription ID
  let subscription = await rootPrisma.businessSubscription.findFirst({
    where: { externalId: sub.externalSubscriptionId },
    select: { id: true, status: true, businessId: true, currentPeriodEnd: true },
  })

  // Fallback 1: first-time activation — externalId not yet written.
  // create-subscription.ts stores businessId in subscription metadata.
  if (!subscription && sub.metadata['businessId']) {
    subscription = await rootPrisma.businessSubscription.findFirst({
      where: { businessId: sub.metadata['businessId'] },
      select: { id: true, status: true, businessId: true, currentPeriodEnd: true },
    })
  }

  // Fallback 2: portal payment retry — metadata may be empty.
  // Stripe puts businessId on the customer record too (createCustomer in the adapter).
  // Look it up from the customer metadata via the Stripe API.
  if (!subscription && sub.externalCustomerId) {
    const customerMetaBusinessId = await (async () => {
      try {
        const secretKey = process.env['STRIPE_SECRET_KEY']
        if (!secretKey) return null
        const Stripe = (await import('stripe')).default
        const stripe = new Stripe(secretKey)
        const customer = await stripe.customers.retrieve(sub.externalCustomerId)
        if (customer.deleted) return null
        return (customer.metadata as Record<string, string>)['businessId'] ?? null
      } catch {
        return null
      }
    })()

    if (customerMetaBusinessId) {
      subscription = await rootPrisma.businessSubscription.findFirst({
        where: { businessId: customerMetaBusinessId },
        select: { id: true, status: true, businessId: true, currentPeriodEnd: true },
      })
    }
  }

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
      // Write status update + date sync in a single update.
      // Also set externalId if this is the first time we're seeing this subscription
      // (first-time activation via hosted checkout — externalId was null until now).
      await tx.businessSubscription.update({
        where: { id: subscription.id },
        data: {
          externalId: sub.externalSubscriptionId,
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
      // Just sync period dates and externalId, no status change
      await tx.businessSubscription.update({
        where: { id: subscription.id },
        data: {
          externalId: sub.externalSubscriptionId,
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
// Routes on metadata.source:
//   'credit_purchase'   → insert CreditLedger PURCHASE entry
//   'tx_addon_purchase' → insert BusinessSubscriptionAddon TX_TOPUP row
// ---------------------------------------------------------------------------
async function handleCheckoutSessionCompleted(event: WebhookEvent): Promise<WebhookProcessingResult> {
  const session = event.checkoutSession
  if (!session) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No checkout session payload' }
  }

  const metaSource = session.metadata['source']

  // ---- TX addon branch -------------------------------------------------------
  if (metaSource === 'tx_addon_purchase') {
    return handleTxAddonPurchase(event, session)
  }

  // ---- Branch credit purchase branch -----------------------------------------
  if (metaSource === 'branch_credit_purchase') {
    return handleBranchCreditPurchase(event, session)
  }

  // ---- Business credit purchase branch ---------------------------------------
  if (metaSource !== 'credit_purchase') {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Not a handled checkout session source.',
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

// ---------------------------------------------------------------------------
// handleTxAddonPurchase
// Creates a BusinessSubscriptionAddon TX_TOPUP row when a TX top-up
// checkout session completes. Idempotent via externalSessionId unique index.
// ---------------------------------------------------------------------------
async function handleTxAddonPurchase(event: WebhookEvent, session: NonNullable<WebhookEvent['checkoutSession']>): Promise<WebhookProcessingResult> {
  if (session.paymentStatus !== 'paid') {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: `Payment not complete (status: ${session.paymentStatus}).`,
    }
  }

  const businessId = session.metadata['businessId']
  const txAmount = Number(session.metadata['txAmount'] ?? '0')
  const actorId = session.metadata['userId'] ?? null
  const rawPeriodEnd = session.metadata['currentPeriodEnd']
  const expiresAt = rawPeriodEnd ? new Date(rawPeriodEnd) : null

  if (!businessId || txAmount <= 0) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Missing businessId or txAmount in session metadata.',
    }
  }

  // Idempotency: externalSessionId has a @unique index — duplicate delivery
  // will throw a unique constraint violation which we catch and treat as SKIPPED.
  try {
    await rootPrisma.businessSubscriptionAddon.create({
      data: {
        businessId,
        addonType: 'TX_TOPUP' as import('prisma/generated/prisma/enums').AddonType,
        quantity: txAmount,
        externalSessionId: session.externalSessionId,
        expiresAt,
        actorId,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Unique constraint = already processed
    if (msg.includes('Unique constraint')) {
      return {
        eventId: event.id,
        eventType: event.type,
        outcome: WebhookOutcome.SKIPPED,
        message: 'TX addon already processed for this session.',
      }
    }
    throw err
  }

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}

// ---------------------------------------------------------------------------
// handleBranchCreditPurchase
// Creates a CreditLedger PURCHASE entry for a branch-specific credit purchase.
// Idempotent via stripeSessionId unique constraint on CreditLedger.
// ---------------------------------------------------------------------------
async function handleBranchCreditPurchase(
  event: WebhookEvent,
  session: NonNullable<WebhookEvent['checkoutSession']>,
): Promise<WebhookProcessingResult> {
  if (session.paymentStatus !== 'paid') {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: `Payment not complete (status: ${session.paymentStatus}).`,
    }
  }

  const businessId = session.metadata['businessId']
  const branchId = session.metadata['branchId']
  const creditAmount = Number(session.metadata['creditAmount'] ?? '0')
  const actorId = session.metadata['userId'] ?? null

  if (!businessId || !branchId || creditAmount <= 0) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Missing businessId, branchId, or creditAmount in session metadata.',
    }
  }

  // Idempotency: check if this session was already processed using stripeSessionId
  const existingEntry = await rootPrisma.creditLedger.findUnique({
    where: { stripeSessionId: session.externalSessionId },
    select: { id: true },
  })

  if (existingEntry) {
    return {
      eventId: event.id,
      eventType: event.type,
      outcome: WebhookOutcome.SKIPPED,
      message: 'Branch credit purchase already processed for this session.',
    }
  }

  // Fetch the current balance snapshot for this branch (O(1) read)
  const latestEntry = await rootPrisma.creditLedger.findFirst({
    where: { businessId, branchId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  })

  const previousBalance = latestEntry?.balanceAfter ?? 0
  const newBalance = previousBalance + creditAmount

  // Create the credit ledger entry
  await rootPrisma.creditLedger.create({
    data: {
      businessId,
      branchId,
      eventType: CreditEventType.PURCHASE as import('prisma/generated/prisma/enums').CreditEventType,
      amount: creditAmount,
      balanceAfter: newBalance,
      transactionId: null,
      note: `Branch credit purchase via Stripe session ${session.externalSessionId}`,
      actorId,
      stripeSessionId: session.externalSessionId, // Idempotency key
    },
  })

  return {
    eventId: event.id,
    eventType: event.type,
    outcome: WebhookOutcome.PROCESSED,
    message: `Granted ${creditAmount} credits to branch ${branchId}. New balance: ${newBalance}`,
  }
}

// ---------------------------------------------------------------------------
// handleAddonSubscriptionUpdated
// Called when a Stripe subscription for an addon is created or renewed.
// First activation: creates the BusinessSubscriptionAddon row.
// Renewal: updates expiresAt to the new period end.
// For capability addons (ANALYTICS, API_ACCESS): upserts an EntitlementOverride.
// For TX_RECURRING: updates BusinessSubscriptionAddon.quantity + expiresAt.
// ---------------------------------------------------------------------------
async function handleAddonSubscriptionUpdated(
  event: WebhookEvent,
  sub: NonNullable<WebhookEvent['subscription']>,
  addonRow: { id: string; businessId: string; addonType: string; quantity: number } | null,
): Promise<WebhookProcessingResult> {
  if (sub.status !== 'active') {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: `Addon subscription not yet active (${sub.status})` }
  }

  const businessId = sub.metadata['businessId'] ?? addonRow?.businessId
  if (!businessId) {
    return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.SKIPPED, message: 'No businessId in addon subscription metadata' }
  }

  const addonType = sub.metadata['addonType'] ?? addonRow?.addonType
  const featureKey = sub.metadata['featureKey'] ?? ''
  const txAmount = Number(sub.metadata['txAmount'] ?? '0')
  const quantity = Number(sub.metadata['quantity'] ?? addonRow?.quantity ?? '1')
  const actorId = sub.metadata['userId'] ?? null

  // Upsert BusinessSubscriptionAddon row —
  // create on first activation, update expiresAt on renewal.
  if (addonRow) {
    await rootPrisma.businessSubscriptionAddon.update({
      where: { id: addonRow.id },
      data: {
        expiresAt: sub.currentPeriodEnd,
        quantity,
        updatedAt: new Date(),
      },
    })
  } else {
    await rootPrisma.businessSubscriptionAddon.create({
      data: {
        businessId,
        addonType: addonType as import('prisma/generated/prisma/enums').AddonType,
        quantity: addonType === 'TX_RECURRING' ? txAmount : quantity,
        externalSubscriptionId: sub.externalSubscriptionId,
        expiresAt: sub.currentPeriodEnd,
        actorId,
      },
    })
  }

  // For capability addons — upsert an EntitlementOverride so the feature
  // is available immediately without waiting for a session refresh.
  if (featureKey && (addonType === 'ANALYTICS' || addonType === 'API_ACCESS')) {
    await rootPrisma.entitlementOverride.upsert({
      where: { businessId_featureKey: { businessId, featureKey } },
      update: { granted: true, expiresAt: sub.currentPeriodEnd, updatedAt: new Date() },
      create: {
        businessId,
        featureKey,
        granted: true,
        expiresAt: sub.currentPeriodEnd,
        reason: `Addon subscription ${sub.externalSubscriptionId}`,
      },
    })
  }

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}

// ---------------------------------------------------------------------------
// handleAddonSubscriptionCancelled
// Called when an addon Stripe subscription is deleted/cancelled.
// Expires the BusinessSubscriptionAddon row and revokes EntitlementOverride
// for capability addons.
// ---------------------------------------------------------------------------
async function handleAddonSubscriptionCancelled(
  event: WebhookEvent,
  sub: NonNullable<WebhookEvent['subscription']>,
  addonRow: { id: string; businessId: string; addonType: string },
): Promise<WebhookProcessingResult> {
  const featureKey = sub.metadata['featureKey'] ?? ''

  // Mark the addon as expired (set expiresAt to now so the session assembly
  // immediately excludes it from txAddonTotal and entitlement checks).
  await rootPrisma.businessSubscriptionAddon.update({
    where: { id: addonRow.id },
    data: { expiresAt: new Date(), updatedAt: new Date() },
  })

  // Revoke EntitlementOverride for capability addons.
  if (featureKey && (addonRow.addonType === 'ANALYTICS' || addonRow.addonType === 'API_ACCESS')) {
    await rootPrisma.entitlementOverride.upsert({
      where: { businessId_featureKey: { businessId: addonRow.businessId, featureKey } },
      update: { granted: false, expiresAt: null, updatedAt: new Date() },
      create: {
        businessId: addonRow.businessId,
        featureKey,
        granted: false,
        expiresAt: null,
        reason: `Addon subscription ${sub.externalSubscriptionId} cancelled`,
      },
    })
  }

  return { eventId: event.id, eventType: event.type, outcome: WebhookOutcome.PROCESSED }
}
