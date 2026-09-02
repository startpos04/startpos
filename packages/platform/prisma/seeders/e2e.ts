// fallow-ignore-file unused-file
/**
 * E2E-specific seeder — runs AFTER the standard CSV pipeline (order 200).
 *
 * All seed data lives in CSV files under prisma/seeders/csv/e2e/.
 * This file contains only parsing logic and DB upsert loops — no hardcoded
 * data arrays. To change what gets seeded, edit the CSV files.
 *
 * CSV files consumed (in load order):
 *   product-states.csv    → isAvailable overrides
 *   inventory.csv         → deterministic stock batches + IN movements
 *   vendor-sessions.csv   → OPEN + CLOSED sessions (backed by tasks.csv tasks)
 *   orders.csv            → active and historical orders
 *   order-items.csv       → line items for every order
 *   transactions.csv      → completed sale records
 *   payments.csv          → payment splits per transaction
 *   tasks.csv             → operational tasks (all lifecycle statuses)
 *   notifications.csv     → per-user notification inbox entries
 *   purchases.csv         → purchase headers
 *   purchase-items.csv    → purchase line items + inventory IN movements
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import {
  MovementType,
  type NotificationType,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type SessionStatus,
  type TaskStatus,
  type TaskType,
  type TransactionType,
} from 'prisma/generated/prisma/client'
import { getAccounts } from './accounts'

export const order = 200

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(__dirname, 'csv', 'e2e')

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Parse a required CSV — throws if file is missing or headers are wrong. */
// biome-ignore lint/suspicious/noExplicitAny: seeder utility
function parseCsv<T = any>(fileName: string, requiredHeaders: string[] = []): T[] {
  const filePath = path.join(CSV_DIR, fileName)
  if (!fs.existsSync(filePath)) {
    throw new Error(`[E2E Seeder] Missing required CSV: csv/e2e/${fileName}`)
  }
  const { data, meta } = Papa.parse(fs.readFileSync(filePath, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  })
  const missing = requiredHeaders.filter(h => !meta.fields?.includes(h))
  if (missing.length > 0) {
    throw new Error(`[E2E Seeder] ${fileName} is missing columns: [${missing.join(', ')}]`)
  }
  return data as T[]
}

/** Convert a signed hour-offset string like "-2" or "+24" to a Date. */
function offsetDate(hoursRaw: string | undefined | null): Date | null {
  if (!hoursRaw || hoursRaw.trim() === '') return null
  const hrs = parseFloat(hoursRaw.trim())
  return new Date(Date.now() + hrs * 60 * 60 * 1000)
}

