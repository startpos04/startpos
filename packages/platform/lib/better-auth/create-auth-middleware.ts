/**
 * create-auth-middleware.ts
 *
 * Generic TanStack Start middleware factory for session extraction.
 *
 * The platform package cannot own a specific betterAuth instance — that
 * belongs to each app (web, admin, representative). This factory accepts
 * any auth client and returns a middleware that:
 *
 *   1. Reads the session cookie from the incoming request
 *   2. Populates context.user with the raw session user
 *   3. Does NOT run AuthorizationEngine, does NOT load Membership data
 *
 * App-specific middleware (e.g. apps/web/src/lib/better-auth/auth-middleware.ts)
 * builds on top of this by adding AuthorizationEngine, entitlements, etc.
 *
 * Platform-internal server functions (core-api, core-transaction-api,
 * sequence-api) use this directly — they only need to know "is there a
 * valid session?" and read context.user.id / context.user.role.
 *
 * Usage (in a platform server function):
 *   import { platformAuthMiddleware } from '@platform/lib/better-auth/create-auth-middleware'
 *
 *   export const myFn = createServerFn()
 *     .middleware([platformAuthMiddleware])
 *     .handler(async ({ context }) => {
 *       const ctx = getServerContext(context)
 *       // ctx.user.id, ctx.user.role are available
 *     })
 *
 * Usage (in an app — create a tailored instance):
 *   import { createAuthMiddleware } from '@platform/lib/better-auth/create-auth-middleware'
 *   import { authClient } from '@/lib/better-auth/auth-client'
 *
 *   export const authMiddleware = createAuthMiddleware(authClient)
 */

import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

// Minimal subset of the authClient interface this factory depends on.
// Matches the shape returned by better-auth's createAuthClient.
interface MinimalAuthClient {
  getSession: (opts: { fetchOptions: { headers: Headers } }) => Promise<{
    data: {
      user: { id: string; email: string; role?: string; [key: string]: unknown }
      session: { [key: string]: unknown }
    } | null
  }>
}

export type GenericMiddlewareUser = {
  id: string
  email: string
  role?: string
  [key: string]: unknown
}

export type GenericMiddlewareContext = {
  user: GenericMiddlewareUser | undefined
}

/**
 * createAuthMiddleware — factory that accepts any auth client and returns
 * a TanStack Start middleware performing session extraction only.
 */
export function createAuthMiddleware(client: MinimalAuthClient) {
  return createMiddleware().server(async ({ next }) => {
    const { data: session } = await client.getSession({
      fetchOptions: {
        headers: getRequest().headers,
      },
    })

    if (!session?.user) {
      return await next({
        context: {
          user: undefined as unknown as GenericMiddlewareUser,
        },
      })
    }

    return await next({
      context: {
        user: session.user as GenericMiddlewareUser,
      },
    })
  })
}

// ---------------------------------------------------------------------------
// platformAuthMiddleware
//
// The default middleware used by platform-internal server functions
// (core-api, core-transaction-api, sequence-api). It reads its auth client
// from the app-registered provider so the platform never hard-codes a URL.
//
// Apps must call registerPlatformAuthClient() at startup (in setupAuth)
// before any platform server function is invoked.
// ---------------------------------------------------------------------------

let _platformClient: MinimalAuthClient | null = null

export function registerPlatformAuthClient(client: MinimalAuthClient): void {
  _platformClient = client
}

export const platformAuthMiddleware = createMiddleware().server(async ({ next }) => {
  if (!_platformClient) {
    console.warn('[platformAuthMiddleware] No auth client registered. Call registerPlatformAuthClient() at app startup.')
    return await next({
      context: {
        user: undefined as unknown as GenericMiddlewareUser,
      },
    })
  }

  const { data: session } = await _platformClient.getSession({
    fetchOptions: {
      headers: getRequest().headers,
    },
  })

  if (!session?.user) {
    return await next({
      context: {
        user: undefined as unknown as GenericMiddlewareUser,
      },
    })
  }

  return await next({
    context: {
      user: session.user as GenericMiddlewareUser,
    },
  })
})
