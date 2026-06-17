// @ts-nocheck
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

export const downloadInventoryCsv = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(d => inventorySearchSchema.parse(d))
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.businessId, context.user.branchId!)

    const inventory = (await prisma.inventory.findMany({
      where: {
        updatedAt: {
          gte: dayjs(data.from).startOf('day').toDate(),
          lte: dayjs(data.to).endOf('day').toDate(),
        },
        quantity: { gt: 0 },
      },
      include: {
        variant: {
          include: { product: { include: { category: true } } },
        },
        unit: true,
      },
    })) as Prettify<Prisma.InventoryGetPayload<{ include: { variant: { include: { product: { include: { category: true } } } }; unit: true } }>>[]

    const rows = inventory.map(item => ({
      Date: dayjs().format('YYYY-MM-DD'),
      SKU: item.variant.sku || 'N/A',
      'Item Description': `${item.variant.product.name} ${item.variant.name ?? ''}`.trim(),
      Category: item.variant.product.category.name,
      UOM: item.unit.abbreviation,
      Quantity: item.quantity,
      'Unit Cost': PriceEngine.toDollars(item.costPrice),
      'Total Value': PriceEngine.toDollars(item.quantity * item.costPrice),
      Batch: item.batchNumber || 'N/A',
    }))

    // 3. Generate CSV using PapaParse
    const csv = Papa.unparse(rows, {
      header: true,
      skipEmptyLines: true,
    })

    return { data: csv }
  })
