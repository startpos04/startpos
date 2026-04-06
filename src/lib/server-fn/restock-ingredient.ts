import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { getTenantPrisma } from '../prisma-client'

const restockSchema = z.object({
  productId: z.string(),
  quantity: z.number().gt(0),
  unitCost: z.number().gte(0),
  unitId: z.string(),
  reason: z.string(),
  batchNumber: z.string().optional().default('DEFAULT'),
  expiryDate: z.string().optional().nullable(),
  sourceName: z.string(), // Added for the Purchase record
})

export const restockIngredient = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(restockSchema)
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)
    return await prisma.$transaction(async tx => {
      // Create the Financial Purchase Record
      // This tracks the "Accounts Payable" side of the business
      const purchase = await tx.purchase.create({
        data: {
          sourceName: data.sourceName,
          totalCost: data.unitCost * data.quantity,
          notes: data.reason,
          items: {
            create: {
              productId: data.productId,
              quantity: data.quantity,
              unitId: data.unitId,
              unitCost: data.unitCost,
            },
          },
        },
      })

      // Update the Global Product Reference Cost
      await tx.product.update({
        where: { id: data.productId },
        data: { costPrice: data.unitCost },
      })

      // Create the Audit Trail (Inventory Movement)
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: data.productId,
          userId: context.user.id,
          quantity: data.quantity,
          unitId: data.unitId,
          type: 'IN',
          reason: `Restocked via Purchase ${purchase.id}`,
        },
      })

      // Update or Create the Physical Inventory Batch
      // We check for an existing batch to avoid duplicating rows for the same Lot #
      const existingBatch = await tx.inventory.findFirst({
        where: {
          productId: data.productId,
          batchNumber: data.batchNumber,
        },
      })

      if (existingBatch) {
        await tx.inventory.update({
          where: { id: existingBatch.id },
          data: {
            quantity: { increment: data.quantity },
            costPrice: data.unitCost, // Update to latest cost for this batch
            lastRestocked: new Date(),
          },
        })
      } else {
        await tx.inventory.create({
          data: {
            productId: data.productId,
            quantity: data.quantity,
            unitId: data.unitId,
            batchNumber: data.batchNumber,
            costPrice: data.unitCost,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          },
        })
      }

      return {
        success: true,
        purchaseId: purchase.id,
        movementId: movement.id,
      }
    })
  })
