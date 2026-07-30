// @ts-nocheck
import { createServerFn } from '@tanstack/react-start'
import type { Prisma } from 'prisma/generated/prisma/browser'
import { OrderStatus, OrderType } from 'prisma/generated/prisma/enums'
import z from 'zod'
import dayjs from '@/lib/dayjs'
import { authMiddleware } from '../better-auth/auth-middleware'
import { getTenantPrisma } from '../prisma-client'
import type { Prettify } from '../types'

const PAGE_SIZE = 50

const fetchOrderHistorySchema = z.object({
  from: z.string().optional().catch(dayjs().startOf('month').format('YYYY-MM-DD')),
  to: z.string().optional().catch(dayjs().endOf('month').format('YYYY-MM-DD')),
  status: z.nativeEnum(OrderStatus).optional(),
  orderType: z.nativeEnum(OrderType).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PAGE_SIZE),
})

export type FetchOrderHistoryInput = z.infer<typeof fetchOrderHistorySchema>

export const fetchOrderHistory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(d => fetchOrderHistorySchema.parse(d))
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.businessId, context.user.branchId!)

    const where: Prisma.OrderWhereInput = {
      createdAt: {
        gte: dayjs(data.from).startOf('day').toDate(),
        lte: dayjs(data.to).endOf('day').toDate(),
      },
      ...(data.status ? { status: data.status } : {}),
      ...(data.orderType ? { orderType: data.orderType } : {}),
      ...(data.search
        ? {
            OR: [
              { orderNumber: { contains: data.search, mode: 'insensitive' } },
              { customerReference: { contains: data.search, mode: 'insensitive' } },
              {
                transaction: {
                  OR: [{ invoiceNo: { contains: data.search, mode: 'insensitive' } }, { cashier: { name: { contains: data.search, mode: 'insensitive' } } }],
                },
              },
            ],
          }
        : {}),
    }

    const [orders, totalItems] = await Promise.all([
      prisma.order.findMany({
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
        orderBy: { createdAt: 'desc' },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      prisma.order.count({ where }),
    ])

    return {
      data: orders as Prettify<
        Prisma.OrderGetPayload<{
          include: {
            items: {
              include: {
                variant: { include: { product: { include: { category: true } } } }
                selectedAddons: { include: { addon: { include: { product: true } } } }
              }
            }
            transaction: {
              include: {
                cashier: { select: { id: true; name: true } }
                payments: true
              }
            }
          }
        }>
      >[],
      totalItems,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export type OrderHistoryItem = Awaited<ReturnType<typeof fetchOrderHistory>>['data'][number]
