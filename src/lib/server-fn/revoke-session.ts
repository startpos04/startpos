/**
 * revoke-session.ts
 *
 * Server function that deletes a specific session row, scoped to the
 * currently authenticated user. The userId scope prevents a user from
 * revoking another user's session.
 *
 * Called from the Security settings tab when a merchant revokes an
 * individual session from their login history.
 *
 * Uses rootPrisma — Session has no businessId/branchId; getTenantPrisma
 * would add incorrect WHERE clauses. Scoped to context.user.id instead.
 */

import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '../better-auth/auth-middleware'
import { prisma as rootPrisma } from '../prisma-client'

export const revokeSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const userId = context.user.id

    // Delete only if the session belongs to this user — prevents cross-user revocation
    const result = await rootPrisma.session.deleteMany({
      where: { id: data.sessionId, userId },
    })

    if (result.count === 0) {
      return { ok: false, error: 'Session not found or already expired.' }
    }

    return { ok: true }
  })
