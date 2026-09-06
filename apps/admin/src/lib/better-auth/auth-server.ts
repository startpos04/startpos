import { getSessionUser } from '@platform/lib/better-auth/auth-server'
import { platformAuthMiddleware } from '@platform/lib/better-auth/create-auth-middleware'
import { createServerFn } from '@tanstack/react-start'

// ---------------------------------------------------------------------------
// getAuthUser — Admin auth context (interim)
//
// TODO: Replace with a dedicated adminAuth instance and adminAuthMiddleware
// once the AdminUser table and separate betterAuth instance are implemented.
// Currently this re-uses the tenant session flow which will return undefined
// for admin accounts that have no Membership record.
//
// Tracked as: "Wire up apps/admin with its own auth trio" (task 4 deferred)
// ---------------------------------------------------------------------------
export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([platformAuthMiddleware])
  .handler(async () => {
    return await getSessionUser()
  })

export type ServerUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>
