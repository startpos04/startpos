import { SequenceType } from 'prisma/generated/prisma/enums'
import { sequenceCounterCollection } from '@/db/collections'
import dayjs from '@/lib/dayjs'
import { authStore } from '@/lib/better-auth/auth-store'

export function fetchStructuredId(type: SequenceType) {
  const { user } = authStore.state
  const now = dayjs.utc()
  const year = now.year()
  const month = now.month() + 1
  const day = type === 'ORDER' ? now.date() : 0

  // 1. Create the ID
  const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day}`

  // 2. Check if it exists.
  // IMPORTANT: Use .get() to inspect the object if .has() is failing.
  const existing = sequenceCounterCollection.get(counterId)

  let lastNumber: number

  if (existing) {
    // 3. Update existing
    sequenceCounterCollection.update(counterId, draft => {
      draft.lastNumber += 1
    })
    // Get the updated value after the mutation
    lastNumber = sequenceCounterCollection.get(counterId)!.lastNumber
  } else {
    // 4. Insert new
    sequenceCounterCollection.insert({
      id: counterId,
      type,
      year,
      month,
      day,
      lastNumber: 1,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })
    lastNumber = 1
  }

  const num = lastNumber.toString().padStart(6, '0')

  if (type === SequenceType.INVOICE && user.branch.maxInvoiceNo) {
    if (lastNumber > user.branch.maxInvoiceNo) {
      throw new Error(`BIR Permit Limit Reached: ${lastNumber} > ${user.branch.maxInvoiceNo}`)
    }
  }

  switch (type) {
    case SequenceType.INVOICE:
      return `SI-${year}-${num}`
    case SequenceType.REFUND:
      return `RF-${year}-${num}` // RF
    case SequenceType.ORDER:
      return `#${num}`
    case SequenceType.STOCK_TRANSFER:
      return `ST-${year}-${num}`
    case SequenceType.PURCHASE:
      return `PO-${year}-${num}`
    case SequenceType.COLLECTION_RECEIPT:
      return `CR-${year}-${num}`
    default:
      return `${type}-${num}`
  }
}
