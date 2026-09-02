/**
 * collections.test.ts
 *
 * Verifies that each named collection in collections.ts is initialised with
 * the correct apiKey and syncMode.
 *
 * Strategy:
 *  - Mock createSyncableCollection (from '@/db/index') to capture the options
 *    passed for each collection and return a stub.
 *  - Import collections.ts after the mock is set up so the module runs with
 *    our spy in place.
 *  - Assert apiKey, syncMode for a representative set of collections covering
 *    both 'eager' (master data) and 'on-demand' (transactional data) groups.
 *
 * Coverage:
 *  - Eager collections: business, branch, category, unit, product,
 *    productVariant, productComponent, sequenceCounter, user,
 *    location, supplier, customer
 *  - On-demand collections: membership, session, inventory,
 *    inventoryMovement, transaction, transactionTaxLine, payment,
 *    order, orderItem, orderItemAddon, purchase, purchaseItem,
 *    notification, operationalTask, vendorSession,
 *    goodsReceipt, goodsReceiptItem (Phase E)
 *  - All collections use SCHEMA_VERSION = 11 (bumped in Phase E)
 *
 * Run with: pnpm test collections
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: @/db/index — capture createSyncableCollection calls
// ---------------------------------------------------------------------------

const capturedCalls = new Map<string, { apiKey: string; syncMode: string; schemaVersion: number }>()

vi.mock('@/db/index', () => ({
  persistence: null,
  createSyncableCollection: vi.fn((opts: { apiKey: string; syncMode: string; schemaVersion: number }) => {
    capturedCalls.set(opts.apiKey, opts)
    // Return a minimal stub that satisfies any downstream type checks
    return { id: opts.apiKey, _stub: true }
  }),
}))

// ---------------------------------------------------------------------------
// Post-mock import — runs collections.ts which calls createSyncableCollection
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Dynamic import ensures the mock is in place before the module executes
  await import('@/db/collections')
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function assertCollection(apiKey: string, expectedSyncMode: 'eager' | 'on-demand') {
  const opts = capturedCalls.get(apiKey)
  expect(opts, `Missing collection: ${apiKey}`).toBeDefined()
  expect(opts!.syncMode).toBe(expectedSyncMode)
  // Phase F reset SCHEMA_VERSION to 2 (billing collections added, fresh migration)
  expect(opts!.schemaVersion).toBe(2)
}

// ---------------------------------------------------------------------------
// Eager collections — master / reference data synced immediately
// ---------------------------------------------------------------------------

describe('collections — eager syncMode (master data)', () => {
  it('businessCollection has apiKey="business" and syncMode="eager"', () => {
    assertCollection('business', 'eager')
  })

  it('branchCollection has apiKey="branch" and syncMode="eager"', () => {
    assertCollection('branch', 'eager')
  })

  it('categoryCollection has apiKey="category" and syncMode="eager"', () => {
    assertCollection('category', 'eager')
  })

  it('unitCollection has apiKey="unit" and syncMode="eager"', () => {
    assertCollection('unit', 'eager')
  })

  it('productCollection has apiKey="product" and syncMode="eager"', () => {
    assertCollection('product', 'eager')
  })

  it('productVariantCollection has apiKey="productVariant" and syncMode="eager"', () => {
    assertCollection('productVariant', 'eager')
  })

  it('productComponentCollection has apiKey="productComponent" and syncMode="eager"', () => {
    assertCollection('productComponent', 'eager')
  })

  it('sequenceCounterCollection has apiKey="sequenceCounter" and syncMode="eager"', () => {
    assertCollection('sequenceCounter', 'eager')
  })

  it('userCollection has apiKey="user" and syncMode="eager"', () => {
    assertCollection('user', 'eager')
  })

  it('locationCollection has apiKey="location" and syncMode="eager"', () => {
    assertCollection('location', 'eager')
  })

  it('supplierCollection has apiKey="supplier" and syncMode="eager"', () => {
    assertCollection('supplier', 'eager')
  })

  it('customerCollection has apiKey="customer" and syncMode="eager"', () => {
    assertCollection('customer', 'eager')
  })

  // Phase F — Billing collections (eager: needed at session load for entitlement)
  it('businessSubscriptionCollection has apiKey="businessSubscription" and syncMode="eager"', () => {
    assertCollection('businessSubscription', 'eager')
  })

  it('usageCounterCollection has apiKey="usageCounter" and syncMode="eager"', () => {
    assertCollection('usageCounter', 'eager')
  })

  it('featureCollection has apiKey="feature" and syncMode="eager"', () => {
    assertCollection('feature', 'eager')
  })
})

// ---------------------------------------------------------------------------
// On-demand collections — transactional / operational data
// ---------------------------------------------------------------------------

describe('collections — on-demand syncMode (transactional data)', () => {
  it('membershipCollection has apiKey="membership" and syncMode="on-demand"', () => {
    assertCollection('membership', 'on-demand')
  })

  it('sessionCollection has apiKey="session" and syncMode="on-demand"', () => {
    assertCollection('session', 'on-demand')
  })

  it('inventoryCollection has apiKey="inventory" and syncMode="on-demand"', () => {
    assertCollection('inventory', 'on-demand')
  })

  it('inventoryMovementCollection has apiKey="inventoryMovement" and syncMode="on-demand"', () => {
    assertCollection('inventoryMovement', 'on-demand')
  })

  it('transactionCollection has apiKey="transaction" and syncMode="on-demand"', () => {
    assertCollection('transaction', 'on-demand')
  })

  it('transactionTaxLineCollection has apiKey="transactionTaxLine" and syncMode="on-demand"', () => {
    assertCollection('transactionTaxLine', 'on-demand')
  })

  it('paymentCollection has apiKey="payment" and syncMode="on-demand"', () => {
    assertCollection('payment', 'on-demand')
  })

  it('orderCollection has apiKey="order" and syncMode="on-demand"', () => {
    assertCollection('order', 'on-demand')
  })

  it('orderItemCollection has apiKey="orderItem" and syncMode="on-demand"', () => {
    assertCollection('orderItem', 'on-demand')
  })

  it('orderItemAddonCollection has apiKey="orderItemAddon" and syncMode="on-demand"', () => {
    assertCollection('orderItemAddon', 'on-demand')
  })

  it('purchaseCollection has apiKey="purchase" and syncMode="on-demand"', () => {
    assertCollection('purchase', 'on-demand')
  })

  it('purchaseItemCollection has apiKey="purchaseItem" and syncMode="on-demand"', () => {
    assertCollection('purchaseItem', 'on-demand')
  })

  it('notificationCollection has apiKey="notification" and syncMode="on-demand"', () => {
    assertCollection('notification', 'on-demand')
  })

  it('operationalTaskCollection has apiKey="operationalTask" and syncMode="on-demand"', () => {
    assertCollection('operationalTask', 'on-demand')
  })

  it('vendorSessionCollection has apiKey="vendorSession" and syncMode="on-demand"', () => {
    assertCollection('vendorSession', 'on-demand')
  })

  // Phase E — Receiving Domain
  it('goodsReceiptCollection has apiKey="goodsReceipt" and syncMode="on-demand"', () => {
    assertCollection('goodsReceipt', 'on-demand')
  })

  it('goodsReceiptItemCollection has apiKey="goodsReceiptItem" and syncMode="on-demand"', () => {
    assertCollection('goodsReceiptItem', 'on-demand')
  })

  // Phase F — Billing / Entitlement (on-demand)
  it('creditLedgerCollection has apiKey="creditLedger" and syncMode="on-demand"', () => {
    assertCollection('creditLedger', 'on-demand')
  })

  it('featureDependencyCollection has apiKey="featureDependency" and syncMode="on-demand"', () => {
    assertCollection('featureDependency', 'on-demand')
  })

  it('featureBundleCollection has apiKey="featureBundle" and syncMode="on-demand"', () => {
    assertCollection('featureBundle', 'on-demand')
  })
})

// ---------------------------------------------------------------------------
// Total collection count
// ---------------------------------------------------------------------------

describe('collections — completeness', () => {
  // Source has 35 collections after Phase F billing additions:
  // Eager (15): business, branch, category, unit, product, productVariant, productComponent,
  //             sequenceCounter, user, location, supplier, customer,
  //             businessSubscription, usageCounter, feature
  // On-demand (20): creditLedger, membership, session, inventory, inventoryMovement,
  //                 transaction, transactionTaxLine, payment, order, orderItem,
  //                 orderItemAddon, purchase, purchaseItem, notification, operationalTask,
  //                 vendorSession, goodsReceipt, goodsReceiptItem,
  //                 featureDependency, featureBundle
  it('registers exactly 35 collections', () => {
    expect(capturedCalls.size).toBe(35)
  })
})
