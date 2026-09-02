/**
 * composable-renewal-preview.ts
 *
 * Background job: Composable Subscription Renewal Preview
 *
 * Runs N days before each composable subscription's currentPeriodEnd (default: 7 days).
 * For each business on a COMPOSABLE_FEATURES subscription, it:
 *   1. Loads their BusinessSubscriptionFeature snapshots
 *   2. Loads the active PricingCatalog
 *   3. Calls PricingEngine.validateGrandfatheredPrices to detect price changes
 *   4. If any feature prices have changed since the snapshot, emits a notification
 *      so the business can review before renewal
 *   5. Uses PaymentProviderService to add provider-specific renewal guidance
 *
 * Idempotency:
 *   - Notifications are not re-sent if an unread notification for the same
 *     businessId + period already exists (checked before insert).
 *
 * Architecture contract (ADR-001, ADR-009):
 *   - PricingEngine has zero infrastructure imports â€” receives data as DTOs.
 *   - Uses PaymentProviderRegistry to get provider-specific guidance
 *   - This job is the infrastructure layer: fetches data, calls engines, persists output.
 *   - Receives rootPrisma as parameter â€” no globals.
 *
 * Usage:
 *   const result = await runComposableRenewalPreviewJob(rootPrisma, { previewWindowDays: 7 })
 */

import { type PaymentProviderId, paymentProviderRegistry } from '../billing/payment-provider-registry'
import { createPricingCatalogRepositoryWithDeps } from '../billing/pricing/pricing-catalog-repository'
import { PricingEngine } from '../billing/pricing/pricing-engine'
import type { BusinessSubscriptionFeatureDTO } from '../billing/pricing/types'
import '@/lib/billing/init-providers' // Ensure providers are registered
import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import type { prisma } from '@platform/lib/prisma-client'
import { type JobResult, jobError, jobSuccess } from './index'

type PrismaClient = typeof prisma

// ---------------------------------------------------------------------------
// Job configuration
// ---------------------------------------------------------------------------

export type ComposableRenewalPreviewConfig = {
  /** How many days before period end to emit the preview notification (default: 7) */
  previewWindowDays: number
}

// ---------------------------------------------------------------------------
// runComposableRenewalPreviewJob
// ---------------------------------------------------------------------------

export async function runComposableRenewalPreviewJob(
  prisma: PrismaClient,
  config: ComposableRenewalPreviewConfig = { previewWindowDays: 7 },
): Promise<JobResult> {
  const JOB_NAME = 'composable-renewal-preview'

  try {
    const now = new Date()
    const windowEnd = new Date(now)
    windowEnd.setDate(windowEnd.getDate() + config.previewWindowDays)

    // Find composable subscriptions whose period ends within the preview window
    const subscriptions = await prisma.businessSubscription.findMany({
      where: {
        billingModel: 'COMPOSABLE_FEATURES',
        status: 'ACTIVE',
        currentPeriodEnd: { gte: now, lte: windowEnd },
      },
      include: {
        businessSubscriptionFeatures: {
          select: {
            featureKey: true,
            snapshotPrice: true,
            catalogVersion: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
            preferredPaymentProvider: true,
            members: {
              where: { role: 'ADMIN' },
              select: { userId: true },
              take: 1,
            },
          },
        },
      },
    })

    if (subscriptions.length === 0) {
      return jobSuccess(JOB_NAME, 0, 0)
    }

    // Load the active catalog once for all subscriptions
    const repo = createPricingCatalogRepositoryWithDeps(prisma as unknown as import('prisma/generated/prisma/client').PrismaClient)
    const activeCatalog = await repo.loadActive()

    if (!activeCatalog) {
      return jobSuccess(JOB_NAME, 0, subscriptions.length, ['No active PricingCatalog found â€” skipping all businesses'])
    }

    let processed = 0
    let skipped = 0
    const warnings: string[] = []

    for (const sub of subscriptions) {
      if (sub.businessSubscriptionFeatures.length === 0) {
        skipped++
        continue
      }

      // Build snapshots DTO for the engine
      const snapshots: BusinessSubscriptionFeatureDTO[] = sub.businessSubscriptionFeatures.map(f => ({
        subscriptionId: sub.id,
        featureKey: f.featureKey as CapabilityKey,
        snapshotPrice: f.snapshotPrice,
        catalogVersion: f.catalogVersion,
      }))

      // Call PricingEngine â€” pure, no DB access
      const notices = PricingEngine.validateGrandfatheredPrices(snapshots, activeCatalog)

      if (notices.length === 0) {
        skipped++
        continue
      }

      // Check if a renewal preview notification was already sent this period
      const existingNotification = await prisma.notification.findFirst({
        where: {
          businessId: sub.businessId,
          type: 'SYSTEM_ALERT',
          isRead: false,
          createdAt: { gte: sub.currentPeriodStart ?? new Date(0) },
          message: { contains: 'pricing changes' },
        },
        select: { id: true },
      })

      if (existingNotification) {
        skipped++
        continue
      }

      // Find the ADMIN user to notify
      const adminMember = sub.business.members[0]
      if (!adminMember) {
        warnings.push(`Business ${sub.businessId}: no ADMIN member found, skipping notification`)
        skipped++
        continue
      }

      // Get provider information for pricing change context
      const providerId = sub.business.preferredPaymentProvider as PaymentProviderId
      let providerGuidance = ''

      if (providerId) {
        try {
          const providerDisplayName = paymentProviderRegistry.getDisplayName(providerId)
          const capabilities = paymentProviderRegistry.getCapabilities(providerId)

          switch (providerId) {
            case 'stripe':
              if (capabilities?.supportsRecurring) {
                providerGuidance = ' Your payment method will be charged automatically at renewal.'
              } else {
                providerGuidance = ' Please ensure your payment method is up to date.'
              }
              break
            case 'manual':
              providerGuidance = ` Please prepare your manual payment before renewal.`
              break
            default:
              providerGuidance = ` Payment will be processed via ${providerDisplayName}.`
              break
          }
        } catch (error) {
          warnings.push(`Business ${sub.businessId}: Failed to get provider guidance: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // Build notification message
      const changeList = notices
        .map(n => {
          const delta = n.priceDelta > 0 ? `+â‚±${(n.priceDelta / 100).toFixed(2)}` : `-â‚±${(Math.abs(n.priceDelta) / 100).toFixed(2)}`
          return `${n.featureLabel}: ${delta}/mo`
        })
        .join(', ')

      await prisma.notification.create({
        data: {
          title: 'Upcoming Pricing Changes at Renewal',
          message: `Your subscription renews in ${config.previewWindowDays} days. The following features have pricing changes: ${changeList}. Review your plan at /billing/pricing.${providerGuidance}`,
          type: 'SYSTEM_ALERT',
          priority: 'MEDIUM',
          isRead: false,
          link: '/billing/pricing',
          metadata: JSON.stringify({
            priceChangeCount: notices.length,
            renewalDate: sub.currentPeriodEnd?.toISOString(),
            providerId,
          }),
          userId: adminMember.userId,
          businessId: sub.businessId,
        },
      })

      processed++
    }

    return jobSuccess(JOB_NAME, processed, skipped, warnings)
  } catch (err) {
    return jobError(JOB_NAME, err)
  }
}
