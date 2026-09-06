/**
 * auth-store.ts — Web app auth store (apps/web)
 *
 * Extends the platform auth store with ServerUser — the full web-app user
 * shape that includes configs, branch, entitlement, compliance, etc.
 *
 * All functions here are web-typed wrappers or extensions, not bare re-exports.
 * Import from here (not from @platform) in all apps/web source files.
 */

import {
  authStore as _authStore,
  getAuthenticatedUser as _getAuthenticatedUser,
  refreshUser as _refreshUser,
  registerAuthUserProvider as _registerAuthUserProvider,
  setUser as _setUser,
  useAuthenticatedUser as _useAuthenticatedUser,
  type AuthorizationSummary,
} from '@platform/lib/better-auth/auth-store'
import type { Store } from '@tanstack/react-store'
import type { ServerUser } from '@/lib/better-auth/auth-server'

export type { AuthorizationSummary }

// ---------------------------------------------------------------------------
// Typed store — cast BaseUser → ServerUser for apps/web
// ---------------------------------------------------------------------------
type AppAuthState =
  | { isAuthenticated: false; isLoggingOut: boolean; user: null; authorization: AuthorizationSummary | null }
  | { isAuthenticated: true; isLoggingOut: boolean; user: ServerUser; authorization: AuthorizationSummary | null }

export const authStore = _authStore as unknown as Store<AppAuthState>

// ---------------------------------------------------------------------------
// Mutation helpers — typed to ServerUser
// ---------------------------------------------------------------------------

export const setUser = (user: ServerUser, authorization?: AuthorizationSummary | null) => _setUser(user, authorization)

export const refreshUser = (user: ServerUser, authorization?: AuthorizationSummary | null) => _refreshUser(user, authorization)

// ---------------------------------------------------------------------------
// getAuthenticatedUser — sync read, throws if not authenticated.
//
// Returns ServerUser directly — no generic parameter needed at call sites.
//
// @throws when called outside an authenticated context
// ---------------------------------------------------------------------------
export const getAuthenticatedUser = (): ServerUser => _getAuthenticatedUser<ServerUser>()

// ---------------------------------------------------------------------------
// useAuthenticatedUser — reactive hook, throws if not authenticated.
//
// Returns ServerUser directly — no generic parameter needed at call sites.
//
// @throws when rendered outside an authenticated route
// ---------------------------------------------------------------------------
export const useAuthenticatedUser = (): ServerUser => _useAuthenticatedUser<ServerUser>()

// ---------------------------------------------------------------------------
// registerAuthUserProvider — registers getAuthUser so refreshAuthUser works.
//
// Narrows the provider signature to ServerUser so the type aligns with what
// auth-setup.ts passes in.
// ---------------------------------------------------------------------------
export const registerAuthUserProvider = (provider: () => Promise<ServerUser | undefined>): void =>
  _registerAuthUserProvider(provider as Parameters<typeof _registerAuthUserProvider>[0])

// ---------------------------------------------------------------------------
// refreshAuthUser — re-fetches the full ServerUser from the server and writes
// it into authStore. Requires registerAuthUserProvider() to have been called
// at app startup (done in auth-setup.ts).
//
// This is a web extension: it re-reads the authorization field from the fresh
// user so the store stays fully in sync after subscription or role changes.
// ---------------------------------------------------------------------------
export const refreshAuthUser = async (): Promise<void> => {
  const { getAuthUser } = await import('@/lib/better-auth/auth-server')
  try {
    const freshUser = await getAuthUser()
    if (freshUser) {
      refreshUser(freshUser, freshUser.authorization ?? null)
    }
  } catch (err) {
    console.warn('[authStore] refreshAuthUser failed:', err)
  }
}
