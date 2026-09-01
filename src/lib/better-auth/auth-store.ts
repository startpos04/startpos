import { Store } from '@tanstack/react-store'
import { z } from 'zod'
import type { PermissionKey } from '@/lib/authorization/permission-keys'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { setLocalStorage } from '@/lib/json-utils'
import type { Prettify } from '@/lib/types'

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

const defaultValue = {
  isAuthenticated: false as const,
  isLoggingOut: false as boolean,
  user: null as ServerUser | null,
  authorization: null as AuthorizationSummary | null,
}

export type AuthState = Prettify<typeof defaultValue | (Omit<typeof defaultValue, 'isAuthenticated' | 'user'> & { isAuthenticated: true; user: ServerUser })>

export const authStore = new Store<AuthState>(defaultValue)

export const setUser = (user: ServerUser, authorization?: AuthorizationSummary | null) => {
  authStore.setState(state => {
    // Do not overwrite an already-authenticated user — prevents accidental
    // re-seeding when multiple components call setUser on the same session.
    if (state.isAuthenticated && state.user?.id) return state
    return user ? ({ ...state, isAuthenticated: true as const, user, authorization: authorization ?? null } as AuthState) : defaultValue
  })
}

/**
 * refreshUser — force-overwrites the current user in the store.
 * Use this after server-side state changes (Stripe webhook, cancel, etc.)
 * where the entitlement/subscription data needs to be re-read from the server.
 * Unlike setUser, this bypasses the "already authenticated" guard.
 */
export const refreshUser = (user: ServerUser, authorization?: AuthorizationSummary | null) => {
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
 * refreshAuthUser — re-fetches the full user from the server and writes it
 * into authStore. Call this after any server-side change that affects what
 * the user can see or do: capability enable/pause/restore, subscription
 * changes, system config updates.
 *
 * This makes useCapability() and useStore(authStore, ...) reactive to
 * server-side state changes without requiring a page reload.
 */
export const refreshAuthUser = async (): Promise<void> => {
  try {
    const freshUser = await getAuthUser()
    if (freshUser) {
      // Extract authorization from the user object and pass it separately
      // to refreshUser so it gets properly stored in authStore
      refreshUser(freshUser, freshUser.authorization)
    }
  } catch (err) {
    // Non-fatal — the user session is still valid, just stale
    console.warn('[authStore] refreshAuthUser failed:', err)
  }
}

if (typeof window !== 'undefined') {
  authStore.subscribe(() => {
    const state = authStore.state

    // Only save to localStorage if user is authenticated
    if (!state.isAuthenticated || !state.user) {
      localStorage.removeItem('my-app-storage')
      return
    }

    const storageData = { user: { id: state.user.id } }

    // Use type-safe localStorage setter
    const success = setLocalStorage('my-app-storage', storageData, AuthStorageSchema)

    if (!success) {
      console.warn('[authStore] Failed to save auth state to localStorage')
    }
  })
}
