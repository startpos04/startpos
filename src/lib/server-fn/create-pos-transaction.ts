import { authStore } from '@/store/auth-store'
import { createServerFn } from '@tanstack/react-start'
import { Prisma } from 'prisma/generated/prisma/browser'
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
  addons: {
    addonId: string
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
    const productIds = data.items.map(item => item.productId)
    const dbProducts = (await prisma.product.findMany({ where: { id: { in: productIds } }, include: posProductProps })) as PosProduct[]

    const result = await prisma.$transaction(async tx => {
      // --- 2. VALIDATION & TOTALS ---
      // Map frontend input to a format the Engine understands for validation
      const cartForValidation = data.items.map(item => {
        const product = dbProducts.find(p => p.id === item.productId)!
        const variant = product?.variants?.find(v => v.id === item.variantId)!

        return {
          cartId: item.cartId,
          product,
          variant,
          quantity: item.quantity,
          addons: item.addons.map(a => ({
            addonId: a.addonId,
          })),
        }
      })

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
          // Get the main Product and its specific Variant
          const product = dbProducts.find(p => p.id === item.productId)!
          const variant = product.variants.find(v => v.id === item.variantId)!

          const itemPrice = Number(variant.price)
          // Use the CostingService or a direct property if available on the variant
          const itemCost = Number(variant.costPrice || 0)

          // Calculate Addons Price and Cost
          const addonsTotals = item.addons.reduce(
            (sum, a) => {
              // Find the addon configuration on the parent product to get the priceOverride
              const addonConfig = product.allowedAddons.find(rel => rel.id === a.addonId)!

              // Find the addon's actual variant to get the costPrice
              // Usually, addonConfig.addon.variants[0] is the target for simple addons
              const addonVariant = addonConfig.addon.variants?.[0]

              const aPrice = Number(addonConfig.priceOverride || 0)
              const aCost = Number(addonVariant?.costPrice || 0)

              return {
                price: sum.price + aPrice * a.quantity,
                cost: sum.cost + aCost * a.quantity,
              }
            },
            { price: 0, cost: 0 },
          )

          // Line calculations
          const lineSubtotal = itemPrice * item.quantity + addonsTotals.price * item.quantity
          const lineCost = itemCost * item.quantity + addonsTotals.cost * item.quantity
          const lineTax = Math.round(lineSubtotal * VAT_RATE)
          const lineTotal = lineSubtotal + lineTax

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
            create: data.items.map(item => {
              const product = dbProducts.find(p => p.id === item.productId)!
              const variant = product.variants.find(v => v.id === item.variantId)!

              return {
                organizationId: context.user.organizationId,
                branchId: context.user.branchId!,
                variantId: item.variantId!,
                quantity: item.quantity,
                unitPrice: Number(variant.price),
                unitCost: Number(variant.costPrice || 0),
                unitId: product.baseUnitId,

                selectedAddons: {
                  create: item.addons.map(addon => {
                    const addonConfig = product.allowedAddons.find(rel => rel.id === addon.addonId)!
                    const addonVariant = addonConfig.addon.variants?.[0]

                    return {
                      organizationId: context.user.organizationId,
                      branchId: context.user.branchId!,
                      addonId: addon.addonId,
                      quantity: addon.quantity,
                      priceAtSale: Number(addonConfig.priceOverride || 0),
                      costAtSale: Number(addonVariant?.costPrice || 0),
                    }
                  }),
                },
              }
            }),
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
          items: { include: { selectedAddons: true } },
          payments: true,
        },
      })) as Prettify<Prisma.TransactionGetPayload<{ include: { items: { include: { selectedAddons: true } }; payments: true } }>>

      // --- 4. DECREMENT INVENTORY (THE ENGINE WAY) ---
      // Loop through the reserved map we generated earlier
      for (const [id, totalQuantityToSubtract] of Object.entries(reservedMap)) {
        // 1. Find the product that contains this variant ID
        const parentProduct = dbProducts.find(p => p.variants.some(v => v.id === id))

        // 2. Find the unit: either the parent product's baseUnit or from an ingredient
        const unit =
          parentProduct?.baseUnit ||
          dbProducts
            .flatMap(p => p.variants)
            .flatMap(v => v.ingredients)
            .find(ing => ing.materialId === id)?.unit

        if (!unit) throw new Error(`Could not find unit definition for variant: ${id}`)

        // 1. Fetch Inventory Batches for this specific product/material in this branch
        // We sort by createdAt ASC to support FIFO naturally
        const inventoryBatches = await tx.inventory.findMany({
          where: { variantId: id, quantity: { gt: 0 } },
          orderBy: { createdAt: 'asc' },
        })

        // 2. Prepare the Consumption Plan using your CostingService
        // Strategy can come from user.branch.costingStrategy or a default

        const strategy = 'FIFO'
        const plan = CostingService.prepareConsumption(strategy, { variantId: id, quantity: totalQuantityToSubtract, unit }, inventoryBatches)

        // 3. Execute the Plan: Update each specific batch
        for (const usage of plan.consumed || []) {
          await tx.inventory.update({
            where: { id: usage.inventoryId },
            data: { quantity: { decrement: usage.quantity } },
          })

          // 4. Log Movement for EACH batch (better for auditing)
          await tx.inventoryMovement.create({
            data: {
              variantId: id,
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

      return transaction
    })

    return { data: result }
  })

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
