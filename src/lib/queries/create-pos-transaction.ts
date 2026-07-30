import type { Order, OrderItem } from 'prisma/generated/prisma/browser'
import type { OrderItemAddon } from 'prisma/generated/prisma/client'
import { InvoiceType, OrderStatus, OrderType, PaymentMethod, SequenceType, TaxCategory, TaxLineType, TransactionType } from 'prisma/generated/prisma/enums'
import {
  inventoryCollection,
  inventoryMovementCollection,
  orderCollection,
  orderItemAddonCollection,
  orderItemCollection,
  paymentCollection,
  transactionCollection,
  transactionTaxLineCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import type { PaymentLine } from '@/routes/(private)/pos/-components/payment-dialog'
import { authStore } from '@/store/auth-store'
import { InventoryEngine, type posItem } from '../conversion/inventory-engine'
import { TaxEngine } from '../conversion/tax-engine'
import { CostingEngine } from '../costing'
import type { posProduct } from './fetch-pos-products'
import { fetchStructuredId } from './fetch-structured-id'

export interface CreateSaleInput {
  orderId?: string
  items: posItem[]
  payments: PaymentLine[]
  compliance: {
    scPwdName?: string
    scPwdIdNumber?: number
    scPwdDiscount?: number
  }
  customer: {
    customerReference: string | null
    notes?: string
    customerId: string
    buyerName?: string
    buyerTaxId?: string
    buyerAddress?: string
  }
}

export const createPosTransaction = async (data: CreateSaleInput, posOrders: posProduct[]) => {
  const { user } = authStore.state
  const productIds = data.items.map(item => item.product.id)
  const dbProducts = posOrders.filter(p => productIds.includes(p.id)) as posProduct[]

  const result = await dbTransaction(() => {
    // --- 1. VALIDATION & STOCK GUARD ---
    const cartForValidation = data.items.map(item => {
      const product = dbProducts.find(p => p.id === item.product.id)
      const variant = product?.variants?.find(v => v.id === item.variant.id)
      if (!product || !variant) throw new Error('Product or variant not found for validation')

      return { cartId: item.cartId, product, variant, quantity: item.quantity, addons: item.addons }
    })

    for (const [variantId, amountNeeded] of Object.entries(InventoryEngine.getReservedMap(cartForValidation, []))) {
      const { stock, name } = InventoryEngine.findPhysicalStock(variantId, dbProducts)
      if (stock < amountNeeded) throw new Error(`Insufficient stock for ${name}. Needed: ${amountNeeded}, Available: ${stock}`)
    }

    // --- 2. INTEGRATE TAX-ENGINE FOR TOTALS & TAX BREAKDOWNS ---
    const engineLineItems = TaxEngine.buildLineItems(data.items)

    // Calculate total cost side using the dataset reduce block
    const totalDiscount = data.payments.reduce((total, { discount }) => total + (discount || 0), 0) || 0
    const totalScPwdDiscount = data.payments.reduce((total, { scPwdDiscount }) => total + (scPwdDiscount || 0), 0) || data.compliance.scPwdDiscount || 0

    const totalCost = data.items.reduce((acc, item) => {
      const product = dbProducts.find(p => p.id === item.product.id)!
      const variant = product.variants.find(v => v.id === item.variant.id)!
      const baseCost = Number(variant.costPrice || 0)
      const addonsCost = item.addons.reduce((sum, a) => {
        const component = variant.components.find(c => c.id === a.id)!
        return sum + Number(component.material.costPrice || 0) * a.quantityUsed
      }, 0)
      return acc + (baseCost + addonsCost) * item.quantity
    }, 0)

    // Execute complete structural summary matrix including structural support for SC/PWD & general discounts
    const vatSummary = TaxEngine.summarize(
      engineLineItems,
      {
        vatRate: user.systemConfigs.VAT_RATE,
        priceConfiguration: user.systemConfigs.PRICE_CONFIGURATION,
        isVatRegistered: user.systemConfigs.IS_VAT_REGISTERED,
      },
      {
        discount: totalDiscount,
        scPwdDiscount: totalScPwdDiscount,
      },
    )

    // --- 3. UPSERT ORDER ---
    let order: Order | null = null
    const orderId = data.orderId ?? crypto.randomUUID()
    if (orderCollection.has(orderId)) {
      orderCollection.update(orderId, draft => {
        draft.customerReference = data.customer.customerReference || 'Walk-in Guest'
      })
      // Clean up existing items/addons for rewrite
      const itemsInOrder = [...orderItemCollection.values()].filter(i => i.orderId === orderId)
      const itemIds = itemsInOrder.map(i => i.id)
      if (itemIds.length > 0) {
        const addonIds = [...orderItemAddonCollection.values()].filter(a => itemIds.includes(a.orderItemId)).map(a => a.id)
        if (addonIds.length > 0) orderItemAddonCollection.delete(addonIds)
        orderItemCollection.delete(itemIds)
      }
      order = orderCollection.get(orderId) as unknown as Order
    } else {
      order = {
        id: orderId,
        orderNumber: fetchStructuredId(SequenceType.ORDER),
        status: OrderStatus.PENDING,
        orderType: OrderType.DINE_IN,
        customerReference: data.customer.customerReference || 'Walk-in Guest',
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      }
      orderCollection.insert(order)
    }

    // --- 4. CREATE ITEMS & ADDONS ---
    const items: (OrderItem & { selectedAddons: OrderItemAddon[] })[] = []
    for (const item of data.items) {
      const product = dbProducts.find(p => p.id === item.product.id)!
      const variant = product.variants.find(v => v.id === item.variant.id)!
      const itemId = crypto.randomUUID()
      const newItem: OrderItem & { selectedAddons: OrderItemAddon[] } = {
        id: itemId,
        orderId,
        variantId: item.variant.id,
        quantity: item.quantity,
        unitPrice: Number(variant.price),
        unitCost: Number(variant.costPrice || 0),
        unitId: product.baseUnitId,
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        selectedAddons: [],
      }

      orderItemCollection.insert(newItem)

      if (item.addons.length > 0) {
        newItem.selectedAddons = item.addons.map(a => {
          const comp = variant.components.find(c => c.id === a.id)!
          return {
            id: crypto.randomUUID(),
            orderItemId: itemId,
            addonId: comp.materialId,
            quantity: a.quantityUsed,
            priceAtSale: Number(comp.priceOverride || 0),
            costAtSale: Number(comp.material.costPrice || 0),
            businessId: user.business.id,
            branchId: user.branch.id,
            updatedAt: new Date(),
            createdAt: new Date(),
          }
        })
        orderItemAddonCollection.insert(newItem.selectedAddons)
      }

      items.push(newItem)
    }

    // --- 5. CREATE TRANSACTION & PAYMENT MAP ---
    const transaction = {
      id: crypto.randomUUID(),
      invoiceNo: fetchStructuredId(SequenceType.INVOICE),
      orderId,
      type: TransactionType.SALE,
      priceConfiguration: user.systemConfigs.PRICE_CONFIGURATION,
      invoiceType: InvoiceType.SALES_INVOICE,
      totalAmount: vatSummary.totalAmount,
      totalCost,
      taxAmount: vatSummary.taxAmount,
      discount: totalDiscount + totalScPwdDiscount,
      bufferRate: user.systemConfigs.BUFFER_RATE,
      complianceData: {
        ptuNumber: user.complianceRegistry.BIR_PTU_NUMBER,
        ptuIssuedAt: user.complianceRegistry.BIR_PTU_ISSUED_AT,
        vatableSales: vatSummary.vatableSales,
        vatAmount: vatSummary.vatAmount,
        vatExemptSales: vatSummary.vatExemptSales,
        zeroRatedSales: vatSummary.zeroRatedSales,
        scPwdName: data.compliance.scPwdName || null,
        scPwdIdNumber: data.compliance.scPwdIdNumber || null,
        scPwdDiscount: totalScPwdDiscount,
      },
      cashierId: user.id,
      businessId: user.business.id,
      branchId: user.branch.id,
      startTime: null,
      endTime: null,
      notes: data.customer.notes || null,
      customerId: data.customer.customerId || null,
      buyerName: data.customer.buyerName || null,
      buyerTaxId: data.customer.buyerTaxId || null,
      buyerAddress: data.customer.buyerAddress || null,
      providerId: null,
      sessionId: null,
      originalTransactionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    transactionCollection.insert(transaction)

    // --- DYNAMIC LEDGER POPULATION BY REVALUING CATEGORY BASES ---
    const activeCategories = [
      { category: TaxCategory.STANDARD, taxable: vatSummary.vatableSales, tax: vatSummary.vatAmount, rate: vatSummary.vatRate },
      { category: TaxCategory.EXEMPT, taxable: vatSummary.vatExemptSales, tax: 0, rate: 0 },
      { category: TaxCategory.ZERO_RATED, taxable: vatSummary.zeroRatedSales, tax: 0, rate: 0 },
    ]

    for (const item of activeCategories) {
      if (item.taxable === 0 && item.tax === 0) continue

      const taxLineEntry = {
        id: crypto.randomUUID(),
        transactionId: transaction.id,
        type: TaxLineType.VAT,
        category: item.category,
        rate: item.rate,
        taxableAmount: item.taxable,
        taxAmount: item.tax,
      }
      transactionTaxLineCollection.insert(taxLineEntry)
    }

    const payments = data.payments.map(payment => ({
      id: crypto.randomUUID(),
      transactionId: transaction.id,
      referenceNo: payment.referenceNo || '',
      method: payment.method || PaymentMethod.CASH,
      platform: payment.platform || null,
      amount: vatSummary.totalAmount,
      tendered: payment.tendered,
      change: payment.tendered - vatSummary.totalAmount,
      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: new Date(),
    }))
    paymentCollection.insert(payments)

    // --- 6. DECREMENT INVENTORY (FIFO) ---
    const reservedMap = InventoryEngine.getReservedMap(cartForValidation)
    for (const [vId, totalQty] of Object.entries(reservedMap)) {
      const productWithVariant = dbProducts.find(p => p.variants.some(v => v.id === vId))
      const unit =
        productWithVariant?.baseUnit ||
        dbProducts
          .flatMap(p => p.variants)
          .flatMap(v => v.components)
          .find(c => c.materialId === vId)?.unit

      if (!unit) continue

      const inventoryBatches = [...inventoryCollection.values()]
        .filter(i => i.variantId === vId && i.quantity > 0)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      const plan = CostingEngine.prepareConsumption('FIFO', { variantId: vId, quantity: totalQty, unit }, inventoryBatches)

      for (const usage of plan.consumed || []) {
        inventoryCollection.update(usage.inventoryId, draft => {
          draft.quantity -= usage.quantity
        })

        inventoryMovementCollection.insert({
          id: crypto.randomUUID(),
          variantId: vId,
          transactionId: transaction.id,
          inventoryId: usage.inventoryId,
          userId: user?.id,
          type: 'OUT',
          quantity: usage.quantity,
          reason: `Sale: ${transaction.invoiceNo}`,
          unitId: unit.id,
          purchaseId: null,
          locationId: null,
          targetBranchId: null,
          businessId: user.business.id,
          branchId: user.branch.id,
          updatedAt: new Date(),
          createdAt: new Date(),
          operationalTaskId: null,
        })
      }
    }

    return {
      transaction,
      payments,
      order: { ...order, items },
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
    return { error: result.error }
  }

  return {
    data: result.value,
  }
}

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
