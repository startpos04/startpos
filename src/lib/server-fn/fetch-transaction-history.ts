// @ts-nocheck
import { createServerFn } from '@tanstack/react-start'
import type { Prisma } from 'prisma/generated/prisma/browser'
import { PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import z from 'zod'
import dayjs from '@/lib/dayjs'
import { authMiddleware } from '../better-auth/auth-middleware'
import { getTenantPrisma } from '../prisma-client'
import type { Prettify } from '../types'

const PAGE_SIZE = 50

const fetchTransactionHistorySchema = z.object({
  from: z.string().optional().catch(dayjs().startOf('month').format('YYYY-MM-DD')),
  to: z.string().optional().catch(dayjs().endOf('month').format('YYYY-MM-DD')),
  cashierId: z.string().optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  type: z.nativeEnum(TransactionType).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PAGE_SIZE),
})

export type FetchTransactionHistoryInput = z.infer<typeof fetchTransactionHistorySchema>

export const fetchTransactionHistory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(d => fetchTransactionHistorySchema.parse(d))
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.businessId, context.user.branchId!)

    const where: Prisma.TransactionWhereInput = {
      createdAt: {
        gte: dayjs(data.from).startOf('day').toDate(),
        lte: dayjs(data.to).endOf('day').toDate(),
      },
      ...(data.cashierId ? { cashierId: data.cashierId } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(data.method ? { payments: { some: { method: data.method } } } : {}),
      ...(data.search
        ? {
            OR: [
              { invoiceNo: { contains: data.search, mode: 'insensitive' } },
              { cashier: { name: { contains: data.search, mode: 'insensitive' } } },
              { order: { orderNumber: { contains: data.search, mode: 'insensitive' } } },
              { buyerName: { contains: data.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [transactions, totalItems] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          cashier: { select: { id: true, name: true, email: true } },
          payments: true,
          taxLines: true,
          order: {
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
            },
          },
          originalTransaction: {
            select: { id: true, invoiceNo: true },
          },
          refunds: {
            select: { id: true, invoiceNo: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      prisma.transaction.count({ where }),
    ])

    return {
      data: transactions as Prettify<
        Prisma.TransactionGetPayload<{
          include: {
            cashier: { select: { id: true; name: true; email: true } }
            payments: true
            taxLines: true
            order: {
              include: {
                items: {
                  include: {
                    variant: { include: { product: { include: { category: true } } } }
                    selectedAddons: { include: { addon: { include: { product: true } } } }
                  }
                }
              }
            }
            originalTransaction: { select: { id: true; invoiceNo: true } }
            refunds: { select: { id: true; invoiceNo: true; createdAt: true } }
          }
        }>
      >[],
      totalItems,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export type TransactionHistoryItem = Awaited<ReturnType<typeof fetchTransactionHistory>>['data'][number]
