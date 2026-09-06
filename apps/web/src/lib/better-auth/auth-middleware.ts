import { buildSummaryFromDatabase } from '@platform/lib/authorization/authorization-engine.server'
import type { PermissionKey } from '@platform/lib/authorization/permission-keys'
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
        user: session?.user as Session['user'],
        authorization: {
          permissions: [] as PermissionKey[],
          role: '',
        },
      },
    })
  }

  const user = session.user as Session['user']
  const sessionData = session.session as Session['session']

  const authContext = {
    userId: user.id,
    role: user.role ?? '',
    ...(sessionData.businessId != null && { businessId: sessionData.businessId }),
    ...(sessionData.branchId != null && { branchId: sessionData.branchId }),
  }

  const permissionSummary = await buildSummaryFromDatabase(authContext)

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
