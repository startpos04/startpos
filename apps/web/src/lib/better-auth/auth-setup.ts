/**
 * auth-setup.ts — App-layer auth + data API wiring
 *
 * Call setupAuth() once at application startup (e.g. in __root.tsx).
 * This registers:
 *   - getAuthUser with the platform auth store (for refreshAuthUser)
 *   - crudAPI and transactionAPI with the platform db layer (for sync collections)
 */
import { AuthEngine } from '@platform/lib/better-auth/auth-engine'
import { registerAuthUserProvider } from '@platform/lib/better-auth/auth-store'
import { registerDataAPIs } from '@platform/lib/prisma-client/api-registry'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { transactionAPI } from '@/lib/prisma-client/transaction-api'

/**
 * setupAuth — registers all app implementations with the platform package.
 * Must be called before any auth or DB sync operations.
 */
export function setupAuth(): void {
  registerAuthUserProvider(getAuthUser as () => Promise<ServerUser | undefined>)
  registerDataAPIs({ crudAPI, transactionAPI })
}

/**
 * loginOnline — app-aware wrapper around AuthEngine.loginOnline.
 * Injects the app's getAuthUser so the engine never imports from the app layer.
 */
export const loginOnline = (email: string, password: string, onSuccess: (user: ServerUser) => void): Promise<void> =>
  AuthEngine.loginOnline(email, password, getAuthUser as () => Promise<ServerUser | undefined>, onSuccess)

/**
 * loginOffline — typed wrapper for AuthEngine.loginOffline with ServerUser.
 */
export const loginOffline = (email: string, password: string, onSuccess: (user: ServerUser) => void): Promise<void> =>
  AuthEngine.loginOffline<ServerUser>(email, password, onSuccess)
