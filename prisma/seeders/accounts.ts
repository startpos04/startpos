// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from 'better-auth/crypto'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { BusinessType, Role } from 'prisma/generated/prisma/enums'
import { CAPABILITY_REGISTRY } from '../../src/lib/onboarding/capability-registry'
// fallow-ignore-next-line unused-export
export const order = 0

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// acts as the interface
const DEFAULT_ACCOUNTS_DATA = {
  business: {
    id: 'org-1',
    name: 'Main Resto Group',
    slug: 'main-resto',
    businessType: BusinessType.RESTAURANT,
  },
  branch: {
    id: 'branch-1',
    name: 'Downtown Outlet',
    serialNumber: 'SN-0001-001',
    minInvoiceNo: 0,
    maxInvoiceNo: 100000,
    branchCode: '00000',
  },
  users: [
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
  ],
}

// fallow-ignore-next-line unused-export
export function getAccounts(folderName: string): typeof DEFAULT_ACCOUNTS_DATA {
  let runtimeData = { ...DEFAULT_ACCOUNTS_DATA }
  const resolvedCsvPath = path.join(__dirname, 'csv', folderName, 'accounts.csv')
  console.info('🔍 Target Account CSV Path:', resolvedCsvPath)

  // If the CSV exists, parse it and completely overwrite/re-map runtimeData
  if (fs.existsSync(resolvedCsvPath)) {
    console.info(`📈 Client CSV detected. Hydrating seed parameters from ${folderName}/accounts.csv...`)
    const fileContent = fs.readFileSync(resolvedCsvPath, 'utf-8')

    const { data, meta } = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    })

    const requiredHeaders = ['business_id', 'branch_id', 'user_email', 'user_role']
    const missingHeaders = requiredHeaders.filter(h => !meta.fields?.includes(h))
    if (missingHeaders.length > 0) {
      throw new Error(`❌ Ingestion aborted. Missing template columns: [${missingHeaders.join(', ')}]`)
    }

    if (data.length > 0) {
      const firstRow = data[0] as any

      // Re-map flat rows into the clean structured format
      runtimeData = {
        business: {
          id: firstRow.business_id.trim(),
          name: firstRow.business_name.trim(),
          slug: firstRow.business_slug.trim(),
          businessType: firstRow.business_type.trim(),
        },
        branch: {
          id: firstRow.branch_id.trim(),
          name: firstRow.branch_name.trim(),
          serialNumber: firstRow.serial_number.trim(),
          minInvoiceNo: parseInt(firstRow.min_invoice, 10) || 0,
          maxInvoiceNo: parseInt(firstRow.max_invoice, 10) || 100000,
          branchCode: firstRow.branch_code.trim(),
        },
        users: (data as any[]).map(row => ({
          id: row.user_id.trim(),
          email: row.user_email.trim(),
          name: row.user_name.trim(),
          role: row.user_role.trim(),
          image: row.user_image?.trim() || null,
        })),
      }
    }
  } else {
    throw new Error(`❌ Ingestion aborted. Target catalog dataset does not exist: "csv/${folderName}/accounts.csv"`)
  }

  return runtimeData
}

// fallow-ignore-next-line unused-export
export async function Accounts(prisma: PrismaClient, options: { folder: string }) {
  const newPasswordHash = await hashPassword('123qwe123!1')
  const now = new Date()
  const runtimeData = getAccounts(options.folder)

  console.info(`🏢 Syncing Tenant Structure: "${runtimeData.business.name}"`)

  const org = await prisma.business.upsert({
    where: { slug: runtimeData.business.slug },
    update: { name: runtimeData.business.name, businessType: runtimeData.business.businessType, deletedAt: null },
    create: runtimeData.business,
  })

  const branch = await prisma.branch.upsert({
    where: { id: runtimeData.branch.id },
    update: {
      name: runtimeData.branch.name,
      serialNumber: runtimeData.branch.serialNumber,
      minInvoiceNo: runtimeData.branch.minInvoiceNo,
      maxInvoiceNo: runtimeData.branch.maxInvoiceNo,
      branchCode: runtimeData.branch.branchCode,
      deletedAt: null,
    },
    create: { ...runtimeData.branch, businessId: org.id },
  })

  console.info(`👥 Processing ${runtimeData.users.length} associated tenant user profile maps...`)
  for (const u of runtimeData.users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, image: u.image, deletedAt: null },
      create: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        image: u.image,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    })

    await prisma.membership.upsert({
      where: { userId_businessId: { userId: user.id, businessId: org.id } },
      update: { role: u.role, branchId: branch.id, deletedAt: null },
      create: {
        userId: user.id,
        businessId: org.id,
        branchId: branch.id,
        role: u.role,
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
    } else {
      await prisma.account.create({
        data: {
          id: `acc-${user.id}`,
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: newPasswordHash,
          createdAt: now,
          updatedAt: now,
        },
      })
      console.info(`✨ Credentials compiled successfully: ${user.email}`)
    }
  }

  // =========================================================================
  // ENABLE REQUIRED CAPABILITIES
  // =========================================================================
  console.info('🔐 Initializing required capabilities for business...')
  
  // Get all capabilities that are always required (no context needed)
  const requiredCapabilities = CAPABILITY_REGISTRY.filter(cap => {
    // Only enable capabilities where required is a function that returns true
    // without needing characteristics context (i.e., () => true)
    if (typeof cap.required === 'function') {
      try {
        // Try calling with empty context - if it throws or returns false, skip it
        const result = cap.required({} as any)
        return result === true
      } catch {
        // If function needs context (like c.paymentTiming), skip it
        // These will be enabled during normal onboarding flow
        return false
      }
    }
    return cap.required === true
  })

  console.info(`   Found ${requiredCapabilities.length} always-required capabilities to enable`)

  const enabledAt = new Date()

  for (const capability of requiredCapabilities) {
    // Build state history entry
    const historyEntry = {
      state: 'ENABLED',
      changedAt: enabledAt.toISOString(),
      changedBy: 'system',
      reason: 'Required capability - auto-enabled during seed',
    }

    await prisma.businessCapabilityState.upsert({
      where: {
        businessId_capabilityId: {
          businessId: org.id,
          capabilityId: capability.id,
        },
      },
      update: {
        state: 'ENABLED',
        confidence: 1.0,
        enteredBy: 'system',
        enteredAt: enabledAt,
        enabledAt: enabledAt,
        stateHistory: [historyEntry],
      },
      create: {
        businessId: org.id,
        capabilityId: capability.id,
        state: 'ENABLED',
        confidence: 1.0,
        enteredBy: 'system',
        enteredAt: enabledAt,
        enabledAt: enabledAt,
        stateHistory: [historyEntry],
      },
    })
  }

  console.info(`✅ Enabled ${requiredCapabilities.length} required capabilities`)

  // Bubble up dynamic context keys directly to seed.ts runner pipeline
  return { org: { id: org.id }, branch: { id: branch.id } }
}
