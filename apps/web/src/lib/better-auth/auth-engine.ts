/**
 * auth-engine.ts — Web app auth engine (apps/web)
 *
 * Concrete implementation of all auth flows for apps/web.
 * No provider injection, no registration pattern.
 * Imports directly from the web app's own auth stack.
 */

import { clearLocalDatabase } from '@platform/db'
import type { LocalUser } from '@platform/db/local-auth'
import { localAuthCollection } from '@platform/db/local-auth'
import { resetAuth } from '@platform/lib/better-auth/auth-store'
import MountManager from '@platform/lib/mount-manager'
import { getQueryClient } from '@platform/lib/query-client'
import type { Role } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { authClient } from './auth-client'
import type { ServerUser } from './auth-server'
import { getAuthUser, verifyAuth } from './auth-server'
import { authStore } from './auth-store'

// ---------------------------------------------------------------------------
// loginOnline
// ---------------------------------------------------------------------------

export async function loginOnline(email: string, password: string, onSuccess: (user: ServerUser) => void): Promise<void> {
  const result = await authClient.signIn.email({ email, password })

  if (result?.error) {
    const message = result.error.message || 'Authentication failed'
    toast.error(message)
    throw new Error(message)
  }

  const fullUser = await getAuthUser()
  if (!fullUser) {
    const message =
      'Login succeeded but your account profile could not be loaded. If you just reset the database, make sure you have run pnpm db:seed and try again.'
    toast.error('Account profile could not be loaded. Check the server console for details.')
    throw new Error(message)
  }

  // Tenant-switch detection — flush caches when the user logs into a different business
  const lastBusinessId = localStorage.getItem('last-business-id')
  const incomingBusinessId = fullUser.business?.id

  if (incomingBusinessId && lastBusinessId && lastBusinessId !== incomingBusinessId) {
    getQueryClient().resetQueries()
    await clearLocalDatabase()
  }

  if (incomingBusinessId) {
    localStorage.setItem('last-business-id', incomingBusinessId)
  }

  const hashedPassword = await hashCredentials(password)
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
}

// ---------------------------------------------------------------------------
// loginOffline
// ---------------------------------------------------------------------------

export async function loginOffline(email: string, password: string, onSuccess: (user: ServerUser) => void): Promise<void> {
  const localUser = [...localAuthCollection.values()].find(u => u.email === email)
  const inputHash = await hashCredentials(password)

  if (localUser && localUser.hashedPassword === inputHash) {
    if (Date.now() > localUser.expiresAt) {
      toast.error('Offline session expired. Please connect to the internet.')
      return
    }

    authStore.setState(s => ({
      ...s,
      user: localUser.profile as ServerUser,
      isAuthenticated: true as const,
    }))

    onSuccess(localUser.profile as unknown as ServerUser)
    return
  }

  toast.error('Invalid credentials or user not cached for offline use.')
}

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

export async function logout(params: { onSuccess: () => void }): Promise<void> {
  authStore.setState(state => ({ ...state, isLoggingOut: true }))
  MountManager.clear()

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      await authClient.signOut()
    }
  } catch (error) {
    console.error('AuthEngine: Server signOut failed', error)
  }

  resetAuth()
  params.onSuccess()
}

// ---------------------------------------------------------------------------
// syncServerToLocal — keeps offline cache fresh after server-side updates
// ---------------------------------------------------------------------------

export async function syncServerToLocal(serverUser: ServerUser): Promise<void> {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000
  const exists = localAuthCollection.has(serverUser.id)

  if (exists) {
    localAuthCollection.update(serverUser.id, draft => {
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
}

// ---------------------------------------------------------------------------
// authorizeFeature — supervisor re-auth (online + offline fallback)
// ---------------------------------------------------------------------------

export async function authorizeFeature(values: { email: string; password: string }): Promise<{ id: string; role: Role; name: string | null } | undefined> {
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

  if (!activeUser?.profile) {
    toast.error('System is offline and no local authorization boundaries are cached.')
    return undefined
  }

  const cachedProfile = activeUser.profile as LocalUser

  if (!cachedProfile.localOverrides) {
    toast.error('System is offline and no local authorization boundaries are cached.')
    return undefined
  }

  const inputHash = await hashCredentials(values.password)

  if (activeUser.hashedPassword === inputHash) {
    if (Date.now() > activeUser.expiresAt) {
      toast.error('Offline session expired. Please connect to the internet.')
      return undefined
    }
    return {
      id: cachedProfile.id,
      name: cachedProfile.name,
      role: cachedProfile.role,
    }
  }

  const matchedOverrideTarget = cachedProfile.localOverrides.find(supervisor => supervisor.email === values.email)

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
    role: matchedOverrideTarget.role as Role,
  }
}

// ---------------------------------------------------------------------------
// hashCredentials — SHA-256 via Web Crypto API
// ---------------------------------------------------------------------------

export async function hashCredentials(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// AuthEngine namespace — matches the call sites that use AuthEngine.xxx
// ---------------------------------------------------------------------------

export const AuthEngine = {
  loginOnline,
  loginOffline,
  logout,
  syncServerToLocal,
  authorizeFeature,
  hashCredentials,
}
