import { Store } from '@tanstack/react-store'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import type { Prettify } from '@/lib/types'

const defaultValue = {
  isAuthenticated: false as const,
  isLoggingOut: false as boolean,
  user: {} as unknown as ServerUser,
}

export type AuthState = Prettify<typeof defaultValue | (Omit<typeof defaultValue, 'isAuthenticated'> & { isAuthenticated: true })>

export const authStore = new Store<AuthState>(defaultValue)

export const setUser = (user: ServerUser) => {
  authStore.setState(state => {
    // Do not overwrite an already-authenticated user — prevents accidental
    // re-seeding when multiple components call setUser on the same session.
    if (state.isAuthenticated && state.user?.id) return state
    return user ? { ...state, isAuthenticated: true, user } : defaultValue
  })
}

/**
 * refreshUser — force-overwrites the current user in the store.
 * Use this after server-side state changes (Stripe webhook, cancel, etc.)
 * where the entitlement/subscription data needs to be re-read from the server.
 * Unlike setUser, this bypasses the "already authenticated" guard.
 */
export const refreshUser = (user: ServerUser) => {
  authStore.setState(state => ({
    ...state,
    isAuthenticated: true,
    user,
  }))
}

export const resetAuth = () => {
  authStore.setState(defaultValue)
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
    if (freshUser) refreshUser(freshUser)
  } catch (err) {
    // Non-fatal — the user session is still valid, just stale
    console.warn('[authStore] refreshAuthUser failed:', err)
  }
}

if (typeof window !== 'undefined') {
  authStore.subscribe(() => {
    const state = authStore.state
    localStorage.setItem('my-app-storage', JSON.stringify({ user: { id: state.user.id } }))
  })
}
