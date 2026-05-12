import { faker } from '@faker-js/faker'
import type { DefaultArgs } from '@prisma/client/runtime/client'
import {
  MovementType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  type PrismaClient,
  SequenceType,
  TransactionStatus,
  TransactionType,
} from 'prisma/generated/prisma/client'

// It doesn't care if it's in a transaction or not!
async function generateStructuredId(
  tx: Omit<PrismaClient<never, undefined, DefaultArgs>, '$extends' | '$disconnect' | '$connect' | '$on' | '$use'>,
  type: SequenceType,
  // biome-ignore lint/suspicious/noExplicitAny: just for now
  employee: any,
) {
  const now = new Date()
  const year = now.getFullYear()

  const counter = await tx.sequenceCounter.upsert({
    where: {
      organizationId_branchId_type_year_month_day: {
        organizationId: employee.memberships[0]?.organizationId || 'org-1',
        branchId: employee.memberships[0]?.branchId || 'branch-1',
        type,
        year,
        month: now.getMonth() + 1,
        day: type === 'ORDER' ? now.getDate() : 0,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: {
      type,
      year,
      month: now.getMonth() + 1,
      day: type === 'ORDER' ? now.getDate() : 0,
      lastNumber: 1,
      organizationId: employee.memberships[0]?.organizationId || 'org-1',
      branchId: employee.memberships[0]?.branchId || 'branch-1',
    },
  })

  const num = counter.lastNumber.toString().padStart(6, '0')

  if (type === SequenceType.INVOICE && employee.memberships[0]?.branch.maxInvoiceNo) {
    if (counter.lastNumber > employee.memberships[0]?.branch.maxInvoiceNo) {
      throw new Error(
        `BIR Permit Limit Reached: The current invoice number (${counter.lastNumber}) exceeds the authorized range (Max: ${employee.memberships[0]?.branch.maxInvoiceNo}). Please update your PTU settings.`,
      )
    }
  }

  switch (type) {
    case SequenceType.INVOICE:
      return `SI-${year}-${num}`
    case SequenceType.ORDER:
      return `#${num}`
    case SequenceType.STOCK_TRANSFER:
      return `ST-${year}-${num}`
    case SequenceType.PURCHASE:
      return `PO-${year}-${num}`
    case SequenceType.COLLECTION_RECEIPT:
      return `CR-${year}-${num}`
  }
}

export async function seedHistoricalTransactions(prisma: PrismaClient, transactionCount = 1500) {
  console.log(`\n💸 Seeding ${transactionCount} Transactions over 3 months...`)

  // 1. Fetch all employees capable of handling transactions
  const employees = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'CASHIER'] },
    },
    include: {
      memberships: {
        include: {
          branch: true,
          organization: true,
        },
      },
    },
  })

  if (employees.length === 0) throw new Error('❌ No employees found to process transactions.')

  const sellableVariants = await prisma.productVariant.findMany({
    include: { product: true },
  })

  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 3)

  for (let i = 0; i < transactionCount; i++) {
    // Rotate through employees to ensure variety
    const employee = employees[i % employees.length]! || employees[0]
    const createdAt = faker.date.between({ from: startDate, to: endDate })

    await prisma.$transaction(async tx => {
      const itemCount = faker.number.int({ min: 1, max: 4 })
      const cartItems = faker.helpers.arrayElements(sellableVariants, itemCount)

      // Create Order
      const order = await tx.order.create({
        data: {
          orderNumber: await generateStructuredId(tx, SequenceType.ORDER, employee),
          customerReference: faker.helpers.arrayElement(['Walk-in', `Table ${faker.number.int(15)}`, 'Takeaway']),
          status: OrderStatus.SERVED,
          orderType: OrderType.DINE_IN,
          organizationId: employee.memberships[0]?.organizationId || 'org-1',
          branchId: employee.memberships[0]?.branchId || 'branch-1',
          createdAt,
        },
      })

      let totalSalesAmount = 0
      let totalCostOfGoods = 0

      // Process Items Sequentially within the transaction
      for (const variant of cartItems) {
        const qty = faker.number.int({ min: 1, max: 5 })
        const unitPrice = variant.price
        const unitCost = variant.costPrice || 0

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            variantId: variant.id,
            quantity: qty,
            unitPrice,
            unitCost,
            unitId: variant.product.baseUnitId,
            organizationId: employee.memberships[0]?.organizationId || 'org-1',
            branchId: employee.memberships[0]?.branchId || 'branch-1',
            createdAt,
          },
        })

        // FIFO Inventory Logic
        const inventoryRecord = await tx.inventory.findFirst({
          where: {
            variantId: variant.id,
            branchId: employee.memberships[0]?.branchId || 'branch-1',
            quantity: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' },
        })

        if (inventoryRecord) {
          await tx.inventory.update({
            where: { id: inventoryRecord.id },
            data: { quantity: { decrement: qty } },
          })

          await tx.inventoryMovement.create({
            data: {
              organizationId: employee.memberships[0]?.organizationId || 'org-1',
              branchId: employee.memberships[0]?.branchId || 'branch-1',
              inventoryId: inventoryRecord.id,
              userId: employee.id, // Attributed to the specific employee
              variantId: variant.id,
              unitId: variant.product.baseUnitId,
              quantity: qty,
              type: MovementType.OUT,
              reason: `Sale: ${order.orderNumber}`,
              createdAt,
            },
          })
        }

        totalSalesAmount += unitPrice * qty
        totalCostOfGoods += unitCost * qty
      }

      const taxAmount = Math.round(totalSalesAmount * 0.12)
      const finalTotal = totalSalesAmount + taxAmount

      // Create Transaction linked to the current employee
      const transaction = await tx.transaction.create({
        data: {
          invoiceNo: await generateStructuredId(tx, SequenceType.INVOICE, employee),
          orderId: order.id,
          cashierId: employee.id, // Current employee in loop
          totalAmount: finalTotal,
          totalCost: totalCostOfGoods,
          taxAmount: taxAmount,
          bufferRate: 20,
          status: TransactionStatus.COMPLETED,
          type: TransactionType.SALE,
          organizationId: employee.memberships[0]?.organizationId || 'org-1',
          branchId: employee.memberships[0]?.branchId || 'branch-1',
          createdAt,
        },
      })

      await tx.payment.create({
        data: {
          transactionId: transaction.id,
          amount: finalTotal,
          tendered: Math.ceil(finalTotal / 100) * 100,
          change: Math.ceil(finalTotal / 100) * 100 - finalTotal,
          method: faker.helpers.arrayElement([PaymentMethod.CASH, PaymentMethod.CASH]), // Mostly cash
          organizationId: employee.memberships[0]?.organizationId || 'org-1',
          branchId: employee.memberships[0]?.branchId || 'branch-1',
          createdAt,
        },
      })
    })

    if (i % 100 === 0) console.log(` 🚀 Processed ${i} transactions...`)
  }

  console.log('✅ 1000 Historical Transactions Seeded successfully.')
}
