import { hashPassword } from 'better-auth/crypto'
import { PrismaClient } from 'prisma/generated/prisma/client'
import { Role } from 'prisma/generated/prisma/enums'

export async function initialAccounts(prisma: PrismaClient) {
  const newPasswordHash = await hashPassword('123qwe123!1')
  const now = new Date()

  const usersToSeed = [
    { id: 'admin-1', email: 'admin@store.com', name: 'Admin User', role: Role.ADMIN },
    { id: 'sup-1', email: 'supervisor@store.com', name: 'Supervisor User', role: Role.SUPERVISOR },
    { id: 'cash-1', email: 'cashier@store.com', name: 'Cashier User', role: Role.CASHIER },
  ]

  console.log('🔄 Syncing users and updating credentials...')

  for (const u of usersToSeed) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name },
      create: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    })

    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    })

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: newPasswordHash, updatedAt: now },
      })
      console.log(`✅ Updated password for: ${u.email}`)
    } else {
      await prisma.account.create({
        data: {
          id: `acc-${u.id}`,
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: newPasswordHash,
          createdAt: now,
          updatedAt: now,
        },
      })
      console.log(`✨ Created new account for: ${u.email}`)
    }
  }
}
