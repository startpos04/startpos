import { authStore } from '@/store/auth-store'
import { createServerFn } from '@tanstack/react-start'
import { Prisma } from 'prisma/generated/prisma/browser'
import { authMiddleware } from '../better-auth/auth-middleware'
import { VAT_RATE } from '../constants'
import { InventoryEngine, PosProduct, PosProductComponent, posProductProps } from '../conversion/inventory-engine'
import { CostingService } from '../costing'
import { getTenantPrisma } from '../prisma-client'
import { Prettify } from '../types'

export interface SaleItem {
  cartId: string
  productId: string
  variantId: string
  quantity: number
  addons: PosProductComponent[]
}

export interface CreateSaleInput {
  orderId?: string
  customerReference: string | null
  items: SaleItem[]
  payment: {
    tendered: number
  }
}

export const createPosTransaction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: CreateSaleInput) => d)
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)
    const { user } = authStore.state

    // --- 1. PRE-FETCH PRODUCT DATA ---
    const productIds = data.items.map(item => item.productId)
    const dbProducts = (await prisma.product.findMany({ where: { id: { in: productIds } }, include: posProductProps })) as PosProduct[]

    const result = await prisma.$transaction(async tx => {
      // --- 2. VALIDATION & STOCK GUARD ---
      const cartForValidation = data.items.map(item => {
        const product = dbProducts.find(p => p.id === item.productId)!
        const variant = product?.variants?.find(v => v.id === item.variantId)!

        return {
          cartId: item.cartId,
          product,
          variant,
          quantity: item.quantity,
          addons: item.addons,
        }
      })

      // Backend Stock Guard
      const reservedMap = InventoryEngine.getReservedMap(cartForValidation)

      for (const [variantId, amountNeeded] of Object.entries(reservedMap)) {
        const { stock, name } = InventoryEngine.findPhysicalStock(variantId, dbProducts, user.branch.id)

        if (stock < amountNeeded) {
          throw new Error(`Insufficient stock for ${name}. Needed: ${amountNeeded}, Available: ${stock}`)
        }
      }

      // --- 3. TOTALS CALCULATION ---
      const totals = data.items.reduce(
        (acc, item) => {
          const product = dbProducts.find(p => p.id === item.productId)!
          const variant = product.variants.find(v => v.id === item.variantId)!

          const basePrice = Number(variant.price)
          const baseCost = Number(variant.costPrice || 0)

          const addonsTotals = item.addons.reduce(
            (sum, a) => {
              const component = variant.components.find(c => c.id === a.id)!
              return {
                price: sum.price + Number(component.priceOverride || 0) * a.quantityUsed,
                cost: sum.cost + Number(component.material.costPrice || 0) * a.quantityUsed,
              }
            },
            { price: 0, cost: 0 },
          )

          const lineSubtotal = (basePrice + addonsTotals.price) * item.quantity
          const lineCost = (baseCost + addonsTotals.cost) * item.quantity
          const lineTax = Math.round(lineSubtotal * VAT_RATE)

          return {
            tax: acc.tax + lineTax,
            total: acc.total + (lineSubtotal + lineTax),
            cost: acc.cost + lineCost,
          }
        },
        { tax: 0, total: 0, cost: 0 },
      )

      // --- 4. CREATE TRANSACTION ---
      const order = await tx.order.upsert({
        where: { id: data.orderId || 'new-order' },
        create: {
          status: 'SERVED',
          orderType: 'DINE_IN',
          items: {
            create: data.items.map(item => {
              const product = dbProducts.find(p => p.id === item.productId)!
              const variant = product.variants.find(v => v.id === item.variantId)!
              return {
                organizationId: context.user.organizationId,
                branchId: context.user.branchId!,
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
        update: {
          status: 'SERVED',
        },
      })

      const transaction = (await tx.transaction.create({
        data: {
          organizationId: context.user.organizationId,
          branchId: context.user.branchId!,
          cashierId: user.id,
          customerId: null,
          orderId: order.id,
          totalAmount: totals.total,
          taxAmount: totals.tax,
          totalCost: totals.cost,
          bufferRate: user.branch.bufferRate,
          status: 'COMPLETED',
          type: 'SALE',
          payments: {
            create: [
              {
                method: 'CASH',
                amount: totals.total,
                tendered: data.payment.tendered,
                change: data.payment.tendered - totals.total,
              },
            ],
          },
        },
        include: {
          order: { include: { items: { include: { selectedAddons: true } } } },
          payments: true,
        },
      })) as Prettify<Prisma.TransactionGetPayload<{ include: { order: { include: { items: { include: { selectedAddons: true } } } }; payments: true } }>>

      // --- 5. DECREMENT INVENTORY (FIFO) ---
      for (const [vId, totalQty] of Object.entries(reservedMap)) {
        // 1. Resolve the Unit from our pre-fetched dbProducts
        // We look through products to find the variant, then grab its baseUnit
        const productWithVariant = dbProducts.find(p => p.variants.some(v => v.id === vId))

        // If not found in direct products (could be a raw material used in a recipe),
        // we check the nested material data in the components
        const unit =
          productWithVariant?.baseUnit ||
          dbProducts
            .flatMap(p => p.variants)
            .flatMap(v => v.components)
            .find(c => c.materialId === vId)?.unit

        if (!unit) {
          throw new Error(`Unit definition missing for Variant ID: ${vId}`)
        }

        // 2. Fetch Inventory Batches
        const inventoryBatches = await tx.inventory.findMany({
          where: {
            variantId: vId,
            quantity: { gt: 0 },
            branchId: context.user.branchId,
          },
          orderBy: { createdAt: 'asc' }, // Standard FIFO
        })

        // 3. Prepare Consumption using the actual Unit object
        const plan = CostingService.prepareConsumption(
          'FIFO',
          {
            variantId: vId,
            quantity: totalQty,
            unit, // Passing the full Unit object (grams, ml, pcs, etc.)
          },
          inventoryBatches,
        )

        // 4. Execute updates and log movements
        for (const usage of plan.consumed || []) {
          await tx.inventory.update({
            where: { id: usage.inventoryId },
            data: { quantity: { decrement: usage.quantity } },
          })

          await tx.inventoryMovement.create({
            data: {
              variantId: vId,
              inventoryId: usage.inventoryId,
              userId: user.id,
              type: 'OUT',
              quantity: usage.quantity,
              reason: `Sale: ${transaction.id}`,
              unitId: unit.id,
            },
          })
        }
      }

      return transaction
    })

    return { data: result }
  })

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
