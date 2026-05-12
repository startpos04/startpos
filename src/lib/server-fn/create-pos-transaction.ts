import { createServerFn } from '@tanstack/react-start'
import { type Prisma, SequenceType } from 'prisma/generated/prisma/browser'
import { getOrderItems } from '@/hooks/use-pos'
import { authStore } from '@/store/auth-store'
import { authMiddleware } from '../better-auth/auth-middleware'
import { VAT_RATE } from '../constants'
import { InventoryEngine, type PosProduct, type PosProductComponent, posProductProps } from '../conversion/inventory-engine'
import { CostingEngine } from '../costing'
import { NotificationEngine } from '../notification/notification-engine'
import { getTenantPrisma } from '../prisma-client'
import { generateStructuredId } from '../prisma-client/generate-structured-id'
import { type ActiveOrder, activeOrderProps } from '../queries/fetch-active-orders'
import type { Prettify } from '../types'

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
    const activeOrders = (await prisma.order.findMany({
      where: { id: { not: data.orderId || '' }, status: { in: ['PREPARING', 'PENDING'] } },
      include: activeOrderProps,
    })) as ActiveOrder[]

    const productIds = [...data.items.map(item => item.productId), ...activeOrders.flatMap(order => order.items.map(item => item.variant.productId))]
    const dbProducts = (await prisma.product.findMany({ where: { id: { in: productIds } }, include: posProductProps })) as PosProduct[]

    const result = await prisma.$transaction(async tx => {
      // --- 2. VALIDATION & STOCK GUARD ---
      const orderItems = getOrderItems(activeOrders, dbProducts)

      const cartForValidation = data.items
        .flatMap(item => {
          const product = dbProducts.find(p => p.id === item.productId)
          const variant = product?.variants?.find(v => v.id === item.variantId)
          if (!product || !variant) return []

          return [
            {
              cartId: item.cartId,
              product,
              variant,
              quantity: item.quantity,
              addons: item.addons,
            },
          ]
        })
        .filter(Boolean)

      // Backend Stock Guard
      for (const [variantId, amountNeeded] of Object.entries(InventoryEngine.getReservedMap(cartForValidation, orderItems))) {
        const { stock, name } = InventoryEngine.findPhysicalStock(variantId, dbProducts)

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
          orderNumber: await generateStructuredId(tx, SequenceType.ORDER),
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
          invoiceNo: await generateStructuredId(tx, SequenceType.INVOICE),
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
      const reservedMap = InventoryEngine.getReservedMap(cartForValidation)
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
        const plan = CostingEngine.prepareConsumption(
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
              reason: `Sale: ${transaction.invoiceNo}`,
              unitId: unit.id,
            },
          })
        }
      }

      // --- BACKGROUND CHECK ---
      // We do NOT await this. It runs in the background.
      NotificationEngine.checkLowStock(Object.keys(reservedMap)).catch(console.error)

      return transaction
    })

    return { data: result }
  })

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
