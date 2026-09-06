/** biome-ignore-all lint/suspicious/noExplicitAny: flexibility for batch operations */
import { platformAuthMiddleware as authMiddleware } from '@platform/lib/better-auth/create-auth-middleware'
import { prisma } from '@platform/lib/prisma-client'
import { type DBPayload, executeOperation } from '@platform/lib/prisma-client/crud-api'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'

// ---------------------------------------------------------------------------
// transactionAPI — Admin variant
//
// Executes a batch of operations in a single Prisma $transaction using the
// global prisma client. No tenant scoping, no usage counter reconciliation.
// ---------------------------------------------------------------------------
const transactionServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { operations: DBPayload[] }) => d)
  .handler(async ({ data }): Promise<{ value: any[] } | { error: any }> => {
    if (!data.operations || data.operations.length === 0) {
      return { error: 'Transaction batch must contain at least one operation.' }
    }

    const txResult = await ResultAsync.fromPromise(
      prisma.$transaction(async tx => {
        const results = []
        for (const op of data.operations) {
          results.push(await executeOperation(tx, op))
        }
        return results
      }),
      (e: any) => e.message || 'Transaction batch execution failed',
    )

    return txResult.isOk() ? { value: txResult.value } : { error: txResult.error }
  })

export const transactionAPI = {
  execute: async (operations: DBPayload[]): Promise<Result<any[], string>> => {
    const response = await transactionServerFn({ data: { operations } })
    if ('error' in response) return err(response.error as string)
    return ok(response.value)
  },
}
