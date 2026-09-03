import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { getSessionUser } from '@platform/lib/better-auth/auth-server'
import { createServerFn } from '@tanstack/react-start'

// ---------------------------------------------------------------------------
// getAuthUser — Admin auth context
//
// Admins access platform-level data directly — no tenant scoping,
// no entitlement layer, no compliance. Just the session user.
//
// Extend this when admin-specific context is needed (e.g. admin role check).
// ---------------------------------------------------------------------------
export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    return await getSessionUser()
  })

export type ServerUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>