/** Parse "TRUE"/"FALSE"/"true"/"false"/"1"/"0" → boolean. */
function parseBool(v: string | undefined | null): boolean {
  return (
    String(v ?? '')
      .trim()
      .toLowerCase() === 'true' || v === '1'
  )
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

export async function seedE2EData(prisma: PrismaClient) {
  console.info('\n🧪 [E2E Seeder] Starting CSV-driven E2E data injection...')

  const accounts = getAccounts('e2e')
  const B1 = accounts.business.id
  const BR1 = accounts.branch.id

  await seedProductStates(prisma, B1)
  await seedInventory(prisma, B1, BR1)
  await seedTasks(prisma, B1, BR1)
  await seedVendorSessions(prisma, B1, BR1)
  await seedOrders(prisma, B1, BR1)
  await seedOrderItems(prisma, B1, BR1)
  await seedTransactions(prisma, B1, BR1)
  await seedPayments(prisma, B1, BR1)
  await seedNotifications(prisma, B1, BR1)
  await seedPurchases(prisma, B1, BR1)

  console.info('✅ [E2E Seeder] All E2E data injected successfully.')
}

export default seedE2EData

// ---------------------------------------------------------------------------
// 1. PRODUCT STATE OVERRIDES
//    Sets isAvailable on products that need a non-default state.
//    Source: product-states.csv  (columns: productId, isAvailable)
// ---------------------------------------------------------------------------

async function seedProductStates(prisma: PrismaClient, _B1: string) {
  console.info('  📦 [E2E] Patching product availability states...')

  const rows = parseCsv('product-states.csv', ['productId', 'isAvailable'])
  for (const row of rows) {
    await prisma.product.update({
      where: { id: row.productId.trim() },
      data: { isAvailable: parseBool(row.isAvailable) },
    })
  }
}

// ---------------------------------------------------------------------------
// 2. INVENTORY BATCHES
//    Creates one Inventory record + one IN InventoryMovement per row.
//    qty=0 rows get the record but no movement (nothing moved in).
//    Source: inventory.csv
//      (columns: id, variantId, quantity, unitAbbreviation,
//                batchNumber, costPrice, locationName)
// ---------------------------------------------------------------------------

async function seedInventory(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  📦 [E2E] Seeding deterministic inventory batches...')

  const rows = parseCsv('inventory.csv', ['id', 'variantId', 'quantity', 'unitAbbreviation', 'batchNumber', 'costPrice'])

  // Resolve the admin user once for movement attribution
  const adminUser = await prisma.user.findFirst({
    where: { memberships: { some: { businessId: B1, branchId: BR1 } }, role: 'ADMIN' },
  })
  if (!adminUser) throw new Error('[E2E Seeder] No ADMIN user found for branch — run accounts seeder first.')

  for (const row of rows) {
    const unitAbbr = row.unitAbbreviation.trim()
    const unit = await prisma.unit.findFirst({ where: { abbreviation: unitAbbr, businessId: B1 } })
    if (!unit) {
      console.warn(`  ⚠️  Skipping inventory row ${row.id}: unit "${unitAbbr}" not found.`)
      continue
    }

    // Resolve optional location
    const locationName = row.locationName?.trim() || null
    let locationId: string | null = null
    if (locationName) {
      const loc = await prisma.location.findFirst({ where: { name: locationName, branchId: BR1 } })
      locationId = loc?.id ?? null
    }

    const qty = parseFloat(row.quantity) || 0
    const cost = parseInt(row.costPrice, 10) || 0
    const batchNum = row.batchNumber.trim()
    const id = row.id.trim()
    const variantId = row.variantId.trim()

    await prisma.inventory.upsert({
      where: { id },
      update: { quantity: qty, costPrice: cost, batchNumber: batchNum, locationId },
      create: { id, variantId, unitId: unit.id, quantity: qty, costPrice: cost, batchNumber: batchNum, locationId, businessId: B1, branchId: BR1 },
    })

    if (qty > 0) {
      await prisma.inventoryMovement.upsert({
        where: { id: `mov-${id}` },
        update: {},
        create: {
          id: `mov-${id}`,
          variantId,
          userId: adminUser.id,
          type: MovementType.IN,
          quantity: qty,
          unitId: unit.id,
          inventoryId: id,
          reason: 'E2E Initial Stock',
          businessId: B1,
          branchId: BR1,
        },
      })
    }
  }
}

// ---------------------------------------------------------------------------
// 3. OPERATIONAL TASKS
//    Must run before vendor sessions and purchases (they reference task IDs).
//    Timestamp columns are signed hour offsets from now: "-2" = 2 hrs ago,
//    "+24" = 24 hrs from now, "" = null.
//    Source: tasks.csv
//      (columns: id, type, status, notes, creatorId, approverId, clerkId,
//                reviewerId, cancelerId, dueDateOffsetHrs,
//                approvedAtOffsetHrs, inProgressAtOffsetHrs,
//                fulfilledAtOffsetHrs, reviewedAtOffsetHrs, canceledAtOffsetHrs)
// ---------------------------------------------------------------------------

async function seedTasks(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  📋 [E2E] Seeding operational tasks...')

  const rows = parseCsv('tasks.csv', ['id', 'type', 'status', 'creatorId', 'approverId', 'clerkId'])

  for (const row of rows) {
    const dueDate = offsetDate(row.dueDateOffsetHrs) ?? new Date()

    await prisma.operationalTask.upsert({
      where: { id: row.id.trim() },
      update: { status: row.status.trim() as TaskStatus, notes: row.notes?.trim() ?? null },
      create: {
        id: row.id.trim(),
        type: row.type.trim() as TaskType,
        status: row.status.trim() as TaskStatus,
        notes: row.notes?.trim() ?? null,
        dueDate,
        creatorId: row.creatorId.trim(),
        approverId: row.approverId.trim(),
        clerkId: row.clerkId.trim(),
        reviewerId: row.reviewerId?.trim() || null,
        cancelerId: row.cancelerId?.trim() || null,
        metadata: {},
        approvedAt: offsetDate(row.approvedAtOffsetHrs),
        inProgressAt: offsetDate(row.inProgressAtOffsetHrs),
        fulfilledAt: offsetDate(row.fulfilledAtOffsetHrs),
        reviewedAt: offsetDate(row.reviewedAtOffsetHrs),
        canceledAt: offsetDate(row.canceledAtOffsetHrs),
        businessId: B1,
        branchId: BR1,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 4. VENDOR SESSIONS
//    OPEN session → POS tests proceed without manual session open.
//    CLOSED + verifiedCash=null → triggers AlertPrompt on next login.
//    Source: vendor-sessions.csv
//      (columns: id, userId, status, openingCash, closingCash, expectedCash,
//                verifiedCash, startTimeOffsetHrs, endTimeOffsetHrs,
//                operationalTaskId)
// ---------------------------------------------------------------------------

async function seedVendorSessions(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  🏪 [E2E] Seeding vendor sessions...')

  const rows = parseCsv('vendor-sessions.csv', ['id', 'userId', 'status', 'openingCash', 'operationalTaskId'])

  for (const row of rows) {
    const id = row.id.trim()
    const status = row.status.trim() as SessionStatus
    const startTime = offsetDate(row.startTimeOffsetHrs) ?? new Date()
    const endTime = offsetDate(row.endTimeOffsetHrs)

    // verifiedCash: empty string in CSV means null (unverified)
    const verifiedCash = row.verifiedCash?.trim() !== '' && row.verifiedCash != null ? parseInt(row.verifiedCash, 10) : null

    await prisma.vendorSession.upsert({
      where: { id },
      update: { status },
      create: {
        id,
        userId: row.userId.trim(),
        status,
        openingCash: parseInt(row.openingCash, 10) || 0,
        closingCash: row.closingCash?.trim() ? parseInt(row.closingCash, 10) : null,
        expectedCash: row.expectedCash?.trim() ? parseInt(row.expectedCash, 10) : null,
        verifiedCash,
        startTime,
        endTime,
        operationalTaskId: row.operationalTaskId.trim(),
        businessId: B1,
        branchId: BR1,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 5. ORDERS
//    Source: orders.csv
//      (columns: id, orderNumber, status, orderType, customerReference, hoursAgo)
//    hoursAgo: how many hours in the past to timestamp the order (0 = now).
// ---------------------------------------------------------------------------

async function seedOrders(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  🛒 [E2E] Seeding orders...')

  const rows = parseCsv('orders.csv', ['id', 'orderNumber', 'status', 'orderType', 'customerReference'])

  for (const row of rows) {
    const hoursAgo = parseFloat(row.hoursAgo) || 0
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

    await prisma.order.upsert({
      where: { id: row.id.trim() },
      update: {},
      create: {
        id: row.id.trim(),
        orderNumber: row.orderNumber.trim(),
        status: row.status.trim() as OrderStatus,
        orderType: row.orderType.trim() as OrderType,
        customerReference: row.customerReference?.trim() || null,
        businessId: B1,
        branchId: BR1,
        createdAt,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 6. ORDER ITEMS
//    Source: order-items.csv
//      (columns: id, orderId, variantId, quantity, unitPrice, unitCost,
//                unitAbbreviation)
// ---------------------------------------------------------------------------

async function seedOrderItems(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  🛒 [E2E] Seeding order items...')

  const rows = parseCsv('order-items.csv', ['id', 'orderId', 'variantId', 'quantity', 'unitPrice', 'unitCost', 'unitAbbreviation'])

  for (const row of rows) {
    const unit = await prisma.unit.findFirst({ where: { abbreviation: row.unitAbbreviation.trim(), businessId: B1 } })
    if (!unit) {
      console.warn(`  ⚠️  Skipping order-item ${row.id}: unit "${row.unitAbbreviation}" not found.`)
      continue
    }

    // Inherit createdAt from the parent order
    const parentOrder = await prisma.order.findUnique({ where: { id: row.orderId.trim() } })

    await prisma.orderItem.upsert({
      where: { id: row.id.trim() },
      update: {},
      create: {
        id: row.id.trim(),
        orderId: row.orderId.trim(),
        variantId: row.variantId.trim(),
        quantity: parseFloat(row.quantity) || 1,
        unitPrice: parseInt(row.unitPrice, 10) || 0,
        unitCost: parseInt(row.unitCost, 10) || 0,
        unitId: unit.id,
        businessId: B1,
        branchId: BR1,
        createdAt: parentOrder?.createdAt ?? new Date(),
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 7. TRANSACTIONS
//    complianceData is assembled from the CSV columns — no JSON blobs in CSV.
//    taxAmount is read directly from CSV (pre-computed: round(total*12/112)).
//    Source: transactions.csv
//      (columns: id, invoiceNo, orderId, cashierId, type, totalAmount,
//                totalCost, taxAmount, bufferRate, priceConfiguration,
//                invoiceType, ptuNumber, ptuIssuedAt)
// ---------------------------------------------------------------------------

async function seedTransactions(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  💸 [E2E] Seeding historical transactions...')

  const rows = parseCsv('transactions.csv', [
    'id',
    'invoiceNo',
    'orderId',
    'cashierId',
    'type',
    'totalAmount',
    'totalCost',
    'taxAmount',
    'bufferRate',
    'priceConfiguration',
    'invoiceType',
    'ptuNumber',
    'ptuIssuedAt',
  ])

  for (const row of rows) {
    const totalAmount = parseInt(row.totalAmount, 10) || 0
    const taxAmount = parseInt(row.taxAmount, 10) || 0
    const totalCost = parseInt(row.totalCost, 10) || 0

    // Inherit createdAt from parent order
    const parentOrder = await prisma.order.findUnique({ where: { id: row.orderId.trim() } })

    await prisma.transaction.upsert({
      where: { id: row.id.trim() },
      update: {},
      create: {
        id: row.id.trim(),
        invoiceNo: row.invoiceNo.trim(),
        orderId: row.orderId.trim(),
        cashierId: row.cashierId.trim(),
        type: row.type.trim() as TransactionType,
        totalAmount,
        totalCost,
        taxAmount,
        snapshotBufferRate: parseInt(row.bufferRate, 10) || 20,
        priceConfiguration: row.priceConfiguration?.trim() || 'INCLUSIVE',
        invoiceType: row.invoiceType?.trim() || 'SALES_INVOICE',
        complianceData: {
          ptuNumber: row.ptuNumber?.trim() || null,
          ptuIssuedAt: row.ptuIssuedAt?.trim() || null,
          vatableSales: totalAmount - taxAmount,
          vatAmount: taxAmount,
          vatExemptSales: 0,
          zeroRatedSales: 0,
          scPwdName: null,
          scPwdIdNumber: null,
          scPwdDiscount: 0,
        },
        businessId: B1,
        branchId: BR1,
        createdAt: parentOrder?.createdAt ?? new Date(),
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 8. PAYMENTS
//    Source: payments.csv
//      (columns: id, transactionId, method, amount, tendered, change)
// ---------------------------------------------------------------------------

async function seedPayments(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  💳 [E2E] Seeding payments...')

  const rows = parseCsv('payments.csv', ['id', 'transactionId', 'method', 'amount', 'tendered', 'change'])

  for (const row of rows) {
    const txn = await prisma.transaction.findUnique({ where: { id: row.transactionId.trim() } })

    await prisma.payment.upsert({
      where: { id: row.id.trim() },
      update: {},
      create: {
        id: row.id.trim(),
        transactionId: row.transactionId.trim(),
        method: row.method.trim() as PaymentMethod,
        amount: parseInt(row.amount, 10) || 0,
        tendered: parseInt(row.tendered, 10) || 0,
        change: parseInt(row.change, 10) || 0,
        businessId: B1,
        branchId: BR1,
        createdAt: txn?.createdAt ?? new Date(),
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 9. NOTIFICATIONS
//    hoursAgo column: how many hours in the past to timestamp the record.
//    Source: notifications.csv
//      (columns: id, userId, type, title, message, isRead, link, hoursAgo)
// ---------------------------------------------------------------------------

async function seedNotifications(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  🔔 [E2E] Seeding notifications...')

  const rows = parseCsv('notifications.csv', ['id', 'userId', 'type', 'title', 'message', 'isRead'])

  for (const row of rows) {
    const hoursAgo = parseFloat(row.hoursAgo) || 0
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

    await prisma.notification.upsert({
      where: { id: row.id.trim() },
      update: { isRead: parseBool(row.isRead) },
      create: {
        id: row.id.trim(),
        userId: row.userId.trim(),
        type: row.type.trim() as NotificationType,
        title: row.title.trim(),
        message: row.message.trim(),
        isRead: parseBool(row.isRead),
        link: row.link?.trim() || null,
        metadata: {},
        businessId: B1,
        branchId: BR1,
        createdAt,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// 10. PURCHASES + PURCHASE ITEMS
//     Each purchase item also gets an IN InventoryMovement so the movement
//     log shows the supplier receipt.
//     Sources:
//       purchases.csv      (columns: id, purchaseId, totalCost, notes, supplierName, operationalTaskId)
//       purchase-items.csv (columns: id, purchaseId, variantId, quantity, unitAbbreviation, unitCost)
// ---------------------------------------------------------------------------

async function seedPurchases(prisma: PrismaClient, B1: string, BR1: string) {
  console.info('  🛒 [E2E] Seeding purchases and purchase items...')

  const adminUser = await prisma.user.findFirst({
    where: { memberships: { some: { businessId: B1, branchId: BR1 } }, role: 'ADMIN' },
  })
  if (!adminUser) throw new Error('[E2E Seeder] No ADMIN user found — run accounts seeder first.')

  // ── Purchase headers ──────────────────────────────────────────────────────
  const purchaseRows = parseCsv('purchases.csv', ['id', 'purchaseId', 'totalCost', 'supplierName', 'operationalTaskId'])

  for (const row of purchaseRows) {
    const supplier = await prisma.supplier.findFirst({
      where: { name: row.supplierName.trim(), businessId: B1 },
    })

    await prisma.purchase.upsert({
      where: { id: row.id.trim() },
      update: {},
      create: {
        id: row.id.trim(),
        purchaseId: row.purchaseId.trim(),
        totalCost: parseInt(row.totalCost, 10) || 0,
        notes: row.notes?.trim() || null,
        supplierId: supplier?.id ?? null,
        operationalTaskId: row.operationalTaskId.trim(),
        businessId: B1,
        branchId: BR1,
      },
    })
  }

  // ── Purchase line items + inventory movements ─────────────────────────────
  const itemRows = parseCsv('purchase-items.csv', ['id', 'purchaseId', 'variantId', 'quantity', 'unitAbbreviation', 'unitCost'])

  for (const row of itemRows) {
    const unit = await prisma.unit.findFirst({ where: { abbreviation: row.unitAbbreviation.trim(), businessId: B1 } })
    if (!unit) {
      console.warn(`  ⚠️  Skipping purchase-item ${row.id}: unit "${row.unitAbbreviation}" not found.`)
      continue
    }

    await prisma.purchaseItem.upsert({
      where: { id: row.id.trim() },
      update: {},
      create: {
        id: row.id.trim(),
        purchaseId: row.purchaseId.trim(),
        variantId: row.variantId.trim(),
        quantity: parseFloat(row.quantity) || 1,
        unitId: unit.id,
        unitCost: parseInt(row.unitCost, 10) || 0,
        businessId: B1,
        branchId: BR1,
      },
    })

    // Attach an IN movement so the inventory report shows supplier receipts
    const invRecord = await prisma.inventory.findFirst({
      where: { variantId: row.variantId.trim(), branchId: BR1 },
    })

    if (invRecord) {
      const movId = `mov-po-${row.id.trim()}`
      await prisma.inventoryMovement.upsert({
        where: { id: movId },
        update: {},
        create: {
          id: movId,
          variantId: row.variantId.trim(),
          userId: adminUser.id,
          type: MovementType.IN,
          quantity: parseFloat(row.quantity) || 1,
          unitId: unit.id,
          inventoryId: invRecord.id,
          purchaseId: row.purchaseId.trim(),
          reason: `Purchase receipt`,
          businessId: B1,
          branchId: BR1,
        },
      })
    }
  }
}
