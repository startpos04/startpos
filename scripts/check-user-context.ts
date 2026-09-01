import { prisma } from '../startpos-core/lib/prisma-client'

async function checkUserContext() {
  try {
    // Check owner@grocery.com user
    const user = await prisma.user.findUnique({
      where: { email: 'owner@grocery.com' },
      include: {
        memberships: {
          include: {
            business: true,
            branch: true,
          },
        },
      },
    })

    if (!user) {
      console.log('User owner@grocery.com not found!')
      return
    }

    console.log('User:', user.email)
    console.log('User ID:', user.id)
    console.log('\nMemberships:')
    user.memberships.forEach(m => {
      console.log(`  Business: ${m.business.name} (${m.businessId})`)
      console.log(`  Branch: ${m.branch?.name ?? 'N/A'} (${m.branchId})`)
      console.log(`  Role: ${m.role}`)
    })

    // Check transactions for this business/branch
    const membership = user.memberships[0]
    if (membership) {
      const count = await prisma.transaction.count({
        where: {
          businessId: membership.businessId,
          branchId: membership.branchId,
        },
      })
      console.log(`\nTransactions for this business/branch: ${count}`)
    }

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkUserContext()
