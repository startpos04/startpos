import { createServerFn } from '@tanstack/react-start'
import Papa from 'papaparse'
import type { Prisma } from 'prisma/generated/prisma/browser'
import z from 'zod'
import dayjs from '@/lib/dayjs'
import { authMiddleware } from '../better-auth/auth-middleware'
import { PriceEngine } from '../conversion/price-engine'
import { getTenantPrisma } from '../prisma-client'
import type { Prettify } from '../types'

const inventorySearchSchema = z.object({
  from: z.string().optional().catch(dayjs().startOf('month').format('YYYY-MM-DD')),
  to: z.string().optional().catch(dayjs().endOf('month').format('YYYY-MM-DD')),
})

export const downloadTransactionsCSV = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(d => inventorySearchSchema.parse(d))
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)

    const transactions = (await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: dayjs(data.from).startOf('day').toDate(),
          lte: dayjs(data.to).endOf('day').toDate(),
        },
      },
      include: {
        cashier: true,
        payments: true,
        order: {
          include: {
            items: {
              include: { variant: { include: { product: { include: { category: true } }, inventory: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as Prettify<
      Prisma.TransactionGetPayload<{
        include: {
          order: {
            include: {
              items: {
                include: { variant: { include: { product: { include: { category: true } }; inventory: true } } }
              }
            }
          }
          cashier: true
          payments: true
        }
      }>
    >[]

    const rows = transactions.flatMap(transaction => {
      const orderItems = transaction.order?.items || []

      return orderItems.map(item => {
        const variant = item.variant
        const product = variant.product

        return {
          'Invoice No.': transaction.invoiceNo,
          Date: dayjs(transaction.createdAt).format('YYYY-MM-DD HH:mm'),
          Cashier: transaction.cashier?.name || 'System',
          SKU: variant.sku || 'N/A',
          Product: product.name,
          Variant: variant.name || '',
          Category: product.category?.name || 'N/A',
          Quantity: item.quantity,
          'Unit Price': PriceEngine.toDollars(item.unitPrice),
          Total: PriceEngine.toDollars(item.quantity * item.unitPrice),
          'Payment Method': transaction.payments[0]?.method,
          Reference: transaction.payments[0]?.referenceNo || 'N/A',
        }
      })
    })

    const csv = Papa.unparse(rows, {
      header: true,
      skipEmptyLines: true,
    })

    return { data: csv }
  })
