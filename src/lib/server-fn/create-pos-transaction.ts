import { authStore } from '@/store/auth-store'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '../better-auth/auth-middleware'
import { VAT_RATE } from '../constants'
import { getTenantPrisma } from '../prisma-client'

interface SaleItem {
  productId: string
  variantId?: string // If a variant was picked, this is the actual product ID used
  quantity: number
  unitId: string
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
}

export const createPosTransaction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: CreateSaleInput) => d)
  .handler(async ({ context, data }) => {
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)
    const { user } = authStore.state

    const result = await prisma.$transaction(async tx => {
      // --- 1. COMPUTATIONS ---
      let totalTaxAmount = 0
      let totalDiscount = 0
      let grandTotal = 0
      let totalCost = 0

      // Calculate totals from items and addons
      data.items.forEach(item => {
        const itemBasePrice = item.price
        const addonsPrice = item.addons.reduce((sum, a) => sum + a.price * a.quantity, 0)
        const addonsCost = item.addons.reduce((sum, a) => sum + a.costPrice * a.quantity, 0)

        const lineSubtotal = (itemBasePrice + addonsPrice) * item.quantity
        const lineCost = (item.costPrice + addonsCost) * item.quantity

        // If you implement per-item discounts in the future, apply them here
        const lineTax = lineSubtotal * VAT_RATE
        const lineTotal = lineSubtotal + lineTax

        // Accumulate for the main transaction record
        totalTaxAmount += lineTax
        grandTotal += lineTotal
        totalCost += lineCost

        return {
          ...item,
          lineTax,
          lineTotal,
        }
      })

      // 1. Create the Main Transaction
      const transaction = await tx.transaction.create({
        data: {
          branchId: '',
          cashierId: context.user.id,
          customerId: data.customerId,
          totalAmount: grandTotal,
          taxAmount: totalTaxAmount,
          discount: totalDiscount,
          totalCost: totalCost,
          bufferRate: user.branch.bufferRate,
          status: 'COMPLETED',
          type: 'SALE',
          items: {
            create: data.items.map(item => ({
              productId: item.variantId || item.productId, // Use variant ID if exists
              quantity: item.quantity,
              unitPrice: item.price,
              unitCost: item.costPrice,
              unitId: item.unitId,
              selectedAddons: {
                create: item.addons.map(addon => ({
                  addonId: addon.addonId,
                  quantity: addon.quantity,
                  priceAtSale: addon.price,
                })),
              },
            })),
          },
        },
        include: {
          items: {
            include: { selectedAddons: true },
          },
        },
      })

      // 2. Update Inventory & Log Movements
      for (const item of data.items) {
        const targetProductId = item.variantId || item.productId

        // Update Inventory record for this branch
        // Note: This assumes an inventory record already exists for the product/branch
        await tx.inventory.updateMany({
          where: {
            productId: targetProductId,
            branchId: '',
          },
          data: {
            quantity: { decrement: item.quantity },
          },
        })

        // Log the movement
        await tx.inventoryMovement.create({
          data: {
            productId: targetProductId,
            branchId: '',
            userId: context.user.id,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Sale: ${transaction.invoiceNo}`,
            unitId: item.unitId,
          },
        })

        // Repeat for Add-ons (since they are also products in your schema)
        for (const addon of item.addons) {
          await tx.inventory.updateMany({
            where: { productId: addon.addonId, branchId: '' },
            data: { quantity: { decrement: addon.quantity } },
          })

          await tx.inventoryMovement.create({
            data: {
              productId: addon.addonId,
              branchId: '',
              userId: context.user.id,
              type: 'OUT',
              quantity: addon.quantity,
              reason: `Addon for Sale: ${transaction.invoiceNo}`,
              unitId: item.unitId, // Or the addon's specific unit
            },
          })
        }
      }

      return transaction
    })

    return {
      data: result,
    }
  })

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
