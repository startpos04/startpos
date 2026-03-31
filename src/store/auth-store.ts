import { getAuthUser } from '@/lib/better-auth/auth-server'

import { Store } from '@tanstack/react-store'

type BaseUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>

export type AuthState = { isAuthenticated: true; user: BaseUser } | { isAuthenticated: false; user: BaseUser }

export const authStore = new Store<AuthState>({
  isAuthenticated: false,
  user: {} as unknown as BaseUser,
})

export const setUser = (user: BaseUser) => {
  authStore.setState(() => {
    if (user) {
      return { isAuthenticated: true, user }
    }

    return { isAuthenticated: false, user: {} as unknown as BaseUser }
  })
}
