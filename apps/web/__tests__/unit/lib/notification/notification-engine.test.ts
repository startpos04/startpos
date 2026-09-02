/**
 * notification-engine.test.ts
 *
 * Tests for NotificationEngine — low stock detection and notification dispatch.
 *
 * Strategy:
 *  - All collections mocked via createMockCollections (same in-memory Map stubs
 *    used across the query tests).
 *  - dbTransaction mocked with a sync executor so NotificationEngine.send and
 *    operationalTaskCollection.insert are exercised synchronously.
 *  - authStore seeded via seedMockUser.
 *  - crypto.randomUUID stubbed to produce deterministic IDs.
 *
 * Coverage:
 *  send():
 *    - Inserts one notification record per receiverId
 *    - Sets correct userId, title, message, type, link on each record
 *    - Serialises metadata to JSON string
 *    - Sets isRead=false and priority=MEDIUM on all records
 *    - Stamps correct businessId and branchId from authStore
 *    - Handles empty receiverIds (no inserts)
 *
 *  checkLowStock():
 *    - Does nothing when variantIds is empty
 *    - Does nothing when inventory is above threshold
 *    - Creates operational task when stock <= variant.lowStockThreshold
 *    - Creates operational task when stock <= configuration LOW_STOCK_THRESHOLD (fallback)
 *    - Sends notifications to ADMIN and SUPERVISOR members only
 *    - Does NOT send notifications to CASHIER members
 *    - Does nothing when no admins/supervisors in membership
 *    - Sums inventory across multiple batches for the same variant
 *    - Ignores inventory batches with quantity=0
 *    - Operational task metadata contains variantId and currentTotal
 *    - Handles missing product on variant gracefully
 *    - Catches and logs errors without throwing
 *
 * Run with: pnpm test notification-engine
 */

import { ok } from 'neverthrow'
import {
  NotificationPriority,
  Role,
  TaskStatus,
  TaskType,
} from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeId,
  makeInventoryRecord,
  makePosProduct,
  makePosVariant,
  resetMockUser,
  seedMockUser,
} from '#tests/helpers'
import { createMockCollections } from '#tests/helpers/mock-collections'

// ---------------------------------------------------------------------------
// Mock: collections — inline factory, no outer variable reference
// ---------------------------------------------------------------------------

vi.mock('@/db/collections', async () => {
  const { createMockCollections } = await import('#tests/helpers/mock-collections')
  return createMockCollections()
})

// ---------------------------------------------------------------------------
// Mock: dbTransaction — sync executor returning Ok(result)
// ---------------------------------------------------------------------------

vi.mock('@/db/local-db-transaction', () => ({
  dbTransaction: vi.fn(async (callback: () => unknown) => {
    try {
      const result = callback()
      return ok(result)
    } catch (e) {
      const { err } = await import('neverthrow')
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }),
}))

// ---------------------------------------------------------------------------
// Mock: crypto.randomUUID — deterministic IDs
// ---------------------------------------------------------------------------

let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
})

// ---------------------------------------------------------------------------
// Post-mock import
// ---------------------------------------------------------------------------

import {
  inventoryCollection,
  membershipCollection,
  notificationCollection,
  operationalTaskCollection,
  productCollection,
  productVariantCollection,
} from '@/db/collections'
import { NotificationEngine } from '@/lib/notification/notification-engine'

