// @ts-nocheck
import { createServerFn } from '@tanstack/react-start'
import Papa from 'papaparse'
import type { Prisma } from 'prisma/generated/prisma/browser'
import { PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import z from 'zod'
import dayjs from '@/lib/dayjs'
import { authMiddleware } from '../better-auth/auth-middleware'
import { PriceEngine } from '../conversion/price-engine'
import { getTenantPrisma } from '../prisma-client'
import type { Prettify } from '../types'

const downloadTransactionsSchema = z.object({
  from: z.string().optional().catch(dayjs().startOf('month').format('YYYY-MM-DD')),
  to: z.string().optional().catch(dayjs().endOf('month').format('YYYY-MM-DD')),
  cashierId: z.string().optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  type: z.nativeEnum(TransactionType).optional(),
})

export const downloadTransactionsCSV = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(d => downloadTransactionsSchema.parse(d))
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.businessId, context.user.branchId!)

    const transactions = (await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: dayjs(data.from).startOf('day').toDate(),
          lte: dayjs(data.to).endOf('day').toDate(),
        },
        ...(data.cashierId ? { cashierId: data.cashierId } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.method
          ? {
              payments: {
                some: { method: data.method },
              },
            }
          : {}),
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

      // Transactions with no order items still need a row (e.g. refunds)
      if (orderItems.length === 0) {
        return [
          {
            'Invoice No.': transaction.invoiceNo,
            Type: transaction.type,
            Date: dayjs(transaction.createdAt).format('YYYY-MM-DD HH:mm'),
            Cashier: transaction.cashier?.name || 'System',
            SKU: 'N/A',
            Product: '—',
            Variant: '',
            Category: 'N/A',
            Quantity: 0,
            'Unit Price': 0,
            Total: PriceEngine.toDollars(transaction.totalAmount),
            'Payment Method': transaction.payments[0]?.method ?? 'N/A',
            Reference: transaction.payments[0]?.referenceNo || 'N/A',
          },
        ]
      }

      return orderItems.map(item => {
        const variant = item.variant
        const product = variant.product

        // 📸 PHASE 1: Use snapshot fields with fallback to live data for old records
        const productName = item.snapshotProductName || product.name
        const variantName = item.snapshotVariantName || variant.name || ''
        const categoryName = item.snapshotCategoryName || product.category?.name || 'N/A'
        const sku = item.snapshotSku || variant.sku || 'N/A'

        return {
          'Invoice No.': transaction.invoiceNo,
          Type: transaction.type,
          Date: dayjs(transaction.createdAt).format('YYYY-MM-DD HH:mm'),
          Cashier: transaction.cashier?.name || 'System',
          SKU: sku,
          Product: productName,
          Variant: variantName,
          Category: categoryName,
          Quantity: item.quantity,
          'Unit Price': PriceEngine.toDollars(item.unitPrice),
          Total: PriceEngine.toDollars(item.quantity * item.unitPrice),
          'Payment Method': transaction.payments[0]?.method ?? 'N/A',
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
