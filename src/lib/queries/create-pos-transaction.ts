import { SequenceType } from 'prisma/generated/prisma/enums'
import {
  inventoryCollection,
  inventoryMovementCollection,
  orderCollection,
  orderItemAddonCollection,
  orderItemCollection,
  paymentCollection,
  transactionCollection,
} from '@/db/collections'
import { authStore } from '@/store/auth-store'
import { VAT_RATE } from '../constants'
import { InventoryEngine, type PosProduct } from '../conversion/inventory-engine'
import { CostingEngine } from '../costing'
import type { CreateSaleInput } from '../server-fn/create-pos-transaction'
import { fetchStructuredId } from './fetch-structured-id'

export const createPosTransaction = async (data: CreateSaleInput, posOrders: PosProduct[]) => {
  const { user } = authStore.state
  const productIds = data.items.map(item => item.productId)
  const dbProducts = posOrders.filter(p => productIds.includes(p.id)) as PosProduct[]

  // --- 1. VALIDATION & STOCK GUARD ---
  const cartForValidation = data.items.map(item => {
    const product = dbProducts.find(p => p.id === item.productId)
    const variant = product?.variants?.find(v => v.id === item.variantId)
    if (!product || !variant) throw new Error('Product or variant not found for validation')

    return { cartId: item.cartId, product, variant, quantity: item.quantity, addons: item.addons }
  })

  for (const [variantId, amountNeeded] of Object.entries(InventoryEngine.getReservedMap(cartForValidation, []))) {
    const { stock, name } = InventoryEngine.findPhysicalStock(variantId, dbProducts)
    if (stock < amountNeeded) throw new Error(`Insufficient stock for ${name}. Needed: ${amountNeeded}, Available: ${stock}`)
  }

  // --- 2. TOTALS CALCULATION ---
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

      return { tax: acc.tax + lineTax, total: acc.total + (lineSubtotal + lineTax), cost: acc.cost + lineCost }
    },
    { tax: 0, total: 0, cost: 0 },
  )

  // --- 3. UPSERT ORDER ---
  const orderId = data.orderId || crypto.randomUUID()
  if (orderCollection.has(orderId)) {
    await orderCollection.update(orderId, draft => {
      draft.customerReference = data.customerReference || 'Walk-in Guest'
      draft.status = 'SERVED'
    })
    // Clean up existing items/addons for rewrite
    const itemsInOrder = [...orderItemCollection.values()].filter(i => i.orderId === orderId)
    const itemIds = itemsInOrder.map(i => i.id)
    if (itemIds.length > 0) {
      const addonIds = [...orderItemAddonCollection.values()].filter(a => itemIds.includes(a.orderItemId)).map(a => a.id)
      if (addonIds.length > 0) await orderItemAddonCollection.delete(addonIds)
      await orderItemCollection.delete(itemIds)
    }
  } else {
    const orderNumber = await fetchStructuredId(SequenceType.ORDER)
    await orderCollection.insert({
      id: orderId,
      orderNumber,
      status: 'SERVED',
      orderType: 'DINE_IN',
      customerReference: data.customerReference || 'Walk-in Guest',
      organizationId: user.organization.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })
  }

  // --- 4. CREATE ITEMS & ADDONS ---
  for (const item of data.items) {
    const product = dbProducts.find(p => p.id === item.productId)!
    const variant = product.variants.find(v => v.id === item.variantId)!
    const itemId = crypto.randomUUID()

    await orderItemCollection.insert({
      id: itemId,
      orderId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: Number(variant.price),
      unitCost: Number(variant.costPrice || 0),
      unitId: product.baseUnitId,
      organizationId: user.organization.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })

    if (item.addons.length > 0) {
      const addons = item.addons.map(a => {
        const comp = variant.components.find(c => c.id === a.id)!
        return {
          id: crypto.randomUUID(),
          orderItemId: itemId,
          addonId: comp.materialId,
          quantity: a.quantityUsed,
          priceAtSale: Number(comp.priceOverride || 0),
          costAtSale: Number(comp.material.costPrice || 0),
          organizationId: user.organization.id,
          branchId: user.branch.id,
          updatedAt: new Date(),
          createdAt: new Date(),
        }
      })
      await orderItemAddonCollection.insert(addons)
    }
  }

  // --- 5. CREATE TRANSACTION & PAYMENT ---
  const transactionId = crypto.randomUUID()
  const invoiceNo = await fetchStructuredId(SequenceType.INVOICE)

  await transactionCollection.insert({
    id: transactionId,
    invoiceNo,
    orderId,
    cashierId: user?.id,
    totalAmount: totals.total,
    taxAmount: totals.tax,
    discount: 0,
    totalCost: totals.cost,
    status: 'COMPLETED',
    type: 'SALE',
    bufferRate: user.branch.bufferRate,
    startTime: null,
    endTime: null,
    notes: null,
    queueNumber: null,
    providerId: null,
    customerId: null,
    sessionId: null,
    organizationId: user.organization.id,
    branchId: user.branch.id,
    updatedAt: new Date(),
    createdAt: new Date(),
  })

  await paymentCollection.insert({
    id: crypto.randomUUID(),
    transactionId,
    referenceNo: '',
    method: 'CASH',
    amount: totals.total,
    tendered: data.payment.tendered,
    change: data.payment.tendered - totals.total,
    organizationId: user.organization.id,
    branchId: user.branch.id,
    createdAt: new Date(),
  })

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
      await inventoryCollection.update(usage.inventoryId, draft => {
        draft.quantity -= usage.quantity
      })

      await inventoryMovementCollection.insert({
        id: crypto.randomUUID(),
        variantId: vId,
        inventoryId: usage.inventoryId,
        userId: user?.id,
        type: 'OUT',
        quantity: usage.quantity,
        reason: `Sale: ${invoiceNo}`,
        unitId: unit.id,
        targetBranchId: null,
        organizationId: user.organization.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      })
    }
  }

  return {
    data: {
      transaction: transactionCollection.get(transactionId)!,
      payments: [...paymentCollection.values()].filter(p => p.transactionId === transactionId),
      order: {
        ...orderCollection.get(orderId),
        items: [...orderItemCollection.values()]
          .filter(i => i.orderId === orderId)
          .map(item => ({
            ...item,
            selectedAddons: [...orderItemAddonCollection.values()].filter(a => a.orderItemId === item.id),
          })),
      },
    },
  }
}

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
