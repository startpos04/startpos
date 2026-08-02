// src/lib/auth-engine.ts

import type { Role } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { clearLocalDatabase } from '@/db'
import { localAuthCollection } from '@/db/local-auth'
import MountManager from '@/lib/mount-manager'
import { getQueryClient } from '@/lib/query-client'
import { authStore, resetAuth } from '@/store/auth-store'
import { authClient } from './auth-client'
import { getAuthUser, type ServerUser, verifyAuth } from './auth-server'

export const AuthEngine = {
  /**
   * Syncs server session to local storage.
   */
  async syncServerToLocal(serverUser: ServerUser): Promise<void> {
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
   * Captures the password hash during a successful online login.
   * If the incoming tenant differs from the previously cached businessId,
   * the local SQLite database is wiped before the new user's data syncs —
   * ensuring cross-tenant data never bleeds through.
   * Same-tenant re-logins (including offline recovery) are unaffected.
   */
  async loginOnline(email: string, password: string, onSuccess: (user: ServerUser) => void): Promise<void> {
    await authClient.signIn.email(
      { email, password },
      {
        onSuccess: async () => {
          const fullUser = await getAuthUser()
          if (!fullUser) {
            toast.error('Login succeeded but user profile could not be loaded.')
            return
          }

          // Detect a tenant switch: compare incoming businessId against the
          // last businessId that was successfully logged in on this device.
          // Use a dedicated key that is only written on successful login —
          // never cleared on logout — so this survives the logout→login cycle.
          const lastBusinessId = localStorage.getItem('last-business-id')
          const incomingBusinessId = fullUser.business?.id

          if (incomingBusinessId && lastBusinessId && lastBusinessId !== incomingBusinessId) {
            // Different tenant — wipe local cache so stale data never bleeds through
            const queryClient = getQueryClient()
            queryClient.resetQueries()
            await clearLocalDatabase()
          }

          // Always write the current businessId after a successful login
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
  async loginOffline(email: string, password: string, onSuccess: (user: ServerUser) => void): Promise<void> {
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
   * Clears the server session and resets auth state.
   * Does NOT wipe the local SQLite cache — that only happens in loginOnline
   * when a different tenant is detected, so the same-user offline re-login path
   * retains its cached data.
   */
  async logout(params: { onSuccess: () => void }): Promise<void> {
    authStore.setState(state => ({ ...state, isLoggingOut: true }))
    MountManager.clear()
    resetAuth()

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        // Strip the callbacks — we call onSuccess ourselves below so it fires exactly once.
        await authClient.signOut({})
      }
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

  async authorizeFeature(values: { email: string; password: string }): Promise<{ id: string; role: Role; name: string } | undefined> {
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine

    if (isOnline) {
      try {
        const response = await verifyAuth({ data: values })
        if (response.success) {
          return response.data
        }
        toast.error(response.error || 'Invalid supervisor credentials.')
        return undefined
      } catch (err) {
        console.error('Online override failed, attempting offline fallback:', err)
      }
    }

    // ==========================================
    // OFFLINE OR NETWORK FALLBACK PATH
    // ==========================================

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
        id: activeUser.profile.id,
        name: activeUser.profile.name,
        role: activeUser.profile.role,
      }
    }

    const matchedOverrideTarget = activeUser.profile.localOverrides.find(supervisor => supervisor.email === values.email)

    if (!matchedOverrideTarget) {
      toast.error('This user is not recognized as an authorized supervisor for this branch.')
      return undefined
    }

    const isPasswordCorrect = matchedOverrideTarget.accounts?.some(({ password }) => password === inputHash)

    if (!isPasswordCorrect) {
      toast.error('Invalid local credentials or supervisor password has not been cached on this device.')
      return undefined
    }

    return {
      id: matchedOverrideTarget.id,
      name: matchedOverrideTarget.name,
      role: matchedOverrideTarget.role,
    }
  },
}
