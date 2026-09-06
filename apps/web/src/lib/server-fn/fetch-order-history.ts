import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import dayjs from '@platform/lib/dayjs'
import { createServerFn } from '@tanstack/react-start'
import { OrderStatus, OrderType } from 'prisma/generated/prisma/enums'
import z from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { crudAPI } from '@/lib/prisma-client/crud-api'

const PAGE_SIZE = 50

const fetchOrderHistorySchema = z.object({
  from: z.string().default(dayjs().startOf('month').format('YYYY-MM-DD')),
  to: z.string().default(dayjs().endOf('month').format('YYYY-MM-DD')),
  status: z.nativeEnum(OrderStatus).optional(),
  orderType: z.nativeEnum(OrderType).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PAGE_SIZE),
})

export type FetchOrderHistoryInput = z.infer<typeof fetchOrderHistorySchema>

export const fetchOrderHistory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_ORDERS)])
  .inputValidator((input: FetchOrderHistoryInput | undefined) => fetchOrderHistorySchema.parse(input || {}))
  .handler(async ({ data }) => {
    const where = {
      createdAt: {
        gte: dayjs(data.from).startOf('day').toDate(),
        lte: dayjs(data.to).endOf('day').toDate(),
      },
      ...(data.status ? { status: data.status } : {}),
      ...(data.orderType ? { orderType: data.orderType } : {}),
      ...(data.search
        ? {
            OR: [
              { orderNumber: { contains: data.search, mode: 'insensitive' as const } },
              { customerReference: { contains: data.search, mode: 'insensitive' as const } },
              {
                transaction: {
                  OR: [
                    { invoiceNo: { contains: data.search, mode: 'insensitive' as const } },
                    { cashier: { name: { contains: data.search, mode: 'insensitive' as const } } },
                  ],
                },
              },
            ],
          }
        : {}),
    }

    const [ordersResult, countResult] = await Promise.all([
      crudAPI.order('findMany', {
        where,
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: { include: { category: true } },
                },
              },
              selectedAddons: {
                include: {
                  addon: { include: { product: true } },
                },
              },
            },
          },
          transaction: {
            include: {
              cashier: { select: { id: true, name: true } },
              payments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      crudAPI.order('count', { where }),
    ])

    if (ordersResult.isErr()) throw new Error(ordersResult.error)
    if (countResult.isErr()) throw new Error(countResult.error)

    return {
      data: ordersResult.value,
      totalItems: countResult.value,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export type OrderHistoryItem = Awaited<ReturnType<typeof fetchOrderHistory>>['data'][number]
