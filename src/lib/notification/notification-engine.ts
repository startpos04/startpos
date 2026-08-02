import { NotificationPriority, NotificationType, Role } from 'prisma/generated/prisma/enums'
import {
  inventoryCollection,
  membershipCollection,
  notificationCollection,
  operationalTaskCollection,
  productCollection,
  productVariantCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { authStore } from '@/store/auth-store'

interface SendNotificationParams {
  type: NotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
  link: string | null
  /** Optional priority override. Defaults to the per-type value in DEFAULT_PRIORITY. */
  priority?: NotificationPriority
}

/**
 * DEV-6: Per-type default priorities.
 * Callers may pass an explicit `priority` override when context warrants it
 * (e.g. cash variance above threshold → URGENT).
 */
const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  [NotificationType.LOW_STOCK]: NotificationPriority.MEDIUM,
  [NotificationType.NEW_ORDER]: NotificationPriority.MEDIUM,
  [NotificationType.SYSTEM_ALERT]: NotificationPriority.URGENT,
  [NotificationType.TASK_ASSIGNED]: NotificationPriority.MEDIUM,
  [NotificationType.TASK_OVERDUE]: NotificationPriority.HIGH,
  [NotificationType.COMPLIANCE_REMINDER]: NotificationPriority.MEDIUM,
  [NotificationType.PURCHASE_PENDING_APPROVAL]: NotificationPriority.HIGH,
  [NotificationType.CREDIT_LOW_BALANCE]: NotificationPriority.HIGH,
}

export const NotificationEngine = {
  /**
   * Background process to check stock levels without blocking the main thread
   */
  async checkLowStock(variantIds: string[]) {
    try {
      const { user } = authStore.state

      // 1. Group by variantId and sum quantity where quantity > 0
      // Simulating Prisma's groupBy using Array.reduce on the local collection
      const activeInventory = [...inventoryCollection.values()].filter(item => variantIds.includes(item.variantId) && item.quantity > 0)

      const inventorySumsMap = activeInventory.reduce(
        (acc, item) => {
          acc[item.variantId] = (acc[item.variantId] || 0) + item.quantity
          return acc
        },
        {} as Record<string, number>,
      )

      // 2. Fetch variants and manually join their parent product
      const variants = [...productVariantCollection.values()]
        .filter(variant => variantIds.includes(variant.id))
        .map(variant => {
          const product = [...productCollection.values()].find(p => p.id === variant.productId)
          return {
            ...variant,
            product, // Mimics Prisma's include: { product: true }
          }
        })

      // 3. Compare and Notify
      for (const variant of variants) {
        const currentTotal = inventorySumsMap[variant.id] || 0
        const threshold = variant.lowStockThreshold ?? user.systemConfigs.LOW_STOCK_THRESHOLD

        if (threshold !== undefined && currentTotal <= threshold) {
          const admins = [...membershipCollection.values()].filter(member => ([Role.ADMIN, Role.SUPERVISOR] as Role[]).includes(member.role))
          if (admins.length === 0) return

          const taskId = crypto.randomUUID()
          await dbTransaction(() => {
            // Task creation belongs to the Inventory domain (A6 — cross-domain violation fix).
            // NotificationEngine retains only the send() call below.
            InventoryEngine.handleLowStockDetected({
              variantId: variant.id,
              currentTotal,
              threshold,
              productLink: `/ingredients/${variant.product?.id}`,
              operationalTaskCollection,
              ctx: {
                userId: user.id,
                branchId: user.branch.id,
                businessId: user.business.id,
                autoApproveLowStockRefill: user.systemConfigs.AUTO_APPROVE_LOW_STOCK_REFILL,
              },
            })

            NotificationEngine.send(
              admins.map(admin => admin.id),
              {
                type: 'LOW_STOCK',
                title: 'Low Stock Alert',
                message: `${[variant.product?.name, variant.name ? `(${variant.name})` : ''].filter(Boolean).join(' ')} is low: ${currentTotal} remaining (Threshold: ${threshold}).`,
                metadata: { variantId: variant.id, currentTotal },
                link: `/tasks/${taskId}`,
              },
            )
          })
        }
      }
    } catch (error) {
      console.error('Notification Engine Error [Low Stock]:', error)
    }
  },

  /**
   * Phase 3 — Send a CREDIT_LOW_BALANCE notification to all ADMIN members
   * of the business when the credit balance drops below the configured threshold.
   *
   * Called by createPosTransaction after a PREPAID_CREDITS deduction when
   * CreditEngine.deduct() returns isLowBalance = true.
   */
  async sendCreditLowBalance(currentBalance: number, threshold: number) {
    try {
      const admins = [...membershipCollection.values()].filter(member => ([Role.ADMIN, Role.SUPERVISOR] as Role[]).includes(member.role))
      if (admins.length === 0) return

      await NotificationEngine.send(
        admins.map(a => a.id),
        {
          type: NotificationType.CREDIT_LOW_BALANCE,
          title: 'Low Credit Balance',
          message: `Your credit balance has dropped to ${currentBalance} credit${currentBalance === 1 ? '' : 's'} — below the threshold of ${threshold}. Top up to avoid checkout interruptions.`,
          metadata: { currentBalance, threshold },
          link: '/billing/credits',
          priority: NotificationPriority.HIGH,
        },
      )
    } catch (error) {
      console.error('Notification Engine Error [Credit Low Balance]:', error)
    }
  },

  /**
   * Internal helper to distribute notifications to all branch admins
   */
  async send(receiverIds: string[], { type, title, message, metadata, link, priority }: SendNotificationParams) {
    const { user } = authStore.state

    const notificationsToInsert = receiverIds.map(receiverId => ({
      id: crypto.randomUUID(),
      userId: receiverId,
      priority: priority ?? DEFAULT_PRIORITY[type],
      type,
      title,
      message,
      link,
      isRead: false,
      metadata: metadata ? JSON.stringify(metadata) : '{}',
      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: new Date(),
      archivedAt: null,
    }))

    // Step the mutation via the transaction engine
    notificationCollection.insert(notificationsToInsert)
  },
}
