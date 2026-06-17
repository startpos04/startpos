// fallow-ignore-file unused-file
import { faker } from '@faker-js/faker'
import type { DefaultArgs } from '@prisma/client/runtime/client'
import { MovementType, OrderStatus, OrderType, PaymentMethod, type PrismaClient, SequenceType, TransactionType } from 'prisma/generated/prisma/client'
export const order = 10000

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
      businessId_branchId_type_year_month_day: {
        businessId: employee.memberships[0]?.businessId || 'org-1',
        branchId: employee.memberships[0]?.branchId || 'branch-1',
        type,
        year,
        month: now.getMonth() + 1,
        day: type === 'ORDER' ? now.getDate() : 0,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: {
      id: `${employee.memberships[0]?.businessId || 'org-1'}-${employee.memberships[0]?.branchId || 'branch-1'}-${type}-${year}-${now.getMonth() + 1}-${type === 'ORDER' ? now.getDate() : 0}`,
      type,
      year,
      month: now.getMonth() + 1,
      day: type === 'ORDER' ? now.getDate() : 0,
      lastNumber: 1,
      businessId: employee.memberships[0]?.businessId || 'org-1',
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

export async function seedHistoricalTransactions(prisma: PrismaClient) {
  const transactionCount = 1500
  console.info(`\n💸 Seeding ${transactionCount} Transactions over 12 months...`)

  // 1. Fetch setup datasets upfront (outside the transaction)
  const employees = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'CASHIER'] } },
    include: { memberships: { include: { branch: true, business: true } } },
  })

  if (employees.length === 0) throw new Error('❌ No employees found to process transactions.')

  const sellableVariants = await prisma.productVariant.findMany({
    include: { product: true },
  })

  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 12)

  for (let i = 0; i < transactionCount; i++) {
    const employee = employees[i % employees.length]! || employees[0]
    const createdAt = faker.date.between({ from: startDate, to: endDate })

    const itemCount = faker.number.int({ min: 1, max: 4 })
    const cartItems = faker.helpers.arrayElements(sellableVariants, itemCount)

    // 2. Create Order (Execute everything through the consolidated 'tx' instance)
    const order = await prisma.order.create({
      data: {
        orderNumber: (await generateStructuredId(prisma, SequenceType.ORDER, employee))!,
        customerReference: faker.helpers.arrayElement(['Walk-in', `Table ${faker.number.int(15)}`, 'Takeaway']),
        status: OrderStatus.SERVED,
        orderType: OrderType.DINE_IN,
        businessId: employee.memberships[0]?.businessId || 'org-1',
        branchId: employee.memberships[0]?.branchId || 'branch-1',
        createdAt,
      },
    })

    let totalSalesAmount = 0
    let totalCostOfGoods = 0

    for (const variant of cartItems) {
      const qty = faker.number.int({ min: 1, max: 5 })
      const unitPrice = variant.price
      const unitCost = variant.costPrice || 0

      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          variantId: variant.id,
          quantity: qty,
          unitPrice,
          unitCost,
          unitId: variant.product.baseUnitId,
          businessId: employee.memberships[0]?.businessId || 'org-1',
          branchId: employee.memberships[0]?.branchId || 'branch-1',
          createdAt,
        },
      })

      const inventoryRecord = await prisma.inventory.findFirst({
        where: {
          variantId: variant.id,
          branchId: employee.memberships[0]?.branchId || 'branch-1',
          quantity: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      })

      if (inventoryRecord) {
        await prisma.inventory.update({
          where: { id: inventoryRecord.id },
          data: { quantity: { decrement: qty } },
        })

        await prisma.inventoryMovement.create({
          data: {
            businessId: employee.memberships[0]?.businessId || 'org-1',
            branchId: employee.memberships[0]?.branchId || 'branch-1',
            inventoryId: inventoryRecord.id,
            userId: employee.id,
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

    const transaction = await prisma.transaction.create({
      data: {
        invoiceNo: (await generateStructuredId(prisma, SequenceType.INVOICE, employee))!,
        orderId: order.id,
        cashierId: employee.id,
        totalAmount: finalTotal,
        totalCost: totalCostOfGoods,
        taxAmount: taxAmount,
        bufferRate: 20,
        type: TransactionType.SALE,
        businessId: employee.memberships[0]?.businessId || 'org-1',
        branchId: employee.memberships[0]?.branchId || 'branch-1',
        createdAt,
      },
    })

    await prisma.payment.create({
      data: {
        transactionId: transaction.id,
        amount: finalTotal,
        tendered: Math.ceil(finalTotal / 100) * 100,
        change: Math.ceil(finalTotal / 100) * 100 - finalTotal,
        method: faker.helpers.arrayElement([PaymentMethod.CASH, PaymentMethod.CASH]),
        businessId: employee.memberships[0]?.businessId || 'org-1',
        branchId: employee.memberships[0]?.branchId || 'branch-1',
        createdAt,
      },
    })

    if (i % 100 === 0) console.info(` 🚀 Processed ${i} transactions...`)
  }

  console.info(`✅ ${transactionCount} Historical Transactions Seeded successfully.`)
}
