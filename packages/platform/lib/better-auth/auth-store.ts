import type { PermissionKey } from '@platform/lib/authorization/permission-keys'
import { setLocalStorage } from '@platform/lib/json-utils'
import type { Prettify } from '@platform/lib/types'
import { Store, useStore } from '@tanstack/react-store'
import { z } from 'zod'
import type { BaseUser } from './base-user'

// Schema for auth storage data
const AuthStorageSchema = z.object({
  user: z.object({
    id: z.string(),
  }),
})

// Authorization summary type - mirrors PermissionSummary from authorization-engine
export interface AuthorizationSummary {
  permissions: PermissionKey[]
  role: string
  customGrants: PermissionKey[]
  customRevokes: PermissionKey[]
}

// ---------------------------------------------------------------------------
// User provider registry
//
// Apps register their getAuthUser implementation once at startup so the
// package can call it in refreshAuthUser without importing from the app layer.
//
// Usage (in apps/web/src/lib/better-auth/auth-setup.ts):
//   import { registerAuthUserProvider } from '@platform/lib/better-auth/auth-store'
//   import { getAuthUser } from '@/lib/better-auth/auth-server'
//   registerAuthUserProvider(getAuthUser)
// ---------------------------------------------------------------------------
type AuthUserProvider = () => Promise<BaseUser | undefined>
let _authUserProvider: AuthUserProvider | null = null

export const registerAuthUserProvider = (provider: AuthUserProvider): void => {
  _authUserProvider = provider
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const defaultValue = {
  isAuthenticated: false as const,
  isLoggingOut: false as boolean,
  user: null as BaseUser | null,
  authorization: null as AuthorizationSummary | null,
}

export type AuthState = Prettify<typeof defaultValue | (Omit<typeof defaultValue, 'isAuthenticated' | 'user'> & { isAuthenticated: true; user: BaseUser })>

export const authStore = new Store<AuthState>(defaultValue)

export const setUser = (user: BaseUser, authorization?: AuthorizationSummary | null) => {
  authStore.setState(state => {
    if (state.isAuthenticated && state.user?.id) return state
    return user ? ({ ...state, isAuthenticated: true as const, user, authorization: authorization ?? null } as AuthState) : defaultValue
  })
}

/**
 * refreshUser — force-overwrites the current user in the store.
 * Use after server-side changes (Stripe webhook, cancel, etc.)
 * where entitlement/subscription data needs re-reading from the server.
 */
export const refreshUser = (user: BaseUser, authorization?: AuthorizationSummary | null) => {
  authStore.setState(
    state =>
      ({
        ...state,
        isAuthenticated: true as const,
        user,
        authorization: authorization ?? null,
      }) as AuthState,
  )
}

export const resetAuth = () => {
  authStore.setState(() => defaultValue)
}

/**
 * getAuthenticatedUser — returns the current user from the store.
 *
 * The generic parameter lets app-layer code narrow the return type to their
 * concrete user type without re-implementing the guard:
 *
 * @example
 * // platform layer — returns BaseUser
 * const user = getAuthenticatedUser()
 *
 * // app layer — returns ServerUser with no cast
 * import type { ServerUser } from '@/lib/better-auth/auth-server'
 * const user = getAuthenticatedUser<ServerUser>()
 *
 * @throws {Error} when the store has no authenticated user
 */
export const getAuthenticatedUser = <TUser extends BaseUser = BaseUser>(): TUser => {
  const state = authStore.state
  if (!state.isAuthenticated || !state.user) {
    throw new Error('[authStore] getAuthenticatedUser called before authentication — ensure this is only called inside authenticated contexts')
  }
  return state.user as TUser
}

/**
 * useAuthenticatedUser — reactive hook that returns the current user.
 *
 * The generic parameter lets app-layer code narrow the return type to their
 * concrete user type without re-implementing the guard:
 *
 * @example
 * // platform layer — returns BaseUser
 * const user = useAuthenticatedUser()
 *
 * // app layer — returns ServerUser with no cast
 * import type { ServerUser } from '@/lib/better-auth/auth-server'
 * const user = useAuthenticatedUser<ServerUser>()
 *
 * @throws {Error} when the store has no authenticated user
 */
export const useAuthenticatedUser = <TUser extends BaseUser = BaseUser>(): TUser => {
  const state = useStore(authStore, s => s)
  if (!state.isAuthenticated || !state.user) {
    throw new Error('[authStore] useAuthenticatedUser called before authentication — ensure this is only rendered inside authenticated routes')
  }
  return state.user as TUser
}

/**
 * refreshAuthUser — re-fetches the full user from the server and writes it
 * into authStore. Requires registerAuthUserProvider() to have been called
 * at app startup.
 */
export const refreshAuthUser = async (): Promise<void> => {
  if (!_authUserProvider) {
    console.warn('[authStore] refreshAuthUser called before registerAuthUserProvider — skipping')
    return
  }
  try {
    const freshUser = await _authUserProvider()
    if (freshUser) {
      refreshUser(freshUser, (freshUser as BaseUser & { authorization?: AuthorizationSummary | null }).authorization)
    }
  } catch (err) {
    console.warn('[authStore] refreshAuthUser failed:', err)
  }
}

if (typeof window !== 'undefined') {
  authStore.subscribe(() => {
    const state = authStore.state

    if (!state.isAuthenticated || !state.user) {
      localStorage.removeItem('my-app-storage')
      return
    }

    const storageData = { user: { id: state.user.id } }
    const success = setLocalStorage('my-app-storage', storageData, AuthStorageSchema)

    if (!success) {
      console.warn('[authStore] Failed to save auth state to localStorage')
    }
  })
}
