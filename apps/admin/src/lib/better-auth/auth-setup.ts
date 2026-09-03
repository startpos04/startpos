import { registerAuthUserProvider } from '@platform/lib/better-auth/auth-store'
import { registerDataAPIs } from '@platform/lib/prisma-client/api-registry'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { transactionAPI } from '@/lib/prisma-client/transaction-api'
import type { ServerUser } from '@/lib/better-auth/auth-server'

/**
 * setupAuth — registers all app implementations with the platform package.
 * Call once at app startup (in __root.tsx).
 */
export function setupAuth(): void {
  registerAuthUserProvider(getAuthUser as () => Promise<ServerUser | undefined>)
  registerDataAPIs({ crudAPI, transactionAPI })
}