// Typed references to the mocked collections
const inv = vi.mocked(inventoryCollection) as any
const members = vi.mocked(membershipCollection) as any
const notifications = vi.mocked(notificationCollection) as any
const tasks = vi.mocked(operationalTaskCollection) as any
const products = vi.mocked(productCollection) as any
const variants = vi.mocked(productVariantCollection) as any

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMembership(role: Role, overrides: Record<string, any> = {}) {
  return {
    id: makeId(),
    userId: makeId(),
    role,
    businessId: 'biz-test-001',
    branchId: 'branch-test-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeVariantWithInventory({
  quantity = 10,
  lowStockThreshold = null as number | null,
  productName = 'Americano',
  variantName = 'Regular',
} = {}) {
  const productId = makeId()
  const variantId = makeId()

  const product = makePosProduct({ id: productId, name: productName })
  const variant = {
    ...makePosVariant({ id: variantId, productId, name: variantName }),
    lowStockThreshold,
  }
  const invRecord = makeInventoryRecord({ variantId, quantity })

  products._store.set(productId, product as any)
  variants._store.set(variantId, variant as any)
  inv._store.set(invRecord.id, invRecord as any)

  return { productId, variantId, product, variant, inv: invRecord }
}

function seedAdmin(role: Role = Role.ADMIN) {
  const membership = makeMembership(role)
  members._store.set(membership.id, membership as any)
  return membership
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  seedMockUser()
  uuidCounter = 0
  // Clear all collection stores
  ;[inv, members, notifications, tasks, products, variants].forEach(col => {
    if (col._store instanceof Map) col._store.clear()
  })
  vi.clearAllMocks()
  // Re-stub UUID after clearAllMocks
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) })
})

afterEach(() => {
  resetMockUser()
})

// ---------------------------------------------------------------------------
// NotificationEngine.send
// ---------------------------------------------------------------------------

