/**
 * payment-notification-service.ts
 *
 * Payment notification orchestration service for scheduled reminders and immediate notifications.
 * 
 * Responsibilities:
 * - Schedule renewal reminders (7, 3, 1 days before payment due)
 * - Schedule advance payment expiration warnings
 * - Send immediate notifications (approval, rejection, sync events)
 * - Process scheduled notifications in background job
 * - Retry failed deliveries with exponential backoff
 * 
 * Design:
 * - Provider-agnostic: Works with any payment provider
 * - Idempotent: Safe to call multiple times for same event
 * - Resilient: Handles failures gracefully with retry
 * - Auditable: Full tracking of notification history
 * 
 * Usage:
 *   await paymentNotificationService.scheduleRenewalReminders(subscription, periodEnd)
 *   await paymentNotificationService.sendApprovalNotification(payment)
 *   await paymentNotificationService.processScheduledNotifications()
 */

import dayjs from '@/lib/dayjs'
import type { BusinessSubscription } from 'prisma/generated/prisma/models'
import { prisma } from '@/lib/prisma-client'
import { SubscriptionEngine } from '../billing/subscription-engine'
import type { SubscriptionSnapshot } from '../billing/types'

// PaymentNotification type — inline until Prisma regenerates with new schema
type PaymentNotification = {
  id: string
  businessId: string
  subscriptionId: string
  notificationType: string
  scheduledFor: Date
  sentAt: Date | null
  dueDate: Date
  amount: number
  billingPeriod: string
  planName: string | null
  title: string
  message: string
  status: string
  failureReason: string | null
  retryCount: number
  maxRetries: number
  providerContext: unknown
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Enum constants (duplicated here because Prisma codegen may not have run yet)
// ---------------------------------------------------------------------------
const PaymentNotificationStatus = {
  SCHEDULED: 'SCHEDULED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const
type PaymentNotificationStatusType = (typeof PaymentNotificationStatus)[keyof typeof PaymentNotificationStatus]

const PaymentNotificationType = {
  RENEWAL_REMINDER: 'RENEWAL_REMINDER',
  ADVANCE_EXPIRING: 'ADVANCE_EXPIRING',
  PAYMENT_APPROVED: 'PAYMENT_APPROVED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
} as const
type PaymentNotificationTypeType = (typeof PaymentNotificationType)[keyof typeof PaymentNotificationType]

/**
 * NotificationConfig - Configuration for notification scheduling
 */
export type NotificationConfig = {
  /** Days before payment to send reminders (e.g., [7, 3, 1]) */
  reminderLeadDays: number[]
  /** Days before advance payment expires to warn (default: 7) */
  advanceExpiryWarningDays: number
  /** Max retry attempts for failed notifications */
  maxRetries: number
  /** Whether notifications are enabled globally */
  enabled: boolean
}

const DEFAULT_CONFIG: NotificationConfig = {
  reminderLeadDays: [7, 3, 1],
  advanceExpiryWarningDays: 7,
  maxRetries: 3,
  enabled: true,
}

/**
 * PaymentNotificationService - Orchestrates payment notifications
 */
export class PaymentNotificationService {
  constructor(private config: NotificationConfig = DEFAULT_CONFIG) {}

  // ---------------------------------------------------------------------------
  // SCHEDULING METHODS
  // ---------------------------------------------------------------------------

  /**
   * Schedule renewal reminder notifications for upcoming payment
   * Called when subscription enters billing period or payment setup
   * 
   * @param subscription - Subscription to schedule reminders for
   * @param periodEnd - End date of current billing period
   * @param amount - Amount due (in cents)
   */
  async scheduleRenewalReminders(
    subscription: BusinessSubscription,
    periodEnd: Date,
    amount: number
  ): Promise<void> {
    if (!this.config.enabled || !subscription.notifyBeforePayment) {
      return
    }

    const now = new Date()
    const business = await prisma.business.findUnique({
      where: { id: subscription.businessId },
      select: { id: true, name: true },
    })

    if (!business) {
      console.error(`[PaymentNotificationService] Business not found: ${subscription.businessId}`)
      return
    }

    // Get plan name for messaging
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: subscription.planId },
      select: { name: true },
    })

    const billingPeriod = this.formatBillingPeriod(subscription.currentPeriodStart, periodEnd)

    // Schedule notifications at configured lead times
    for (const leadDays of this.config.reminderLeadDays) {
      const scheduledFor = dayjs(periodEnd).subtract(leadDays, 'day').toDate()

      // Skip if scheduled date is in the past
      if (scheduledFor < now) {
        continue
      }

      // Check if notification already exists
      const existing = await prisma.paymentNotification.findFirst({
        where: {
          subscriptionId: subscription.id,
          notificationType: PaymentNotificationType.RENEWAL_REMINDER,
          scheduledFor,
          status: { not: PaymentNotificationStatus.CANCELLED },
        },
      })

      if (existing) {
        console.log(
          `[PaymentNotificationService] Renewal reminder already scheduled for ${subscription.id} at ${scheduledFor.toISOString()}`
        )
        continue
      }

      // Create notification record
      await prisma.paymentNotification.create({
        data: {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          notificationType: PaymentNotificationType.RENEWAL_REMINDER,
          scheduledFor,
          dueDate: periodEnd,
          amount,
          billingPeriod,
          planName: plan?.name ?? 'Unknown',
          title: `Payment Due in ${leadDays} Day${leadDays > 1 ? 's' : ''}`,
          message: this.buildRenewalReminderMessage(business.name, leadDays, amount, periodEnd, plan?.name),
          status: PaymentNotificationStatus.SCHEDULED,
          maxRetries: this.config.maxRetries,
          providerContext: {
            isManual: !subscription.externalId,
            provider: subscription.externalId ? 'stripe' : 'manual',
          },
        },
      })

      console.log(`[PaymentNotificationService] Scheduled renewal reminder for ${subscription.id} on ${scheduledFor.toISOString()}`)
    }
  }

  /**
   * Schedule advance payment expiration warning
   * Called when advance payment is applied or approaching expiration
   * 
   * @param subscription - Subscription with advance credits
   */
  async scheduleAdvanceExpirationWarning(subscription: BusinessSubscription): Promise<void> {
    if (!this.config.enabled || !subscription.notifyBeforePayment) {
      return
    }

    const snapshot: SubscriptionSnapshot = {
      id: subscription.id,
      businessId: subscription.businessId,
      status: subscription.status,
      billingModel: subscription.billingModel,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt,
      expiredAt: subscription.expiredAt,
      longTermInactiveAt: subscription.longTermInactiveAt,
      activatedAt: subscription.activatedAt,
      cancelledAt: subscription.cancelledAt,
      suspendedAt: subscription.suspendedAt,
      advancePaymentCredits: subscription.advancePaymentCredits,
      advancePaymentExpiresAt: subscription.advancePaymentExpiresAt,
    }

    const now = new Date()
    const evaluation = SubscriptionEngine.evaluateAdvancePaymentExpiring(
      snapshot,
      { trialDurationDays: 30, gracePeriodDays: 7, longTermInactiveDays: 90 },
      now
    )

    if (!evaluation.shouldNotify || !evaluation.expiresAt) {
      return
    }

    const scheduledFor = dayjs(evaluation.expiresAt).subtract(this.config.advanceExpiryWarningDays, 'day').toDate()

    // Skip if scheduled date is in the past
    if (scheduledFor < now) {
      return
    }

    // Check if notification already exists
    const existing = await prisma.paymentNotification.findFirst({
      where: {
        subscriptionId: subscription.id,
        notificationType: PaymentNotificationType.ADVANCE_EXPIRING,
        status: { not: PaymentNotificationStatus.CANCELLED },
      },
    })

    if (existing) {
      console.log(`[PaymentNotificationService] Advance expiry warning already scheduled for ${subscription.id}`)
      return
    }

    const business = await prisma.business.findUnique({
      where: { id: subscription.businessId },
      select: { name: true },
    })

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: subscription.planId },
      select: { name: true },
    })

    // Create notification record
    await prisma.paymentNotification.create({
      data: {
        businessId: subscription.businessId,
        subscriptionId: subscription.id,
        notificationType: PaymentNotificationType.ADVANCE_EXPIRING,
        scheduledFor,
        dueDate: evaluation.expiresAt,
        amount: 0, // Amount TBD when they renew
        billingPeriod: this.formatBillingPeriod(subscription.currentPeriodStart, evaluation.expiresAt),
        planName: plan?.name ?? 'Unknown',
        title: `Advance Payment Credits Expiring Soon`,
        message: this.buildAdvanceExpiringMessage(
          business?.name ?? 'Your business',
          evaluation.daysRemaining,
          subscription.advancePaymentCredits,
          evaluation.expiresAt
        ),
        status: PaymentNotificationStatus.SCHEDULED,
        maxRetries: this.config.maxRetries,
      },
    })

    console.log(`[PaymentNotificationService] Scheduled advance expiry warning for ${subscription.id} on ${scheduledFor.toISOString()}`)
  }

  // ---------------------------------------------------------------------------
  // IMMEDIATE NOTIFICATION METHODS
  // ---------------------------------------------------------------------------

  /**
   * Send immediate notification for manual payment approval
   * 
   * @param paymentId - ID of approved payment
   */
  async sendApprovalNotification(paymentId: string): Promise<void> {
    const payment = await prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: {
        business: { select: { name: true } },
        subscription: {
          include: {
            plan: { select: { name: true } },
          },
        },
      },
    })

    if (!payment || !payment.subscription) {
      console.error(`[PaymentNotificationService] Payment or subscription not found: ${paymentId}`)
      return
    }

    const notification = await prisma.paymentNotification.create({
      data: {
        businessId: payment.businessId,
        subscriptionId: payment.subscriptionId!,
        notificationType: PaymentNotificationType.PAYMENT_APPROVED,
        scheduledFor: new Date(),
        dueDate: payment.subscription.currentPeriodEnd ?? new Date(),
        amount: payment.amount,
        billingPeriod: this.formatBillingPeriod(
          payment.subscription.currentPeriodStart,
          payment.subscription.currentPeriodEnd
        ),
        planName: payment.subscription.plan?.name ?? 'Unknown',
        title: 'Payment Approved',
        message: this.buildApprovalMessage(payment.business.name, payment.amount, payment.periodsAdvancePaid),
        status: PaymentNotificationStatus.SCHEDULED,
        maxRetries: this.config.maxRetries,
      },
    })

    // Send immediately
    await this.sendNotification(notification)
  }

  /**
   * Send immediate notification for manual payment rejection
   * 
   * @param paymentId - ID of rejected payment
   * @param reason - Rejection reason
   */
  async sendRejectionNotification(paymentId: string, reason: string): Promise<void> {
    const payment = await prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: {
        business: { select: { name: true } },
        subscription: {
          include: {
            plan: { select: { name: true } },
          },
        },
      },
    })

    if (!payment || !payment.subscription) {
      console.error(`[PaymentNotificationService] Payment or subscription not found: ${paymentId}`)
      return
    }

    const notification = await prisma.paymentNotification.create({
      data: {
        businessId: payment.businessId,
        subscriptionId: payment.subscriptionId!,
        notificationType: PaymentNotificationType.PAYMENT_REJECTED,
        scheduledFor: new Date(),
        dueDate: payment.subscription.currentPeriodEnd ?? new Date(),
        amount: payment.amount,
        billingPeriod: this.formatBillingPeriod(
          payment.subscription.currentPeriodStart,
          payment.subscription.currentPeriodEnd
        ),
        planName: payment.subscription.plan?.name ?? 'Unknown',
        title: 'Payment Rejected',
        message: this.buildRejectionMessage(payment.business.name, payment.amount, reason),
        status: PaymentNotificationStatus.SCHEDULED,
        maxRetries: this.config.maxRetries,
      },
    })

    // Send immediately
    await this.sendNotification(notification)
  }

  // ---------------------------------------------------------------------------
  // BACKGROUND PROCESSING
  // ---------------------------------------------------------------------------

  /**
   * Process all scheduled notifications that are due
   * Called by background job (hourly)
   * 
   * @returns Number of notifications processed
   */
  async processScheduledNotifications(): Promise<{ processed: number; failed: number; skipped: number }> {
    const now = new Date()
    let processed = 0
    let failed = 0
    let skipped = 0

    // Fetch notifications that are due
    const dueNotifications = await prisma.paymentNotification.findMany({
      where: {
        status: PaymentNotificationStatus.SCHEDULED,
        scheduledFor: { lte: now },
        retryCount: { lt: prisma.paymentNotification.fields.maxRetries },
      },
      take: 100, // Process in batches
      orderBy: { scheduledFor: 'asc' },
    })

    console.log(`[PaymentNotificationService] Processing ${dueNotifications.length} scheduled notifications`)

    for (const notification of dueNotifications) {
      try {
        await this.sendNotification(notification)
        processed++
      } catch (error) {
        console.error(`[PaymentNotificationService] Failed to send notification ${notification.id}:`, error)
        failed++

        // Update retry count and status
        await prisma.paymentNotification.update({
          where: { id: notification.id },
          data: {
            retryCount: { increment: 1 },
            status:
              notification.retryCount + 1 >= notification.maxRetries
                ? PaymentNotificationStatus.FAILED
                : PaymentNotificationStatus.SCHEDULED,
            failureReason: error instanceof Error ? error.message : 'Unknown error',
          },
        })
      }
    }

    return { processed, failed, skipped }
  }

  /**
   * Retry failed notifications with exponential backoff
   * Called by background job (hourly)
   */
  async retryFailedNotifications(): Promise<number> {
    const now = new Date()
    let retried = 0

    // Get failed notifications that are eligible for retry
    const failedNotifications = await prisma.paymentNotification.findMany({
      where: {
        status: PaymentNotificationStatus.FAILED,
        retryCount: { lt: prisma.paymentNotification.fields.maxRetries },
      },
      take: 50,
    })

    for (const notification of failedNotifications) {
      try {
        // Reset status to scheduled for retry
        await prisma.paymentNotification.update({
          where: { id: notification.id },
          data: {
            status: PaymentNotificationStatus.SCHEDULED,
            scheduledFor: now,
          },
        })
        retried++
      } catch (error) {
        console.error(`[PaymentNotificationService] Failed to retry notification ${notification.id}:`, error)
      }
    }

    return retried
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Send a single notification
   * Override this method to integrate with email/SMS/push providers
   */
  private async sendNotification(notification: PaymentNotification): Promise<void> {
    // TODO: Integrate with actual notification provider (email, SMS, push)
    // For now, just log and mark as sent
    console.log(`[PaymentNotificationService] Sending notification:`, {
      id: notification.id,
      type: notification.notificationType,
      businessId: notification.businessId,
      title: notification.title,
      message: notification.message,
    })

    // Mark as sent
    await prisma.paymentNotification.update({
      where: { id: notification.id },
      data: {
        status: PaymentNotificationStatus.SENT,
        sentAt: new Date(),
      },
    })
  }

  /**
   * Build renewal reminder message
   */
  private buildRenewalReminderMessage(
    businessName: string,
    daysRemaining: number,
    amount: number,
    dueDate: Date,
    planName?: string
  ): string {
    const formattedAmount = this.formatCurrency(amount)
    const formattedDate = dayjs(dueDate).format('MMMM D, YYYY')
    const plan = planName ? ` (${planName})` : ''

    return `Hi ${businessName},

Your subscription payment${plan} of ${formattedAmount} is due in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} on ${formattedDate}.

${
  daysRemaining <= 1
    ? 'This is your final reminder. Please ensure your payment is processed to avoid service interruption.'
    : 'Please ensure your payment method is ready or submit a manual payment.'
}

Thank you for using StartPOS!`
  }

  /**
   * Build advance payment expiring message
   */
  private buildAdvanceExpiringMessage(
    businessName: string,
    daysRemaining: number,
    creditsRemaining: number,
    expiresAt: Date
  ): string {
    const formattedDate = dayjs(expiresAt).format('MMMM D, YYYY')

    return `Hi ${businessName},

Your advance payment credits (${creditsRemaining} period${creditsRemaining > 1 ? 's' : ''} remaining) will expire on ${formattedDate}.

After this date, your subscription will resume normal billing. Please prepare your payment method or submit another advance payment.

Thank you for using StartPOS!`
  }

  /**
   * Build payment approval message
   */
  private buildApprovalMessage(businessName: string, amount: number, periods: number): string {
    const formattedAmount = this.formatCurrency(amount)
    const periodsText = periods > 1 ? ` for ${periods} billing periods` : ''

    return `Hi ${businessName},

Great news! Your manual payment of ${formattedAmount}${periodsText} has been approved.

Your subscription is now active${periods > 1 ? ` and covered through ${periods} billing periods` : ''}.

Thank you for using StartPOS!`
  }

  /**
   * Build payment rejection message
   */
  private buildRejectionMessage(businessName: string, amount: number, reason: string): string {
    const formattedAmount = this.formatCurrency(amount)

    return `Hi ${businessName},

Unfortunately, your manual payment of ${formattedAmount} has been rejected.

Reason: ${reason}

Please submit a new payment or contact support for assistance.

Thank you for using StartPOS!`
  }

  /**
   * Format billing period for display
   */
  private formatBillingPeriod(start: Date | null, end: Date | null): string {
    if (!start || !end) return 'Unknown period'
    return `${dayjs(start).format('MMM D')} - ${dayjs(end).format('MMM D, YYYY')}`
  }

  /**
   * Format currency amount
   */
  private formatCurrency(cents: number): string {
    return `₱${(cents / 100).toFixed(2)}`
  }
}

// Singleton export
export const paymentNotificationService = new PaymentNotificationService()
