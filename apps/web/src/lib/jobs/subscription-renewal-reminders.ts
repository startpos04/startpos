/**
 * subscription-renewal-reminders.ts
 *
 * Background job: Subscription Renewal Reminders
 *
 * Runs daily. Finds subscriptions that will renew within the configured window
 * and sends provider-agnostic renewal reminder notifications to business admins.
 *
 * For each ACTIVE subscription approaching renewal:
 *   1. Checks if the currentPeriodEnd falls within the reminder window
 *   2. Determines the payment provider for the business
 *   3. Sends appropriate renewal notice with provider-specific guidance
 *   4. Tracks notifications to prevent duplicates within the same period
 *
 * Provider awareness:
 *   - Stripe: Automatic renewal notice with billing portal link
 *   - Manual: Reminder to submit payment before expiration
 *   - Other providers: Generic renewal notice with payment method info
 *
 * Idempotency:
 *   - Notifications are not re-sent if an unread renewal reminder for the same
 *     businessId + period already exists.
 *   - Uses SYSTEM_ALERT notification type with specific message patterns for deduplication
 *
 * Architecture contract (ADR-001):
 *   - Uses PaymentProviderRegistry to get provider information
 *   - The job is infrastructure â€” it fetches data, calls services, and persists notifications
 *   - Receives rootPrisma as parameter â€” no globals
 *
 * Usage (called from a cron endpoint or server-side scheduler):
 *   const result = await runSubscriptionRenewalRemindersJob(rootPrisma, { reminderWindowDays: [7, 3, 1] })
 */

import { type PaymentProviderId, paymentProviderRegistry } from '../billing/payment-provider-registry'
import '@/lib/billing/init-providers' // Ensure providers are registered
import dayjs from '@platform/lib/dayjs'
import type { prisma } from '@platform/lib/prisma-client'
import { type JobResult, jobError, jobSuccess } from './index'

type PrismaClient = typeof prisma

// ---------------------------------------------------------------------------
// Job configuration
// ---------------------------------------------------------------------------

export type RenewalReminderConfig = {
  /** Days before renewal to send reminders (default: [7, 3, 1] for 7-day, 3-day, and 1-day notices) */
  reminderWindowDays: number[]
}

// ---------------------------------------------------------------------------
// runSubscriptionRenewalRemindersJob
// ---------------------------------------------------------------------------

export async function runSubscriptionRenewalRemindersJob(
  prisma: PrismaClient,
  config: RenewalReminderConfig = { reminderWindowDays: [7, 3, 1] },
): Promise<JobResult> {
  const JOB_NAME = 'subscription-renewal-reminders'

  try {
    const now = dayjs()
    let processed = 0
    let skipped = 0
    const warnings: string[] = []

    // Process each reminder window separately to handle different reminder types
    for (const windowDays of config.reminderWindowDays) {
      const windowStart = now.add(windowDays, 'day').subtract(12, 'hour').toDate() // Start of the target day
      const windowEnd = now.add(windowDays, 'day').add(12, 'hour').toDate() // End of the target day

      // Find ACTIVE subscriptions with currentPeriodEnd in this reminder window
      const subscriptions = await prisma.businessSubscription.findMany({
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: { gte: windowStart, lte: windowEnd },
        },
        include: {
          business: {
            select: {
              id: true,
              name: true,
              preferredPaymentProvider: true,
              members: {
                where: { role: { in: ['ADMIN', 'OWNER'] } },
                select: { userId: true },
                take: 5, // Get up to 5 admin users
              },
            },
          },
        },
      })

      for (const sub of subscriptions) {
        if (sub.business.members.length === 0) {
          warnings.push(`Business ${sub.businessId}: no ADMIN/OWNER members found, skipping reminder`)
          skipped++
          continue
        }

        // Check for existing reminder notification for this reminder window
        const reminderPattern = `renewal in ${windowDays} day${windowDays === 1 ? '' : 's'}`
        const existingNotification = await prisma.notification.findFirst({
          where: {
            businessId: sub.businessId,
            type: 'SYSTEM_ALERT',
            isRead: false,
            createdAt: { gte: sub.currentPeriodStart ?? dayjs('1970-01-01').toDate() },
            message: { contains: reminderPattern },
          },
          select: { id: true },
        })

        if (existingNotification) {
          skipped++
          continue
        }

        // Get provider information for this business
        const providerId = sub.business.preferredPaymentProvider as PaymentProviderId
        let providerDisplayName = 'your payment provider'
        let providerCapabilities = null

        if (providerId) {
          try {
            providerDisplayName = paymentProviderRegistry.getDisplayName(providerId)
            providerCapabilities = paymentProviderRegistry.getCapabilities(providerId)
          } catch (error) {
            warnings.push(
              `Business ${sub.businessId}: Failed to get provider info for ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }

        // Build provider-specific message and action link
        const { title, message, link } = buildReminderContent(windowDays, sub.currentPeriodEnd, providerId, providerDisplayName, providerCapabilities)

        // Send notification to all admin users
        const notifications = sub.business.members.map(member => ({
          title,
          message,
          type: 'SYSTEM_ALERT' as const,
          priority: windowDays === 1 ? ('HIGH' as const) : ('MEDIUM' as const),
          isRead: false,
          link,
          metadata: JSON.stringify({
            renewalDate: sub.currentPeriodEnd?.toISOString(),
            reminderDays: windowDays,
            providerId,
            subscriptionId: sub.id,
          }),
          userId: member.userId,
          businessId: sub.businessId,
        }))

        await prisma.notification.createMany({
          data: notifications,
        })

        processed++
      }
    }

    return jobSuccess(JOB_NAME, processed, skipped, warnings)
  } catch (err) {
    return jobError(JOB_NAME, err)
  }
}

// ---------------------------------------------------------------------------
// buildReminderContent
// ---------------------------------------------------------------------------

function buildReminderContent(
  windowDays: number,
  renewalDate: Date | null,
  providerId: PaymentProviderId | null,
  providerDisplayName: string,
  providerCapabilities: any,
): { title: string; message: string; link: string } {
  const renewalDateStr = renewalDate ? dayjs(renewalDate).format('MMM D, YYYY') : 'soon'
  const daysText = windowDays === 1 ? '1 day' : `${windowDays} days`

  // Base title and message
  const title = `Subscription Renewal in ${daysText}`
  let message = `Your subscription will renew on ${renewalDateStr} (in ${daysText}).`
  let link = '/billing'

  // Add provider-specific guidance
  if (providerId && providerCapabilities) {
    switch (providerId) {
      case 'stripe':
        if (providerCapabilities?.supportsRecurring) {
          message +=
            ' Your payment method will be charged automatically. You can update your billing details or view payment history in your billing dashboard.'
          link = '/business/subscription/payment-methods'
        } else {
          message += ' Please ensure your payment method is up to date for automatic renewal.'
        }
        break

      case 'manual':
        message += ` Please prepare your manual payment and submit it before the renewal date to avoid service interruption.`
        link = '/billing/manual-payment'
        break

      default:
        message += ` Payment will be processed via ${providerDisplayName}. Please ensure your payment method is available.`
        link = '/business/subscription/payment-methods'
        break
    }
  } else {
    message += ' Please review your payment method and billing settings to ensure uninterrupted service.'
  }

  return { title, message, link }
}
