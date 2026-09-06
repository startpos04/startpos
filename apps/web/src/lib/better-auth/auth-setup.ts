/**
 * auth-setup.ts — App-layer auth + data API wiring
 *
 * Call setupAuth() once at application startup (e.g. in __root.tsx).
 * This registers:
 *   - getAuthUser with the platform auth store (for refreshAuthUser)
 *   - crudAPI and transactionAPI with the platform db layer (for sync collections)
 *   - authClient with the platform middleware (for platformAuthMiddleware)
 */

import { registerEventEmitter } from '@platform/db/local-db-transaction'
import { registerPlatformAuthClient } from '@platform/lib/better-auth/create-auth-middleware'
import { registerDataAPIs } from '@platform/lib/prisma-client/api-registry'
import { authClient } from '@/lib/better-auth/auth-client'
import { loginOffline, loginOnline } from '@/lib/better-auth/auth-engine'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { registerAuthUserProvider } from '@/lib/better-auth/auth-store'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { transactionAPI } from '@/lib/prisma-client/transaction-api'

/**
 * setupAuth — registers platform-level implementations at app startup.
 * Must be called before any auth or DB sync operations.
 */
export function setupAuth(): void {
  // Auth store — enables refreshAuthUser() from anywhere in the platform
  registerAuthUserProvider(getAuthUser as () => Promise<ServerUser | undefined>)

  // Platform middleware — enables platformAuthMiddleware used by core-api,
  // core-transaction-api, sequence-api to validate sessions
  registerPlatformAuthClient(authClient)

  // Data APIs — enables collection sync via transactionAPI
  registerDataAPIs({ crudAPI: crudAPI as unknown as Parameters<typeof registerDataAPIs>[0]['crudAPI'], transactionAPI })

  // Event emitter — connects dbTransaction's event hook to BusinessEventBus
  registerEventEmitter(async events => {
    const { BusinessEventBus } = await import('@/lib/evolution/business-event-bus')
    for (const event of events) {
      await BusinessEventBus.emit(event as Parameters<typeof BusinessEventBus.emit>[0])
    }
  })
}

export { loginOffline, loginOnline }
