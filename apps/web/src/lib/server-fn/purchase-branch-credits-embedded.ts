/**
 * purchase-branch-credits-embedded.ts
 *
 * Embedded Stripe PaymentIntent flow for branch credit purchases.
 * Unlike purchaseBranchCredits (which redirects to Stripe Checkout),
 * this uses an inline CardElement — same UX as createStripeSubscription.
 *
 * Flow:
 *   1. Validate package + branch
 *   2. Get/create Stripe customer for the business
 *   3. Attach payment method
 *   4. Create a PaymentIntent for the credit package price
 *   5. Confirm the payment
 *   6. On success → create CreditLedger PURCHASE entry
 *   7. Return result (or clientSecret if 3DS required)
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import Stripe from 'stripe'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', {
  apiVersion: '2026-07-29.dahlia',
})

// ---------------------------------------------------------------------------
// Credit package catalog (mirrors purchase-branch-credits.ts)
// ---------------------------------------------------------------------------
const CREDIT_PACKAGES = {
  branch_credits_10: { creditAmount: 10, unitAmount: 500, label: '10 Credits' },
  branch_credits_50: { creditAmount: 50, unitAmount: 2000, label: '50 Credits' },
  branch_credits_100: { creditAmount: 100, unitAmount: 3500, label: '100 Credits' },
  branch_credits_500: { creditAmount: 500, unitAmount: 15000, label: '500 Credits' },
  branch_credits_1000: { creditAmount: 1000, unitAmount: 25000, label: '1000 Credits' },
} as const

type PackageId = keyof typeof CREDIT_PACKAGES

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------
const inputSchema = z.object({
  packageId: z.enum(['branch_credits_10', 'branch_credits_50', 'branch_credits_100', 'branch_credits_500', 'branch_credits_1000']),
  paymentMethodId: z.string(), // from Stripe CardElement
  saveCard: z.boolean().default(false),
})

export type PurchaseBranchCreditsEmbeddedInput = z.infer<typeof inputSchema>

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------
export const purchaseBranchCreditsEmbedded = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_BILLING)])
  .inputValidator((data: PurchaseBranchCreditsEmbeddedInput) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: requirePermission wraps context
    const user = (context as any).user

    if (!user?.businessId || !user?.branchId) {
      return { success: false as const, error: 'Business or branch context missing' }
    }

    const { businessId, branchId, id: userId } = user
    const pkg = CREDIT_PACKAGES[data.packageId as PackageId]

    if (!pkg) {
      return { success: false as const, error: `Unknown package: ${data.packageId}` }
    }

    // Verify branch belongs to this business
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId },
      select: { id: true, name: true },
    })

    if (!branch) {
      return { success: false as const, error: 'Branch not found' }
    }

    // Get or create Stripe customer
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, externalCustomerId: true, preferredPaymentProvider: true },
    })

    if (!business) {
      return { success: false as const, error: 'Business not found' }
    }

    let stripeCustomerId = business.preferredPaymentProvider === 'STRIPE' ? (business.externalCustomerId ?? null) : null

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: business.name,
        email: user.email ?? undefined,
        metadata: { businessId },
      })
      stripeCustomerId = customer.id
      await prisma.business.update({
        where: { id: businessId },
        data: { externalCustomerId: stripeCustomerId, preferredPaymentProvider: 'STRIPE' },
      })
    }

    // Attach payment method
    await stripe.paymentMethods.attach(data.paymentMethodId, { customer: stripeCustomerId })

    if (data.saveCard) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: data.paymentMethodId },
      })
    }

    // Create and confirm PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pkg.unitAmount,
      currency: 'php',
      customer: stripeCustomerId,
      payment_method: data.paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: false },
      payment_method_types: ['card'],
      return_url: `${process.env['APP_URL'] ?? process.env['CANONICAL_URL'] ?? 'http://localhost:3000'}/billing`,
      metadata: {
        businessId,
        branchId,
        userId,
        packageId: data.packageId,
        creditAmount: String(pkg.creditAmount),
        branchName: branch.name,
        source: 'branch_credit_embedded',
      },
    })

    // 3DS required
    if (paymentIntent.status === 'requires_action' && paymentIntent.next_action?.type === 'use_stripe_sdk') {
      return {
        success: true as const,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
      }
    }

    if (paymentIntent.status !== 'succeeded') {
      return { success: false as const, error: `Payment failed: ${paymentIntent.status}` }
    }

    // Grant credits — get current balance first
    const latestLedger = await prisma.creditLedger.findFirst({
      where: { businessId, branchId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    })
    const currentBalance = latestLedger?.balanceAfter ?? 0
    const newBalance = currentBalance + pkg.creditAmount

    await prisma.creditLedger.create({
      data: {
        businessId,
        branchId,
        eventType: 'PURCHASE',
        amount: pkg.creditAmount,
        balanceAfter: newBalance,
        transactionId: null,
        note: `Purchased ${pkg.label} via card`,
        actorId: userId,
      },
    })

    return {
      success: true as const,
      requiresAction: false,
      creditsGranted: pkg.creditAmount,
      newBalance,
      label: pkg.label,
    }
  })

// ---------------------------------------------------------------------------
// submitManualCreditPayment — GCash / Bank for credit purchases
// ---------------------------------------------------------------------------
const manualInputSchema = z.object({
  packageId: z.enum(['branch_credits_10', 'branch_credits_50', 'branch_credits_100', 'branch_credits_500', 'branch_credits_1000']),
  paymentMethod: z.enum(['GCASH', 'BANK_TRANSFER', 'MAYA']),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  proofImageUrl: z.string().min(1),
})

export type SubmitManualCreditPaymentInput = z.infer<typeof manualInputSchema>

export const submitManualCreditPayment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_BILLING)])
  .inputValidator((data: SubmitManualCreditPaymentInput) => manualInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: requirePermission wraps context
    const user = (context as any).user

    if (!user?.businessId || !user?.branchId) {
      return { success: false as const, error: 'Business or branch context missing' }
    }

    const { businessId, branchId, id: userId } = user
    const pkg = CREDIT_PACKAGES[data.packageId as PackageId]

    if (!pkg) {
      return { success: false as const, error: `Unknown package: ${data.packageId}` }
    }

    // Create a BillingPayment in PENDING_APPROVAL status
    const payment = await prisma.billingPayment.create({
      data: {
        businessId,
        amount: pkg.unitAmount,
        // biome-ignore lint/suspicious/noExplicitAny: flexibility required
        paymentMethod: data.paymentMethod as any,
        // biome-ignore lint/suspicious/noExplicitAny: flexibility required
        status: 'PENDING_APPROVAL' as any,
        // biome-ignore lint/suspicious/noExplicitAny: flexibility required
        provider: 'MANUAL' as any,
        periodsAdvancePaid: 1,
        providerReference: data.referenceNo ?? null,
        proofImageUrl: data.proofImageUrl,
        notes: data.notes ?? null,
        actorId: userId,
        requiresApproval: true,
        providerMetadata: {
          type: 'credit_purchase',
          packageId: data.packageId,
          creditAmount: pkg.creditAmount,
          branchId,
          label: pkg.label,
        },
      },
      select: { id: true },
    })

    return {
      success: true as const,
      paymentId: payment.id,
      message: `Payment submitted for ${pkg.label}. Admin will review within 24 hours.`,
    }
  })
