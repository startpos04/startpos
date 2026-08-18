/**
 * refresh-session.ts
 *
 * Server function that updates the current session record with the user's
 * latest businessId and branchId from their Membership.
 *
 * Called after completeRegistration for OAuth users who cannot re-authenticate
 * with a password. The session cookie stays the same; only the session row in
 * the DB is updated so the next getAuthUser() call returns the correct tenant.
 *
 * Why this is needed:
 *   - OAuth sign-in creates a session before the Membership exists.
 *   - The session.create.before hook finds no Membership → businessId is null.
 *   - After completeRegistration the Membership exists, but the session token
 *     still carries the old null businessId.
 *   - This function patches the session row so the existing cookie is valid.
 */

import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { authClient } from '../better-auth/auth-client'
import { getAuthUser } from '../better-auth/auth-server'
import { prisma } from '../prisma-client'

export const refreshSession = createServerFn({ method: 'POST' }).handler(async () => {
  // Read the current session from the request cookie
  const { data: session } = await authClient.getSession({
    fetchOptions: { headers: getRequest().headers },
  })

  if (!session?.session?.id || !session?.user?.id) {
    return { success: false as const, error: 'No active session' }
  }

  // Look up the user's most recently created Membership
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { businessId: true, branchId: true },
  })

  if (!membership) {
    return { success: false as const, error: 'No membership found' }
  }

  // Patch the session row so subsequent reads return the correct businessId
  await prisma.session.update({
    where: { id: session.session.id },
    data: membership.branchId ? { businessId: membership.businessId, branchId: membership.branchId } : { businessId: membership.businessId },
  })

  // Return the fresh ServerUser assembled with the correct tenant context
  const freshUser = await getAuthUser()
  return { success: true as const, user: freshUser }
})
