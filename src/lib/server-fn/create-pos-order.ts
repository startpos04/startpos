import { createServerFn } from '@tanstack/react-start'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { authMiddleware } from '../better-auth/auth-middleware'
import { PosProduct, posProductProps } from '../conversion/inventory-engine'
import { getTenantPrisma } from '../prisma-client'
import { generateStructuredId } from '../prisma-client/generate-structured-id'
import { CreateSaleInput } from './create-pos-transaction'

export const createPosOrder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: CreateSaleInput) => d)
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)

    // --- 1. PRE-FETCH PRODUCT DATA ---
    const productIds = data.items.map(item => item.productId)
    const dbProducts = (await prisma.product.findMany({ where: { id: { in: productIds } }, include: posProductProps })) as PosProduct[]

    const result = await prisma.$transaction(async tx => {
      if (data.orderId) {
        await tx.orderItemAddon.deleteMany({
          where: { orderItem: { orderId: data.orderId } },
        })
      }

      // --- 2. UPSERT THE ORDER ---
      // If data.orderId exists, we update. If not, Prisma uses the cuid() for a new record.
      const order = await tx.order.upsert({
        where: { id: data.orderId || 'new-order' },
        update: {
          customerReference: data.customerReference || 'Walk-in Guest',
          items: {
            deleteMany: {},
            create: data.items.map(item => {
              const product = dbProducts.find(p => p.id === item.productId)!
              const variant = product.variants.find(v => v.id === item.variantId)!

              return {
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: Number(variant.price),
                unitCost: Number(variant.costPrice || 0),
                unitId: product.baseUnitId,
                selectedAddons: {
                  create: item.addons.map(a => {
                    const comp = variant.components.find(c => c.id === a.id)!
                    return {
                      addonId: comp.materialId,
                      quantity: a.quantityUsed,
                      priceAtSale: Number(comp.priceOverride || 0),
                      costAtSale: Number(comp.material.costPrice || 0),
                    }
                  }),
                },
              }
            }),
          },
        },
        create: {
          orderNumber: await generateStructuredId(tx, SequenceType.ORDER),
          status: 'PENDING',
          orderType: 'DINE_IN',
          customerReference: data.customerReference || 'Walk-in Guest',
          items: {
            create: data.items.map(item => {
              const product = dbProducts.find(p => p.id === item.productId)!
              const variant = product.variants.find(v => v.id === item.variantId)!

              return {
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: Number(variant.price),
                unitCost: Number(variant.costPrice || 0),
                unitId: product.baseUnitId,
                selectedAddons: {
                  create: item.addons.map(a => {
                    const comp = variant.components.find(c => c.id === a.id)!
                    return {
                      organizationId: context.user.organizationId,
                      branchId: context.user.branchId!,
                      addonId: comp.materialId,
                      quantity: a.quantityUsed,
                      priceAtSale: Number(comp.priceOverride || 0),
                      costAtSale: Number(comp.material.costPrice || 0),
                    }
                  }),
                },
              }
            }),
          },
        },
        include: {
          items: {
            include: {
              selectedAddons: true,
            },
          },
        },
      })

      return order
    })

    return { data: result }
  })

type CreatePosOrderFn = typeof createPosOrder
export type CreatePosOrderResponse = Awaited<ReturnType<CreatePosOrderFn>>
