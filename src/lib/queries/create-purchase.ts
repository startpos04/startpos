import { SequenceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { inventoryCollection, inventoryMovementCollection, productVariantCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'
import { fetchStructuredId } from './fetch-structured-id'

export const createPurchaseLineSchema = z.object({
  variantId: z.string().min(1, 'Item required'),
  quantity: z.number().positive('Must be > 0'),
  unitId: z.string().min(1, 'Unit required'),
  unitCost: z.number().nonnegative('Cost must be ≥ 0'),
})

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier required'),
  notes: z.string().optional().nullable(),
  items: z.array(createPurchaseLineSchema).min(1, 'Add at least one item'),
})

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>

export const createPurchase = async (data: CreatePurchaseInput) => {
  const { user } = authStore.state

  const result = await dbTransaction(() => {
    const purchaseId = crypto.randomUUID()
    const structuredId = fetchStructuredId(SequenceType.PURCHASE)
    const totalCost = data.items.reduce((sum, i) => sum + Math.round(i.unitCost * i.quantity), 0)

    // 1. Create the purchase header
    purchaseCollection.insert({
      id: purchaseId,
      purchaseId: structuredId,
      supplierId: data.supplierId,
      totalCost,
      notes: data.notes || null,
      operationalTaskId: null,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })

    for (const item of data.items) {
      // 2. Create purchase line items
      purchaseItemCollection.insert({
        id: crypto.randomUUID(),
        purchaseId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitId: item.unitId,
        unitCost: item.unitCost,
        businessId: user.business.id,
        branchId: user.branch.id,
      })

      // 3. Update variant reference cost
      if (productVariantCollection.has(item.variantId)) {
        productVariantCollection.update(item.variantId, draft => {
          draft.costPrice = item.unitCost
        })
      }

      // 4. Upsert inventory batch (batch keyed by PO number so each purchase is its own batch)
      const batchNumber = `PO-${structuredId}`
      const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === item.variantId && i.batchNumber === batchNumber)

      let inventoryId: string

      if (existingBatch) {
        inventoryId = existingBatch.id
        inventoryCollection.update(inventoryId, draft => {
          draft.quantity += item.quantity
          draft.costPrice = item.unitCost
          draft.lastRestocked = new Date()
        })
      } else {
        inventoryId = crypto.randomUUID()
        inventoryCollection.insert({
          id: inventoryId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitId: item.unitId,
          batchNumber,
          costPrice: item.unitCost,
          locationId: user.branch.id,
          expiryDate: null,
          lastRestocked: new Date(),
          businessId: user.business.id,
          branchId: user.branch.id,
          updatedAt: new Date(),
          createdAt: new Date(),
        })
      }

      // 5. Create audit movement (IN)
      inventoryMovementCollection.insert({
        id: crypto.randomUUID(),
        variantId: item.variantId,
        inventoryId,
        userId: user?.id,
        quantity: item.quantity,
        unitId: item.unitId,
        type: 'IN',
        reason: `${data.notes || 'Purchase Order'}: ${structuredId}`,
        transactionId: null,
        targetBranchId: null,
        purchaseId,
        locationId: user.branch.id,
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        operationalTaskId: null,
      })
    }

    return { purchaseId, structuredId }
  })

  if (result.isErr()) {
    console.error('Create purchase failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
