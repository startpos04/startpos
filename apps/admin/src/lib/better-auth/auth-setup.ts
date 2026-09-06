import { registerAuthUserProvider } from '@platform/lib/better-auth/auth-store'
import { registerPlatformAuthClient } from '@platform/lib/better-auth/create-auth-middleware'
import { registerDataAPIs } from '@platform/lib/prisma-client/api-registry'
// TODO: Replace with the admin-specific authClient once adminAuth is implemented.
// For now we create a minimal stub client so platformAuthMiddleware doesn't warn.
// This will be swapped for the real adminAuthClient in the admin auth wiring task.
import { createAuthClient } from 'better-auth/client'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { transactionAPI } from '@/lib/prisma-client/transaction-api'

const adminAuthClientStub = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? (process.env['ADMIN_BETTER_AUTH_INTERNAL_URL'] ?? process.env['ADMIN_BETTER_AUTH_URL'] ?? process.env['BETTER_AUTH_URL'])
      : (process.env['ADMIN_BETTER_AUTH_URL'] ?? process.env['BETTER_AUTH_URL']),
})

/**
 * setupAuth — registers all app implementations with the platform package.
 * Call once at app startup (in __root.tsx).
 */
export function setupAuth(): void {
  registerAuthUserProvider(getAuthUser as () => Promise<ServerUser | undefined>)
  registerPlatformAuthClient(adminAuthClientStub)
  registerDataAPIs({ crudAPI, transactionAPI })
}
