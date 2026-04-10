import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { getTenantPrisma } from '../prisma-client'

const restockSchema = z.object({
  variantId: z.string(),
  quantity: z.number().gt(0),
  unitCost: z.number().gte(0),
  unitId: z.string(),
  reason: z.string().nullable(),
  batchNumber: z.string().optional().default('DEFAULT'),
  expiryDate: z.string().optional().nullable(),
  sourceName: z.string().optional(),
  location: z.string().nullable(),
})

export const restockIngredient = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(restockSchema)
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)

    return await prisma.$transaction(async tx => {
      // 1. Create the Financial Purchase Record
      const purchase = await tx.purchase.create({
        data: {
          sourceName: data.sourceName || 'Manual Restock',
          totalCost: Math.round(data.unitCost * data.quantity),
          notes: data.reason,
          items: {
            create: {
              variantId: data.variantId,
              quantity: data.quantity,
              unitId: data.unitId,
              unitCost: data.unitCost,
            },
          },
        },
      })

      // 2. Update the Variant Reference Cost (instead of Product)
      // Your schema has costPrice on ProductVariant
      await tx.productVariant.update({
        where: { id: data.variantId },
        data: { costPrice: data.unitCost },
      })

      // 3. Create/Update the Inventory Batch Record
      // We look for same variant + branch + batch to increment
      const inventory = await tx.inventory.upsert({
        where: {
          // Note: You might need a composite unique index in schema if you want to use upsert here,
          // otherwise findFirst + update/create is safer.
          // Using your current schema's findFirst logic:
          id:
            (
              await tx.inventory.findFirst({
                where: {
                  variantId: data.variantId,
                  batchNumber: data.batchNumber,
                },
              })
            )?.id || 'non-existent-cuid',
        },
        update: {
          quantity: { increment: data.quantity },
          costPrice: data.unitCost,
          lastRestocked: new Date(),
        },
        create: {
          variantId: data.variantId,
          quantity: data.quantity,
          unitId: data.unitId,
          batchNumber: data.batchNumber,
          costPrice: data.unitCost,
          location: data.location,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        },
      })

      // 4. Create the Audit Trail (Inventory Movement)
      const movement = await tx.inventoryMovement.create({
        data: {
          variantId: data.variantId,
          inventoryId: inventory.id, // Linked to the batch created/updated above
          userId: context.user.id,
          quantity: data.quantity,
          unitId: data.unitId,
          type: 'IN',
          reason: data.reason || `Restocked via Purchase ${purchase.id}`,
        },
      })

      return {
        success: true,
        purchaseId: purchase.id,
        inventoryId: inventory.id,
        movementId: movement.id,
      }
    })
  })
