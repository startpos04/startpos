import { prisma } from '../startpos-core/lib/prisma-client'

async function checkTransactions() {
  try {
    const totalTransactions = await prisma.transaction.count()
    console.log('Total transactions in database:', totalTransactions)

    const transactions = await prisma.transaction.findMany({
      take: 10,
      select: {
        id: true,
        invoiceNo: true,
        businessId: true,
        branchId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log('\nSample transactions:')
    transactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.invoiceNo} - ${tx.createdAt.toISOString()} - businessId: ${tx.businessId}, branchId: ${tx.branchId}`)
    })

    // Check if there are any with businessId = fmrt-org-1
    const groceryTransactions = await prisma.transaction.count({
      where: { businessId: 'fmrt-org-1' },
    })
    console.log(`\nTransactions with businessId=fmrt-org-1: ${groceryTransactions}`)

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkTransactions()
