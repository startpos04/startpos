import { createServerFn } from '@tanstack/react-start'
import { Role } from 'prisma/generated/prisma/enums'
import { authMiddleware } from './auth-middleware'

const RoleLandingPages: Record<Role, string> = {
  [Role.ADMIN]: '/employees',
  [Role.SUPERVISOR]: '/sales-reports',
  [Role.CASHIER]: '/pos',
  [Role.SERVICE_PROVIDER]: '/',
}

export const geAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context || !context.user) return undefined
    return {
      id: context.user.id,
      role: context.user.role as Role,
      landingPage: RoleLandingPages[context.user.role as Role],
      organizationId: context.user.organizationId,
      branchId: context.user.branchId,
    }
  })
