import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { getServerContext } from '@platform/lib/better-auth/server-context'
import dayjs from '@platform/lib/dayjs'
import { createServerFn } from '@tanstack/react-start'
import { PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import z from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { crudAPI } from '@/lib/prisma-client/crud-api'

const PAGE_SIZE = 50

const fetchTransactionHistorySchema = z.object({
  from: z.string().default(dayjs().startOf('month').format('YYYY-MM-DD')),
  to: z.string().default(dayjs().endOf('month').format('YYYY-MM-DD')),
  cashierId: z.string().optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  type: z.nativeEnum(TransactionType).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(PAGE_SIZE),
})

export type FetchTransactionHistoryInput = z.infer<typeof fetchTransactionHistorySchema>

export const fetchTransactionHistory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_TRANSACTIONS)])
  .inputValidator((input: FetchTransactionHistoryInput | undefined) => fetchTransactionHistorySchema.parse(input || {}))
  .handler(async ({ context, data }) => {
    console.log('[fetchTransactionHistory] Handler called with:', {
      from: data.from,
      to: data.to,
      page: data.page,
      pageSize: data.pageSize,
      userBusinessId: getServerContext(context).user?.businessId,
      userBranchId: getServerContext(context).user?.branchId,
    })

    const where = {
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
              { invoiceNo: { contains: data.search, mode: 'insensitive' as const } },
              { cashier: { name: { contains: data.search, mode: 'insensitive' as const } } },
              { order: { orderNumber: { contains: data.search, mode: 'insensitive' as const } } },
              { snapshotCustomerName: { contains: data.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    // Debug logging
    console.log('[fetchTransactionHistory] Query params:', {
      from: data.from,
      to: data.to,
      fromDate: dayjs(data.from).startOf('day').toDate(),
      toDate: dayjs(data.to).endOf('day').toDate(),
    })

    const [txResult, countResult] = await Promise.all([
      crudAPI.transaction('findMany', {
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
        orderBy: { createdAt: 'desc' as const },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      crudAPI.transaction('count', { where }),
    ])

    if (txResult.isErr()) throw new Error(txResult.error)
    if (countResult.isErr()) throw new Error(countResult.error)

    console.log('[fetchTransactionHistory] Results:', {
      count: countResult.value,
      returned: txResult.value.length,
      page: data.page,
      pageSize: data.pageSize,
    })

    return {
      data: txResult.value,
      totalItems: countResult.value,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export type TransactionHistoryItem = Awaited<ReturnType<typeof fetchTransactionHistory>>['data'][number]
