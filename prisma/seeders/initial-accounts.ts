import { hashPassword } from 'better-auth/crypto'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { Role, VatType } from 'prisma/generated/prisma/enums'

export async function initialAccounts(prisma: PrismaClient) {
  const newPasswordHash = await hashPassword('123qwe123!1')
  const now = new Date()

  // Create a Test Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'main-store' },
    update: { deletedAt: null },
    create: {
      id: 'org-1',
      name: 'Main Retail Group',
      slug: 'main-store',
      tin: '000-123-456-000',
      businessStyle: 'Retail / Coffee Shop',
      vatType: VatType.VAT,
      permitToUse: 'PTU-2026-001',
      accreditedPrinter: 'Printer Inc. Model X',
    },
  })

  // Create a Test Branch
  const branch = await prisma.branch.upsert({
    where: { id: 'branch-1' },
    update: { deletedAt: null },
    create: {
      id: 'branch-1',
      name: 'Downtown Outlet',
      bufferRate: 20,
      organizationId: org.id,
      serialNumber: 'SN-0001-001',
      minInvoiceNo: 0,
      maxInvoiceNo: 100000,
      locale: 'en-PH',
      currency: 'PHP',
      address: '123 Rizal Ave, Makati City',
    },
  })

  const usersToSeed = [
    {
      id: 'admin-1',
      email: 'admin@store.com',
      name: 'Admin User',
      role: Role.ADMIN,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    },
    {
      id: 'sup-1',
      email: 'supervisor@store.com',
      name: 'Supervisor User',
      role: Role.SUPERVISOR,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sasha',
    },
    {
      id: 'cash-1',
      email: 'cashier@store.com',
      name: 'Cashier User',
      role: Role.CASHIER,
      image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    },
  ]

  console.log('🔄 Syncing users, memberships, and credentials...')

  for (const u of usersToSeed) {
    // Upsert User
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { ...u, deletedAt: null },
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

    // Create Membership (Crucial for Multi-tenancy)
    // This links the User to the Org and sets their Role within that Org
    await prisma.membership.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
      update: { role: u.role, branchId: branch.id },
      create: {
        userId: user.id,
        organizationId: org.id,
        branchId: branch.id,
        role: u.role,
      },
    })

    // Handle Better Auth Credentials
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    })

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: newPasswordHash, updatedAt: now },
      })
      console.log(`✅ Updated: ${u.email}`)
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
      console.log(`✨ Created: ${u.email}`)
    }
  }
}
