/** biome-ignore-all lint/suspicious/noExplicitAny: flexibility for dynamic proxy */
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { prisma } from '@platform/lib/prisma-client'
import { type DBPayload, executeOperation } from '@platform/lib/prisma-client/crud-api'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, ResultAsync } from 'neverthrow'

// ---------------------------------------------------------------------------
// crudAPI — Admin variant
//
// Uses the global prisma client (no tenant scoping). Admin reads/writes
// are platform-level — they operate across all businesses and branches.
//
// No entitlement checks — admin operations are gated by role at the
// route/middleware level, not by subscription plan.
// ---------------------------------------------------------------------------
const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ data }) => {
    const result = await ResultAsync.fromPromise(
      executeOperation(prisma, data),
      (e: any) => e.message || 'Database operation failed',
    )
    return result.isOk() ? { value: result.value } : { error: result.error }
  })

export const crudAPI = new Proxy({} as any, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const response = await crudServerFn({ data: { table, action, args } })
      if ('error' in response) return err(response.error as string)
      return ok(response.value)
    }
  },
})
