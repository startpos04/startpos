/**
 * fetch-login-history.ts
 *
 * Fetches the current user's recent sessions (login history) for the
 * Security settings page.
 *
 * Why not crudAPI?
 *   The Session model has no businessId / branchId columns — it belongs to
 *   a User, not a tenant. getTenantPrisma injects businessId WHERE clauses
 *   which would fail on the Session model. rootPrisma is required, and the
 *   query is scoped to context.user.id (the session-verified actor).
 *   This is a narrow Priority 4 exception per the API-layer-priority rule:
 *   server-side read that cannot be expressed as crudAPI.
 */

import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '../better-auth/auth-middleware'
import { prisma as rootPrisma } from '../prisma-client'

export type LoginHistoryEntry = {
  id: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
  expiresAt: Date
  isCurrent: boolean
}

export const fetchLoginHistory = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LoginHistoryEntry[]> => {
    const userId = context.user.id

    const sessions = await rootPrisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    const now = new Date()
    return sessions.map(s => ({
      ...s,
      // Mark sessions still within their expiry window as potentially active.
      // We can't identify the exact current session token server-side without
      // forwarding it through the middleware — this is sufficient for Phase 1.
      isCurrent: s.expiresAt > now,
    }))
  })
