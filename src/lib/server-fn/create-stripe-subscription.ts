/**
 * create-stripe-subscription.ts
 * 
 * Server function for creating Stripe subscription with payment method.
 * Called from embedded Stripe payment form.
 * 
 * Flow:
 * 1. Validate input
 * 2. Get or create Stripe customer
 * 3. Attach payment method to customer
 * 4. Set as default payment method (if saveCard is true)
 * 5. Create Stripe subscription
 * 6. Create BusinessSubscription record
 * 7. Handle 3D Secure if needed
 * 8. Return subscription data
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { prisma } from '@/lib/prisma-client'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-07-29.dahlia',
})

// ---------------------------------------------------------------------------
// Request Schema
// ---------------------------------------------------------------------------

const createSubscriptionSchema = z.object({
  planId: z.string(),
  paymentMethodId: z.string(), // From Stripe Elements
  billingInterval: z.enum(['monthly', 'annual']),
  saveCard: z.boolean().default(true),
})

export type CreateStripeSubscriptionInput = z.infer<typeof createSubscriptionSchema>

/**
 * Server function to create Stripe subscription
 */
export const createStripeSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: CreateStripeSubscriptionInput) => createSubscriptionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { user } = context
    
    if (!user?.businessId) {
      throw new Error('Business ID is required')
    }

    const { planId, paymentMethodId, billingInterval, saveCard } = data

    // 1. Get user's business
    const business = await prisma.business.findUnique({
      where: { id: user.businessId },
      select: {
        id: true,
        name: true,
        externalCustomerId: true,
        preferredPaymentProvider: true,
      },
    })

    if (!business) {
      throw new Error('Business not found')
    }

    // 2. Get subscription plan
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    })

    if (!plan || !plan.isActive) {
      throw new Error('Invalid or inactive plan')
    }

    // 3. Get or create Stripe customer
    let stripeCustomerId = business.preferredPaymentProvider === 'STRIPE' 
      ? business.externalCustomerId 
      : null

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: business.name,
        email: user.email || undefined,
        metadata: {
          businessId: business.id,
          userId: user.id,
        },
      })

      stripeCustomerId = customer.id

      // Update business with Stripe customer ID
      await prisma.business.update({
        where: { id: business.id },
        data: { 
          externalCustomerId: stripeCustomerId,
          preferredPaymentProvider: 'STRIPE',
        },
      })
    }

    // 4. Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId,
    })

    // 5. Set as default payment method if saveCard is true
    if (saveCard) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      })
    }

    // 6. Calculate price
    const unitAmount = billingInterval === 'annual' 
      ? (plan.annualPrice || plan.monthlyPrice * 12)
      : plan.monthlyPrice

    const stripePrice = await stripe.prices.create({
      currency: 'php',
      unit_amount: unitAmount,
      recurring: {
        interval: billingInterval === 'annual' ? 'year' : 'month',
      },
      product_data: {
        name: `${plan.name} Plan`,
        metadata: {
          planId: plan.id,
          billingInterval,
        },
      },
    })

    // 7. Create Stripe subscription
    const stripeSubscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePrice.id }],
      default_payment_method: paymentMethodId,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: saveCard ? 'on_subscription' : 'off',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        businessId: business.id,
        planId: plan.id,
        billingInterval,
      },
    })

    // 8. Check if 3D Secure is required
    const latestInvoice = stripeSubscription.latest_invoice as Stripe.Invoice
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | undefined

    const requiresAction = 
      paymentIntent?.status === 'requires_action' || 
      paymentIntent?.status === 'requires_confirmation'

    // 9. Create BusinessSubscription record
    const businessSubscription = await prisma.businessSubscription.create({
      data: {
        businessId: business.id,
        planId: plan.id,
        status: requiresAction ? 'TRIAL' : 'ACTIVE', // Use TRIAL as pending state
        billingModel: billingInterval === 'annual' ? 'YEARLY_SUBSCRIPTION' : 'MONTHLY_SUBSCRIPTION',
        externalId: stripeSubscription.id,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        activatedAt: requiresAction ? null : new Date(),
      },
    })

    // 10. Create status history record
    await prisma.subscriptionStatusHistory.create({
      data: {
        subscriptionId: businessSubscription.id,
        fromStatus: null,
        toStatus: requiresAction ? 'TRIAL' : 'ACTIVE',
        reason: 'Subscription created via embedded payment form',
        triggeredBy: user.id,
      },
    })

    // 11. Return response
    if (requiresAction && paymentIntent?.client_secret) {
      return {
        success: true,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        subscriptionId: businessSubscription.id,
      }
    }

    return {
      success: true,
      requiresAction: false,
      subscription: {
        id: businessSubscription.id,
        status: businessSubscription.status,
        planId: businessSubscription.planId,
        currentPeriodEnd: businessSubscription.currentPeriodEnd,
      },
    }
  })
