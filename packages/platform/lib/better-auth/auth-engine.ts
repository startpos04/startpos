import type { Role } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { clearLocalDatabase } from '@platform/db'
import { localAuthCollection } from '@platform/db/local-auth'
import MountManager from '@/lib/mount-manager'
import { getQueryClient } from '@platform/lib/query-client'
import { authStore, resetAuth } from '@platform/lib/better-auth/auth-store'
import type { BaseUser } from './base-user'
import { authClient } from './auth-client'
import { verifyAuth } from './auth-server'

export const AuthEngine = {
  /**
   * Syncs server session to local storage.
   */
  async syncServerToLocal(serverUser: BaseUser): Promise<void> {
    const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000
    const exists = localAuthCollection.has(serverUser.id)

    if (exists) {
      await localAuthCollection.update(serverUser.id, draft => {
        draft.profile = serverUser
        draft.expiresAt = expiry
      })
    } else {
      await localAuthCollection.insert({
        id: serverUser.id,
        email: serverUser.email,
        profile: serverUser,
        hashedPassword: '',
        expiresAt: expiry,
      })
    }
  },

  /**
   * Online login.
   *
   * fetchUser is injected by the app layer so the package never imports
   * getAuthUser directly. Pass your app's getAuthUser as the third argument.
   *
   * Usage (apps/web):
   *   import { getAuthUser } from '@/lib/better-auth/auth-server'
   *   await AuthEngine.loginOnline(email, password, getAuthUser, onSuccess)
   */
  async loginOnline<TUser extends BaseUser>(
    email: string,
    password: string,
    fetchUser: () => Promise<TUser | undefined>,
    onSuccess: (user: TUser) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      authClient.signIn.email(
        { email, password },
        {
          onSuccess: async () => {
            const fullUser = await fetchUser()
            if (!fullUser) {
              toast.error('Login succeeded but user profile could not be loaded.')
              reject(new Error('User profile could not be loaded'))
              return
            }

            // Detect a tenant switch — wipe local cache if tenant changed
            const lastBusinessId    = localStorage.getItem('last-business-id')
            const incomingBusinessId = fullUser.businessId

            if (incomingBusinessId && lastBusinessId && lastBusinessId !== incomingBusinessId) {
              const queryClient = getQueryClient()
              queryClient.resetQueries()
              await clearLocalDatabase()
            }

            if (incomingBusinessId) {
              localStorage.setItem('last-business-id', incomingBusinessId)
            }

            const hashedPassword = await AuthEngine.hashCredentials(password)
            const localUser = [...localAuthCollection.values()].find(u => u.email === email)

            if (localUser) {
              await localAuthCollection.update(localUser.id, draft => {
                draft.profile = fullUser
                draft.hashedPassword = hashedPassword
                draft.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
              })
            } else {
              await localAuthCollection.insert({
                id: fullUser.id,
                email: fullUser.email,
                hashedPassword,
                profile: fullUser,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
              })
            }

            onSuccess(fullUser)
            resolve()
          },
          onError: ctx => {
            toast.error(ctx.error.message || 'Authentication failed')
            reject(new Error(ctx.error.message || 'Authentication failed'))
          },
        },
      )
    })
  },

  /**
   * Offline login using locally cached credentials.
   */
  async loginOffline<TUser extends BaseUser>(
    email: string,
    password: string,
    onSuccess: (user: TUser) => void,
  ): Promise<void> {
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

      onSuccess(localUser.profile as TUser)
      return
    }

    toast.error('Invalid credentials or user not cached for offline use.')
  },

  /**
   * Clean logout — clears server session and resets auth state.
   * Does NOT wipe the local SQLite cache (preserves offline re-login cache).
   */
  async logout(params: { onSuccess: () => void }): Promise<void> {
    authStore.setState(state => ({ ...state, isLoggingOut: true }))
    MountManager.clear()

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await authClient.signOut({})
      }
    } catch (error) {
      console.error('AuthEngine: Server signOut failed', error)
    }

    resetAuth()
    params.onSuccess()
  },

  hashCredentials: async (password: string): Promise<string> => {
    const msgBuffer  = new TextEncoder().encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  },

  async authorizeFeature(values: { email: string; password: string }): Promise<{ id: string; role: Role; name: string | null } | undefined> {
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline) {
      try {
        const response = await verifyAuth({ data: values })
        if (response.success) return response.data
        toast.error(response.error || 'Invalid supervisor credentials.')
        return undefined
      } catch (err) {
        console.error('Online override failed, attempting offline fallback:', err)
      }
    }

    const activeUser = [...localAuthCollection.values()].find(u => {
      return u.expiresAt > Date.now() && u.profile?.id === authStore.state.user?.id
    })

    if (!activeUser?.profile?.localOverrides) {
      toast.error('System is offline and no local authorization boundaries are cached.')
      return undefined
    }

    const inputHash = await AuthEngine.hashCredentials(values.password)

    if (activeUser.hashedPassword === inputHash) {
      if (Date.now() > activeUser.expiresAt) {
        toast.error('Offline session expired. Please connect to the internet.')
        return undefined
      }
      return {
        id:   activeUser.profile.id,
        name: activeUser.profile.name,
        role: activeUser.profile.role,
      }
    }

    const matchedOverrideTarget = activeUser.profile.localOverrides.find(
      (supervisor: { email: string }) => supervisor.email === values.email,
    )

    if (!matchedOverrideTarget) {
      toast.error('This user is not recognized as an authorized supervisor for this branch.')
      return undefined
    }

    const isPasswordCorrect = matchedOverrideTarget.accounts?.some(
      ({ password }: { password: string }) => password === inputHash,
    )

    if (!isPasswordCorrect) {
      toast.error('Invalid local credentials or supervisor password has not been cached on this device.')
      return undefined
    }

    return {
      id:   matchedOverrideTarget.id,
      name: matchedOverrideTarget.name,
      role: matchedOverrideTarget.role,
    }
  },
}
