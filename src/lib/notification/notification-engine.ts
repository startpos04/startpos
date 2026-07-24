import { NotificationPriority, type NotificationType, Role, TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import {
  inventoryCollection,
  membershipCollection,
  notificationCollection,
  operationalTaskCollection,
  productCollection,
  productVariantCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'

interface SendNotificationParams {
  type: NotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
  link: string | null
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
            operationalTaskCollection.insert({
              id: crypto.randomUUID(),
              type: TaskType.SHELF_REFILL,
              status: TaskStatus.PENDING,
              notes: `Auto-generated task: Low stock threshold breached for variant ${variant.id}`,
              dueDate: new Date(),
              creatorId: user.id,
              approverId: user.id,
              clerkId: user.id,
              metadata: {
                variantId: variant.id,
                currentTotal,
                link: `/ingredients/${variant.product?.id}`,
                suggestedQty: threshold - currentTotal > 0 ? threshold - currentTotal : 10,
                approvedQty: threshold - currentTotal > 0 ? threshold - currentTotal : 10,
                verifiedQty: null,
              },
              approvedAt: new Date(),
              inProgressAt: new Date(),
              fulfilledAt: null,
              businessId: user.business.id,
              branchId: user.branch.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              reviewedAt: null,
              reviewerId: null,
              canceledAt: null,
              cancelerId: null,
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
   * Internal helper to distribute notifications to all branch admins
   */
  async send(receiverIds: string[], { type, title, message, metadata, link }: SendNotificationParams) {
    const { user } = authStore.state

    const notificationsToInsert = receiverIds.map(receiverId => ({
      id: crypto.randomUUID(),
      userId: receiverId,
      priority: NotificationPriority.MEDIUM,
      type,
      title,
      message,
      link,
      isRead: false,
      metadata: metadata ? JSON.stringify(metadata) : '{}',
      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: new Date(),
    }))

    // Step the mutation via the transaction engine
    notificationCollection.insert(notificationsToInsert)
  },
}
