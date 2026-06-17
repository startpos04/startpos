import { Store } from '@tanstack/react-store'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import type { Prettify } from '@/lib/types'

const defaultValue = {
  isAuthenticated: false as const,
  user: {} as unknown as ServerUser,
}

export type AuthState = Prettify<typeof defaultValue | (Omit<typeof defaultValue, 'isAuthenticated'> & { isAuthenticated: true })>

export const authStore = new Store<AuthState>(defaultValue)

export const setUser = (user: ServerUser) => {
  authStore.setState(state => {
    if (state.user.id) return state

    return user ? { ...state, isAuthenticated: true, user } : defaultValue
  })
}

if (typeof window !== 'undefined') {
  authStore.subscribe(() => {
    const state = authStore.state
    localStorage.setItem('my-app-storage', JSON.stringify({ user: { id: state.user.id } }))
  })
}
