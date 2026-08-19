// fallow-ignore-file unused-file
/**
 * transaction.ts — Historical transaction seeder (CSV-driven)
 *
 * Reads from csv/<folder>/transactions.csv and related files to seed
 * deterministic transaction history. If no CSV files are present, the seeder
 * is skipped — faker-based random seeding does not belong in this pipeline.
 *
 * CSV files consumed (must all be present or all absent):
 *   orders.csv           — order headers
 *   order-items.csv      — line items per order
 *   transactions.csv     — completed transaction records
 *   payments.csv         — payment splits per transaction
 *
 * This mirrors the e2e.ts approach but is foldered under csv/<folder>/ so
 * each seed target (examples/, e2e/, client/) can have its own history.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: seeder */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { OrderStatus, OrderType, PaymentMethod, PrismaClient, TransactionType } from 'prisma/generated/prisma/client'
import { getAccounts } from './accounts'

export const order = 10000

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(__dirname, 'csv')

function parseCsvOptional<T = any>(folder: string, fileName: string, requiredHeaders: string[] = []): T[] | null {
  const filePath = path.join(CSV_DIR, folder, fileName)
  if (!fs.existsSync(filePath)) return null

  const { data, meta } = Papa.parse(fs.readFileSync(filePath, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  })

  const missing = requiredHeaders.filter(h => !meta.fields?.includes(h))
  if (missing.length > 0) {
    throw new Error(`❌ ${fileName} missing columns: [${missing.join(', ')}]`)
  }

  return data as T[]
}

export async function seedHistoricalTransactions(prisma: PrismaClient, options: { folder: string }) {
  const targetFolder = options.folder || 'examples'
  const accounts = getAccounts(targetFolder)
  const B1 = accounts.business.id
  const BR1 = accounts.branch.id

  // If no transactions.csv exists, skip silently — not all seed targets need history.
  const transactionRows = parseCsvOptional(targetFolder, 'transactions.csv', [
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

  if (!transactionRows) {
    console.info(`ℹ️  No transactions.csv found in csv/${targetFolder}/ — skipping historical transaction seed.`)
    return
  }

  console.info(`\n💸 Seeding ${transactionRows.length} transactions from csv/${targetFolder}/transactions.csv...`)

  // --- ORDERS ---
  const orderRows = parseCsvOptional(targetFolder, 'orders.csv', ['id', 'orderNumber', 'status', 'orderType'])
  if (orderRows) {
    console.info(`  🛒 Seeding ${orderRows.length} orders...`)
    for (const row of orderRows) {
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

  // --- ORDER ITEMS ---
  const orderItemRows = parseCsvOptional(targetFolder, 'order-items.csv', [
    'id',
    'orderId',
    'variantId',
    'quantity',
    'unitPrice',
    'unitCost',
    'unitAbbreviation',
  ])
  if (orderItemRows) {
    console.info(`  🛒 Seeding ${orderItemRows.length} order items...`)
    for (const row of orderItemRows) {
      const unit = await prisma.unit.findFirst({ where: { abbreviation: row.unitAbbreviation.trim(), businessId: B1 } })
      if (!unit) {
        console.warn(`  ⚠️  Skipping order-item ${row.id}: unit "${row.unitAbbreviation}" not found.`)
        continue
      }
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

  // --- TRANSACTIONS ---
  for (const row of transactionRows) {
    const totalAmount = parseInt(row.totalAmount, 10) || 0
    const taxAmount = parseInt(row.taxAmount, 10) || 0
    const totalCost = parseInt(row.totalCost, 10) || 0
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

  // --- PAYMENTS ---
  const paymentRows = parseCsvOptional(targetFolder, 'payments.csv', ['id', 'transactionId', 'method', 'amount', 'tendered', 'change'])
  if (paymentRows) {
    console.info(`  💳 Seeding ${paymentRows.length} payments...`)
    for (const row of paymentRows) {
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

  console.info(`✅ Historical transaction seed complete.`)
}

export default seedHistoricalTransactions
