import type { Order, OrderItem } from 'prisma/generated/prisma/browser'
import type { OrderItemAddon } from 'prisma/generated/prisma/client'
import { InvoiceType, OrderStatus, OrderType, PaymentMethod, SequenceType, TaxCategory, TaxLineType, TransactionType } from 'prisma/generated/prisma/enums'
import {
  creditLedgerCollection,
  inventoryCollection,
  inventoryMovementCollection,
  orderCollection,
  orderItemAddonCollection,
  orderItemCollection,
  paymentCollection,
  transactionCollection,
  transactionTaxLineCollection,
  usageCounterCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import type { PaymentLine } from '@/routes/(private)/pos/-components/payment-dialog'
import { authStore } from '@/store/auth-store'
import { CreditEngine } from '../billing/credit-engine'
import { BillingModel } from '../billing/types'
import { UsageEngine } from '../billing/usage-engine'
import { PosStockEngine, type posItem } from '../conversion/pos-stock-engine'
import { TaxEngine } from '../conversion/tax-engine'
import { CostingEngine } from '../costing'
import { NotificationEngine } from '../notification/notification-engine'
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

  // Prefer posOrders (already fetched) but fall back to the item's own product
  // for any product not found there — covers Quick Add products that were just
  // created and may not yet be in the posOrders snapshot passed from the parent.
  const dbProducts = productIds
    .map(id => {
      const fromQuery = posOrders.find(p => p.id === id)
      if (fromQuery) return fromQuery
      // Fall back to the item itself — it was just created and carries all the
      // shape needed for validation (type, variants with inventory: [], components: [])
      const fromCart = data.items.find(i => i.product.id === id)
      return fromCart?.product ?? null
    })
    .filter(Boolean) as posProduct[]

  const result = await dbTransaction(() => {
    // --- 1. VALIDATION & STOCK GUARD ---
    const cartForValidation = data.items.map(item => {
      const product = dbProducts.find(p => p.id === item.product.id)
      const variant = product?.variants?.find(v => v.id === item.variant.id)
      if (!product || !variant) throw new Error('Product or variant not found for validation')

      return { cartId: item.cartId, product, variant, quantity: item.quantity, addons: item.addons }
    })

    for (const [variantId, amountNeeded] of Object.entries(PosStockEngine.getReservedMap(cartForValidation, []))) {
      const { stock, name } = PosStockEngine.findPhysicalStock(variantId, dbProducts)
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

      // selectedAddons is a client-side join field — strip it before persisting
      // to the collection so transactionAPI never sends it to Prisma.
      const { selectedAddons: _sa, ...itemForCollection } = newItem
      orderItemCollection.insert(itemForCollection as OrderItem)

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
    const transactionId = crypto.randomUUID()

    // --- 5a. INCREMENT USAGE COUNTER (Phase 2) ---
    // Find the open UsageCounter for the current business + billing period.
    // The subscription stored in authStore carries currentPeriodStart; we use
    // it as the period key. If no counter exists yet (e.g. first TX of a period,
    // or counter not yet synced), we create a stub that will be upserted.
    //
    // IMPORTANT: This must remain synchronous — it runs inside dbTransaction
    // which is a synchronous local-first callback (no network I/O).
    // Pattern mirrors InventoryEngine: read from collection → engine call → write to collection.

    const businessId = user.business.id
    const subscription = authStore.state.user?.entitlement

    // Locate the open counter for the current period from the offline collection.
    // Match on businessId; closed counters are filtered out.
    const openCounterEntry = [...usageCounterCollection.values()].find(c => c.businessId === businessId && !c.isClosed)

    // Read overage policy from authStore systemConfigs (already loaded, no fetch needed)
    const overageBillingEnabled =
      (user.systemConfigs as Record<string, unknown>)['OVERAGE_BILLING_ENABLED'] === true ||
      (user.systemConfigs as Record<string, unknown>)['OVERAGE_BILLING_ENABLED'] === 'true'

    // Determine plan TX allowance from entitlement summary (null = unlimited)
    // txRemaining null means unlimited; if we have a value, back-calculate includedTxPerMonth
    // from txRemaining. For the engine we only need: is the counter exhausted?
    // We use -1 (unlimited) when txRemaining is null.
    const includedTxPerMonth =
      subscription?.txRemaining === null || subscription?.txRemaining === undefined
        ? -1 // unlimited
        : (subscription.txRemaining ?? 0) + (openCounterEntry?.txCount ?? 0)

    let usageCounterId: string | null = null

    if (openCounterEntry) {
      const snapshot = {
        id: openCounterEntry.id,
        businessId: openCounterEntry.businessId,
        billingPeriodStart: new Date(openCounterEntry.billingPeriodStart),
        billingPeriodEnd: new Date(openCounterEntry.billingPeriodEnd),
        txCount: openCounterEntry.txCount,
        overageTxCount: openCounterEntry.overageTxCount,
        isClosed: openCounterEntry.isClosed,
      }

      const incrementResult = UsageEngine.increment(snapshot, includedTxPerMonth, overageBillingEnabled)

      if (!incrementResult.ok) {
        // TX allowance exhausted and overage billing is disabled — block the checkout
        throw new Error(incrementResult.reason)
      }

      const updated = incrementResult.value
      usageCounterCollection.update(openCounterEntry.id, draft => {
        draft.txCount = updated.txCount
        draft.overageTxCount = updated.overageTxCount
        draft.updatedAt = new Date()
      })
      usageCounterId = openCounterEntry.id
    } else {
      // No open counter found in the collection (e.g. start of a new period,
      // or collection not yet synced). Create a new counter entry locally.
      // The server-side sync will upsert this into the DB.
      const now = new Date()
      // Use a placeholder period if subscription dates are unavailable
      const periodStart = now
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

      const newCounterId = crypto.randomUUID()
      usageCounterCollection.insert({
        id: newCounterId,
        businessId,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        txCount: 1,
        overageTxCount: 0,
        isClosed: false,
        createdAt: now,
        updatedAt: now,
      })
      usageCounterId = newCounterId
    }

    // --- 5b. DEDUCT CREDIT (Phase 3 — PREPAID_CREDITS billing model only) ---
    // Credit deduction is conditional on the billing model. For MONTHLY_SUBSCRIPTION
    // and HYBRID, this block is skipped entirely — zero performance cost.
    //
    // The collection holds on-demand-synced CreditLedger entries. The latest
    // entry's balanceAfter is the current balance (O(1) read — no SUM query).
    // The deduction inserts a new CONSUMED entry and posts a low-balance
    // notification asynchronously after the dbTransaction callback returns.
    //
    // NOTE (R2 — Phase 3 known limitation): Two concurrent checkouts may both
    // pass the balance check before either insert commits (race condition).
    // See CreditEngine.deduct() for the full explanation and mitigation note.

    const billingModel = (subscription as { billingModel?: string } | undefined)?.billingModel
    let pendingCreditEntry: import('../billing/credit-engine').CreditLedgerEntryDTO | null = null
    let creditIsLowBalance = false

    if (billingModel === BillingModel.PREPAID_CREDITS) {
      // Read the latest CreditLedger entry from the on-demand collection.
      // Fall back to the authStore entitlement balance when the collection
      // hasn't been synced yet (on-demand collections don't load until
      // explicitly queried, so the first checkout of a session always hits
      // this path). authStore.creditBalance is loaded from the server at
      // login and is authoritative for the current session.
      const ledgerEntries = [...creditLedgerCollection.values()]
        .filter(e => e.businessId === businessId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      // Prefer the local collection (tracks in-session deductions accurately);
      // fall back to the server-loaded balance from authStore.
      const latestEntry: { balanceAfter: number } | null =
        ledgerEntries[0] ?? (subscription?.creditBalance != null ? { balanceAfter: subscription.creditBalance } : null)

      // Read the low-balance threshold from systemConfigs (already loaded).
      const rawThreshold = (user.systemConfigs as Record<string, unknown>)['CREDIT_LOW_BALANCE_THRESHOLD']
      const lowBalanceThreshold = typeof rawThreshold === 'number' ? rawThreshold : Number(rawThreshold ?? 10)

      const creditResult = CreditEngine.deduct(
        businessId,
        latestEntry ? { balanceAfter: latestEntry.balanceAfter } : null,
        transactionId, // the transaction ID being created in this dbTransaction
        lowBalanceThreshold,
      )

      if (!creditResult.ok) {
        // Balance is zero — block the checkout
        throw new Error(creditResult.reason)
      }

      pendingCreditEntry = creditResult.value.entry
      creditIsLowBalance = creditResult.value.isLowBalance

      // Insert the CONSUMED ledger entry into the local collection.
      // The server-side sync will persist it to the DB.
      creditLedgerCollection.insert({
        id: crypto.randomUUID(),
        businessId: pendingCreditEntry.businessId,
        eventType: pendingCreditEntry.eventType as import('prisma/generated/prisma/browser').CreditEventType,
        amount: pendingCreditEntry.amount,
        balanceAfter: pendingCreditEntry.balanceAfter,
        transactionId: pendingCreditEntry.transactionId,
        note: pendingCreditEntry.note,
        actorId: pendingCreditEntry.actorId,
        createdAt: new Date(),
      })
    }

    const transaction = {
      id: transactionId,
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
      // Phase 2 — link transaction to its UsageCounter for audit and reporting
      usageCounterId,
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
    const reservedMap = PosStockEngine.getReservedMap(cartForValidation)
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
      creditIsLowBalance,
      creditBalanceAfter: pendingCreditEntry?.balanceAfter ?? null,
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
    return { error: result.error }
  }

  // --- POST-TRANSACTION: fire async notifications ---
  // These run after the dbTransaction has committed locally. They do not
  // block the checkout response and never throw to the caller.
  if (result.value.creditIsLowBalance && result.value.creditBalanceAfter !== null) {
    const rawThreshold = (user.systemConfigs as Record<string, unknown>)['CREDIT_LOW_BALANCE_THRESHOLD']
    const lowBalanceThreshold = typeof rawThreshold === 'number' ? rawThreshold : Number(rawThreshold ?? 10)
    // Fire-and-forget — notification failures must not break checkout
    NotificationEngine.sendCreditLowBalance(result.value.creditBalanceAfter, lowBalanceThreshold).catch(err =>
      console.warn('[createPosTransaction] Credit low-balance notification failed:', err),
    )
  }

  return {
    data: result.value,
  }
}

type CreatePosTransactionFn = typeof createPosTransaction
export type CreatePosTransactionResponse = Awaited<ReturnType<CreatePosTransactionFn>>
