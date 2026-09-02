import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type { Session } from './auth'
import { authClient } from './auth-client'

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const { data: session } = await authClient.getSession({
    fetchOptions: {
      headers: getRequest().headers,
    },
  })

  if (!session?.user) {
    return await next({
      context: {
        user: undefined as unknown as Session['user'],
        authorization: undefined,
      },
    })
  }

  const user = session?.user as Session['user']
  const sessionData = session.session as Session['session']

  // Lazy import to avoid circular dependency at module load time
  const { AuthorizationEngine } = await import('../authorization/authorization-engine')

  // Build authorization context with permissions
  const authContext = {
    userId: user.id,
    role: user.role,
    businessId: sessionData.businessId,
    branchId: sessionData.branchId,
  }

  const permissionSummary = await AuthorizationEngine.buildSummary(authContext)

  return await next({
    context: {
      user: { ...user, businessId: sessionData.businessId, branchId: sessionData.branchId },
      authorization: {
        permissions: permissionSummary.permissions,
        role: permissionSummary.role,
      },
    },
  })
})
