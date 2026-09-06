import { createServerFn } from '@tanstack/react-start'
import { platformAuthMiddleware } from './create-auth-middleware'
import type { ServerContextUser } from './server-context'

// ---------------------------------------------------------------------------
// getSessionUser — Foundation session reader
//
// Returns the minimal user + tenant context extracted from the active session.
// No business logic, no entitlements, no billing, no compliance.
//
// Apps extend this by calling getSessionUser() then layering on their own
// domain context (see apps/web/src/lib/better-auth/auth-server.ts).
//
// Uses platformAuthMiddleware — a generic session extractor that reads from
// whatever auth client the app registered via registerPlatformAuthClient().
// ---------------------------------------------------------------------------
export const getSessionUser = createServerFn({ method: 'GET' })
  .middleware([platformAuthMiddleware])
  .handler(async ({ context }) => {
    const user = context.user as ServerContextUser

    // Only identity is required — tenant IDs are app-layer concerns
    if (!user?.id) {
      return undefined
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(user.businessId != null && { businessId: user.businessId }),
      ...(user.branchId != null && { branchId: user.branchId }),
    }
  })

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>
