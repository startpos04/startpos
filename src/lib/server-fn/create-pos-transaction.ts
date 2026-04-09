import { authStore } from '@/store/auth-store'
import { createServerFn } from '@tanstack/react-start'
import { Prisma, Unit } from 'prisma/generated/prisma/browser'
import { authMiddleware } from '../better-auth/auth-middleware'
import { VAT_RATE } from '../constants'
import { InventoryEngine, posItem, PosProduct, posProductProps } from '../conversion/inventory-engine'
import { CostingService } from '../costing'
import { getTenantPrisma } from '../prisma-client'
import { Prettify } from '../types'

interface SaleItem {
  cartId: string
  productId: string
  variantId?: string
  quantity: number
  unit: Unit
  price: number
  costPrice: number
  addons: {
    addonId: string
    price: number
    costPrice: number
    quantity: number
  }[]
}

interface CreateSaleInput {
  customerId: string | null
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

    // --- 1. PRE-FETCH PRODUCT DATA (Recipes & Inventory) ---
    // We need this to know what to decrement (ingredients vs products)
    const productIds = data.items.flatMap(item => [item.productId, ...(item.variantId ? [item.variantId] : []), ...item.addons.map(a => a.addonId)])
    const dbProducts = (await prisma.product.findMany({ where: { id: { in: productIds } }, include: posProductProps })) as PosProduct[]

    const result = await prisma.$transaction(async tx => {
      // --- 2. VALIDATION & TOTALS ---
      // Map frontend input to a format the Engine understands for validation
      const cartForValidation = data.items.map(item => ({
        cartId: item.cartId,
        product: dbProducts.find(p => p.id === (item.variantId || item.productId))!,
        variant: dbProducts.find(p => p.id === item.variantId)!,
        quantity: item.quantity,
        addons: item.addons.map(a => ({
          addonId: a.addonId,
          addon: dbProducts.find(p => p.id === a.addonId)!,
        })),
      }))

      // Backend Stock Guard
      const reservedMap = InventoryEngine.getReservedMap(cartForValidation as unknown as posItem[])
      for (const [id, amountNeeded] of Object.entries(reservedMap)) {
        const { stock, name } = InventoryEngine.findPhysicalStock(id, dbProducts, user.branch.id)

        if (stock < amountNeeded) {
          throw new Error(`Insufficient stock for ${name}. Needed: ${amountNeeded}, Available: ${stock}`)
        }
      }

      // Calculate totals
      const { totalTaxAmount, grandTotal, totalCost } = data.items.reduce(
        (acc, item) => {
          // 1. Calculate Addons Price and Cost
          const addonsPrice = item.addons.reduce((sum, a) => sum + a.price * a.quantity, 0)
          const addonsCost = item.addons.reduce((sum, a) => sum + a.costPrice * a.quantity, 0)

          // 2. Line calculations
          const lineSubtotal = (item.price + addonsPrice) * item.quantity
          const lineCost = (item.costPrice + addonsCost) * item.quantity
          const lineTax = lineSubtotal * VAT_RATE
          const lineTotal = lineSubtotal + lineTax

          // 3. Accumulate into the object
          return {
            totalTaxAmount: acc.totalTaxAmount + lineTax,
            grandTotal: acc.grandTotal + lineTotal,
            totalCost: acc.totalCost + lineCost,
          }
        },
        { totalTaxAmount: 0, grandTotal: 0, totalCost: 0 },
      )

      // --- 3. CREATE TRANSACTION ---
      const transaction = (await tx.transaction.create({
        data: {
          cashierId: user.id,
          customerId: data.customerId,
          totalAmount: grandTotal,
          taxAmount: totalTaxAmount,
          totalCost,
          bufferRate: user.branch.bufferRate,
          status: 'COMPLETED',
          type: 'SALE',
          items: {
            create: data.items.map(item => ({
              productId: item.variantId || item.productId,
              quantity: item.quantity,
              unitPrice: item.price,
              unitCost: item.costPrice,
              unitId: item.unit.id,
              selectedAddons: {
                create: item.addons.map(addon => ({
                  addonId: addon.addonId,
                  quantity: addon.quantity,
                  priceAtSale: addon.price,
                })),
              },
            })),
          },
          payments: {
            create: [
              {
                method: 'CASH',
                amount: grandTotal,
                tendered: data.payment.tendered,
                change: data.payment.tendered - grandTotal,
                referenceNo: null,
              },
            ],
          },
        },
        include: {
          items: {
            include: { selectedAddons: true },
          },
          payments: true,
        },
      })) as Prettify<Prisma.TransactionGetPayload<{ include: { items: { include: { selectedAddons: true } }; payments: true } }>>

      // --- 4. DECREMENT INVENTORY (THE ENGINE WAY) ---
      // Loop through the reserved map we generated earlier
      for (const [id, totalQuantityToSubtract] of Object.entries(reservedMap)) {
        const unit =
          dbProducts.find(p => p.id === id)?.baseUnit ||
          dbProducts.flatMap(p => p.ingredients || []).find(ing => ing.materialId === id)?.unit ||
          dbProducts.flatMap(p => p.allowedAddons || []).find(a => a.addonId === id)?.unit

        if (!unit) throw new Error(`Could not find unit definition for item: ${id}`)

        // 1. Fetch Inventory Batches for this specific product/material in this branch
        // We sort by createdAt ASC to support FIFO naturally
        const inventoryBatches = await tx.inventory.findMany({
          where: { productId: id, quantity: { gt: 0 } },
          orderBy: { createdAt: 'asc' },
        })

        // 2. Prepare the Consumption Plan using your CostingService
        // Strategy can come from user.branch.costingStrategy or a default

        const strategy = 'FIFO'
        const plan = CostingService.prepareConsumption(
          strategy,
          { productId: id, quantity: totalQuantityToSubtract, unit }, // Assuming base unit for materials
          inventoryBatches,
        )

        // 3. Execute the Plan: Update each specific batch
        for (const usage of plan.consumed || []) {
          await tx.inventory.update({
            where: { id: usage.inventoryId },
            data: { quantity: { decrement: usage.quantity } },
          })

          // 4. Log Movement for EACH batch (better for auditing)
          await tx.inventoryMovement.create({
            data: {
              productId: id,
              inventoryId: usage.inventoryId, // Link movement to the specific batch
              userId: user.id,
              type: 'OUT',
              quantity: usage.quantity,
              reason: `Sale: ${transaction.id} (${strategy})`,
              unitId: data.items[0]?.unit.id || '',
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
