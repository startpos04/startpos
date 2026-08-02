/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { getTenantPrisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'
// Import the shared execution engine directly from your crud-api file
import { type DBPayload, executeOperation } from './crud-api'

interface TransactionInput {
  operations: DBPayload[]
}

// ---------------------------------------------------------------------------
// R9 — Tenant isolation for batch operations
//
// Architecture Compliance — Phase 6 (Section 6.1, Risk R9):
//   "Adding businessId assertions in the batch executor becomes more critical
//    once billing counters are incremented via transactionAPI."
//
// The transactionAPI executes an arbitrary batch of DBPayload operations inside
// a single Prisma $transaction. Previously it used the global `prisma` client,
// which does NOT scope queries to the session's businessId/branchId. This meant
// a crafted payload could read or write records belonging to a different tenant.
//
// Fix applied:
//   1. The handler now uses `getTenantPrisma(businessId, branchId)` — the same
//      tenant-scoped client used by crudAPI. Every operation in the batch
//      automatically has businessId/branchId injected by the tenant Prisma
//      extension, preventing cross-tenant writes regardless of the payload args.
//   2. Operations are validated: empty batch is rejected to prevent no-op calls
//      that may mask client-side bugs.
//   3. Session identity is asserted before any DB work begins.
//
// Note: Reads are also scoped to the tenant. A batch that attempts to read
// another tenant's data will return empty results (tenant filter applied) rather
// than throwing, which is the same behaviour as crudAPI.
// ---------------------------------------------------------------------------

// --- TRANSACTION SERVER FUNCTION ---

const transactionServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: TransactionInput) => d)
  .handler(async ({ data, context }): Promise<{ value: any[] } | { error: any }> => {
    // R9 — Assert session identity before any DB access.
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { error: 'Session context missing: businessId or branchId not set.' }
    }

    // R9 — Validate batch is non-empty.
    if (!data.operations || data.operations.length === 0) {
      return { error: 'Transaction batch must contain at least one operation.' }
    }

    const { businessId, branchId } = context.user

    // R9 — Use tenant-scoped Prisma client for all operations in this batch.
    //      getTenantPrisma injects businessId/branchId as implicit where filters
    //      on every model that has those fields, enforcing tenant isolation at the
    //      ORM level — no operation in the batch can escape the tenant boundary.
    const tenantPrisma = getTenantPrisma(businessId, branchId)

    const txResult = await ResultAsync.fromPromise(
      tenantPrisma.$transaction(async tx => {
        const executionResults = []

        for (const op of data.operations) {
          // Reuses the exact same logic, validation checks, and formatting rules
          const out = await executeOperation(tx, op)
          executionResults.push(out)
        }

        return executionResults
      }),
      (e: any) => e.message || 'Transaction batch execution failed',
    )

    return txResult.isOk() ? { value: txResult.value } : { error: txResult.error }
  })

// --- EXPORTED PUBLIC API ---

export const transactionAPI = {
  execute: async (operations: DBPayload[]): Promise<Result<any[], string>> => {
    const response = await transactionServerFn({
      data: { operations },
    })

    if ('error' in response) {
      return err(response.error as string)
    }

    return ok(response.value)
  },
}
