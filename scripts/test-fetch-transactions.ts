import { prisma } from '../src/lib/prisma-client'

async function testFetchTransactions() {
  try {
    // Simulate what crudAPI would do with tenant scoping
    const businessId = 'fmrt-org-1'
    const branchId = 'fmrt-branch-1'

    const fromDate = new Date('2026-08-01')
    fromDate.setHours(0, 0, 0, 0)
    
    const toDate = new Date('2026-08-31')
    toDate.setHours(23, 59, 59, 999)

    console.log('Query parameters:')
    console.log('  businessId:', businessId)
    console.log('  branchId:', branchId)
    console.log('  fromDate:', fromDate)
    console.log('  toDate:', toDate)

    // Test the actual query that would be executed
    const transactions = await prisma.transaction.findMany({
      where: {
        businessId,
        branchId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 50,
    })

    console.log('\nResults:')
    console.log('  Total returned:', transactions.length)
    console.log('\nFirst 3 transactions:')
    transactions.slice(0, 3).forEach((tx, i) => {
      console.log(`  ${i + 1}. ${tx.invoiceNo} - ${tx.createdAt}`)
    })

    // Also test count
    const count = await prisma.transaction.count({
      where: {
        businessId,
        branchId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
    })

    console.log('\nTotal count:', count)

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

testFetchTransactions()
