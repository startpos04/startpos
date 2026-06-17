import { createServerFn } from '@tanstack/react-start'
import _ from 'lodash'
import type { Prisma } from 'prisma/generated/prisma/client'
import { type ComplianceKey, type ConfigKey, Role } from 'prisma/generated/prisma/enums'
import { getTenantPrisma } from '../prisma-client'
import { ComplianceKeySchema, type ComplianceKeyTypes, ConfigKeySchema, type ConfigKeyTypes } from '../types'
import { auth } from './auth'
import { authMiddleware } from './auth-middleware'

export const RoleLandingPages: Record<Role, string> = {
  [Role.ADMIN]: '/employees',
  [Role.SUPERVISOR]: '/sales-reports',
  [Role.CASHIER]: '/pos',
  [Role.SERVICE_PROVIDER]: '/',
}

// Type-safe Key-Value utility transformer
function transformKvPairs<K extends string, T extends { key: K; value: string }>(pairs: T[]): Partial<Record<K, string>> {
  return _.fromPairs(pairs.map(p => [p.key, p.value])) as Partial<Record<K, string>>
}

// Derive core entity payloads directly from Prisma Client models
type DBUser = Prisma.UserGetPayload<{ select: { id: true; name: true; email: true; image: true; role: true }; include: { systemConfigs: true } }>
type DBBusiness = Prisma.BusinessGetPayload<{ include: { complianceRegistry: true; systemConfigs: true } }>
type DBBranch = Prisma.BranchGetPayload<{ include: { complianceRegistry: true; systemConfigs: true } }>
type DBVendorSession = Prisma.VendorSessionGetPayload<object>
type DBLocalOverrides = Prisma.UserGetPayload<{
  select: { id: true; name: true; email: true; role: true }
  include: { accounts: { select: { password: true } } }
}>

export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return undefined
    }

    const { businessId, branchId, id: userId } = context.user
    const prisma = getTenantPrisma(businessId, branchId)

    const [userData, businessData, branchData, vendorSession, localOverrides] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, role: true, systemConfigs: true },
      }) as Promise<DBUser | null>,

      prisma.business.findUnique({
        where: { id: businessId },
        include: { complianceRegistry: true, systemConfigs: true },
      }) as Promise<DBBusiness | null>,

      prisma.branch.findUnique({
        where: { id: branchId },
        include: { complianceRegistry: true, systemConfigs: true },
      }) as Promise<DBBranch | null>,

      prisma.vendorSession.findFirst({
        where: { userId, branchId },
        orderBy: { startTime: 'desc' },
      }) as Promise<DBVendorSession | null>,

      prisma.user.findMany({
        where: {
          role: { in: [Role.ADMIN, Role.SUPERVISOR] },
          memberships: { some: { businessId, branchId } },
        },
        select: { id: true, name: true, email: true, role: true, accounts: { where: { providerId: { equals: 'credential' } }, select: { password: true } } },
      }) as Promise<DBLocalOverrides[] | null>,
    ])

    if (!userData || !businessData || !branchData) {
      return undefined
    }

    const { systemConfigs: userConfigs, ...user } = userData
    const { systemConfigs: businessConfigs, complianceRegistry: businessCompliance, ...business } = businessData
    const { systemConfigs: branchConfigs, complianceRegistry: branchCompliance, ...branch } = branchData

    // These objects are now cleanly typed maps instead of plain key-value targets
    const mappedUserConfigs = transformKvPairs<ConfigKey, (typeof userConfigs)[number]>(userConfigs)
    const mappedBusinessConfigs = transformKvPairs<ConfigKey, (typeof businessConfigs)[number]>(businessConfigs)
    const mappedBranchConfigs = transformKvPairs<ConfigKey, (typeof branchConfigs)[number]>(branchConfigs)

    const mappedBusinessCompliance = transformKvPairs<ComplianceKey, (typeof businessCompliance)[number]>(businessCompliance)
    const mappedBranchCompliance = transformKvPairs<ComplianceKey, (typeof branchCompliance)[number]>(branchCompliance)

    const mergedSystemConfigs = _.merge({}, mappedBusinessConfigs, mappedBranchConfigs, mappedUserConfigs)
    const mergedComplianceRegistry = _.merge({}, mappedBusinessCompliance, mappedBranchCompliance)

    return {
      ...user,
      business,
      branch,
      vendorSession,
      systemConfigs: ConfigKeySchema.parse(mergedSystemConfigs) as ConfigKeyTypes,
      complianceRegistry: ComplianceKeySchema.parse(mergedComplianceRegistry) as ComplianceKeyTypes,
      landingPage: RoleLandingPages[userData.role] ?? '/',
      localOverrides: localOverrides || [],
    }
  })

export type ServerUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>

export const verifyAuth = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { success: false, error: 'Context missing' }
    }

    const { businessId, branchId } = context.user
    const prisma = getTenantPrisma(businessId, branchId)

    try {
      const response = await auth.api.signInEmail({
        body: {
          email: data.email,
          password: data.password,
        },
        asResponse: true, // Crucial: Prevents updating active session headers/cookies
      })

      if (!response.ok) {
        return { success: false, error: 'Invalid password.' }
      }

      const user = await prisma.user.findFirst({
        where: {
          email: data.email,
        },
        select: {
          id: true,
          name: true,
          role: true,
        },
      })

      if (!user) {
        return { success: false, error: 'User is not authorized.' }
      }

      // Return the information directly so you can use them dynamically in your UI
      return {
        success: true,
        data: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      }
    } catch (error) {
      console.error('verification error:', error)
      return { success: false, error: 'Internal verification failure.' }
    }
  })
