import { createServerFn } from '@tanstack/react-start'
import { Branch, Organization } from 'prisma/generated/prisma/browser'
import { Role } from 'prisma/generated/prisma/enums'
import { getTenantPrisma } from '../prisma-client'
import { authMiddleware } from './auth-middleware'

const RoleLandingPages: Record<Role, string> = {
  [Role.ADMIN]: '/employees',
  [Role.SUPERVISOR]: '/sales-reports',
  [Role.CASHIER]: '/pos',
  [Role.SERVICE_PROVIDER]: '/',
}

export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context || !context.user) return undefined
    const prisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)

    const [userData, branch, organization] = await Promise.all([
      prisma.user.findUnique({
        where: { id: context.user.id },
        select: { id: true, name: true, email: true, image: true, role: true },
      }),
      (async () => {
        const branch = await prisma.branch.findUnique({
          where: { id: context.user.branchId! },
        })
        return branch || ({ id: '', name: 'No Branch', bufferRate: 0 } as unknown as Branch)
      })(),
      (async () => {
        const org = await prisma.organization.findUnique({
          where: { id: context.user.organizationId! },
        })
        return org || ({ id: '', name: 'No Organization', slug: '' } as unknown as Organization)
      })(),
    ])

    if (!userData) return undefined

    return {
      ...userData,
      branch,
      organization,
      landingPage: RoleLandingPages[userData.role as Role] ?? '/',
    }
  })