describe('NotificationEngine.send', () => {
  it('inserts one notification record per receiverId', async () => {
    const ids = [makeId(), makeId(), makeId()]
    await NotificationEngine.send(ids, {
      type: 'LOW_STOCK' as any,
      title: 'Low Stock',
      message: 'Item is low',
      link: '/tasks/t1',
    })
    expect(notifications.insert).toHaveBeenCalledOnce()
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted).toHaveLength(3)
  })

  it('sets correct userId on each notification', async () => {
    const receiverIds = [makeId(), makeId()]
    await NotificationEngine.send(receiverIds, {
      type: 'LOW_STOCK' as any,
      title: 'T',
      message: 'M',
      link: null,
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted.map((n: any) => n.userId)).toEqual(receiverIds)
  })

  it('sets title, message, type, and link correctly', async () => {
    const id = makeId()
    await NotificationEngine.send([id], {
      type: 'LOW_STOCK' as any,
      title: 'Low Stock Alert',
      message: 'Flour is low: 2 remaining',
      link: '/tasks/t99',
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0]).toMatchObject({
      title: 'Low Stock Alert',
      message: 'Flour is low: 2 remaining',
      type: 'LOW_STOCK',
      link: '/tasks/t99',
    })
  })

  it('serialises metadata to JSON string', async () => {
    const id = makeId()
    await NotificationEngine.send([id], {
      type: 'LOW_STOCK' as any,
      title: 'T',
      message: 'M',
      metadata: { variantId: 'v1', currentTotal: 3 },
      link: null,
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0].metadata).toBe('{"variantId":"v1","currentTotal":3}')
  })

  it('defaults metadata to "{}" when not provided', async () => {
    const id = makeId()
    await NotificationEngine.send([id], {
      type: 'LOW_STOCK' as any,
      title: 'T',
      message: 'M',
      link: null,
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0].metadata).toBe('{}')
  })

  it('sets isRead=false and priority=MEDIUM on all records', async () => {
    const id = makeId()
    await NotificationEngine.send([id], {
      type: 'LOW_STOCK' as any,
      title: 'T',
      message: 'M',
      link: null,
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0].isRead).toBe(false)
    expect(inserted[0].priority).toBe(NotificationPriority.MEDIUM)
  })

  it('stamps businessId and branchId from authStore', async () => {
    const id = makeId()
    await NotificationEngine.send([id], {
      type: 'LOW_STOCK' as any,
      title: 'T',
      message: 'M',
      link: null,
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0].businessId).toBe('biz-test-001')
    expect(inserted[0].branchId).toBe('branch-test-001')
  })

  it('handles empty receiverIds without inserting', async () => {
    await NotificationEngine.send([], {
      type: 'LOW_STOCK' as any,
      title: 'T',
      message: 'M',
      link: null,
    })
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// NotificationEngine.checkLowStock — no-op cases
// ---------------------------------------------------------------------------

describe('NotificationEngine.checkLowStock — no-op cases', () => {
  it('does nothing when variantIds is empty', async () => {
    await NotificationEngine.checkLowStock([])
    expect(tasks.insert).not.toHaveBeenCalled()
    expect(notifications.insert).not.toHaveBeenCalled()
  })

  it('does nothing when stock is above threshold', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 20, lowStockThreshold: 5 })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    expect(tasks.insert).not.toHaveBeenCalled()
  })

  it('does nothing when there are no admin or supervisor members', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 2, lowStockThreshold: 5 })
    // No members seeded
    await NotificationEngine.checkLowStock([variantId])
    expect(tasks.insert).not.toHaveBeenCalled()
    expect(notifications.insert).not.toHaveBeenCalled()
  })

  it('ignores inventory batches with quantity=0 in the stock sum', async () => {
    const productId = makeId()
    const variantId = makeId()
    const product = makePosProduct({ id: productId, name: 'Coffee' })
    const variant = { ...makePosVariant({ id: variantId, productId }), lowStockThreshold: 5 }

    // Two batches: one with qty=0, one with qty=10 — total is 10, above threshold
    const inv1 = makeInventoryRecord({ variantId, quantity: 0 })
    const inv2 = makeInventoryRecord({ variantId, quantity: 10 })

    products._store.set(productId, product as any)
    variants._store.set(variantId, variant as any)
    inv._store.set(inv1.id, inv1 as any)
    inv._store.set(inv2.id, inv2 as any)

    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    expect(tasks.insert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// NotificationEngine.checkLowStock — threshold breach
// ---------------------------------------------------------------------------

describe('NotificationEngine.checkLowStock — threshold breach', () => {
  it('creates an operational task when stock <= variant.lowStockThreshold', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 3, lowStockThreshold: 5 })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    expect(tasks.insert).toHaveBeenCalledOnce()
  })

  it('creates task when stock equals threshold exactly', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 5, lowStockThreshold: 5 })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    expect(tasks.insert).toHaveBeenCalledOnce()
  })

  it('falls back to configuration LOW_STOCK_THRESHOLD when variant has no threshold', async () => {
    // seedMockUser sets LOW_STOCK_THRESHOLD — check what value it uses
    // makePosVariant sets lowStockThreshold=null → falls back to configuration
    const { variantId } = makeVariantWithInventory({ quantity: 1, lowStockThreshold: null })
    seedAdmin()
    // seedMockUser configuration LOW_STOCK_THRESHOLD = 10 (default in helpers)
    // quantity=1 <= 10 → should trigger
    await NotificationEngine.checkLowStock([variantId])
    expect(tasks.insert).toHaveBeenCalledOnce()
  })

  it('sets SHELF_REFILL task type and IN_PROGRESS status (auto-approved by default)', async () => {
    // InventoryEngine.handleLowStockDetected defaults autoApproveLowStockRefill=true,
    // so auto-generated SHELF_REFILL tasks enter IN_PROGRESS immediately.
    // PENDING status requires AUTO_APPROVE_LOW_STOCK_REFILL=false in configuration.
    const { variantId } = makeVariantWithInventory({ quantity: 2, lowStockThreshold: 5 })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    const task = tasks.insert.mock.calls[0]![0] as any
    expect(task.type).toBe(TaskType.SHELF_REFILL)
    expect(task.status).toBe(TaskStatus.IN_PROGRESS)
  })

  it('task metadata contains variantId and currentTotal', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 2, lowStockThreshold: 5 })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    const task = tasks.insert.mock.calls[0]![0] as any
    expect(task.metadata.variantId).toBe(variantId)
    expect(task.metadata.currentTotal).toBe(2)
  })

  it('sums inventory across multiple batches for the same variant', async () => {
    const productId = makeId()
    const variantId = makeId()
    const product = makePosProduct({ id: productId, name: 'Flour' })
    const variant = { ...makePosVariant({ id: variantId, productId }), lowStockThreshold: 10 }

    // Three batches: 2 + 3 + 4 = 9, below threshold of 10 → triggers
    const inv1 = makeInventoryRecord({ variantId, quantity: 2 })
    const inv2 = makeInventoryRecord({ variantId, quantity: 3 })
    const inv3 = makeInventoryRecord({ variantId, quantity: 4 })

    products._store.set(productId, product as any)
    variants._store.set(variantId, variant as any)
    inv._store.set(inv1.id, inv1 as any)
    inv._store.set(inv2.id, inv2 as any)
    inv._store.set(inv3.id, inv3 as any)

    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])

    const task = tasks.insert.mock.calls[0]![0] as any
    expect(task.metadata.currentTotal).toBe(9) // 2+3+4
  })
})

