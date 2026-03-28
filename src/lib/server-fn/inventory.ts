import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { prisma } from '../prisma-client'

const restockSchema = z.object({
  productId: z.string(),
  quantity: z.number().gt(0),
  unitId: z.string(),
  reason: z.string().optional(),
  batchNumber: z.string().optional().default('DEFAULT'),
  expiryDate: z.string().optional(),
})

export const restockIngredient = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(restockSchema)
  .handler(async ({ context, data }) => {
    return await prisma.$transaction(async tx => {
      const { id, branchId } = context.user

      const movement = await tx.inventoryMovement.create({
        data: {
          productId: data.productId,
          branchId: branchId!, // From Session
          userId: id, // From Session
          quantity: data.quantity,
          unitId: data.unitId,
          type: 'IN',
          reason: data.reason || 'Manual Restock',
        },
      })

      await tx.inventory.upsert({
        where: {
          id: '',
          productId: data.productId,
          branchId: branchId!,
          batchNumber: data.batchNumber,
        },
        update: {
          quantity: { increment: data.quantity },
          lastRestocked: new Date(),
        },
        create: {
          productId: data.productId,
          branchId: branchId!,
          quantity: data.quantity,
          unitId: data.unitId,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        },
      })

      return { success: true, data: { ...movement, quantity: movement.quantity.toNumber() } }
    })
  })
