import type { Prisma } from 'prisma/generated/prisma/browser'
import { Role } from 'prisma/generated/prisma/enums'
import { authStore } from '@/store/auth-store'
import { getTenantPrisma } from '../prisma-client'
import type { Prettify } from '../types'

interface SendNotificationParams {
  prisma: ReturnType<typeof getTenantPrisma>
  type: string
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
      const prisma = getTenantPrisma(user.organization.id, user.branch.id)

      const inventorySums = (await prisma.inventory.groupBy({
        by: ['variantId'],
        where: {
          variantId: { in: variantIds },
          quantity: { gt: 0 },
        },
        _sum: { quantity: true },
      })) as Prettify<Prisma.InventoryGroupByOutputType & { _sum: { quantity: number | null } }>[]

      const variants = (await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: { product: true },
      })) as Prettify<Prisma.ProductVariantGetPayload<{ include: { product: true } }>>[]

      // 3. Compare and Notify
      for (const variant of variants) {
        const sumRecord = inventorySums.find(s => s.variantId === variant.id)
        const currentTotal = sumRecord?._sum?.quantity || 0

        const threshold = variant.lowStockThreshold ?? user.branch.lowStockThreshold

        if (threshold !== undefined && currentTotal <= threshold) {
          await NotificationEngine.send({
            prisma,
            type: 'LOW_STOCK',
            title: 'Low Stock Alert',
            message: `${[variant?.product.name, variant?.name ? `(${variant.name})` : ''].filter(Boolean).join(' ')} is low: ${currentTotal} remaining (Threshold: ${threshold}).`,
            metadata: { variantId: variant.id, currentTotal },
            link: `/ingredients/${variant?.product.id}`,
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
  async send({ prisma, type, title, message, metadata, link }: SendNotificationParams) {
    const admins = await prisma.membership.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPERVISOR] } },
      select: { userId: true },
    })

    if (admins.length === 0) return

    await prisma.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.userId,
        type,
        title,
        message,
        metadata: metadata ? JSON.stringify(metadata) : '{}',
        isRead: false,
        link,
      })),
    })
  },
}