// ---------------------------------------------------------------------------
// NotificationEngine.checkLowStock — notification targeting
// ---------------------------------------------------------------------------

describe('NotificationEngine.checkLowStock — notification targeting', () => {
  it('sends notifications to ADMIN members', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 1, lowStockThreshold: 5 })
    const admin = seedAdmin(Role.ADMIN)
    await NotificationEngine.checkLowStock([variantId])
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted.map((n: any) => n.userId)).toContain(admin.id)
  })

  it('sends notifications to SUPERVISOR members', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 1, lowStockThreshold: 5 })
    const supervisor = seedAdmin(Role.SUPERVISOR)
    await NotificationEngine.checkLowStock([variantId])
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted.map((n: any) => n.userId)).toContain(supervisor.id)
  })

  it('does NOT send notifications to CASHIER members', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 1, lowStockThreshold: 5 })
    seedAdmin(Role.ADMIN) // need at least one admin so it doesn't early-return
    const cashier = makeMembership(Role.CASHIER)
    members._store.set(cashier.id, cashier as any)

    await NotificationEngine.checkLowStock([variantId])
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted.map((n: any) => n.userId)).not.toContain(cashier.id)
  })

  it('notification title is "Low Stock Alert"', async () => {
    const { variantId } = makeVariantWithInventory({ quantity: 1, lowStockThreshold: 5 })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0].title).toBe('Low Stock Alert')
  })

  it('notification message contains product name and current total', async () => {
    const { variantId } = makeVariantWithInventory({
      quantity: 2,
      lowStockThreshold: 5,
      productName: 'Espresso Beans',
      variantName: '1kg Bag',
    })
    seedAdmin()
    await NotificationEngine.checkLowStock([variantId])
    const inserted = notifications.insert.mock.calls[0]![0] as any[]
    expect(inserted[0].message).toContain('Espresso Beans')
    expect(inserted[0].message).toContain('2')
  })

  it('handles missing product on variant gracefully', async () => {
    const variantId = makeId()
    const variant = { ...makePosVariant({ id: variantId, productId: makeId() }), lowStockThreshold: 5 }
    const invRecord = makeInventoryRecord({ variantId, quantity: 1 })

    // product NOT seeded in productCollection
    variants._store.set(variantId, variant as any)
    inv._store.set(invRecord.id, invRecord as any)
    seedAdmin()

    // Should not throw
    await expect(NotificationEngine.checkLowStock([variantId])).resolves.not.toThrow()
    expect(tasks.insert).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// NotificationEngine.checkLowStock — error handling
// ---------------------------------------------------------------------------

describe('NotificationEngine.checkLowStock — error handling', () => {
  it('catches errors and does not throw to the caller', async () => {
    // Force an error by making inventoryCollection.values throw
    vi.spyOn(inv as any, 'values').mockImplementationOnce(() => {
      throw new Error('collection error')
    })
    await expect(NotificationEngine.checkLowStock([makeId()])).resolves.not.toThrow()
  })
})
