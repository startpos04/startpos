// src/lib/auth-engine.ts

import { toast } from 'sonner'
import { localAuthCollection } from '@/db/local-auth'
import { authStore, type BaseUser } from '@/store/auth-store'
import { authClient } from './auth-client'

type BetterUser = BaseUser & {
  id: string
  email: string
}

type LocalAuthRecord = {
  id: string
  email: string
  hashedPassword: string
  profile: BetterUser
  expiresAt: number
}

export const AuthEngine = {
  /**
   * Syncs server session to local storage.
   */
  async syncServerToLocal(serverUser: BetterUser): Promise<void> {
    const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000
    const exists = localAuthCollection.has(serverUser.id)

    if (exists) {
      await localAuthCollection.update(serverUser.id, draft => {
        draft.profile = serverUser
        draft.expiresAt = expiry
      })
    } else {
      await localAuthCollection.insert([
        {
          id: serverUser.id,
          email: serverUser.email,
          profile: serverUser,
          hashedPassword: '',
          expiresAt: expiry,
        } as LocalAuthRecord,
      ])
    }
  },

  /**
   * Captures the password hash during a successful online login.
   */
  async loginOnline(email: string, password: string, onSuccess: (user: BaseUser) => void): Promise<void> {
    await authClient.signIn.email(
      { email, password },
      {
        onSuccess: async ({ data }) => {
          const localUser = [...localAuthCollection.values()].find(u => u.email === email)
          if (!localUser) {
            await localAuthCollection.insert([
              {
                id: data.user.id,
                email: data.user.email,
                hashedPassword: await AuthEngine.hashCredentials(password),
                profile: data.user,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
              },
            ])
          }
          onSuccess(data.user)
        },
        onError: ctx => {
          toast.error(ctx.error.message || 'Authentication failed')
        },
      },
    )
  },

  /**
   * Type-safe offline login.
   */
  async loginOffline(email: string, password: string, onSuccess: (user: BaseUser) => void): Promise<void> {
    const localUser = [...localAuthCollection.values()].find(u => u.email === email)

    const inputHash = await AuthEngine.hashCredentials(password)

    if (localUser && localUser.hashedPassword === inputHash) {
      if (Date.now() > localUser.expiresAt) {
        toast.error('Offline session expired. Please connect to the internet.')
        return
      }

      authStore.setState(s => ({
        ...s,
        user: localUser.profile,
        isAuthenticated: true,
      }))

      onSuccess(localUser.profile)
      return
    }

    toast.error('Invalid credentials or user not cached for offline use.')
  },

  /**
   * Performs a clean logout.
   * Clears the server session (if online) and wipes the local shadow.
   */
  async logout(params: { onSuccess: () => void }): Promise<void> {
    authStore.setState(s => ({
      ...s,
      user: {} as unknown as BaseUser,
      isAuthenticated: false,
    }))

    try {
      await authClient.signOut({}, params)
    } catch (error) {
      console.error('AuthEngine: Server signOut failed', error)
    }

    params.onSuccess()
  },

  hashCredentials: async (password: string) => {
    const msgBuffer = new TextEncoder().encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  },
}
