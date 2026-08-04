/**
 * mock-collections.ts
 *
 * In-memory collection stubs that implement the minimal interface used by
 * create-pos-transaction and create-pos-order:
 *   col.has(id)          → boolean
 *   col.get(id)          → record | undefined
 *   col.insert(record)   → void
 *   col.insert(records[])→ void
 *   col.update(id, fn)   → void
 *   col.delete(id)       → void
 *   col.delete(ids[])    → void
 *   col.values()         → IterableIterator
 *
 * Usage in tests:
 *   vi.mock('@/db/collections', () => createMockCollections())
 */

import { vi } from 'vitest'

type AnyRecord = { id: string }

export function makeCollection<T extends AnyRecord>(name: string) {
  const store = new Map<string, T>()

  return {
    _name: name,
    _store: store,
    /** Reset all data between tests */
    _clear: () => store.clear(),

    has: vi.fn((id: string) => store.has(id)),
    get: vi.fn((id: string) => store.get(id) as T | undefined),

    insert: vi.fn((recordOrArray: T | T[]) => {
      const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]
      for (const r of records) store.set(r.id, r)
    }),

    update: vi.fn((id: string, fn: (draft: T) => void) => {
      const record = store.get(id)
      if (!record) throw new Error(`update: record ${id} not found in ${name}`)
      const draft = { ...record }
      fn(draft as T)
      store.set(id, draft as T)
    }),

    delete: vi.fn((idOrIds: string | string[]) => {
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds]
      for (const id of ids) store.delete(id)
    }),

    values: vi.fn(() => store.values()),
  }
}

/** Creates a fresh set of all collections used across create-pos-* queries */
export function createMockCollections() {
  return {
    orderCollection: makeCollection('order'),
    orderItemCollection: makeCollection('orderItem'),
    orderItemAddonCollection: makeCollection('orderItemAddon'),
    inventoryCollection: makeCollection('inventory'),
    inventoryMovementCollection: makeCollection('inventoryMovement'),
    transactionCollection: makeCollection('transaction'),
    transactionTaxLineCollection: makeCollection('transactionTaxLine'),
    paymentCollection: makeCollection('payment'),
    sequenceCounterCollection: makeCollection('sequenceCounter'),
    productVariantCollection: makeCollection('productVariant'),
    purchaseCollection: makeCollection('purchase'),
    purchaseItemCollection: makeCollection('purchaseItem'),
    // The rest are not used by these queries but need to be exported
    businessCollection: makeCollection('business'),
    branchCollection: makeCollection('branch'),
    categoryCollection: makeCollection('category'),
    unitCollection: makeCollection('unit'),
    productCollection: makeCollection('product'),
    productComponentCollection: makeCollection('productComponent'),
    userCollection: makeCollection('user'),
    locationCollection: makeCollection('location'),
    supplierCollection: makeCollection('supplier'),
    customerCollection: makeCollection('customer'),
    membershipCollection: makeCollection('membership'),
    sessionCollection: makeCollection('session'),
    notificationCollection: makeCollection('notification'),
    operationalTaskCollection: makeCollection('operationalTask'),
    vendorSessionCollection: makeCollection('vendorSession'),
    // Phase E — Receiving Domain
    goodsReceiptCollection: makeCollection('goodsReceipt'),
    goodsReceiptItemCollection: makeCollection('goodsReceiptItem'),
    // Phase F — Billing / Entitlement
    businessSubscriptionCollection: makeCollection('businessSubscription'),
    usageCounterCollection: makeCollection('usageCounter'),
    creditLedgerCollection: makeCollection('creditLedger'),
    featureCollection: makeCollection('feature'),
    featureDependencyCollection: makeCollection('featureDependency'),
    featureBundleCollection: makeCollection('featureBundle'),
  }
}

export type MockCollections = ReturnType<typeof createMockCollections>
