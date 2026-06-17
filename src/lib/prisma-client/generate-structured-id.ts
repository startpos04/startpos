import { SequenceType } from 'prisma/generated/prisma/browser'
import { authStore } from '@/store/auth-store'
import type { TenantPrismaClient } from '.'

type ExtendedTransactionClient = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0]

// It doesn't care if it's in a transaction or not!
export async function generateStructuredId(tx: ExtendedTransactionClient, type: SequenceType) {
  const { user } = authStore.state
  const now = new Date()
  const year = now.getFullYear()

  const counter = await tx.sequenceCounter.upsert({
    where: {
      businessId_branchId_type_year_month_day: {
        businessId: user.business.id,
        branchId: user.branch.id,
        type,
        year,
        month: now.getMonth() + 1,
        day: type === 'ORDER' ? now.getDate() : 0,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: {
      type,
      year,
      month: now.getMonth() + 1,
      day: type === 'ORDER' ? now.getDate() : 0,
      lastNumber: 1,
    },
  })

  const num = counter.lastNumber.toString().padStart(6, '0')

  if (type === SequenceType.INVOICE && user.branch.maxInvoiceNo) {
    if (counter.lastNumber > user.branch.maxInvoiceNo) {
      throw new Error(
        `BIR Permit Limit Reached: The current invoice number (${counter.lastNumber}) exceeds the authorized range (Max: ${user.branch.maxInvoiceNo}). Please update your PTU settings.`,
      )
    }
  }

  switch (type) {
    case SequenceType.INVOICE:
      return `SI-${year}-${num}`
    case SequenceType.ORDER:
      return `#${num}`
    case SequenceType.STOCK_TRANSFER:
      return `ST-${year}-${num}`
    case SequenceType.PURCHASE:
      return `PO-${year}-${num}`
    case SequenceType.COLLECTION_RECEIPT:
      return `CR-${year}-${num}`
  }
}
